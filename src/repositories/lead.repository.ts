import { prisma } from '../config/prisma';

interface LeadFilters {
    stage?: string;
    assignedTo?: string;
    search?: string;
    pipelineId?: string;
}

function buildWhere(orgId: string, filters?: LeadFilters) {
    const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };

    if (filters?.stage) {
        where.stage = filters.stage;
    }
    if (filters?.assignedTo) {
        where.assignedTo = filters.assignedTo;
    }
    if (filters?.pipelineId) {
        where.pipelineId = filters.pipelineId;
    }
    if (filters?.search) {
        where.name = { contains: filters.search, mode: 'insensitive' };
    }

    return where;
}

const userRefSelect = { select: { id: true, fullName: true, email: true } };
const contactRefSelect = { select: { id: true, name: true, email: true, phone: true, company: true } };

const leadIncludes = {
    contact: contactRefSelect,
    company: { select: { id: true, name: true, domain: true } },
    project: { select: { id: true, name: true } },
    assignee: userRefSelect,
    creator: userRefSelect,
    pipeline: true,
    events: {
        orderBy: { createdAt: 'desc' as const },
        include: { creator: userRefSelect },
    },
};

export const LeadRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: LeadFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.lead.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
            include: leadIncludes,
        });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.lead.findFirst({
            where: { id, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
            include: {
                ...leadIncludes,
                stageHistory: {
                    orderBy: { enteredAt: 'desc' },
                    include: { creator: userRefSelect },
                },
                fileLinks: {
                    orderBy: { createdAt: 'desc' },
                    include: { creator: userRefSelect },
                },
            },
        }),

    create: (data: {
        name?: string;
        details?: string;
        stage?: string;
        pipelineId?: string;
        price?: number;
        pricingType?: string;
        paymentDate?: Date | string;
        recurringStartDate?: Date | string;
        recurringEndDate?: Date | string;
        nextFollowUp?: Date | string;
        contactId?: string;
        assignedTo?: string;
        createdBy?: string;
        organizationId: string;
    }) =>
        prisma.lead.create({
            data,
            include: leadIncludes,
        }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.lead.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.lead.update({
            where: { id },
            data,
            include: leadIncludes,
        });
    },

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.lead.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.lead.delete({ where: { id } });
    },

    count: (orgId: string, filters?: LeadFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.lead.count({ where });
    },

    addEvent: (data: {
        leadId: string;
        organizationId: string;
        eventType: string;
        description?: string;
        createdBy?: string;
    }) =>
        prisma.leadEvent.create({
            data,
            include: { creator: userRefSelect },
        }),

    deleteEvent: (id: string) =>
        prisma.leadEvent.delete({ where: { id } }),

    convert: (leadId: string, projectId: string) =>
        prisma.lead.update({
            where: { id: leadId },
            data: {
                converted: true,
                convertedAt: new Date(),
                projectId,
            },
            include: leadIncludes,
        }),

    archive: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.lead.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.lead.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    },

    restore: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.lead.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.lead.update({
            where: { id },
            data: { deletedAt: null },
        });
    },

    findArchived: (orgId: string) =>
        prisma.lead.findMany({
            where: { organizationId: orgId, deletedAt: { not: null } },
            orderBy: { deletedAt: 'desc' },
            select: { id: true, name: true, stage: true, deletedAt: true },
        }),
};
