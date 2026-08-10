import { z } from 'zod';

export const createEventSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(5000).optional().nullable(),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().optional().nullable(),
    allDay: z.boolean().optional(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
}).strip();

export const updateEventSchema = createEventSchema.partial();
