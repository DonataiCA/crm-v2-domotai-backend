import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create, update, findById } = vi.hoisted(() => ({
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
}));

vi.mock('../repositories/invoice.repository', () => ({
    InvoiceRepository: { create, update, findById, findAll: vi.fn(), count: vi.fn() },
}));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));

import { InvoiceController } from './invoice.controller';

function fakeReq(over: Record<string, unknown> = {}) {
    return { params: {}, body: {}, query: {}, orgId: 'org-A', userId: 'user-1', ...over } as never;
}

function fakeRes() {
    const res: Record<string, ReturnType<typeof vi.fn>> = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'inv-1' });
    update.mockResolvedValue({ id: 'inv-1' });
    findById.mockResolvedValue({ id: 'inv-1' });
});

/**
 * Prisma 6 no acepta una fecha en cadena: responde `premature end of input. Expected
 * ISO-8601 DateTime`, que llega al cliente como un 500 opaco y parece un fallo del
 * endpoint. La conversión toca hacerla aquí, que es donde se conoce el formato de entrada.
 */
describe('InvoiceController.create — fechas', () => {
    it('convierte dueDate en Date antes de llegar a Prisma', async () => {
        await InvoiceController.create(fakeReq({ body: { dueDate: '2026-09-15' } }), fakeRes());

        expect(create.mock.calls[0][0].dueDate).toBeInstanceOf(Date);
    });

    it('convierte también issueDate y paidAt', async () => {
        await InvoiceController.create(
            fakeReq({ body: { issueDate: '2026-09-01', paidAt: '2026-09-20' } }),
            fakeRes(),
        );

        expect(create.mock.calls[0][0].issueDate).toBeInstanceOf(Date);
        expect(create.mock.calls[0][0].paidAt).toBeInstanceOf(Date);
    });

    it('una fecha ausente sigue ausente, no se convierte en la de hoy', async () => {
        await InvoiceController.create(fakeReq({ body: { contactId: 'c-1' } }), fakeRes());

        expect(create.mock.calls[0][0].dueDate).toBeUndefined();
    });

    it('una fecha nula se mantiene nula', async () => {
        await InvoiceController.create(fakeReq({ body: { dueDate: null } }), fakeRes());

        expect(create.mock.calls[0][0].dueDate).toBeNull();
    });

    it('el orgId sale del request, no del cuerpo', async () => {
        await InvoiceController.create(fakeReq({ body: { organizationId: 'otra' } }), fakeRes());

        expect(create.mock.calls[0][0].organizationId).toBe('org-A');
    });
});

describe('InvoiceController.update — fechas', () => {
    it('convierte dueDate igual que el alta', async () => {
        await InvoiceController.update(
            fakeReq({ params: { id: 'inv-1' }, body: { dueDate: '2026-10-01' } }),
            fakeRes(),
        );

        expect(update.mock.calls[0][1].dueDate).toBeInstanceOf(Date);
    });
});
