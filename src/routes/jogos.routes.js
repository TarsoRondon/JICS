import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import { atualizarStatus, atualizarPlacar } from '../controllers/jogos.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.put('/:id/status', atualizarStatus);
router.put('/:id/placar', atualizarPlacar);

export default router;

