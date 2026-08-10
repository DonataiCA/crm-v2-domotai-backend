import { Router } from 'express';
import { ExportController } from '../controllers/export.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/projects', ExportController.projects);
router.get('/leads', ExportController.leads);
router.get('/contacts', ExportController.contacts);
router.get('/invoices', ExportController.invoices);
router.get('/time-entries', ExportController.timeEntries);

export default router;
