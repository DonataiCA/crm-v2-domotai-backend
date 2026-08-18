import { z } from 'zod';
import { INVOICE_STATUSES, normalizeInvoiceStatus } from '../constants/enums';
import { tolerantEnum } from './catalog';

export const createInvoiceSchema = z.object({
    invoiceNumber: z.string().max(50).optional(),
    contactId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    status: tolerantEnum(INVOICE_STATUSES, normalizeInvoiceStatus).optional(),
    issueDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    subtotal: z.number().or(z.string().transform(Number)).optional(),
    tax: z.number().or(z.string().transform(Number)).optional(),
    total: z.number().or(z.string().transform(Number)).optional(),
    currency: z.string().max(10).optional(),
    notes: z.string().max(5000).optional().nullable(),
    items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().or(z.string().transform(Number)),
        unitPrice: z.number().or(z.string().transform(Number)),
        total: z.number().or(z.string().transform(Number)),
    })).optional(),
}).strip();

export const updateInvoiceSchema = createInvoiceSchema.partial();
