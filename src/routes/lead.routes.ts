import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createLeadSchema, updateLeadSchema } from '../validators/lead.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/archived', LeadController.archived);
router.get('/', LeadController.index);
router.get('/:id', LeadController.show);
router.post('/', validate(createLeadSchema), LeadController.create);
router.put('/:id', validate(updateLeadSchema), LeadController.update);
router.delete('/:id', LeadController.delete);
router.patch('/:id/archive', LeadController.archive);
router.patch('/:id/restore', LeadController.restore);

router.post('/:leadId/events', LeadController.addEvent);
router.delete('/events/:eventId', LeadController.deleteEvent);

router.post('/:leadId/convert', LeadController.convert);

router.post('/:leadId/files', LeadController.addFileLink);
router.delete('/files/:fileId', LeadController.deleteFileLink);

export default router;
