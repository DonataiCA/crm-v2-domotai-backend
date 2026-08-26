import { prisma } from '../config/prisma';
import { isTeamRole } from '../constants/roles';
import { ARCHIVED_PROJECT_STATUS } from '../constants/enums';

// `status: { not: 'COMPLETED' }` y no `isCompletedStatus`: son filtros de
// Prisma, no comparaciones en JavaScript, así que no admiten una función.
// Antes había aquí un COMPLETED_STATES con cuatro grafías de lo mismo.


export const CapacityRepository = {
    /**
     * Returns active org members with an internal role (excludes clients and viewers).
     *
     * El filtro se aplica en memoria y no con `role: { in: [...] }` porque la
     * comparación de Postgres distingue mayúsculas: un perfil guardado como
     * `"Admin"` desaparecería del cálculo de capacidad sin ningún aviso.
     * La lista de miembros de una organización es pequeña, así que el coste es nulo.
     */
    getTeamMembers: async (orgId: string) => {
        const members = await prisma.organizationMember.findMany({
            where: { organizationId: orgId },
            include: {
                profile: { select: { id: true, fullName: true, email: true, role: true } },
            },
        });

        return members.filter((m) => isTeamRole(m.profile?.role));
    },

    /**
     * Count assigned tasks (both ProjectTask and Task models) that are NOT completed.
     */
    countOpenTasks: async (profileId: string, organizationId: string): Promise<number> => {
        const [projectCount, taskCount] = await Promise.all([
            prisma.projectTask.count({
                where: {
                    assignedTo: profileId,
                    organizationId,
                    status: { not: 'COMPLETED' },
                },
            }),
            prisma.task.count({
                where: {
                    assignedTo: profileId,
                    organizationId,
                    status: { not: 'COMPLETED' },
                },
            }),
        ]);
        return projectCount + taskCount;
    },

    /**
     * Count overdue tasks: dueDate in the past AND status not completed.
     */
    countOverdueTasks: async (profileId: string, organizationId: string, now: Date): Promise<number> => {
        const [projectCount, taskCount] = await Promise.all([
            prisma.projectTask.count({
                where: {
                    assignedTo: profileId,
                    organizationId,
                    status: { not: 'COMPLETED' },
                    dueDate: { lt: now },
                },
            }),
            prisma.task.count({
                where: {
                    assignedTo: profileId,
                    organizationId,
                    status: { not: 'COMPLETED' },
                    dueDate: { lt: now },
                },
            }),
        ]);
        return projectCount + taskCount;
    },

    /**
     * Sum logged hours from TimeEntry within the week.
     */
    sumLoggedHours: async (profileId: string, orgId: string, weekStart: Date, weekEnd: Date): Promise<number> => {
        const agg = await prisma.timeEntry.aggregate({
            where: {
                userId: profileId,
                organizationId: orgId,
                startTime: { gte: weekStart, lte: weekEnd },
            },
            _sum: { durationMinutes: true },
        });
        const minutes = agg._sum.durationMinutes ?? 0;
        return Math.round((minutes / 60) * 10) / 10;
    },

    /**
     * Count active (non-archived) projects where user is a team member or project lead.
     */
    countActiveProjects: async (profileId: string, orgId: string): Promise<number> => {
        const projects = await prisma.project.findMany({
            where: {
                organizationId: orgId,
                status: { not: ARCHIVED_PROJECT_STATUS },
                OR: [
                    { projectLeadId: profileId },
                    { teamMembers: { some: { userId: profileId } } },
                ],
            },
            select: { id: true },
        });
        return projects.length;
    },

    /**
     * Count projects where user is the project lead.
     */
    countProjectLead: (profileId: string, orgId: string): Promise<number> =>
        prisma.project.count({
            where: {
                organizationId: orgId,
                status: { not: ARCHIVED_PROJECT_STATUS },
                projectLeadId: profileId,
            },
        }),

    /**
     * Per-project breakdown of open tasks for a given user.
     * Returns array of { projectId, projectName, openCount, overdueCount }.
     */
    tasksByProject: async (profileId: string, orgId: string, now: Date) => {
        // Group ProjectTask by projectId
        const grouped = await prisma.projectTask.groupBy({
            by: ['projectId'],
            where: {
                assignedTo: profileId,
                organizationId: orgId,
                status: { not: 'COMPLETED' },
            },
            _count: { _all: true },
        });

        if (grouped.length === 0) return [];

        const projectIds = grouped.map(g => g.projectId);
        const projects = await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
        });
        const nameMap = new Map(projects.map(p => [p.id, p.name]));

        // Get overdue counts in a second pass (per project)
        const overdueRows = await prisma.projectTask.groupBy({
            by: ['projectId'],
            where: {
                assignedTo: profileId,
                organizationId: orgId,
                status: { not: 'COMPLETED' },
                dueDate: { lt: now },
            },
            _count: { _all: true },
        });
        const overdueMap = new Map(overdueRows.map(r => [r.projectId, r._count._all]));

        return grouped
            .map(g => ({
                projectId: g.projectId,
                projectName: nameMap.get(g.projectId) || 'Unknown',
                openCount: g._count._all,
                overdueCount: overdueMap.get(g.projectId) || 0,
            }))
            .sort((a, b) => b.openCount - a.openCount);
    },

    /**
     * Get next N upcoming tasks (with dueDate >= now) for a user, ordered by dueDate asc.
     */
    upcomingTasks: async (profileId: string, orgId: string, now: Date, limit = 5) => {
        const tasks = await prisma.projectTask.findMany({
            where: {
                assignedTo: profileId,
                organizationId: orgId,
                status: { not: 'COMPLETED' },
                dueDate: { gte: now },
            },
            select: {
                id: true,
                title: true,
                dueDate: true,
                priority: true,
                projectId: true,
                project: { select: { name: true } },
            },
            orderBy: { dueDate: 'asc' },
            take: limit,
        });

        return tasks.map(t => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            priority: t.priority,
            projectId: t.projectId,
            projectName: t.project?.name || null,
        }));
    },
};
