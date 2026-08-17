import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { sendError } from '../utils/error';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { emailService } from '../utils/email';
import { logAudit } from '../utils/audit';
import { DEFAULT_SHARE_PERMISSIONS } from '../constants/enums';

function hasPermission(permissionsStr: string, required: string): boolean {
    const perms = permissionsStr.split(',').map(p => p.trim().toLowerCase());
    return perms.includes(required.toLowerCase());
}

export const PortalController = {
    // ─── CLIENT LOGIN (PUBLIC) ──────────────────────────────────────────────

    /**
     * POST /portal/client-login
     * Client enters email → returns list of projects shared with them.
     */
    clientLogin: async (req: Request, res: Response) => {
        try {
            const { email } = req.body;
            if (!email) return sendError(res, 400, 'Email is required');

            const normalizedEmail = email.trim().toLowerCase();

            // Find all active shares for this email
            const shares = await prisma.projectShare.findMany({
                where: {
                    clientEmail: { equals: normalizedEmail, mode: 'insensitive' },
                    revokedAt: null,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            status: true,
                            startDate: true,
                            endDate: true,
                            organization: { select: { name: true, logoUrl: true, colorScheme: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            if (shares.length === 0) {
                return sendError(res, 404, 'No projects found for this email. Please contact your project manager.');
            }

            res.json({
                clientEmail: normalizedEmail,
                clientName: shares[0].clientName,
                projects: shares.map(s => ({
                    shareToken: s.shareToken,
                    projectId: s.project.id,
                    projectName: s.project.name,
                    projectDescription: s.project.description,
                    projectStatus: s.project.status,
                    startDate: s.project.startDate,
                    endDate: s.project.endDate,
                    organization: s.project.organization,
                    permissions: s.permissions.split(','),
                    sharedAt: s.createdAt,
                })),
            });
        } catch (error) {
            return sendError(res, 500, 'Login failed', error);
        }
    },

    // ─── AUTHENTICATED ENDPOINTS ────────────────────────────────────────────

    /**
     * POST /portal/projects/:projectId/share
     * Create a share link for a project.
     */
    shareProject: async (req: Request, res: Response) => {
        try {
            const { projectId } = req.params;
            const organizationId = req.headers['x-organization-id'] as string;
            const userId = (req as any).userId as string | undefined;

            if (!organizationId) {
                return sendError(res, 400, 'Organization ID header is required');
            }

            const { clientEmail, clientName, permissions, expiresAt } = req.body;

            if (!clientEmail) {
                return sendError(res, 400, 'Client email is required');
            }

            const normalizedEmail = clientEmail.trim().toLowerCase();
            const shareToken = crypto.randomUUID();

            // ── Auto-create client user if they don't exist ─────────────────
            let existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

            if (!existingUser) {
                const hashedPassword = bcrypt.hashSync('DomotaiGuest', 10);
                const nameParts = (clientName || normalizedEmail.split('@')[0]).split(' ');
                const firstName = nameParts[0] || 'Guest';
                const lastName = nameParts.slice(1).join(' ') || 'Client';

                existingUser = await prisma.user.create({
                    data: {
                        email: normalizedEmail,
                        firstName,
                        lastName,
                        password: hashedPassword,
                        phoneNumber: `+guest${Date.now()}${Math.floor(Math.random() * 1000)}`,
                        gender: 'unspecified',
                        authProvider: 'EMAIL',
                        role: 'USER',
                    },
                });

                await prisma.profile.create({
                    data: {
                        id: existingUser.id,
                        email: normalizedEmail,
                        fullName: clientName || `${firstName} ${lastName}`,
                        role: 'client',
                        shouldChangePassword: true,
                        currentOrganizationId: organizationId,
                        userId: existingUser.id,
                    },
                });

                await prisma.organizationMember.create({
                    data: {
                        organizationId,
                        userId: existingUser.id,
                        role: 'client',
                    },
                });
            }

            // ── Create the share ────────────────────────────────────────────
            const share = await prisma.projectShare.create({
                data: {
                    projectId,
                    organizationId,
                    shareToken,
                    clientEmail: normalizedEmail,
                    clientName: clientName || null,
                    permissions: permissions || DEFAULT_SHARE_PERMISSIONS,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                    createdBy: userId || null,
                },
            });

            // Send invitation email (fire and forget)
            const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
            const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
            const loginUrl = `${req.protocol}://${req.get('host')?.replace(':3000', ':8080')}/auth`;
            const perms = (permissions || DEFAULT_SHARE_PERMISSIONS).split(',');
            emailService.sendClientInvitation(
                normalizedEmail,
                clientName || 'Client',
                project?.name || 'Project',
                org?.name || 'Domotai',
                loginUrl,
                'DomotaiGuest',
                perms,
            );

            res.status(201).json({
                id: share.id,
                shareToken: share.shareToken,
                clientEmail: share.clientEmail,
                clientName: share.clientName,
                permissions: share.permissions,
                expiresAt: share.expiresAt,
                createdAt: share.createdAt,
                shareUrl: `/portal/${share.shareToken}`,
            });
            await logAudit(req, { action: 'SHARE', entityType: 'Project', entityId: projectId, entityName: project?.name, details: `Shared with ${normalizedEmail}` });
            return;
        } catch (error) {
            return sendError(res, 500, 'Failed to share project', error);
        }
    },

    /**
     * GET /portal/projects/:projectId/shares
     * List active (non-revoked) shares for a project.
     */
    getShares: async (req: Request, res: Response) => {
        try {
            const { projectId } = req.params;
            const organizationId = req.headers['x-organization-id'] as string;

            if (!organizationId) {
                return sendError(res, 400, 'Organization ID header is required');
            }

            const shares = await prisma.projectShare.findMany({
                where: {
                    projectId,
                    organizationId,
                    revokedAt: null,
                },
                include: {
                    creator: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            return res.json({ data: shares });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch shares', error);
        }
    },

    /**
     * DELETE /portal/projects/shares/:shareId
     * Soft-revoke a share by setting revokedAt.
     */
    deleteShare: async (req: Request, res: Response) => {
        try {
            const { shareId } = req.params;

            await prisma.projectShare.update({
                where: { id: shareId },
                data: { revokedAt: new Date() },
            });

            return res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to revoke share', error);
        }
    },

    // ─── PUBLIC ENDPOINTS ───────────────────────────────────────────────────

    /**
     * GET /portal/:shareToken
     * View a project via a share link (no auth required).
     */
    viewPortal: async (req: Request, res: Response) => {
        try {
            const { shareToken } = req.params;

            const share = await prisma.projectShare.findUnique({
                where: { shareToken },
            });

            if (!share) {
                return sendError(res, 404, 'Share link not found');
            }

            if (share.revokedAt) {
                return sendError(res, 410, 'This share link has been revoked');
            }

            if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
                return sendError(res, 410, 'This share link has expired');
            }

            const project = await prisma.project.findUnique({
                where: { id: share.projectId },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    status: true,
                    startDate: true,
                    endDate: true,
                },
            });

            if (!project) {
                return sendError(res, 404, 'Project not found');
            }

            const phases = await prisma.projectPhase.findMany({
                where: { projectId: share.projectId },
                orderBy: { orderIndex: 'asc' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    status: true,
                    tasks: {
                        orderBy: { orderIndex: 'asc' },
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            status: true,
                            priority: true,
                            dueDate: true,
                            assignee: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    email: true,
                                },
                            },
                            comments: {
                                orderBy: { createdAt: 'asc' },
                                select: {
                                    id: true,
                                    content: true,
                                    createdByGuest: true,
                                    guestEmail: true,
                                    createdAt: true,
                                    creator: {
                                        select: {
                                            id: true,
                                            fullName: true,
                                            email: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            const permissions = share.permissions.split(',').map((p) => p.trim());

            return res.json({
                project,
                phases,
                permissions,
                share: {
                    clientEmail: share.clientEmail,
                    clientName: share.clientName,
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to load portal', error);
        }
    },

    /**
     * POST /portal/:shareToken/tasks/:taskId/comments
     * Guest comment on a task (no auth required).
     */
    addGuestComment: async (req: Request, res: Response) => {
        try {
            const { shareToken, taskId } = req.params;
            const { content, guestEmail } = req.body;

            if (!content) {
                return sendError(res, 400, 'Comment content is required');
            }

            const share = await prisma.projectShare.findUnique({
                where: { shareToken },
            });

            if (!share) {
                return sendError(res, 404, 'Share link not found');
            }

            if (share.revokedAt) {
                return sendError(res, 410, 'This share link has been revoked');
            }

            if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
                return sendError(res, 410, 'This share link has expired');
            }

            if (!hasPermission(share.permissions, 'comment')) {
                return sendError(res, 403, 'You do not have permission to comment on this project');
            }

            // Verify task belongs to the shared project
            const task = await prisma.projectTask.findFirst({
                where: { id: taskId, projectId: share.projectId },
            });

            if (!task) {
                return sendError(res, 404, 'Task not found in this project');
            }

            const comment = await prisma.taskComment.create({
                data: {
                    projectTaskId: taskId,
                    organizationId: share.organizationId,
                    content,
                    createdByGuest: true,
                    guestEmail: guestEmail || null,
                },
            });

            // Notify task assignee about the new comment (fire and forget)
            if (task.assignedTo) {
                const taskWithAssignee = await prisma.projectTask.findUnique({
                    where: { id: taskId },
                    select: {
                        title: true,
                        projectId: true,
                        assignee: { select: { email: true, fullName: true } },
                        project: { select: { name: true } },
                    },
                });
                if (taskWithAssignee?.assignee?.email) {
                    emailService.sendNewComment(
                        taskWithAssignee.assignee.email,
                        taskWithAssignee.assignee.fullName || 'Team Member',
                        guestEmail || share.clientName || 'A client',
                        taskWithAssignee.title,
                        content,
                        taskWithAssignee.project?.name || 'Project'
                    );
                }
            }

            return res.status(201).json(comment);
        } catch (error) {
            return sendError(res, 500, 'Failed to add comment', error);
        }
    },

    /**
     * POST /portal/:shareToken/tasks
     * Guest create a task (no auth required, needs create_task permission).
     */
    createGuestTask: async (req: Request, res: Response) => {
        try {
            const { shareToken } = req.params;
            const { title, description, phaseId, priority, guestEmail } = req.body;

            if (!title) {
                return sendError(res, 400, 'Task title is required');
            }

            const share = await prisma.projectShare.findUnique({
                where: { shareToken },
            });

            if (!share) {
                return sendError(res, 404, 'Share link not found');
            }

            if (share.revokedAt) {
                return sendError(res, 410, 'This share link has been revoked');
            }

            if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
                return sendError(res, 410, 'This share link has expired');
            }

            if (!hasPermission(share.permissions, 'create_task')) {
                return sendError(res, 403, 'You do not have permission to create tasks on this project');
            }

            const task = await prisma.projectTask.create({
                data: {
                    projectId: share.projectId,
                    organizationId: share.organizationId,
                    phaseId: phaseId || null,
                    title,
                    description: description || null,
                    priority: priority || 'medium',
                    createdByGuest: true,
                    guestEmail: guestEmail || null,
                },
            });

            return res.status(201).json(task);
        } catch (error) {
            return sendError(res, 500, 'Failed to create task', error);
        }
    },

    /**
     * PATCH /portal/:shareToken/tasks/:taskId
     * Guest update task status (no auth required, needs edit_task permission).
     */
    updateGuestTask: async (req: Request, res: Response) => {
        try {
            const { shareToken, taskId } = req.params;
            const { status } = req.body;

            if (!status) {
                return sendError(res, 400, 'Status is required');
            }

            const share = await prisma.projectShare.findUnique({
                where: { shareToken },
            });

            if (!share) {
                return sendError(res, 404, 'Share link not found');
            }

            if (share.revokedAt) {
                return sendError(res, 410, 'This share link has been revoked');
            }

            if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
                return sendError(res, 410, 'This share link has expired');
            }

            if (!hasPermission(share.permissions, 'edit_task')) {
                return sendError(res, 403, 'You do not have permission to edit tasks on this project');
            }

            // Verify task belongs to the shared project
            const task = await prisma.projectTask.findFirst({
                where: { id: taskId, projectId: share.projectId },
            });

            if (!task) {
                return sendError(res, 404, 'Task not found in this project');
            }

            const updatedTask = await prisma.projectTask.update({
                where: { id: taskId },
                data: {
                    status,
                    updatedByGuest: true,
                },
            });

            return res.json(updatedTask);
        } catch (error) {
            return sendError(res, 500, 'Failed to update task', error);
        }
    },
};
