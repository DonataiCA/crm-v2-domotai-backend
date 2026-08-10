import { z } from 'zod';
import { Request } from 'express';

export const updateSchema = z.object({
    firstName: z.string().min(2).optional(),
    lastName: z.string().min(2).optional(),
    password: z.string().min(6).optional(),
    email: z.string().email().optional(),
    gender: z.string().min(1).optional(),
    phoneNumber: z.string().min(10).optional(),
    providerId: z.string().optional(),
    authProvider: z.enum(['EMAIL', 'GOOGLE', 'APPLE']).optional(),
    // Profile fields (synced to Profile table)
    fullName: z.string().min(1).optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
}).strip();

export function validateUpdate(req: Request) {
    return updateSchema.parse(req.body);
}

