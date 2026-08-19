import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { PipelineRepository } from '../repositories/pipeline.repository';

export const PipelineController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const pipelines = await PipelineRepository.findAll(orgId);
            res.json(pipelines);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch pipelines', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const pipeline = await PipelineRepository.findById(req.params.id, orgId);
            if (!pipeline) return sendError(res, 404, 'Pipeline not found');
            res.json(pipeline);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch pipeline', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const { name } = req.body;
            if (!name) return sendError(res, 400, 'name is required');

            const pipeline = await PipelineRepository.create(orgId, name);
            res.status(201).json(pipeline);
        } catch (error) {
            return sendError(res, 500, 'Failed to create pipeline', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await PipelineRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Pipeline not found');

            const { name } = req.body;
            if (!name) return sendError(res, 400, 'name is required');

            const pipeline = await PipelineRepository.update(req.params.id, name, orgId);
            res.json(pipeline);
        } catch (error) {
            return sendError(res, 500, 'Failed to update pipeline', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await PipelineRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Pipeline not found');

            await PipelineRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete pipeline', error);
        }
    },

    addStage: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { pipelineId } = req.params;

            const pipeline = await PipelineRepository.findById(pipelineId, orgId);
            if (!pipeline) return sendError(res, 404, 'Pipeline not found');

            const { name, slug, color, order, category: rawCategory, weight: rawWeight } = req.body;
            if (!name || order === undefined) {
                return sendError(res, 400, 'name and order are required');
            }

            const category = rawCategory && ['standard', 'won', 'lost'].includes(rawCategory) ? rawCategory : 'standard';
            const weight = category === 'won' ? 100 : category === 'lost' ? 0 : (rawWeight ?? 50);

            const autoSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const stage = await PipelineRepository.addStage(pipelineId, { name, slug: autoSlug, color, order, category, weight });
            res.status(201).json(stage);
        } catch (error) {
            return sendError(res, 500, 'Failed to add stage', error);
        }
    },

    updateStage: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { stageId } = req.params;

            // Verify the stage's pipeline belongs to this org
            const existingStage = await PipelineRepository.findStageById(stageId);
            if (!existingStage) return sendError(res, 404, 'Stage not found');
            const pipeline = await PipelineRepository.findById(existingStage.pipelineId, orgId);
            if (!pipeline) return sendError(res, 404, 'Pipeline not found');

            const { name, slug, color, order, category: rawCategory, weight: rawWeight } = req.body;
            const autoSlug = slug || (name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : undefined);

            const category = rawCategory && ['standard', 'won', 'lost'].includes(rawCategory) ? rawCategory : rawCategory !== undefined ? 'standard' : undefined;
            const weight = category === 'won' ? 100 : category === 'lost' ? 0 : category !== undefined ? (rawWeight ?? 50) : rawWeight;

            const updatedStage = await PipelineRepository.updateStage(stageId, { name, slug: autoSlug, color, order, category, weight });
            res.json(updatedStage);
        } catch (error) {
            return sendError(res, 500, 'Failed to update stage', error);
        }
    },

    deleteStage: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const stage = await PipelineRepository.findStageById(req.params.stageId);
            if (!stage) return sendError(res, 404, 'Stage not found');

            // Verify the stage's pipeline belongs to this org
            const pipeline = await PipelineRepository.findById(stage.pipelineId, orgId);
            if (!pipeline) return sendError(res, 404, 'Pipeline not found');

            const count = await PipelineRepository.countLeadsByStage(stage, stage.pipelineId);
            if (count > 0) {
                return sendError(res, 409, `Cannot delete stage: it has ${count} lead(s). Reassign them first.`);
            }

            await PipelineRepository.deleteStage(req.params.stageId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete stage', error);
        }
    },

    reorderStages: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { pipelineId } = req.params;
            const { stageIds } = req.body;

            if (!Array.isArray(stageIds) || stageIds.length === 0) {
                return sendError(res, 400, 'stageIds must be a non-empty array');
            }

            const pipeline = await PipelineRepository.findById(pipelineId, orgId);
            if (!pipeline) return sendError(res, 404, 'Pipeline not found');

            await PipelineRepository.reorderStages(pipelineId, stageIds);

            const updated = await PipelineRepository.findById(pipelineId, orgId);
            res.json(updated);
        } catch (error) {
            return sendError(res, 500, 'Failed to reorder stages', error);
        }
    },
};
