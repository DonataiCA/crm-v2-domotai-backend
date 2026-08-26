import { describe, it, expect, vi, beforeEach } from 'vitest';

const { userUpdate, profileUpdateMany, validateId, validateUpd, userFindAll, userCount, userFindById } = vi.hoisted(() => ({
    userUpdate: vi.fn(),
    profileUpdateMany: vi.fn(),
    validateId: vi.fn(),
    validateUpd: vi.fn(),
    userFindAll: vi.fn(),
    userCount: vi.fn(),
    userFindById: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
    UserRepository: { update: userUpdate, findAll: userFindAll, count: userCount, findById: userFindById },
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
vi.mock('../validators/user/pagination.validator', () => ({ validatePagination: () => ({ page: 1, limit: 20 }) }));
vi.mock('../validators/user/filter.validator', () => ({ validateFilters: () => ({ search: undefined }) }));
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

/**
 * V2: index y show devolvían/consultaban usuarios de cualquier organización.
 */
describe('UserController.index / show — aislamiento por organización', () => {
    it('index pasa req.orgId como filtro de organización al repositorio', async () => {
        userFindAll.mockResolvedValue([]);
        userCount.mockResolvedValue(0);
        const res = fakeRes();

        await UserController.index(fakeReq({ orgId: 'org-A', userId: 'u1', user: { profileId: 'u1', role: 'admin' } }), res);

        expect(userFindAll).toHaveBeenCalledWith(
            expect.any(Number), expect.any(Number),
            expect.objectContaining({ organizationId: 'org-A' }),
        );
        expect(userCount).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-A' }));
    });

    it('show devuelve 404 cuando el usuario no es miembro de la organización', async () => {
        validateId.mockReturnValue({ id: 'ajeno' });
        userFindById.mockResolvedValue(null); // el repo, acotado por org, no lo encuentra
        const res = fakeRes();

        await UserController.show(fakeReq({ params: { id: 'ajeno' }, orgId: 'org-A' }), res);

        expect(userFindById).toHaveBeenCalledWith('ajeno', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });
});
