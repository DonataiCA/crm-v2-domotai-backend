import { describe, it, expect } from 'vitest';
import {
    createProjectSchema,
    updateProjectSchema,
    createPhaseSchema,
    createProjectTaskSchema,
} from './project.validator';

const PHASE_ID = '11111111-1111-4111-8111-111111111111';

describe('createProjectSchema.status', () => {
    it('acepta los cinco estados canónicos', () => {
        for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']) {
            expect(createProjectSchema.safeParse({ name: 'P', status }).success, status).toBe(true);
        }
    });

    it('rechaza el vocabulario Title Case que había en la base', () => {
        expect(createProjectSchema.safeParse({ name: 'P', status: 'Not Started' }).success).toBe(false);
        expect(createProjectSchema.safeParse({ name: 'P', status: 'Archived' }).success).toBe(false);
    });

    it('rechaza un estado inventado', () => {
        expect(createProjectSchema.safeParse({ name: 'P', status: 'Cancelado' }).success).toBe(false);
    });

    it('sigue siendo opcional', () => {
        expect(createProjectSchema.safeParse({ name: 'P' }).success).toBe(true);
    });
});

describe('updateProjectSchema', () => {
    it('hereda la restricción de estado', () => {
        expect(updateProjectSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(true);
        expect(updateProjectSchema.safeParse({ status: 'Archived' }).success).toBe(false);
    });
});

describe('createPhaseSchema.status', () => {
    it('sólo acepta los estados de fase, en minúscula', () => {
        expect(createPhaseSchema.safeParse({ name: 'F1', status: 'active' }).success).toBe(true);
        expect(createPhaseSchema.safeParse({ name: 'F1', status: 'ACTIVE' }).success).toBe(false);
    });
});

describe('createProjectTaskSchema', () => {
    it('acepta estado y prioridad canónicos', () => {
        const result = createProjectTaskSchema.safeParse({
            title: 'T', phaseId: PHASE_ID, status: 'IN_PROGRESS', priority: 'HIGH',
        });
        expect(result.success).toBe(true);
    });

    it('rechaza una prioridad alucinada', () => {
        const result = createProjectTaskSchema.safeParse({
            title: 'T', phaseId: PHASE_ID, priority: 'urgentísimo',
        });
        expect(result.success).toBe(false);
    });

    it('rechaza un estado fuera del catálogo', () => {
        const result = createProjectTaskSchema.safeParse({
            title: 'T', phaseId: PHASE_ID, status: 'DONE',
        });
        expect(result.success).toBe(false);
    });

    it('sigue exigiendo phaseId', () => {
        expect(createProjectTaskSchema.safeParse({ title: 'T' }).success).toBe(false);
    });
});
