import { z } from 'zod';
import { Request } from 'express';

export const filterSchema = z.object({
    search: z.string().min(1).optional(),
});

export function validateFilters(req: Request) {
    // Only extract filter-specific fields from query
    const { search } = req.query;
    return filterSchema.parse({ search });
}

