import { describe, it, expect, vi, beforeEach } from 'vitest';

const { userUpdate, profileUpdateMany, validateId, validateUpd } = vi.hoisted(() => ({
    userUpdate: vi.fn(),
    profileUpdateMany: vi.fn(),
    validateId: vi.fn(),
    validateUpd: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
    UserRepository: { update: userUpdate },
    AuthProvider: { EMAIL: 'EMAIL', GOOGLE: 'GOOGLE', APPLE: 'APPLE' },
}));
vi.mock('../config/prisma', () => ({
    prisma: { profile: { updateMany: profileUpdateMany } },
}));
vi.mock('../validators/user/params.validator', () => ({
    validateIdParam: validateId,
    getAuthenticatedUserId: vi.fn(),
}));
vi.mock('../validators/user/update.validator', () => ({ validateUpdate: validateUpd }));
vi.mock('../transformers/user.transformer', () => ({
    transformUser: (u: unknown) => u,
    transformUsers: (u: unknown) => u,
    transformUserWithRelations: (u: unknown) => u,
}));

import { UserController } from './user.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return { params: {}, query: {}, body: {}, ...overrides } as any;
}
function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    userUpdate.mockResolvedValue({ id: 'u1' });
    profileUpdateMany.mockResolvedValue({ count: 1 });
});

/**
 * V1: el controlador escribía `Profile.role` desde el body sin comprobar el rol
 * del solicitante. Un `client` se ponía `admin` sobre su propia cuenta.
 */
describe('UserController.update — guard anti-escalada de rol', () => {
    it('un no-admin no puede cambiar su propio rol a admin', async () => {
        validateId.mockReturnValue({ id: 'u1' });
        validateUpd.mockReturnValue({ role: 'admin' });
        const res = fakeRes();

        await UserController.update(
            fakeReq({ params: { id: 'u1' }, userId: 'u1', user: { profileId: 'u1', role: 'client' } }),
            res,
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(profileUpdateMany).not.toHaveBeenCalled();
    });

    it('un admin sí puede cambiar el rol de un usuario', async () => {
        validateId.mockReturnValue({ id: 'victima' });
        validateUpd.mockReturnValue({ role: 'salesman' });
        const res = fakeRes();

        await UserController.update(
            fakeReq({ params: { id: 'victima' }, userId: 'admin1', user: { profileId: 'pa', role: 'admin' } }),
            res,
        );

        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(profileUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ role: 'salesman' }) }),
        );
    });

    it('un no-admin puede editar su perfil reenviando su rol actual (no-op, sin 403)', async () => {
        validateId.mockReturnValue({ id: 'u1' });
        validateUpd.mockReturnValue({ fullName: 'Clara Cliente', role: 'client' });
        const res = fakeRes();

        await UserController.update(
            fakeReq({ params: { id: 'u1' }, userId: 'u1', user: { profileId: 'u1', role: 'client' } }),
            res,
        );

        expect(res.status).not.toHaveBeenCalledWith(403);
        // Se actualiza el perfil (fullName) pero nunca escalando el rol.
        const call = profileUpdateMany.mock.calls[0]?.[0];
        expect(call?.data?.role ?? 'client').toBe('client');
    });
});
