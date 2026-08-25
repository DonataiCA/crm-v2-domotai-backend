import { z } from 'zod';
import { BILLING_INTERVALS } from '../constants/billing';

/**
 * Alta de un servicio recurrente. Los campos llevan el mismo nombre que en el schema de
 * Prisma y sobra lo demás (`.strip()`), como el resto de validadores del proyecto.
 */
export const createSubscriptionSchema = z.object({
    contactId: z.string().uuid('A client is required'),
    projectId: z.string().uuid().optional().nullable(),
    serviceName: z.string().min(1, 'Service name is required').max(200),
    // Un importe de cero no es un cobro: sería un servicio que nadie paga.
    amount: z.number().or(z.string().transform(Number)).refine((v) => v > 0, {
        message: 'Amount must be greater than zero',
    }),
    currency: z.string().max(10).optional().nullable(),
    interval: z.enum(BILLING_INTERVALS),
    startDate: z.string().min(1, 'Start date is required'),
    notes: z.string().max(5000).optional().nullable(),
}).strip();
