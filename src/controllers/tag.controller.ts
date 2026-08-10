import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';

export const TagController = {
    // List all tags for the organization
    index: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const tags = await prisma.tag.findMany({
                where: { organizationId: orgId },
                orderBy: { name: 'asc' },
                include: {
                    creator: { select: { id: true, fullName: true, email: true } },
                    _count: { select: { taskTags: true } },
                },
            });

            res.json(tags);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch tags', error);
        }
    },

    // Create a new tag
    create: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const userId = (req as any).user?.profileId;
            const { name, color } = req.body;

            if (!name || !name.trim()) return sendError(res, 400, 'Tag name is required');

            const nameLower = name.trim().toLowerCase();

            // Check uniqueness (case-insensitive within org)
            const existing = await prisma.tag.findFirst({
                where: { organizationId: orgId, nameLower },
            });
            if (existing) return sendError(res, 409, 'A tag with this name already exists');

            const tag = await prisma.tag.create({
                data: {
                    name: name.trim(),
                    nameLower,
                    color: color || null,
                    organizationId: orgId,
                    createdBy: userId,
                },
                include: {
                    creator: { select: { id: true, fullName: true, email: true } },
                    _count: { select: { taskTags: true } },
                },
            });

            res.status(201).json(tag);
        } catch (error) {
            return sendError(res, 500, 'Failed to create tag', error);
        }
    },

    // Update a tag
    update: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const { tagId } = req.params;
            const { name, color } = req.body;

            const data: any = {};
            if (color !== undefined) data.color = color;

            if (name && name.trim()) {
                const nameLower = name.trim().toLowerCase();
                // Check uniqueness (excluding self)
                const existing = await prisma.tag.findFirst({
                    where: { organizationId: orgId, nameLower, id: { not: tagId } },
                });
                if (existing) return sendError(res, 409, 'A tag with this name already exists');
                data.name = name.trim();
                data.nameLower = nameLower;
            }

            const tag = await prisma.tag.update({
                where: { id: tagId },
                data,
                include: {
                    creator: { select: { id: true, fullName: true, email: true } },
                    _count: { select: { taskTags: true } },
                },
            });

            res.json(tag);
        } catch (error) {
            return sendError(res, 500, 'Failed to update tag', error);
        }
    },

    // Delete a tag
    delete: async (req: Request, res: Response) => {
        try {
            const { tagId } = req.params;
            await prisma.tag.delete({ where: { id: tagId } });
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete tag', error);
        }
    },

    // Assign tag to a project task
    assignToTask: async (req: Request, res: Response) => {
        try {
            const { taskId, tagId } = req.params;

            await prisma.projectTaskTag.create({
                data: { projectTaskId: taskId, tagId },
            });

            res.sendStatus(201);
        } catch (error: any) {
            if (error?.code === 'P2002') {
                return res.sendStatus(200); // Already assigned, idempotent
            }
            return sendError(res, 500, 'Failed to assign tag', error);
        }
    },

    // Remove tag from a project task
    removeFromTask: async (req: Request, res: Response) => {
        try {
            const { taskId, tagId } = req.params;

            await prisma.projectTaskTag.delete({
                where: { projectTaskId_tagId: { projectTaskId: taskId, tagId } },
            });

            res.sendStatus(204);
        } catch (error: any) {
            if (error?.code === 'P2025') {
                return res.sendStatus(204); // Already removed
            }
            return sendError(res, 500, 'Failed to remove tag', error);
        }
    },

    // Set all tags for a project task (replaces existing)
    setTaskTags: async (req: Request, res: Response) => {
        try {
            const { taskId } = req.params;
            const { tagIds } = req.body;

            if (!Array.isArray(tagIds)) return sendError(res, 400, 'tagIds must be an array');

            // Delete all existing and re-create
            await prisma.$transaction([
                prisma.projectTaskTag.deleteMany({ where: { projectTaskId: taskId } }),
                ...tagIds.map((tagId: string) =>
                    prisma.projectTaskTag.create({
                        data: { projectTaskId: taskId, tagId },
                    })
                ),
            ]);

            // Return updated task with tags
            const task = await prisma.projectTask.findUnique({
                where: { id: taskId },
                include: {
                    taskTags: {
                        include: { tag: true },
                    },
                },
            });

            res.json(task?.taskTags.map(tt => tt.tag) || []);
        } catch (error) {
            return sendError(res, 500, 'Failed to set task tags', error);
        }
    },
};
