import { Router } from 'express';
import { smsTestHandler } from '../controllers/sms.controller.js';
import { attachAdminToReq, requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

const router = Router();

router.post('/admin/sms/test', attachAdminToReq, requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), smsTestHandler);

export default router;
