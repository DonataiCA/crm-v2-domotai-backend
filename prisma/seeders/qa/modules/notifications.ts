import { PrismaClient } from '@prisma/client';
import { qaId } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_SALES_2, P_FREELANCER, P_BETA_ADMIN, USERS } from '../core';
import { PR_PORTAL, PT_EN_CURSO, PT_VENCIDA } from './projects';
import { TK_VENCIDA } from './tasks';

/**
 * Notificaciones y preferencias.
 *
 * Aviso: el modelo Notification NO tiene campo de destinatario (hallazgo A-1
 * de la auditoría), solo organizationId y actorId. Por eso todas estas
 * notificaciones las verá cualquier miembro de la organización A. El seed lo
 * hace evidente a propósito: si algún día se añade `recipientId`, este módulo
 * es el que debe cambiar.
 */
export async function seedNotifications(prisma: PrismaClient): Promise<string> {
    const ahora = Date.now();
    const HORA = 3600000;

    const rows = [
        {
            key: 'asignada-1', type: 'PROJECT_TASK_ASSIGNED', read: false, h: 1,
            title: 'Nueva tarea asignada: Autenticación y gestión de sesión',
            body: 'Se te ha asignado una tarea en Portal de clientes Andina',
            entityType: 'ProjectTask', entityId: PT_EN_CURSO, actorId: P_ADMIN,
            metadata: { projectId: PR_PORTAL, taskId: PT_EN_CURSO, projectName: 'Portal de clientes Andina' },
        },
        {
            key: 'comentario-1', type: 'TASK_COMMENT', read: false, h: 3,
            title: 'Nuevo comentario en: Descarga de documentos desde S3',
            body: '¿Podemos incluir también los planos en PDF? Gracias.',
            entityType: 'ProjectTask', entityId: qaId('ptask:documentos'), actorId: null,
            metadata: { projectId: PR_PORTAL, taskId: qaId('ptask:documentos') },
        },
        {
            key: 'vencimiento-1', type: 'TASK_DUE_SOON', read: false, h: 5,
            title: 'Tarea vencida: Tablero de avance de obra',
            body: 'La fecha límite pasó hace 6 días',
            entityType: 'ProjectTask', entityId: PT_VENCIDA, actorId: null,
            metadata: { projectId: PR_PORTAL, taskId: PT_VENCIDA },
        },
        {
            key: 'lead-asignado', type: 'LEAD_ASSIGNED', read: true, h: 26,
            title: 'Lead asignado: Oportunidad Propuesta',
            body: 'Sergio Comercial te asignó un lead',
            entityType: 'Lead', entityId: qaId('lead:propuesta'), actorId: P_SALES_1,
            metadata: { leadId: qaId('lead:propuesta') },
        },
        {
            key: 'etapa', type: 'LEAD_STAGE_CHANGE', read: true, h: 50,
            title: 'Lead movido a Ganado: Oportunidad Ganado',
            body: 'De Negociación a Ganado',
            entityType: 'Lead', entityId: qaId('lead:ganado'), actorId: P_SALES_1,
            metadata: { leadId: qaId('lead:ganado'), oldStage: 'Negociación', newStage: 'Ganado' },
        },
        {
            key: 'factura', type: 'INVOICE_SENT', read: true, h: 120,
            title: 'Factura QA-2026-002 enviada',
            body: 'Enviada a Patricia Rojas',
            entityType: 'Invoice', entityId: qaId('invoice:al-dia'), actorId: P_ADMIN,
            metadata: { invoiceNumber: 'QA-2026-002' },
        },
        {
            key: 'tarea-comercial', type: 'TASK_ASSIGNED', read: false, h: 8,
            title: 'Nueva tarea asignada: Enviar propuesta revisada a Andina',
            body: 'Vence hoy',
            entityType: 'Task', entityId: TK_VENCIDA, actorId: P_ADMIN,
            metadata: { taskId: TK_VENCIDA },
        },
    ];

    for (const n of rows) {
        const { key, h, ...data } = n;
        await prisma.notification.upsert({
            where: { id: qaId(`notif:${key}`) },
            update: { read: data.read },
            create: {
                id: qaId(`notif:${key}`), ...data,
                organizationId: ORG_A,
                readAt: data.read ? new Date(ahora - h * HORA + 600000) : null,
                emailSent: data.read,
                createdAt: new Date(ahora - h * HORA),
            },
        });
    }

    await prisma.notification.upsert({
        where: { id: qaId('notif:beta') },
        update: {},
        create: {
            id: qaId('notif:beta'), organizationId: ORG_B, type: 'TASK_ASSIGNED',
            title: 'Notificación de Contoso (org B)', read: false, actorId: P_BETA_ADMIN,
        },
    });

    // ── Preferencias por usuario ────────────────────────────────────────────
    // Nota: NotificationPreference.userId mezcla User.id y Profile.id según la
    // ruta que la escriba (hallazgo M-7). Aquí se usa User.id, que es lo que
    // guarda el controlador desde `(req as any).userId`.
    const tipos = ['TASK_ASSIGNED', 'PROJECT_TASK_ASSIGNED', 'TASK_COMMENT', 'TASK_DUE_SOON', 'LEAD_ASSIGNED', 'LEAD_STAGE_CHANGE'];
    let prefs = 0;
    for (const u of USERS.filter(x => x.role !== 'client')) {
        const userId = qaId(`user:${u.email}`);
        for (const t of tipos) {
            // El freelancer desactiva los correos de comentarios, para probar
            // que notify() respeta la preferencia y omite el envío.
            const enabled = !(u.profileId === P_FREELANCER && t === 'TASK_COMMENT');
            await prisma.notificationPreference.upsert({
                where: { id: qaId(`pref:${u.email}:${t}`) },
                update: { enabled },
                create: {
                    id: qaId(`pref:${u.email}:${t}`), userId,
                    notificationType: t, channel: 'EMAIL', enabled,
                },
            });
            prefs++;
        }
    }

    return `${rows.length} notificaciones en org A (4 sin leer) + 1 en org B · ${prefs} preferencias (1 desactivada)`;
}
