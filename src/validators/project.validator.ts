import { z } from 'zod';
import {
    PROJECT_STATUSES,
    TASK_STATUSES,
    TASK_PRIORITIES,
    PHASE_STATUSES,
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

export const createProjectSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    description: z.string().max(10000).optional().nullable(),
    status: tolerantEnum(PROJECT_STATUSES, normalizeProjectStatus).optional(),
    price: z.number().or(z.string().transform(Number)).optional().nullable(),
    revenue: z.number().or(z.string().transform(Number)).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
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
}).strip().superRefine((values, ctx) => {
    if (isInvertedDateRange(values.startDate, values.dueDate)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dueDate'],
            message: TASK_DATE_RANGE_MESSAGE,
        });
    }
});
