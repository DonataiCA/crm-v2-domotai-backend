import { prisma } from '../config/prisma';

export const TaskDeliverableRepository = {
    findById: (id: string, organizationId: string) =>
        prisma.taskDeliverable.findFirst({ where: { id, organizationId } }),

    nextOrderIndex: async (projectTaskId: string, organizationId: string) => {
        const last = await prisma.taskDeliverable.findFirst({
            where: { projectTaskId, organizationId },
            orderBy: { orderIndex: 'desc' },
            select: { orderIndex: true },
        });
        return last ? last.orderIndex + 1 : 0;
    },

    create: (data: {
        projectTaskId: string;
        organizationId: string;
        title: string;
        orderIndex: number;
        createdBy?: string | null;
    }) => prisma.taskDeliverable.create({ data }),

    update: (id: string, data: { title?: string; done?: boolean; doneAt?: Date | null }) =>
        prisma.taskDeliverable.update({ where: { id }, data }),

    delete: (id: string) => prisma.taskDeliverable.delete({ where: { id } }),
};
