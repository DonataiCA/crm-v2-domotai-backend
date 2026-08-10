import { z } from 'zod';

export const uuidParam = z.object({ id: z.string().uuid() });
export const paginationQuery = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().min(1).max(1000).optional().default(20),
});
export const isoDateString = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional();
