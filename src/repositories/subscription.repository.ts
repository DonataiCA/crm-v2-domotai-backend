import { prisma } from '../config/prisma';
import { addInterval, type BillingInterval } from '../constants/billing';
import { nextInvoiceNumber, type TransactionClient } from './invoice.repository';

/**
 * Servicios recurrentes: el compromiso de cobro, no el documento.
 *
 * Las notas que genera son `Invoice` normales — el modelo ya sirve como nota de cobro —,
 * enlazadas por `subscriptionId`.
 */

export interface NewSubscription {
    organizationId: string;
    contactId: string;
    projectId?: string | null;
    serviceName: string;
    amount: number;
    currency?: string | null;
    interval: BillingInterval;
    startDate: Date;
    notes?: string | null;
    createdBy?: string | null;
}

const subscriptionIncludes = {
    contact: { select: { id: true, name: true, email: true, phone: true, company: true } },
    project: { select: { id: true, name: true } },
};

export const SubscriptionRepository = {
    /**
     * Da de alta el servicio y emite su primer cobro **en una transacción**. Una
     * suscripción sin su primera nota es un servicio que nadie reclama, y una nota sin
     * su suscripción es un cobro huérfano que se repetiría al siguiente periodo.
     */
    createWithFirstInvoice: (data: NewSubscription, today: Date) =>
        prisma.$transaction(async (tx) => {
            const client = tx as unknown as typeof prisma;

            const subscription = await client.serviceSubscription.create({
                data: {
                    organizationId: data.organizationId,
                    contactId: data.contactId,
                    projectId: data.projectId ?? null,
                    serviceName: data.serviceName,
                    amount: data.amount,
                    currency: data.currency ?? 'USD',
                    interval: data.interval,
                    startDate: data.startDate,
                    notes: data.notes ?? null,
                    createdBy: data.createdBy ?? null,
                },
            });

            // La nota de un servicio es tan documento de cobro como cualquier otra: sin
            // número no se puede citar al reclamarla.
            const invoiceNumber = await nextInvoiceNumber(
                tx as unknown as TransactionClient,
                data.organizationId,
            );

            // El primer periodo vence el día en que arranca el servicio, y ese día es el
            // que fija el día de cobro de todos los siguientes.
            await client.invoice.create({
                data: {
                    invoiceNumber,
                    organizationId: data.organizationId,
                    contactId: data.contactId,
                    projectId: data.projectId ?? null,
                    subscriptionId: subscription.id,
                    // Nace exigible: un servicio contratado no es un borrador.
                    status: 'SENT',
                    issueDate: today,
                    dueDate: data.startDate,
                    subtotal: data.amount,
                    tax: 0,
                    total: data.amount,
                    currency: data.currency ?? 'USD',
                    createdBy: data.createdBy ?? null,
                    items: {
                        create: [{
                            description: data.serviceName,
                            quantity: 1,
                            unitPrice: data.amount,
                            total: data.amount,
                        }],
                    },
                },
            });

            // Ya está cubierto hasta el final de este periodo: es lo que impide volver a
            // emitirlo.
            return client.serviceSubscription.update({
                where: { id: subscription.id },
                data: { coveredUntil: addInterval(data.startDate, data.interval) },
                include: subscriptionIncludes,
            });
        }),

    /**
     * Cambia el plan de un servicio vivo. **`coveredUntil` no se toca**: lo ya emitido
     * sigue emitido y el calendario nuevo empieza donde acaba lo cubierto. Rehacer el
     * pasado obligaría a inventar abonos por lo ya facturado.
     */
    update: async (
        id: string,
        data: { interval?: BillingInterval; amount?: number; serviceName?: string },
        organizationId: string,
    ) => {
        const existing = await prisma.serviceSubscription.findFirst({
            where: { id, organizationId },
        });
        if (!existing) return null;

        return prisma.serviceSubscription.update({
            where: { id },
            data,
            include: subscriptionIncludes,
        });
    },

    /**
     * Da de baja el servicio. No anula las notas ya emitidas: el servicio se prestó y
     * esos cobros siguen siendo exigibles. Sólo impide que se generen nuevas.
     */
    cancel: async (id: string, organizationId: string, today: Date) => {
        const existing = await prisma.serviceSubscription.findFirst({
            where: { id, organizationId },
        });
        if (!existing) return null;

        return prisma.serviceSubscription.update({
            where: { id },
            data: { cancelledAt: today },
            include: subscriptionIncludes,
        });
    },

    findAll: (organizationId: string, skip: number, take: number) =>
        prisma.serviceSubscription.findMany({
            skip,
            take,
            where: { organizationId },
            // Lo más reciente primero; el id desempata para que las páginas no se solapen.
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            include: subscriptionIncludes,
        }),

    count: (organizationId: string) =>
        prisma.serviceSubscription.count({ where: { organizationId } }),
};
