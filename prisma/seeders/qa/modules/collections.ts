import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, P_ADMIN } from '../core';

/**
 * Cartera de clientes SaaS con su cobro mensual, para la página de cobranzas.
 *
 * Va aparte de `invoices.ts` porque persigue otra cosa: aquel siembra una factura por
 * cada tramo del informe de antigüedad, y este necesita **volumen y variedad** — sin
 * unas cuantas decenas no se puede ver si la paginación funciona ni si el "10/40" del
 * resumen cuadra.
 *
 * Las fechas se colocan a ambos lados del margen de gracia a propósito: hay cobros
 * vencidos ayer (que NO son morosos todavía) y vencidos hace una semana (que sí).
 *
 * Los clientes con `interval` tienen un **servicio recurrente** de verdad y sus cobros
 * quedan enlazados a él; los que llevan `null` son pagos únicos. Sin esa mezcla, la
 * columna "Type" de la página mostraría lo mismo en todas las filas y no probaría nada.
 */

/**
 * Clientes de la cartera. El nombre del plan es lo que la lista muestra como servicio, y
 * `interval` decide si el cobro nace de un servicio recurrente o es un pago único: sin
 * variedad, la columna "Type" mostraría lo mismo en todas las filas.
 */
const CARTERA: Array<{
    nombre: string;
    plan: string;
    importe: number;
    interval: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | null;
}> = [
    { nombre: 'Constructora Andina',      plan: 'Plan Profesional', importe: 890,  interval: 'MONTHLY' },
    { nombre: 'Minera Norte Grande',      plan: 'Plan Empresa', importe: 2400,     interval: 'MONTHLY' },
    { nombre: 'Retail Sur',               plan: 'Plan Básico', importe: 290,       interval: 'MONTHLY' },
    { nombre: 'Clínica Los Andes',        plan: 'Soporte trimestral', importe: 2400, interval: 'QUARTERLY' },
    { nombre: 'Transportes Bío Bío',      plan: 'Plan Básico', importe: 290,       interval: 'MONTHLY' },
    { nombre: 'Viñedos Casablanca',       plan: 'Licencia anual', importe: 9600,   interval: 'ANNUAL' },
    { nombre: 'Hotel Costanera',          plan: 'Plan Empresa', importe: 2400,     interval: 'MONTHLY' },
    { nombre: 'Colegio San Marcos',       plan: 'Plan Educación', importe: 2700,   interval: 'BIANNUAL' },
    { nombre: 'Logística Pacífico',       plan: 'Plan Profesional', importe: 890,  interval: 'MONTHLY' },
    { nombre: 'Inmobiliaria Cordillera',  plan: 'Soporte trimestral', importe: 6000, interval: 'QUARTERLY' },
    { nombre: 'Panificadora del Valle',   plan: 'Instalación inicial', importe: 1500, interval: null },
    { nombre: 'Astilleros del Sur',       plan: 'Auditoría puntual', importe: 3200, interval: null },
];

/**
 * Cómo queda cada cobro. `venceEn` es relativo a hoy: negativo, ya venció.
 * Con 5 días de gracia, -6 es el primer día de morosidad.
 */
const PLAN_DE_COBROS: Array<{ venceEn: number; pagado: boolean }> = [
    // Ya cobrados este mes → el numerador del "10/40".
    { venceEn: -20, pagado: true },
    { venceEn: -18, pagado: true },
    { venceEn: -15, pagado: true },
    { venceEn: -12, pagado: true },
    { venceEn: -10, pagado: true },
    // Vencidos pero dentro de la gracia: NO son morosos.
    { venceEn: -1, pagado: false },
    { venceEn: -3, pagado: false },
    { venceEn: -5, pagado: false },
    // Pasada la gracia: morosos.
    { venceEn: -6, pagado: false },
    { venceEn: -9, pagado: false },
    { venceEn: -25, pagado: false },
    // Aún no vencen.
    { venceEn: 3, pagado: false },
    { venceEn: 8, pagado: false },
    { venceEn: 14, pagado: false },
];

export async function seedCollections(prisma: PrismaClient): Promise<string> {
    let contactos = 0;
    let facturas = 0;
    let servicios = 0;

    for (const [i, cliente] of CARTERA.entries()) {
        const contactId = qaId(`collections:contact:${i}`);
        await prisma.contact.upsert({
            where: { id: contactId },
            update: {},
            create: {
                id: contactId,
                name: cliente.nombre,
                email: `contacto${i + 1}@${cliente.nombre.toLowerCase().replace(/[^a-z]+/g, '')}.test`,
                phone: `+56 9 5${String(i).padStart(3, '0')} 0000`,
                company: cliente.nombre,
                organizationId: ORG_A,
                createdBy: P_ADMIN,
            },
        });
        contactos++;

        // Los clientes con periodicidad tienen un servicio detrás; el resto son cobros
        // sueltos. `coveredUntil` se deja al final del último periodo sembrado para que
        // el estado sea coherente con las notas que ya existen.
        let subscriptionId: string | null = null;
        if (cliente.interval) {
            subscriptionId = qaId(`collections:subscription:${i}`);
            await prisma.serviceSubscription.upsert({
                where: { id: subscriptionId },
                update: { amount: cliente.importe, interval: cliente.interval },
                create: {
                    id: subscriptionId,
                    organizationId: ORG_A,
                    contactId,
                    serviceName: cliente.plan,
                    amount: cliente.importe,
                    currency: 'USD',
                    interval: cliente.interval,
                    startDate: daysAgo(90),
                    coveredUntil: daysFromNow(20),
                    createdBy: P_ADMIN,
                },
            });
            servicios++;
        }

        // Cada cliente toma un tramo distinto del plan, para que la cartera no quede
        // toda en el mismo estado.
        const cobros = PLAN_DE_COBROS.filter((_, j) => (i + j) % 3 !== 0);

        for (const [j, cobro] of cobros.entries()) {
            const invoiceId = qaId(`collections:invoice:${i}:${j}`);
            const dueDate = daysFromNow(cobro.venceEn);

            await prisma.invoice.upsert({
                where: { id: invoiceId },
                update: { status: cobro.pagado ? 'PAID' : 'SENT', dueDate },
                create: {
                    id: invoiceId,
                    invoiceNumber: `SAAS-${String(i + 1).padStart(2, '0')}-${String(j + 1).padStart(2, '0')}`,
                    organizationId: ORG_A,
                    contactId,
                    subscriptionId,
                    status: cobro.pagado ? 'PAID' : 'SENT',
                    issueDate: daysAgo(Math.abs(cobro.venceEn) + 15),
                    dueDate,
                    paidAt: cobro.pagado ? daysFromNow(cobro.venceEn - 1) : null,
                    paymentMethod: cobro.pagado ? 'transfer' : null,
                    subtotal: cliente.importe,
                    tax: 0,
                    total: cliente.importe,
                    currency: 'USD',
                    createdBy: P_ADMIN,
                    items: {
                        create: [{
                            description: cliente.plan,
                            quantity: 1,
                            unitPrice: cliente.importe,
                            total: cliente.importe,
                        }],
                    },
                },
            });
            facturas++;
        }
    }

    return `${contactos} clientes, ${servicios} servicios recurrentes, ${facturas} cobros`;
}
