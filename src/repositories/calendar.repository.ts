import { prisma } from '../config/prisma';
import { ARCHIVED_PROJECT_STATUS } from '../constants/enums';

interface CalendarFilters {
    dateFrom?: string;
    dateTo?: string;
    contactId?: string;
    leadId?: string;
    projectId?: string;
}

const calendarIncludes = {
    contact: { select: { id: true, name: true, email: true, phone: true, company: true } },
    lead: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
    creator: { select: { id: true, fullName: true, email: true } },
};

export const CalendarRepository = {
    findAll: (orgId: string, filters: CalendarFilters) => {
        const where: Record<string, unknown> = { organizationId: orgId };

        if (filters.dateFrom || filters.dateTo) {
            const startDate: Record<string, unknown> = {};
            if (filters.dateTo) startDate.lte = new Date(filters.dateTo);
            // For events that overlap the range, we check startDate <= dateTo
            // and endDate >= dateFrom (or startDate >= dateFrom if no endDate)
            where.startDate = startDate.lte ? { lte: new Date(filters.dateTo!) } : undefined;
            if (!startDate.lte) delete where.startDate;
        }

        // Build a proper date range filter
        if (filters.dateFrom && filters.dateTo) {
            where.AND = [
                { startDate: { lte: new Date(filters.dateTo) } },
                {
                    OR: [
                        { endDate: { gte: new Date(filters.dateFrom) } },
                        { endDate: null, startDate: { gte: new Date(filters.dateFrom) } },
                    ],
                },
            ];
            delete where.startDate;
        } else if (filters.dateFrom) {
            where.OR = [
                { endDate: { gte: new Date(filters.dateFrom) } },
                { endDate: null, startDate: { gte: new Date(filters.dateFrom) } },
            ];
        } else if (filters.dateTo) {
            where.startDate = { lte: new Date(filters.dateTo) };
        }

        if (filters.contactId) where.contactId = filters.contactId;
        if (filters.leadId) where.leadId = filters.leadId;
        if (filters.projectId) where.projectId = filters.projectId;

        return prisma.calendarEvent.findMany({
            where,
            orderBy: { startDate: 'asc' },
            include: calendarIncludes,
        });
    },

    /**
     * Hitos de proyecto que caen dentro del rango. No es un solapamiento: sólo
     * interesan los extremos (inicio y fin), que es lo que se pinta en la grilla,
     * así que un proyecto que atraviesa el mes entero sin empezar ni terminar en
     * él no aparece.
     */
    findProjectMilestones: (orgId: string, from: Date, to: Date) =>
        prisma.project.findMany({
            where: {
                organizationId: orgId,
                status: { not: ARCHIVED_PROJECT_STATUS },
                OR: [
                    { startDate: { gte: from, lte: to } },
                    { endDate: { gte: from, lte: to } },
                ],
            },
            select: { id: true, name: true, status: true, startDate: true, endDate: true },
            orderBy: { startDate: 'asc' },
        }),

    /**
     * Igual que el anterior para las fases. `ProjectPhase` no tiene
     * `organizationId` propio: el aislamiento va por la relación `project` y
     * quitarlo expone las fases de otras organizaciones.
     */
    findPhaseMilestones: (orgId: string, from: Date, to: Date) =>
        prisma.projectPhase.findMany({
            where: {
                project: { organizationId: orgId, status: { not: ARCHIVED_PROJECT_STATUS } },
                OR: [
                    { startDate: { gte: from, lte: to } },
                    { endDate: { gte: from, lte: to } },
                ],
            },
            select: {
                id: true,
                name: true,
                status: true,
                startDate: true,
                endDate: true,
                projectId: true,
                project: { select: { id: true, name: true } },
            },
            orderBy: { startDate: 'asc' },
        }),

    findById: (id: string, organizationId?: string) =>
        prisma.calendarEvent.findFirst({
            where: organizationId ? { id, organizationId } : { id },
            include: calendarIncludes,
        }),

    create: (data: {
        organizationId: string;
        title: string;
        description?: string;
        startDate: Date;
        endDate?: Date;
        allDay?: boolean;
        color?: string;
        contactId?: string;
        leadId?: string;
        projectId?: string;
        createdBy?: string;
    }) =>
        prisma.calendarEvent.create({
            data,
            include: calendarIncludes,
        }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.calendarEvent.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.calendarEvent.update({
            where: { id },
            data,
            include: calendarIncludes,
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.calendarEvent.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.calendarEvent.delete({ where: { id } });
    },
};
