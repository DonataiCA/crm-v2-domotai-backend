import { z } from 'zod';

export const createTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(10000).optional().nullable(),
    status: z.string().max(50).optional(),
    priority: z.string().max(20).optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
    dueDate: z.string().optional().nullable(),
}).strip();

export const updateTaskSchema = createTaskSchema.partial();

export const addCommentSchema = z.object({
    content: z.string().min(1, 'Comment content is required').max(10000),
}).strip();
