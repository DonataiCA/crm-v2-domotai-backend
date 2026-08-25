import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createSubscriptionSchema, updateSubscriptionSchema } from '../validators/subscription.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', SubscriptionController.index);
router.post('/', validate(createSubscriptionSchema), SubscriptionController.create);
router.patch('/:id', validate(updateSubscriptionSchema), SubscriptionController.update);
router.post('/:id/cancel', SubscriptionController.cancel);

export default router;
