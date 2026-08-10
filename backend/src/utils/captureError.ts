import { AppError } from '../models/AppError.model';
import { emitToAdmins } from '../sockets';
import crypto from 'crypto';
import { sanitizeObject } from '../middleware/errorCapture';

export interface CaptureErrorContext {
  operation?: string;   // e.g. 'push_notification', 'cron_weekly_email', 'socket_cam_join'
  userId?: any;
  zone?: 'dating' | 'adult' | 'admin' | 'unknown';
  priority?: 'critical' | 'high' | 'medium' | 'low';    // override auto-priority if you know it
  data?: any;        // any relevant context data
}

export const captureError = async (err: any, context: CaptureErrorContext = {}) => {
  const {
    operation,
    userId,
    zone = 'unknown',
    priority,
    data,
  } = context;

  console.error(`[CaptureError] ${operation || 'Unknown operation'}:`, {
    message: err?.message || String(err),
    userId,
    data,
  });

  try {
    const errorMsg = err?.message || String(err || 'Unknown error');
    const fingerprint = crypto
      .createHash('md5')
      .update(`${operation}:${errorMsg.slice(0, 100)}`)
      .digest('hex')
      .slice(0, 12);

    const assignedPriority = priority ||
      (operation?.includes('payment') || operation?.includes('wallet') ? 'critical' :
       operation?.includes('push') || operation?.includes('email') ? 'high' : 'medium');

    const existing = await AppError.findOne({
      fingerprint,
      resolved:  false,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });

    if (existing) {
      const updated = await AppError.findByIdAndUpdate(
        existing._id,
        {
          $inc: { count: 1 },
          $set: { lastSeenAt: new Date() },
        },
        { new: true }
      );

      emitToAdmins('admin:error_count_update', {
        errorId: existing.errorId,
        count:   updated ? updated.count : existing.count + 1,
      });
    } else {
      const record = await AppError.create({
        errorId:   'ERR-' + crypto.randomBytes(2).toString('hex').toUpperCase(),
        fingerprint,
        priority:   assignedPriority,
        zone,
        category:   operation?.includes('push') ? 'push' :
                    operation?.includes('email') ? 'email' :
                    operation?.includes('cron')  ? 'server' : 'unknown',
        message:    errorMsg,
        stack:      err?.stack,
        operation,
        userId:     userId || null,
        request:    { body: sanitizeObject(data) },
      });

      emitToAdmins('admin:new_error', {
        errorId:   record.errorId,
        priority:  assignedPriority,
        category:  record.category,
        message:   errorMsg,
        operation,
        userId,
        createdAt: record.createdAt,
      });
    }
  } catch (captureErr: any) {
    console.error('[CaptureError] Could not save:', captureErr.message);
  }
};
