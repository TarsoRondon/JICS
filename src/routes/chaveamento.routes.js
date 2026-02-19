import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import {
  bootstrapChaveamento,
  closeStageChaveamento,
  overviewChaveamento,
} from '../controllers/chaveamento.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.post('/:modalidadeId/:sexo/bootstrap', bootstrapChaveamento);
router.post('/:modalidadeId/:sexo/close-stage', closeStageChaveamento);
router.get('/:modalidadeId/:sexo/overview', overviewChaveamento);

export default router;
