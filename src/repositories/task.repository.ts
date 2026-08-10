import { prisma } from '../config/prisma';

interface TaskFilters {
    status?: string;
    assignedTo?: string;
    search?: string;
    leadId?: string;
    projectId?: string;
    contactId?: string;
    companyId?: string;
}

function buildWhere(orgId: string, filters?: TaskFilters) {
    const where: Record<string, unknown> = { organizationId: orgId };

    if (filters?.status) {
        where.status = filters.status;
    }
    if (filters?.assignedTo) {
        where.assignedTo = filters.assignedTo;
    }
    if (filters?.leadId) {
        where.leadId = filters.leadId;
    }
    if (filters?.projectId) {
        where.projectId = filters.projectId;
    }
    if (filters?.contactId) {
        where.contactId = filters.contactId;
    }
    if (filters?.companyId) {
        where.companyId = filters.companyId;
    }
    if (filters?.search) {
        where.OR = [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
        ];
    }

    return where;
}

const taskListIncludes = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    contact: { select: { id: true, name: true, email: true, phone: true, company: true } },
    lead: { select: { id: true, name: true } },
    company: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
};

const taskDetailIncludes = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    contact: true,
    lead: true,
    company: { select: { id: true, name: true } },
    project: true,
    comments: {
        orderBy: { createdAt: 'desc' as const },
        include: { creator: { select: { id: true, fullName: true, email: true } } },
    },
    links: {
        orderBy: { createdAt: 'desc' as const },
        include: { creator: { select: { id: true, fullName: true, email: true } } },
    },
};

export const TaskRepository = {
    findAll: (
        orgId: string,
        skip: number,
        take: number,
        filters?: TaskFilters,
        sortBy: string = 'createdAt',
        sortOrder: string = 'desc',
    ) => {
        const where = buildWhere(orgId, filters);
        const allowedSortFields = ['createdAt', 'updatedAt', 'dueDate', 'title', 'status', 'priority', 'progress'];
        const field = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const order = sortOrder === 'asc' ? 'asc' : 'desc';

        return prisma.task.findMany({
            skip,
            take,
            where,
            orderBy: { [field]: order },
            include: taskListIncludes,
        });
    },

    count: (orgId: string, filters?: TaskFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.task.count({ where });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.task.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: taskDetailIncludes,
        }),

    create: (data: {
        title: string;
        description?: string;
        status?: string;
        priority?: string;
        progress?: number;
        dueDate?: Date | string;
        reminderDate?: Date | string;
        assignedTo?: string;
        contactId?: string;
        leadId?: string;
        companyId?: string;
        projectId?: string;
        createdBy?: string;
        organizationId: string;
    }) =>
        prisma.task.create({
            data,
            include: taskDetailIncludes,
        }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.task.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.task.update({
            where: { id },
            data,
            include: taskDetailIncludes,
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.task.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.task.delete({ where: { id } });
    },

    bulkUpdate: (ids: string[], orgId: string, data: Record<string, unknown>) =>
        prisma.task.updateMany({
            where: { id: { in: ids }, organizationId: orgId },
            data,
        }),

    bulkDelete: (ids: string[], orgId: string) =>
        prisma.task.deleteMany({
            where: { id: { in: ids }, organizationId: orgId },
        }),

    // Comments
    addComment: (data: {
        taskId: string;
        organizationId: string;
        content: string;
        createdBy?: string;
    }) =>
        prisma.taskComment.create({
            data,
            include: { creator: { select: { id: true, fullName: true, email: true } } },
        }),

    deleteComment: (id: string) =>
        prisma.taskComment.delete({ where: { id } }),

    findCommentById: (id: string) =>
        prisma.taskComment.findUnique({ where: { id } }),

    // Links
    addLink: (data: {
        taskId: string;
        organizationId: string;
        title: string;
        url: string;
        linkType?: string;
        createdBy?: string;
    }) =>
        prisma.taskLink.create({
            data,
            include: { creator: { select: { id: true, fullName: true, email: true } } },
        }),

    deleteLink: (id: string) =>
        prisma.taskLink.delete({ where: { id } }),

    findLinkById: (id: string) =>
        prisma.taskLink.findUnique({ where: { id } }),
};
