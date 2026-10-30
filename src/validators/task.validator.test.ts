import { describe, it, expect } from 'vitest';
import { bulkUpdateTaskSchema } from './task.validator';

const ID = '11111111-1111-4111-8111-111111111111';

// PUT /tasks/bulk esparcía el resto del body en updateMany: con un solo request
// se podía mover tareas a otra organización o reescribir su autor.
describe('bulkUpdateTaskSchema', () => {
    it('exige una lista de ids', () => {
        expect(bulkUpdateTaskSchema.safeParse({ status: 'TODO' }).success).toBe(false);
        expect(bulkUpdateTaskSchema.safeParse({ ids: [], status: 'TODO' }).success).toBe(false);
    });

    it('acepta los campos editables de una tarea', () => {
        const result = bulkUpdateTaskSchema.safeParse({
            ids: [ID], status: 'COMPLETED', priority: 'LOW', assignedTo: ID, dueDate: '2026-11-01',
        });
        expect(result.success).toBe(true);
    });

    it('descarta organizationId, createdBy y los marcadores de recordatorio', () => {
        const result = bulkUpdateTaskSchema.safeParse({
            ids: [ID], status: 'TODO', organizationId: 'otra', createdBy: 'x', reminderSentAt: null,
        });
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(Object.keys(result.data).sort()).toEqual(['ids', 'status']);
    });

    it('rechaza un estado que no existe', () => {
        expect(bulkUpdateTaskSchema.safeParse({ ids: [ID], status: 'EN_LIMBO' }).success).toBe(false);
    });
});
