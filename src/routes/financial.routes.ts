import { Router } from 'express';
import { FinancialController } from '../controllers/financial.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.post('/dashboard', FinancialController.dashboard);
router.post('/aging', FinancialController.aging);
router.post('/profit-by-project', FinancialController.profitByProject);

export default router;
