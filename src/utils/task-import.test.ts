import { describe, it, expect } from 'vitest';
import { resolveTemplateTasks, IMPORT_MESSAGES, type ImportContext } from './task-import';
import type { ParsedTemplateTask } from './task-template';

/**
 * `resolveTemplateTasks` es el segundo tramo de la importación: convierte lo que el
 * usuario escribió (nombres de fase, nombres de persona) en las claves ajenas que espera
 * `ProjectTask`. Sigue siendo puro —recibe el contexto ya leído de la base— para poder
 * probar aquí todas las formas de fallar sin levantar Postgres.
 *
 * La regla de siempre: si algo no se puede resolver es un `issue` con su línea, nunca una
 * tarea que cae en la primera fase o se queda sin responsable.
 */

const task = (overrides: Partial<ParsedTemplateTask> = {}): ParsedTemplateTask => ({
    title: 'Una tarea',
    phaseName: 'Backend Development',
    assigneeName: null,
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    description: null,
    conclusion: null,
    line: 10,
    ...overrides,
});

const context = (overrides: Partial<ImportContext> = {}): ImportContext => ({
    phases: [
        { id: 'phase-backend', name: 'Backend Development', nextOrderIndex: 0 },
        { id: 'phase-qa', name: 'Testing & QA', nextOrderIndex: 0 },
    ],
    members: [
        { id: 'profile-ana', fullName: 'Ana Pérez', email: 'ana@domotai.com' },
        { id: 'profile-david', fullName: 'David Altuve', email: 'david@domotai.com' },
    ],
    existingTitles: [],
    ...overrides,
});

describe('resolveTemplateTasks — traducción de campos', () => {
    it('convierte una tarea completa en la fila que espera ProjectTask', () => {
        const result = resolveTemplateTasks(
            [
                task({
                    title: 'Configurar CI',
                    phaseName: 'Testing & QA',
                    assigneeName: 'David Altuve',
                    status: 'IN_PROGRESS',
                    priority: 'HIGH',
                    startDate: '2026-08-20',
                    dueDate: '2026-08-27',
                    description: 'Montar el pipeline.',
                    conclusion: 'Verde en main.',
                }),
            ],
            context(),
        );

        expect(result.issues).toEqual([]);
        expect(result.tasks).toEqual([
            {
                title: 'Configurar CI',
                phaseId: 'phase-qa',
                assignedTo: 'profile-david',
                status: 'IN_PROGRESS',
                priority: 'HIGH',
                startDate: new Date('2026-08-20T00:00:00.000Z'),
                dueDate: new Date('2026-08-27T00:00:00.000Z'),
                description: 'Montar el pipeline.',
                conclusion: 'Verde en main.',
                orderIndex: 0,
            },
        ]);
    });

    it('deja en null lo que la plantilla no traía', () => {
        const result = resolveTemplateTasks([task()], context());

        expect(result.tasks[0]).toMatchObject({
            assignedTo: null,
            startDate: null,
            dueDate: null,
            description: null,
            conclusion: null,
        });
    });
});

describe('resolveTemplateTasks — resolución del Área', () => {
    it.each([
        ['Backend Development', 'coincidencia exacta'],
        ['backend development', 'sin mayúsculas'],
        ['  Backend   Development  ', 'con espacios de sobra'],
    ])('resuelve "%s" (%s)', (phaseName) => {
        const result = resolveTemplateTasks([task({ phaseName })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].phaseId).toBe('phase-backend');
    });

    it('reporta un área que no existe en el proyecto, sin caer en la primera fase', () => {
        const result = resolveTemplateTasks([task({ phaseName: 'Marketing' })], context());

        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            {
                line: 10,
                taskTitle: 'Una tarea',
                message: IMPORT_MESSAGES.unknownPhase('Marketing', [
                    'Backend Development',
                    'Testing & QA',
                ]),
            },
        ]);
    });

    it('reporta un proyecto sin ninguna fase', () => {
        const result = resolveTemplateTasks([task()], context({ phases: [] }));

        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            { line: 1, message: IMPORT_MESSAGES.noPhases },
        ]);
    });
});

describe('resolveTemplateTasks — resolución del Responsable', () => {
    it.each([
        ['Ana Pérez', 'nombre completo'],
        ['ana pérez', 'sin mayúsculas'],
        ['Ana Perez', 'sin la tilde'],
        ['ana@domotai.com', 'por email'],
        ['ANA@DOMOTAI.COM', 'email en mayúsculas'],
    ])('resuelve "%s" (%s)', (assigneeName) => {
        const result = resolveTemplateTasks([task({ assigneeName })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].assignedTo).toBe('profile-ana');
    });

    it('reporta a alguien que no es miembro, sin dejar la tarea sin asignar', () => {
        const result = resolveTemplateTasks([task({ assigneeName: 'Ana' })], context());

        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            {
                line: 10,
                taskTitle: 'Una tarea',
                message: IMPORT_MESSAGES.unknownAssignee('Ana'),
            },
        ]);
    });

    it('no confunde a dos personas cuyo nombre empieza igual', () => {
        // El chat resuelve con un `includes` laxo; aquí la coincidencia es exacta.
        const result = resolveTemplateTasks(
            [task({ assigneeName: 'David' })],
            context(),
        );

        expect(result.issues[0].message).toBe(IMPORT_MESSAGES.unknownAssignee('David'));
    });
});

describe('resolveTemplateTasks — títulos que ya existen', () => {
    it('reporta una tarea cuyo título ya está en el proyecto', () => {
        const result = resolveTemplateTasks(
            [task({ title: 'Configurar CI' })],
            context({ existingTitles: ['configurar ci'] }),
        );

        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            {
                line: 10,
                taskTitle: 'Configurar CI',
                message: IMPORT_MESSAGES.existingTitle('Configurar CI'),
            },
        ]);
    });

    it('compara sin distinguir mayúsculas ni tildes', () => {
        const result = resolveTemplateTasks(
            [task({ title: 'Migración del schema' })],
            context({ existingTitles: ['MIGRACION DEL SCHEMA'] }),
        );

        expect(result.issues).toHaveLength(1);
    });
});

describe('resolveTemplateTasks — orderIndex', () => {
    it('apila las tareas al final de su fase, no encima de las que ya hay', () => {
        const result = resolveTemplateTasks(
            [
                task({ title: 'A', phaseName: 'Backend Development' }),
                task({ title: 'B', phaseName: 'Testing & QA' }),
                task({ title: 'C', phaseName: 'Backend Development' }),
            ],
            context({
                phases: [
                    { id: 'phase-backend', name: 'Backend Development', nextOrderIndex: 7 },
                    { id: 'phase-qa', name: 'Testing & QA', nextOrderIndex: 0 },
                ],
            }),
        );

        expect(result.tasks.map(t => [t.title, t.phaseId, t.orderIndex])).toEqual([
            ['A', 'phase-backend', 7],
            ['B', 'phase-qa', 0],
            ['C', 'phase-backend', 8],
        ]);
    });

    it('no consume un hueco de orden para una tarea que no se llega a crear', () => {
        const result = resolveTemplateTasks(
            [
                task({ title: 'A' }),
                task({ title: 'B', assigneeName: 'Nadie' }),
                task({ title: 'C' }),
            ],
            context(),
        );

        expect(result.tasks.map(t => t.orderIndex)).toEqual([0, 1]);
    });
});

describe('resolveTemplateTasks — acumulación de problemas', () => {
    it('reporta todos los problemas de una vez, no sólo el primero', () => {
        const result = resolveTemplateTasks(
            [
                task({ title: 'A', phaseName: 'Marketing', line: 3 }),
                task({ title: 'B', assigneeName: 'Nadie', line: 9 }),
                task({ title: 'C', line: 15 }),
            ],
            context(),
        );

        expect(result.issues.map(i => i.line)).toEqual([3, 9]);
        expect(result.tasks.map(t => t.title)).toEqual(['C']);
    });
});
