import { Router } from 'express';
import { requireAuth, requireOrg, attachAdminToReq } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import { listarLogs } from '../controllers/logs.controller.js';

const router = Router();

router.use(attachAdminToReq);
router.use(requireAuth);
router.use(requireOrg);

router.get('/', requireRole(['ADMIN', 'SUPER_ADMIN']), listarLogs);

export default router;

