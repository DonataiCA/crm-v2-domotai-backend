import { z } from 'zod';
import { normalizeSharePermissions, SHARE_PERMISSIONS } from '../constants/enums';

export const shareProjectSchema = z.object({
    clientEmail: z.string().email('Valid email required'),
    clientName: z.string().min(1, 'Name is required').max(200),
    // `transform` y no sólo `refine`: el controlador guardaba en base lo que
    // llegara — incluido un array, que Prisma rechaza porque la columna es
    // String. Aquí sale siempre un CSV canónico o falla.
    permissions: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((value, ctx) => {
            if (value === undefined) return undefined;
            const normalized = normalizeSharePermissions(value);
            if (normalized === null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid permissions. Expected a comma-separated subset of: ${SHARE_PERMISSIONS.join(', ')}`,
                });
                return z.NEVER;
            }
            return normalized;
        }),
}).strip();

export const clientLoginSchema = z.object({
    email: z.string().email('Valid email required'),
});

export const guestCommentSchema = z.object({
    content: z.string().min(1, 'Comment is required').max(10000),
    guestEmail: z.string().email().optional(),
    guestName: z.string().max(200).optional(),
}).strip();

export const guestTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(10000).optional().nullable(),
    status: z.string().max(50).optional(),
    priority: z.string().max(20).optional().nullable(),
}).strip();
