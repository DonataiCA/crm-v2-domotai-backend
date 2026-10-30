import { describe, it, expect } from 'vitest';
import { buildExport } from './build-export';
import { parseSyncDocument } from './parse';
import { planSync, selectApplied, assignmentsByRecipient } from './plan';
import type { SyncState } from './format';
import { makeState, EXPORTED_AT, EXPORTED_BY } from './fixtures.test-helpers';

/** Exporta `state`, deja que `edit` toque el documento y planifica contra `against`. */
function roundTrip(edit: (doc: any) => void, against?: (state: SyncState) => void) {
    const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
    edit(doc);
    const parsed = parseSyncDocument(JSON.stringify(doc));
    expect(parsed.issues).toEqual([]);
    const state = makeState();
    against?.(state);
    return planSync(parsed.tasks, state);
}

const task = (doc: any, id: string) => doc.tasks.find((t: any) => t.id === id);

describe('planSync: ida y vuelta', () => {
    it('re-importar el export sin tocarlo no cambia nada', () => {
        const plan = roundTrip(() => {});
        expect(plan.issues).toEqual([]);
        expect(plan.warnings).toEqual([]);
        expect(plan.summary).toEqual({ creates: 0, updates: 0, deletes: 0, moves: 0, conflicts: 0, tagsToCreate: 0 });
    });
});

describe('planSync: actualizar', () => {
    it('detecta el cambio de estado, lo muestra antes → después y marca completedAt', () => {
        const plan = roundTrip((doc) => { task(doc, 't-login').status = 'COMPLETED'; });
        expect(plan.updates).toHaveLength(1);
        const update = plan.updates[0];
        expect(update).toMatchObject({ taskId: 't-login', title: 'Endpoint de login', conflict: false, completion: 'set' });
        expect(update.changes).toEqual([{ field: 'status', before: 'IN_PROGRESS', after: 'COMPLETED' }]);
        expect(update.data).toEqual({ status: 'COMPLETED' });
    });

    it('al salir de COMPLETED limpia completedAt', () => {
        const plan = roundTrip(
            (doc) => { task(doc, 't-home').status = 'TODO'; },
            (state) => {
                state.tasks[1].status = 'COMPLETED';
                state.tasks[1].completedAt = new Date('2026-10-01T00:00:00.000Z');
            },
        );
        // El export se hizo con TODO y el CRM ya tiene COMPLETED: el archivo no propone
        // cambios propios, así que no hay nada que aplicar ni conflicto.
        expect(plan.updates).toEqual([]);

        const reopened = roundTrip((doc) => {
            const t = task(doc, 't-login');
            t.status = 'TODO';
        }, (state) => {
            state.tasks[0].status = 'COMPLETED';
            state.tasks[0].completedAt = new Date('2026-10-01T00:00:00.000Z');
        });
        expect(reopened.updates[0]).toMatchObject({ completion: 'clear', conflict: true });
    });

    it('resuelve el área por nombre sin distinguir mayúsculas ni acentos', () => {
        const plan = roundTrip((doc) => { task(doc, 't-home').phase = 'backend'; });
        expect(plan.updates[0].data).toEqual({ phaseId: 'ph-1' });
        expect(plan.updates[0].changes).toEqual([{ field: 'phase', before: 'Frontend', after: 'Backend' }]);
    });

    it('un área que no existe bloquea la importación y lista las disponibles', () => {
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        task(doc, 't-home').phase = 'Diseño';
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, makeState());
        expect(plan.issues).toEqual([
            expect.objectContaining({ path: 'tasks[0].phase', taskTitle: 'Pantalla de inicio', message: expect.stringMatching(/Diseño.*Backend, Frontend/) }),
        ]);
    });

    it('un nombre de área repetido en el proyecto es ambiguo', () => {
        const state = makeState();
        state.phases.push({ id: 'ph-3', name: 'FRONTEND', status: 'active', orderIndex: 2, startDate: null, endDate: null });
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        task(doc, 't-login').phase = 'Frontend';
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, state);
        expect(plan.issues[0].message).toMatch(/ambig/i);
    });

    it('mantener el área actual no es ambiguo aunque su nombre esté repetido', () => {
        const plan = roundTrip(() => {}, (state) => {
            state.phases.push({ id: 'ph-3', name: 'Frontend', status: 'active', orderIndex: 2, startDate: null, endDate: null });
        });
        expect(plan.issues).toEqual([]);
    });

    it('resuelve el responsable por email, permite desasignar y rechaza a quien no es miembro', () => {
        const plan = roundTrip((doc) => {
            task(doc, 't-home').assignee = 'LUIS@domotai.test';
            task(doc, 't-menu').assignee = null;
        });
        expect(plan.updates.find((u) => u.taskId === 't-home')!.data).toEqual({ assignedTo: 'prof-luis' });
        expect(plan.updates.find((u) => u.taskId === 't-menu')!.data).toEqual({ assignedTo: null });

        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        task(doc, 't-home').assignee = 'nadie@otra.test';
        const bad = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, makeState());
        expect(bad.issues[0]).toMatchObject({ path: 'tasks[0].assignee', message: expect.stringMatching(/nadie@otra\.test/) });
    });

    it('conserva un responsable que ya no es miembro si el archivo no lo cambia', () => {
        const plan = roundTrip(() => {}, (state) => {
            state.members = state.members.filter((m) => m.id !== 'prof-luis');
        });
        expect(plan.issues).toEqual([]);
    });

    it('un campo omitido en una tarea existente significa "sin cambios"', () => {
        const plan = roundTrip((doc) => {
            const t = task(doc, 't-login');
            delete t.description;
            delete t.tags;
            delete t.deliverables;
            delete t.assignee;
        });
        expect(plan.summary.updates).toBe(0);
    });

    it('comprueba el rango de fechas con los valores finales, no solo los del archivo', () => {
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        const t = task(doc, 't-login');
        delete t.startDate; // sigue siendo 2026-09-15 en el CRM
        t.dueDate = '2026-09-01';
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, makeState());
        expect(plan.issues[0]).toMatchObject({ path: 'tasks[2].dueDate', message: expect.stringMatching(/anterior/) });
    });
});

describe('planSync: etiquetas', () => {
    it('reutiliza las etiquetas existentes sin distinguir mayúsculas y crea las nuevas una sola vez', () => {
        const plan = roundTrip((doc) => {
            task(doc, 't-home').tags = ['api', 'Mobile'];
            doc.tasks.push({ title: 'Push notifications', tags: ['mobile'] });
        });
        expect(plan.tagsToCreate).toEqual(['Mobile']);
        const home = plan.updates.find((u) => u.taskId === 't-home')!;
        expect(home.tagNames).toEqual(['API', 'Mobile']);
        expect(home.changes).toEqual([{ field: 'tags', before: '', after: 'API, Mobile' }]);
        expect(plan.creates[0].tagNames).toEqual(['Mobile']);
    });
});

describe('planSync: crear', () => {
    it('una tarea sin id se crea con los valores por defecto', () => {
        const plan = roundTrip((doc) => {
            doc.tasks.push({ title: 'Recuperar contraseña', phase: 'Backend', assignee: 'ana@domotai.test', dueDate: '2026-11-15' });
        });
        expect(plan.creates).toEqual([
            expect.objectContaining({
                ref: 3,
                title: 'Recuperar contraseña',
                completion: undefined,
                data: {
                    title: 'Recuperar contraseña',
                    description: null,
                    conclusion: null,
                    status: 'TODO',
                    priority: 'MEDIUM',
                    phaseId: 'ph-1',
                    assignedTo: 'prof-ana',
                    startDate: null,
                    dueDate: new Date('2026-11-15T00:00:00.000Z'),
                    progress: 0,
                },
                tagNames: [],
                deliverables: [],
            }),
        ]);
    });

    it('una tarea nueva ya COMPLETED recibe completedAt', () => {
        const plan = roundTrip((doc) => { doc.tasks.push({ title: 'Hecha', status: 'COMPLETED' }); });
        expect(plan.creates[0].completion).toBe('set');
    });

    it('un entregable con id dentro de una tarea nueva es un error', () => {
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        doc.tasks.push({ title: 'Copia', deliverables: [{ id: 'd-1', title: 'x', done: false }] });
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, makeState());
        expect(plan.issues[0].path).toBe('tasks[3].deliverables[0].id');
    });
});

describe('planSync: eliminar', () => {
    it('solo elimina con "delete": true; una tarea ausente del archivo no se toca', () => {
        const plan = roundTrip((doc) => {
            task(doc, 't-menu').delete = true;
            doc.tasks = doc.tasks.filter((t: any) => t.id !== 't-home');
        });
        expect(plan.deletes).toEqual([{ taskId: 't-menu', title: 'Menú lateral', conflict: false }]);
        expect(plan.summary.updates).toBe(0);
    });
});

describe('planSync: conflictos', () => {
    it('si la tarea cambió en el CRM después de exportar y el archivo también la cambia, es conflicto', () => {
        const plan = roundTrip(
            (doc) => { task(doc, 't-login').progress = 80; },
            (state) => { state.tasks[0].status = 'ON_HOLD'; },
        );
        expect(plan.updates[0]).toMatchObject({ taskId: 't-login', conflict: true });
        expect(plan.summary.conflicts).toBe(1);
    });

    it('si el archivo no la cambia, el cambio del CRM se respeta sin conflicto', () => {
        const plan = roundTrip(() => {}, (state) => { state.tasks[0].status = 'ON_HOLD'; });
        expect(plan.updates).toEqual([]);
        expect(plan.summary.conflicts).toBe(0);
    });

    it('borrar una tarea que cambió en el CRM también es conflicto', () => {
        const plan = roundTrip(
            (doc) => { task(doc, 't-login').delete = true; },
            (state) => { state.tasks[0].title = 'Login (renombrada)'; },
        );
        expect(plan.deletes[0]).toMatchObject({ taskId: 't-login', conflict: true });
    });
});

describe('planSync: entregables', () => {
    it('marca, renombra, crea y elimina entregables, con doneAt coherente', () => {
        const plan = roundTrip((doc) => {
            const t = task(doc, 't-login');
            t.deliverables = [
                { id: 'd-2', title: 'Tests e2e', done: true },
                { id: 'd-1', title: 'Diseño del token', done: true, delete: true },
                { title: 'Documentación', done: false },
            ];
        });
        const ops = plan.updates[0].deliverables!;
        expect(ops.updates).toEqual([{ id: 'd-2', title: 'Tests e2e', done: true, doneAt: 'set', orderIndex: 0 }]);
        expect(ops.deletes).toEqual(['d-1']);
        expect(ops.creates).toEqual([{ title: 'Documentación', done: false, orderIndex: 1 }]);
        expect(plan.updates[0].changes.map((c) => c.field)).toEqual(['deliverables']);
    });

    it('desmarcar un entregable limpia doneAt', () => {
        const plan = roundTrip((doc) => { task(doc, 't-login').deliverables[0].done = false; });
        expect(plan.updates[0].deliverables!.updates).toEqual([{ id: 'd-1', done: false, doneAt: 'clear' }]);
    });

    it('un id de entregable que no es de esa tarea es un error', () => {
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        task(doc, 't-home').deliverables = [{ id: 'd-1', title: 'Robado', done: false }];
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, makeState());
        expect(plan.issues[0]).toMatchObject({ path: 'tasks[0].deliverables[0].id' });
    });
});

describe('planSync: ids desconocidos', () => {
    it('un id de otra tarea del CRM que no es de este proyecto bloquea', () => {
        const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
        doc.tasks[0].id = 'de-otro-proyecto';
        const state = makeState();
        state.foreignTaskIds = ['de-otro-proyecto'];
        const plan = planSync(parseSyncDocument(JSON.stringify(doc)).tasks, state);
        expect(plan.issues[0]).toMatchObject({ path: 'tasks[0].id', message: expect.stringMatching(/otro proyecto/) });
    });

    it('un id que ya no existe (se borró en el CRM) se ignora con un aviso', () => {
        const plan = roundTrip(() => {}, (state) => { state.tasks = state.tasks.filter((t) => t.id !== 't-menu'); });
        expect(plan.issues).toEqual([]);
        expect(plan.warnings).toEqual([expect.objectContaining({ path: 'tasks[1].id', taskTitle: 'Menú lateral' })]);
        expect(plan.summary.creates).toBe(0);
    });
});

describe('planSync: orden', () => {
    it('el orden del array define la posición dentro de cada columna', () => {
        const plan = roundTrip((doc) => {
            const [home, menu, login] = doc.tasks;
            doc.tasks = [menu, home, login];
        });
        expect(plan.summary.moves).toBe(2);
        expect(plan.moves.sort()).toEqual(['t-home', 't-menu']);
        expect(plan.order.slice(0, 2)).toEqual([{ taskId: 't-menu' }, { taskId: 't-home' }]);
    });

    it('una tarea movida de columna por cambio de estado se coloca donde dice el archivo', () => {
        const plan = roundTrip((doc) => {
            task(doc, 't-login').status = 'TODO';
            const login = doc.tasks.pop();
            doc.tasks.unshift(login);
        });
        expect(plan.order[0]).toEqual({ taskId: 't-login' });
        expect(plan.moves).toContain('t-login');
    });

    it('las tareas nuevas ocupan su posición en el array', () => {
        const plan = roundTrip((doc) => { doc.tasks.splice(1, 0, { title: 'Nueva' }); });
        expect(plan.order.slice(0, 3)).toEqual([{ taskId: 't-home' }, { createRef: 1 }, { taskId: 't-menu' }]);
    });
});

describe('planSync: planHash', () => {
    it('es estable para el mismo archivo y estado, y cambia si el estado nuevo cambia el plan', () => {
        const edit = (doc: any) => { task(doc, 't-login').status = 'COMPLETED'; };
        const a = roundTrip(edit);
        const b = roundTrip(edit);
        // Alguien tocó la tarea en el CRM entre la vista previa y la confirmación: ahora
        // es un conflicto y lo que se aplicaría ya no es lo que se previsualizó.
        const c = roundTrip(edit, (state) => { state.tasks[0].progress = 10; });
        expect(a.planHash).toBe(b.planHash);
        expect(c.planHash).not.toBe(a.planHash);
    });
});

describe('selectApplied', () => {
    const conflicted = () => roundTrip(
        (doc) => {
            task(doc, 't-login').progress = 80;
            task(doc, 't-home').tags = ['Nueva'];
        },
        (state) => { state.tasks[0].status = 'ON_HOLD'; },
    );

    it('por defecto deja fuera los conflictos', () => {
        const applied = selectApplied(conflicted(), []);
        expect(applied.updates.map((u) => u.taskId)).toEqual(['t-home']);
        expect(applied.skippedConflicts).toEqual(['t-login']);
    });

    it('aplica los conflictos que el usuario marcó', () => {
        const applied = selectApplied(conflicted(), ['t-login']);
        expect(applied.updates.map((u) => u.taskId).sort()).toEqual(['t-home', 't-login']);
        expect(applied.skippedConflicts).toEqual([]);
    });

    it('no crea etiquetas que solo usaba un conflicto omitido', () => {
        const plan = roundTrip(
            (doc) => { task(doc, 't-login').tags = ['Huérfana']; },
            (state) => { state.tasks[0].status = 'ON_HOLD'; },
        );
        expect(plan.tagsToCreate).toEqual(['Huérfana']);
        expect(selectApplied(plan, []).tagsToCreate).toEqual([]);
    });
});

describe('assignmentsByRecipient', () => {
    it('agrupa las asignaciones nuevas por persona y no avisa a quien importa', () => {
        const plan = roundTrip((doc) => {
            task(doc, 't-home').assignee = 'luis@domotai.test';
            doc.tasks.push({ title: 'Nueva para Luis', assignee: 'luis@domotai.test' });
            doc.tasks.push({ title: 'Nueva para Ana', assignee: 'ana@domotai.test' });
            task(doc, 't-menu').title = 'Menú lateral v2'; // ya era de Luis: no es asignación nueva
        });
        const groups = assignmentsByRecipient(selectApplied(plan, []), 'prof-ana');
        expect(groups).toEqual([{ recipientId: 'prof-luis', titles: ['Pantalla de inicio', 'Nueva para Luis'] }]);
    });
});
