import { Router } from 'express';
import {
  validateRecoveryHandler,
  requestOtpHandler,
  verifyOtpHandler,
  setPasswordHandler,
  requestPhoneOldHandler,
  verifyPhoneOldHandler,
  requestPhoneNewHandler,
  verifyPhoneNewHandler,
} from '../controllers/recovery.controller.js';
import { rateLimitOtp } from '../middlewares/rateLimitOtp.js';
import { requireUserSession } from '../middlewares/userSession.js';

const router = Router();

router.post('/recovery/validate', validateRecoveryHandler);
router.post('/recovery/request-otp', rateLimitOtp, requestOtpHandler);
router.post('/recovery/verify-otp', rateLimitOtp, verifyOtpHandler);
router.post('/recovery/set-password', setPasswordHandler);

router.post('/phone/change/request-old', requireUserSession, rateLimitOtp, requestPhoneOldHandler);
router.post('/phone/change/verify-old', requireUserSession, rateLimitOtp, verifyPhoneOldHandler);
router.post('/phone/change/request-new', requireUserSession, rateLimitOtp, requestPhoneNewHandler);
router.post('/phone/change/verify-new', requireUserSession, rateLimitOtp, verifyPhoneNewHandler);

export default router;
