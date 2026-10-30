import { createHash } from 'crypto';
import { TASK_STATUSES, type TaskPriority, type TaskStatus } from '../../constants/enums';
import { isInvertedDateRange } from '../../validators/project.validator';
import { normalizeForMatch } from '../task-template';
import { compareBoardOrder } from './build-export';
import {
    canonicalPriority,
    canonicalStatus,
    computeRev,
    fromDay,
    revOfState,
    toDay,
    type StateTask,
    type SyncIssue,
    type SyncState,
} from './format';
import type { ParsedTask } from './parse';

/**
 * Qué cambiaría en el proyecto al importar el archivo. Es lo que ve el usuario en la
 * vista previa y lo que `TaskSyncRepository.applySyncPlan` escribe al confirmar.
 *
 * Reglas:
 * - Con `id` se actualiza, sin `id` se crea, y sólo se borra con `"delete": true`. Una
 *   tarea que falta en el archivo no se toca.
 * - Si el archivo no tocó una tarea (su `rev` recalculado coincide con el exportado),
 *   no se aplica nada sobre ella aunque en el CRM haya cambiado: el archivo está viejo,
 *   no la está corrigiendo.
 * - Si el archivo la tocó y en el CRM también cambió desde la exportación, es un
 *   **conflicto**: va al plan marcado y, salvo que el usuario lo pida, no se aplica.
 * - El orden del array es la posición en la columna.
 */

export type Completion = 'set' | 'clear';

/** Los campos de `ProjectTask` que escribe la sincronización. */
export interface TaskWriteData {
    title: string;
    description: string | null;
    conclusion: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    phaseId: string | null;
    assignedTo: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    progress: number;
}

/** Un cambio tal como se enseña en la vista previa: nombres, no ids. */
export interface FieldChange {
    field: string;
    before: string | number | null;
    after: string | number | null;
}

export interface DeliverableOps {
    creates: Array<{ title: string; done: boolean; orderIndex: number }>;
    updates: Array<{ id: string; title?: string; done?: boolean; doneAt?: Completion; orderIndex?: number }>;
    deletes: string[];
}

export interface PlannedCreate {
    /** Posición de la tarea en el archivo. */
    ref: number;
    title: string;
    data: TaskWriteData;
    completion?: Completion;
    tagNames: string[];
    deliverables: Array<{ title: string; done: boolean }>;
}

export interface PlannedUpdate {
    taskId: string;
    /** Título actual en el CRM, para reconocerla en la vista previa. */
    title: string;
    changes: FieldChange[];
    data: Partial<TaskWriteData>;
    completion?: Completion;
    /** Sólo si cambian: la lista completa de etiquetas que tendrá la tarea. */
    tagNames?: string[];
    deliverables?: DeliverableOps;
    conflict: boolean;
}

export interface PlannedDelete {
    taskId: string;
    title: string;
    conflict: boolean;
}

/** Una tarea en el orden del archivo: existente por su id o nueva por su posición. */
export type OrderSlot = { taskId: string } | { createRef: number };

export interface SyncSummary {
    creates: number;
    updates: number;
    deletes: number;
    moves: number;
    conflicts: number;
    tagsToCreate: number;
}

export interface SyncPlan {
    creates: PlannedCreate[];
    updates: PlannedUpdate[];
    deletes: PlannedDelete[];
    /** Tareas existentes que cambian de columna o de posición relativa en ella. */
    moves: string[];
    order: OrderSlot[];
    tagsToCreate: string[];
    issues: SyncIssue[];
    warnings: SyncIssue[];
    summary: SyncSummary;
    /** Huella del plan: si al confirmar ya no coincide, la base cambió desde la vista previa. */
    planHash: string;
}

export const PLAN_MESSAGES = {
    unknownPhase: (name: string, available: string[]) =>
        `El proyecto no tiene un área llamada "${name}". Las que hay son: ${available.join(', ') || '(ninguna)'}.`,
    ambiguousPhase: (name: string) =>
        `Hay varias áreas llamadas "${name}" y el nombre es ambiguo. Renombra una en el CRM o deja la tarea en su área actual.`,
    unknownAssignee: (email: string) =>
        `"${email}" no es miembro del proyecto. Usa un email de catalog.members o null.`,
    foreignTask: (id: string) =>
        `La tarea ${id} es de otro proyecto. No copies ids entre archivos: para crear una tarea, quita id y rev.`,
    vanishedTask: 'Esta tarea ya no existe en el CRM (se eliminó después de exportar). Se ignora.',
    newTaskDeleted: 'Es una tarea nueva marcada para eliminar: se ignora.',
    foreignDeliverable: (id: string) =>
        `El entregable ${id} no pertenece a esta tarea. Para crear uno nuevo, quita su id.`,
    deliverableOnNewTask: 'Una tarea nueva no puede traer entregables con id: quítalo para crearlos.',
    invertedRange: (start: string, due: string) => `El vencimiento (${due}) es anterior al inicio (${start}).`,
} as const;

const FIELD_ORDER: Array<keyof TaskWriteData> = [
    'title', 'description', 'conclusion', 'status', 'priority', 'phaseId', 'assignedTo', 'startDate', 'dueDate', 'progress',
];

/** Nombre del campo en el archivo, que es como lo ve el usuario. */
const FIELD_LABEL: Record<keyof TaskWriteData, string> = {
    title: 'title', description: 'description', conclusion: 'conclusion', status: 'status', priority: 'priority',
    phaseId: 'phase', assignedTo: 'assignee', startDate: 'startDate', dueDate: 'dueDate', progress: 'progress',
};

function sameValue(a: unknown, b: unknown): boolean {
    if (a instanceof Date || b instanceof Date) {
        return toDay(a as Date | null) === toDay(b as Date | null);
    }
    return (a ?? null) === (b ?? null);
}

function describeDeliverables(list: Array<{ title: string; done: boolean }>): string {
    return list.map((d) => `${d.done ? '[x]' : '[ ]'} ${d.title}`).join('; ');
}

export function planSync(parsed: ParsedTask[], state: SyncState): SyncPlan {
    const issues: SyncIssue[] = [];
    const warnings: SyncIssue[] = [];
    const creates: PlannedCreate[] = [];
    const updates: PlannedUpdate[] = [];
    const deletes: PlannedDelete[] = [];
    const order: OrderSlot[] = [];

    const stateById = new Map(state.tasks.map((t) => [t.id, t]));
    const foreign = new Set(state.foreignTaskIds);
    const phaseName = new Map(state.phases.map((p) => [p.id, p.name]));
    const memberName = new Map(state.members.map((m) => [m.id, m.email ?? m.fullName]));
    const membersByEmail = new Map<string, string>();
    for (const m of state.members) if (m.email) membersByEmail.set(m.email.trim().toLowerCase(), m.id);
    const tagsByLower = new Map(state.tags.map((t) => [t.name.trim().toLowerCase(), t]));
    const tagNameById = new Map(state.tags.map((t) => [t.id, t.name]));
    /** Etiquetas nuevas: clave en minúsculas → la primera grafía que aparece. */
    const newTags = new Map<string, string>();

    for (const p of parsed) {
        const at = (sub: string, message: string): SyncIssue => ({
            path: sub ? `${p.path}.${sub}` : p.path,
            taskTitle: p.title,
            message,
        });
        const before = issues.length;
        const current = p.id ? stateById.get(p.id) : undefined;

        if (p.id && !current) {
            if (foreign.has(p.id)) issues.push(at('id', PLAN_MESSAGES.foreignTask(p.id)));
            else warnings.push(at('id', PLAN_MESSAGES.vanishedTask));
            continue;
        }

        if (current && p.delete) {
            deletes.push({ taskId: current.id, title: current.title, conflict: revOfState(current) !== p.rev });
            continue;
        }
        if (!current && p.delete) {
            warnings.push(at('', PLAN_MESSAGES.newTaskDeleted));
            continue;
        }

        // ── Resolver nombres a claves de la base ───────────────────────────────
        const resolvePhase = (): string | null => {
            if (p.phase === undefined) return current?.phaseId ?? null;
            if (p.phase === null) return null;
            const wanted = normalizeForMatch(p.phase);
            const matches = state.phases.filter((ph) => normalizeForMatch(ph.name) === wanted);
            // Mantener el área actual nunca es ambiguo, aunque otra se llame igual.
            if (current?.phaseId && matches.some((m) => m.id === current.phaseId)) return current.phaseId;
            if (matches.length === 1) return matches[0].id;
            issues.push(
                at('phase', matches.length === 0
                    ? PLAN_MESSAGES.unknownPhase(p.phase, state.phases.map((ph) => ph.name))
                    : PLAN_MESSAGES.ambiguousPhase(p.phase)),
            );
            return null;
        };

        const resolveAssignee = (): string | null => {
            if (p.assignee === undefined) return current?.assignedTo ?? null;
            if (p.assignee === null) return null;
            const email = p.assignee.trim().toLowerCase();
            // Quien ya era responsable puede seguir siéndolo aunque haya salido del equipo.
            if (current?.assigneeEmail && current.assigneeEmail.trim().toLowerCase() === email) return current.assignedTo;
            const id = membersByEmail.get(email);
            if (!id) issues.push(at('assignee', PLAN_MESSAGES.unknownAssignee(p.assignee)));
            return id ?? null;
        };

        /** Claves (id o `new:<minúsculas>`) y nombres visibles, sin repetidos. */
        const resolveTags = (): { keys: string[]; names: string[] } => {
            if (p.tags === undefined) {
                const keys = current?.tagIds ?? [];
                return { keys, names: keys.map((id) => tagNameById.get(id) ?? id) };
            }
            const keys: string[] = [];
            const names: string[] = [];
            for (const raw of p.tags) {
                const lower = raw.trim().toLowerCase();
                const existing = tagsByLower.get(lower);
                const key = existing ? existing.id : `new:${lower}`;
                if (keys.includes(key)) continue;
                if (!existing && !newTags.has(lower)) newTags.set(lower, raw.trim());
                keys.push(key);
                names.push(existing ? existing.name : newTags.get(lower)!);
            }
            return { keys, names };
        };

        const phaseId = resolvePhase();
        const assignedTo = resolveAssignee();
        const tags = resolveTags();

        const final: TaskWriteData = {
            title: p.title,
            description: p.description !== undefined ? p.description : current?.description ?? null,
            conclusion: p.conclusion !== undefined ? p.conclusion : current?.conclusion ?? null,
            status: p.status ?? (current ? canonicalStatus(current.status) : 'TODO'),
            priority: p.priority ?? (current ? canonicalPriority(current.priority) : 'MEDIUM'),
            phaseId,
            assignedTo,
            startDate: p.startDate !== undefined ? fromDay(p.startDate) : current?.startDate ?? null,
            dueDate: p.dueDate !== undefined ? fromDay(p.dueDate) : current?.dueDate ?? null,
            progress: p.progress ?? current?.progress ?? 0,
        };

        // Rango con los valores finales: el archivo puede traer sólo una de las dos fechas.
        if (isInvertedDateRange(final.startDate, final.dueDate)) {
            issues.push(at('dueDate', PLAN_MESSAGES.invertedRange(toDay(final.startDate)!, toDay(final.dueDate)!)));
        }

        // ── Tarea nueva ────────────────────────────────────────────────────────
        if (!current) {
            const deliverables: Array<{ title: string; done: boolean }> = [];
            p.deliverables?.forEach((d, i) => {
                if (d.id) issues.push(at(`deliverables[${i}].id`, PLAN_MESSAGES.deliverableOnNewTask));
                else if (!d.delete) deliverables.push({ title: d.title, done: d.done });
            });
            if (issues.length > before) continue;
            creates.push({
                ref: p.index,
                title: p.title,
                data: final,
                completion: final.status === 'COMPLETED' ? 'set' : undefined,
                tagNames: tags.names,
                deliverables,
            });
            order.push({ createRef: p.index });
            continue;
        }

        // ── Tarea existente ────────────────────────────────────────────────────
        const ops: DeliverableOps = { creates: [], updates: [], deletes: [] };
        const finalDeliverables: Array<{ id?: string; title: string; done: boolean }> = [];
        if (p.deliverables === undefined) {
            finalDeliverables.push(...[...current.deliverables].sort((a, b) => a.orderIndex - b.orderIndex));
        } else {
            const currentById = new Map(current.deliverables.map((d) => [d.id, d]));
            const mentioned = new Set<string>();
            let position = 0;
            p.deliverables.forEach((d, i) => {
                if (!d.id) {
                    if (d.delete) return;
                    ops.creates.push({ title: d.title, done: d.done, orderIndex: position++ });
                    finalDeliverables.push({ title: d.title, done: d.done });
                    return;
                }
                const existing = currentById.get(d.id);
                if (!existing) {
                    issues.push(at(`deliverables[${i}].id`, PLAN_MESSAGES.foreignDeliverable(d.id)));
                    return;
                }
                mentioned.add(d.id);
                if (d.delete) {
                    ops.deletes.push(d.id);
                    return;
                }
                const update: DeliverableOps['updates'][number] = { id: d.id };
                if (d.title !== existing.title) update.title = d.title;
                if (d.done !== existing.done) {
                    update.done = d.done;
                    update.doneAt = d.done ? 'set' : 'clear';
                }
                if (existing.orderIndex !== position) update.orderIndex = position;
                if (Object.keys(update).length > 1) ops.updates.push(update);
                finalDeliverables.push({ id: d.id, title: d.title, done: d.done });
                position++;
            });
            // Los que el archivo no menciona se quedan, detrás de los que sí.
            for (const d of [...current.deliverables].sort((a, b) => a.orderIndex - b.orderIndex)) {
                if (mentioned.has(d.id)) continue;
                if (d.orderIndex !== position) ops.updates.push({ id: d.id, orderIndex: position });
                finalDeliverables.push(d);
                position++;
            }
        }
        if (issues.length > before) continue;
        order.push({ taskId: current.id });

        const fileRev = computeRev({ ...final, tagIds: tags.keys, deliverables: finalDeliverables });
        if (fileRev === p.rev) continue; // El archivo no tocó esta tarea.

        const changes: FieldChange[] = [];
        const data: Partial<TaskWriteData> = {};
        const currentValues: TaskWriteData = {
            title: current.title,
            description: current.description,
            conclusion: current.conclusion,
            status: canonicalStatus(current.status),
            priority: canonicalPriority(current.priority),
            phaseId: current.phaseId,
            assignedTo: current.assignedTo,
            startDate: current.startDate,
            dueDate: current.dueDate,
            progress: current.progress,
        };
        const display = (field: keyof TaskWriteData, value: unknown): string | number | null => {
            if (value === null || value === undefined) return null;
            if (field === 'phaseId') return phaseName.get(value as string) ?? (value as string);
            if (field === 'assignedTo') return memberName.get(value as string) ?? current.assigneeEmail ?? (value as string);
            if (value instanceof Date) return toDay(value);
            return value as string | number;
        };
        for (const field of FIELD_ORDER) {
            if (sameValue(final[field], currentValues[field])) continue;
            (data as any)[field] = final[field];
            changes.push({ field: FIELD_LABEL[field], before: display(field, currentValues[field]), after: display(field, final[field]) });
        }

        let tagNames: string[] | undefined;
        const currentTagKeys = [...current.tagIds].sort();
        if (JSON.stringify([...tags.keys].sort()) !== JSON.stringify(currentTagKeys)) {
            tagNames = tags.names;
            changes.push({
                field: 'tags',
                before: current.tagIds.map((id) => tagNameById.get(id) ?? id).join(', '),
                after: tags.names.join(', '),
            });
        }

        const deliverablesChanged = ops.creates.length + ops.updates.length + ops.deletes.length > 0;
        if (deliverablesChanged) {
            changes.push({
                field: 'deliverables',
                before: describeDeliverables([...current.deliverables].sort((a, b) => a.orderIndex - b.orderIndex)),
                after: describeDeliverables(finalDeliverables),
            });
        }

        if (changes.length === 0) continue;

        let completion: Completion | undefined;
        if (data.status) {
            if (data.status === 'COMPLETED' && currentValues.status !== 'COMPLETED') completion = 'set';
            if (data.status !== 'COMPLETED' && currentValues.status === 'COMPLETED') completion = 'clear';
        }

        updates.push({
            taskId: current.id,
            title: current.title,
            changes,
            data,
            completion,
            tagNames,
            deliverables: deliverablesChanged ? ops : undefined,
            conflict: revOfState(current) !== p.rev,
        });
    }

    const statusOf = finalStatusResolver(state, updates, creates);
    const moves = movedTasks(state, order, statusOf, new Set(deletes.map((d) => d.taskId)));
    const tagsToCreate = [...newTags.values()];

    const summary: SyncSummary = {
        creates: creates.length,
        updates: updates.length,
        deletes: deletes.length,
        moves: moves.length,
        conflicts: updates.filter((u) => u.conflict).length + deletes.filter((d) => d.conflict).length,
        tagsToCreate: tagsToCreate.length,
    };

    const blocked = issues.length > 0;
    const plan: SyncPlan = {
        creates: blocked ? [] : creates,
        updates: blocked ? [] : updates,
        deletes: blocked ? [] : deletes,
        moves: blocked ? [] : moves,
        order: blocked ? [] : order,
        tagsToCreate: blocked ? [] : tagsToCreate,
        issues,
        warnings,
        summary: blocked ? { creates: 0, updates: 0, deletes: 0, moves: 0, conflicts: 0, tagsToCreate: 0 } : summary,
        planHash: '',
    };
    plan.planHash = hashPlan(plan);
    return plan;
}

function hashPlan(plan: SyncPlan): string {
    const { creates, updates, deletes, order, tagsToCreate } = plan;
    return createHash('sha1').update(JSON.stringify({ creates, updates, deletes, order, tagsToCreate })).digest('hex');
}

// ─── Orden en las columnas ───────────────────────────────────────────────────────

type StatusOf = (slot: OrderSlot) => TaskStatus;

function finalStatusResolver(
    state: SyncState,
    updates: Array<Pick<PlannedUpdate, 'taskId' | 'data'>>,
    creates: Array<Pick<PlannedCreate, 'ref' | 'data'>>,
): StatusOf {
    const byTask = new Map(state.tasks.map((t) => [t.id, canonicalStatus(t.status)]));
    for (const u of updates) if (u.data.status) byTask.set(u.taskId, u.data.status);
    const byRef = new Map(creates.map((c) => [c.ref, c.data.status]));
    return (slot) => ('taskId' in slot ? byTask.get(slot.taskId)! : byRef.get(slot.createRef)!);
}

/**
 * Cómo quedan las columnas: en cada una, primero las tareas del archivo en su orden y
 * después las que el archivo no menciona, en el orden que ya tenían.
 */
function columnLayout(
    state: SyncState,
    order: OrderSlot[],
    statusOf: StatusOf,
    deleted: Set<string>,
): Map<TaskStatus, OrderSlot[]> {
    const columns = new Map<TaskStatus, OrderSlot[]>(TASK_STATUSES.map((s) => [s, []]));
    const inFile = new Set<string>();
    for (const slot of order) {
        if ('taskId' in slot) {
            if (deleted.has(slot.taskId)) continue;
            inFile.add(slot.taskId);
        }
        columns.get(statusOf(slot))!.push(slot);
    }
    for (const task of [...state.tasks].sort(compareBoardOrder)) {
        if (inFile.has(task.id) || deleted.has(task.id)) continue;
        columns.get(statusOf({ taskId: task.id }))!.push({ taskId: task.id });
    }
    return columns;
}

/**
 * Tareas existentes que de verdad se mueven: cambian de columna, o cambia su orden
 * relativo respecto a las que siguen en la misma columna. Una tarea que sólo se
 * desplaza porque otra entró delante no cuenta.
 */
function movedTasks(state: SyncState, order: OrderSlot[], statusOf: StatusOf, deleted: Set<string>): string[] {
    const currentColumns = new Map<TaskStatus, string[]>(TASK_STATUSES.map((s) => [s, []]));
    for (const task of [...state.tasks].sort(compareBoardOrder)) {
        if (deleted.has(task.id)) continue;
        currentColumns.get(canonicalStatus(task.status))!.push(task.id);
    }

    const moved: string[] = [];
    for (const [status, slots] of columnLayout(state, order, statusOf, deleted)) {
        const finalIds = slots.filter((s): s is { taskId: string } => 'taskId' in s).map((s) => s.taskId);
        const currentIds = currentColumns.get(status)!;
        const stay = new Set(finalIds.filter((id) => currentIds.includes(id)));
        for (const id of finalIds) if (!stay.has(id)) moved.push(id);
        const f = finalIds.filter((id) => stay.has(id));
        const c = currentIds.filter((id) => stay.has(id));
        f.forEach((id, i) => { if (c[i] !== id) moved.push(id); });
    }
    return moved;
}

/**
 * `orderIndex` final de cada tarea, una vez creadas las nuevas. Sólo devuelve las que
 * cambian, para no reescribir el proyecto entero en cada importación.
 */
export function columnOrderWrites(
    state: SyncState,
    applied: AppliedPlan,
    createdIdByRef: Map<number, string>,
): Array<{ id: string; orderIndex: number }> {
    const statusOf = finalStatusResolver(state, applied.updates, applied.creates);
    const deleted = new Set(applied.deletes.map((d) => d.taskId));
    const currentIndex = new Map(state.tasks.map((t) => [t.id, t.orderIndex]));
    const writes: Array<{ id: string; orderIndex: number }> = [];
    for (const slots of columnLayout(state, applied.order, statusOf, deleted).values()) {
        slots.forEach((slot, orderIndex) => {
            const id = 'taskId' in slot ? slot.taskId : createdIdByRef.get(slot.createRef);
            if (!id) return;
            if (currentIndex.get(id) !== orderIndex) writes.push({ id, orderIndex });
        });
    }
    return writes;
}

// ─── Selección de lo que se aplica ───────────────────────────────────────────────

export interface AppliedPlan extends SyncPlan {
    /** Conflictos que el usuario no marcó para aplicar. */
    skippedConflicts: string[];
}

/**
 * Quita del plan los conflictos que el usuario no eligió aplicar y las etiquetas nuevas
 * que sólo usaban ellos.
 */
export function selectApplied(plan: SyncPlan, applyConflicts: string[]): AppliedPlan {
    const chosen = new Set(applyConflicts);
    const keep = (item: { taskId: string; conflict: boolean }) => !item.conflict || chosen.has(item.taskId);
    const updates = plan.updates.filter(keep);
    const deletes = plan.deletes.filter(keep);
    const skippedConflicts = [...plan.updates, ...plan.deletes].filter((i) => !keep(i)).map((i) => i.taskId);

    const used = new Set<string>();
    for (const c of plan.creates) c.tagNames.forEach((n) => used.add(n.toLowerCase()));
    for (const u of updates) u.tagNames?.forEach((n) => used.add(n.toLowerCase()));
    const tagsToCreate = plan.tagsToCreate.filter((n) => used.has(n.toLowerCase()));

    return { ...plan, updates, deletes, tagsToCreate, skippedConflicts };
}

/**
 * Asignaciones nuevas agrupadas por persona, para mandarle un solo aviso con todas en
 * vez de uno por tarea. Quien importa no se avisa a sí mismo.
 */
export function assignmentsByRecipient(
    applied: Pick<AppliedPlan, 'updates' | 'creates'>,
    actorId: string | undefined,
): Array<{ recipientId: string; titles: string[] }> {
    const groups = new Map<string, string[]>();
    const add = (recipientId: string | null | undefined, title: string) => {
        if (!recipientId || recipientId === actorId) return;
        if (!groups.has(recipientId)) groups.set(recipientId, []);
        groups.get(recipientId)!.push(title);
    };
    for (const u of applied.updates) {
        if ('assignedTo' in u.data) add(u.data.assignedTo, u.data.title ?? u.title);
    }
    for (const c of applied.creates) add(c.data.assignedTo, c.title);
    return [...groups].map(([recipientId, titles]) => ({ recipientId, titles }));
}

export type { StateTask };
