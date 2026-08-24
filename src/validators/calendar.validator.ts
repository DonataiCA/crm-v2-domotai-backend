import { z } from 'zod';

export const createEventSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(5000).optional().nullable(),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().optional().nullable(),
    allDay: z.boolean().optional(),
    color: z.string().max(20).optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
}).strip();

export const updateEventSchema = createEventSchema.partial();

/**
 * Query de `GET /calendar/overview`. `sources` es un CSV de las fuentes que el
 * cliente quiere recibir; omitirlo equivale a pedirlas todas.
 */
export const overviewQuerySchema = z.object({
    dateFrom: z.string().min(1, 'dateFrom is required'),
    dateTo: z.string().min(1, 'dateTo is required'),
    sources: z.string().optional(),
}).strip();
