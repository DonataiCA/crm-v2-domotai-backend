import { describe, it, expect, vi, beforeEach } from 'vitest';

const { restore, deleteEvent, findById, convert, leadFindFirst, projectFindFirst, fileLinkCreate, fileLinkDeleteMany } = vi.hoisted(() => ({
    restore: vi.fn(), deleteEvent: vi.fn(), findById: vi.fn(), convert: vi.fn(),
    leadFindFirst: vi.fn(), projectFindFirst: vi.fn(), fileLinkCreate: vi.fn(), fileLinkDeleteMany: vi.fn(),
}));
vi.mock('../repositories/lead.repository', () => ({
    LeadRepository: { restore, deleteEvent, findById, convert },
}));
vi.mock('../config/prisma', () => ({
    prisma: {
        lead: { findFirst: leadFindFirst },
        project: { findFirst: projectFindFirst },
        fileLink: { create: fileLinkCreate, deleteMany: fileLinkDeleteMany },
    },
}));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('../utils/notify', () => ({ notify: vi.fn() }));

import { LeadController } from './lead.controller';
function fakeReq(o: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, orgId: 'org-A', user: { profileId: 'p1' }, ...o } as any; }
function fakeRes() { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); r.sendStatus = vi.fn(() => r); return r; }
beforeEach(() => { vi.clearAllMocks(); });

describe('LeadController IDOR', () => {
    it('restore pasa orgId al repo y 404 si no existe en la org', async () => {
        restore.mockResolvedValue(null);
        const res = fakeRes();
        await LeadController.restore(fakeReq({ params: { id: 'l-ajeno' } }), res);
        expect(restore).toHaveBeenCalledWith('l-ajeno', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deleteEvent acota por org y 404 si no coincide', async () => {
        deleteEvent.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await LeadController.deleteEvent(fakeReq({ params: { eventId: 'e-ajeno' } }), res);
        expect(deleteEvent).toHaveBeenCalledWith('e-ajeno', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deleteFileLink scopea por la relación lead de la org y 404 si no coincide', async () => {
        fileLinkDeleteMany.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await LeadController.deleteFileLink(fakeReq({ params: { fileId: 'f-ajeno' } }), res);
        expect(fileLinkDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'f-ajeno', lead: { organizationId: 'org-A' } }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('addFileLink 404 si el lead no es de la org (no crea)', async () => {
        leadFindFirst.mockResolvedValue(null);
        const res = fakeRes();
        await LeadController.addFileLink(fakeReq({ params: { leadId: 'l-ajeno' }, body: { title: 't', url: 'u' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(fileLinkCreate).not.toHaveBeenCalled();
    });

    it('convert 404 si el projectId del body no es de la org (no convierte)', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A' });
        projectFindFirst.mockResolvedValue(null);
        const res = fakeRes();
        await LeadController.convert(fakeReq({ params: { leadId: 'l1' }, body: { projectId: 'proj-ajeno' } }), res);
        expect(projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'proj-ajeno', organizationId: 'org-A' }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
        expect(convert).not.toHaveBeenCalled();
    });
});
