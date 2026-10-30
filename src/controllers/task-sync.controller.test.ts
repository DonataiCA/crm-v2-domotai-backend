import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    findById: vi.fn(),
    reorderTasks: vi.fn(),
    getSyncState: vi.fn(),
    getActor: vi.fn(),
    applySyncPlan: vi.fn(),
    notify: vi.fn(),
    logAudit: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
    ProjectRepository: { findById: mocks.findById },
}));
vi.mock('../repositories/task-sync.repository', () => ({
    TaskSyncRepository: {
        reorderTasks: mocks.reorderTasks,
        getSyncState: mocks.getSyncState,
        getActor: mocks.getActor,
        applySyncPlan: mocks.applySyncPlan,
    },
}));
vi.mock('../utils/notify', () => ({ notify: mocks.notify }));
vi.mock('../utils/audit', () => ({ logAudit: mocks.logAudit }));

import { TaskSyncController } from './task-sync.controller';
import { buildExport } from '../utils/task-sync/build-export';
import { makeState, EXPORTED_AT, EXPORTED_BY } from '../utils/task-sync/fixtures.test-helpers';

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
    res.type = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
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

/** El archivo tal como lo exportaría el CRM, opcionalmente editado. */
function exportedFile(edit: (doc: any) => void = () => {}) {
    const doc: any = buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
    edit(doc);
    return { fileName: 'tasks-portal-de-clientes-andina-2026-10-30.json', content: JSON.stringify(doc) };
}

const projectReq = (body: unknown = {}) => fakeReq({ params: { projectId: 'proj-1' }, body });

describe('TaskSyncController.exportTasks', () => {
    it('descarga el JSON con nombre tasks-<proyecto>-<fecha>.json', async () => {
        mocks.findById.mockResolvedValue({ id: 'proj-1' });
        mocks.getSyncState.mockResolvedValue(makeState());
        mocks.getActor.mockResolvedValue({ name: 'Ana Pérez', email: 'ana@domotai.test' });
        const res = fakeRes();
        await TaskSyncController.exportTasks(projectReq(), res);

        expect(mocks.getSyncState).toHaveBeenCalledWith('proj-1', 'org-A', []);
        const disposition = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'Content-Disposition')[1];
        expect(disposition).toMatch(/^attachment; filename="tasks-portal-de-clientes-andina-\d{4}-\d{2}-\d{2}\.json"$/);
        const body = JSON.parse(res.send.mock.calls[0][0]);
        expect(body.format).toBe('crm-domotai-tasks');
        expect(body.tasks).toHaveLength(3);
        expect(body.exportedBy).toEqual({ name: 'Ana Pérez', email: 'ana@domotai.test' });
    });

    it('404 si el proyecto no es de la organización', async () => {
        mocks.findById.mockResolvedValue(null);
        const res = fakeRes();
        await TaskSyncController.exportTasks(projectReq(), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mocks.getSyncState).not.toHaveBeenCalled();
    });
});

describe('TaskSyncController.preview', () => {
    beforeEach(() => {
        mocks.findById.mockResolvedValue({ id: 'proj-1', name: 'Portal de clientes Andina' });
        mocks.getSyncState.mockResolvedValue(makeState());
    });

    it('devuelve el plan sin escribir nada', async () => {
        const res = fakeRes();
        const document = exportedFile((doc) => { doc.tasks[0].status = 'IN_PROGRESS'; doc.tasks.push({ title: 'Nueva' }); });
        await TaskSyncController.preview(projectReq({ document }), res);

        expect(mocks.getSyncState).toHaveBeenCalledWith('proj-1', 'org-A', ['t-home', 't-menu', 't-login']);
        const plan = res.json.mock.calls[0][0];
        expect(plan.summary).toMatchObject({ creates: 1, updates: 1 });
        expect(plan.planHash).toMatch(/^[0-9a-f]{40}$/);
        expect(mocks.applySyncPlan).not.toHaveBeenCalled();
    });

    it('422 con los errores si el archivo está mal escrito', async () => {
        const res = fakeRes();
        await TaskSyncController.preview(projectReq({ document: { fileName: 'x.json', content: '{' } }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].issues[0].message).toMatch(/JSON/);
        expect(mocks.getSyncState).not.toHaveBeenCalled();
    });

    it('422 si lo que nombra no existe en el proyecto', async () => {
        const res = fakeRes();
        const document = exportedFile((doc) => { doc.tasks[0].phase = 'Inexistente'; });
        await TaskSyncController.preview(projectReq({ document }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].issues[0].path).toBe('tasks[0].phase');
    });
});

describe('TaskSyncController.apply', () => {
    beforeEach(() => {
        mocks.findById.mockResolvedValue({ id: 'proj-1', name: 'Portal de clientes Andina' });
        mocks.getSyncState.mockImplementation(async () => makeState());
        mocks.applySyncPlan.mockResolvedValue({ createdIds: ['new-1'] });
    });

    async function previewHash(document: { fileName: string; content: string }) {
        const res = fakeRes();
        await TaskSyncController.preview(projectReq({ document }), res);
        return res.json.mock.calls[0][0].planHash as string;
    }

    it('aplica el plan previsualizado, audita y avisa una vez por persona', async () => {
        const document = exportedFile((doc) => {
            doc.tasks[0].assignee = 'luis@domotai.test';
            doc.tasks.push({ title: 'Otra para Luis', assignee: 'luis@domotai.test' });
        });
        const planHash = await previewHash(document);
        const res = fakeRes();
        await TaskSyncController.apply(projectReq({ document, planHash, applyConflicts: [] }), res);

        expect(mocks.applySyncPlan).toHaveBeenCalledOnce();
        const [applied, ctx] = mocks.applySyncPlan.mock.calls[0];
        expect(applied.summary).toMatchObject({ creates: 1, updates: 1 });
        expect(ctx).toMatchObject({ projectId: 'proj-1', organizationId: 'org-A', actorId: 'prof-1' });

        expect(mocks.notify).toHaveBeenCalledOnce();
        expect(mocks.notify.mock.calls[0][0]).toMatchObject({
            organizationId: 'org-A',
            type: 'PROJECT_TASK_ASSIGNED',
            recipientUserId: 'prof-luis',
            actorId: 'prof-1',
            metadata: expect.objectContaining({ projectId: 'proj-1' }),
        });
        expect(mocks.logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            action: 'IMPORT', entityType: 'Project', entityId: 'proj-1',
        }));
        expect(res.json.mock.calls[0][0]).toMatchObject({ applied: { creates: 1, updates: 1 }, skippedConflicts: [] });
    });

    it('409 si el proyecto cambió entre la vista previa y la confirmación', async () => {
        const document = exportedFile((doc) => { doc.tasks[2].progress = 90; });
        const planHash = await previewHash(document);
        mocks.getSyncState.mockImplementation(async () => {
            const state = makeState();
            state.tasks[0].status = 'ON_HOLD'; // alguien tocó "Endpoint de login" en el CRM
            return state;
        });
        const res = fakeRes();
        await TaskSyncController.apply(projectReq({ document, planHash, applyConflicts: [] }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(mocks.applySyncPlan).not.toHaveBeenCalled();
    });

    it('omite los conflictos salvo los que el usuario marcó', async () => {
        mocks.getSyncState.mockImplementation(async () => {
            const state = makeState();
            state.tasks[0].status = 'ON_HOLD';
            return state;
        });
        const document = exportedFile((doc) => { doc.tasks[2].progress = 90; });
        const planHash = await previewHash(document);

        const skipped = fakeRes();
        await TaskSyncController.apply(projectReq({ document, planHash, applyConflicts: [] }), skipped);
        expect(mocks.applySyncPlan.mock.calls[0][0].updates).toEqual([]);
        expect(skipped.json.mock.calls[0][0].skippedConflicts).toEqual(['t-login']);

        const forced = fakeRes();
        await TaskSyncController.apply(projectReq({ document, planHash, applyConflicts: ['t-login'] }), forced);
        expect(mocks.applySyncPlan.mock.calls[1][0].updates.map((u: any) => u.taskId)).toEqual(['t-login']);
    });

    it('no avisa a quien importa aunque se asigne tareas a sí mismo', async () => {
        const document = exportedFile((doc) => { doc.tasks[0].assignee = 'ana@domotai.test'; });
        const planHash = await previewHash(document);
        await TaskSyncController.apply(
            fakeReq({ params: { projectId: 'proj-1' }, body: { document, planHash, applyConflicts: [] }, user: { profileId: 'prof-ana', role: 'admin' } }),
            fakeRes(),
        );
        expect(mocks.notify).not.toHaveBeenCalled();
    });
});
