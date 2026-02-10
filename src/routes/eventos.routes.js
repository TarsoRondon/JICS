import { Router } from 'express';
import { listarEventos, criarEvento } from '../controllers/eventos.controller.js';
import { attachAdminToReq, requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

const router = Router();

router.get('/', attachAdminToReq, requireAuth, listarEventos);
router.post('/', attachAdminToReq, requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'STAFF']), criarEvento);

export default router;
