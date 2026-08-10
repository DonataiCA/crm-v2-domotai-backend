import { Router } from 'express';
import { PipelineController } from '../controllers/pipeline.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', PipelineController.index);
router.get('/:id', PipelineController.show);
router.post('/', PipelineController.create);
router.put('/:id', PipelineController.update);
router.delete('/:id', PipelineController.delete);

router.post('/:pipelineId/stages', PipelineController.addStage);
router.put('/:pipelineId/stages/reorder', PipelineController.reorderStages);
router.put('/:pipelineId/stages/:stageId', PipelineController.updateStage);
router.delete('/:pipelineId/stages/:stageId', PipelineController.deleteStage);

export default router;
