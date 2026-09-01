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
    // El validador ya NO muta ni rechaza por formato: acepta el valor tal cual
    // (slug con guion, con guion bajo, o el nombre visible de un cliente viejo).
    // La existencia en el pipeline y la canonicalización a slug las hace el
    // controlador (resolveStage), que es donde se conoce el pipeline.
    it('acepta el nombre visible tal cual (lo resuelve el controlador)', () => {
        const result = createLeadSchema.safeParse({ name: 'L', stage: 'Negociación' });
        expect(result.success && result.data.stage).toBe('Negociación');
    });

    it('acepta un slug con guion sin mutarlo', () => {
        const result = createLeadSchema.safeParse({ name: 'L', stage: 'first-meeting' });
        expect(result.success && result.data.stage).toBe('first-meeting');
    });

    it('acepta un slug con guion bajo', () => {
        const result = createLeadSchema.safeParse({ name: 'L', stage: 'primer_contacto' });
        expect(result.success && result.data.stage).toBe('primer_contacto');
    });

    it('rechaza una etapa demasiado larga (>50)', () => {
        expect(createLeadSchema.safeParse({ name: 'L', stage: 'x'.repeat(51) }).success).toBe(false);
    });

    it('sigue siendo opcional', () => {
        expect(createLeadSchema.safeParse({ name: 'L' }).success).toBe(true);
    });
});
