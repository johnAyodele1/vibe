import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from '../models/AppError.model';
import { assignPriority } from '../shared/errorPriority';
import { emitToAdmins } from '../sockets';

// Fields to NEVER log (security)
const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'confirmpassword', 'token',
  'accesstoken', 'refreshtoken', 'secret', 'apikey',
  'cardnumber', 'cvv', 'pin', 'authorization',
  'p256dh', 'auth',  // push subscription keys
]);

export const sanitizeObject = (obj: any, depth = 0): any => {
  if (!obj || typeof obj !== 'object' || depth > 3) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const getCategory = (err: any, req: Request) => {
  const route = req.path || '';
  const msg   = err.message?.toLowerCase() || '';

  if (route.match(/\/(tip|wallet|payout|gift|service-request|unlock|spin|stripe)/)) return 'payment';
  if (route.includes('/auth/'))    return 'auth';
  if (route.includes('/media/') || route.includes('/upload'))  return 'upload';
  if (route.includes('/push/'))    return 'push';
  if (route.includes('/calendar')) return 'third_party';
  if (msg.includes('cloudinary'))  return 'upload';
  if (msg.includes('brevo') || msg.includes('email')) return 'email';
  if (msg.includes('socket'))      return 'socket';
  if (msg.includes('mongo') || msg.includes('database')) return 'database';

  const status = err.status || err.statusCode;
  if (status === 400) return 'validation';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status === 403) return 'permission';
  if (status >= 500)  return 'server';
  return 'unknown';
};

const getZone = (req: Request) => {
  if (req.path?.includes('/admin')) return 'admin';
  if (req.path?.includes('/adult')) return 'adult';
  if (req.path?.includes('/dating')) return 'dating';
  return 'unknown';
};

// Short human-readable ID e.g. "ERR-A3F9"
const generateErrorId = () => 'ERR-' + crypto.randomBytes(2).toString('hex').toUpperCase();

// Fingerprint: stable hash of route + error message
// Same error from same route = same fingerprint → deduplicated
const generateFingerprint = (err: any, req: Request) => {
  const str = `${req.method}:${req.path}:${err.message?.slice(0, 100)}`;
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
};

export const errorCaptureMiddleware = async (err: any, req: any, res: Response, next: NextFunction) => {
  // Pre-process legacy client-side / Mongoose / JWT / Multer errors
  let statusCode = err.statusCode || err.status || 500;
  let customResponsePayload: any = null;

  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    const messages = Object.values(err.errors).map((val: any) => val.message);
    customResponsePayload = {
      success: false,
      message: 'Validation Error',
      errors: messages,
    };
  } else if (err.code === 11000 && err.keyValue) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    customResponsePayload = {
      success: false,
      message: `${field} already exists`,
    };
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    customResponsePayload = {
      success: false,
      message: 'Invalid token',
    };
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    customResponsePayload = {
      success: false,
      message: 'Token expired',
    };
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    customResponsePayload = {
      success: false,
      message: 'File too large. Maximum size is 10MB.',
    };
  } else if (err.message === 'Only image files are allowed!') {
    statusCode = 400;
    customResponsePayload = {
      success: false,
      message: err.message,
    };
  }

  // Set normalized status on error object for priority assignment and DB storage
  err.statusCode = statusCode;

  const priority   = assignPriority(err, req);

  // Skip capturing user-input validation errors from showing on admin
  // unless they are suspicious (too many from same user, etc.)
  const isUserMistake = statusCode === 400 || statusCode === 401 || statusCode === 404;

  console.error(`[Error][${priority.toUpperCase()}] ${req.method} ${req.path}`, {
    statusCode,
    message:     err.message,
    userId:      req.user?.sub || req.user?._id || req.user?.id,
    accountType: req.user?.accountType || req.user?.role,
    errorCode:   err.code || err.errorCode,
  });

  // Capture to database
  try {
    const fingerprint = generateFingerprint(err, req);

    // Deduplicate: if same error seen in last hour, just increment count
    const existing = await AppError.findOne({
      fingerprint,
      resolved: false,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });

    if (existing) {
      const updated = await AppError.findByIdAndUpdate(
        existing._id,
        {
          $inc: { count: 1 },
          $set: { lastSeenAt: new Date(), updatedAt: new Date() },
        },
        { new: true }
      );

      if (updated) {
        // Auto-escalate to critical if same error fires 10+ times in an hour
        if (updated.count >= 10 && !updated.escalated && updated.priority !== 'critical') {
          await AppError.findByIdAndUpdate(existing._id, {
            $set: { priority: 'critical', escalated: true, escalatedAt: new Date() },
          });

          // Push to admin: escalated
          emitToAdmins('admin:error_escalated', {
            errorId:     existing.errorId,
            route:       req.path,
            count:       updated.count,
            message:     err.message,
            escalatedTo: 'critical',
          });
        }

        // Push count update to admin
        emitToAdmins('admin:error_count_update', {
          errorId: existing.errorId,
          count:   updated.count,
        });
      }

    } else {
      // New error — create full record
      const errorRecord = await AppError.create({
        errorId:      generateErrorId(),
        fingerprint,
        priority,
        zone:         getZone(req),
        category:     getCategory(err, req),
        statusCode,
        message:      err.message || 'Unknown error',
        errorCode:    err.code || err.errorCode || null,
        operation:    err.operation || null,
        stack:        err.stack,

        request: {
          method:    req.method,
          route:     req.path,
          params:    sanitizeObject(req.params),
          query:     sanitizeObject(req.query),
          body:      sanitizeObject(req.body),
          headers:   {
            'content-type': req.headers?.['content-type'],
            'user-agent':   req.headers?.['user-agent'],
            'x-platform':   req.headers?.['x-platform'],
          },
          ip:        req.ip || req.connection?.remoteAddress,
          userAgent: req.headers?.['user-agent'],
        },

        userId:       req.user?.sub || req.user?._id || req.user?.id || null,
        accountType:  req.user?.accountType || req.user?.role || null,
      });

      // Push to admin dashboard in real time
      if (!isUserMistake || priority !== 'low') {
        emitToAdmins('admin:new_error', {
          errorId:     errorRecord.errorId,
          priority,
          zone:        errorRecord.zone,
          category:    errorRecord.category,
          message:     err.message,
          route:       req.path,
          method:      req.method,
          statusCode,
          userId:       req.user?.sub || req.user?._id || req.user?.id || null,
          accountType:  req.user?.accountType || req.user?.role || null,
          createdAt:   errorRecord.createdAt,
        });
      }
    }
  } catch (captureErr: any) {
    // Never let error capturing break the error response
    console.error('[ErrorCapture] Failed to save error to DB:', captureErr.message);
  }

  // Send response to the user
  if (customResponsePayload) {
    return res.status(statusCode).json(customResponsePayload);
  }

  return res.status(statusCode).json({
    success: false,
    error:   err.message || 'An unexpected error occurred',
    message: err.message || 'An unexpected error occurred',
    code:    err.code || err.errorCode || null,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
