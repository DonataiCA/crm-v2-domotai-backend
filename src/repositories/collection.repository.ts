import { prisma } from '../config/prisma';
import { overdueCutoff, type CollectionStatus } from '../constants/billing';

/**
 * Consultas de la página de cobranzas. Trabajan sobre `Invoice` —no hay tabla propia—
 * pero con una forma distinta a `invoice.repository.ts`: allí se listan documentos y
 * aquí se persiguen cobros, con otros filtros y otro orden.
 *
 * La regla que sostiene todo el módulo: **el estado de cobranza se filtra en SQL, nunca
 * en memoria**. Si se trajera una página y luego se descartaran filas por su estado, una
 * página de 10 podría quedarse en 3 y el total contaría facturas que no se muestran.
 */

export interface CollectionFilters {
    status?: CollectionStatus;
    search?: string;
    dueFrom?: Date;
    dueTo?: Date;
}

/** Un borrador no se ha enviado y una cancelada no se cobra: ninguno es un cobro. */
const EXCLUDED_STATUSES = ['DRAFT', 'CANCELLED'];
/** Para los estados por cobrar hay que excluir además las ya pagadas. */
const UNPAID_STATUSES = [...EXCLUDED_STATUSES, 'PAID'];

const collectionIncludes = {
    contact: { select: { id: true, name: true, email: true, phone: true, company: true } },
    project: { select: { id: true, name: true } },
    // La lista muestra la primera línea como "servicio"; el orden lo decide el consumidor.
    items: { select: { id: true, description: true, total: true } },
    // Sólo lo que la tabla pinta del servicio: cada cuánto se cobra y si sigue vivo.
    subscription: { select: { interval: true, cancelledAt: true } },
};

function buildWhere(orgId: string, filters: CollectionFilters, today: Date) {
    const where: Record<string, unknown> = { organizationId: orgId };
    // Las condiciones se acumulan en AND porque varias usan OR por dentro y se
    // pisarían entre sí en la raíz del where.
    const and: Array<Record<string, unknown>> = [];

    const cutoff = overdueCutoff(today);

    if (filters.status === 'PAID') {
        where.status = 'PAID';
    } else if (filters.status === 'OVERDUE') {
        where.status = { notIn: UNPAID_STATUSES };
        and.push({ paidAt: null });
        and.push({ dueDate: { lt: cutoff } });
    } else if (filters.status === 'UNPAID') {
        // Todo lo que falta por cobrar, vencido o no: es la unión de DUE y OVERDUE.
        where.status = { notIn: UNPAID_STATUSES };
        and.push({ paidAt: null });
    } else if (filters.status === 'DUE') {
        where.status = { notIn: UNPAID_STATUSES };
        and.push({ paidAt: null });
        // Sin vencimiento no hay plazo incumplido, así que cuenta como por cobrar.
        and.push({ OR: [{ dueDate: { gte: cutoff } }, { dueDate: null }] });
    } else {
        where.status = { notIn: EXCLUDED_STATUSES };
    }

    if (filters.dueFrom || filters.dueTo) {
        const range: Record<string, Date> = {};
        if (filters.dueFrom) range.gte = filters.dueFrom;
        if (filters.dueTo) range.lte = filters.dueTo;
        and.push({ dueDate: range });
    }

    if (filters.search) {
        const contains = { contains: filters.search, mode: 'insensitive' as const };
        and.push({
            OR: [
                { invoiceNumber: contains },
                { contact: { name: contains } },
                { contact: { email: contains } },
                // El servicio es lo que se ve en la columna "Service", así que es lo
                // primero por lo que alguien busca. Va por la línea de detalle y por el
                // nombre del servicio recurrente, que son sus dos orígenes posibles.
                { items: { some: { description: contains } } },
                { subscription: { serviceName: contains } },
            ],
        });
    }

    if (and.length > 0) where.AND = and;
    return where;
}

/** Primer y último instante del mes al que pertenece `today`, en UTC. */
function monthRange(today: Date): { gte: Date; lte: Date } {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    return {
        gte: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
        lte: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
    };
}

export interface CollectionSummary {
    /** Cobros que vencen este mes: el denominador del "10/40". */
    dueThisMonth: number;
    /** De esos, los ya cobrados: el numerador. */
    paidThisMonth: number;
    /** Morosos, sin limitar al mes: una deuda de marzo sigue siendo deuda. */
    overdue: number;
    overdueAmount: number;
    pendingAmount: number;
}

export const CollectionRepository = {
    findAll: (
        orgId: string,
        skip: number,
        take: number,
        filters: CollectionFilters,
        today: Date,
    ) =>
        prisma.invoice.findMany({
            skip,
            take,
            where: buildWhere(orgId, filters, today),
            // Lo que vence antes se persigue antes. El `id` desempata: decenas de
            // cobros comparten fecha y, sin un criterio estable, Postgres puede
            // devolver la misma fila en dos páginas y omitir otra.
            orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            include: collectionIncludes,
        }),

    count: (orgId: string, filters: CollectionFilters, today: Date) =>
        prisma.invoice.count({ where: buildWhere(orgId, filters, today) }),

    /**
     * Las cifras del panel. Todo con `count` y `aggregate`: traer las filas para
     * contarlas en JS convertiría el panel en la consulta más cara de la página.
     */
    summary: async (orgId: string, today: Date): Promise<CollectionSummary> => {
        const month = monthRange(today);
        const cutoff = overdueCutoff(today);

        const collectible = { organizationId: orgId, status: { notIn: EXCLUDED_STATUSES } };
        const unpaid = {
            organizationId: orgId,
            status: { notIn: UNPAID_STATUSES },
            AND: [{ paidAt: null }],
        };

        const [dueThisMonth, paidThisMonth, overdue, overdueSum, pendingSum] = await Promise.all([
            prisma.invoice.count({ where: { ...collectible, AND: [{ dueDate: month }] } }),
            prisma.invoice.count({
                where: { organizationId: orgId, status: 'PAID', AND: [{ dueDate: month }] },
            }),
            prisma.invoice.count({
                where: { ...unpaid, AND: [...unpaid.AND, { dueDate: { lt: cutoff } }] },
            }),
            prisma.invoice.aggregate({
                _sum: { total: true },
                where: { ...unpaid, AND: [...unpaid.AND, { dueDate: { lt: cutoff } }] },
            }),
            prisma.invoice.aggregate({ _sum: { total: true }, where: unpaid }),
        ]);

        return {
            dueThisMonth,
            paidThisMonth,
            overdue,
            overdueAmount: Number(overdueSum._sum.total ?? 0),
            pendingAmount: Number(pendingSum._sum.total ?? 0),
        };
    },
};
