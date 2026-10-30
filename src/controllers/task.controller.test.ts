import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create, findById, addComment, addLink, notify } = vi.hoisted(() => ({
    create: vi.fn(),
    findById: vi.fn(),
    addComment: vi.fn(),
    addLink: vi.fn(),
    notify: vi.fn(),
}));

vi.mock('../repositories/task.repository', () => ({
    TaskRepository: { create, findById, addComment, addLink },
}));
vi.mock('../utils/email', () => ({ emailService: { sendTaskAssigned: vi.fn() } }));
vi.mock('../utils/notify', () => ({ notify }));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));

import { TaskController } from './task.controller';

// createdBy de Task, TaskComment y TaskLink es FK a Profile.id. El controlador
// guardaba req.userId (User.id): funcionaba solo para los usuarios migrados,
// cuyos dos ids coinciden, y daba 500 por FK para los creados con admin-create.
function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        orgId: 'org-A',
        userId: 'user-1',
        user: { profileId: 'prof-1', role: 'salesman' },
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

describe('TaskController: autoría con Profile.id', () => {
    it('create guarda createdBy con el Profile.id', async () => {
        create.mockResolvedValue({ id: 't1', title: 'T' });
        await TaskController.create(fakeReq({ body: { title: 'T' } }), fakeRes());
        expect(create.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('addComment guarda createdBy con el Profile.id', async () => {
        findById.mockResolvedValue({ id: 't1', title: 'T', assignedTo: null });
        addComment.mockResolvedValue({ id: 'c1', creator: null });
        await TaskController.addComment(
            fakeReq({ params: { taskId: 't1' }, body: { content: 'hola' } }), fakeRes(),
        );
        expect(addComment.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('addComment no se notifica a sí mismo cuando el autor es el asignado', async () => {
        // assignedTo es Profile.id: compararlo con el User.id nunca coincidía.
        findById.mockResolvedValue({ id: 't1', title: 'T', assignedTo: 'prof-1' });
        addComment.mockResolvedValue({ id: 'c1', creator: null });
        await TaskController.addComment(
            fakeReq({ params: { taskId: 't1' }, body: { content: 'hola' } }), fakeRes(),
        );
        expect(notify).not.toHaveBeenCalled();
    });

    it('addComment notifica al asignado con el Profile.id del autor como actor', async () => {
        findById.mockResolvedValue({ id: 't1', title: 'T', assignedTo: 'prof-2' });
        addComment.mockResolvedValue({ id: 'c1', creator: null });
        await TaskController.addComment(
            fakeReq({ params: { taskId: 't1' }, body: { content: 'hola' } }), fakeRes(),
        );
        expect(notify.mock.calls[0][0].actorId).toBe('prof-1');
    });

    it('addLink guarda createdBy con el Profile.id', async () => {
        findById.mockResolvedValue({ id: 't1', title: 'T' });
        addLink.mockResolvedValue({ id: 'l1' });
        await TaskController.addLink(
            fakeReq({ params: { taskId: 't1' }, body: { title: 'Doc', url: 'https://x.test' } }), fakeRes(),
        );
        expect(addLink.mock.calls[0][0].createdBy).toBe('prof-1');
    });
});
