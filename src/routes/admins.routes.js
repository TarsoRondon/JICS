import { Router } from 'express';
import { requireAuth, requireOrg, attachAdminToReq } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import {
  listarAdmins,
  criarAdmin,
  editarAdmin,
  ativarAdmin,
  removerAdmin,
} from '../controllers/admins.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);

router.get('/', requireRole(['ADMIN', 'SUPER_ADMIN']), listarAdmins);
router.post('/', requireRole(['SUPER_ADMIN']), criarAdmin);
router.put('/:id', requireRole(['ADMIN', 'SUPER_ADMIN']), editarAdmin);
router.patch('/:id/ativar', requireRole(['ADMIN', 'SUPER_ADMIN']), ativarAdmin);
router.delete('/:id', requireRole(['SUPER_ADMIN']), removerAdmin);

export default router;

