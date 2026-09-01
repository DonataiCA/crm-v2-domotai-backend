import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mismo motivo que en project.controller.test.ts: vi.mock se hoistea al inicio
// del archivo, así que los mocks vienen de vi.hoisted().
const {
    findById, findStages, findDefaultPipeline, findFirstStage,
    create, update, profileFindUnique,
} = vi.hoisted(() => ({
    findById: vi.fn(),
    findStages: vi.fn(),
    findDefaultPipeline: vi.fn(),
    findFirstStage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    profileFindUnique: vi.fn(),
}));

vi.mock('../repositories/lead.repository', () => ({
    LeadRepository: { findById, findStages, findDefaultPipeline, findFirstStage, create, update },
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
 * `stage` no viaja crudo a la base: el controlador lo resuelve contra las etapas
 * reales del pipeline (por slug o nombre) y guarda el slug CANÓNICO underscore,
 * que siempre pasa la CHECK. Estos tests cubren el cableado y la tolerancia.
 */
describe('LeadController.update — resolución de la etapa', () => {
    it('rechaza con 400 una etapa que no existe en el pipeline del lead', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1' });
        findStages.mockResolvedValue([{ slug: 'ganado', name: 'Ganado', category: 'won' }]);

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'etapa_de_otro' } }), res);

        expect(findStages).toHaveBeenCalledWith('p1');
        expect(res.status).toHaveBeenCalledWith(400);
        expect(update).not.toHaveBeenCalled();
    });

    it('slug con guion (first-meeting): matchea y guarda la forma canónica first_meeting', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1', stage: 'nuevo' });
        findStages.mockResolvedValue([{ slug: 'first-meeting', name: 'First Meeting', category: 'standard' }]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead', stage: 'first_meeting' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'first-meeting' } }), res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(update.mock.calls[0][1].stage).toBe('first_meeting');
    });

    it('slug con guion bajo (first_meeting) matchea la etapa first-meeting del pipeline', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1', stage: 'nuevo' });
        findStages.mockResolvedValue([{ slug: 'first-meeting', name: 'First Meeting', category: 'standard' }]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'first_meeting' } }), res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(update.mock.calls[0][1].stage).toBe('first_meeting');
    });

    it('la ETIQUETA de un cliente viejo ("Negociación") matchea por nombre', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1', stage: 'nuevo' });
        findStages.mockResolvedValue([{ slug: 'negociacion', name: 'Negociación', category: 'standard' }]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'Negociación' } }), res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(update.mock.calls[0][1].stage).toBe('negociacion');
    });

    it('el valor persistido siempre cumple ^[a-z0-9_]+$ (CHECK-safe)', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1', stage: 'nuevo' });
        findStages.mockResolvedValue([{ slug: 'cierre-ganado', name: 'Cierre - Ganado', category: 'won' }]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'cierre-ganado' } }), res);

        expect(update.mock.calls[0][1].stage).toMatch(/^[a-z0-9_]+$/);
    });

    it('con slugs que colapsan al normalizar, el match exacto de slug decide', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1', stage: 'x' });
        findStages.mockResolvedValue([
            { slug: 'a-b', name: 'A B', category: 'standard' },
            { slug: 'a_b', name: 'A_B', category: 'standard' },
        ]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'a_b' } }), res);

        // Coincide exactamente con la etapa 'a_b' → se guarda su canónico 'a_b'
        expect(update.mock.calls[0][1].stage).toBe('a_b');
    });

    it('un pipelineId del body manda sobre el que ya tiene el lead', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p-viejo' });
        findStages.mockResolvedValue([{ slug: 'nuevo', name: 'Nuevo', category: 'standard' }]);
        update.mockResolvedValue({ id: 'l1', name: 'Lead' });

        const res = fakeRes();
        await LeadController.update(
            fakeReq({ params: { id: 'l1' }, body: { stage: 'nuevo', pipelineId: 'p-nuevo' } }),
            res,
        );

        expect(findStages).toHaveBeenCalledWith('p-nuevo');
    });

    it('no resuelve nada si la petición no toca la etapa', async () => {
        findById.mockResolvedValue({ id: 'l1', organizationId: 'org-A', pipelineId: 'p1' });
        update.mockResolvedValue({ id: 'l1', name: 'Renombrado' });

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { name: 'Renombrado' } }), res);

        expect(findStages).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
    });

    it('sigue devolviendo 404 para un lead de otra organización, antes de mirar la etapa', async () => {
        findById.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.update(fakeReq({ params: { id: 'l1' }, body: { stage: 'ganado' } }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(findStages).not.toHaveBeenCalled();
    });
});

describe('LeadController.create — resolución de la etapa', () => {
    it('rechaza con 400 una etapa que el pipeline no tiene', async () => {
        findStages.mockResolvedValue([{ slug: 'nuevo', name: 'Nuevo', category: 'standard' }]);

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'inventada', pipelineId: 'p1' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('sin pipelineId, resuelve el pipeline por defecto de la organización', async () => {
        findDefaultPipeline.mockResolvedValue({ id: 'p-default', stages: [{ slug: 'nuevo', order: 0 }] });
        findStages.mockResolvedValue([{ slug: 'nuevo', name: 'Nuevo', category: 'standard' }]);
        create.mockResolvedValue({ id: 'l1', name: 'L' });

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'nuevo' } }), res);

        expect(findDefaultPipeline).toHaveBeenCalledWith('org-A');
        expect(findStages).toHaveBeenCalledWith('p-default');
        expect(create).toHaveBeenCalled();
    });

    it('rechaza con 400 si la organización no tiene ningún pipeline', async () => {
        findDefaultPipeline.mockResolvedValue(null);

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L', stage: 'nuevo' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('sin stage, usa la etapa inicial del pipeline y la guarda canonicalizada', async () => {
        findDefaultPipeline.mockResolvedValue({ id: 'p-default', stages: [{ slug: 'first-meeting', order: 0 }] });
        findFirstStage.mockResolvedValue({ slug: 'first-meeting' });
        create.mockResolvedValue({ id: 'l1', name: 'L' });

        const res = fakeRes();
        await LeadController.create(fakeReq({ body: { name: 'L' } }), res);

        expect(findFirstStage).toHaveBeenCalledWith('p-default');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ stage: 'first_meeting' }));
    });
});
