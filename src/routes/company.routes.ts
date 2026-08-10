import { Router } from 'express';
import { CompanyController } from '../controllers/company.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCompanySchema, updateCompanySchema } from '../validators/company.validator';

const router = Router();
router.use(authenticate, requireOrgMembership);

router.get('/', CompanyController.index);
router.post('/', validate(createCompanySchema), CompanyController.create);
router.get('/:id', CompanyController.show);
router.put('/:id', validate(updateCompanySchema), CompanyController.update);
router.delete('/:id', CompanyController.delete);

router.post('/:companyId/files', CompanyController.addFileLink);
router.delete('/files/:fileId', CompanyController.deleteFileLink);

export default router;
