import { z } from 'zod';

export const shareProjectSchema = z.object({
    clientEmail: z.string().email('Valid email required'),
    clientName: z.string().min(1, 'Name is required').max(200),
    permissions: z.string().or(z.array(z.string())).optional(),
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
