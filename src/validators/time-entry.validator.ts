import { z } from 'zod';

/**
 * Cuerpos de las rutas de `/time-entries`. Antes no había validador y el
 * controlador esparcía req.body en Prisma: se podía cambiar organizationId o
 * imputar las horas a otra persona. `userId` y `organizationId` los pone el
 * servidor.
 */
export const createTimeEntrySchema = z.object({
    projectId: z.string().uuid().optional().nullable(),
    projectTaskId: z.string().uuid().optional().nullable(),
    taskId: z.string().uuid().optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    durationMinutes: z.number().int().min(0).optional().nullable(),
    billable: z.boolean().optional(),
    hourlyRate: z.number().min(0).or(z.string().transform(Number)).optional().nullable(),
}).strip();

export const updateTimeEntrySchema = createTimeEntrySchema;

/** El temporizador arranca "ahora": la hora de inicio y el fin no los decide el cliente. */
export const startTimerSchema = createTimeEntrySchema.omit({
    startTime: true,
    endTime: true,
    durationMinutes: true,
});
