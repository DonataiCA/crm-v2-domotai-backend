import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createContactSchema, updateContactSchema } from '../validators/contact.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

// Specific routes before parameterized routes
router.get('/archived', ContactController.archived);
router.delete('/bulk', ContactController.bulkDelete);

// CRUD
router.get('/', ContactController.index);
router.post('/', validate(createContactSchema), ContactController.create);
router.get('/:id', ContactController.show);
router.put('/:id', validate(updateContactSchema), ContactController.update);
router.delete('/:id', ContactController.delete);

// Archive / Restore
router.patch('/:id/archive', ContactController.archive);
router.patch('/:id/restore', ContactController.restore);

// Notes
router.post('/:contactId/notes', ContactController.addNote);
router.delete('/notes/:noteId', ContactController.deleteNote);

// File links
router.post('/:contactId/files', ContactController.addFileLink);
router.delete('/files/:fileId', ContactController.deleteFileLink);

export default router;
