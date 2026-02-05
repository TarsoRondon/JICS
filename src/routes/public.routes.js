import { Router } from 'express';
import { getTelao } from '../controllers/telao.controller.js';

const router = Router();

router.get('/eventos/:eventoId/telao', getTelao);

export default router;

