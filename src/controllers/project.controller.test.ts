import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mismo motivo que en project.repository.test.ts: vi.mock se hoistea al
// inicio del archivo, así que los mocks vienen de vi.hoisted().
const {
    findById, addMember, getMembers, removeMember,
    taskFindFirst, commentCreate, commentDeleteMany,
    gitMetricFindMany, gitCommitFindMany, orgMemberFindFirst,
    getImportContext, createTasks,
} = vi.hoisted(() => ({
    findById: vi.fn(),
    addMember: vi.fn(),
    getMembers: vi.fn(),
    removeMember: vi.fn(),
    taskFindFirst: vi.fn(),
    commentCreate: vi.fn(),
    commentDeleteMany: vi.fn(),
    gitMetricFindMany: vi.fn(),
    gitCommitFindMany: vi.fn(),
    orgMemberFindFirst: vi.fn(),
    getImportContext: vi.fn(),
    createTasks: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
    ProjectRepository: {
        findById, addMember, getMembers, removeMember, getImportContext, createTasks,
    },
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        projectTask: { findFirst: taskFindFirst },
        taskComment: { create: commentCreate, deleteMany: commentDeleteMany },
        gitMetric: { findMany: gitMetricFindMany },
        gitCommit: { findMany: gitCommitFindMany },
        organizationMember: { findFirst: orgMemberFindFirst },
    },
}));

import { ProjectController } from './project.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        orgId: 'org-A',
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

// C1: addMember creaba el ProjectTeamMember sin comprobar que el proyecto
// perteneciera a la organización del request — org A se insertaba como
// miembro de un proyecto de org B conociendo el projectId.
describe('ProjectController.addMember', () => {
    it('verifica que el proyecto pertenece a la organización antes de crear el miembro', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });
        orgMemberFindFirst.mockResolvedValue({ id: 'om-1', organizationId: 'org-A', userId: 'user-1' });
        addMember.mockResolvedValue({ id: 'member-1', projectId: 'proj-1', userId: 'user-1', profile: null });

        const req = fakeReq({ params: { projectId: 'proj-1' }, body: { userId: 'user-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.addMember(req, res);

        expect(findById).toHaveBeenCalledWith('proj-1', 'org-A');
        expect(addMember).toHaveBeenCalledWith('proj-1', 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('responde 404 y no crea el miembro cuando el proyecto es de otra organización', async () => {
        findById.mockResolvedValue(null);

        const req = fakeReq({ params: { projectId: 'proj-1' }, body: { userId: 'user-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.addMember(req, res);

        expect(addMember).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
    });

    // Hallazgo de la ronda 3: el guard de projectId no bastaba — el userId del
    // body no se comprobaba contra nada, así que se podía colgar un Profile de
    // otra organización como miembro de un proyecto propio (expuesto luego vía
    // getMembers, y consumible por la lista de asignables de la IA en Tarea 8).
    it('responde 404 y no crea el miembro cuando el userId no pertenece a la organización', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });
        orgMemberFindFirst.mockResolvedValue(null);

        const req = fakeReq({ params: { projectId: 'proj-1' }, body: { userId: 'user-from-org-B' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.addMember(req, res);

        expect(orgMemberFindFirst).toHaveBeenCalledWith({ where: { organizationId: 'org-A', userId: 'user-from-org-B' } });
        expect(addMember).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

// C3: getMembers no pasaba orgId al repositorio.
describe('ProjectController.getMembers', () => {
    it('pasa orgId al repositorio', async () => {
        getMembers.mockResolvedValue([]);

        const req = fakeReq({ params: { projectId: 'proj-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.getMembers(req, res);

        expect(getMembers).toHaveBeenCalledWith('proj-1', 'org-A');
    });
});

// C2: removeMember no pasaba orgId y nunca comprobaba el resultado.
describe('ProjectController.removeMember', () => {
    it('pasa orgId al repositorio y responde 404 si no había nada que borrar', async () => {
        removeMember.mockResolvedValue(false);

        const req = fakeReq({ params: { projectId: 'proj-1', userId: 'user-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.removeMember(req, res);

        expect(removeMember).toHaveBeenCalledWith('proj-1', 'user-1', 'org-A');
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responde 204 cuando sí borró el miembro', async () => {
        removeMember.mockResolvedValue(true);

        const req = fakeReq({ params: { projectId: 'proj-1', userId: 'user-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.removeMember(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(204);
    });
});

// addTaskComment: no comprobaba que la tarea perteneciera a la organización
// antes de colgarle un comentario.
describe('ProjectController.addTaskComment', () => {
    it('verifica que la tarea pertenece a la organización antes de crear el comentario', async () => {
        taskFindFirst.mockResolvedValue({ id: 'task-1' });
        commentCreate.mockResolvedValue({ id: 'comment-1' });

        const req = fakeReq({
            params: { taskId: 'task-1' },
            body: { content: 'hola' },
            orgId: 'org-A',
            user: { profileId: 'profile-1' },
        });
        const res = fakeRes();

        await ProjectController.addTaskComment(req, res);

        expect(taskFindFirst).toHaveBeenCalledWith({ where: { id: 'task-1', organizationId: 'org-A' } });
        expect(commentCreate).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('responde 404 y no crea el comentario cuando la tarea es de otra organización', async () => {
        taskFindFirst.mockResolvedValue(null);

        const req = fakeReq({
            params: { taskId: 'task-1' },
            body: { content: 'hola' },
            orgId: 'org-A',
            user: { profileId: 'profile-1' },
        });
        const res = fakeRes();

        await ProjectController.addTaskComment(req, res);

        expect(commentCreate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

// deleteTaskComment: no comprobaba organización en absoluto.
describe('ProjectController.deleteTaskComment', () => {
    it('filtra el borrado por organizationId', async () => {
        commentDeleteMany.mockResolvedValue({ count: 1 });

        const req = fakeReq({ params: { commentId: 'comment-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.deleteTaskComment(req, res);

        expect(commentDeleteMany).toHaveBeenCalledWith({ where: { id: 'comment-1', organizationId: 'org-A' } });
        expect(res.sendStatus).toHaveBeenCalledWith(204);
    });

    it('responde 404 cuando el comentario es de otra organización', async () => {
        commentDeleteMany.mockResolvedValue({ count: 0 });

        const req = fakeReq({ params: { commentId: 'comment-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.deleteTaskComment(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

// C4: githubMetrics/githubCommits filtraban sólo por projectId — un projectId
// ajeno filtraba métricas y commits de otra organización.
describe('ProjectController.githubMetrics', () => {
    it('filtra por organizationId además de projectId', async () => {
        gitMetricFindMany.mockResolvedValue([]);

        const req = fakeReq({ params: { projectId: 'proj-1' }, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.githubMetrics(req, res);

        expect(gitMetricFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { projectId: 'proj-1', organizationId: 'org-A' } }),
        );
    });
});

describe('ProjectController.githubCommits', () => {
    it('filtra por organizationId además de projectId', async () => {
        gitCommitFindMany.mockResolvedValue([]);

        const req = fakeReq({ params: { projectId: 'proj-1' }, query: {}, orgId: 'org-A' });
        const res = fakeRes();

        await ProjectController.githubCommits(req, res);

        expect(gitCommitFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { projectId: 'proj-1', organizationId: 'org-A' } }),
        );
    });
});

/**
 * `importTasks` es todo o nada: o el archivo entero se resuelve, o no se crea ninguna
 * tarea. Estos tests cubren el cableado (aislamiento por organización, el 422, el
 * `createdBy`); las reglas de la plantilla en sí están en `task-template.test.ts` y
 * `task-import.test.ts`, que son puros.
 */
describe('ProjectController.importTasks', () => {
    const TEMPLATE = [
        '## Configurar el pipeline de CI',
        '',
        '- **Área:** DevOps',
        '- **Responsable:** Ana Pérez',
        '- **Estado:** IN_PROGRESS',
        '- **Prioridad:** HIGH',
        '- **Inicio:** 2026-08-20',
        '- **Vencimiento:** 2026-08-27',
        '- **Descripción:** Montar el pipeline.',
        '- **Conclusión:** Verde en main.',
        '',
    ].join('\n');

    const importReq = (content: string) => fakeReq({
        params: { projectId: 'proj-1' },
        body: { document: { fileName: 'tareas.md', content } },
        orgId: 'org-A',
        user: { profileId: 'profile-quien-sube', role: 'admin' },
    });

    const IMPORT_CONTEXT = {
        phases: [{ id: 'phase-devops', name: 'DevOps', nextOrderIndex: 3 }],
        members: [{ id: 'profile-ana', fullName: 'Ana Pérez', email: 'ana@domotai.com' }],
        existingTitles: [],
    };

    it('responde 404 y no lee nada cuando el proyecto es de otra organización', async () => {
        findById.mockResolvedValue(null);

        const res = fakeRes();
        await ProjectController.importTasks(importReq(TEMPLATE), res);

        expect(findById).toHaveBeenCalledWith('proj-1', 'org-A');
        expect(getImportContext).not.toHaveBeenCalled();
        expect(createTasks).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('crea las tareas con todos los campos de la plantilla', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });
        getImportContext.mockResolvedValue(IMPORT_CONTEXT);
        createTasks.mockResolvedValue([{ id: 'task-1' }]);

        const res = fakeRes();
        await ProjectController.importTasks(importReq(TEMPLATE), res);

        expect(createTasks).toHaveBeenCalledWith([
            {
                projectId: 'proj-1',
                organizationId: 'org-A',
                phaseId: 'phase-devops',
                title: 'Configurar el pipeline de CI',
                description: 'Montar el pipeline.',
                conclusion: 'Verde en main.',
                status: 'IN_PROGRESS',
                priority: 'HIGH',
                startDate: new Date('2026-08-20T00:00:00.000Z'),
                dueDate: new Date('2026-08-27T00:00:00.000Z'),
                assignedTo: 'profile-ana',
                orderIndex: 3,
                // Profile.id, no User.id: es a Profile a donde apunta la FK.
                createdBy: 'profile-quien-sube',
            },
        ]);
        expect(res.json).toHaveBeenCalledWith({
            created: 1,
            tasks: [{ id: 'task-1' }],
            issues: [],
        });
    });

    it('responde 422 sin tocar la base cuando el archivo no se entiende', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });

        const res = fakeRes();
        await ProjectController.importTasks(importReq('No soy una plantilla.'), res);

        expect(getImportContext).not.toHaveBeenCalled();
        expect(createTasks).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].issues).toHaveLength(1);
    });

    it('responde 422 y no crea nada cuando una sola tarea no se puede resolver', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });
        getImportContext.mockResolvedValue({ ...IMPORT_CONTEXT, members: [] });

        const res = fakeRes();
        await ProjectController.importTasks(importReq(TEMPLATE), res);

        expect(createTasks).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0]).toMatchObject({ created: 0, tasks: [] });
    });

    it('responde 500 sin filtrar el error cuando la transacción falla', async () => {
        findById.mockResolvedValue({ id: 'proj-1' });
        getImportContext.mockResolvedValue(IMPORT_CONTEXT);
        createTasks.mockRejectedValue(new Error('deadlock'));

        const res = fakeRes();
        await ProjectController.importTasks(importReq(TEMPLATE), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
