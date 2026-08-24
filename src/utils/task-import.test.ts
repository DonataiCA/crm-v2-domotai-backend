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

    it('avisa de un área que no existe y coloca la tarea en la primera fase', () => {
        const result = resolveTemplateTasks([task({ phaseName: 'Marketing' })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].phaseId).toBe('phase-backend');
        expect(result.warnings).toEqual([
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

    it('avisa de alguien que no es miembro y deja la tarea sin asignar', () => {
        const result = resolveTemplateTasks([task({ assigneeName: 'Ana' })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].assignedTo).toBeNull();
        expect(result.warnings).toEqual([
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

        // Lo que importa sigue siendo que NO se le asigne a David Altuve por parecido.
        expect(result.tasks[0].assignedTo).toBeNull();
        expect(result.warnings[0].message).toBe(IMPORT_MESSAGES.unknownAssignee('David'));
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
        // Un título duplicado sí detiene esa tarea: no debe gastar su hueco.
        const result = resolveTemplateTasks(
            [
                task({ title: 'A' }),
                task({ title: 'B' }),
                task({ title: 'C' }),
            ],
            context({ existingTitles: ['B'] }),
        );

        expect(result.tasks.map(t => t.orderIndex)).toEqual([0, 1]);
        expect(result.tasks.map(t => t.title)).toEqual(['A', 'C']);
    });
});

describe('resolveTemplateTasks — acumulación de problemas', () => {
    it('acumula los avisos de todas las tareas, no sólo el de la primera', () => {
        const result = resolveTemplateTasks(
            [
                task({ title: 'A', phaseName: 'Marketing', line: 3 }),
                task({ title: 'B', assigneeName: 'Nadie', line: 9 }),
                task({ title: 'C', line: 15 }),
            ],
            context(),
        );

        expect(result.warnings.map(i => i.line)).toEqual([3, 9]);
        expect(result.tasks.map(t => t.title)).toEqual(['A', 'B', 'C']);
    });

    it('acumula los errores de todas las tareas cuando los hay', () => {
        const result = resolveTemplateTasks(
            [
                task({ title: 'A', line: 3 }),
                task({ title: 'B', line: 9 }),
            ],
            context({ existingTitles: ['A', 'B'] }),
        );

        expect(result.issues.map(i => i.line)).toEqual([3, 9]);
        expect(result.tasks).toEqual([]);
    });
});

describe('resolveTemplateTasks — área y responsable desconocidos no bloquean', () => {
    /**
     * Un archivo escrito por otra IA acierta el formato pero no puede acertar los nombres
     * propios de este proyecto. Rechazar el archivo entero por eso obligaba a un ciclo de
     * corrección a mano que es justo lo que la importación venía a evitar. Ahora la tarea
     * se crea colocada donde se pueda y el ajuste se avisa, que es reversible desde el
     * tablero en dos clics.
     */
    it('coloca en la primera fase una tarea cuya área no existe, y lo avisa', () => {
        const result = resolveTemplateTasks([task({ phaseName: 'Área Inventada' })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].phaseId).toBe('phase-backend');
        expect(result.warnings).toContainEqual({
            line: 10,
            taskTitle: 'Una tarea',
            message: IMPORT_MESSAGES.unknownPhase('Área Inventada', ['Backend Development', 'Testing & QA']),
        });
    });

    it('deja sin asignar a un responsable que no es miembro, y lo avisa', () => {
        const result = resolveTemplateTasks([task({ assigneeName: 'Fulano de Tal' })], context());

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].assignedTo).toBeNull();
        expect(result.warnings).toContainEqual({
            line: 10,
            taskTitle: 'Una tarea',
            message: IMPORT_MESSAGES.unknownAssignee('Fulano de Tal'),
        });
    });

    it('no avisa de nada cuando todo se resuelve', () => {
        const result = resolveTemplateTasks([task({ assigneeName: 'Ana Pérez' })], context());

        expect(result.warnings).toEqual([]);
        expect(result.tasks[0].assignedTo).toBe('profile-ana');
    });

    /** Sin fases no hay dónde colocar la tarea: eso sigue siendo un error, no un aviso. */
    it('sigue rechazando el archivo si el proyecto no tiene ninguna área', () => {
        const result = resolveTemplateTasks([task()], context({ phases: [] }));

        expect(result.tasks).toEqual([]);
        expect(result.issues[0].message).toBe(IMPORT_MESSAGES.noPhases);
    });

    /** Un título repetido crearía un duplicado silencioso: sigue bloqueando. */
    it('sigue rechazando una tarea cuyo título ya existe en el proyecto', () => {
        const result = resolveTemplateTasks(
            [task()],
            context({ existingTitles: ['Una tarea'] }),
        );

        expect(result.tasks).toEqual([]);
        expect(result.issues[0].message).toBe(IMPORT_MESSAGES.existingTitle('Una tarea'));
    });
});
