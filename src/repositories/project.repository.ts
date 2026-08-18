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

const TASK_INCLUDE = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    phase: { select: { id: true, name: true } },
    taskTags: { include: { tag: true } },
    comments: {
        orderBy: { createdAt: 'asc' as const },
        include: { creator: { select: { id: true, fullName: true, email: true } } },
    },
} as const;

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
        const [phases, unassignedTasks] = await Promise.all([
            prisma.projectPhase.findMany({
                where: { projectId },
                orderBy: { orderIndex: 'asc' },
                include: {
                    tasks: {
                        orderBy: { orderIndex: 'asc' },
                        include: TASK_INCLUDE,
                    },
                },
            }),
            prisma.projectTask.findMany({
                where: { projectId, phaseId: null },
                orderBy: { orderIndex: 'asc' },
                include: TASK_INCLUDE,
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

    /**
     * ProjectPhase no tiene organizationId: se filtra por el proyecto padre.
     * La relectura, igual que en `updateTask`, filtra sólo por `id` — el
     * `updateMany` ya probó la pertenencia de forma atómica; repetir el
     * filtro de organización aquí podría devolver `null` sobre una escritura
     * que sí ocurrió.
     */
    updatePhase: async (phaseId: string, orgId: string, data: Record<string, unknown>) => {
        const { count } = await prisma.projectPhase.updateMany({
            where: { id: phaseId, project: { organizationId: orgId } },
            data,
        });
        if (count === 0) return null;
        return prisma.projectPhase.findFirst({
            where: { id: phaseId },
            include: { tasks: true },
        });
    },

    deletePhase: async (phaseId: string, orgId: string) => {
        const { count } = await prisma.projectPhase.deleteMany({
            where: { id: phaseId, project: { organizationId: orgId } },
        });
        return count > 0;
    },

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
            include: TASK_INCLUDE,
        }),

    /**
     * `updateMany` + relectura en vez de `update`: `update` sólo acepta claves
     * únicas en el `where`, así que no permite añadir `organizationId` y por eso
     * este método podía escribir en cualquier organización. `count === 0` cubre a
     * la vez "no existe" y "no es tuya", y el llamador responde 404 en ambos.
     *
     * La relectura filtra sólo por `id`, sin repetir `organizationId`: el
     * `updateMany` de arriba ya probó de forma atómica que la fila era de
     * `orgId` en el instante de la escritura — si `count` es 1, la escritura
     * ocurrió sobre una fila tuya. Si el propio `data` cambió `organizationId`
     * (mass assignment, cerrado en la Tarea 4) la fila ya se mudó de
     * organización para cuando llega la relectura; repetir el filtro aquí
     * haría que esa relectura fallara con `null` — y el controlador respondería
     * 404 sobre una escritura que sí ocurrió. No "arreglar" esto de vuelta.
     */
    updateTask: async (taskId: string, orgId: string, data: Record<string, unknown>) => {
        const { count } = await prisma.projectTask.updateMany({
            where: { id: taskId, organizationId: orgId },
            data,
        });
        if (count === 0) return null;
        return prisma.projectTask.findFirst({
            where: { id: taskId },
            include: TASK_INCLUDE,
        });
    },

    deleteTask: async (taskId: string, orgId: string) => {
        const { count } = await prisma.projectTask.deleteMany({
            where: { id: taskId, organizationId: orgId },
        });
        return count > 0;
    },

    // Team members
    /** `ProjectTeamMember` no tiene organizationId: se filtra por el proyecto padre. */
    getMembers: (projectId: string, orgId: string) =>
        prisma.projectTeamMember.findMany({
            where: { projectId, project: { organizationId: orgId } },
            include: {
                profile: { select: { id: true, fullName: true, email: true, role: true } },
            },
        }),

    /**
     * `create` no admite un `where` compuesto para validar la pertenencia del
     * proyecto de forma atómica (a diferencia de `updateMany`/`deleteMany`), así
     * que el controlador verifica `projectId` contra `orgId` antes de llamar a
     * este método — el mismo patrón que ya usan `createTask`/`createPhase`/`addRepo`
     * en este archivo para todo `create` colgado de un proyecto.
     */
    addMember: (projectId: string, userId: string) =>
        prisma.projectTeamMember.create({
            data: { projectId, userId },
            include: {
                profile: { select: { id: true, fullName: true, email: true, role: true } },
            },
        }),

    removeMember: async (projectId: string, userId: string, orgId: string) => {
        const { count } = await prisma.projectTeamMember.deleteMany({
            where: { projectId, userId, project: { organizationId: orgId } },
        });
        return count > 0;
    },
};
