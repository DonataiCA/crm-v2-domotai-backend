import { z } from 'zod';
import {
    TASK_PRIORITIES,
    TASK_STATUSES,
    normalizeTaskPriority,
    normalizeTaskStatus,
    type TaskPriority,
    type TaskStatus,
} from '../../constants/enums';
import { isInvertedDateRange } from '../../validators/project.validator';
import {
    MAX_SYNC_TASKS,
    MAX_TEXT_CHARS,
    MAX_TITLE_CHARS,
    TASK_SYNC_FORMAT,
    TASK_SYNC_VERSION,
    type SyncIssue,
} from './format';

/**
 * Lectura del archivo JSON. Sólo comprueba que esté bien escrito; si lo que nombra
 * existe en el proyecto (áreas, responsables, ids) lo decide `plan.ts`.
 *
 * Como en `task-template.ts`, **nada se descarta en silencio**: un campo desconocido es
 * un error, no se ignora. Es lo contrario de los validadores Zod de las rutas, que
 * usan `.strip()`, y es deliberado: quien escribió ese campo espera verlo aplicado.
 *
 * Un campo ausente en una tarea existente significa "sin cambios", así que aquí se
 * conserva como `undefined`. Los valores por defecto de las tareas nuevas los pone
 * `plan.ts`.
 */

export interface ParsedDeliverable {
    path: string;
    id?: string;
    title: string;
    done: boolean;
    delete: boolean;
}

export interface ParsedTask {
    /** Posición en el array: también es su posición en la columna. */
    index: number;
    path: string;
    id?: string;
    rev?: string;
    title: string;
    description?: string | null;
    conclusion?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    phase?: string | null;
    assignee?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    progress?: number;
    tags?: string[];
    deliverables?: ParsedDeliverable[];
    delete: boolean;
}

export interface ParseResult {
    tasks: ParsedTask[];
    issues: SyncIssue[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `'2026-02-30'` cumple el patrón pero no existe: `Date` lo desplazaría a marzo. */
function isRealDay(value: string): boolean {
    if (!DAY.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const day = z
    .string()
    .refine(isRealDay, (value) => ({ message: `"${value}" no es una fecha válida. Usa AAAA-MM-DD.` }))
    .nullable()
    .optional();

const text = z.string().max(MAX_TEXT_CHARS, `Máximo ${MAX_TEXT_CHARS} caracteres.`).nullable().optional();

const title = z
    .string({ required_error: 'El título es obligatorio.' })
    .trim()
    .min(1, 'El título no puede estar vacío.')
    .max(MAX_TITLE_CHARS, `El título admite como máximo ${MAX_TITLE_CHARS} caracteres.`);

const status = z.string().transform((value, ctx) => {
    const normalized = normalizeTaskStatus(value);
    if (!normalized) {
        ctx.addIssue({ code: 'custom', message: `"${value}" no es un estado válido. Usa: ${TASK_STATUSES.join(', ')}.` });
        return z.NEVER;
    }
    return normalized;
});

const priority = z.string().transform((value, ctx) => {
    const normalized = normalizeTaskPriority(value);
    if (!normalized) {
        ctx.addIssue({ code: 'custom', message: `"${value}" no es una prioridad válida. Usa: ${TASK_PRIORITIES.join(', ')}.` });
        return z.NEVER;
    }
    return normalized;
});

const deliverableSchema = z
    .object({
        id: z.string().min(1).optional(),
        title: z.string().trim().min(1, 'El entregable necesita un título.').max(MAX_TITLE_CHARS),
        done: z.boolean({ invalid_type_error: 'done debe ser true o false.' }).default(false),
        delete: z.boolean().optional(),
    })
    .strict();

const taskSchema = z
    .object({
        id: z.string().min(1).optional(),
        rev: z.string().min(1).optional(),
        title,
        description: text,
        conclusion: text,
        status: status.optional(),
        priority: priority.optional(),
        phase: z.string().trim().min(1, 'Escribe el nombre del área o usa null.').nullable().optional(),
        assignee: z.string().trim().min(1, 'Escribe el email del responsable o usa null.').nullable().optional(),
        startDate: day,
        dueDate: day,
        progress: z
            .number({ invalid_type_error: 'progress debe ser un número.' })
            .int('progress debe ser un entero.')
            .min(0, 'progress va de 0 a 100.')
            .max(100, 'progress va de 0 a 100.')
            .optional(),
        tags: z.array(z.string().trim().min(1, 'Una etiqueta no puede estar vacía.').max(100)).optional(),
        deliverables: z.array(deliverableSchema).optional(),
        delete: z.boolean().optional(),
        // Contexto para quien edita el archivo; al importar se ignora.
        readOnly: z.unknown().optional(),
    })
    .strict();

const TASK_FIELDS = Object.keys(taskSchema.shape).join(', ');

function formatPath(path: Array<string | number>): string {
    return path.reduce<string>(
        (acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part),
        '',
    );
}

function zodMessage(issue: z.ZodIssue): string {
    if (issue.code === 'unrecognized_keys') {
        return `Campo desconocido: ${issue.keys.join(', ')}. Los campos válidos son: ${TASK_FIELDS}.`;
    }
    if (issue.code === 'invalid_type' && issue.received === 'undefined') return 'Falta este campo.';
    if (issue.code === 'invalid_type' && !issue.message.startsWith('Expected')) return issue.message;
    if (issue.code === 'invalid_type') return `Tipo incorrecto: se esperaba ${issue.expected} y llegó ${issue.received}.`;
    return issue.message;
}

export function parseSyncDocument(content: string): ParseResult {
    let raw: any;
    try {
        raw = JSON.parse(content);
    } catch (error) {
        return {
            tasks: [],
            issues: [{ path: '', message: `El archivo no es un JSON válido: ${(error as Error).message}` }],
        };
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { tasks: [], issues: [{ path: '', message: 'El archivo debe ser un objeto JSON.' }] };
    }
    if (raw.format !== TASK_SYNC_FORMAT) {
        return {
            tasks: [],
            issues: [{ path: 'format', message: `No es un archivo de tareas del CRM: format debe ser "${TASK_SYNC_FORMAT}".` }],
        };
    }
    if (raw.version !== TASK_SYNC_VERSION) {
        return {
            tasks: [],
            issues: [{
                path: 'version',
                message: `El archivo es de la versión ${raw.version} del formato y este CRM lee la versión ${TASK_SYNC_VERSION}. Exporta de nuevo.`,
            }],
        };
    }
    if (!Array.isArray(raw.tasks)) {
        return { tasks: [], issues: [{ path: 'tasks', message: 'tasks debe ser una lista de tareas.' }] };
    }
    if (raw.tasks.length > MAX_SYNC_TASKS) {
        return {
            tasks: [],
            issues: [{ path: 'tasks', message: `El archivo tiene ${raw.tasks.length} tareas; el máximo son ${MAX_SYNC_TASKS}.` }],
        };
    }

    const tasks: ParsedTask[] = [];
    const issues: SyncIssue[] = [];
    const seenTaskIds = new Set<string>();

    raw.tasks.forEach((item: unknown, index: number) => {
        const path = `tasks[${index}]`;
        const rawTitle = typeof (item as any)?.title === 'string' ? (item as any).title.trim() : undefined;
        const at = (subPath: string, message: string): SyncIssue => ({
            path: subPath ? `${path}.${subPath}` : path,
            taskTitle: rawTitle || undefined,
            message,
        });

        const result = taskSchema.safeParse(item);
        if (!result.success) {
            for (const issue of result.error.issues) issues.push(at(formatPath(issue.path), zodMessage(issue)));
            return;
        }
        const t = result.data;
        const before = issues.length;

        if (t.id) {
            if (seenTaskIds.has(t.id)) issues.push(at('id', `El id ${t.id} está repetido en el archivo.`));
            seenTaskIds.add(t.id);
            if (!t.rev) issues.push(at('rev', 'Falta rev. No lo borres: sirve para detectar cambios hechos en el CRM.'));
        }
        if (t.startDate && t.dueDate && isInvertedDateRange(t.startDate, t.dueDate)) {
            issues.push(at('dueDate', `El vencimiento (${t.dueDate}) es anterior al inicio (${t.startDate}).`));
        }

        const seenDeliverableIds = new Set<string>();
        const deliverables = t.deliverables?.map((d, i) => {
            if (d.id) {
                if (seenDeliverableIds.has(d.id)) {
                    issues.push(at(`deliverables[${i}].id`, `El id de entregable ${d.id} está repetido.`));
                }
                seenDeliverableIds.add(d.id);
            }
            return { path: `${path}.deliverables[${i}]`, id: d.id, title: d.title, done: d.done, delete: d.delete === true };
        });

        if (issues.length > before) return;
        tasks.push({
            index,
            path,
            id: t.id,
            rev: t.rev,
            title: t.title,
            description: t.description,
            conclusion: t.conclusion,
            status: t.status,
            priority: t.priority,
            phase: t.phase,
            assignee: t.assignee,
            startDate: t.startDate,
            dueDate: t.dueDate,
            progress: t.progress,
            tags: t.tags,
            deliverables,
            delete: t.delete === true,
        });
    });

    return { tasks: issues.length ? [] : tasks, issues };
}
