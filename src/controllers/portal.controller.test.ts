import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    projectFindFirst, shareCreate, shareUpdateMany, shareFindMany,
    userFindUnique, userCreate, profileCreate, memberCreate,
} = vi.hoisted(() => ({
    projectFindFirst: vi.fn(),
    shareCreate: vi.fn(),
    shareUpdateMany: vi.fn(),
    shareFindMany: vi.fn(),
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
    profileCreate: vi.fn(),
    memberCreate: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        project: { findFirst: projectFindFirst, findUnique: vi.fn() },
        projectShare: { create: shareCreate, updateMany: shareUpdateMany, findMany: shareFindMany, update: vi.fn() },
        organization: { findUnique: vi.fn().mockResolvedValue({ name: 'Org' }) },
        user: { findUnique: userFindUnique, create: userCreate },
        profile: { create: profileCreate },
        organizationMember: { create: memberCreate },
    },
}));
vi.mock('../utils/email', () => ({ emailService: { sendClientInvitation: vi.fn() } }));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));

import { PortalController } from './portal.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {}, query: {}, body: {}, headers: {},
        orgId: 'org-A', userId: 'u1', user: { profileId: 'p1', role: 'admin' },
        protocol: 'http', get: () => 'localhost:3000',
        ...overrides,
    } as any;
}
function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.sendStatus = vi.fn(() => res);
    return res;
}

beforeEach(() => { vi.clearAllMocks(); });

/**
 * V4: shareProject no validaba que el proyecto fuera de la organización, así
 * que cualquiera emitía un share sobre un proyecto ajeno.
 */
describe('PortalController.shareProject — aislamiento por organización', () => {
    it('devuelve 404 si el proyecto no pertenece a req.orgId y no crea el share', async () => {
        projectFindFirst.mockResolvedValue(null); // no es de org-A
        const res = fakeRes();

        await PortalController.shareProject(
            fakeReq({ params: { projectId: 'proj-de-otra-org' }, body: { clientEmail: 'c@x.test' } }),
            res,
        );

        expect(projectFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: 'proj-de-otra-org', organizationId: 'org-A' }) }),
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(shareCreate).not.toHaveBeenCalled();
    });

    it('crea el share cuando el proyecto es de la organización', async () => {
        projectFindFirst.mockResolvedValue({ id: 'proj-A', name: 'Proyecto A', organizationId: 'org-A' });
        shareCreate.mockResolvedValue({ id: 's1', shareToken: 'tok', clientEmail: 'c@x.test', permissions: 'view,comment' });
        const res = fakeRes();

        await PortalController.shareProject(
            fakeReq({ params: { projectId: 'proj-A' }, body: { clientEmail: 'c@x.test' } }),
            res,
        );

        expect(shareCreate).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

/**
 * V5: shareProject autocreaba un User+Profile+OrganizationMember con la
 * contraseña fija 'DomotaiGuest', que permitía entrar al CRM completo.
 */
describe('PortalController.shareProject — ya no crea cuentas de invitado (V5)', () => {
    it('no crea User ni OrganizationMember aunque el email no exista', async () => {
        projectFindFirst.mockResolvedValue({ id: 'proj-A', name: 'Proyecto A', organizationId: 'org-A' });
        userFindUnique.mockResolvedValue(null); // email nuevo
        shareCreate.mockResolvedValue({ id: 's1', shareToken: 'tok', clientEmail: 'nuevo@x.test', permissions: 'view,comment' });
        const res = fakeRes();

        await PortalController.shareProject(
            fakeReq({ params: { projectId: 'proj-A' }, body: { clientEmail: 'nuevo@x.test' } }),
            res,
        );

        expect(userCreate).not.toHaveBeenCalled();
        expect(profileCreate).not.toHaveBeenCalled();
        expect(memberCreate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

/**
 * V4: deleteShare revocaba por id sin ningún filtro de organización.
 */
describe('PortalController.deleteShare — aislamiento por organización', () => {
    it('revoca sólo dentro de la organización y responde 404 si no hay coincidencia', async () => {
        shareUpdateMany.mockResolvedValue({ count: 0 });
        const res = fakeRes();

        await PortalController.deleteShare(
            fakeReq({ params: { shareId: 'share-ajeno' } }),
            res,
        );

        expect(shareUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: 'share-ajeno', organizationId: 'org-A' }) }),
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.sendStatus).not.toHaveBeenCalledWith(204);
    });
});
