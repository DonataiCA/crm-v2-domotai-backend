import { prisma } from '../config/prisma';

interface InvoiceFilters {
    status?: string;
    contactId?: string;
    projectId?: string;
}

function buildWhere(orgId: string, filters?: InvoiceFilters) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (filters?.status) where.status = filters.status;
    if (filters?.contactId) where.contactId = filters.contactId;
    if (filters?.projectId) where.projectId = filters.projectId;
    return where;
}

const invoiceIncludes = {
    contact: { select: { id: true, name: true, email: true, phone: true, company: true } },
    project: { select: { id: true, name: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    items: true,
};

export const InvoiceRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: InvoiceFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.invoice.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
            include: invoiceIncludes,
        });
    },

    count: (orgId: string, filters?: InvoiceFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.invoice.count({ where });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.invoice.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: invoiceIncludes,
        }),

    create: (data: {
        invoiceNumber?: string;
        organizationId: string;
        contactId?: string;
        projectId?: string;
        status?: string;
        issueDate?: Date | string;
        dueDate?: Date | string;
        subtotal?: number;
        tax?: number;
        total?: number;
        currency?: string;
        notes?: string;
        createdBy?: string;
        items?: { description: string; quantity: number; unitPrice: number; total: number }[];
    }) => {
        const { items, ...invoiceData } = data;
        return prisma.invoice.create({
            data: {
                ...invoiceData,
                items: items && items.length > 0
                    ? { create: items }
                    : undefined,
            },
            include: invoiceIncludes,
        });
    },

    update: async (id: string, data: {
        invoiceNumber?: string;
        contactId?: string | null;
        projectId?: string | null;
        status?: string;
        issueDate?: Date | string | null;
        dueDate?: Date | string | null;
        paidAt?: Date | string | null;
        subtotal?: number;
        tax?: number;
        total?: number;
        currency?: string;
        notes?: string | null;
        items?: { description: string; quantity: number; unitPrice: number; total: number }[];
    }, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.invoice.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        const { items, ...invoiceData } = data;
        return prisma.$transaction(async (tx) => {
            if (items !== undefined) {
                await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
            }
            return tx.invoice.update({
                where: { id },
                data: {
                    ...invoiceData,
                    items: items !== undefined
                        ? { create: items }
                        : undefined,
                },
                include: invoiceIncludes,
            });
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.invoice.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.invoice.delete({ where: { id } });
    },

    markPaid: (id: string, paymentMethod?: string) =>
        prisma.invoice.update({
            where: { id },
            data: { status: 'PAID', paidAt: new Date(), paymentMethod: paymentMethod || null },
            include: invoiceIncludes,
        }),

    markSent: (id: string) =>
        prisma.invoice.update({
            where: { id },
            data: { status: 'SENT' },
            include: invoiceIncludes,
        }),
};
