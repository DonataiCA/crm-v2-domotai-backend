import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` se hoistea, así que los mocks vienen de `vi.hoisted()`.
const { subCreate, subUpdate, subFindMany, subCount, invoiceCreate } = vi.hoisted(() => ({
    subCreate: vi.fn(),
    subUpdate: vi.fn(),
    subFindMany: vi.fn(),
    subCount: vi.fn(),
    invoiceCreate: vi.fn(),
}));

// El alta corre dentro de una transacción: el mock ejecuta el callback con un `tx` que
// expone lo mismo, o el cuerpo nunca llega a evaluarse.
vi.mock('../config/prisma', () => {
    const client = {
        serviceSubscription: {
            create: subCreate,
            update: subUpdate,
            findMany: subFindMany,
            count: subCount,
        },
        invoice: { create: invoiceCreate, findFirst: vi.fn().mockResolvedValue(null) },
        $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
    };
    return { prisma: client };
});

import { SubscriptionRepository } from './subscription.repository';

const HOY = new Date('2026-08-24T12:00:00.000Z');

const DATOS = {
    organizationId: 'org-1',
    contactId: 'contact-1',
    projectId: null,
    serviceName: 'Plan Profesional',
    amount: 890,
    currency: 'USD',
    interval: 'MONTHLY' as const,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    notes: null,
    createdBy: 'profile-1',
};

beforeEach(() => {
    vi.clearAllMocks();
    subCreate.mockResolvedValue({ id: 'sub-1', ...DATOS });
    subUpdate.mockResolvedValue({ id: 'sub-1' });
    invoiceCreate.mockResolvedValue({ id: 'inv-1' });
    subFindMany.mockResolvedValue([]);
    subCount.mockResolvedValue(0);
});

describe('SubscriptionRepository.createWithFirstInvoice', () => {
    it('crea la suscripción y su primera nota en la misma transacción', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(subCreate).toHaveBeenCalled();
        expect(invoiceCreate).toHaveBeenCalled();
    });

    it('la primera nota vence en la fecha de inicio del servicio', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.dueDate).toEqual(DATOS.startDate);
    });

    it('la nota lleva el nombre del servicio como línea de detalle', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.items.create[0].description)
            .toBe('Plan Profesional');
    });

    it('la nota importa lo que dice el servicio', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.total).toBe(890);
    });

    it('la nota queda enlazada a su servicio', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.subscriptionId).toBe('sub-1');
    });

    it('la nota nace como enviada: es un cobro exigible, no un borrador', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.status).toBe('SENT');
    });

    it('deja coveredUntil al final del primer periodo', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(subUpdate.mock.calls[0][0].data.coveredUntil)
            .toEqual(new Date('2026-09-01T00:00:00.000Z'));
    });

    it('un servicio anual cubre hasta un año después', async () => {
        await SubscriptionRepository.createWithFirstInvoice(
            { ...DATOS, interval: 'ANNUAL' as const },
            HOY,
        );

        expect(subUpdate.mock.calls[0][0].data.coveredUntil)
            .toEqual(new Date('2027-08-01T00:00:00.000Z'));
    });
});

describe('SubscriptionRepository — aislamiento por organización', () => {
    it('el listado va acotado a su organización', async () => {
        await SubscriptionRepository.findAll('org-1', 0, 10);

        expect(subFindMany.mock.calls[0][0].where.organizationId).toBe('org-1');
    });

    it('el contador usa el mismo filtro que el listado', async () => {
        await SubscriptionRepository.findAll('org-1', 0, 10);
        await SubscriptionRepository.count('org-1');

        expect(subCount.mock.calls[0][0].where).toEqual(subFindMany.mock.calls[0][0].where);
    });

    it('pagina en la base, no en memoria', async () => {
        await SubscriptionRepository.findAll('org-1', 20, 10);

        expect(subFindMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    });
});

describe('SubscriptionRepository — la nota lleva número', () => {
    /**
     * La nota de un servicio es tan documento de cobro como cualquier otra: sin número
     * no se puede citar al reclamarla, y el PDF cae a los ocho primeros caracteres del id.
     */
    it('asigna correlativo a la primera nota', async () => {
        await SubscriptionRepository.createWithFirstInvoice(DATOS, HOY);

        expect(invoiceCreate.mock.calls[0][0].data.invoiceNumber).toMatch(/^\d{4}-\d{4}$/);
    });
});
