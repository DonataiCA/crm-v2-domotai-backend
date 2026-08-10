import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { OrganizationRepository } from '../repositories/organization.repository';
import { logAudit } from '../utils/audit';
import { prisma } from '../config/prisma';

// Rename 'profile' to 'user' in member responses to match frontend expectations
function transformMember(m: any) {
    const { profile, ...rest } = m;
    return { ...rest, user: profile || null };
}

export const OrganizationController = {
    index: async (req: Request, res: Response) => {
        try {
            // OrgMember.userId references Profile.id, not User.id
            const profileId = (req as any).user?.profileId || (req as any).userId;
            const organizations = await OrganizationRepository.findByUserId(profileId);
            res.json({ data: organizations });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch organizations', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const organization = await OrganizationRepository.findById(id);
            if (!organization) {
                return sendError(res, 404, 'Organization not found');
            }

            // Verify requester is a member (OrgMember.userId references Profile.id)
            const profileId = (req as any).user?.profileId;
            if (profileId) {
                const membership = await prisma.organizationMember.findFirst({
                    where: { organizationId: req.params.id, userId: profileId },
                });
                if (!membership) return sendError(res, 403, 'Access denied: not a member of this organization');
            }

            res.json(organization);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch organization', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const userId = (req as any).userId;
            const { name, slug, logoUrl, colorScheme } = req.body;

            if (!name) {
                return sendError(res, 400, 'Name is required');
            }

            const organization = await OrganizationRepository.create({
                name,
                slug,
                logoUrl,
                colorScheme,
                createdBy: userId,
            });

            res.status(201).json(organization);
            await logAudit(req, { action: 'CREATE', entityType: 'Organization', entityId: organization.id, entityName: organization.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to create organization', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { name, slug, logoUrl, colorScheme } = req.body;

            const existing = await OrganizationRepository.findById(id);
            if (!existing) {
                return sendError(res, 404, 'Organization not found');
            }

            const organization = await OrganizationRepository.update(id, {
                name,
                slug,
                logoUrl,
                colorScheme,
            });

            res.json(organization);
            await logAudit(req, { action: 'UPDATE', entityType: 'Organization', entityId: organization.id, entityName: organization.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to update organization', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const existing = await OrganizationRepository.findById(id);
            if (!existing) {
                return sendError(res, 404, 'Organization not found');
            }

            await OrganizationRepository.delete(id);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete organization', error);
        }
    },

    getMembers: async (req: Request, res: Response) => {
        try {
            const { orgId } = req.params;
            const members = await OrganizationRepository.findMembers(orgId);
            res.json({ data: members.map(transformMember) });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch members', error);
        }
    },

    addMember: async (req: Request, res: Response) => {
        try {
            const { orgId } = req.params;
            const { userId, role } = req.body;

            if (!userId) {
                return sendError(res, 400, 'userId is required');
            }

            const member = await OrganizationRepository.addMember(orgId, userId, role);
            res.status(201).json(transformMember(member));
            await logAudit(req, { action: 'ADD_MEMBER', entityType: 'Organization', entityId: orgId, details: `Added user ${userId} with role ${role}` });
        } catch (error) {
            return sendError(res, 500, 'Failed to add member', error);
        }
    },

    updateMemberRole: async (req: Request, res: Response) => {
        try {
            const { orgId, userId } = req.params;
            const { role } = req.body;

            if (!role) {
                return sendError(res, 400, 'role is required');
            }

            const updated = await OrganizationRepository.updateMemberRole(orgId, userId, role);
            res.json(transformMember(updated));
            await logAudit(req, { action: 'UPDATE_MEMBER_ROLE', entityType: 'Organization', entityId: orgId, details: `Updated user ${userId} role to ${role}` });
        } catch (error) {
            return sendError(res, 500, 'Failed to update member role', error);
        }
    },

    removeMember: async (req: Request, res: Response) => {
        try {
            const { orgId, userId } = req.params;
            await OrganizationRepository.removeMember(orgId, userId);
            res.sendStatus(204);
            await logAudit(req, { action: 'REMOVE_MEMBER', entityType: 'Organization', entityId: orgId, details: `Removed user ${userId}` });
        } catch (error) {
            return sendError(res, 500, 'Failed to remove member', error);
        }
    },
};
