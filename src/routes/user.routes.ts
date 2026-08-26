import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, requireAdmin, requireSelfOrAdmin, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

// Authentication routes (public)
router.post('/check-phone', UserController.checkPhoneNumber);
router.post('/login', UserController.login);
router.post('/google', UserController.googleAuth);
router.post('/apple', UserController.appleAuth);
router.post('/logout', authenticate, UserController.logout);

// User routes
router.post('/admin-create', authenticate, requireAdmin, UserController.adminCreate);
router.post('/', authenticate, requireAdmin, UserController.register);
router.get('/', authenticate, requireOrgMembership, UserController.index);
router.get('/profile', authenticate, UserController.profile);
router.put('/change-password', authenticate, UserController.changePassword);
router.get('/:id', authenticate, requireOrgMembership, UserController.show);
router.put('/:id', authenticate, requireSelfOrAdmin, UserController.update);
router.delete('/:id', authenticate, requireAdmin, UserController.delete);

export default router;

