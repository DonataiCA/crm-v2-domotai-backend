import { Router } from 'express';
import { PortalController } from '../controllers/portal.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { clientLoginSchema, shareProjectSchema } from '../validators/portal.validator';

const router = Router();

// ─── PUBLIC ROUTES (no auth required) ───────────────────────────────────────
router.post('/client-login', validate(clientLoginSchema), PortalController.clientLogin);
router.get('/:shareToken', PortalController.viewPortal);
router.post('/:shareToken/tasks/:taskId/comments', PortalController.addGuestComment);
router.post('/:shareToken/tasks', PortalController.createGuestTask);
router.patch('/:shareToken/tasks/:taskId', PortalController.updateGuestTask);

// ─── AUTHENTICATED ROUTES ───────────────────────────────────────────────────
router.post('/projects/:projectId/share', authenticate, validate(shareProjectSchema), PortalController.shareProject);
router.get('/projects/:projectId/shares', authenticate, PortalController.getShares);
router.delete('/projects/shares/:shareId', authenticate, PortalController.deleteShare);

export default router;
