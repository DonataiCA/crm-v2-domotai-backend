import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { TimeEntryRepository } from '../repositories/time-entry.repository';

export const TimeEntryController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                userId: req.query.userId as string | undefined,
                projectId: req.query.projectId as string | undefined,
                billable: req.query.billable as string | undefined,
            };

            const [data, total] = await Promise.all([
                TimeEntryRepository.findAll(orgId, skip, limit, filters),
                TimeEntryRepository.count(orgId, filters),
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
            return sendError(res, 500, 'Failed to fetch time entries', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const entry = await TimeEntryRepository.create({
                ...req.body,
                organizationId: orgId,
                userId,
            });

            res.status(201).json(entry);
        } catch (error) {
            return sendError(res, 500, 'Failed to create time entry', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await TimeEntryRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Time entry not found');

            const entry = await TimeEntryRepository.update(req.params.id, req.body, orgId);
            res.json(entry);
        } catch (error) {
            return sendError(res, 500, 'Failed to update time entry', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await TimeEntryRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Time entry not found');

            await TimeEntryRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete time entry', error);
        }
    },

    start: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const entry = await TimeEntryRepository.startTimer({
                ...req.body,
                organizationId: orgId,
                userId,
            });

            res.status(201).json(entry);
        } catch (error) {
            return sendError(res, 500, 'Failed to start timer', error);
        }
    },

    stop: async (req: Request, res: Response) => {
        try {
            const entry = await TimeEntryRepository.stopTimer(req.params.id);
            if (!entry) return sendError(res, 404, 'Time entry not found or has no start time');

            res.json(entry);
        } catch (error) {
            return sendError(res, 500, 'Failed to stop timer', error);
        }
    },
};
