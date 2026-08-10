import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { CalendarRepository } from '../repositories/calendar.repository';

export const CalendarController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const filters = {
                dateFrom: req.query.dateFrom as string | undefined,
                dateTo: req.query.dateTo as string | undefined,
                contactId: req.query.contactId as string | undefined,
                leadId: req.query.leadId as string | undefined,
                projectId: req.query.projectId as string | undefined,
            };

            const events = await CalendarRepository.findAll(orgId, filters);
            res.json(events);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch calendar events', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const { title, description, startDate, endDate, allDay, color, contactId, leadId, projectId } = req.body;

            if (!title || !startDate) {
                return sendError(res, 400, 'title and startDate are required');
            }

            const event = await CalendarRepository.create({
                organizationId: orgId,
                title,
                description,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : undefined,
                allDay: allDay ?? false,
                color,
                contactId,
                leadId,
                projectId,
                createdBy: userId,
            });

            res.status(201).json(event);
        } catch (error) {
            return sendError(res, 500, 'Failed to create calendar event', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CalendarRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Calendar event not found');

            const data: Record<string, unknown> = { ...req.body };
            if (data.startDate) data.startDate = new Date(data.startDate as string);
            if (data.endDate) data.endDate = new Date(data.endDate as string);

            const event = await CalendarRepository.update(req.params.id, data, orgId);
            res.json(event);
        } catch (error) {
            return sendError(res, 500, 'Failed to update calendar event', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CalendarRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Calendar event not found');

            await CalendarRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete calendar event', error);
        }
    },
};
