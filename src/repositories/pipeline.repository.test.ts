import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` es hoisted, así que los mocks vienen de `vi.hoisted()` — mismo
// motivo que en lead.repository.test.ts.
const { leadGroupBy } = vi.hoisted(() => ({ leadGroupBy: vi.fn() }));

vi.mock('../config/prisma', () => ({
    prisma: {
        lead: { groupBy: leadGroupBy },
        pipeline: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        pipelineStage: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    },
}));

import { PipelineRepository } from './pipeline.repository';

beforeEach(() => { vi.clearAllMocks(); });

/**
 * `countLeadsByStage` es el guardián que impide borrar una etapa que aún tiene
 * leads. Cruzaba por `stage.name`, pero `Lead.stage` guarda el SLUG, así que
 * devolvía 0 para cualquier etapa cuyo nombre llevara mayúscula o acento — es
 * decir, casi todas — y dejaba borrar etapas con leads dentro. Esos leads
 * quedaban sin columna que los reclamara y desaparecían del tablero.
 */
const ETAPA = { slug: 'negociacion', name: 'Negociación' };

describe('PipelineRepository.countLeadsByStage', () => {
    it('cuenta los leads guardados por slug', async () => {
        leadGroupBy.mockResolvedValue([
            { stage: 'negociacion', _count: { _all: 4 } },
            { stage: 'ganado', _count: { _all: 13 } },
        ]);

        expect(await PipelineRepository.countLeadsByStage(ETAPA, 'p1')).toBe(4);
    });

    it('cuenta también los guardados con el nombre visible, que es el dato histórico', async () => {
        leadGroupBy.mockResolvedValue([
            { stage: 'negociacion', _count: { _all: 4 } },
            { stage: 'Negociación', _count: { _all: 2 } },
        ]);

        expect(await PipelineRepository.countLeadsByStage(ETAPA, 'p1')).toBe(6);
    });

    it('tolera variantes de mayúsculas, acentos y separadores', async () => {
        leadGroupBy.mockResolvedValue([
            { stage: 'PRIMER_CONTACTO', _count: { _all: 1 } },
            { stage: 'primer-contacto', _count: { _all: 2 } },
            { stage: 'Primer Contacto', _count: { _all: 3 } },
        ]);

        const etapa = { slug: 'primer_contacto', name: 'Primer Contacto' };
        expect(await PipelineRepository.countLeadsByStage(etapa, 'p1')).toBe(6);
    });

    it('no cuenta los leads de otras etapas', async () => {
        leadGroupBy.mockResolvedValue([
            { stage: 'ganado', _count: { _all: 13 } },
            { stage: 'perdido', _count: { _all: 4 } },
        ]);

        expect(await PipelineRepository.countLeadsByStage(ETAPA, 'p1')).toBe(0);
    });

    it('ignora los leads sin etapa', async () => {
        leadGroupBy.mockResolvedValue([
            { stage: null, _count: { _all: 7 } },
            { stage: 'negociacion', _count: { _all: 1 } },
        ]);

        expect(await PipelineRepository.countLeadsByStage(ETAPA, 'p1')).toBe(1);
    });

    it('deja fuera los leads borrados y se ciñe al pipeline indicado', async () => {
        // Un lead en la papelera no debe impedir borrar la etapa.
        leadGroupBy.mockResolvedValue([]);

        await PipelineRepository.countLeadsByStage(ETAPA, 'p1');

        expect(leadGroupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                by: ['stage'],
                where: { pipelineId: 'p1', deletedAt: null },
            }),
        );
    });
});
