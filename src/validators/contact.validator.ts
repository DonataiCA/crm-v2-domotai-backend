import { z } from 'zod';

export const createContactSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    company: z.string().max(200).optional().nullable(),
    companyId: z.string().uuid().optional().nullable(),
    role: z.string().max(200).optional().nullable(),
    category: z.string().max(50).optional().nullable(),
    leadSource: z.string().max(50).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
}).strip();

export const updateContactSchema = createContactSchema.partial();
