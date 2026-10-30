import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    task: { findMany: vi.fn() },
    projectTask: { findMany: vi.fn() },
}));
vi.mock('../config/prisma', () => ({ prisma: prismaMock }));

import { TaskRepository } from './task.repository';
import { ProjectRepository } from './project.repository';

beforeEach(() => vi.clearAllMocks());

/**
 * El recordatorio "vence pronto" sólo cubre lo que vence dentro de la ventana. Una
 * tarea vencida hace días no es "pronto": antes el filtro era sólo `lte` y la avisaba.
 */
describe('ventana de recordatorios por vencimiento', () => {
    const from = new Date('2026-10-29T23:00:00Z');
    const threshold = new Date('2026-10-31T23:00:00Z');

    it('Task: dueDate entre from y threshold', async () => {
        await TaskRepository.findDueSoon(from, threshold);
        expect(prismaMock.task.findMany.mock.calls[0][0].where.dueDate).toEqual({ gte: from, lte: threshold });
    });

    it('ProjectTask: dueDate entre from y threshold', async () => {
        await ProjectRepository.findTasksDueSoon(from, threshold);
        expect(prismaMock.projectTask.findMany.mock.calls[0][0].where.dueDate).toEqual({ gte: from, lte: threshold });
    });
});
