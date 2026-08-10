import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { logAudit } from '../utils/audit';
import { prisma } from '../config/prisma';
import { notify } from '../utils/notify';
import { generateInvoicePDF } from '../utils/pdf';
import { emailService } from '../utils/email';

export const InvoiceController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                status: req.query.status as string | undefined,
                contactId: req.query.contactId as string | undefined,
                projectId: req.query.projectId as string | undefined,
            };

            const [data, total] = await Promise.all([
                InvoiceRepository.findAll(orgId, skip, limit, filters),
                InvoiceRepository.count(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch invoices', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const invoice = await InvoiceRepository.findById(req.params.id, orgId);
            if (!invoice) return sendError(res, 404, 'Invoice not found');
            res.json(invoice);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch invoice', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const invoice = await InvoiceRepository.create({
                ...req.body,
                organizationId: orgId,
                createdBy: userId,
            });

            res.status(201).json(invoice);
            await logAudit(req, { action: 'CREATE', entityType: 'Invoice', entityId: invoice.id, entityName: invoice.invoiceNumber || invoice.id });
        } catch (error) {
            return sendError(res, 500, 'Failed to create invoice', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await InvoiceRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Invoice not found');

            const invoice = await InvoiceRepository.update(req.params.id, req.body, orgId);
            if (!invoice) return sendError(res, 404, 'Invoice not found');
            res.json(invoice);
            await logAudit(req, { action: 'UPDATE', entityType: 'Invoice', entityId: invoice.id, entityName: invoice.invoiceNumber || invoice.id });
        } catch (error) {
            return sendError(res, 500, 'Failed to update invoice', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await InvoiceRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Invoice not found');

            await InvoiceRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Invoice', entityId: existing.id, entityName: existing.invoiceNumber || existing.id });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete invoice', error);
        }
    },

    markPaid: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await InvoiceRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Invoice not found');

            const { paymentMethod } = req.body;
            const invoice = await InvoiceRepository.markPaid(req.params.id, paymentMethod);
            res.json(invoice);
            await logAudit(req, { action: 'MARK_PAID', entityType: 'Invoice', entityId: invoice.id, entityName: invoice.invoiceNumber || invoice.id });
        } catch (error) {
            return sendError(res, 500, 'Failed to mark invoice as paid', error);
        }
    },

    markSent: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await InvoiceRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Invoice not found');

            const invoice = await InvoiceRepository.markSent(req.params.id);
            res.json(invoice);
            await logAudit(req, { action: 'MARK_SENT', entityType: 'Invoice', entityId: invoice.id, entityName: invoice.invoiceNumber || invoice.id });

            // Use already-included contact from InvoiceRepository.markSent (invoiceIncludes)
            if (invoice.contact?.email) {
                await notify({
                    organizationId: orgId,
                    type: 'INVOICE_SENT',
                    title: `Invoice ${invoice.invoiceNumber} sent`,
                    entityType: 'Invoice',
                    entityId: invoice.id,
                    actorId: (req as any).userId,
                    recipientEmail: invoice.contact.email,
                    metadata: { invoiceNumber: invoice.invoiceNumber, contactName: invoice.contact.name },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to mark invoice as sent', error);
        }
    },

    generatePDF: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const invoice = await InvoiceRepository.findById(req.params.id, orgId);
            if (!invoice) return sendError(res, 404, 'Invoice not found');

            const org = await prisma.organization.findUnique({
                where: { id: invoice.organizationId },
                select: { name: true },
            });

            const pdfBuffer = await generateInvoicePDF({
                invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
                status: invoice.status,
                issueDate: invoice.issueDate?.toISOString() || null,
                dueDate: invoice.dueDate?.toISOString() || null,
                currency: invoice.currency || 'USD',
                subtotal: Number(invoice.subtotal) || 0,
                tax: Number(invoice.tax) || 0,
                total: Number(invoice.total) || 0,
                notes: invoice.notes,
                contact: invoice.contact ? {
                    name: invoice.contact.name,
                    email: invoice.contact.email || undefined,
                    phone: invoice.contact.phone || undefined,
                    company: invoice.contact.company || undefined,
                } : null,
                organization: org,
                items: (invoice.items || []).map((i: any) => ({
                    description: i.description,
                    quantity: Number(i.quantity),
                    unitPrice: Number(i.unitPrice),
                    total: Number(i.total),
                })),
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber || invoice.id.slice(0, 8)}.pdf"`);
            res.send(pdfBuffer);
        } catch (error) {
            return sendError(res, 500, 'Failed to generate PDF', error);
        }
    },

    sendByEmail: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const invoice = await InvoiceRepository.findById(req.params.id, orgId);
            if (!invoice) return sendError(res, 404, 'Invoice not found');

            if (!invoice.contact?.email) {
                return sendError(res, 400, 'Invoice contact has no email address');
            }

            const org = await prisma.organization.findUnique({
                where: { id: invoice.organizationId },
                select: { name: true },
            });

            const pdfBuffer = await generateInvoicePDF({
                invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
                status: invoice.status,
                issueDate: invoice.issueDate?.toISOString() || null,
                dueDate: invoice.dueDate?.toISOString() || null,
                currency: invoice.currency || 'USD',
                subtotal: Number(invoice.subtotal) || 0,
                tax: Number(invoice.tax) || 0,
                total: Number(invoice.total) || 0,
                notes: invoice.notes,
                contact: {
                    name: invoice.contact.name,
                    email: invoice.contact.email || undefined,
                    phone: invoice.contact.phone || undefined,
                    company: invoice.contact.company || undefined,
                },
                organization: org,
                items: (invoice.items || []).map((i: any) => ({
                    description: i.description,
                    quantity: Number(i.quantity),
                    unitPrice: Number(i.unitPrice),
                    total: Number(i.total),
                })),
            });

            await emailService.sendInvoice(
                invoice.contact.email,
                invoice.contact.name,
                invoice.invoiceNumber || invoice.id.slice(0, 8),
                Number(invoice.total) || 0,
                invoice.currency || 'USD',
                invoice.dueDate?.toISOString() || null,
                org?.name || 'Domotai Technologies',
                pdfBuffer
            );

            await InvoiceRepository.markSent(req.params.id);

            res.json({ success: true, message: 'Invoice sent by email' });
        } catch (error) {
            return sendError(res, 500, 'Failed to send invoice', error);
        }
    },
};
