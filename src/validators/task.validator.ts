import { z } from 'zod';
import { TASK_STATUSES, TASK_PRIORITIES, normalizeTaskStatus, normalizeTaskPriority } from '../constants/enums';
import { tolerantEnum } from './catalog';

export const createTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().max(10000).optional().nullable(),
    // Antes eran cadenas libres: cualquier valor pasaba el validador y lo
    // rechazaba la CHECK de la base, convirtiendo un 400 legible en un 500.
    status: tolerantEnum(TASK_STATUSES, normalizeTaskStatus).optional(),
    priority: tolerantEnum(TASK_PRIORITIES, normalizeTaskPriority).optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    // Sin declararlo, `.strip()` lo descartaba en silencio y el recordatorio
    // nunca se guardaba (el controlador sí lo lee en task.controller.ts).
    reminderDate: z.string().optional().nullable(),
}).strip();

export const updateTaskSchema = createTaskSchema.partial();

export const addCommentSchema = z.object({
    content: z.string().min(1, 'Comment content is required').max(10000),
}).strip();

/**
 * Cuerpo de `PUT /tasks/bulk`. Antes el resto del body iba tal cual a updateMany,
 * así que se podía mover tareas de organización o reescribir su autor.
 */
export const bulkUpdateTaskSchema = createTaskSchema.omit({ title: true }).partial().extend({
    ids: z.array(z.string().uuid()).min(1, 'ids array is required'),
}).strip();
