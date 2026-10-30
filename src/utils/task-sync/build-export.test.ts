import { describe, it, expect } from 'vitest';
import { buildExport, exportFileName } from './build-export';
import { computeRev, TASK_SYNC_FORMAT, TASK_SYNC_VERSION } from './format';
import { makeState, EXPORTED_AT, EXPORTED_BY } from './fixtures.test-helpers';

describe('buildExport', () => {
    it('identifica el formato, la versión, el proyecto y quién exportó', () => {
        const doc = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        expect(doc.format).toBe(TASK_SYNC_FORMAT);
        expect(doc.version).toBe(TASK_SYNC_VERSION);
        expect(doc.exportedAt).toBe('2026-10-30T15:00:00.000Z');
        expect(doc.exportedBy).toEqual(EXPORTED_BY);
        expect(doc.project).toEqual({
            id: 'proj-1',
            name: 'Portal de clientes Andina',
            description: 'Portal web para clientes',
            status: 'IN_PROGRESS',
            startDate: '2026-09-15',
            endDate: '2026-12-14',
        });
        expect(doc.instructions.length).toBeGreaterThan(3);
    });

    it('incluye el catálogo de valores válidos para el agente', () => {
        const doc = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        expect(doc.catalog.statuses).toEqual(['TODO', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED']);
        expect(doc.catalog.priorities).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
        expect(doc.catalog.phases.map((p) => p.name)).toEqual(['Backend', 'Frontend']);
        expect(doc.catalog.members).toContainEqual({ name: 'Ana Pérez', email: 'ana@domotai.test', role: 'admin' });
        expect(doc.catalog.tags).toEqual(['API', 'UX']);
    });

    it('traduce ids a nombres legibles: área por nombre, responsable por email, tags por nombre', () => {
        const doc = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        const login = doc.tasks.find((t) => t.id === 't-login')!;
        expect(login).toMatchObject({
            title: 'Endpoint de login',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            phase: 'Backend',
            assignee: 'ana@domotai.test',
            startDate: '2026-09-15',
            dueDate: '2026-09-30',
            progress: 40,
            tags: ['API'],
            deliverables: [
                { id: 'd-1', title: 'Diseño del token', done: true },
                { id: 'd-2', title: 'Tests', done: false },
            ],
        });
        expect(login.rev).toBe(computeRev(makeState().tasks[0]));
    });

    it('añade el contexto de solo lectura: fechas, autor, horas y comentarios', () => {
        const doc = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        const login = doc.tasks.find((t) => t.id === 't-login')!;
        expect(login.readOnly).toEqual({
            createdAt: '2026-09-10T10:00:00.000Z',
            updatedAt: '2026-09-20T10:00:00.000Z',
            completedAt: null,
            createdBy: 'Ana Pérez',
            timeLoggedMinutes: 90,
            comments: [{ author: 'Luis Gómez', date: '2026-09-18T12:00:00.000Z', content: 'Falta el refresh' }],
        });
    });

    it('ordena por columna del Kanban (estado) y, dentro de ella, por orderIndex', () => {
        const state = makeState();
        state.tasks[1].orderIndex = 5; // "Pantalla de inicio" pasa detrás de "Menú lateral"
        const doc = buildExport(state, { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        expect(doc.tasks.map((t) => t.id)).toEqual(['t-menu', 't-home', 't-login']);
    });

    it('normaliza estados heredados en vez de exportar valores fuera de catálogo', () => {
        const state = makeState();
        state.tasks[1].status = null;
        state.tasks[2].priority = null;
        const doc = buildExport(state, { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        expect(doc.tasks.find((t) => t.id === 't-home')!.status).toBe('TODO');
        expect(doc.tasks.find((t) => t.id === 't-menu')!.priority).toBe('MEDIUM');
    });
});

describe('computeRev', () => {
    it('cambia si cambia un campo editable, una etiqueta o un entregable', () => {
        const base = makeState().tasks[0];
        const rev = computeRev(base);
        expect(computeRev({ ...base, status: 'COMPLETED' })).not.toBe(rev);
        expect(computeRev({ ...base, tagIds: ['tag-api', 'tag-ux'] })).not.toBe(rev);
        expect(computeRev({ ...base, deliverables: [{ ...base.deliverables[0], done: false }, base.deliverables[1]] })).not.toBe(rev);
    });

    it('no cambia por el orden en la columna ni por campos de solo lectura', () => {
        const base = makeState().tasks[0];
        const rev = computeRev(base);
        expect(computeRev({ ...base, orderIndex: 9, updatedAt: new Date(), timeLoggedMinutes: 500 })).toBe(rev);
        expect(computeRev({ ...base, tagIds: [...base.tagIds].reverse() })).toBe(rev);
    });
});

describe('exportFileName', () => {
    it('tasks-<slug del proyecto>-<fecha>.json, sin acentos ni espacios', () => {
        expect(exportFileName('Portal de clientes Andina', EXPORTED_AT)).toBe(
            'tasks-portal-de-clientes-andina-2026-10-30.json',
        );
        expect(exportFileName('App móvil / terreno (v2)', EXPORTED_AT)).toBe('tasks-app-movil-terreno-v2-2026-10-30.json');
        expect(exportFileName('¡¡¡', EXPORTED_AT)).toBe('tasks-proyecto-2026-10-30.json');
    });
});
