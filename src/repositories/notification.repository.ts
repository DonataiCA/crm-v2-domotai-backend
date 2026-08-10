import { prisma } from '../config/prisma';

export const NotificationRepository = {
    findAll: (orgId: string, skip: number, take: number, filters?: { read?: boolean }) => {
        const where: Record<string, unknown> = { organizationId: orgId };

        if (filters?.read !== undefined) {
            where.read = filters.read;
        }

        return prisma.notification.findMany({
            skip,
            take,
            where,
            orderBy: { createdAt: 'desc' },
        });
    },

    count: (orgId: string, filters?: { read?: boolean }) => {
        const where: Record<string, unknown> = { organizationId: orgId };

        if (filters?.read !== undefined) {
            where.read = filters.read;
        }

        return prisma.notification.count({ where });
    },

    unreadCount: (orgId: string) =>
        prisma.notification.count({
            where: { organizationId: orgId, read: false },
        }),

    markAsRead: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.notification.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.notification.update({
            where: { id },
            data: { read: true, readAt: new Date() },
        });
    },

    markAllAsRead: (orgId: string) =>
        prisma.notification.updateMany({
            where: { organizationId: orgId, read: false },
            data: { read: true, readAt: new Date() },
        }),

    findById: (id: string, organizationId?: string) =>
        prisma.notification.findFirst({
            where: organizationId ? { id, organizationId } : { id },
        }),

    delete: async (id: string, organizationId?: string) => {
        if (organizationId) {
            const record = await prisma.notification.findFirst({ where: { id, organizationId } });
            if (!record) return null;
        }
        return prisma.notification.delete({ where: { id } });
    },

    getPreferences: (userId: string) =>
        prisma.notificationPreference.findMany({ where: { userId } }),

    upsertPreferences: async (userId: string, preferences: Array<{ notificationType: string; channel: string; enabled: boolean }>) => {
        const results = [];
        for (const pref of preferences) {
            const existing = await prisma.notificationPreference.findFirst({
                where: { userId, notificationType: pref.notificationType },
            });
            if (existing) {
                results.push(await prisma.notificationPreference.update({
                    where: { id: existing.id },
                    data: { channel: pref.channel, enabled: pref.enabled },
                }));
            } else {
                results.push(await prisma.notificationPreference.create({
                    data: { userId, notificationType: pref.notificationType, channel: pref.channel, enabled: pref.enabled },
                }));
            }
        }
        return results;
    },

    create: (data: {
        organizationId: string;
        type: string;
        title: string;
        body?: string;
        entityType?: string;
        entityId?: string;
        actorId?: string;
        metadata?: any;
    }) =>
        prisma.notification.create({ data }),
};
