import { prisma } from '../config/prisma';

interface ProjectFilters {
    search?: string;
    status?: string;
    projectLeadId?: string;
    mine?: string;
    clientEmail?: string;
}

function buildWhere(orgId: string, filters?: ProjectFilters) {
    const where: Record<string, unknown> = { organizationId: orgId };

    if (filters?.status) {
        where.status = filters.status;
    }
    if (filters?.projectLeadId) {
        where.projectLeadId = filters.projectLeadId;
    }
    if (filters?.search) {
        where.name = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters?.mine) {
        where.OR = [
            { projectLeadId: filters.mine },
            { teamMembers: { some: { userId: filters.mine } } },
        ];
    }
    if (filters?.clientEmail) {
        where.shares = {
            some: {
                clientEmail: { equals: filters.clientEmail, mode: 'insensitive' },
                revokedAt: null,
            },
        };
    }

    return where;
}

const projectIncludes = {
    projectLead: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    teamMembers: {
        include: {
            profile: { select: { id: true, fullName: true, email: true } },
        },
    },
};

export const ProjectRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: ProjectFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.project.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
            include: projectIncludes,
        });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.project.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: {
                ...projectIncludes,
                phases: {
                    orderBy: { orderIndex: 'asc' },
                    include: {
                        tasks: {
                            orderBy: { orderIndex: 'asc' },
                            include: {
                                assignee: { select: { id: true, fullName: true, email: true } },
                                creator: { select: { id: true, fullName: true, email: true } },
                            },
                        },
                    },
                },
                tasks: {
                    orderBy: { orderIndex: 'asc' },
                    include: {
                        assignee: { select: { id: true, fullName: true, email: true } },
                        creator: { select: { id: true, fullName: true, email: true } },
                        phase: { select: { id: true, name: true } },
                    },
                },
            },
        }),

    create: (data: {
        name: string;
        description?: string;
        status?: string;
        complexity?: string;
        price?: number;
        pricingType?: string;
        revenue?: number;
        paymentDate?: Date | string;
        recurringStartDate?: Date | string;
        recurringEndDate?: Date | string;
        commissionPaid?: boolean;
        totalHours?: number;
        prd?: string;
        startDate?: Date | string;
        endDate?: Date | string;
        repositoryUrl?: string;
        repositoryName?: string;
        githubOwner?: string;
        defaultBranch?: string;
        productionUrl?: string;
        monitorApiKey?: string;
        projectLeadId?: string;
        createdBy?: string;
        organizationId: string;
    }) =>
        prisma.project.create({
            data,
            include: projectIncludes,
        }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.project.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.project.update({
            where: { id },
            data,
            include: projectIncludes,
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.project.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.project.delete({ where: { id } });
    },

    count: (orgId: string, filters?: ProjectFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.project.count({ where });
    },

    // Tracking: phases with tasks + unassigned tasks
    getTracking: async (projectId: string) => {
        const taskIncludes = {
            assignee: { select: { id: true, fullName: true, email: true } },
            creator: { select: { id: true, fullName: true, email: true } },
            phase: { select: { id: true, name: true } },
            taskTags: { include: { tag: true } },
            comments: {
                orderBy: { createdAt: 'asc' as const },
                include: { creator: { select: { id: true, fullName: true, email: true } } },
            },
        };

        const [phases, unassignedTasks] = await Promise.all([
            prisma.projectPhase.findMany({
                where: { projectId },
                orderBy: { orderIndex: 'asc' },
                include: {
                    tasks: {
                        orderBy: { orderIndex: 'asc' },
                        include: taskIncludes,
                    },
                },
            }),
            prisma.projectTask.findMany({
                where: { projectId, phaseId: null },
                orderBy: { orderIndex: 'asc' },
                include: taskIncludes,
            }),
        ]);

        return { phases, unassignedTasks };
    },

    // Phases
    createPhase: (data: {
        projectId: string;
        name: string;
        description?: string;
        status?: string;
        orderIndex?: number;
        startDate?: Date | string;
        endDate?: Date | string;
        createdBy?: string;
    }) =>
        prisma.projectPhase.create({
            data,
            include: {
                tasks: true,
            },
        }),

    updatePhase: (phaseId: string, data: Record<string, unknown>) =>
        prisma.projectPhase.update({
            where: { id: phaseId },
            data,
            include: {
                tasks: true,
            },
        }),

    deletePhase: (phaseId: string) =>
        prisma.projectPhase.delete({ where: { id: phaseId } }),

    // Project Tasks
    createTask: (data: {
        projectId: string;
        phaseId?: string;
        organizationId: string;
        title: string;
        description?: string;
        status?: string;
        priority?: string;
        orderIndex?: number;
        startDate?: Date | string;
        dueDate?: Date | string;
        assignedTo?: string;
        createdBy?: string;
        createdByGuest?: boolean;
        guestEmail?: string;
    }) =>
        prisma.projectTask.create({
            data,
            include: {
                assignee: { select: { id: true, fullName: true, email: true } },
                creator: { select: { id: true, fullName: true, email: true } },
                phase: { select: { id: true, name: true } },
                taskTags: { include: { tag: true } },
                comments: {
                    orderBy: { createdAt: 'asc' as const },
                    include: { creator: { select: { id: true, fullName: true, email: true } } },
                },
            },
        }),

    updateTask: (taskId: string, data: Record<string, unknown>) =>
        prisma.projectTask.update({
            where: { id: taskId },
            data,
            include: {
                assignee: { select: { id: true, fullName: true, email: true } },
                creator: { select: { id: true, fullName: true, email: true } },
                phase: { select: { id: true, name: true } },
                taskTags: { include: { tag: true } },
                comments: {
                    orderBy: { createdAt: 'asc' as const },
                    include: { creator: { select: { id: true, fullName: true, email: true } } },
                },
            },
        }),

    deleteTask: (taskId: string) =>
        prisma.projectTask.delete({ where: { id: taskId } }),

    // Team members
    getMembers: (projectId: string) =>
        prisma.projectTeamMember.findMany({
            where: { projectId },
            include: {
                profile: { select: { id: true, fullName: true, email: true, role: true } },
            },
        }),

    addMember: (projectId: string, userId: string) =>
        prisma.projectTeamMember.create({
            data: { projectId, userId },
            include: {
                profile: { select: { id: true, fullName: true, email: true, role: true } },
            },
        }),

    removeMember: (projectId: string, userId: string) =>
        prisma.projectTeamMember.deleteMany({
            where: { projectId, userId },
        }),
};
