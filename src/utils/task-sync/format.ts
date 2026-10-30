import { createHash } from 'crypto';
import {
    DEFAULT_TASK_PRIORITY,
    DEFAULT_TASK_STATUS,
    normalizeTaskPriority,
    normalizeTaskStatus,
    type TaskPriority,
    type TaskStatus,
} from '../../constants/enums';

/**
 * Formato del archivo JSON con el que las tareas de un proyecto salen del CRM, se
 * trabajan fuera (a mano o con un agente de IA) y vuelven a entrar.
 *
 * El módulo entero es puro —sin Prisma ni red— como `task-template.ts`: el estado del
 * proyecto lo lee `TaskSyncRepository.getSyncState` y aquí sólo se transforma. Así cada
 * regla se prueba sin levantar Postgres.
 *
 * - `build-export.ts`: estado → documento.
 * - `parse.ts`: texto → tareas leídas, con errores por ruta (`tasks[3].dueDate`).
 * - `plan.ts`: tareas leídas + estado → qué se crea, cambia, borra y mueve.
 *
 * El kit para Claude Code (`domotai-tasks-kit/` en la carpeta raíz) valida las mismas
 * reglas. Si cambia el formato, sube `TASK_SYNC_VERSION` y actualiza el kit.
 */

export const TASK_SYNC_FORMAT = 'crm-domotai-tasks';
export const TASK_SYNC_VERSION = 1;

/** Tope de tareas por archivo. El de la plantilla Markdown (100) se queda corto aquí. */
export const MAX_SYNC_TASKS = 1000;

/** Los mismos topes que `createProjectTaskSchema` y `task-template.ts`. */
export const MAX_TITLE_CHARS = 500;
export const MAX_TEXT_CHARS = 10000;

// ─── Estado del proyecto (lo que lee el repositorio) ─────────────────────────────

export interface StateDeliverable {
    id: string;
    title: string;
    done: boolean;
    orderIndex: number;
}

export interface StateTask {
    id: string;
    title: string;
    description: string | null;
    conclusion: string | null;
    /** Tal cual está en la base: puede ser null o una variante heredada. */
    status: string | null;
    priority: string | null;
    phaseId: string | null;
    assignedTo: string | null;
    assigneeEmail: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    completedAt: Date | null;
    progress: number;
    orderIndex: number;
    createdAt: Date;
    updatedAt: Date;
    creatorName: string | null;
    tagIds: string[];
    deliverables: StateDeliverable[];
    comments: Array<{ author: string | null; createdAt: Date; content: string }>;
    timeLoggedMinutes: number;
}

export interface SyncState {
    project: {
        id: string;
        name: string;
        description: string | null;
        status: string | null;
        startDate: Date | null;
        endDate: Date | null;
    };
    phases: Array<{
        id: string;
        name: string;
        status: string | null;
        orderIndex: number;
        startDate: Date | null;
        endDate: Date | null;
    }>;
    /** Quienes pueden ser responsables: el equipo del proyecto o, si no tiene, la organización. */
    members: Array<{ id: string; fullName: string | null; email: string | null; role: string | null }>;
    /** Etiquetas de la organización. */
    tags: Array<{ id: string; name: string }>;
    tasks: StateTask[];
    /** Ids del archivo que existen en la organización pero en otro proyecto. */
    foreignTaskIds: string[];
}

// ─── Documento (lo que va en el archivo) ─────────────────────────────────────────

export interface DocDeliverable {
    id?: string;
    title: string;
    done: boolean;
    delete?: boolean;
}

export interface DocTask {
    id?: string;
    rev?: string;
    title: string;
    description: string | null;
    conclusion: string | null;
    status: string;
    priority: string;
    phase: string | null;
    assignee: string | null;
    startDate: string | null;
    dueDate: string | null;
    progress: number;
    tags: string[];
    deliverables: DocDeliverable[];
    delete?: boolean;
    readOnly?: {
        createdAt: string;
        updatedAt: string;
        completedAt: string | null;
        createdBy: string | null;
        timeLoggedMinutes: number;
        comments: Array<{ author: string | null; date: string; content: string }>;
    };
}

export interface SyncDocument {
    format: typeof TASK_SYNC_FORMAT;
    version: typeof TASK_SYNC_VERSION;
    exportedAt: string;
    exportedBy: { name: string | null; email: string | null };
    instructions: string[];
    project: {
        id: string;
        name: string;
        description: string | null;
        status: string | null;
        startDate: string | null;
        endDate: string | null;
    };
    catalog: {
        statuses: string[];
        priorities: string[];
        phases: Array<{ name: string; status: string | null; startDate: string | null; endDate: string | null; order: number }>;
        members: Array<{ name: string | null; email: string | null; role: string | null }>;
        tags: string[];
    };
    tasks: DocTask[];
}

/** Error o aviso localizado por su ruta dentro del documento. */
export interface SyncIssue {
    path: string;
    taskTitle?: string;
    message: string;
}

// ─── Utilidades compartidas ──────────────────────────────────────────────────────

/** `Date` → `'YYYY-MM-DD'` en UTC, el mismo criterio que `toDate()` de `task-import.ts`. */
export function toDay(date: Date | null | undefined): string | null {
    return date ? date.toISOString().slice(0, 10) : null;
}

/** `'YYYY-MM-DD'` → medianoche UTC. Sin la `Z`, `new Date` la tomaría como hora local. */
export function fromDay(day: string | null): Date | null {
    return day ? new Date(`${day}T00:00:00.000Z`) : null;
}

/** Estado de la base (puede ser null o heredado) → valor de catálogo. */
export function canonicalStatus(value: string | null | undefined): TaskStatus {
    return normalizeTaskStatus(value) ?? DEFAULT_TASK_STATUS;
}

export function canonicalPriority(value: string | null | undefined): TaskPriority {
    return normalizeTaskPriority(value) ?? DEFAULT_TASK_PRIORITY;
}

/** Lo que `rev` resume de una tarea: sus campos editables, ya como claves de la base. */
export interface RevInput {
    title: string;
    description: string | null;
    conclusion: string | null;
    status: string | null;
    priority: string | null;
    phaseId: string | null;
    assignedTo: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    progress: number;
    /** Ids de etiqueta, o `new:<nombre>` para las que aún no existen. */
    tagIds: string[];
    deliverables: Array<{ id?: string; title: string; done: boolean }>;
}

/**
 * Huella de los campos editables de una tarea. Va en el archivo al exportar y, al
 * importar, se recalcula dos veces:
 * - con lo que trae el archivo: si coincide, el archivo no tocó la tarea;
 * - con lo que hay en la base: si no coincide, alguien la cambió en el CRM después de
 *   exportar. Si además el archivo la cambió, es un conflicto.
 *
 * Cubre etiquetas y entregables, que no mueven el `updatedAt` de la tarea. Deja fuera
 * el orden en la columna, que no es motivo de conflicto.
 */
export function computeRev(task: RevInput): string {
    const canonical = [
        task.title.trim(),
        task.description ?? null,
        task.conclusion ?? null,
        canonicalStatus(task.status),
        canonicalPriority(task.priority),
        task.phaseId ?? null,
        task.assignedTo ?? null,
        toDay(task.startDate),
        toDay(task.dueDate),
        task.progress,
        [...task.tagIds].sort(),
        task.deliverables.map((d) => [d.id ?? null, d.title, d.done]),
    ];
    return createHash('sha1').update(JSON.stringify(canonical)).digest('hex');
}

/** `rev` de una tarea tal como está en la base, con los entregables en su orden. */
export function revOfState(task: StateTask): string {
    return computeRev({ ...task, deliverables: [...task.deliverables].sort((a, b) => a.orderIndex - b.orderIndex) });
}

/** Instrucciones que viajan dentro del archivo, para quien lo abra sin el kit. */
export const SYNC_INSTRUCTIONS: string[] = [
    'Archivo de tareas del CRM Domotai. Edítalo y vuelve a subirlo en "Importar tareas" del proyecto: verás una vista previa antes de aplicar nada.',
    'Editable por tarea: title, description, conclusion, status, priority, phase, assignee, startDate, dueDate, progress, tags y deliverables.',
    'No modifiques id, rev ni readOnly. Tampoco project, catalog ni exportedAt: son contexto.',
    'Crear una tarea: añade un objeto sin id ni rev. Solo title es obligatorio.',
    'Eliminar una tarea: déjala en el archivo con "delete": true. Una tarea que falta del archivo NO se borra.',
    'Mover una tarea: cambia status para cambiarla de columna. El orden del array define su posición dentro de la columna.',
    'status y priority: usa los valores de catalog. phase: nombre exacto de catalog.phases, o null. assignee: email de catalog.members, o null.',
    'Fechas como AAAA-MM-DD. dueDate no puede ser anterior a startDate. progress es un entero de 0 a 100.',
    'tags: nombres; una etiqueta que no existe se crea al importar. deliverables: con id se actualiza, sin id se crea, con "delete": true se elimina.',
    'Un campo que quitas de una tarea existente se deja como está en el CRM.',
];
