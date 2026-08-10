import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { NotificationRepository } from '../repositories/notification.repository';

export const NotificationController = {
    index: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters: { read?: boolean } = {};
            if (req.query.read === 'true') filters.read = true;
            if (req.query.read === 'false') filters.read = false;

            const [data, total] = await Promise.all([
                NotificationRepository.findAll(organizationId, skip, limit, filters),
                NotificationRepository.count(organizationId, filters),
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
            return sendError(res, 500, 'Failed to fetch notifications', error);
        }
    },

    unreadCount: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            const count = await NotificationRepository.unreadCount(organizationId);
            res.json({ count });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch unread count', error);
        }
    },

    markAsRead: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await NotificationRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Notification not found');

            await NotificationRepository.markAsRead(id);
            res.json({ success: true });
        } catch (error) {
            return sendError(res, 500, 'Failed to mark notification as read', error);
        }
    },

    markAllAsRead: async (req: Request, res: Response) => {
        try {
            const organizationId = (req as any).orgId;

            await NotificationRepository.markAllAsRead(organizationId);
            res.json({ success: true });
        } catch (error) {
            return sendError(res, 500, 'Failed to mark all notifications as read', error);
        }
    },

    getPreferences: async (req: Request, res: Response) => {
        try {
            const userId = (req as any).userId;
            const preferences = await NotificationRepository.getPreferences(userId);
            res.json({ data: preferences });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch preferences', error);
        }
    },

    updatePreferences: async (req: Request, res: Response) => {
        try {
            const userId = (req as any).userId;
            const { preferences } = req.body;
            if (!Array.isArray(preferences)) return sendError(res, 400, 'preferences array is required');

            const updated = await NotificationRepository.upsertPreferences(userId, preferences);
            res.json({ data: updated });
        } catch (error) {
            return sendError(res, 500, 'Failed to update preferences', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { id } = req.params;

            const existing = await NotificationRepository.findById(id, orgId);
            if (!existing) return sendError(res, 404, 'Notification not found');

            await NotificationRepository.delete(id, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete notification', error);
        }
    },
};
