import { Router } from 'express';
import { redefinirSenha, solicitarOtp, validarOtp } from '../controllers/passwordController.js';
import { adminLogin, adminLogout, adminMe } from '../controllers/auth.controller.js';
import { attachAdminToReq, requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/password/otp', solicitarOtp);
router.post('/password/verify', validarOtp);
router.post('/password/reset', redefinirSenha);

router.post('/admin/login', adminLogin);
router.post('/admin/logout', attachAdminToReq, requireAuth, adminLogout);
router.get('/admin/me', attachAdminToReq, requireAuth, adminMe);

export default router;
