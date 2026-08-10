import { Router } from 'express';
import { AuditLogController } from '../controllers/audit-log.controller';
import { authenticate, requireOrgMembership, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership, requireAdmin);

router.get('/', AuditLogController.index);

export default router;
