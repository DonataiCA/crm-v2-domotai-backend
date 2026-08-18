import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mismo motivo que en project.controller.test.ts: vi.mock se hoistea al inicio
// del archivo, así que los mocks vienen de vi.hoisted().
const {
    findById, findStageBySlug, findDefaultPipeline, findFirstStage,
    create, update, profileFindUnique,
} = vi.hoisted(() => ({
    findById: vi.fn(),
    findStageBySlug: vi.fn(),
    findDefaultPipeline: vi.fn(),
    findFirstStage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    profileFindUnique: vi.fn(),
}));

vi.mock('../repositories/lead.repository', () => ({
    LeadRepository: { findById, findStageBySlug, findDefaultPipeline, findFirstStage, create, update },
}));

vi.mock('../config/prisma', () => ({
    prisma: { profile: { findUnique: profileFindUnique } },
}));

vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('../utils/notify', () => ({ notify: vi.fn() }));

import { LeadController } from './lead.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return { params: {}, query: {}, body: {}, orgId: 'org-A', userId: 'u1', ...overrides } as any;
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
 * Antes de T6, `stage` viajaba de `req.body` a la base sin comprobar nada: un
 * lead podía quedar en una etapa que su pipeline no tiene y desaparecer del
 * tablero. Estos tests cubren el cableado, no sólo el repositorio que consulta.
 */
describe('LeadController.update — validación referencial de la etapa', () => {
    it('rechaza con 400 una etapa que no existe en el pipeline del lead', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1' });
        findStageBySlug.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'etapa_de_otro' } }), res);

        expect(findStageBySlug).toHaveBeenCalledWith('p1', 'etapa_de_otro');
        expect(res.status).toHaveBeenCalledWith(400);
        expect(update).not.toHaveBeenCalled();
    });

    it('busca la etapa en el pipeline del lead, no en cualquiera', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p-del-lead' });
        findStageBySlug.mockResolvedValue({ id: 's1', slug: 'ganado', name: 'Ganado', category: 'won' });
        update.mockResolvedValue({ id: 'l1', name: 'Lead', stage: 'ganado' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'ganado' } }), res);

        expect(findStageBySlug).toHaveBeenCalledWith('p-del-lead', 'ganado');
        expect(update).toHaveBeenCalled();
    });

    it('un pipelineId del body manda sobre el que ya tiene el lead', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p-viejo' });
        findStageBySlug.mockResolvedValue({ id: 's1', slug: 'nuevo', name: 'Nuevo', category: 'standard' });
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(
            fakeReq({ params: { id: 'l1' }, body: { stage: 'nuevo', pipelineId: 'p-nuevo' } }),
            res,
        );

        expect(findStageBySlug).toHaveBeenCalledWith('p-nuevo', 'nuevo');
    });

    it('no valida nada si la petición no toca la etapa', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1' });
        update.mockResolvedValue({ id: 'l1', name: 'Renombrado' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { name: 'Renombrado' } }), res);

        expect(findStageBySlug).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
    });

    it('sigue devolviendo 404 para un lead de otra organización, antes de mirar la etapa', async () => {
        findById.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'ganado' } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(findStageBySlug).not.toHaveBeenCalled();
    });
});

describe('LeadController.create — validación referencial de la etapa', () => {
    it('rechaza con 400 una etapa que el pipeline no tiene', async () => {
        findStageBySlug.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'inventada', pipelineId: 'p1' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('sin pipelineId, resuelve el pipeline por defecto de la organización', async () => {
        findDefaultPipeline.mockResolvedValue({ id: 'p-default', stages: [{ slug: 'nuevo', order: 0 }] });
        findStageBySlug.mockResolvedValue({ id: 's1', slug: 'nuevo', name: 'Nuevo', category: 'standard' });
        create.mockResolvedValue({ id: 'l1', name: 'L' });

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'nuevo' } }), res);

        expect(findDefaultPipeline).toHaveBeenCalledWith('org-A');
        expect(findStageBySlug).toHaveBeenCalledWith('p-default', 'nuevo');
        expect(create).toHaveBeenCalled();
    });

    it('rechaza con 400 si la organización no tiene ningún pipeline', async () => {
        findDefaultPipeline.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'nuevo' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('sin stage, usa la etapa inicial del pipeline en vez del default "new" que ya no existe', async () => {
        findDefaultPipeline.mockResolvedValue({ id: 'p-default', stages: [{ slug: 'nuevo', order: 0 }] });
        findFirstStage.mockResolvedValue({ slug: 'nuevo' });
        create.mockResolvedValue({ id: 'l1', name: 'L' });

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L' } }), res);

        expect(findFirstStage).toHaveBeenCalledWith('p-default');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ stage: 'nuevo' }));
    });
});
