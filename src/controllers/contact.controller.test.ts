import { describe, it, expect, vi, beforeEach } from 'vitest';
const { deleteNote, deleteFileLink } = vi.hoisted(() => ({ deleteNote: vi.fn(), deleteFileLink: vi.fn() }));
vi.mock('../repositories/contact.repository', () => ({ ContactRepository: { deleteNote, deleteFileLink } }));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));
import { ContactController } from './contact.controller';
function fakeReq(o: Record<string, unknown> = {}) { return { params: {}, query: {}, body: {}, orgId: 'org-A', user: { profileId: 'p1' }, ...o } as any; }
function fakeRes() { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); r.sendStatus = vi.fn(() => r); return r; }
beforeEach(() => { vi.clearAllMocks(); });

describe('ContactController IDOR', () => {
    it('deleteNote pasa orgId y 404 si no coincide', async () => {
        deleteNote.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await ContactController.deleteNote(fakeReq({ params: { noteId: 'n-ajeno' } }), res);
        expect(deleteNote).toHaveBeenCalledWith('n-ajeno', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });
    it('deleteFileLink pasa orgId y 404 si no coincide', async () => {
        deleteFileLink.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await ContactController.deleteFileLink(fakeReq({ params: { fileId: 'f-ajeno' } }), res);
        expect(deleteFileLink).toHaveBeenCalledWith('f-ajeno', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });
});
