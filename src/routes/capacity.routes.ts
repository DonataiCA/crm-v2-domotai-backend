import { Router } from 'express';
import { CapacityController } from '../controllers/capacity.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/week', CapacityController.week);
router.get('/workload/:userId', CapacityController.workloadDetail);

export default router;
