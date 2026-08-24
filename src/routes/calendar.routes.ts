import { Router } from 'express';
import { CalendarController } from '../controllers/calendar.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createEventSchema, updateEventSchema, overviewQuerySchema } from '../validators/calendar.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

// Antes de cualquier ruta con ':id' para que 'overview' no se lea como un id.
router.get('/overview', validate(overviewQuerySchema, 'query'), CalendarController.overview);

router.get('/', CalendarController.index);
router.post('/', validate(createEventSchema), CalendarController.create);
router.put('/:id', validate(updateEventSchema), CalendarController.update);
router.delete('/:id', CalendarController.delete);

export default router;
