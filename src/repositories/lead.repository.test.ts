import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` es hoisted al inicio del archivo, así que las variables que
// referencia deben venir de `vi.hoisted()` — mismo motivo que en
// project.repository.test.ts.
const { stageFindFirst, stageFindMany, pipelineFindFirst } = vi.hoisted(() => ({
    stageFindFirst: vi.fn(),
    stageFindMany: vi.fn(),
    pipelineFindFirst: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        pipelineStage: { findFirst: stageFindFirst, findMany: stageFindMany },
        pipeline: { findFirst: pipelineFindFirst },
        lead: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
        leadEvent: { create: vi.fn(), delete: vi.fn() },
    },
}));

import { LeadRepository } from './lead.repository';

beforeEach(() => { vi.clearAllMocks(); });

describe('LeadRepository.findStageBySlug', () => {
    it('busca la etapa dentro del pipeline indicado, no globalmente', async () => {
        stageFindFirst.mockResolvedValue({ id: 's1', slug: 'negociacion', name: 'Negociación', category: 'standard' });

        await LeadRepository.findStageBySlug('p1', 'negociacion');

        expect(stageFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { pipelineId: 'p1', slug: 'negociacion' } }),
        );
    });

    it('devuelve null cuando la etapa es de otro pipeline', async () => {
        stageFindFirst.mockResolvedValue(null);
        expect(await LeadRepository.findStageBySlug('p1', 'etapa_de_otro')).toBeNull();
    });
});

describe('LeadRepository.findStages', () => {
    it('trae todas las etapas del pipeline (slug, name, category) ordenadas', async () => {
        stageFindMany.mockResolvedValue([{ slug: 'nuevo', name: 'Nuevo', category: 'standard' }]);

        await LeadRepository.findStages('p1');

        expect(stageFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { pipelineId: 'p1' }, orderBy: { order: 'asc' } }),
        );
    });
});

describe('LeadRepository.findFirstStage', () => {
    it('devuelve la etapa de menor order', async () => {
        stageFindFirst.mockResolvedValue({ slug: 'nuevo' });

        const result = await LeadRepository.findFirstStage('p1');

        expect(stageFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { pipelineId: 'p1' }, orderBy: { order: 'asc' } }),
        );
        expect(result).toEqual({ slug: 'nuevo' });
    });
});

describe('LeadRepository.findDefaultPipeline', () => {
    it('busca el pipeline marcado por defecto en la organización', async () => {
        pipelineFindFirst.mockResolvedValue({ id: 'p1', stages: [{ slug: 'nuevo', order: 0 }] });

        await LeadRepository.findDefaultPipeline('org-A');

        expect(pipelineFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: 'org-A', isDefault: true } }),
        );
    });
});
