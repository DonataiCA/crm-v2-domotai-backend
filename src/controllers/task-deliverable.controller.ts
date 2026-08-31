import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';
import { TaskDeliverableRepository } from '../repositories/task-deliverable.repository';
import { logAudit } from '../utils/audit';

export const TaskDeliverableController = {
    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const profileId = (req as any).user?.profileId;
            const { taskId } = req.params;
            const { title, orderIndex } = req.body;

            const task = await prisma.projectTask.findFirst({
                where: { id: taskId, organizationId: orgId },
                select: { id: true },
            });
            if (!task) return sendError(res, 404, 'Task not found');

            const finalOrder = typeof orderIndex === 'number'
                ? orderIndex
                : await TaskDeliverableRepository.nextOrderIndex(taskId, orgId);

            const deliverable = await TaskDeliverableRepository.create({
                projectTaskId: taskId,
                organizationId: orgId,
                title,
                orderIndex: finalOrder,
                createdBy: profileId ?? null,
            });

            res.status(201).json(deliverable);
            await logAudit(req, { action: 'CREATE', entityType: 'TaskDeliverable', entityId: deliverable.id, entityName: deliverable.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to create deliverable', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await TaskDeliverableRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Deliverable not found');

            const data: { title?: string; done?: boolean; doneAt?: Date | null } = {};
            if (typeof req.body.title === 'string') data.title = req.body.title;
            if (typeof req.body.done === 'boolean') {
                data.done = req.body.done;
                // Set/clear doneAt based on the transition
                if (req.body.done && !existing.done) data.doneAt = new Date();
                if (!req.body.done && existing.done) data.doneAt = null;
            }

            const deliverable = await TaskDeliverableRepository.update(id, data);
            res.json(deliverable);
            await logAudit(req, { action: 'UPDATE', entityType: 'TaskDeliverable', entityId: deliverable.id, entityName: deliverable.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to update deliverable', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await TaskDeliverableRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Deliverable not found');

            await TaskDeliverableRepository.delete(id);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'TaskDeliverable', entityId: existing.id, entityName: existing.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete deliverable', error);
        }
    },
};
