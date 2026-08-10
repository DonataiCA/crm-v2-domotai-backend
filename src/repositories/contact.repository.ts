import { prisma } from '../config/prisma';

interface ContactFilters {
    search?: string;
    category?: string;
}

function buildWhere(orgId: string, filters?: ContactFilters, includeDeleted = false) {
    const where: Record<string, unknown> = { organizationId: orgId };

    if (!includeDeleted) {
        where.deletedAt = null;
    } else {
        where.deletedAt = { not: null };
    }

    if (filters?.category) {
        where.category = filters.category;
    }
    if (filters?.search) {
        where.OR = [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
            { company: { contains: filters.search, mode: 'insensitive' } },
        ];
    }

    return where;
}

const contactIncludes = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    companyRef: { select: { id: true, name: true } },
};

export const ContactRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: ContactFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.contact.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
            include: contactIncludes,
        });
    },

    findArchived: (orgId: string, skip: number, take: number, filters?: ContactFilters) => {
        const where = buildWhere(orgId, filters, true);
        return prisma.contact.findMany({
            skip,
            take,
            where,
            orderBy: { deletedAt: 'desc' },
            include: contactIncludes,
        });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.contact.findFirst({
            where: { id, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
            include: {
                ...contactIncludes,
                notes: {
                    orderBy: { createdAt: 'desc' },
                    include: { creator: { select: { id: true, fullName: true, email: true } } },
                },
                fileLinks: {
                    orderBy: { createdAt: 'desc' },
                    include: { creator: { select: { id: true, fullName: true, email: true } } },
                },
            },
        }),

    create: (data: {
        name: string;
        email?: string;
        phone?: string;
        company?: string;
        category?: string;
        role?: string;
        leadSource?: string;
        city?: string;
        country?: string;
        website?: string;
        totalRevenue?: number;
        assignedTo?: string;
        createdBy?: string;
        organizationId: string;
    }) =>
        prisma.contact.create({
            data,
            include: contactIncludes,
        }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.contact.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.contact.update({
            where: { id },
            data,
            include: contactIncludes,
        });
    },

    softDelete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.contact.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.contact.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    },

    restore: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.contact.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.contact.update({
            where: { id },
            data: { deletedAt: null },
        });
    },

    bulkSoftDelete: (ids: string[], organizationId?: string) =>
        prisma.contact.updateMany({
            where: { id: { in: ids }, ...(organizationId ? { organizationId } : {}) },
            data: { deletedAt: new Date() },
        }),

    count: (orgId: string, filters?: ContactFilters) => {
        const where = buildWhere(orgId, filters);
        return prisma.contact.count({ where });
    },

    countArchived: (orgId: string, filters?: ContactFilters) => {
        const where = buildWhere(orgId, filters, true);
        return prisma.contact.count({ where });
    },

    // Notes
    addNote: (data: { contactId: string; note: string; createdBy?: string }) =>
        prisma.contactNote.create({
            data,
            include: { creator: { select: { id: true, fullName: true, email: true } } },
        }),

    deleteNote: (noteId: string) =>
        prisma.contactNote.delete({ where: { id: noteId } }),

    // File links
    addFileLink: (data: { contactId: string; title: string; url: string; fileType?: string; createdBy?: string }) =>
        prisma.fileLink.create({
            data,
            include: { creator: { select: { id: true, fullName: true, email: true } } },
        }),

    deleteFileLink: (fileId: string) =>
        prisma.fileLink.delete({ where: { id: fileId } }),
};
