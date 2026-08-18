import { describe, it, expect } from 'vitest';
import { createTaskSchema } from './task.validator';
import { createInvoiceSchema } from './invoice.validator';
import { createLeadSchema } from './lead.validator';

/**
 * La regla es la misma en todos los catálogos: **tolerante al leer, estricto al
 * guardar**. Entra cualquier grafía histórica, sale siempre el valor canónico, y
 * lo que no pertenece al catálogo se rechaza con un 400 en vez de llegar a la
 * base y reventar contra una CHECK.
 */

describe('createTaskSchema — estado y prioridad', () => {
    it('normaliza el estado en Title Case', () => {
        const result = createTaskSchema.safeParse({ title: 'T', status: 'In Progress' });
        expect(result.success && result.data.status).toBe('IN_PROGRESS');
    });

    it('resuelve los alias históricos de estado', () => {
        expect(createTaskSchema.safeParse({ title: 'T', status: 'Done' }).success).toBe(true);
        const blocked = createTaskSchema.safeParse({ title: 'T', status: 'Blocked' });
        expect(blocked.success && blocked.data.status).toBe('ON_HOLD');
    });

    it('normaliza la prioridad en minúscula', () => {
        const result = createTaskSchema.safeParse({ title: 'T', priority: 'urgent' });
        expect(result.success && result.data.priority).toBe('URGENT');
    });

    it('rechaza lo que no está en el catálogo, que antes llegaba a la base', () => {
        expect(createTaskSchema.safeParse({ title: 'T', status: 'EN_LIMBO' }).success).toBe(false);
        expect(createTaskSchema.safeParse({ title: 'T', priority: 'Critical' }).success).toBe(false);
    });

    it('ambos siguen siendo opcionales', () => {
        expect(createTaskSchema.safeParse({ title: 'T' }).success).toBe(true);
    });
});

describe('createInvoiceSchema — estado', () => {
    it('normaliza el estado en minúscula', () => {
        const result = createInvoiceSchema.safeParse({ status: 'paid' });
        expect(result.success && result.data.status).toBe('PAID');
    });

    it('acepta la grafía americana de CANCELLED', () => {
        const result = createInvoiceSchema.safeParse({ status: 'CANCELED' });
        expect(result.success && result.data.status).toBe('CANCELLED');
    });

    it('rechaza un estado inventado', () => {
        expect(createInvoiceSchema.safeParse({ status: 'REEMBOLSADA' }).success).toBe(false);
    });
});

describe('createLeadSchema — etapa', () => {
    it('acepta el nombre visible y guarda su slug', () => {
        // Es lo que manda un tablero desplegado antes que esta versión.
        const result = createLeadSchema.safeParse({ name: 'L', stage: 'Negociación' });
        expect(result.success && result.data.stage).toBe('negociacion');
    });

    it('deja intacto un slug que ya es canónico', () => {
        const result = createLeadSchema.safeParse({ name: 'L', stage: 'primer_contacto' });
        expect(result.success && result.data.stage).toBe('primer_contacto');
    });

    it('rechaza lo que no se puede convertir en slug', () => {
        expect(createLeadSchema.safeParse({ name: 'L', stage: '¿¡?' }).success).toBe(false);
    });

    it('sigue siendo opcional', () => {
        expect(createLeadSchema.safeParse({ name: 'L' }).success).toBe(true);
    });
});
