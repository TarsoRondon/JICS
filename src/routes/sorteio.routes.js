import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import {
  getSorteio,
  gerarSorteio,
  aplicarHorariosController,
  limparSorteioController,
  gerarPdfSorteioController,
} from '../controllers/sorteio.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.get('/:eventoId/:modalidadeId/:sexo', getSorteio);
router.post('/gerar', gerarSorteio);
router.post('/horarios', aplicarHorariosController);
router.delete('/limpar', limparSorteioController);
router.get('/:eventoId/:modalidadeId/:sexo/pdf', gerarPdfSorteioController);

export default router;

