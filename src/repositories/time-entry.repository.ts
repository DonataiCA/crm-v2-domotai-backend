import { prisma } from '../config/prisma';

interface TimeEntryFilters {
    userId?: string;
    projectId?: string;
    billable?: string;
}

function buildWhere(orgId: string, filters?: TimeEntryFilters) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.billable !== undefined && filters.billable !== '') {
        where.billable = filters.billable === 'true';
    }
    return where;
}

const timeEntryIncludes = {
    profile: { select: { id: true, fullName: true, email: true } },
    project: { select: { id: true, name: true } },
};

function renameProfileToUser(entry: any) {
    if (!entry) return entry;
    const { profile, ...rest } = entry;
    return { ...rest, user: profile };
}

export const TimeEntryRepository = {
    findAll: async (orgId: string, skip: number, take: number, filters?: TimeEntryFilters) => {
        const where = buildWhere(orgId, filters);
        const entries = await prisma.timeEntry.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
            include: timeEntryIncludes,
        });
        return entries.map(renameProfileToUser);
    },

    count: (orgId: string, filters?: TimeEntryFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.timeEntry.count({ where });
    },

    findById: async (id: string, organizationId?: string) => {
        const entry = await prisma.timeEntry.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: timeEntryIncludes,
        });
        return renameProfileToUser(entry);
    },

    create: async (data: {
        organizationId: string;
        userId: string;
        projectId?: string;
        projectTaskId?: string;
        taskId?: string;
        description?: string;
        startTime?: Date | string;
        endTime?: Date | string;
        durationMinutes?: number;
        billable?: boolean;
        hourlyRate?: number;
    }) => {
        const entry = await prisma.timeEntry.create({
            data,
            include: timeEntryIncludes,
        });
        return renameProfileToUser(entry);
    },

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.timeEntry.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        const entry = await prisma.timeEntry.update({
            where: { id },
            data,
            include: timeEntryIncludes,
        });
        return renameProfileToUser(entry);
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.timeEntry.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.timeEntry.delete({ where: { id } });
    },

    startTimer: async (data: {
        organizationId: string;
        userId: string;
        projectId?: string;
        projectTaskId?: string;
        taskId?: string;
        description?: string;
        billable?: boolean;
        hourlyRate?: number;
    }) => {
        const entry = await prisma.timeEntry.create({
            data: {
                ...data,
                startTime: new Date(),
            },
            include: timeEntryIncludes,
        });
        return renameProfileToUser(entry);
    },

    stopTimer: async (id: string) => {
        const existing = await prisma.timeEntry.findUnique({ where: { id } });
        if (!existing) return null;
        if (!existing.startTime) return null;

        const endTime = new Date();
        const durationMinutes = Math.round(
            (endTime.getTime() - new Date(existing.startTime).getTime()) / 60000,
        );

        const entry = await prisma.timeEntry.update({
            where: { id },
            data: { endTime, durationMinutes },
            include: timeEntryIncludes,
        });
        return renameProfileToUser(entry);
    },
};
