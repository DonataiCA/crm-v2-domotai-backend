import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    findById: vi.fn(),
    reorderTasks: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
    ProjectRepository: { findById: mocks.findById },
}));
vi.mock('../repositories/task-sync.repository', () => ({
    TaskSyncRepository: { reorderTasks: mocks.reorderTasks },
}));

import { TaskSyncController } from './task-sync.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        body: {},
        headers: {},
        orgId: 'org-A',
        user: { profileId: 'prof-1', role: 'admin' },
        ...overrides,
    } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.sendStatus = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    return res;
}

beforeEach(() => vi.clearAllMocks());

describe('TaskSyncController.reorder', () => {
    it('guarda el orden de la columna dentro del proyecto y la organización', async () => {
        mocks.findById.mockResolvedValue({ id: 'proj-1' });
        const res = fakeRes();
        await TaskSyncController.reorder(
            fakeReq({ params: { projectId: 'proj-1' }, body: { orderedIds: ['t2', 't1'] } }),
            res,
        );
        expect(mocks.findById).toHaveBeenCalledWith('proj-1', 'org-A');
        expect(mocks.reorderTasks).toHaveBeenCalledWith('proj-1', 'org-A', ['t2', 't1']);
        expect(res.sendStatus).toHaveBeenCalledWith(204);
    });

    it('responde 404 si el proyecto no es de la organización', async () => {
        mocks.findById.mockResolvedValue(null);
        const res = fakeRes();
        await TaskSyncController.reorder(
            fakeReq({ params: { projectId: 'ajeno' }, body: { orderedIds: ['t1'] } }),
            res,
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mocks.reorderTasks).not.toHaveBeenCalled();
    });
});
