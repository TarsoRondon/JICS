import { Router } from 'express';
import { listarOrganizacoes, criarOrganizacao } from '../controllers/organizations.controller.js';
import { attachAdminToReq, requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

const router = Router();

router.get('/', attachAdminToReq, requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), listarOrganizacoes);
router.post('/', attachAdminToReq, requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), criarOrganizacao);

export default router;
