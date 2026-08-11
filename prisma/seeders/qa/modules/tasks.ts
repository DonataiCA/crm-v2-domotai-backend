import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_SALES_2, P_BETA_ADMIN } from '../core';
import { CT_ROJAS, CT_MENA } from './contacts';
import { CO_ANDINA } from './companies';
import { PR_PORTAL } from './projects';

export const TK_VENCIDA = qaId('task:vencida');
export const TK_CON_COMENTARIOS = qaId('task:con-comentarios');

/**
 * Tareas comerciales (modelo Task), distintas de las tareas de proyecto
 * (modelo ProjectTask). Marina Comercial recibe SOLO tareas de este tipo:
 * así el panel de Capacidad la muestra cargada mientras su detalle por
 * proyecto sale vacío, que es exactamente el bug reportado en la reunión.
 */
export async function seedTasks(prisma: PrismaClient): Promise<string> {
    const rows = [
        {
            id: TK_VENCIDA, title: 'Enviar propuesta revisada a Andina',
            description: 'Incluir el desglose de horas por fase que pidió Patricia.',
            status: 'TODO', priority: 'URGENT', progress: 0,
            dueDate: daysAgo(4), reminderDate: daysAgo(5),
            assignedTo: P_SALES_2, contactId: CT_ROJAS, companyId: CO_ANDINA,
            leadId: qaId('lead:propuesta'), projectId: null,
        },
        {
            id: TK_CON_COMENTARIOS, title: 'Preparar demo para Minera Norte',
            description: 'Demo de 30 minutos centrada en el módulo de reportes.',
            status: 'IN_PROGRESS', priority: 'HIGH', progress: 60,
            dueDate: daysFromNow(3), reminderDate: daysFromNow(2),
            assignedTo: P_SALES_2, contactId: CT_MENA, companyId: null,
            leadId: qaId('lead:negociacion'), projectId: null,
        },
        {
            id: qaId('task:sin-asignar'), title: 'Actualizar tarifario 2026',
            description: 'Revisar precios de referencia del mercado.',
            status: 'TODO', priority: 'LOW', progress: 0,
            dueDate: daysFromNow(25), reminderDate: null,
            assignedTo: null, contactId: null, companyId: null, leadId: null, projectId: null,
        },
        {
            id: qaId('task:completada'), title: 'Firmar NDA con Constructora Andina',
            description: 'Documento firmado y archivado.',
            status: 'COMPLETED', priority: 'MEDIUM', progress: 100,
            dueDate: daysAgo(30), reminderDate: null,
            assignedTo: P_SALES_1, contactId: CT_ROJAS, companyId: CO_ANDINA, leadId: null, projectId: null,
        },
        {
            id: qaId('task:sales2-extra'), title: 'Seguimiento semanal de cartera',
            description: 'Repasar los leads sin actividad en 14 días.',
            status: 'TODO', priority: 'MEDIUM', progress: 0,
            dueDate: daysFromNow(1), reminderDate: null,
            assignedTo: P_SALES_2, contactId: null, companyId: null, leadId: null, projectId: null,
        },
        {
            // Caso límite: tarea comercial atada a un proyecto. Es la "doble vía"
            // detectada en la auditoría (Task.projectId vs ProjectTask): sirve
            // para ver la inconsistencia en pantalla.
            id: qaId('task:hibrida'), title: 'Coordinar acta de entrega del portal',
            description: 'Tarea comercial asociada a un proyecto: convive con las tareas de proyecto.',
            status: 'TODO', priority: 'MEDIUM', progress: 20,
            dueDate: daysFromNow(15), reminderDate: null,
            assignedTo: P_SALES_1, contactId: CT_ROJAS, companyId: CO_ANDINA, leadId: null, projectId: PR_PORTAL,
        },
    ];

    for (const t of rows) {
        await prisma.task.upsert({
            where: { id: t.id },
            update: { status: t.status, dueDate: t.dueDate, progress: t.progress },
            create: { ...t, createdBy: P_ADMIN, organizationId: ORG_A },
        });
    }

    await prisma.task.upsert({
        where: { id: qaId('task:beta') },
        update: {},
        create: {
            id: qaId('task:beta'), title: 'Tarea comercial Contoso (org B)',
            status: 'TODO', priority: 'MEDIUM', assignedTo: P_BETA_ADMIN,
            createdBy: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    // ── Comentarios (uno con imágenes) ──────────────────────────────────────
    const comentarios = [
        { key: 'demo-1', taskId: TK_CON_COMENTARIOS, content: 'Preparé el guion. Falta cargar datos de ejemplo.', createdBy: P_SALES_2, imageUrls: [] as string[] },
        { key: 'demo-2', taskId: TK_CON_COMENTARIOS, content: 'Adjunto capturas del entorno de demo.', createdBy: P_ADMIN, imageUrls: ['https://example.test/captura-1.png', 'https://example.test/captura-2.png'] },
    ];
    for (const c of comentarios) {
        await prisma.taskComment.upsert({
            where: { id: qaId(`comment:${c.key}`) },
            update: {},
            create: {
                id: qaId(`comment:${c.key}`), taskId: c.taskId, organizationId: ORG_A,
                content: c.content, imageUrls: c.imageUrls, createdBy: c.createdBy,
            },
        });
    }

    // ── Enlaces ─────────────────────────────────────────────────────────────
    await prisma.taskLink.upsert({
        where: { id: qaId('link:demo-guion') },
        update: {},
        create: {
            id: qaId('link:demo-guion'), taskId: TK_CON_COMENTARIOS, organizationId: ORG_A,
            title: 'Guion de la demo', url: 'https://example.test/guion-demo',
            linkType: 'document', createdBy: P_SALES_2,
        },
    });

    return `${rows.length} en org A (1 vencida, 1 sin asignar, 1 híbrida con proyecto) + 1 en org B · ${comentarios.length} comentarios · 1 enlace`;
}
