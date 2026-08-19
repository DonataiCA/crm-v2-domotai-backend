import { prisma } from '../config/prisma';
import { slugifyStage } from '../constants/enums';

export const PipelineRepository = {
    findAll: (orgId: string) =>
        prisma.pipeline.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'asc' },
            include: {
                stages: { orderBy: { order: 'asc' } },
            },
        }),

    findById: (id: string, organizationId?: string) =>
        prisma.pipeline.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: {
                stages: { orderBy: { order: 'asc' } },
            },
        }),

    create: (orgId: string, name: string) =>
        prisma.pipeline.create({
            data: { name, organizationId: orgId },
            include: {
                stages: { orderBy: { order: 'asc' } },
            },
        }),

    update: async (id: string, name: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.pipeline.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.pipeline.update({
            where: { id },
            data: { name },
            include: {
                stages: { orderBy: { order: 'asc' } },
            },
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.pipeline.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.pipeline.delete({ where: { id } });
    },

    addStage: (pipelineId: string, data: { name: string; slug: string; color?: string; order: number; category?: string; weight?: number }) =>
        prisma.pipelineStage.create({
            data: { ...data, pipelineId },
        }),

    updateStage: (stageId: string, data: { name?: string; slug?: string; color?: string; order?: number; category?: string; weight?: number }) =>
        prisma.pipelineStage.update({
            where: { id: stageId },
            data,
        }),

    findStageById: (stageId: string) =>
        prisma.pipelineStage.findUnique({ where: { id: stageId } }),

    deleteStage: (stageId: string) =>
        prisma.pipelineStage.delete({ where: { id: stageId } }),

    /**
     * Cuántos leads sigue reclamando esta etapa. Es el guardián que impide
     * borrarla y dejar esos leads sin columna que los recoja.
     *
     * El cruce va por slug normalizado, no por nombre: `Lead.stage` guarda el
     * slug, así que comparar contra `stage.name` devolvía 0 para cualquier
     * etapa con mayúscula o acento y el guardián no guardaba nada. Se agrupa en
     * base y se empareja aquí porque `slugifyStage` no se puede expresar en la
     * consulta, y el número de valores distintos por pipeline es un puñado.
     */
    countLeadsByStage: async (stage: { slug: string; name: string }, pipelineId: string) => {
        const groups = await prisma.lead.groupBy({
            by: ['stage'],
            // Un lead en la papelera no debe impedir borrar la etapa.
            where: { pipelineId, deletedAt: null },
            _count: { _all: true },
        });

        const keys = new Set(
            [stage.slug, stage.name].map(slugifyStage).filter(Boolean),
        );

        return groups
            .filter((g) => g.stage != null && keys.has(slugifyStage(g.stage)))
            .reduce((total, g) => total + g._count._all, 0);
    },

    reorderStages: async (pipelineId: string, stageIds: string[]) => {
        const updates = stageIds.map((id, index) =>
            prisma.pipelineStage.update({
                where: { id },
                data: { order: index },
            })
        );
        return prisma.$transaction(updates);
    },
};
