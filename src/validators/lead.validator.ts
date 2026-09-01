import { z } from 'zod';

export const createLeadSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    details: z.string().max(5000).optional().nullable(),
    // La etapa se acepta tal cual (slug con guion o guion bajo, o el nombre visible
    // de un cliente viejo) y NO se muta aquí: el controlador la resuelve contra las
    // etapas reales del pipeline y guarda su forma canónica. Mutarla aquí rompía el
    // caso de slugs con guion (`first-meeting` → `first_meeting`, inexistente).
    stage: z.string().max(50).optional(),
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
