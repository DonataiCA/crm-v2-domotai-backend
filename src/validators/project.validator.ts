import { z } from 'zod';

export const createProjectSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    description: z.string().max(10000).optional().nullable(),
    status: z.string().max(50).optional(),
    price: z.number().or(z.string().transform(Number)).optional().nullable(),
    revenue: z.number().or(z.string().transform(Number)).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    projectLeadId: z.string().uuid().optional().nullable(),
}).strip();

export const updateProjectSchema = createProjectSchema.partial();

export const createPhaseSchema = z.object({
    name: z.string().min(1, 'Phase name is required').max(200),
    status: z.string().max(50).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    orderIndex: z.number().int().optional(),
}).strip();

export const createProjectTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(10000).optional().nullable(),
    status: z.string().max(50).optional(),
    priority: z.string().max(20).optional().nullable(),
    // A task must always belong to a phase — no unassigned tasks on creation.
    phaseId: z
        .string({ required_error: 'Phase is required', invalid_type_error: 'Phase is required' })
        .uuid('Phase is required'),
    assignedTo: z.string().uuid().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    estimatedHours: z.number().optional().nullable(),
}).strip();
