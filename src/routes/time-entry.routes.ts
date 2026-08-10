import { Router } from 'express';
import { TimeEntryController } from '../controllers/time-entry.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', TimeEntryController.index);
router.post('/', TimeEntryController.create);
router.post('/start', TimeEntryController.start);
router.put('/:id', TimeEntryController.update);
router.delete('/:id', TimeEntryController.delete);
router.patch('/:id/stop', TimeEntryController.stop);

export default router;
