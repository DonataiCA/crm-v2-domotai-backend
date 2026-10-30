import type { SyncState } from './format';

/**
 * Estado de un proyecto pequeño, como lo leería `TaskSyncRepository.getSyncState`.
 * Lo comparten los tests de exportación, lectura y plan. Cada llamada devuelve una
 * copia nueva, así un test puede mutarla sin afectar al siguiente.
 */
export function makeState(): SyncState {
    return {
        project: {
            id: 'proj-1',
            name: 'Portal de clientes Andina',
            description: 'Portal web para clientes',
            status: 'IN_PROGRESS',
            startDate: new Date('2026-09-15T00:00:00.000Z'),
            endDate: new Date('2026-12-14T00:00:00.000Z'),
        },
        phases: [
            { id: 'ph-1', name: 'Backend', status: 'active', orderIndex: 0, startDate: null, endDate: null },
            { id: 'ph-2', name: 'Frontend', status: 'active', orderIndex: 1, startDate: null, endDate: null },
        ],
        members: [
            { id: 'prof-ana', fullName: 'Ana Pérez', email: 'ana@domotai.test', role: 'admin' },
            { id: 'prof-luis', fullName: 'Luis Gómez', email: 'luis@domotai.test', role: 'freelancer' },
        ],
        tags: [
            { id: 'tag-api', name: 'API' },
            { id: 'tag-ux', name: 'UX' },
        ],
        tasks: [
            {
                id: 't-login',
                title: 'Endpoint de login',
                description: 'JWT por usuario',
                conclusion: null,
                status: 'IN_PROGRESS',
                priority: 'HIGH',
                phaseId: 'ph-1',
                assignedTo: 'prof-ana',
                assigneeEmail: 'ana@domotai.test',
                startDate: new Date('2026-09-15T00:00:00.000Z'),
                dueDate: new Date('2026-09-30T00:00:00.000Z'),
                completedAt: null,
                progress: 40,
                orderIndex: 0,
                createdAt: new Date('2026-09-10T10:00:00.000Z'),
                updatedAt: new Date('2026-09-20T10:00:00.000Z'),
                creatorName: 'Ana Pérez',
                tagIds: ['tag-api'],
                deliverables: [
                    { id: 'd-1', title: 'Diseño del token', done: true, orderIndex: 0 },
                    { id: 'd-2', title: 'Tests', done: false, orderIndex: 1 },
                ],
                comments: [
                    { author: 'Luis Gómez', createdAt: new Date('2026-09-18T12:00:00.000Z'), content: 'Falta el refresh' },
                ],
                timeLoggedMinutes: 90,
            },
            {
                id: 't-home',
                title: 'Pantalla de inicio',
                description: null,
                conclusion: null,
                status: 'TODO',
                priority: 'MEDIUM',
                phaseId: 'ph-2',
                assignedTo: null,
                assigneeEmail: null,
                startDate: null,
                dueDate: null,
                completedAt: null,
                progress: 0,
                orderIndex: 0,
                createdAt: new Date('2026-09-11T10:00:00.000Z'),
                updatedAt: new Date('2026-09-11T10:00:00.000Z'),
                creatorName: null,
                tagIds: [],
                deliverables: [],
                comments: [],
                timeLoggedMinutes: 0,
            },
            {
                id: 't-menu',
                title: 'Menú lateral',
                description: null,
                conclusion: null,
                status: 'TODO',
                priority: 'LOW',
                phaseId: 'ph-2',
                assignedTo: 'prof-luis',
                assigneeEmail: 'luis@domotai.test',
                startDate: null,
                dueDate: null,
                completedAt: null,
                progress: 0,
                orderIndex: 1,
                createdAt: new Date('2026-09-12T10:00:00.000Z'),
                updatedAt: new Date('2026-09-12T10:00:00.000Z'),
                creatorName: null,
                tagIds: ['tag-ux'],
                deliverables: [],
                comments: [],
                timeLoggedMinutes: 0,
            },
        ],
        foreignTaskIds: [],
    };
}

export const EXPORTED_AT = new Date('2026-10-30T15:00:00.000Z');
export const EXPORTED_BY = { name: 'Ana Pérez', email: 'ana@domotai.test' };
