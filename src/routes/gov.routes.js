import { Router } from 'express';
import { authorizeGov, callbackGov, getGovSession } from '../controllers/govController.js';

const router = Router();

router.get('/authorize', authorizeGov);
router.get('/callback', callbackGov);
router.get('/session', getGovSession);

export default router;
