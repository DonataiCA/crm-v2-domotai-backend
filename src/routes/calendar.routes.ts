import { Router } from 'express';
import { CalendarController } from '../controllers/calendar.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createEventSchema, updateEventSchema } from '../validators/calendar.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', CalendarController.index);
router.post('/', validate(createEventSchema), CalendarController.create);
router.put('/:id', validate(updateEventSchema), CalendarController.update);
router.delete('/:id', CalendarController.delete);

export default router;
