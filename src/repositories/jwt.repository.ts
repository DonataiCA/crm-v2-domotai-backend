import { prisma } from '../config/prisma';

export const JwtRepository = {
    create: (userId: string, secret: string) =>
        prisma.jWT.create({ data: { userId, secret } }),

    findByUserId: (userId: string) =>
        prisma.jWT.findUnique({ where: { userId } }),

    update: (id: string, data: { secret: string; createdAt: Date }) =>
        prisma.jWT.update({ where: { id }, data }),

    deleteByUserId: (userId: string) =>
        prisma.jWT.delete({ where: { userId } }).catch(() => undefined),

    deleteByToken: (token: string) => {
        // Decode token to get userId, then delete by userId
        const jwt = require('jsonwebtoken');
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.id) {
                return prisma.jWT.delete({ where: { userId: decoded.id } }).catch(() => undefined);
            }
            return Promise.resolve(undefined);
        } catch {
            return Promise.resolve(undefined);
        }
    },
};

