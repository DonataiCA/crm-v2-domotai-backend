import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';

export const AuditLogController = {
    index: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const where: any = { organizationId };

            if (req.query.action) {
                where.action = req.query.action as string;
            }
            if (req.query.entityType) {
                where.entityType = req.query.entityType as string;
            }
            if (req.query.userId) {
                where.userId = req.query.userId as string;
            }

            const [logs, total] = await Promise.all([
                prisma.auditLog.findMany({
                    where,
                    include: {
                        profile: {
                            select: { id: true, fullName: true, email: true },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                }),
                prisma.auditLog.count({ where }),
            ]);

            const transformed = logs.map(({ profile, ...rest }) => ({ ...rest, user: profile }));

            res.json({
                data: transformed,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch audit logs', error);
        }
    },
};
