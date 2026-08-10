import { Request, Response } from 'express';
import { sendError } from '../utils/error';

// NOTE: No Incident model exists in the Prisma schema.
// This controller returns empty/mock data so the frontend pages don't crash.

export const IncidentController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));

            res.json({
                data: [],
                pagination: { page, limit, total: 0, pages: 0 },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch incidents', error);
        }
    },

    summary: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            res.json({
                total: 0,
                open: 0,
                inProgress: 0,
                resolved: 0,
                bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch incident summary', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            return sendError(res, 404, 'Incident not found');
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch incident', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            // Return a mock incident so the frontend can handle the response
            const userId = (req as any).userId;
            const { title, description, severity, projectId, ownerId } = req.body;

            res.status(201).json({
                id: 'mock-' + Date.now(),
                organizationId: orgId,
                title: title || 'Untitled',
                description: description || null,
                status: 'open',
                severity: severity || 'medium',
                projectId: projectId || null,
                ownerId: ownerId || userId,
                createdBy: userId,
                events: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to create incident', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            return sendError(res, 404, 'Incident not found');
        } catch (error) {
            return sendError(res, 500, 'Failed to update incident', error);
        }
    },

    addEvent: async (req: Request, res: Response) => {
        try {
            return sendError(res, 404, 'Incident not found');
        } catch (error) {
            return sendError(res, 500, 'Failed to add incident event', error);
        }
    },
};
