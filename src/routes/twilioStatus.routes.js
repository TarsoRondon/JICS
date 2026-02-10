import { Router } from 'express';
import { twilioStatusHandler } from '../controllers/twilioStatus.controller.js';

const router = Router();

router.post('/twilio/status', twilioStatusHandler);

export default router;
