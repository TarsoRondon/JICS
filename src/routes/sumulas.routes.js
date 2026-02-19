import { Router } from 'express';
import { patchSumula, getTabela, getJogoDetalhesController } from '../controllers/sumulas.controller.js';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.patch('/jogos/:id', patchSumula);
router.get('/jogos/:id/detalhes', getJogoDetalhesController);
router.get('/tabela', getTabela);

export default router;
