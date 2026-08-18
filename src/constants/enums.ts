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

/**
 * Minúscula a propósito, y con `create_task`/`edit_task`: es el vocabulario que
 * `portal.controller.ts` comprueba de verdad (líneas 382, 463 y 515) y el que
 * tienen las filas de `project_shares`. La versión anterior de esta constante
 * decía VIEW/COMMENT/EDIT, que no coincidía ni con el código ni con la base:
 * era el catálogo el que estaba mal, no los datos.
 */
export const SHARE_PERMISSIONS = ['view', 'comment', 'create_task', 'edit_task'] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/** El default que `portal.controller` ya aplicaba al compartir sin especificar. */
export const DEFAULT_SHARE_PERMISSIONS = 'view,comment';

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
 * Para comparaciones en JavaScript sobre valores que pueden venir de fuera
 * (importaciones, salida de la IA), no para filtros de Prisma: en un `where`
 * no cabe una función, y ahí va el literal del catálogo. Con la base ya
 * normalizada, `status: { not: 'COMPLETED' }` es exacto.
 */
export function isCompletedStatus(value: string | null | undefined): boolean {
    return normalizeTaskStatus(value) === 'COMPLETED';
}

/**
 * Estricto a propósito, al revés que los predicados de `roles.ts`: responde
 * "¿es este valor exactamente uno de los que la columna admite?". Tras el CHECK
 * de `project_shares.permissions` sólo cabe la minúscula, así que un predicado
 * que diera por bueno 'VIEW' mentiría sobre lo que se puede guardar.
 * La tolerancia con espacios y casing vive en `normalizeSharePermissions`,
 * que es la puerta de entrada.
 */
export function isSharePermission(value: string | null | undefined): boolean {
    if (!value) return false;
    return (SHARE_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * `" View , COMMENT "` → `"view,comment"`. Devuelve null si algún elemento no
 * está en el catálogo: en un permiso, descartar en silencio lo desconocido es
 * peor que fallar, porque concede o quita accesos sin que nadie se entere.
 */
export function normalizeSharePermissions(
    value: string | string[] | null | undefined,
): string | null {
    if (value === null || value === undefined) return null;

    const parts = (Array.isArray(value) ? value : String(value).split(','))
        .map((p) => String(p).trim().toLowerCase())
        .filter((p) => p.length > 0);

    if (parts.length === 0) return null;
    if (!parts.every((p) => (SHARE_PERMISSIONS as readonly string[]).includes(p))) return null;

    // Se reordena según el catálogo para que dos peticiones equivalentes
    // produzcan la misma cadena en base y el CHECK de T10 sea predecible.
    return SHARE_PERMISSIONS.filter((p) => parts.includes(p)).join(',');
}

/**
 * `'Negociación'` → `'negociacion'`. Es el puente entre `PipelineStage.name`
 * (lo que se muestra) y `PipelineStage.slug` (lo que se guarda en `Lead.stage`).
 * La descomposición NFD + borrado de diacríticos es lo único que separa uno de
 * otro en los pipelines reales, y es idempotente: aplicarlo a un slug lo deja
 * igual, de modo que el backfill se puede correr dos veces sin daño.
 */
export function slugifyStage(value: string | null | undefined): string {
    if (!value) return '';
    return String(value)
        .normalize('NFD')
        // ̀-ͯ es el bloque de diacríticos combinantes que NFD separa
        // de la letra base. Con escapes y no con los caracteres literales:
        // son invisibles en un editor y se pierden al copiar.
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}
