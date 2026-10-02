import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticate, requireOrgMembership, forbidProfileRoles } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate, requireOrgMembership);

// El dashboard comercial es información de ventas: ni clientes ni PMO
// (el PMO supervisa proyectos; su mundo es /project-dashboard).
router.get('/commercial', forbidProfileRoles('client', 'pmo'), DashboardController.commercial);
router.get('/operational', DashboardController.operational);
router.post('/weekly-digest', DashboardController.weeklyDigest);

export default router;
