/**
 * Catálogo canónico de estados y prioridades.
 *
 * Es el gemelo de `constants/roles.ts`: mismo patrón (tupla `as const` +
 * normalizador + predicados), distinto dominio. La forma canónica aquí es
 * SCREAMING_SNAKE, salvo `PHASE_STATUSES`, que se queda en minúscula porque
 * es lo que ya hay en la base y migrarlo no compra nada.
 *
 * Los normalizadores existen por una razón concreta: la base acumuló variantes
 * ('Archived' y 'ARCHIVED', 'done' y 'COMPLETED') y hasta que la Fase 3 las
 * unifique hay que poder leerlas todas sin repartir `toUpperCase()` por el
 * código, que es exactamente cómo apareció la deriva.
 */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Minúscula a propósito: otro dominio, no unificar con el de tareas. */
export const PHASE_STATUSES = ['active', 'completed', 'on_hold'] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SHARE_PERMISSIONS = ['VIEW', 'COMMENT', 'EDIT'] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

export const DEFAULT_TASK_STATUS: TaskStatus = 'TODO';
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'MEDIUM';
export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'NOT_STARTED';
export const ARCHIVED_PROJECT_STATUS: ProjectStatus = 'ARCHIVED';

/** `"  In Progress "` → `"IN_PROGRESS"`. Sin decidir todavía si es válido. */
function canonicalize(value: string | null | undefined): string {
    if (!value) return '';
    return String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/**
 * Variantes históricas que la base ya contiene y hay que seguir leyendo.
 * Exportado (no sólo de uso interno) para que los tests puedan verificar que
 * ningún alias colisiona con un valor ya canónico de `TASK_STATUSES`.
 */
export const TASK_STATUS_ALIASES: Record<string, TaskStatus> = {
    DONE: 'COMPLETED',
    COMPLETE: 'COMPLETED',
    PENDING: 'TODO',
    NOT_STARTED: 'TODO',
    IN_REVIEW: 'IN_PROGRESS',
    BLOCKED: 'ON_HOLD',
    PAUSED: 'ON_HOLD',
};

/** Ídem, para `PROJECT_STATUSES`. */
export const PROJECT_STATUS_ALIASES: Record<string, ProjectStatus> = {
    ACTIVE: 'IN_PROGRESS',
    DONE: 'COMPLETED',
    PAUSED: 'ON_HOLD',
};

export function normalizeTaskStatus(value: string | null | undefined): TaskStatus | null {
    const c = canonicalize(value);
    if ((TASK_STATUSES as readonly string[]).includes(c)) return c as TaskStatus;
    return TASK_STATUS_ALIASES[c] ?? null;
}

export function normalizeTaskPriority(value: string | null | undefined): TaskPriority | null {
    const c = canonicalize(value);
    return (TASK_PRIORITIES as readonly string[]).includes(c) ? (c as TaskPriority) : null;
}

export function normalizeProjectStatus(value: string | null | undefined): ProjectStatus | null {
    const c = canonicalize(value);
    if ((PROJECT_STATUSES as readonly string[]).includes(c)) return c as ProjectStatus;
    return PROJECT_STATUS_ALIASES[c] ?? null;
}

export function normalizePhaseStatus(value: string | null | undefined): PhaseStatus | null {
    const c = canonicalize(value).toLowerCase();
    return (PHASE_STATUSES as readonly string[]).includes(c) ? (c as PhaseStatus) : null;
}

export function normalizeInvoiceStatus(value: string | null | undefined): InvoiceStatus | null {
    const c = canonicalize(value);
    if (c === 'CANCELED') return 'CANCELLED';
    return (INVOICE_STATUSES as readonly string[]).includes(c) ? (c as InvoiceStatus) : null;
}

/**
 * Reemplaza el array `COMPLETED_STATES` de `capacity.repository.ts`, que existía
 * sólo porque la base tiene cuatro grafías de lo mismo.
 */
export function isCompletedStatus(value: string | null | undefined): boolean {
    return normalizeTaskStatus(value) === 'COMPLETED';
}
