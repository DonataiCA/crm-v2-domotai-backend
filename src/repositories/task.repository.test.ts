import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock se hoistea al inicio del archivo, así que las variables que
// referencia deben venir de vi.hoisted().
const { commentDeleteMany, linkDeleteMany } = vi.hoisted(() => ({
    commentDeleteMany: vi.fn(),
    linkDeleteMany: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        taskComment: { deleteMany: commentDeleteMany },
        taskLink: { deleteMany: linkDeleteMany },
    },
}));

import { TaskRepository } from './task.repository';

beforeEach(() => { vi.clearAllMocks(); });

// I3: deleteComment borraba con `delete({ where: { id } })`, sin comprobar
// organizationId en absoluto — cualquier commentId de cualquier organización
// se podía borrar adivinando el UUID.
describe('TaskRepository.deleteComment', () => {
    it('filtra por organizationId, no sólo por id', async () => {
        commentDeleteMany.mockResolvedValue({ count: 1 });

        await TaskRepository.deleteComment('c1', 'org-A');

        expect(commentDeleteMany).toHaveBeenCalledWith({ where: { id: 'c1', organizationId: 'org-A' } });
    });

    it('devuelve false cuando el comentario es de otra organización', async () => {
        commentDeleteMany.mockResolvedValue({ count: 0 });
        expect(await TaskRepository.deleteComment('c1', 'org-B')).toBe(false);
    });

    it('devuelve true cuando borró el comentario de su propia organización', async () => {
        commentDeleteMany.mockResolvedValue({ count: 1 });
        expect(await TaskRepository.deleteComment('c1', 'org-A')).toBe(true);
    });
});

// I3: deleteLink tenía el mismo agujero, mismo patrón de arreglo.
describe('TaskRepository.deleteLink', () => {
    it('filtra por organizationId, no sólo por id', async () => {
        linkDeleteMany.mockResolvedValue({ count: 1 });

        await TaskRepository.deleteLink('l1', 'org-A');

        expect(linkDeleteMany).toHaveBeenCalledWith({ where: { id: 'l1', organizationId: 'org-A' } });
    });

    it('devuelve false cuando el link es de otra organización', async () => {
        linkDeleteMany.mockResolvedValue({ count: 0 });
        expect(await TaskRepository.deleteLink('l1', 'org-B')).toBe(false);
    });

    it('devuelve true cuando borró el link de su propia organización', async () => {
        linkDeleteMany.mockResolvedValue({ count: 1 });
        expect(await TaskRepository.deleteLink('l1', 'org-A')).toBe(true);
    });
});
