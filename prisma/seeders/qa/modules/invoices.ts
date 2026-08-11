import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_BETA_ADMIN } from '../core';
import { CT_ROJAS, CT_MENA, CT_SIN_EMAIL, CT_BETA } from './contacts';
import { PR_PORTAL, PR_APP, PR_BETA } from './projects';

/**
 * Una factura por cada tramo del informe de antigüedad (getAging):
 * al día, 1-30, 31-60 y 61+ días de mora. Así el reporte muestra los cuatro
 * cubos poblados y se puede validar el corte de cada uno.
 */
export async function seedInvoices(prisma: PrismaClient): Promise<string> {
    const facturas = [
        {
            key: 'pagada', invoiceNumber: 'QA-2026-001', status: 'PAID',
            contactId: CT_ROJAS, projectId: PR_PORTAL,
            issueDate: daysAgo(70), dueDate: daysAgo(40), paidAt: daysAgo(38),
            paymentMethod: 'transfer', subtotal: 15000, tax: 2850, total: 17850,
            notes: 'Primer hito del portal.',
            items: [
                { description: 'Fase de descubrimiento', quantity: 1, unitPrice: 6000 },
                { description: 'Fase de diseño', quantity: 1, unitPrice: 9000 },
            ],
        },
        {
            key: 'al-dia', invoiceNumber: 'QA-2026-002', status: 'SENT',
            contactId: CT_ROJAS, projectId: PR_PORTAL,
            issueDate: daysAgo(5), dueDate: daysFromNow(25), paidAt: null,
            paymentMethod: null, subtotal: 12000, tax: 2280, total: 14280,
            notes: 'Segundo hito. Vence dentro de plazo → cubo "al día".',
            items: [{ description: 'Fase de desarrollo (50%)', quantity: 1, unitPrice: 12000 }],
        },
        {
            key: 'mora-30', invoiceNumber: 'QA-2026-003', status: 'SENT',
            contactId: CT_MENA, projectId: PR_APP,
            issueDate: daysAgo(45), dueDate: daysAgo(15), paidAt: null,
            paymentMethod: null, subtotal: 8000, tax: 1520, total: 9520,
            notes: '15 días de mora → cubo 1-30.',
            items: [{ description: 'Anticipo app móvil', quantity: 1, unitPrice: 8000 }],
        },
        {
            key: 'mora-60', invoiceNumber: 'QA-2026-004', status: 'SENT',
            contactId: CT_MENA, projectId: null,
            issueDate: daysAgo(80), dueDate: daysAgo(45), paidAt: null,
            paymentMethod: null, subtotal: 4200, tax: 798, total: 4998,
            notes: '45 días de mora → cubo 31-60.',
            items: [{ description: 'Consultoría técnica', quantity: 14, unitPrice: 300 }],
        },
        {
            key: 'mora-90', invoiceNumber: 'QA-2026-005', status: 'SENT',
            contactId: CT_ROJAS, projectId: null,
            issueDate: daysAgo(140), dueDate: daysAgo(100), paidAt: null,
            paymentMethod: null, subtotal: 2500, tax: 475, total: 2975,
            notes: '100 días de mora → cubo 61+. Debe destacar en el informe.',
            items: [{ description: 'Soporte extraordinario', quantity: 10, unitPrice: 250 }],
        },
        {
            key: 'borrador', invoiceNumber: 'QA-2026-006', status: 'DRAFT',
            contactId: CT_ROJAS, projectId: PR_PORTAL,
            issueDate: null, dueDate: null, paidAt: null,
            paymentMethod: null, subtotal: 12000, tax: 2280, total: 14280,
            notes: 'Borrador sin fechas. No debe aparecer en antigüedad.',
            items: [{ description: 'Fase de desarrollo (50% restante)', quantity: 1, unitPrice: 12000 }],
        },
        {
            // Caso límite: el contacto no tiene email. "Enviar por correo"
            // debe devolver 400 con mensaje claro, no reventar.
            key: 'sin-email', invoiceNumber: 'QA-2026-007', status: 'DRAFT',
            contactId: CT_SIN_EMAIL, projectId: null,
            issueDate: daysAgo(2), dueDate: daysFromNow(28), paidAt: null,
            paymentMethod: null, subtotal: 500, tax: 95, total: 595,
            notes: 'Contacto sin email: probar el envío por correo.',
            items: [{ description: 'Servicio menor', quantity: 1, unitPrice: 500 }],
        },
    ];

    for (const f of facturas) {
        const id = qaId(`invoice:${f.key}`);
        const { items, key, ...data } = f;

        await prisma.invoice.upsert({
            where: { id },
            update: { status: data.status, dueDate: data.dueDate, paidAt: data.paidAt },
            create: { id, ...data, currency: 'USD', createdBy: P_ADMIN, organizationId: ORG_A },
        });

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            await prisma.invoiceItem.upsert({
                where: { id: qaId(`invoice-item:${key}:${i}`) },
                update: {},
                create: {
                    id: qaId(`invoice-item:${key}:${i}`), invoiceId: id,
                    description: it.description, quantity: it.quantity,
                    unitPrice: it.unitPrice, total: it.quantity * it.unitPrice,
                },
            });
        }
    }

    await prisma.invoice.upsert({
        where: { id: qaId('invoice:beta') },
        update: {},
        create: {
            id: qaId('invoice:beta'), invoiceNumber: 'CT-2026-001', status: 'SENT',
            contactId: CT_BETA, projectId: PR_BETA, issueDate: daysAgo(10),
            dueDate: daysFromNow(20), subtotal: 5000, tax: 950, total: 5950,
            currency: 'USD', createdBy: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    return `${facturas.length} en org A (1 por tramo de mora, 2 borradores) + 1 en org B`;
}
