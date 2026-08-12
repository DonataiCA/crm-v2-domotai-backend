import { z } from 'zod';
import { DEFAULT_ORG_ROLE, ORG_ROLES, normalizeRole } from '../constants/roles';

export const createOrgSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    slug: z.string().max(100).optional(),
    logoUrl: z.string().url().optional().nullable(),
    colorScheme: z.string().max(50).optional().nullable(),
}).strip();

export const addMemberSchema = z.object({
    userId: z.string().uuid('Valid user ID required'),
    role: z.string().transform(normalizeRole).pipe(z.enum(ORG_ROLES)).optional().default(DEFAULT_ORG_ROLE),
}).strip();
