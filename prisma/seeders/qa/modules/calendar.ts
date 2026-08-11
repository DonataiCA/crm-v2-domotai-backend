import { PrismaClient } from '@prisma/client';
import { qaId, daysFromNow, daysAgo } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_BETA_ADMIN } from '../core';
import { CT_ROJAS, CT_MENA, CT_BETA } from './contacts';
import { PR_PORTAL, PR_APP, PR_BETA } from './projects';

/**
 * Eventos de calendario. Cubre las tres vinculaciones posibles (contacto,
 * lead y proyecto) más eventos sueltos, de día completo y con rango de varios
 * días, para verificar el pintado del mes.
 *
 * Contexto de la reunión: hoy el calendario SOLO muestra estos CalendarEvent.
 * Las fases y los vencimientos de tareas no entran, y se nota al comparar
 * este módulo con lo que hay en Proyectos.
 */
export async function seedCalendar(prisma: PrismaClient): Promise<string> {
    function at(daysOffset: number, hour: number, durationHours = 1) {
        const start = daysFromNow(daysOffset);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + durationHours * 3600000);
        return { startDate: start, endDate: end };
    }

    const rows = [
        {
            key: 'demo-norte', title: 'Demo con Minera Norte', ...at(3, 10, 1),
            allDay: false, color: '#8b5cf6', description: 'Demo del módulo de reportes.',
            contactId: CT_MENA, leadId: qaId('lead:negociacion'), projectId: null,
        },
        {
            key: 'seguimiento-andina', title: 'Seguimiento semanal Andina', ...at(1, 15, 1),
            allDay: false, color: '#0ea5e9', description: 'Revisión de avance del portal.',
            contactId: CT_ROJAS, leadId: null, projectId: PR_PORTAL,
        },
        {
            key: 'entrega-portal', title: 'Entrega beta del portal', ...at(20, 9, 2),
            allDay: false, color: '#10b981', description: 'Presentación de la versión beta.',
            contactId: CT_ROJAS, leadId: null, projectId: PR_PORTAL,
        },
        {
            key: 'planificacion-app', title: 'Planificación sprint app móvil', ...at(2, 9, 2),
            allDay: false, color: '#f59e0b', description: null,
            contactId: null, leadId: null, projectId: PR_APP,
        },
        {
            // Caso límite: día completo, sin hora.
            key: 'feriado', title: 'Feriado nacional', ...at(7, 0, 24),
            allDay: true, color: '#64748b', description: 'Oficina cerrada.',
            contactId: null, leadId: null, projectId: null,
        },
        {
            // Caso límite: evento de varios días, para el pintado del rango.
            key: 'congreso', title: 'Congreso de tecnología (3 días)',
            startDate: daysFromNow(12), endDate: daysFromNow(14),
            allDay: true, color: '#ef4444', description: 'Asiste el equipo comercial.',
            contactId: null, leadId: null, projectId: null,
        },
        {
            // Caso límite: evento pasado, para probar la navegación del mes.
            key: 'kickoff', title: 'Kickoff del portal (pasado)',
            startDate: daysAgo(45), endDate: daysAgo(45),
            allDay: false, color: '#0ea5e9', description: 'Reunión inicial.',
            contactId: CT_ROJAS, leadId: null, projectId: PR_PORTAL,
        },
    ];

    for (const r of rows) {
        const { key, ...data } = r;
        await prisma.calendarEvent.upsert({
            where: { id: qaId(`event:${key}`) },
            update: { startDate: data.startDate, endDate: data.endDate },
            create: {
                id: qaId(`event:${key}`), ...data,
                createdBy: key === 'demo-norte' ? P_SALES_1 : P_ADMIN,
                organizationId: ORG_A,
            },
        });
    }

    await prisma.calendarEvent.upsert({
        where: { id: qaId('event:beta') },
        update: {},
        create: {
            id: qaId('event:beta'), title: 'Reunión Contoso (org B)',
            startDate: daysFromNow(4), endDate: daysFromNow(4), allDay: false,
            contactId: CT_BETA, projectId: PR_BETA,
            createdBy: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    return `${rows.length} en org A (día completo, rango de 3 días, pasado) + 1 en org B`;
}
