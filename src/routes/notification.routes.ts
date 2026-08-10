import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate, requireOrgMembership);

// Static routes before parameterized routes
router.get('/unread-count', NotificationController.unreadCount);
router.patch('/read-all', NotificationController.markAllAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);

// CRUD
router.get('/', NotificationController.index);
router.patch('/:id/read', NotificationController.markAsRead);
router.delete('/:id', NotificationController.delete);

export default router;
