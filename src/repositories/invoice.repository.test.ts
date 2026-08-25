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

describe('InvoiceRepository.create — número correlativo', () => {
    it('asigna el siguiente al último de la organización', async () => {
        invoiceFindFirst.mockResolvedValue({ invoiceNumber: '2026-0007' });

        await InvoiceRepository.create({ organizationId: 'org-1' } as never);

        expect(datosCreados().invoiceNumber).toBe('2026-0008');
    });

    it('empieza en 0001 cuando la organización no tiene ninguna de este año', async () => {
        invoiceFindFirst.mockResolvedValue(null);

        await InvoiceRepository.create({ organizationId: 'org-1' } as never);

        expect(datosCreados().invoiceNumber).toMatch(/^\d{4}-0001$/);
    });

    it('respeta el número que venga dado', async () => {
        await InvoiceRepository.create({ organizationId: 'org-1', invoiceNumber: 'A-1' } as never);

        expect(datosCreados().invoiceNumber).toBe('A-1');
        expect(invoiceFindFirst).not.toHaveBeenCalled();
    });

    /** Numerar mirando toda la plataforma filtraría facturas de otros clientes. */
    it('busca el último dentro de su organización y de su año', async () => {
        invoiceFindFirst.mockResolvedValue(null);

        await InvoiceRepository.create({ organizationId: 'org-1' } as never);

        const where = invoiceFindFirst.mock.calls[0][0].where;
        expect(where.organizationId).toBe('org-1');
        expect(where.invoiceNumber.startsWith).toBe(`${new Date().getFullYear()}-`);
    });

    it('rellena a cuatro cifras, para que ordenen como texto', async () => {
        invoiceFindFirst.mockResolvedValue({ invoiceNumber: '2026-0099' });

        await InvoiceRepository.create({ organizationId: 'org-1' } as never);

        expect(datosCreados().invoiceNumber).toBe('2026-0100');
    });
});
