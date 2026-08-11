import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_SALES_2, P_BETA_ADMIN, PIPELINE_A, STAGES } from '../core';
import { CO_ANDINA, CO_NORTE, CO_BETA } from './companies';
import { CT_ROJAS, CT_MENA, CT_BETA } from './contacts';

export const LEAD_GANADO = qaId('lead:ganado');

export async function seedLeads(prisma: PrismaClient): Promise<string> {
    // Un lead por cada etapa del pipeline: el tablero kanban debe mostrar
    // todas las columnas pobladas y el dashboard comercial debe poder calcular
    // la proyección ponderada con al menos un lead en cada peso.
    const porEtapa = STAGES.map((s, i) => ({
        id: qaId(`lead:${s.key}`),
        name: `Oportunidad ${s.name}`,
        details: `Lead de prueba situado en la etapa "${s.name}" para validar el tablero y la proyección ponderada (peso ${s.weight}%).`,
        stage: s.name,
        price: 3000 + i * 2500,
        pricingType: 'flat',
        contactId: i % 2 === 0 ? CT_ROJAS : CT_MENA,
        companyId: i % 2 === 0 ? CO_ANDINA : CO_NORTE,
        assignedTo: i % 2 === 0 ? P_SALES_1 : P_SALES_2,
        nextFollowUp: daysFromNow(i + 2),
        converted: false,
        convertedAt: null as Date | null,
        deletedAt: null as Date | null,
    }));

    const extra = [
        {
            // Caso límite: precio recurrente. Los campos recurring* hoy se
            // pierden al crear por API (el validador los descarta con .strip()),
            // así que sembrarlos permite ver el comportamiento correcto esperado.
            id: qaId('lead:recurrente'),
            name: 'Soporte mensual Andina', details: 'Contrato recurrente de soporte. Prueba de pricingType=recurring.',
            stage: 'Negociación', price: 1200, pricingType: 'recurring',
            contactId: CT_ROJAS, companyId: CO_ANDINA, assignedTo: P_SALES_1,
            nextFollowUp: daysFromNow(5), converted: false, convertedAt: null, deletedAt: null,
        },
        {
            // Caso límite: archivado. Solo debe salir en /leads/archived.
            id: qaId('lead:archivado'),
            name: 'Oportunidad descartada 2025', details: 'Archivada para probar el filtro deletedAt.',
            stage: 'Perdido', price: 800, pricingType: 'flat',
            contactId: CT_MENA, companyId: CO_NORTE, assignedTo: P_SALES_2,
            nextFollowUp: null, converted: false, convertedAt: null, deletedAt: daysAgo(15),
        },
        {
            // Caso límite: sin contacto, sin empresa y sin responsable.
            id: qaId('lead:huerfano'),
            name: 'Lead entrante sin calificar', details: 'Llegó por formulario web, aún sin asignar.',
            stage: 'Nuevo', price: 0, pricingType: 'flat',
            contactId: null, companyId: null, assignedTo: null,
            nextFollowUp: null, converted: false, convertedAt: null, deletedAt: null,
        },
    ];

    const all = [...porEtapa, ...extra];
    for (const l of all) {
        await prisma.lead.upsert({
            where: { id: l.id },
            update: { stage: l.stage, deletedAt: l.deletedAt },
            create: {
                ...l, pipelineId: PIPELINE_A, createdBy: P_ADMIN, organizationId: ORG_A,
                ...(l.pricingType === 'recurring'
                    ? { recurringStartDate: daysAgo(30), recurringEndDate: daysFromNow(335) }
                    : {}),
            },
        });
    }

    // ── Historial de etapas del lead ganado ─────────────────────────────────
    // Permite comprobar el cálculo de duración por etapa.
    const recorrido = ['Nuevo', 'Contactado', 'Propuesta', 'Negociación', 'Ganado'];
    for (let i = 0; i < recorrido.length; i++) {
        const entered = daysAgo(40 - i * 8);
        const exited = i < recorrido.length - 1 ? daysAgo(40 - (i + 1) * 8) : null;
        await prisma.leadStageHistory.upsert({
            where: { id: qaId(`stage-history:ganado:${i}`) },
            update: {},
            create: {
                id: qaId(`stage-history:ganado:${i}`),
                leadId: LEAD_GANADO,
                stage: recorrido[i],
                enteredAt: entered,
                exitedAt: exited,
                durationSeconds: exited ? Math.round((exited.getTime() - entered.getTime()) / 1000) : null,
                createdBy: P_SALES_1,
            },
        });
    }

    // ── Eventos ─────────────────────────────────────────────────────────────
    const eventos = [
        { key: 'call', leadId: LEAD_GANADO, eventType: 'call', description: 'Llamada de descubrimiento, 35 min.' },
        { key: 'meeting', leadId: LEAD_GANADO, eventType: 'meeting', description: 'Reunión de presentación de propuesta.' },
        { key: 'email', leadId: qaId('lead:propuesta'), eventType: 'email', description: 'Enviada propuesta v2 con desglose por fases.' },
        { key: 'note', leadId: qaId('lead:negociacion'), eventType: 'note', description: 'Piden descuento del 10% por pago anticipado.' },
    ];
    for (const e of eventos) {
        await prisma.leadEvent.upsert({
            where: { id: qaId(`lead-event:${e.key}`) },
            update: {},
            create: {
                id: qaId(`lead-event:${e.key}`), leadId: e.leadId, organizationId: ORG_A,
                eventType: e.eventType, description: e.description, createdBy: P_SALES_1,
            },
        });
    }

    // ── Adjunto en un lead ──────────────────────────────────────────────────
    await prisma.fileLink.upsert({
        where: { id: qaId('file:lead-propuesta') },
        update: {},
        create: {
            id: qaId('file:lead-propuesta'), leadId: qaId('lead:propuesta'),
            title: 'Propuesta comercial v2.pdf', url: 'https://example.test/propuesta-v2.pdf',
            fileType: 'pdf', createdBy: P_SALES_1,
        },
    });

    // ── Espejo org B ────────────────────────────────────────────────────────
    await prisma.lead.upsert({
        where: { id: qaId('lead:beta') },
        update: {},
        create: {
            id: qaId('lead:beta'), name: 'Oportunidad Contoso (org B)', stage: 'Nuevo',
            price: 5000, contactId: CT_BETA, companyId: CO_BETA,
            pipelineId: qaId('pipeline:beta'), assignedTo: P_BETA_ADMIN,
            createdBy: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    return `${all.length} en org A (1 por etapa + recurrente, archivado y huérfano) + 1 en org B · ${recorrido.length} tramos de historial · ${eventos.length} eventos`;
}
