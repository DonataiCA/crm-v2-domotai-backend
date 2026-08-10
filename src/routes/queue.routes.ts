import { Router } from 'express';
import { QueueController } from '../controllers/queue.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/jobs', authenticate, QueueController.createJob);

export default router;
