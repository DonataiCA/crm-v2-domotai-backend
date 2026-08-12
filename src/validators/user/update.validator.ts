import { z } from 'zod';
import { Request } from 'express';
import { PROFILE_ROLES, normalizeRole } from '../../constants/roles';

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
    // Tolerante con el casing ("Admin" → "admin") pero estricto con el conjunto:
    // el rol decide accesos, así que un valor desconocido debe fallar, no degradarse
    // a un rol por defecto que conceda o quite permisos en silencio.
    role: z.string().transform(normalizeRole).pipe(z.enum(PROFILE_ROLES)).optional(),
}).strip();

export function validateUpdate(req: Request) {
    return updateSchema.parse(req.body);
}

