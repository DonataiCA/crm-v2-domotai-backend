import { Router } from 'express';
import { IncidentController } from '../controllers/incident.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

// Specific routes before parameterized routes
router.get('/summary', IncidentController.summary);

router.get('/', IncidentController.index);
router.post('/', IncidentController.create);
router.get('/:id', IncidentController.show);
router.patch('/:id', IncidentController.update);
router.post('/:id/events', IncidentController.addEvent);

export default router;
