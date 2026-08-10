import { Router } from 'express';
import { AiAgentController } from '../controllers/ai-agent.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate, requireOrgMembership);
router.post('/chat', AiAgentController.chat);
router.delete('/history', AiAgentController.clearHistory);

export default router;
