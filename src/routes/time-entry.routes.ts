import { Router } from 'express';
import { TimeEntryController } from '../controllers/time-entry.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createTimeEntrySchema, updateTimeEntrySchema, startTimerSchema } from '../validators/time-entry.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', TimeEntryController.index);
router.post('/', validate(createTimeEntrySchema), TimeEntryController.create);
router.post('/start', validate(startTimerSchema), TimeEntryController.start);
router.put('/:id', validate(updateTimeEntrySchema), TimeEntryController.update);
router.delete('/:id', TimeEntryController.delete);
router.patch('/:id/stop', TimeEntryController.stop);

export default router;
