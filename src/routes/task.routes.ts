import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createTaskSchema, updateTaskSchema, addCommentSchema } from '../validators/task.validator';

const router = Router();

// All routes require authentication
router.use(authenticate, requireOrgMembership);

// Bulk operations MUST be before /:id to avoid "bulk" being treated as an ID
router.put('/bulk', TaskController.bulkUpdate);
router.delete('/bulk', TaskController.bulkDelete);

// Comment and link delete routes (before /:id)
router.delete('/comments/:commentId', TaskController.deleteComment);
router.delete('/links/:linkId', TaskController.deleteLink);

// Task CRUD
router.get('/', TaskController.index);
router.post('/', validate(createTaskSchema), TaskController.create);
router.get('/:id', TaskController.show);
router.put('/:id', validate(updateTaskSchema), TaskController.update);
router.delete('/:id', TaskController.delete);

// Task comments and links
router.post('/:taskId/comments', validate(addCommentSchema), TaskController.addComment);
router.post('/:taskId/links', TaskController.addLink);

export default router;
