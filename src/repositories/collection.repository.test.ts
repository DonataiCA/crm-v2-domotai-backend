import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` es hoisted, así que lo que referencia debe venir de `vi.hoisted()`.
const { invoiceFindMany, invoiceCount, invoiceAggregate } = vi.hoisted(() => ({
    invoiceFindMany: vi.fn(),
    invoiceCount: vi.fn(),
    invoiceAggregate: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        invoice: {
            findMany: invoiceFindMany,
            count: invoiceCount,
            aggregate: invoiceAggregate,
        },
    },
}));

import { CollectionRepository } from './collection.repository';

const ORG = 'org-1';
const HOY = new Date('2026-08-24T12:00:00.000Z');

beforeEach(() => {
    vi.clearAllMocks();
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);
});

/** El `where` con el que se llamó a Prisma en la última invocación. */
const whereDe = (mock: typeof invoiceFindMany) => mock.mock.calls[0][0].where;

describe('CollectionRepository — aislamiento por organización', () => {
    it('toda consulta va acotada a su organización', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, {}, HOY);

        expect(whereDe(invoiceFindMany).organizationId).toBe(ORG);
    });

    it('el contador también, o el número de páginas sería el de toda la plataforma', async () => {
        await CollectionRepository.count(ORG, {}, HOY);

        expect(whereDe(invoiceCount).organizationId).toBe(ORG);
    });
});

describe('CollectionRepository — qué entra en cobranzas', () => {
    it('excluye borradores y canceladas por defecto', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, {}, HOY);

        expect(whereDe(invoiceFindMany).status).toEqual({ notIn: ['DRAFT', 'CANCELLED'] });
    });
});

describe('CollectionRepository — el filtro por estado se traduce a SQL', () => {
    /**
     * Es la propiedad que sostiene la paginación: si el estado se filtrara en memoria
     * después de traer la página, una página de 10 podría quedarse en 3 y el total
     * sería el de todas las facturas, no el de las morosas.
     */
    it('PAID pide exactamente las pagadas', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { status: 'PAID' }, HOY);

        expect(whereDe(invoiceFindMany).status).toBe('PAID');
    });

    it('OVERDUE pide las no pagadas cuyo vencimiento pasó la gracia', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { status: 'OVERDUE' }, HOY);
        const where = whereDe(invoiceFindMany);

        expect(where.status).toEqual({ notIn: ['DRAFT', 'CANCELLED', 'PAID'] });
        // 24 de agosto menos 5 días de gracia.
        expect(where.AND).toContainEqual({ dueDate: { lt: new Date('2026-08-19T00:00:00.000Z') } });
        expect(where.AND).toContainEqual({ paidAt: null });
    });

    it('DUE pide las no pagadas que todavía están en plazo', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { status: 'DUE' }, HOY);
        const where = whereDe(invoiceFindMany);

        expect(where.status).toEqual({ notIn: ['DRAFT', 'CANCELLED', 'PAID'] });
        expect(where.AND).toContainEqual({
            OR: [
                { dueDate: { gte: new Date('2026-08-19T00:00:00.000Z') } },
                { dueDate: null },
            ],
        });
    });

    it('count usa el mismo where que la consulta, o el paginador mentiría', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { status: 'OVERDUE' }, HOY);
        await CollectionRepository.count(ORG, { status: 'OVERDUE' }, HOY);

        expect(whereDe(invoiceCount)).toEqual(whereDe(invoiceFindMany));
    });
});

describe('CollectionRepository — paginación', () => {
    it('traslada skip y take a Prisma en vez de recortar en memoria', async () => {
        await CollectionRepository.findAll(ORG, 20, 10, {}, HOY);
        const args = invoiceFindMany.mock.calls[0][0];

        expect(args.skip).toBe(20);
        expect(args.take).toBe(10);
    });

    /**
     * Ordenar sólo por vencimiento no basta: decenas de cobros comparten la misma
     * fecha y, ante el empate, Postgres no garantiza un orden estable entre
     * consultas. Sin un desempate, la misma factura puede salir en la página 1 y en
     * la 2 mientras otra no sale en ninguna. Verificado contra la base: pasaba con 2
     * filas de 25.
     */
    it('ordena por vencimiento y desempata por id, para que las páginas no se solapen', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, {}, HOY);

        expect(invoiceFindMany.mock.calls[0][0].orderBy).toEqual([
            { dueDate: 'asc' },
            { id: 'asc' },
        ]);
    });

    it('trae el cliente y la primera línea, que es lo que la lista muestra', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, {}, HOY);
        const include = invoiceFindMany.mock.calls[0][0].include;

        expect(include.contact).toBeTruthy();
        expect(include.items).toBeTruthy();
    });
});

describe('CollectionRepository — búsqueda', () => {
    it('busca por nombre de cliente y por número de factura, sin distinguir mayúsculas', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { search: 'andina' }, HOY);

        expect(whereDe(invoiceFindMany).AND).toContainEqual({
            OR: [
                { invoiceNumber: { contains: 'andina', mode: 'insensitive' } },
                { contact: { name: { contains: 'andina', mode: 'insensitive' } } },
                { contact: { email: { contains: 'andina', mode: 'insensitive' } } },
            ],
        });
    });

    /** Buscar dentro de un estado tiene que seguir funcionando: por eso todo va en AND. */
    it('combina la búsqueda con el filtro de estado sin que una pise a la otra', async () => {
        await CollectionRepository.findAll(ORG, 0, 10, { status: 'OVERDUE', search: 'andina' }, HOY);
        const where = whereDe(invoiceFindMany);

        expect(where.AND).toContainEqual({ dueDate: { lt: new Date('2026-08-19T00:00:00.000Z') } });
        expect(where.AND.some((c: Record<string, unknown>) => 'OR' in c)).toBe(true);
    });
});

describe('CollectionRepository.summary', () => {
    beforeEach(() => {
        invoiceCount.mockResolvedValue(0);
        invoiceAggregate.mockResolvedValue({ _sum: { total: null } });
    });

    /**
     * El "10/40" se cuenta con `count`, nunca trayendo las filas para contarlas en JS:
     * con mil facturas eso sería traerlas todas para mostrar un número.
     */
    it('cuenta, no trae filas', async () => {
        await CollectionRepository.summary(ORG, HOY);

        expect(invoiceFindMany).not.toHaveBeenCalled();
        expect(invoiceCount).toHaveBeenCalled();
    });

    it('el denominador son los cobros que vencen en el mes en curso', async () => {
        await CollectionRepository.summary(ORG, HOY);
        const where = invoiceCount.mock.calls[0][0].where;

        expect(where.organizationId).toBe(ORG);
        expect(where.status).toEqual({ notIn: ['DRAFT', 'CANCELLED'] });
        expect(where.AND).toContainEqual({
            dueDate: {
                gte: new Date('2026-08-01T00:00:00.000Z'),
                lte: new Date('2026-08-31T23:59:59.999Z'),
            },
        });
    });

    it('el numerador son los del mes que ya están pagados', async () => {
        await CollectionRepository.summary(ORG, HOY);
        const where = invoiceCount.mock.calls[1][0].where;

        expect(where.status).toBe('PAID');
        expect(where.AND).toContainEqual({
            dueDate: {
                gte: new Date('2026-08-01T00:00:00.000Z'),
                lte: new Date('2026-08-31T23:59:59.999Z'),
            },
        });
    });

    /** Un moroso de hace tres meses sigue siendo moroso: perseguir cobros no entiende de meses. */
    it('los morosos se cuentan sin limitarlos al mes', async () => {
        await CollectionRepository.summary(ORG, HOY);
        const where = invoiceCount.mock.calls[2][0].where;

        expect(where.AND).toContainEqual({ dueDate: { lt: new Date('2026-08-19T00:00:00.000Z') } });
        expect(where.AND.some((c: Record<string, unknown>) => 'dueDate' in c && 'gte' in (c.dueDate as object))).toBe(false);
    });

    it('devuelve las cifras que la página pinta', async () => {
        invoiceCount.mockResolvedValueOnce(40).mockResolvedValueOnce(10).mockResolvedValueOnce(7);

        const result = await CollectionRepository.summary(ORG, HOY);

        expect(result.dueThisMonth).toBe(40);
        expect(result.paidThisMonth).toBe(10);
        expect(result.overdue).toBe(7);
    });
});
