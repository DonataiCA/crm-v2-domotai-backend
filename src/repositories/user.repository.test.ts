import { describe, it, expect, vi, beforeEach } from 'vitest';

const { userFindMany, userFindFirst, userFindUnique, userCount } = vi.hoisted(() => ({
    userFindMany: vi.fn(),
    userFindFirst: vi.fn(),
    userFindUnique: vi.fn(),
    userCount: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        user: { findMany: userFindMany, findFirst: userFindFirst, findUnique: userFindUnique, count: userCount },
    },
}));

import { UserRepository } from './user.repository';

beforeEach(() => { vi.clearAllMocks(); });

/**
 * V2: `GET /users` devolvía el directorio de TODOS los inquilinos. El scoping
 * por organización se cuela como filtro sobre la membresía del perfil:
 * `profile.organizationMembers.some.organizationId`.
 */
describe('UserRepository.findAll — aislamiento por organización', () => {
    it('filtra por la membresía de la organización cuando se pasa organizationId', async () => {
        userFindMany.mockResolvedValue([]);

        await UserRepository.findAll(0, 20, { organizationId: 'org-A' });

        const arg = userFindMany.mock.calls[0][0];
        expect(arg.where.profile).toEqual({
            organizationMembers: { some: { organizationId: 'org-A' } },
        });
    });

    it('combina el scoping con la búsqueda de texto', async () => {
        userFindMany.mockResolvedValue([]);

        await UserRepository.findAll(0, 20, { organizationId: 'org-A', search: 'ana' });

        const arg = userFindMany.mock.calls[0][0];
        expect(arg.where.profile).toEqual({
            organizationMembers: { some: { organizationId: 'org-A' } },
        });
        expect(arg.where.OR).toBeDefined();
    });
});

describe('UserRepository.count — aislamiento por organización', () => {
    it('cuenta sólo miembros de la organización', async () => {
        userCount.mockResolvedValue(0);

        await UserRepository.count({ organizationId: 'org-A' });

        const arg = userCount.mock.calls[0][0];
        expect(arg.where.profile).toEqual({
            organizationMembers: { some: { organizationId: 'org-A' } },
        });
    });
});

describe('UserRepository.findById — aislamiento por organización', () => {
    it('acota por membresía de la organización cuando se pasa organizationId', async () => {
        userFindFirst.mockResolvedValue(null);

        await UserRepository.findById('u-de-otra-org', 'org-A');

        const arg = userFindFirst.mock.calls[0][0];
        expect(arg.where.id).toBe('u-de-otra-org');
        expect(arg.where.profile).toEqual({
            organizationMembers: { some: { organizationId: 'org-A' } },
        });
    });

    it('sin organizationId mantiene la búsqueda global (uso interno)', async () => {
        userFindUnique.mockResolvedValue({ id: 'u1' });

        await UserRepository.findById('u1');

        expect(userFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'u1' } }),
        );
    });
});
