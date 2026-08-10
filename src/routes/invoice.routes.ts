import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createInvoiceSchema, updateInvoiceSchema } from '../validators/invoice.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', InvoiceController.index);
router.post('/', validate(createInvoiceSchema), InvoiceController.create);
router.get('/:id', InvoiceController.show);
router.put('/:id', validate(updateInvoiceSchema), InvoiceController.update);
router.delete('/:id', InvoiceController.delete);
router.patch('/:id/mark-paid', InvoiceController.markPaid);
router.patch('/:id/mark-sent', InvoiceController.markSent);
router.get('/:id/pdf', InvoiceController.generatePDF);
router.post('/:id/send', InvoiceController.sendByEmail);

export default router;
