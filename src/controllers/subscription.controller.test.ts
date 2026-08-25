import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createWithFirstInvoice, findAll, count } = vi.hoisted(() => ({
    createWithFirstInvoice: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
}));

vi.mock('../repositories/subscription.repository', () => ({
    SubscriptionRepository: { createWithFirstInvoice, findAll, count },
}));

import { SubscriptionController } from './subscription.controller';

function fakeReq(over: Record<string, unknown> = {}) {
    return { params: {}, body: {}, query: {}, orgId: 'org-A', user: { profileId: 'profile-1' }, ...over } as never;
}

function fakeRes() {
    const res: Record<string, ReturnType<typeof vi.fn>> = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res as never;
}

const BODY = {
    contactId: 'contact-1',
    serviceName: 'Plan Profesional',
    amount: 890,
    interval: 'MONTHLY',
    startDate: '2026-09-01',
};

beforeEach(() => {
    vi.clearAllMocks();
    createWithFirstInvoice.mockResolvedValue({ id: 'sub-1' });
    findAll.mockResolvedValue([]);
    count.mockResolvedValue(0);
});

describe('SubscriptionController.create', () => {
    it('pasa el orgId del request, no el que venga en el cuerpo', async () => {
        await SubscriptionController.create(fakeReq({ body: { ...BODY, organizationId: 'otra' } }), fakeRes());

        expect(createWithFirstInvoice.mock.calls[0][0].organizationId).toBe('org-A');
    });

    it('registra quién lo creó con su profileId', async () => {
        await SubscriptionController.create(fakeReq({ body: BODY }), fakeRes());

        expect(createWithFirstInvoice.mock.calls[0][0].createdBy).toBe('profile-1');
    });

    /** Prisma 6 rechaza "2026-09-01": hay que convertirlo en el controlador. */
    it('convierte la fecha de inicio en Date', async () => {
        await SubscriptionController.create(fakeReq({ body: BODY }), fakeRes());

        expect(createWithFirstInvoice.mock.calls[0][0].startDate).toBeInstanceOf(Date);
    });

    it('responde 201 con la suscripción creada', async () => {
        const res = fakeRes();

        await SubscriptionController.create(fakeReq({ body: BODY }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0]).toMatchObject({ id: 'sub-1' });
    });

    it('un fallo del repositorio no se traga: responde 500', async () => {
        createWithFirstInvoice.mockRejectedValue(new Error('boom'));
        const res = fakeRes();

        await SubscriptionController.create(fakeReq({ body: BODY }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('SubscriptionController.index', () => {
    it('trae diez por defecto', async () => {
        await SubscriptionController.index(fakeReq(), fakeRes());

        expect(findAll).toHaveBeenCalledWith('org-A', 0, 10);
    });

    it('la página 3 con 25 salta las 50 anteriores', async () => {
        await SubscriptionController.index(fakeReq({ query: { page: '3', limit: '25' } }), fakeRes());

        expect(findAll).toHaveBeenCalledWith('org-A', 50, 25);
    });

    it('recorta un limit disparatado', async () => {
        await SubscriptionController.index(fakeReq({ query: { limit: '99999' } }), fakeRes());

        expect(findAll.mock.calls[0][2]).toBeLessThanOrEqual(100);
    });

    it('devuelve el total del contador, no el tamaño del array', async () => {
        findAll.mockResolvedValue([{ id: 'sub-1' }]);
        count.mockResolvedValue(42);
        const res = fakeRes();

        await SubscriptionController.index(fakeReq({ query: { limit: '10' } }), res);

        expect(res.json.mock.calls[0][0].pagination).toMatchObject({ total: 42, pages: 5 });
    });
});
