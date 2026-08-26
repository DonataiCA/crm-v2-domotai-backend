import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { LeadRepository } from '../repositories/lead.repository';
import { logAudit } from '../utils/audit';
import { notify } from '../utils/notify';
import { prisma } from '../config/prisma';

/**
 * Resuelve el pipeline efectivo del lead y comprueba que la etapa pedida
 * exista dentro de él. Devuelve el mensaje de error o null si todo está bien.
 *
 * Antes no se comprobaba nada: `stage` viajaba de `req.body` a la base tal
 * cual, así que un lead podía quedar en una etapa que su pipeline no tiene y
 * desaparecer del tablero sin que nadie supiera por qué.
 */
async function validateStage(
    stage: string | undefined,
    pipelineId: string | null | undefined,
    orgId: string,
): Promise<string | null> {
    if (!stage) return null;

    let effectivePipelineId = pipelineId ?? null;
    if (!effectivePipelineId) {
        const defaultPipeline = await LeadRepository.findDefaultPipeline(orgId);
        if (!defaultPipeline) return 'No pipeline available for this organization';
        effectivePipelineId = defaultPipeline.id;
    }

    const found = await LeadRepository.findStageBySlug(effectivePipelineId, stage);
    if (!found) return `Stage '${stage}' does not exist in the selected pipeline`;

    return null;
}

export const LeadController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                stage: req.query.stage as string | undefined,
                assignedTo: req.query.assignedTo as string | undefined,
                search: req.query.search as string | undefined,
                pipelineId: req.query.pipelineId as string | undefined,
            };

            const [data, total] = await Promise.all([
                LeadRepository.findAll(orgId, skip, limit, filters),
                LeadRepository.count(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch leads', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const lead = await LeadRepository.findById(req.params.id, orgId);
            if (!lead) return sendError(res, 404, 'Lead not found');
            res.json(lead);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch lead', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;

            const stageError = await validateStage(req.body.stage, req.body.pipelineId, orgId);
            if (stageError) return sendError(res, 400, stageError);

            // Sin `stage` explícito, se resuelve la etapa inicial del pipeline.
            // El esquema ya no trae `@default("new")`: las etapas son por
            // pipeline y configurables, así que no hay valor válido para todos.
            let stage: string | undefined = req.body.stage;
            if (!stage) {
                const pipelineId = req.body.pipelineId
                    ?? (await LeadRepository.findDefaultPipeline(orgId))?.id
                    ?? null;
                if (pipelineId) {
                    stage = (await LeadRepository.findFirstStage(pipelineId))?.slug;
                }
            }

            const lead = await LeadRepository.create({
                ...req.body,
                stage,
                organizationId: orgId,
                createdBy: userId,
            });

            res.status(201).json(lead);
            await logAudit(req, { action: 'CREATE', entityType: 'Lead', entityId: lead.id, entityName: lead.name ?? lead.contact?.email ?? undefined });

            if (lead.assignedTo) {
                await notify({
                    organizationId: orgId,
                    type: 'LEAD_ASSIGNED',
                    title: `New lead assigned: ${lead.name}`,
                    entityType: 'Lead',
                    entityId: lead.id,
                    actorId: userId,
                    recipientUserId: lead.assignedTo,
                    metadata: { leadName: lead.name },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to create lead', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await LeadRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Lead not found');

            const stageError = await validateStage(
                req.body.stage,
                req.body.pipelineId ?? existing.pipelineId,
                orgId,
            );
            if (stageError) return sendError(res, 400, stageError);

            const lead = await LeadRepository.update(req.params.id, req.body, orgId);
            if (!lead) return sendError(res, 404, 'Lead not found');
            res.json(lead);
            await logAudit(req, { action: 'UPDATE', entityType: 'Lead', entityId: lead.id, entityName: lead.name ?? lead.contact?.email ?? undefined });

            // Notify on assignment change
            if (req.body.assignedTo && req.body.assignedTo !== existing.assignedTo) {
                const actor = await prisma.profile.findUnique({ where: { id: (req as any).userId }, select: { fullName: true } });
                await notify({
                    organizationId: existing.organizationId,
                    type: 'LEAD_ASSIGNED',
                    title: `Lead assigned: ${lead.name}`,
                    entityType: 'Lead',
                    entityId: lead.id,
                    actorId: (req as any).userId,
                    recipientUserId: req.body.assignedTo,
                    metadata: { leadName: lead.name, assignedBy: actor?.fullName || 'Someone', assigneeName: '' },
                });
            }

            // Notify on stage change
            if (req.body.stage && req.body.stage !== existing.stage && existing.assignedTo) {
                await notify({
                    organizationId: existing.organizationId,
                    type: 'LEAD_STAGE_CHANGE',
                    title: `Lead moved to ${req.body.stage}: ${lead.name}`,
                    entityType: 'Lead',
                    entityId: lead.id,
                    actorId: (req as any).userId,
                    recipientUserId: existing.assignedTo,
                    metadata: { leadName: lead.name, oldStage: existing.stage, newStage: req.body.stage, assigneeName: '' },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to update lead', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await LeadRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Lead not found');

            await LeadRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Lead', entityId: existing.id, entityName: existing.name ?? existing.contact?.email ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete lead', error);
        }
    },

    addEvent: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const { leadId } = req.params;

            const lead = await LeadRepository.findById(leadId, orgId);
            if (!lead) return sendError(res, 404, 'Lead not found');

            const event = await LeadRepository.addEvent({
                leadId,
                organizationId: orgId,
                eventType: req.body.eventType,
                description: req.body.description,
                createdBy: userId,
            });

            res.status(201).json(event);
        } catch (error) {
            return sendError(res, 500, 'Failed to add event', error);
        }
    },

    deleteEvent: async (req: Request, res: Response) => {
        try {
            const result = await LeadRepository.deleteEvent(req.params.eventId, (req as any).orgId);
            if (result.count === 0) return sendError(res, 404, 'Event not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete event', error);
        }
    },

    convert: async (req: Request, res: Response) => {
        try {
            const { leadId } = req.params;
            const { projectId } = req.body;

            if (!projectId) return sendError(res, 400, 'projectId is required');

            const orgId = (req as any).orgId;
            const existing = await LeadRepository.findById(leadId, orgId);
            if (!existing) return sendError(res, 404, 'Lead not found');

            const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } });
            if (!project) return sendError(res, 404, 'Project not found');

            const lead = await LeadRepository.convert(leadId, projectId);
            res.json(lead);
            await logAudit(req, { action: 'CONVERT', entityType: 'Lead', entityId: lead.id, entityName: lead.name ?? lead.contact?.email ?? undefined, details: `Converted to project ${projectId}` });
        } catch (error) {
            return sendError(res, 500, 'Failed to convert lead', error);
        }
    },

    addFileLink: async (req: Request, res: Response) => {
        try {
            const { leadId } = req.params;
            const userId = (req as any).user?.profileId;
            const { title, url, fileType } = req.body;
            if (!title || !url) return sendError(res, 400, 'title and url are required');

            const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: (req as any).orgId }, select: { id: true } });
            if (!lead) return sendError(res, 404, 'Lead not found');

            const fileLink = await prisma.fileLink.create({
                data: { leadId, title, url, fileType, createdBy: userId },
                include: { creator: { select: { id: true, fullName: true, email: true } } },
            });
            res.status(201).json(fileLink);
        } catch (error) {
            return sendError(res, 500, 'Failed to add file link', error);
        }
    },

    deleteFileLink: async (req: Request, res: Response) => {
        try {
            const result = await prisma.fileLink.deleteMany({ where: { id: req.params.fileId, lead: { organizationId: (req as any).orgId } } });
            if (result.count === 0) return sendError(res, 404, 'File link not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete file link', error);
        }
    },

    archive: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await LeadRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Lead not found');

            await LeadRepository.archive(req.params.id);
            res.sendStatus(204);
            await logAudit(req, { action: 'ARCHIVE', entityType: 'Lead', entityId: existing.id, entityName: existing.name ?? undefined });
        } catch (error) {
            return sendError(res, 500, 'Failed to archive lead', error);
        }
    },

    restore: async (req: Request, res: Response) => {
        try {
            const restored = await LeadRepository.restore(req.params.id, (req as any).orgId);
            if (!restored) return sendError(res, 404, 'Lead not found');
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to restore lead', error);
        }
    },

    archived: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const data = await LeadRepository.findArchived(orgId);
            res.json({ data });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch archived leads', error);
        }
    },
};
