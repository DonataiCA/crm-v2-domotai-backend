import { Router } from 'express';
import { CollectionController } from '../controllers/collection.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate, requireOrgMembership);

// Antes de cualquier ruta con ':id', para que 'summary' no se lea como un id.
router.get('/summary', CollectionController.summary);
router.get('/', CollectionController.index);

export default router;
