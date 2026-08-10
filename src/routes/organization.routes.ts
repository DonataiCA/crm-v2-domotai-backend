import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createOrgSchema, addMemberSchema } from '../validators/organization.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Organization CRUD
router.get('/', OrganizationController.index);
router.get('/:id', OrganizationController.show);
router.post('/', validate(createOrgSchema), OrganizationController.create);
router.put('/:id', OrganizationController.update);
router.delete('/:id', requireAdmin, OrganizationController.delete);

// Organization members
router.get('/:orgId/members', OrganizationController.getMembers);
router.post('/:orgId/members', requireAdmin, validate(addMemberSchema), OrganizationController.addMember);
router.put('/:orgId/members/:userId', requireAdmin, OrganizationController.updateMemberRole);
router.delete('/:orgId/members/:userId', requireAdmin, OrganizationController.removeMember);

export default router;
