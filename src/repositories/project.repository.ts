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
    deliverables: { orderBy: { orderIndex: 'asc' as const } },
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
        conclusion?: string;
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
     * Contexto que necesita la importación por plantilla para traducir los nombres que
     * escribió el usuario a claves ajenas: las fases del proyecto con el `orderIndex`
     * libre de cada una, quién puede ser responsable y qué títulos ya están cogidos.
     *
     * Va en una sola lectura porque el import es todo o nada: o se resuelve el archivo
     * entero o no se crea nada, así que no tiene sentido ir a la base por tarea.
     *
     * Los miembros del equipo del proyecto tienen preferencia; si el proyecto no tiene
     * equipo se cae a los de la organización, el mismo criterio que ya usa `chatTask`.
     */
    getImportContext: async (projectId: string, orgId: string) => {
        const [phases, tasks, teamMembers, orgMembers] = await Promise.all([
            prisma.projectPhase.findMany({
                where: { projectId },
                orderBy: { orderIndex: 'asc' },
                select: { id: true, name: true },
            }),
            prisma.projectTask.findMany({
                where: { projectId },
                select: { title: true, phaseId: true, orderIndex: true },
            }),
            prisma.projectTeamMember.findMany({
                where: { projectId, project: { organizationId: orgId } },
                include: { profile: { select: { id: true, fullName: true, email: true } } },
            }),
            prisma.organizationMember.findMany({
                where: { organizationId: orgId },
                include: { profile: { select: { id: true, fullName: true, email: true } } },
            }),
        ]);

        const maxOrderIndex = new Map<string, number>();
        for (const task of tasks) {
            if (!task.phaseId) continue;
            const current = maxOrderIndex.get(task.phaseId);
            if (current === undefined || task.orderIndex > current) {
                maxOrderIndex.set(task.phaseId, task.orderIndex);
            }
        }

        const source = teamMembers.length > 0 ? teamMembers : orgMembers;

        return {
            phases: phases.map((phase) => ({
                id: phase.id,
                name: phase.name,
                nextOrderIndex: (maxOrderIndex.get(phase.id) ?? -1) + 1,
            })),
            members: source.map((member) => ({
                id: member.profile?.id ?? member.userId,
                fullName: member.profile?.fullName ?? null,
                email: member.profile?.email ?? null,
            })),
            existingTitles: tasks.map((task) => task.title),
        };
    },

    /**
     * Alta en bloque de la importación por plantilla. Una transacción y no un bucle de
     * `createTask`: un archivo a medio importar deja al usuario sin forma de reintentar
     * sin duplicar la mitad de las tareas.
     */
    createTasks: (
        rows: Array<{
            projectId: string;
            organizationId: string;
            phaseId: string;
            title: string;
            description: string | null;
            conclusion: string | null;
            status: string;
            priority: string;
            startDate: Date | null;
            dueDate: Date | null;
            assignedTo: string | null;
            orderIndex: number;
            createdBy?: string;
        }>,
    ) =>
        prisma.$transaction(
            rows.map((data) => prisma.projectTask.create({ data, include: TASK_INCLUDE })),
        ),

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
