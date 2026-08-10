import { z } from 'zod';

export const createCompanySchema = z.object({
    name: z.string().min(1, 'Company name is required').max(200),
    domain: z.string().max(200).optional().nullable(),
    industry: z.string().max(100).optional().nullable(),
    size: z.string().max(50).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
}).strip();

export const updateCompanySchema = createCompanySchema.partial();
