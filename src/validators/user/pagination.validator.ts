import { z } from 'zod';
import { Request } from 'express';

export const paginationSchema = z.object({
    page: z.preprocess((v) => parseInt(String(v)), z.number().int().min(1).default(1)),
    limit: z.preprocess((v) => parseInt(String(v)), z.number().int().min(1).max(100).default(10)),
});

export function validatePagination(req: Request) {
    // If none is sent, use both by default
    const query = { ...req.query };
    if (query.page === undefined) {
        query.page = '1';
    }
    if (query.limit === undefined) {
        query.limit = '10';
    }
    return paginationSchema.parse(query);
}

