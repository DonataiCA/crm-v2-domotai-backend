import { prisma } from '../config/prisma';

export const OrganizationRepository = {
    findByUserId: (userId: string) =>
        prisma.organization.findMany({
            where: {
                members: {
                    some: { userId },
                },
            },
            include: {
                members: {
                    include: {
                        profile: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                                role: true,
                                commissionRate: true,
                            },
                        },
                    },
                },
            },
        }),

    findById: (id: string) =>
        prisma.organization.findUnique({
            where: { id },
            include: {
                members: {
                    include: {
                        profile: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                                role: true,
                                commissionRate: true,
                            },
                        },
                    },
                },
            },
        }),

    create: (data: { name: string; slug?: string; logoUrl?: string; colorScheme?: string; createdBy?: string }) =>
        prisma.organization.create({ data }),

    update: (id: string, data: Partial<{ name: string; slug: string; logoUrl: string; colorScheme: string }>) =>
        prisma.organization.update({ where: { id }, data }),

    delete: (id: string) =>
        prisma.organization.delete({ where: { id } }),

    findMembers: (orgId: string) =>
        prisma.organizationMember.findMany({
            where: { organizationId: orgId },
            include: {
                profile: {
                    select: {
                        id: true,
                        userId: true,
                        fullName: true,
                        email: true,
                        phone: true,
                        role: true,
                        commissionRate: true,
                    },
                },
            },
        }),

    addMember: (orgId: string, userId: string, role: string = 'member') =>
        prisma.organizationMember.create({
            data: {
                organizationId: orgId,
                userId,
                role,
            },
            include: {
                profile: {
                    select: {
                        id: true,
                        userId: true,
                        fullName: true,
                        email: true,
                        phone: true,
                        role: true,
                        commissionRate: true,
                    },
                },
            },
        }),

    updateMemberRole: async (orgId: string, userId: string, role: string) => {
        await prisma.organizationMember.updateMany({
            where: { organizationId: orgId, userId },
            data: { role },
        });
        return prisma.organizationMember.findFirst({
            where: { organizationId: orgId, userId },
            include: { profile: { select: { fullName: true, email: true, role: true, commissionRate: true } } },
        });
    },

    removeMember: (orgId: string, userId: string) =>
        prisma.organizationMember.deleteMany({
            where: { organizationId: orgId, userId },
        }),
};
