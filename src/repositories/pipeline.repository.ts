import { prisma } from '../config/prisma';

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

    countLeadsByStage: async (stageName: string, pipelineId: string) => {
        return prisma.lead.count({
            where: { pipelineId, stage: stageName },
        });
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
