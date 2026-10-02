import { describe, it, expect, vi, beforeEach } from 'vitest';

// Los guards miran lo que `authenticate` dejó en el request (`req.userId` =
// User.id, `req.user.role` normalizado) y, como último camino, la membresía de
// la organización del header — en producción la autoridad vive en
// `OrganizationMember.role`, no en `Profile.role`.
const findFirst = vi.fn();
vi.mock('../config/prisma', () => ({
    prisma: { organizationMember: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

import { requireAdmin, requireSelfOrAdmin } from './auth.middleware';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return { params: {}, headers: {}, ...overrides } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
});

/**
 * V1: `PUT /users/:id` montaba sólo `authenticate`, así que cualquiera editaba
 * a cualquiera. Este guard exige ser el dueño del recurso o admin.
 */
describe('requireSelfOrAdmin', () => {
    it('deja pasar al dueño del recurso aunque no sea admin', async () => {
        const next = vi.fn();
        const res = fakeRes();
        await requireSelfOrAdmin(fakeReq({ params: { id: 'u1' }, userId: 'u1', user: { profileId: 'p1', role: 'client' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('bloquea con 403 a un no-admin que apunta a otra cuenta', async () => {
        const next = vi.fn();
        const res = fakeRes();
        await requireSelfOrAdmin(fakeReq({ params: { id: 'victima' }, userId: 'u1', user: { profileId: 'p1', role: 'client' } }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('deja pasar a un admin de perfil sobre cualquier cuenta', async () => {
        const next = vi.fn();
        const res = fakeRes();
        await requireSelfOrAdmin(fakeReq({ params: { id: 'otro' }, userId: 'admin1', user: { profileId: 'pa', role: 'admin' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('deja pasar a un admin de la organización del header aunque su perfil sea salesman', async () => {
        findFirst.mockResolvedValue({ role: 'admin' });
        const next = vi.fn();
        const res = fakeRes();
        await requireSelfOrAdmin(
            fakeReq({
                params: { id: 'otro' },
                userId: 'u1',
                user: { profileId: 'p1', role: 'salesman' },
                headers: { 'x-organization-id': 'org1' },
            }),
            res,
            next,
        );
        // La membresía se busca por Profile.id (la trampa del FK), no por User.id.
        expect(findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: 'org1', userId: 'p1' } }),
        );
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('requireAdmin', () => {
    it('deja pasar a un admin de perfil', async () => {
        const next = vi.fn();
        const res = fakeRes();
        await requireAdmin(fakeReq({ user: { profileId: 'pa', role: 'admin' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it('deja pasar a un admin de la organización del header aunque su perfil sea salesman', async () => {
        findFirst.mockResolvedValue({ role: 'admin' });
        const next = vi.fn();
        const res = fakeRes();
        await requireAdmin(
            fakeReq({ user: { profileId: 'p1', role: 'salesman' }, headers: { 'x-organization-id': 'org1' } }),
            res,
            next,
        );
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('bloquea con 403 a un miembro no-admin de la organización', async () => {
        findFirst.mockResolvedValue({ role: 'member' });
        const next = vi.fn();
        const res = fakeRes();
        await requireAdmin(
            fakeReq({ user: { profileId: 'p1', role: 'salesman' }, headers: { 'x-organization-id': 'org1' } }),
            res,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('bloquea con 403 cuando no hay header de organización ni rol admin de perfil', async () => {
        const next = vi.fn();
        const res = fakeRes();
        await requireAdmin(fakeReq({ user: { profileId: 'p1', role: 'salesman' } }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(findFirst).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});

describe('forbidProfileRoles', () => {
    it('bloquea con 403 a un rol prohibido', async () => {
        const { forbidProfileRoles } = await import('./auth.middleware');
        const next = vi.fn();
        const res = fakeRes();
        forbidProfileRoles('client', 'pmo')(fakeReq({ user: { profileId: 'p1', role: 'pmo' } }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('deja pasar a los demás roles, tolerando el casing', async () => {
        const { forbidProfileRoles } = await import('./auth.middleware');
        const next = vi.fn();
        const res = fakeRes();
        forbidProfileRoles('client', 'pmo')(fakeReq({ user: { profileId: 'p1', role: 'Salesman' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
