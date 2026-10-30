import { describe, it, expect } from 'vitest';
import { createTimeEntrySchema, updateTimeEntrySchema, startTimerSchema } from './time-entry.validator';

const ID = '11111111-1111-4111-8111-111111111111';

// Las rutas de time-entries no tenían validador y el controlador esparcía
// req.body en Prisma: se podía cambiar organizationId o el dueño de la entrada.
describe('createTimeEntrySchema', () => {
    const payload = {
        projectId: ID, projectTaskId: ID, taskId: null, description: 'Revisión',
        startTime: '2026-10-30T10:00:00.000Z', endTime: '2026-10-30T11:30:00.000Z',
        durationMinutes: 90, billable: true, hourlyRate: 45.5,
    };

    it('conserva lo que manda la pantalla de Time Tracking', () => {
        const result = createTimeEntrySchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (!result.success) return;
        for (const key of Object.keys(payload)) expect(result.data, key).toHaveProperty(key);
    });

    it('descarta organizationId y userId', () => {
        const result = createTimeEntrySchema.safeParse({ ...payload, organizationId: 'otra', userId: 'otro' });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).not.toHaveProperty('organizationId');
        expect(result.data).not.toHaveProperty('userId');
    });

    it('rechaza una duración negativa', () => {
        expect(createTimeEntrySchema.safeParse({ durationMinutes: -5 }).success).toBe(false);
    });
});

describe('updateTimeEntrySchema', () => {
    it('acepta una edición parcial', () => {
        expect(updateTimeEntrySchema.safeParse({ description: 'x' }).success).toBe(true);
    });

    it('descarta userId: no se puede reasignar la entrada a otra persona', () => {
        const result = updateTimeEntrySchema.safeParse({ description: 'x', userId: 'otro' });
        expect(result.success && Object.keys(result.data)).toEqual(['description']);
    });
});

describe('startTimerSchema', () => {
    it('acepta un cuerpo vacío, que es lo que manda el botón de iniciar', () => {
        expect(startTimerSchema.safeParse({}).success).toBe(true);
    });

    it('no deja fijar la hora de inicio ni el fin desde el cliente', () => {
        const result = startTimerSchema.safeParse({ startTime: '2020-01-01T00:00:00Z', endTime: 'x' });
        expect(result.success && Object.keys(result.data)).toEqual([]);
    });
});
