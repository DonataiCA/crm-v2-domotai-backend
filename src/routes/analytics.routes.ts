import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate, requireOrgMembership);

router.post('/key-metrics', AnalyticsController.keyMetrics);
router.post('/sales-overview', AnalyticsController.salesOverview);
router.post('/revenue-by-client', AnalyticsController.revenueByClient);
router.post('/freelancer-commissions', AnalyticsController.freelancerCommissions);
router.post('/lead-conversion', AnalyticsController.leadConversion);

export default router;
