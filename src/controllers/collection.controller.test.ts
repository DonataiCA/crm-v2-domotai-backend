import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock se hoistea, así que los mocks vienen de vi.hoisted().
const { findAll, count, summary } = vi.hoisted(() => ({
    findAll: vi.fn(),
    count: vi.fn(),
    summary: vi.fn(),
}));

vi.mock('../repositories/collection.repository', () => ({
    CollectionRepository: { findAll, count, summary },
}));

import { CollectionController } from './collection.controller';

function fakeReq(query: Record<string, unknown> = {}) {
    return { params: {}, body: {}, query, orgId: 'org-A' } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

/** Una fila tal y como la devuelve Prisma, con lo que la lista necesita. */
const fila = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    invoiceNumber: 'F-001',
    status: 'SENT',
    dueDate: new Date('2026-08-30T00:00:00.000Z'),
    paidAt: null,
    total: 1200,
    currency: 'USD',
    contact: { id: 'c-1', name: 'Constructora Andina', email: 'a@b.c', phone: '+56 9', company: 'Andina' },
    project: { id: 'p-1', name: 'Portal' },
    items: [{ id: 'i-1', description: 'Suscripción SaaS mensual', total: 1200 }],
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    findAll.mockResolvedValue([]);
    count.mockResolvedValue(0);
    summary.mockResolvedValue({
        dueThisMonth: 0, paidThisMonth: 0, overdue: 0, overdueAmount: 0, pendingAmount: 0,
    });
});

describe('CollectionController.index — paginación', () => {
    it('por defecto trae diez, que es lo que la página muestra', async () => {
        await CollectionController.index(fakeReq(), fakeRes());

        expect(findAll).toHaveBeenCalledWith('org-A', 0, 10, expect.anything(), expect.any(Date));
    });

    it('la página 3 con 25 por página salta las 50 anteriores', async () => {
        await CollectionController.index(fakeReq({ page: '3', limit: '25' }), fakeRes());

        expect(findAll).toHaveBeenCalledWith('org-A', 50, 25, expect.anything(), expect.any(Date));
    });

    it('un limit disparatado se recorta, para que nadie pida la tabla entera', async () => {
        await CollectionController.index(fakeReq({ limit: '99999' }), fakeRes());

        expect(findAll.mock.calls[0][2]).toBeLessThanOrEqual(100);
    });

    it('una página negativa no produce un skip negativo', async () => {
        await CollectionController.index(fakeReq({ page: '-4' }), fakeRes());

        expect(findAll.mock.calls[0][1]).toBe(0);
    });

    it('devuelve el total y el número de páginas del contador, no del array', async () => {
        findAll.mockResolvedValue([fila()]);
        count.mockResolvedValue(42);
        const res = fakeRes();

        await CollectionController.index(fakeReq({ limit: '10' }), res);

        expect(res.json.mock.calls[0][0].pagination).toMatchObject({
            page: 1, limit: 10, total: 42, pages: 5,
        });
    });
});

describe('CollectionController.index — aislamiento por organización', () => {
    it('pasa el orgId del request al repositorio, en la lista y en el contador', async () => {
        await CollectionController.index(fakeReq(), fakeRes());

        expect(findAll.mock.calls[0][0]).toBe('org-A');
        expect(count.mock.calls[0][0]).toBe('org-A');
    });
});

describe('CollectionController.index — forma de cada fila', () => {
    it('añade el estado de cobranza, que no existe como columna', async () => {
        findAll.mockResolvedValue([fila()]);
        const res = fakeRes();

        await CollectionController.index(fakeReq(), res);

        expect(res.json.mock.calls[0][0].data[0].collectionStatus).toBe('DUE');
    });

    it('resume el servicio con la primera línea de la factura', async () => {
        findAll.mockResolvedValue([fila()]);
        const res = fakeRes();

        await CollectionController.index(fakeReq(), res);

        expect(res.json.mock.calls[0][0].data[0].service).toBe('Suscripción SaaS mensual');
    });

    it('sin líneas cae al nombre del proyecto antes que dejarlo vacío', async () => {
        findAll.mockResolvedValue([fila({ items: [] })]);
        const res = fakeRes();

        await CollectionController.index(fakeReq(), res);

        expect(res.json.mock.calls[0][0].data[0].service).toBe('Portal');
    });

    it('no expone la factura entera: sólo lo que la lista pinta', async () => {
        findAll.mockResolvedValue([fila()]);
        const res = fakeRes();

        await CollectionController.index(fakeReq(), res);
        const row = res.json.mock.calls[0][0].data[0];

        expect(row).not.toHaveProperty('items');
        expect(row.contact.name).toBe('Constructora Andina');
    });
});

describe('CollectionController.index — filtros', () => {
    it('traslada el estado de cobranza al repositorio', async () => {
        await CollectionController.index(fakeReq({ status: 'OVERDUE' }), fakeRes());

        expect(findAll.mock.calls[0][3]).toMatchObject({ status: 'OVERDUE' });
    });

    it('ignora un estado que no existe en vez de filtrar por basura', async () => {
        await CollectionController.index(fakeReq({ status: 'MOROSO' }), fakeRes());

        expect(findAll.mock.calls[0][3].status).toBeUndefined();
    });
});

describe('CollectionController.summary', () => {
    it('devuelve las cifras del mes acotadas a la organización', async () => {
        summary.mockResolvedValue({
            dueThisMonth: 40, paidThisMonth: 10, overdue: 7, overdueAmount: 5000, pendingAmount: 9000,
        });
        const res = fakeRes();

        await CollectionController.summary(fakeReq(), res);

        expect(summary.mock.calls[0][0]).toBe('org-A');
        expect(res.json.mock.calls[0][0]).toMatchObject({ dueThisMonth: 40, paidThisMonth: 10, overdue: 7 });
    });
});
