import { prisma } from '../config/prisma';

export const ProjectLinkRepository = {
    listByProject: (projectId: string, organizationId: string) =>
        prisma.projectLink.findMany({
            where: { projectId, organizationId },
            orderBy: { orderIndex: 'asc' },
        }),

    findById: (id: string, organizationId: string) =>
        prisma.projectLink.findFirst({ where: { id, organizationId } }),

    nextOrderIndex: async (projectId: string, organizationId: string) => {
        const last = await prisma.projectLink.findFirst({
            where: { projectId, organizationId },
            orderBy: { orderIndex: 'desc' },
            select: { orderIndex: true },
        });
        return last ? last.orderIndex + 1 : 0;
    },

    create: (data: {
        projectId: string;
        organizationId: string;
        title: string;
        url: string;
        description?: string | null;
        orderIndex: number;
        createdBy?: string | null;
    }) => prisma.projectLink.create({ data }),

    update: (id: string, data: { title?: string; url?: string; description?: string | null; orderIndex?: number }) =>
        prisma.projectLink.update({ where: { id }, data }),

    delete: (id: string) => prisma.projectLink.delete({ where: { id } }),

    reorder: (projectId: string, organizationId: string, orderedIds: string[]) =>
        prisma.$transaction(
            orderedIds.map((id, index) =>
                prisma.projectLink.updateMany({
                    where: { id, projectId, organizationId },
                    data: { orderIndex: index },
                })
            )
        ),
};
