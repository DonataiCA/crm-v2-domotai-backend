import { Router } from 'express';
import { TagController } from '../controllers/tag.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate, requireOrgMembership);

// Tag CRUD
router.get('/', TagController.index);
router.post('/', TagController.create);
router.put('/:tagId', TagController.update);
router.delete('/:tagId', TagController.delete);

// Tag assignment to project tasks
router.put('/tasks/:taskId', TagController.setTaskTags);
router.post('/tasks/:taskId/:tagId', TagController.assignToTask);
router.delete('/tasks/:taskId/:tagId', TagController.removeFromTask);

export default router;
