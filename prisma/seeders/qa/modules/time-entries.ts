import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_FREELANCER, P_BETA_ADMIN } from '../core';
import { PR_PORTAL, PR_APP, PR_BETA, PT_EN_CURSO, PT_VENCIDA } from './projects';

/**
 * Entradas de tiempo. Alimentan tres pantallas a la vez:
 *  - Time Tracking (listado)
 *  - Capacidad (horas registradas en la semana en curso)
 *  - Financiero (el "gasto" se deriva de horas facturables × tarifa)
 *
 * Incluye un temporizador abierto (sin endTime) para probar el flujo de parar.
 */
export async function seedTimeEntries(prisma: PrismaClient): Promise<string> {
    function entry(
        key: string, userId: string, projectId: string | null, projectTaskId: string | null,
        daysBack: number, startHour: number, minutes: number, billable: boolean,
        rate: number | null, description: string,
    ) {
        const start = daysAgo(daysBack);
        start.setHours(startHour, 0, 0, 0);
        const end = new Date(start.getTime() + minutes * 60000);
        return {
            id: qaId(`time:${key}`), organizationId: ORG_A, userId, projectId, projectTaskId,
            taskId: null, description, startTime: start, endTime: end,
            durationMinutes: minutes, billable, hourlyRate: rate,
        };
    }

    const rows = [
        entry('free-1', P_FREELANCER, PR_PORTAL, PT_EN_CURSO, 1, 9, 210, true, 45, 'Implementación de login y refresh de sesión'),
        entry('free-2', P_FREELANCER, PR_PORTAL, PT_EN_CURSO, 1, 14, 150, true, 45, 'Pruebas de integración de autenticación'),
        entry('free-3', P_FREELANCER, PR_PORTAL, PT_VENCIDA, 2, 10, 240, true, 45, 'Maquetación del tablero de avance'),
        entry('free-4', P_FREELANCER, PR_APP, null, 3, 9, 180, true, 45, 'Caché local para modo sin conexión'),
        entry('admin-1', P_ADMIN, PR_PORTAL, null, 2, 11, 60, false, null, 'Reunión de seguimiento con el cliente'),
        entry('admin-2', P_ADMIN, PR_PORTAL, null, 4, 16, 90, false, null, 'Revisión de alcance y priorización'),
        entry('free-old', P_FREELANCER, PR_PORTAL, null, 20, 10, 300, true, 45, 'Trabajo de la fase de diseño (semana anterior)'),
    ];

    for (const r of rows) {
        await prisma.timeEntry.upsert({
            where: { id: r.id },
            update: { durationMinutes: r.durationMinutes, startTime: r.startTime, endTime: r.endTime },
            create: r,
        });
    }

    // Caso límite: temporizador en marcha. endTime y durationMinutes en null.
    // La UI debe mostrarlo corriendo y permitir detenerlo.
    const abiertoStart = new Date();
    abiertoStart.setHours(abiertoStart.getHours() - 2);
    await prisma.timeEntry.upsert({
        where: { id: qaId('time:abierto') },
        update: { startTime: abiertoStart, endTime: null, durationMinutes: null },
        create: {
            id: qaId('time:abierto'), organizationId: ORG_A, userId: P_FREELANCER,
            projectId: PR_PORTAL, projectTaskId: PT_EN_CURSO, taskId: null,
            description: 'Temporizador en marcha (sin cerrar)',
            startTime: abiertoStart, endTime: null, durationMinutes: null,
            billable: true, hourlyRate: 45,
        },
    });

    await prisma.timeEntry.upsert({
        where: { id: qaId('time:beta') },
        update: {},
        create: {
            id: qaId('time:beta'), organizationId: ORG_B, userId: P_BETA_ADMIN,
            projectId: PR_BETA, description: 'Trabajo Contoso (org B)',
            startTime: daysAgo(1), endTime: daysAgo(1), durationMinutes: 120,
            billable: true, hourlyRate: 60,
        },
    });

    return `${rows.length} cerradas + 1 temporizador abierto en org A + 1 en org B`;
}
