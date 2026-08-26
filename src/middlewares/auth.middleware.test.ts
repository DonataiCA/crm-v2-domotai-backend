import { describe, it, expect, vi, beforeEach } from 'vitest';

// requireSelfOrAdmin no habla con la base: sólo mira lo que `authenticate` ya
// dejó en el request (`req.userId` = User.id, `req.user.role` normalizado).
import { requireSelfOrAdmin } from './auth.middleware';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return { params: {}, headers: {}, ...overrides } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

beforeEach(() => { vi.clearAllMocks(); });

/**
 * V1: `PUT /users/:id` montaba sólo `authenticate`, así que cualquiera editaba
 * a cualquiera. Este guard exige ser el dueño del recurso o admin.
 */
describe('requireSelfOrAdmin', () => {
    it('deja pasar al dueño del recurso aunque no sea admin', () => {
        const next = vi.fn();
        const res = fakeRes();
        requireSelfOrAdmin(fakeReq({ params: { id: 'u1' }, userId: 'u1', user: { profileId: 'p1', role: 'client' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('bloquea con 403 a un no-admin que apunta a otra cuenta', () => {
        const next = vi.fn();
        const res = fakeRes();
        requireSelfOrAdmin(fakeReq({ params: { id: 'victima' }, userId: 'u1', user: { profileId: 'p1', role: 'client' } }), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('deja pasar a un admin sobre cualquier cuenta', () => {
        const next = vi.fn();
        const res = fakeRes();
        requireSelfOrAdmin(fakeReq({ params: { id: 'otro' }, userId: 'admin1', user: { profileId: 'pa', role: 'admin' } }), res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
