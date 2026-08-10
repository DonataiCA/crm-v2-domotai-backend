import { z } from 'zod';
import { Request } from 'express';

export const idParamSchema = z.object({
    id: z.string().uuid(),
});

export function validateIdParam(req: Request) {
    return idParamSchema.parse(req.params);
}

export function getAuthenticatedUserId(req: Request): string {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
        throw new Error('User not authenticated');
    }
    return userId;
}

