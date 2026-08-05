import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased limit from 5
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' } },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Increased limit from 10
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
});

export const tipLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // Increased limit from 60
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many tips' } },
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Increased limit from 100
});
