import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tagUpdateMany, tagDeleteMany, tagFindFirst, tagFindMany, ptFindFirst, pttCreate, pttDeleteMany, ptFindUnique, txn } = vi.hoisted(() => ({
    tagUpdateMany: vi.fn(),
    tagDeleteMany: vi.fn(),
    tagFindFirst: vi.fn(),
    tagFindMany: vi.fn(),
    ptFindFirst: vi.fn(),
    pttCreate: vi.fn(),
    pttDeleteMany: vi.fn(),
    ptFindUnique: vi.fn(),
    txn: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        tag: { update: vi.fn(), delete: vi.fn(), updateMany: tagUpdateMany, deleteMany: tagDeleteMany, findFirst: tagFindFirst, findMany: tagFindMany, create: vi.fn() },
        projectTask: { findFirst: ptFindFirst, findUnique: ptFindUnique },
        projectTaskTag: { create: pttCreate, delete: vi.fn(), deleteMany: pttDeleteMany },
        $transaction: txn,
    },
}));

import { TagController } from './tag.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return { params: {}, query: {}, body: {}, headers: {}, orgId: 'org-A', user: { profileId: 'p1', role: 'admin' }, ...overrides } as any;
}
function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res); res.json = vi.fn(() => res); res.sendStatus = vi.fn(() => res);
    return res;
}
beforeEach(() => { vi.clearAllMocks(); });

describe('TagController.update — aislamiento por organización', () => {
    it('devuelve 404 y no escribe si el tag es de otra org', async () => {
        tagUpdateMany.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await TagController.update(fakeReq({ params: { tagId: 't-ajeno' }, body: { color: '#fff' } }), res);
        expect(tagUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 't-ajeno', organizationId: 'org-A' }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('TagController.delete — aislamiento por organización', () => {
    it('borra sólo dentro de la org; 404 si no coincide', async () => {
        tagDeleteMany.mockResolvedValue({ count: 0 });
        const res = fakeRes();
        await TagController.delete(fakeReq({ params: { tagId: 't-ajeno' } }), res);
        expect(tagDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 't-ajeno', organizationId: 'org-A' }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.sendStatus).not.toHaveBeenCalledWith(204);
    });
});

describe('TagController.assignToTask — valida que el task sea de la org', () => {
    it('404 si el projectTask no es de la org y no crea la relación', async () => {
        ptFindFirst.mockResolvedValue(null);
        const res = fakeRes();
        await TagController.assignToTask(fakeReq({ params: { taskId: 'task-ajeno', tagId: 't1' } }), res);
        expect(ptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'task-ajeno', organizationId: 'org-A' }),
        }));
        expect(res.status).toHaveBeenCalledWith(404);
        expect(pttCreate).not.toHaveBeenCalled();
    });
});

describe('TagController.setTaskTags — valida task y tags de la org', () => {
    it('404 si el task no es de la org', async () => {
        ptFindFirst.mockResolvedValue(null);
        const res = fakeRes();
        await TagController.setTaskTags(fakeReq({ params: { taskId: 'task-ajeno' }, body: { tagIds: ['t1'] } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(txn).not.toHaveBeenCalled();
    });
});
