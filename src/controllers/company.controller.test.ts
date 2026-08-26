import { describe, it, expect, vi, beforeEach } from 'vitest';
const { companyFindFirst, fileLinkCreate, fileLinkDeleteMany } = vi.hoisted(() => ({
    companyFindFirst: vi.fn(), fileLinkCreate: vi.fn(), fileLinkDeleteMany: vi.fn(),
}));
vi.mock('../repositories/company.repository', () => ({ CompanyRepository: {} }));
vi.mock('../config/prisma', () => ({
    prisma: { company: { findFirst: companyFindFirst }, fileLink: { create: fileLinkCreate, deleteMany: fileLinkDeleteMany } },
}));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));
import { CompanyController } from './company.controller';
function fakeReq(o: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, orgId: 'org-A', user: { profileId: 'p1' }, ...o } as any; }
function fakeRes() { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); r.sendStatus = vi.fn(() => r); return r; }
beforeEach(() => { vi.clearAllMocks(); });

describe('CompanyController IDOR', () => {
    it('deleteFileLink scopea por la relación company y 404 si no coincide', async () => {
        fileLinkDeleteMany.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await CompanyController.deleteFileLink(fakeReq({ params: { fileId: 'f-ajeno' } }), res);
        expect(fileLinkDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'f-ajeno', company: { organizationId: 'org-A' } }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
    });
    it('addFileLink 404 si la company no es de la org (no crea)', async () => {
        companyFindFirst.mockResolvedValue(null);
        const res = fakeRes();
        await CompanyController.addFileLink(fakeReq({ params: { companyId: 'c-ajeno' }, body: { title: 't', url: 'u' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(fileLinkCreate).not.toHaveBeenCalled();
    });
});
