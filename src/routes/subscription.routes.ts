import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createSubscriptionSchema } from '../validators/subscription.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

router.get('/', SubscriptionController.index);
router.post('/', validate(createSubscriptionSchema), SubscriptionController.create);

export default router;
