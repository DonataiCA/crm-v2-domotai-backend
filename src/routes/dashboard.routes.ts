import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate, requireOrgMembership);

router.get('/commercial', DashboardController.commercial);
router.get('/operational', DashboardController.operational);
router.post('/weekly-digest', DashboardController.weeklyDigest);

export default router;
