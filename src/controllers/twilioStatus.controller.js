import { logInfo, logWarn } from '../utils/logger.util.js';

export function twilioStatusHandler(req, res) {
  const {
    MessageSid,
    MessageStatus,
    To,
    ErrorCode,
    ErrorMessage
  } = req.body || {};

  logInfo('SMS_STATUS', {
    sid: MessageSid,
    status: MessageStatus,
    to: To,
    errorCode: ErrorCode || null
  });

  if (ErrorCode || ErrorMessage) {
    logWarn('SMS_STATUS_ERROR', {
      sid: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode || null
    });
  }

  res.status(200).send('ok');
}
