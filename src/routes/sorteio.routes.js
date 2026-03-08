import { Router } from 'express';
import { attachAdminToReq, requireAuth, requireOrg } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import {
  getSorteio,
  listarSorteiosSalvosController,
  gerarSorteio,
  realizarCongressoTecnicoDigitalController,
  salvarSorteioController,
  gerarMataMataController,
  aplicarHorariosController,
  limparSorteioController,
  downloadSorteioTabelaController,
  gerarPdfSorteioController,
} from '../controllers/sorteio.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

router.get('/salvos', listarSorteiosSalvosController);
router.get('/:eventoId/:modalidadeId/:sexo', getSorteio);
router.post('/gerar', gerarSorteio);
router.post('/congresso-tecnico-digital', realizarCongressoTecnicoDigitalController);
router.post('/gerar/oficial', gerarSorteio);
router.post('/salvar', salvarSorteioController);
router.post('/mata-mata', gerarMataMataController);
router.post('/horarios', aplicarHorariosController);
router.delete('/limpar', limparSorteioController);
router.get('/:eventoId/:modalidadeId/:sexo/download', downloadSorteioTabelaController);
router.get('/:eventoId/:modalidadeId/:sexo/pdf', gerarPdfSorteioController);

export default router;
