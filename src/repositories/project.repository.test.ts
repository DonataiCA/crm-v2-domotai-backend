import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` es hoisted al inicio del archivo, así que las variables que
// referencia deben venir de `vi.hoisted()` — si no, revientan con un
// "Cannot access before initialization" en tiempo de import.
const { updateMany, findFirst, deleteMany, phaseUpdateMany, phaseFindFirst, phaseDeleteMany } = vi.hoisted(() => ({
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    phaseUpdateMany: vi.fn(),
    phaseFindFirst: vi.fn(),
    phaseDeleteMany: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        projectTask: { updateMany, findFirst, deleteMany },
        projectPhase: { updateMany: phaseUpdateMany, findFirst: phaseFindFirst, deleteMany: phaseDeleteMany },
    },
}));

import { ProjectRepository } from './project.repository';

beforeEach(() => { vi.clearAllMocks(); });

describe('ProjectRepository.updateTask', () => {
    it('filtra por organizationId, no sólo por id', async () => {
        updateMany.mockResolvedValue({ count: 1 });
        findFirst.mockResolvedValue({ id: 't1', title: 'X' });

        await ProjectRepository.updateTask('t1', 'org-A', { title: 'X' });

        expect(updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 't1', organizationId: 'org-A' } }),
        );
    });

    it('devuelve null cuando la tarea es de otra organización', async () => {
        updateMany.mockResolvedValue({ count: 0 });

        const result = await ProjectRepository.updateTask('t1', 'org-B', { title: 'X' });

        expect(result).toBeNull();
        expect(findFirst).not.toHaveBeenCalled();
    });

    it('devuelve la tarea actualizada cuando pertenece a la organización', async () => {
        updateMany.mockResolvedValue({ count: 1 });
        findFirst.mockResolvedValue({ id: 't1', title: 'X' });

        const result = await ProjectRepository.updateTask('t1', 'org-A', { title: 'X' });

        expect(result).toEqual({ id: 't1', title: 'X' });
        expect(findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 't1', organizationId: 'org-A' } }),
        );
    });
});

describe('ProjectRepository.deleteTask', () => {
    it('filtra por organizationId, no sólo por id', async () => {
        deleteMany.mockResolvedValue({ count: 1 });

        await ProjectRepository.deleteTask('t1', 'org-A');

        expect(deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 't1', organizationId: 'org-A' } }),
        );
    });

    it('devuelve false cuando no borró nada', async () => {
        deleteMany.mockResolvedValue({ count: 0 });
        expect(await ProjectRepository.deleteTask('t1', 'org-B')).toBe(false);
    });

    it('devuelve true cuando borró la tarea de su propia organización', async () => {
        deleteMany.mockResolvedValue({ count: 1 });
        expect(await ProjectRepository.deleteTask('t1', 'org-A')).toBe(true);
    });
});

describe('ProjectRepository.updatePhase', () => {
    it('filtra por el proyecto de la organización, no sólo por id', async () => {
        phaseUpdateMany.mockResolvedValue({ count: 1 });
        phaseFindFirst.mockResolvedValue({ id: 'p1', name: 'X' });

        await ProjectRepository.updatePhase('p1', 'org-A', { name: 'X' });

        expect(phaseUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'p1', project: { organizationId: 'org-A' } } }),
        );
    });

    it('devuelve null cuando la fase es de otra organización', async () => {
        phaseUpdateMany.mockResolvedValue({ count: 0 });

        const result = await ProjectRepository.updatePhase('p1', 'org-B', { name: 'X' });

        expect(result).toBeNull();
        expect(phaseFindFirst).not.toHaveBeenCalled();
    });

    it('devuelve la fase actualizada cuando pertenece a la organización', async () => {
        phaseUpdateMany.mockResolvedValue({ count: 1 });
        phaseFindFirst.mockResolvedValue({ id: 'p1', name: 'X' });

        const result = await ProjectRepository.updatePhase('p1', 'org-A', { name: 'X' });

        expect(result).toEqual({ id: 'p1', name: 'X' });
        expect(phaseFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'p1', project: { organizationId: 'org-A' } } }),
        );
    });
});

describe('ProjectRepository.deletePhase', () => {
    it('filtra por el proyecto de la organización, no sólo por id', async () => {
        phaseDeleteMany.mockResolvedValue({ count: 1 });

        await ProjectRepository.deletePhase('p1', 'org-A');

        expect(phaseDeleteMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'p1', project: { organizationId: 'org-A' } } }),
        );
    });

    it('devuelve false cuando la fase es de otra organización', async () => {
        phaseDeleteMany.mockResolvedValue({ count: 0 });
        expect(await ProjectRepository.deletePhase('p1', 'org-B')).toBe(false);
    });

    it('devuelve true cuando borró la fase de su propia organización', async () => {
        phaseDeleteMany.mockResolvedValue({ count: 1 });
        expect(await ProjectRepository.deletePhase('p1', 'org-A')).toBe(true);
    });
});
