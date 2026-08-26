import { describe, it, expect, vi, beforeEach } from 'vitest';
const { orgFindFirst, orgFindUnique, leadCount, leadFindMany, taskCount, ptFindMany, profileFindMany } = vi.hoisted(() => ({
    orgFindFirst: vi.fn(), orgFindUnique: vi.fn(), leadCount: vi.fn(), leadFindMany: vi.fn(),
    taskCount: vi.fn(), ptFindMany: vi.fn(), profileFindMany: vi.fn(),
}));
vi.mock('../config/prisma', () => ({
    prisma: {
        organization: { findFirst: orgFindFirst, findUnique: orgFindUnique },
        lead: { count: leadCount, findMany: leadFindMany },
        task: { count: taskCount },
        projectTask: { findMany: ptFindMany },
        profile: { findMany: profileFindMany },
    },
}));
import { DashboardController } from './dashboard.controller';
function fakeReq(o: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, orgId: 'org-A', ...o } as any; }
function fakeRes() { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); return r; }
beforeEach(() => {
    vi.clearAllMocks();
    leadCount.mockResolvedValue(0); leadFindMany.mockResolvedValue([]); taskCount.mockResolvedValue(0);
    ptFindMany.mockResolvedValue([]); profileFindMany.mockResolvedValue([]);
    orgFindUnique.mockResolvedValue({ id: 'org-A', name: 'A' });
});

describe('DashboardController.weeklyDigest — usa la org del solicitante', () => {
    it('nunca llama a organization.findFirst sin where; usa req.orgId', async () => {
        const res = fakeRes();
        await DashboardController.weeklyDigest(fakeReq({ orgId: 'org-A' }), res);
        // No debe resolver "la primera org" globalmente
        expect(orgFindFirst).not.toHaveBeenCalled();
        // Los conteos deben filtrar por la org del solicitante
        expect(leadCount).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org-A' }),
        }));
    });
});
