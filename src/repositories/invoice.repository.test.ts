import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` se hoistea al inicio del archivo, así que los mocks vienen de `vi.hoisted()`.
const { invoiceCreate, invoiceUpdate, invoiceFindFirst, itemDeleteMany } = vi.hoisted(() => ({
    invoiceCreate: vi.fn(),
    invoiceUpdate: vi.fn(),
    invoiceFindFirst: vi.fn(),
    itemDeleteMany: vi.fn(),
}));

// `update` corre dentro de una transacción, así que el mock ejecuta el callback con un
// `tx` que expone lo mismo: si no, el cuerpo de la transacción nunca se llega a evaluar.
vi.mock('../config/prisma', () => {
    const client = {
        invoice: {
            create: invoiceCreate,
            update: invoiceUpdate,
            findFirst: invoiceFindFirst,
            findMany: vi.fn(),
            count: vi.fn(),
            delete: vi.fn(),
        },
        invoiceItem: { deleteMany: itemDeleteMany },
        $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
    };
    return { prisma: client };
});

import { InvoiceRepository } from './invoice.repository';

beforeEach(() => {
    vi.clearAllMocks();
    invoiceCreate.mockResolvedValue({ id: 'inv-1' });
    invoiceUpdate.mockResolvedValue({ id: 'inv-1' });
    invoiceFindFirst.mockResolvedValue(null);
});

/** Los datos con los que Prisma habría sido llamado en la última creación. */
const datosCreados = () => invoiceCreate.mock.calls[0][0].data;

describe('InvoiceRepository.create — importes', () => {
    it('guarda los importes calculados, no los que le manden', async () => {
        await InvoiceRepository.create({
            organizationId: 'org-1',
            tax: 19,
            items: [{ description: 'Plan', quantity: 2, unitPrice: 100 }],
        } as never);

        const data = datosCreados();
        expect(data.subtotal).toBe(200);
        expect(data.total).toBe(219);
        expect(data.items.create[0].total).toBe(200);
    });

    it('un total de línea inventado no llega a la base', async () => {
        await InvoiceRepository.create({
            organizationId: 'org-1',
            items: [{ description: 'Plan', quantity: 1, unitPrice: 10, total: 9999 }],
        } as never);

        expect(datosCreados().items.create[0].total).toBe(10);
        expect(datosCreados().total).toBe(10);
    });

    it('sin líneas, los importes son cero y no NaN', async () => {
        await InvoiceRepository.create({ organizationId: 'org-1' } as never);

        expect(datosCreados().subtotal).toBe(0);
        expect(datosCreados().total).toBe(0);
    });
});

describe('InvoiceRepository.update — importes', () => {
    it('recalcula al cambiar las líneas', async () => {
        await InvoiceRepository.update(
            'inv-1',
            { tax: 0, items: [{ description: 'A', quantity: 3, unitPrice: 30 }] } as never,
        );

        const data = invoiceUpdate.mock.calls[0][0].data;
        expect(data.subtotal).toBe(90);
        expect(data.total).toBe(90);
    });
});
