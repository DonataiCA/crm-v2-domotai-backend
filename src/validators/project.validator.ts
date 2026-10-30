import { z } from 'zod';
import {
    PROJECT_STATUSES,
    TASK_STATUSES,
    TASK_PRIORITIES,
    PHASE_STATUSES,
    PRICING_TYPES,
    normalizeProjectStatus,
    normalizeTaskStatus,
    normalizeTaskPriority,
    normalizePhaseStatus,
} from '../constants/enums';
import { tolerantEnum } from './catalog';

import {
    MAX_CHAT_MESSAGE_CHARS,
    MAX_DOCUMENT_CHARS,
    MAX_DOCUMENT_FILENAME_CHARS,
    MAX_TEMPLATE_CHARS,
} from '../constants/document';

export const PHASE_DATE_RANGE_MESSAGE = 'End date must be on or after the start date';
export const CHAT_TASK_EMPTY_MESSAGE = 'A message or a document is required';
export const TASK_DATE_RANGE_MESSAGE = 'Due date must be on or after the start date';

/**
 * True only when both ends of the range are present, parseable and inverted.
 * Missing or unparseable values are left to their own validation — this check
 * is exclusively about the order of the two dates.
 */
export function isInvertedDateRange(
    start: string | Date | null | undefined,
    end: string | Date | null | undefined,
): boolean {
    if (!start || !end) return false;

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return false;

    return endTime < startTime;
}

/**
 * Todas las columnas de `Project` que el cliente puede escribir. Lo que no esté aquí
 * lo descarta `.strip()` sin avisar (el PUT devuelve 200 y no guarda nada), así que
 * una columna nueva que edite el frontend se declara aquí en el mismo cambio.
 * `organizationId`, `createdBy`, `monitorApiKey` y los marcadores de recordatorio
 * quedan fuera a propósito: los pone el servidor.
 */
export const createProjectSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    description: z.string().max(10000).optional().nullable(),
    status: tolerantEnum(PROJECT_STATUSES, normalizeProjectStatus).optional(),
    complexity: z.string().max(50).optional().nullable(),
    price: z.number().or(z.string().transform(Number)).optional().nullable(),
    pricingType: z.enum(PRICING_TYPES).optional().nullable(),
    revenue: z.number().or(z.string().transform(Number)).optional().nullable(),
    paymentDate: z.string().optional().nullable(),
    recurringStartDate: z.string().optional().nullable(),
    recurringEndDate: z.string().optional().nullable(),
    commissionPaid: z.boolean().optional(),
    totalHours: z.number().or(z.string().transform(Number)).optional().nullable(),
    prd: z.string().max(200000).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    repositoryUrl: z.string().max(2000).optional().nullable(),
    repositoryName: z.string().max(200).optional().nullable(),
    githubOwner: z.string().max(200).optional().nullable(),
    defaultBranch: z.string().max(200).optional().nullable(),
    productionUrl: z.string().max(2000).optional().nullable(),
    projectLeadId: z.string().uuid().optional().nullable(),
}).strip();

export const updateProjectSchema = createProjectSchema.partial();

export const createPhaseSchema = z.object({
    name: z.string().min(1, 'Phase name is required').max(200),
    status: tolerantEnum(PHASE_STATUSES, normalizePhaseStatus).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    orderIndex: z.number().int().optional(),
}).strip().superRefine((values, ctx) => {
    if (isInvertedDateRange(values.startDate, values.endDate)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: PHASE_DATE_RANGE_MESSAGE,
        });
    }
});

/**
 * Cuerpo de `POST /projects/:projectId/chat-task`.
 *
 * Acepta una instrucción escrita, un documento arrastrado, o los dos. `message` es
 * opcional porque soltar un `.md` sin escribir nada es un uso legítimo; el `superRefine`
 * es lo que impide que lleguen ambos vacíos.
 *
 * El documento va en su propio campo y no concatenado al mensaje: es lo que permite
 * aplicarles topes distintos, delimitarlo dentro del prompt y decir en el error cuál de
 * los dos se pasó de largo.
 */
export const chatTaskSchema = z.object({
    message: z.string().max(MAX_CHAT_MESSAGE_CHARS).optional(),
    document: z.object({
        fileName: z.string().min(1, 'File name is required').max(MAX_DOCUMENT_FILENAME_CHARS),
        content: z
            .string()
            .min(1, 'The document is empty')
            .max(MAX_DOCUMENT_CHARS, `The document exceeds ${MAX_DOCUMENT_CHARS} characters`),
    }).strip().optional(),
}).strip().superRefine((values, ctx) => {
    if (!values.message?.trim() && !values.document) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['message'],
            message: CHAT_TASK_EMPTY_MESSAGE,
        });
    }
});

/**
 * Cuerpo de `POST /projects/:projectId/import-tasks`.
 *
 * Hermano de `chatTaskSchema`, pero sin `message`: la importación por plantilla no tiene
 * instrucción escrita a mano, el archivo es toda la petición. El tope del contenido es
 * mucho más alto porque no acaba dentro de ningún prompt: lo lee `parseTaskTemplate`.
 *
 * Aquí sólo se comprueba la forma del sobre. Lo que hay dentro del archivo lo valida el
 * parser línea a línea, que es quien puede decir *dónde* está el error.
 */
export const importTasksSchema = z.object({
    document: z.object({
        fileName: z.string().min(1, 'File name is required').max(MAX_DOCUMENT_FILENAME_CHARS),
        content: z
            .string()
            .min(1, 'The document is empty')
            .max(MAX_TEMPLATE_CHARS, `The document exceeds ${MAX_TEMPLATE_CHARS} characters`),
    }).strip(),
}).strip();

export const createProjectTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(10000).optional().nullable(),
    status: tolerantEnum(TASK_STATUSES, normalizeTaskStatus).optional(),
    priority: tolerantEnum(TASK_PRIORITIES, normalizeTaskPriority).optional().nullable(),
    // A task must always belong to a phase — no unassigned tasks on creation.
    phaseId: z
        .string({ required_error: 'Phase is required', invalid_type_error: 'Phase is required' })
        .uuid('Phase is required'),
    assignedTo: z.string().uuid().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    estimatedHours: z.number().optional().nullable(),
    progress: z.number().int().min(0).max(100).optional(),
}).strip().superRefine((values, ctx) => {
    if (isInvertedDateRange(values.startDate, values.dueDate)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dueDate'],
            message: TASK_DATE_RANGE_MESSAGE,
        });
    }
});

/**
 * Cuerpo de `PUT /projects/project-tasks/:taskId`. Sin él el controlador esparcía
 * req.body en Prisma (organizationId, projectId, createdBy...). Refleja
 * `ProjectTaskPayload` del frontend; el orden de fechas lo comprueba el
 * controlador contra la fila existente.
 */
export const updateProjectTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500).optional(),
    description: z.string().max(10000).optional().nullable(),
    conclusion: z.string().max(10000).optional().nullable(),
    status: tolerantEnum(TASK_STATUSES, normalizeTaskStatus).optional(),
    priority: tolerantEnum(TASK_PRIORITIES, normalizeTaskPriority).optional().nullable(),
    phaseId: z.string().uuid().optional().nullable(),
    orderIndex: z.number().int().optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
    startDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    completedAt: z.string().optional().nullable(),
    progress: z.number().int().min(0).max(100).optional(),
}).strip();

/** Cuerpo de `PUT /projects/phases/:phaseId`. Refleja `ProjectPhasePayload` del frontend. */
export const updatePhaseSchema = z.object({
    name: z.string().min(1, 'Phase name is required').max(200).optional(),
    description: z.string().max(10000).optional().nullable(),
    status: tolerantEnum(PHASE_STATUSES, normalizePhaseStatus).optional().nullable(),
    orderIndex: z.number().int().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
}).strip();

export const createProjectLinkSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    url: z.string().min(1, 'URL is required').max(2000),
    description: z.string().max(2000).optional().nullable(),
    orderIndex: z.number().int().optional(),
}).strip();

export const updateProjectLinkSchema = createProjectLinkSchema.partial();

export const reorderProjectLinksSchema = z.object({
    orderedIds: z.array(z.string().uuid()).min(1, 'orderedIds is required'),
}).strip();

/** Orden de una columna del Kanban: la posición en el array es el `orderIndex`. */
export const reorderProjectTasksSchema = z.object({
    orderedIds: z.array(z.string().uuid()).min(1, 'orderedIds is required').max(5000),
}).strip();

export const createTaskDeliverableSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    orderIndex: z.number().int().optional(),
}).strip();

export const updateTaskDeliverableSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
}).strip();
