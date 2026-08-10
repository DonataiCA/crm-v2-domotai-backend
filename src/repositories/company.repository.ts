import { prisma } from '../config/prisma';

const companyIncludes = {
    assignee: { select: { id: true, fullName: true, email: true } },
    creator: { select: { id: true, fullName: true, email: true } },
    _count: { select: { contacts: true, leads: true, tasks: true } },
};

export const CompanyRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: { search?: string }) => {
        const where: any = { organizationId: orgId, deletedAt: null };
        if (filters?.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { domain: { contains: filters.search, mode: 'insensitive' } },
                { industry: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        return prisma.company.findMany({ where, skip, take, include: companyIncludes, orderBy: { name: 'asc' } });
    },

    count: (orgId: string, filters?: { search?: string }) => {
        const where: any = { organizationId: orgId, deletedAt: null };
        if (filters?.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { domain: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        return prisma.company.count({ where });
    },

    findById: (id: string, organizationId?: string) =>
        prisma.company.findFirst({
            where: { id, deletedAt: null, ...(organizationId ? { organizationId } : {}) },
            include: {
                ...companyIncludes,
                contacts: {
                    where: { deletedAt: null },
                    select: { id: true, name: true, email: true, phone: true, category: true },
                    take: 50,
                },
                leads: {
                    select: {
                        id: true,
                        name: true,
                        stage: true,
                        price: true,
                        assignedTo: true,
                        createdAt: true,
                        assignee: { select: { id: true, fullName: true } },
                    },
                    take: 50,
                },
                tasks: {
                    where: { status: { not: 'COMPLETED' } },
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        dueDate: true,
                        assignee: { select: { id: true, fullName: true } },
                    },
                    orderBy: { dueDate: 'asc' },
                    take: 50,
                },
                fileLinks: {
                    orderBy: { createdAt: 'desc' },
                    include: { creator: { select: { id: true, fullName: true, email: true } } },
                },
            },
        }),

    create: (data: {
        name: string;
        domain?: string;
        industry?: string;
        size?: string;
        website?: string;
        phone?: string;
        address?: string;
        notes?: string;
        assignedTo?: string;
        createdBy?: string;
        organizationId: string;
    }) => prisma.company.create({ data, include: companyIncludes }),

    update: async (id: string, data: Record<string, unknown>, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.company.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.company.update({ where: { id }, data, include: companyIncludes });
    },

    softDelete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.company.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
    },
};
