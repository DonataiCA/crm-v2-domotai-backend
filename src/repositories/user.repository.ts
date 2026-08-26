import { prisma } from '../config/prisma';

export enum AuthProvider {
    EMAIL = 'EMAIL',
    GOOGLE = 'GOOGLE',
    APPLE = 'APPLE',
}

export const UserRepository = {
    findByEmail: (email: string) => prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            password: true,
            gender: true,
            phoneNumber: true,
            providerId: true,
            authProvider: true,
            role: true,
            createdAt: true,
            updatedAt: true,
        },
    }),

    findByPhoneNumber: (phoneNumber: string) => prisma.user.findUnique({
        where: { phoneNumber },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            password: true,
            gender: true,
            phoneNumber: true,
            providerId: true,
            authProvider: true,
            role: true,
            createdAt: true,
            updatedAt: true,
        },
    }),

    create: (data: { email: string, password?: string, firstName: string, lastName: string, gender: string, phoneNumber: string, providerId?: string, authProvider?: AuthProvider }) => {
        const { password, ...rest } = data;
        const createData = password ? { ...rest, password } : rest;
        return prisma.user.create({ data: createData });
    },

    findById: (id: string, organizationId?: string) => {
        // Con organizationId, sólo devuelve el usuario si su perfil es miembro de
        // esa organización (V2: `GET /users/:id` no debe cruzar inquilinos).
        if (organizationId) {
            return prisma.user.findFirst({
                where: { id, profile: { organizationMembers: { some: { organizationId } } } },
                include: { profile: true },
            });
        }
        return prisma.user.findUnique({
            where: { id },
            include: { profile: true },
        });
    },

    findAll: (skip: number, take: number, filters?: { search?: string; organizationId?: string }) => {
        const where: Record<string, unknown> = {};

        if (filters?.organizationId) {
            where.profile = { organizationMembers: { some: { organizationId: filters.organizationId } } };
        }

        if (filters?.search) {
            where.OR = [
                { email: { contains: filters.search, mode: 'insensitive' } },
                { firstName: { contains: filters.search, mode: 'insensitive' } },
                { lastName: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        return prisma.user.findMany({
            skip,
            take,
            where,
            orderBy: { id: 'asc' },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                gender: true,
                phoneNumber: true,
                providerId: true,
                authProvider: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    },

    count: (filters?: { search?: string; organizationId?: string }) => {
        const where: Record<string, unknown> = {};

        if (filters?.organizationId) {
            where.profile = { organizationMembers: { some: { organizationId: filters.organizationId } } };
        }

        if (filters?.search) {
            where.OR = [
                { email: { contains: filters.search, mode: 'insensitive' } },
                { firstName: { contains: filters.search, mode: 'insensitive' } },
                { lastName: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        return prisma.user.count({ where });
    },

    update: (id: string, data: Partial<{
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        gender: string;
        phoneNumber: string;
        providerId: string;
        authProvider: AuthProvider;
    }>) =>
        prisma.user.update({ where: { id }, data }),

    delete: (id: string) => prisma.user.delete({ where: { id } }),
};

