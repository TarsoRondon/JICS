import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import { getRanking } from '../controllers/ranking.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.get('/:eventoId/:modalidadeId/:sexo', getRanking);

export default router;

