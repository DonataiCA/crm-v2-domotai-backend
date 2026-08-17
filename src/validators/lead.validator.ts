import { z } from 'zod';

export const createLeadSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    details: z.string().max(5000).optional().nullable(),
    // El formato se valida aquí; que la etapa exista en el pipeline del lead se
    // valida en el controlador, que es donde se conoce el pipeline.
    stage: z
        .string()
        .max(50)
        .regex(/^[a-z0-9_]+$/, 'Stage must be a lowercase slug (e.g. "negociacion")')
        .optional(),
    pipelineId: z.string().uuid().optional().nullable(),
    price: z.number().or(z.string().transform(Number)).optional().nullable(),
    pricingType: z.string().max(50).optional().nullable(),
    nextFollowUp: z.string().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    companyId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
}).strip();

export const updateLeadSchema = createLeadSchema.partial();
