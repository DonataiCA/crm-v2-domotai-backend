import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { TaskRepository } from '../repositories/task.repository';
import { emailService } from '../utils/email';
import { notify } from '../utils/notify';
import { logAudit } from '../utils/audit';

export const TaskController = {
    index: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                status: req.query.status as string | undefined,
                assignedTo: req.query.assignedTo as string | undefined,
                search: req.query.search as string | undefined,
                leadId: req.query.leadId as string | undefined,
                projectId: req.query.projectId as string | undefined,
                contactId: req.query.contactId as string | undefined,
                companyId: req.query.companyId as string | undefined,
            };

            const sortBy = (req.query.sortBy as string) || 'createdAt';
            const sortOrder = (req.query.sortOrder as string) || 'desc';

            const [data, total] = await Promise.all([
                TaskRepository.findAll(organizationId, skip, limit, filters, sortBy, sortOrder),
                TaskRepository.count(organizationId, filters),
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
            return sendError(res, 500, 'Failed to fetch tasks', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;
            const task = await TaskRepository.findById(id, orgId);
            if (!task) return sendError(res, 404, 'Task not found');
            res.json(task);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch task', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const userId = (req as any).userId;
            const { title, description, status, priority, progress, dueDate, reminderDate, assignedTo, contactId, leadId, projectId, companyId } = req.body;

            if (!title) return sendError(res, 400, 'Title is required');

            const task = await TaskRepository.create({
                title,
                description,
                status,
                priority,
                progress,
                dueDate: dueDate ? new Date(dueDate) : undefined,
                reminderDate: reminderDate ? new Date(reminderDate) : undefined,
                assignedTo,
                contactId,
                leadId,
                projectId,
                companyId,
                createdBy: userId,
                organizationId,
            });

            // Send task assignment email (fire and forget)
            // Use already-included assignee/creator from TaskRepository.create (taskDetailIncludes)
            if (task.assignee?.email) {
                emailService.sendTaskAssigned(task.assignee.email, task.assignee.fullName || 'Team Member', task.title, '', task.dueDate?.toISOString() || null, task.creator?.fullName || 'Someone');
            }

            res.status(201).json(task);
            await logAudit(req, { action: 'CREATE', entityType: 'Task', entityId: task.id, entityName: task.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to create task', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await TaskRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Task not found');

            const { title, description, status, priority, progress, dueDate, reminderDate, assignedTo, contactId, leadId, projectId, companyId } = req.body;

            const data: Record<string, unknown> = {};
            if (title !== undefined) data.title = title;
            if (description !== undefined) data.description = description;
            if (status !== undefined) data.status = status;
            if (priority !== undefined) data.priority = priority;
            if (progress !== undefined) data.progress = progress;
            if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
            if (reminderDate !== undefined) data.reminderDate = reminderDate ? new Date(reminderDate) : null;
            if (assignedTo !== undefined) data.assignedTo = assignedTo || null;
            if (contactId !== undefined) data.contactId = contactId || null;
            if (leadId !== undefined) data.leadId = leadId || null;
            if (projectId !== undefined) data.projectId = projectId || null;
            if (companyId !== undefined) data.companyId = companyId || null;

            const task = await TaskRepository.update(id, data, orgId);
            if (!task) return sendError(res, 404, 'Task not found');
            res.json(task);
            await logAudit(req, { action: 'UPDATE', entityType: 'Task', entityId: task.id, entityName: task.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to update task', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await TaskRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Task not found');

            await TaskRepository.delete(id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Task', entityId: existing.id, entityName: existing.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete task', error);
        }
    },

    bulkUpdate: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const { ids, ...updateData } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return sendError(res, 400, 'ids array is required');
            }

            // Process date fields
            if (updateData.dueDate !== undefined) {
                updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
            }
            if (updateData.reminderDate !== undefined) {
                updateData.reminderDate = updateData.reminderDate ? new Date(updateData.reminderDate) : null;
            }

            const result = await TaskRepository.bulkUpdate(ids, organizationId, updateData);
            res.json({ data: { count: result.count } });
            await logAudit(req, { action: 'BULK_UPDATE', entityType: 'Task', details: `Updated ${result.count} tasks` });
        } catch (error) {
            return sendError(res, 500, 'Failed to bulk update tasks', error);
        }
    },

    bulkDelete: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return sendError(res, 400, 'ids array is required');
            }

            const result = await TaskRepository.bulkDelete(ids, organizationId);
            res.json({ data: { count: result.count } });
            await logAudit(req, { action: 'BULK_DELETE', entityType: 'Task', details: `Deleted ${result.count} tasks` });
        } catch (error) {
            return sendError(res, 500, 'Failed to bulk delete tasks', error);
        }
    },

    addComment: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const userId = (req as any).userId;
            const { taskId } = req.params;
            const { content } = req.body;

            if (!content) return sendError(res, 400, 'Content is required');

            const existing = await TaskRepository.findById(taskId, organizationId);
            if (!existing) return sendError(res, 404, 'Task not found');

            const comment = await TaskRepository.addComment({
                taskId,
                organizationId,
                content,
                createdBy: userId,
            });

            res.status(201).json(comment);

            // Use already-fetched task data from findById above (existing variable)
            // and comment.creator from addComment's include
            if (existing.assignedTo && existing.assignedTo !== userId) {
                await notify({
                    organizationId,
                    type: 'TASK_COMMENT',
                    title: `New comment on: ${existing.title}`,
                    entityType: 'Task',
                    entityId: taskId,
                    actorId: userId,
                    recipientUserId: existing.assignedTo,
                    metadata: {
                        taskTitle: existing.title,
                        commenterName: comment.creator?.fullName || 'Someone',
                        commentContent: content || '',
                    },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to add comment', error);
        }
    },

    deleteComment: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { commentId } = req.params;

            const deleted = await TaskRepository.deleteComment(commentId, orgId);
            if (!deleted) return sendError(res, 404, 'Comment not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete comment', error);
        }
    },

    addLink: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const userId = (req as any).userId;
            const { taskId } = req.params;
            const { title, url, linkType } = req.body;

            if (!title || !url) return sendError(res, 400, 'Title and URL are required');

            const existing = await TaskRepository.findById(taskId, organizationId);
            if (!existing) return sendError(res, 404, 'Task not found');

            const link = await TaskRepository.addLink({
                taskId,
                organizationId,
                title,
                url,
                linkType,
                createdBy: userId,
            });

            res.status(201).json(link);
        } catch (error) {
            return sendError(res, 500, 'Failed to add link', error);
        }
    },

    deleteLink: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { linkId } = req.params;

            const deleted = await TaskRepository.deleteLink(linkId, orgId);
            if (!deleted) return sendError(res, 404, 'Link not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete link', error);
        }
    },
};
