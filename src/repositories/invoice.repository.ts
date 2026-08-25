import { prisma } from '../config/prisma';
import { computeInvoiceTotals } from '../utils/invoice-totals';

/** Lo que se usa del cliente de Prisma dentro de una transacción. */
type TransactionClient = {
    invoice: {
        findFirst: (args: unknown) => Promise<{ invoiceNumber: string | null } | null>;
        create: (args: unknown) => Promise<unknown>;
    };
};

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

/**
 * Siguiente correlativo de la organización para el año en curso, con formato
 * `AAAA-NNNN`. Se rellena a cuatro cifras para que el orden alfabético coincida con el
 * numérico: sin eso, `2026-10` iría antes que `2026-9`.
 *
 * Recibe el cliente de la transacción, no `prisma`: la consulta del último número y el
 * insert tienen que ir en la misma, o dos altas simultáneas se llevan el mismo número.
 */
async function nextInvoiceNumber(tx: TransactionClient, organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${year}-`;

    const last = await tx.invoice.findFirst({
        where: { organizationId, invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
    });

    const lastSeq = last?.invoiceNumber ? Number(last.invoiceNumber.slice(prefix.length)) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, '0')}`;
}

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
        items?: { description: string; quantity: number; unitPrice: number; total?: number }[];
    }) => {
        const { items, ...invoiceData } = data;
        // Los importes se calculan aquí, nunca se toman del cliente: un total de línea
        // que no sea cantidad por precio deja la factura descuadrada consigo misma.
        const totals = computeInvoiceTotals(items ?? [], invoiceData.tax ?? 0);

        return prisma.$transaction(async (tx) => {
            const invoiceNumber = invoiceData.invoiceNumber
                ?? await nextInvoiceNumber(tx as unknown as TransactionClient, invoiceData.organizationId);

            return (tx as typeof prisma).invoice.create({
                data: {
                    ...invoiceData,
                    invoiceNumber,
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    total: totals.total,
                    items: totals.items.length > 0 ? { create: totals.items } : undefined,
                },
                include: invoiceIncludes,
            });
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
        items?: { description: string; quantity: number; unitPrice: number; total?: number }[];
    }, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.invoice.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        const { items, ...invoiceData } = data;
        // Si cambian las líneas hay que recalcular: dejar los importes viejos con líneas
        // nuevas es la forma más silenciosa de descuadrar una factura.
        const totals = items !== undefined
            ? computeInvoiceTotals(items, invoiceData.tax ?? 0)
            : null;

        return prisma.$transaction(async (tx) => {
            if (items !== undefined) {
                await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
            }
            return tx.invoice.update({
                where: { id },
                data: {
                    ...invoiceData,
                    ...(totals
                        ? { subtotal: totals.subtotal, tax: totals.tax, total: totals.total }
                        : {}),
                    items: totals ? { create: totals.items } : undefined,
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
