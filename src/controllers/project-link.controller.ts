import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectLinkRepository } from '../repositories/project-link.repository';
import { logAudit } from '../utils/audit';

export const ProjectLinkController = {
    list: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const links = await ProjectLinkRepository.listByProject(projectId, orgId);
            res.json(links);
        } catch (error) {
            return sendError(res, 500, 'Failed to list links', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const profileId = (req as any).user?.profileId;
            const { projectId } = req.params;
            const { title, url, description, orderIndex } = req.body;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const finalOrder = typeof orderIndex === 'number'
                ? orderIndex
                : await ProjectLinkRepository.nextOrderIndex(projectId, orgId);

            const link = await ProjectLinkRepository.create({
                projectId,
                organizationId: orgId,
                title,
                url,
                description: description ?? null,
                orderIndex: finalOrder,
                createdBy: profileId ?? null,
            });

            res.status(201).json(link);
            await logAudit(req, { action: 'CREATE', entityType: 'ProjectLink', entityId: link.id, entityName: link.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to create link', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, linkId } = req.params;

            const existing = await ProjectLinkRepository.findById(linkId, orgId);
            if (!existing || existing.projectId !== projectId) {
                return sendError(res, 404, 'Link not found');
            }

            const link = await ProjectLinkRepository.update(linkId, req.body);
            res.json(link);
            await logAudit(req, { action: 'UPDATE', entityType: 'ProjectLink', entityId: link.id, entityName: link.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to update link', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId, linkId } = req.params;

            const existing = await ProjectLinkRepository.findById(linkId, orgId);
            if (!existing || existing.projectId !== projectId) {
                return sendError(res, 404, 'Link not found');
            }

            await ProjectLinkRepository.delete(linkId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'ProjectLink', entityId: existing.id, entityName: existing.title });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete link', error);
        }
    },

    reorder: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const { orderedIds } = req.body;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            await ProjectLinkRepository.reorder(projectId, orgId, orderedIds);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to reorder links', error);
        }
    },
};
