import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { ProjectRepository } from '../repositories/project.repository';
import { generateTasksFromPRD, parseChatActions } from '../utils/ai';
import { parseTaskTemplate } from '../utils/task-template';
import { resolveTemplateTasks } from '../utils/task-import';
import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { notify } from '../utils/notify';
import { syncRepo, syncOneRepo, GitHubError } from '../utils/github';
import {
    isInvertedDateRange,
    PHASE_DATE_RANGE_MESSAGE,
    TASK_DATE_RANGE_MESSAGE,
} from '../validators/project.validator';
import { isClientRole } from '../constants/roles';
import {
    ARCHIVED_PROJECT_STATUS,
    DEFAULT_PROJECT_STATUS,
    DEFAULT_TASK_STATUS,
} from '../constants/enums';

export const ProjectController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const mine = req.query.mine === 'true';
            const userId = (req as any).userId as string | undefined;

            // Check if user is a client - if so, only show shared projects
            let clientEmail: string | undefined;
            if (userId) {
                const profile = await prisma.profile.findUnique({ where: { userId }, select: { role: true, email: true } });
                if (profile && isClientRole(profile.role)) {
                    clientEmail = profile.email;
                }
            }

            const filters = {
                search: req.query.search as string | undefined,
                status: req.query.status as string | undefined,
                projectLeadId: req.query.projectLeadId as string | undefined,
                mine: mine && userId ? userId : undefined,
                clientEmail,
            };

            const [data, total] = await Promise.all([
                ProjectRepository.findAll(orgId, skip, limit, filters),
                ProjectRepository.count(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch projects', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const project = await ProjectRepository.findById(req.params.id, orgId);
            if (!project) return sendError(res, 404, 'Project not found');
            res.json(project);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch project', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            // Project.createdBy is a FK to Profile.id, not User.id — `req.userId` holds the
            // JWT's User.id and violates the constraint.
            const profileId = (req as any).user?.profileId;

            const body = { ...req.body };
            // Coerce date strings to Date so Prisma accepts them
            if (body.startDate) body.startDate = new Date(body.startDate);
            if (body.endDate) body.endDate = new Date(body.endDate);
            if (body.paymentDate) body.paymentDate = new Date(body.paymentDate);

            const project = await ProjectRepository.create({
                ...body,
                organizationId: orgId,
                createdBy: profileId,
            });

            res.status(201).json(project);
            await logAudit(req, { action: 'CREATE', entityType: 'Project', entityId: project.id, entityName: project.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to create project', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ProjectRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Project not found');

            const body = { ...req.body };
            if (body.startDate) body.startDate = new Date(body.startDate);
            if (body.endDate) body.endDate = new Date(body.endDate);
            if (body.paymentDate) body.paymentDate = new Date(body.paymentDate);

            const project = await ProjectRepository.update(req.params.id, body, orgId);
            if (!project) return sendError(res, 404, 'Project not found');
            res.json(project);
            await logAudit(req, { action: 'UPDATE', entityType: 'Project', entityId: project.id, entityName: project.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to update project', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ProjectRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Project not found');

            await ProjectRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Project', entityId: existing.id, entityName: existing.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete project', error);
        }
    },

    // Tracking
    tracking: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const project = await ProjectRepository.findById(req.params.id, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const tracking = await ProjectRepository.getTracking(req.params.id);
            res.json({ phases: tracking.phases, unassignedTasks: tracking.unassignedTasks });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch project tracking', error);
        }
    },

    // Phases
    createPhase: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            // ProjectPhase.createdBy is a FK to Profile.id, not User.id — `req.userId` holds the
            // JWT's User.id and violates the constraint.
            const profileId = (req as any).user?.profileId;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const body = { ...req.body };
            if (body.startDate) body.startDate = new Date(body.startDate);
            if (body.endDate) body.endDate = new Date(body.endDate);

            const phase = await ProjectRepository.createPhase({
                ...body,
                projectId,
                createdBy: profileId,
            });

            res.status(201).json(phase);
            await logAudit(req, { action: 'CREATE', entityType: 'ProjectPhase', entityId: phase.id, entityName: phase.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to create phase', error);
        }
    },

    updatePhase: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await prisma.projectPhase.findFirst({
                where: { id: req.params.phaseId, project: { organizationId: orgId } },
            });
            if (!existing) return sendError(res, 404, 'Phase not found');

            const data: Record<string, unknown> = { ...req.body };
            if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate as string) : null;
            if (data.endDate !== undefined) data.endDate = data.endDate ? new Date(data.endDate as string) : null;

            // Only checked when the request touches a date, so updates that leave the range
            // untouched (status changes, renames) keep working on pre-existing records.
            if (data.startDate !== undefined || data.endDate !== undefined) {
                const startDate = (data.startDate !== undefined ? data.startDate : existing.startDate) as Date | null;
                const endDate = (data.endDate !== undefined ? data.endDate : existing.endDate) as Date | null;
                if (isInvertedDateRange(startDate, endDate)) {
                    return sendError(res, 400, PHASE_DATE_RANGE_MESSAGE);
                }
            }

            const phase = await ProjectRepository.updatePhase(req.params.phaseId, orgId, data);
            if (!phase) return sendError(res, 404, 'Phase not found');
            res.json(phase);
        } catch (error) {
            return sendError(res, 500, 'Failed to update phase', error);
        }
    },

    deletePhase: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            // No existence pre-check here: deletePhase's deleteMany already filters
            // by { id, project: { organizationId } } and its count === 0 covers
            // "doesn't exist" and "not yours" — a separate findFirst would just
            // duplicate that same query for no benefit (unlike updatePhase, which
            // needs `existing` to validate the date range against pre-existing values).
            const deleted = await ProjectRepository.deletePhase(req.params.phaseId, orgId);
            if (!deleted) return sendError(res, 404, 'Phase not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete phase', error);
        }
    },

    // Project Tasks
    createTask: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            // ProjectTask.createdBy is a FK to Profile.id, not User.id — `req.userId` holds the
            // JWT's User.id and violates the constraint.
            const profileId = (req as any).user?.profileId;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const body = { ...req.body };
            if (body.startDate) body.startDate = new Date(body.startDate);
            if (body.dueDate) body.dueDate = new Date(body.dueDate);
            if (body.completedAt) body.completedAt = new Date(body.completedAt);

            const task = await ProjectRepository.createTask({
                ...body,
                projectId,
                organizationId: orgId,
                createdBy: profileId,
            });

            res.status(201).json(task);
            await logAudit(req, { action: 'CREATE', entityType: 'ProjectTask', entityId: task.id, entityName: task.title });

            if (task.assignedTo) {
                const creator = await prisma.profile.findUnique({ where: { id: profileId }, select: { fullName: true } });
                const projectData = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
                await notify({
                    organizationId: orgId,
                    type: 'PROJECT_TASK_ASSIGNED',
                    title: `New task assigned: ${task.title}`,
                    body: `You have been assigned a new task in ${projectData?.name || 'a project'}`,
                    entityType: 'ProjectTask',
                    entityId: task.id,
                    actorId: profileId,
                    recipientUserId: task.assignedTo,
                    metadata: {
                        taskTitle: task.title,
                        projectName: projectData?.name || '',
                        assigneeName: '',
                        assignedBy: creator?.fullName || '',
                        dueDate: task.dueDate ? task.dueDate.toISOString() : '',
                        projectId,
                        taskId: task.id,
                    },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to create project task', error);
        }
    },

    updateTask: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await prisma.projectTask.findFirst({
                where: { id: req.params.taskId, organizationId: orgId },
            });
            if (!existing) return sendError(res, 404, 'Task not found');

            const data: Record<string, unknown> = { ...req.body };
            if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate as string) : null;
            if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate as string) : null;
            if (data.completedAt !== undefined) data.completedAt = data.completedAt ? new Date(data.completedAt as string) : null;
            if (data.progress !== undefined) {
                const progress = Number(data.progress);
                if (!Number.isFinite(progress)) return sendError(res, 400, 'Progress must be a number between 0 and 100');
                data.progress = Math.min(100, Math.max(0, Math.round(progress)));
            }

            // Only checked when the request touches a date, so updates that leave the range
            // untouched (drag between columns, completion) keep working on pre-existing records.
            if (data.startDate !== undefined || data.dueDate !== undefined) {
                const startDate = (data.startDate !== undefined ? data.startDate : existing.startDate) as Date | null;
                const dueDate = (data.dueDate !== undefined ? data.dueDate : existing.dueDate) as Date | null;
                if (isInvertedDateRange(startDate, dueDate)) {
                    return sendError(res, 400, TASK_DATE_RANGE_MESSAGE);
                }
            }

            const task = await ProjectRepository.updateTask(req.params.taskId, orgId, data);
            if (!task) return sendError(res, 404, 'Task not found');
            res.json(task);
            await logAudit(req, { action: 'UPDATE', entityType: 'ProjectTask', entityId: task.id, entityName: task.title });

            if (req.body.assignedTo && req.body.assignedTo !== existing?.assignedTo) {
                const projectData = await prisma.project.findUnique({ where: { id: existing.projectId }, select: { name: true } });
                await notify({
                    organizationId: orgId,
                    type: 'PROJECT_TASK_ASSIGNED',
                    title: `Task reassigned: ${task.title}`,
                    entityType: 'ProjectTask',
                    entityId: task.id,
                    actorId: (req as any).userId,
                    recipientUserId: req.body.assignedTo,
                    metadata: {
                        taskTitle: task.title,
                        projectName: projectData?.name || '',
                        projectId: existing.projectId,
                        taskId: task.id,
                    },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to update project task', error);
        }
    },

    deleteTask: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const taskId = req.params.taskId;
            const deleted = await ProjectRepository.deleteTask(taskId, orgId);
            if (!deleted) return sendError(res, 404, 'Task not found');
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'ProjectTask', entityId: taskId });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete project task', error);
        }
    },

    // Team Members
    getMembers: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const members = await ProjectRepository.getMembers(req.params.projectId, orgId);
            // Rename 'profile' to 'user' to match frontend expectations
            const transformed = (members as any[]).map(({ profile, ...rest }: any) => ({
                ...rest,
                user: profile || null,
            }));
            res.json(transformed);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch team members', error);
        }
    },

    addMember: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const { userId } = req.body;

            if (!userId) return sendError(res, 400, 'userId is required');

            // `create` can't validate FK ownership atomically in its own `where`
            // (see ProjectRepository.addMember) — verify the project is ours first,
            // same as createTask/createPhase/addRepo do for every project-scoped create.
            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            // The projectId check alone isn't enough: without this, `userId` could be
            // a Profile from a different organization, which would then surface its
            // fullName/email/role through getMembers (exactly what C3 just closed,
            // through the other door) and become assignable by the AI agent (Tarea 8
            // builds its assignee list from projectTeamMember). `OrganizationMember.userId`
            // is a FK to Profile.id, not User.id — same gotcha as everywhere else in
            // this codebase. Same 404 as the project check, on purpose: a distinct
            // message would let a caller tell "project not mine" apart from "user not
            // in my org", leaking whether that profile exists.
            const membership = await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId } });
            if (!membership) return sendError(res, 404, 'Project not found');

            const member = await ProjectRepository.addMember(projectId, userId);
            const { profile, ...rest } = member as any;
            res.status(201).json({ ...rest, user: profile || null });
        } catch (error) {
            return sendError(res, 500, 'Failed to add team member', error);
        }
    },

    generateTasks: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const { projectId } = req.params;
            const { phases } = req.body;

            if (!phases || !Array.isArray(phases) || phases.length === 0) {
                return sendError(res, 400, 'phases array is required');
            }

            const project = await ProjectRepository.findById(projectId, organizationId);
            if (!project) return sendError(res, 404, 'Project not found');

            const prd = project.prd || '';
            if (!prd.trim()) {
                return sendError(res, 400, 'Project has no PRD. Please add a PRD first.');
            }

            // Get existing task titles to avoid duplicates
            const existingTasks = await prisma.projectTask.findMany({
                where: { projectId },
                select: { title: true },
            });
            const existingTitles = existingTasks.map((t) => t.title);

            // Generate tasks with AI
            const aiTasks = await generateTasksFromPRD(
                prd,
                phases.map((p: any) => ({ id: p.id, name: p.name, description: p.description })),
                project.name,
                existingTitles,
            );

            // Create tasks in DB
            const createdTasks = [];
            for (const aiTask of aiTasks) {
                const task = await ProjectRepository.createTask({
                    projectId,
                    phaseId: aiTask.phaseId,
                    organizationId,
                    title: aiTask.title,
                    description: aiTask.description,
                    status: DEFAULT_TASK_STATUS,
                    priority: aiTask.priority,
                    orderIndex: aiTask.orderIndex,
                });
                createdTasks.push(task);
            }

            res.json({
                success: true,
                generated: createdTasks.length,
                tasks: createdTasks,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to generate tasks', error);
        }
    },

    /**
     * `POST /projects/:projectId/import-tasks` — alta de tareas desde la plantilla
     * Markdown que se descarga del propio panel.
     *
     * Hermano de `chatTask` pero sin modelo de por medio: `parseTaskTemplate` lee el
     * archivo campo a campo y `resolveTemplateTasks` traduce los nombres a claves ajenas.
     * El mismo archivo produce siempre las mismas tareas y el endpoint funciona sin
     * `OPENAI_API_KEY`.
     *
     * **Todo o nada.** Si queda un solo problema sin resolver no se crea ninguna tarea y
     * se responde 422 con la lista de problemas y su línea. La alternativa —importar las
     * buenas y dejar fuera las malas— obliga al usuario a editar el archivo a mano antes
     * de reintentar para no duplicar la mitad del tablero.
     */
    importTasks: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;
            const createdBy = (req as any).user?.profileId as string | undefined;
            const { projectId } = req.params;
            // `importTasksSchema` ya garantiza que el documento viene y respeta su tope.
            const { document } = req.body as { document: { fileName: string; content: string } };

            const project = await ProjectRepository.findById(projectId, organizationId);
            if (!project) return sendError(res, 404, 'Project not found');

            const parsed = parseTaskTemplate(document.content);
            if (parsed.issues.length > 0) {
                return res.status(422).json({ created: 0, tasks: [], issues: parsed.issues, warnings: [] });
            }

            const context = await ProjectRepository.getImportContext(projectId, organizationId);
            const resolved = resolveTemplateTasks(parsed.tasks, context);
            if (resolved.issues.length > 0) {
                return res
                    .status(422)
                    .json({ created: 0, tasks: [], issues: resolved.issues, warnings: resolved.warnings });
            }

            const tasks = await ProjectRepository.createTasks(
                resolved.tasks.map((task) => ({
                    ...task,
                    projectId,
                    organizationId,
                    createdBy,
                })),
            );

            // Los avisos viajan con un 200: las tareas se crearon, sólo hay que contar
            // cómo se colocaron las que traían un área o un responsable desconocidos.
            res.json({ created: tasks.length, tasks, issues: [], warnings: resolved.warnings });
        } catch (error) {
            return sendError(res, 500, 'Failed to import tasks', error);
        }
    },

    chatTask: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const { projectId } = req.params;
            // `chatTaskSchema` ya garantiza que llega al menos uno de los dos, y que
            // el documento respeta su tope de caracteres.
            const { message, document } = req.body as {
                message?: string;
                document?: { fileName: string; content: string };
            };

            const project = await ProjectRepository.findById(projectId, organizationId);
            if (!project) return sendError(res, 404, 'Project not found');

            // Get phases for context
            const trackingData = await ProjectRepository.getTracking(projectId);
            const phases = trackingData.phases.map((p: any) => ({ id: p.id, name: p.name }));

            // Flatten existing tasks (phased + unassigned)
            const existingTasks: Array<{
                id: string; title: string; status: string; priority: string | null;
                phaseName: string | null; assigneeName: string | null;
            }> = [];
            for (const phase of trackingData.phases as any[]) {
                for (const t of (phase.tasks || [])) {
                    existingTasks.push({
                        id: t.id,
                        title: t.title,
                        status: t.status || DEFAULT_TASK_STATUS,
                        priority: t.priority || null,
                        phaseName: phase.name,
                        assigneeName: t.assignee?.fullName || null,
                    });
                }
            }
            for (const t of (trackingData.unassignedTasks as any[]) || []) {
                existingTasks.push({
                    id: t.id,
                    title: t.title,
                    status: t.status || DEFAULT_TASK_STATUS,
                    priority: t.priority || null,
                    phaseName: null,
                    assigneeName: t.assignee?.fullName || null,
                });
            }

            // Members: project team + org fallback
            const teamMembers = await ProjectRepository.getMembers(projectId, organizationId);
            const members = (teamMembers as any[]).map((m: any) => ({
                id: m.userId,
                name: m.profile?.fullName || m.profile?.email || 'Unknown',
            }));
            const orgMembers = await prisma.organizationMember.findMany({
                where: { organizationId },
                include: { profile: { select: { id: true, fullName: true, email: true } } },
            });
            const allMembers = members.length > 0 ? members : orgMembers.map((m) => ({
                id: m.userId,
                name: m.profile?.fullName || m.profile?.email || 'Unknown',
            }));

            const findAssigneeId = (name: string | null | undefined): string | null => {
                if (!name) return null;
                const lower = name.toLowerCase();
                const match = allMembers.find(m =>
                    m.name.toLowerCase() === lower || m.name.toLowerCase().includes(lower)
                );
                return match?.id || null;
            };

            // Parse the message into actions (create + update mix)
            const actions = await parseChatActions(
                message ?? '',
                phases,
                allMembers,
                existingTasks,
                project.name,
                document,
            );

            const results: Array<{
                action: 'create' | 'update';
                task: any;
                aiInterpretation?: { workArea: string | null; assignee: string | null };
                changes?: Record<string, unknown>;
                summary: string;
            }> = [];

            for (const a of actions) {
                if (a.action === 'create') {
                    const assignedTo = findAssigneeId(a.assigneeName);
                    const task = await ProjectRepository.createTask({
                        projectId,
                        phaseId: a.phaseId || (phases.length > 0 ? phases[0].id : null),
                        organizationId,
                        title: a.title,
                        description: a.description,
                        status: DEFAULT_TASK_STATUS,
                        priority: a.priority || 'MEDIUM',
                        orderIndex: 0,
                        assignedTo: assignedTo || undefined,
                        dueDate: a.dueDate ? new Date(a.dueDate) : undefined,
                    });
                    results.push({
                        action: 'create',
                        task,
                        aiInterpretation: { workArea: a.phaseName, assignee: a.assigneeName },
                        summary: `Created "${a.title}"`,
                    });
                    continue;
                }

                // Update flow
                if (!a.taskId) continue;
                const target = existingTasks.find(t => t.id === a.taskId);
                if (!target) continue;

                const updates: Record<string, unknown> = {};
                const changes: Record<string, unknown> = {};

                if (a.assigneeName !== undefined) {
                    const assignedTo = findAssigneeId(a.assigneeName);
                    if (assignedTo) {
                        updates.assignedTo = assignedTo;
                        changes.assignee = a.assigneeName;
                    }
                }
                if (a.priority) {
                    updates.priority = a.priority;
                    changes.priority = a.priority;
                }
                if (a.status) {
                    updates.status = a.status;
                    changes.status = a.status;
                    if (a.status === 'COMPLETED') {
                        updates.completedAt = new Date();
                    }
                }
                if (a.phaseId !== undefined) {
                    updates.phaseId = a.phaseId;
                    changes.phase = a.phaseName;
                }
                if (a.startDate !== undefined) {
                    updates.startDate = a.startDate ? new Date(a.startDate) : null;
                    changes.startDate = a.startDate;
                }
                if (a.dueDate !== undefined) {
                    updates.dueDate = a.dueDate ? new Date(a.dueDate) : null;
                    changes.dueDate = a.dueDate;
                }
                if (a.title) {
                    updates.title = a.title;
                    changes.title = a.title;
                }
                if (a.description) {
                    updates.description = a.description;
                    changes.description = a.description;
                }

                if (Object.keys(updates).length === 0) continue;

                const task = await ProjectRepository.updateTask(a.taskId, organizationId, updates);

                const summaryParts: string[] = [];
                if (changes.assignee) summaryParts.push(`assigned to ${changes.assignee}`);
                if (changes.priority) summaryParts.push(`priority → ${changes.priority}`);
                if (changes.status) summaryParts.push(`status → ${changes.status}`);
                if (changes.phase) summaryParts.push(`moved to ${changes.phase}`);
                if (changes.startDate && changes.dueDate) {
                    summaryParts.push(`scheduled ${changes.startDate} → ${changes.dueDate}`);
                } else {
                    if (changes.startDate) summaryParts.push(`starts ${changes.startDate}`);
                    if (changes.dueDate) summaryParts.push(`due ${changes.dueDate}`);
                }
                if (changes.title) summaryParts.push(`renamed`);

                results.push({
                    action: 'update',
                    task,
                    changes,
                    summary: summaryParts.length > 0
                        ? `"${a.taskTitle || target.title}" — ${summaryParts.join(', ')}`
                        : `Updated "${a.taskTitle || target.title}"`,
                });
            }

            // Backward compat: also expose the first created task as `task` and an array as `tasks`
            const createdTasks = results.filter(r => r.action === 'create');

            res.json({
                results,
                count: results.length,
                createdCount: createdTasks.length,
                updatedCount: results.length - createdTasks.length,
                // Legacy fields for backward compat with older frontend
                task: createdTasks[0]?.task,
                aiInterpretation: createdTasks[0]?.aiInterpretation,
                tasks: createdTasks,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to process chat message', error);
        }
    },

    removeMember: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, userId } = req.params;
            const removed = await ProjectRepository.removeMember(projectId, userId, orgId);
            if (!removed) return sendError(res, 404, 'Member not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to remove team member', error);
        }
    },

    // Archived projects
    archived: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const data = await prisma.project.findMany({
                where: { organizationId: orgId, status: ARCHIVED_PROJECT_STATUS },
                orderBy: { updatedAt: 'desc' },
                include: {
                    projectLead: { select: { id: true, fullName: true, email: true } },
                    creator: { select: { id: true, fullName: true, email: true } },
                },
            });
            res.json({ data });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch archived projects', error);
        }
    },

    archive: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ProjectRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Project not found');

            await ProjectRepository.update(req.params.id, { status: ARCHIVED_PROJECT_STATUS }, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'ARCHIVE', entityType: 'Project', entityId: existing.id, entityName: existing.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to archive project', error);
        }
    },

    restore: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await ProjectRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Project not found');

            await ProjectRepository.update(req.params.id, { status: DEFAULT_PROJECT_STATUS }, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to restore project', error);
        }
    },

    setContacts: async (req: Request, res: Response) => {
        try {
            // No ProjectContact junction table in Prisma yet - return success placeholder
            res.json({ success: true });
        } catch (error) {
            return sendError(res, 500, 'Failed to set project contacts', error);
        }
    },

    // ─── GitHub Integration: ProjectRepo CRUD ─────────────────────────────────

    listRepos: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const repos = await prisma.projectRepo.findMany({
                where: { projectId, organizationId: orgId },
                orderBy: { createdAt: 'asc' },
            });
            res.json({ success: true, repos });
        } catch (error) {
            return sendError(res, 500, 'Failed to list repos', error);
        }
    },

    addRepo: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const { owner, repo, label, defaultBranch } = req.body || {};

            if (!owner || !repo) return sendError(res, 400, 'owner and repo are required');

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const created = await prisma.projectRepo.create({
                data: {
                    projectId,
                    organizationId: orgId,
                    githubOwner: owner,
                    repositoryName: repo,
                    repositoryUrl: `https://github.com/${owner}/${repo}`,
                    defaultBranch: defaultBranch || 'main',
                    label: label || null,
                },
            });
            res.status(201).json(created);
        } catch (error: any) {
            if (error?.code === 'P2002') {
                return sendError(res, 409, 'This repository is already linked to the project');
            }
            return sendError(res, 500, 'Failed to add repo', error);
        }
    },

    updateRepo: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, repoId } = req.params;
            const { label, defaultBranch, owner, repo } = req.body || {};

            const existing = await prisma.projectRepo.findFirst({
                where: { id: repoId, projectId, organizationId: orgId },
            });
            if (!existing) return sendError(res, 404, 'Repo not found');

            const data: any = {};
            if (label !== undefined) data.label = label;
            if (defaultBranch !== undefined) data.defaultBranch = defaultBranch;
            if (owner) data.githubOwner = owner;
            if (repo) data.repositoryName = repo;
            if (owner || repo) {
                data.repositoryUrl = `https://github.com/${owner || existing.githubOwner}/${repo || existing.repositoryName}`;
            }

            const updated = await prisma.projectRepo.update({ where: { id: repoId }, data });
            res.json(updated);
        } catch (error) {
            return sendError(res, 500, 'Failed to update repo', error);
        }
    },

    deleteRepo: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, repoId } = req.params;

            const existing = await prisma.projectRepo.findFirst({
                where: { id: repoId, projectId, organizationId: orgId },
            });
            if (!existing) return sendError(res, 404, 'Repo not found');

            await prisma.projectRepo.delete({ where: { id: repoId } });
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete repo', error);
        }
    },

    syncRepo: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, repoId } = req.params;

            const repo = await prisma.projectRepo.findFirst({
                where: { id: repoId, projectId, organizationId: orgId },
            });
            if (!repo) return sendError(res, 404, 'Repo not found');

            const result = await syncOneRepo(repo, orgId);
            res.json({ success: true, ...result });
        } catch (error) {
            if (error instanceof GitHubError) {
                return sendError(res, 502, error.message, error);
            }
            return sendError(res, 500, 'Failed to sync repo', error);
        }
    },

    // ─── GitHub Integration: aggregate endpoints (across all repos) ──────────

    githubFetch: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            // Get all repos for this project. If none exist but project has legacy
            // single-repo fields, create one on-the-fly so the legacy "Fetch Git Data"
            // button still works for projects linked under the old schema.
            let repos = await prisma.projectRepo.findMany({
                where: { projectId, organizationId: orgId },
                orderBy: { createdAt: 'asc' },
            });

            if (repos.length === 0) {
                const owner = (req.body?.owner as string) || project.githubOwner;
                const repoName = (req.body?.repo as string) || project.repositoryName;
                if (!owner || !repoName) {
                    return sendError(res, 400, 'No repositories linked. Add one first.');
                }
                const created = await prisma.projectRepo.create({
                    data: {
                        projectId,
                        organizationId: orgId,
                        githubOwner: owner,
                        repositoryName: repoName,
                        repositoryUrl: `https://github.com/${owner}/${repoName}`,
                        defaultBranch: project.defaultBranch || 'main',
                    },
                });
                repos = [created];
            }

            let totalMetrics = 0;
            let totalCommits = 0;
            const errors: Array<{ repo: string; message: string }> = [];

            for (const r of repos) {
                try {
                    const result = await syncOneRepo(r, orgId);
                    totalMetrics += result.syncedMetrics;
                    totalCommits += result.syncedCommits;
                } catch (e) {
                    const msg = e instanceof GitHubError ? e.message : 'Unknown error';
                    errors.push({ repo: `${r.githubOwner}/${r.repositoryName}`, message: msg });
                }
            }

            res.json({
                success: true,
                syncedMetrics: totalMetrics,
                syncedCommits: totalCommits,
                repos: repos.length,
                errors,
                lastSync: new Date(),
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch GitHub data', error);
        }
    },

    githubMetrics: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const metrics = await prisma.gitMetric.findMany({
                where: { projectId, organizationId: orgId },
                include: { projectRepo: { select: { id: true, label: true, githubOwner: true, repositoryName: true } } },
                orderBy: { updatedAt: 'desc' },
            });
            res.json({ success: true, metrics });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch GitHub metrics', error);
        }
    },

    githubCommits: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const branch = req.query.branch as string | undefined;
            const repoId = req.query.repoId as string | undefined;

            const where: Record<string, unknown> = { projectId, organizationId: orgId };
            if (branch) where.branchName = branch;
            if (repoId) where.projectRepoId = repoId;

            const commits = await prisma.gitCommit.findMany({
                where,
                include: { projectRepo: { select: { id: true, label: true, githubOwner: true, repositoryName: true } } },
                orderBy: { commitDate: 'desc' },
                take: 200,
            });
            res.json({ success: true, commits });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch GitHub commits', error);
        }
    },

    // ─── Project Task Comments ──────────────────────────────────────────

    addTaskComment: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const { taskId } = req.params;
            const userId = (req as any).user?.profileId;
            const { content, imageUrls } = req.body;

            const trimmed = (content || '').trim();
            const images = Array.isArray(imageUrls) ? imageUrls.filter((u: any) => typeof u === 'string' && u) : [];

            if (!trimmed && images.length === 0) return sendError(res, 400, 'Comment content or at least one image is required');

            const task = await prisma.projectTask.findFirst({ where: { id: taskId, organizationId: orgId } });
            if (!task) return sendError(res, 404, 'Task not found');

            const comment = await prisma.taskComment.create({
                data: {
                    projectTaskId: taskId,
                    organizationId: orgId,
                    content: trimmed,
                    imageUrls: images,
                    createdBy: userId,
                },
                include: {
                    creator: { select: { id: true, fullName: true, email: true } },
                },
            });

            res.status(201).json(comment);
        } catch (error) {
            return sendError(res, 500, 'Failed to add comment', error);
        }
    },

    deleteTaskComment: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { commentId } = req.params;
            const { count } = await prisma.taskComment.deleteMany({
                where: { id: commentId, organizationId: orgId },
            });
            if (count === 0) return sendError(res, 404, 'Comment not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete comment', error);
        }
    },
};
