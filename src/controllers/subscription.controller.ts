import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { SubscriptionRepository } from '../repositories/subscription.repository';

/**
 * Servicios recurrentes. El alta emite además el primer cobro, así que lo que aquí
 * parece una creación simple es en realidad una transacción del repositorio.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

export const SubscriptionController = {
    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            // `profileId`, no `userId`: las claves ajenas apuntan a Profile.id.
            const createdBy = (req as any).user?.profileId as string | undefined;
            const body = req.body;

            const subscription = await SubscriptionRepository.createWithFirstInvoice(
                {
                    ...body,
                    // El orgId sale del request, nunca del cuerpo: aceptarlo del cliente
                    // permitiría dar de alta un servicio en otra organización.
                    organizationId: orgId,
                    createdBy,
                    // Prisma 6 rechaza "2026-09-01": hay que convertirlo aquí.
                    startDate: new Date(body.startDate),
                },
                new Date(),
            );

            res.status(201).json(subscription);
        } catch (error) {
            return sendError(res, 500, 'Failed to create subscription', error);
        }
    },

    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(
                MAX_LIMIT,
                Math.max(1, parseInt(req.query.limit as string) || DEFAULT_LIMIT),
            );

            const [data, total] = await Promise.all([
                SubscriptionRepository.findAll(orgId, (page - 1) * limit, limit),
                SubscriptionRepository.count(orgId),
            ]);

            res.json({
                data,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch subscriptions', error);
        }
    },
};
