import { Request } from 'express';

export const assignPriority = (err: any, req: Request): 'critical' | 'high' | 'medium' | 'low' => {
  const route  = req.path || '';
  const status = err.statusCode || err.status || 500;
  const msg    = err.message?.toLowerCase() || '';

  // CRITICAL — payment and wallet routes with 500+
  if (status >= 500 && (
    route.includes('/wallet') ||
    route.includes('/payout') ||
    route.includes('/tip') ||
    route.includes('/service-request') ||
    route.includes('/unlock') ||
    route.includes('/gift') ||
    route.includes('/spin') ||
    route.includes('/stripe') ||
    msg.includes('wallet') ||
    msg.includes('insufficient') ||
    msg.includes('deduction failed') ||
    msg.includes('database') ||
    msg.includes('mongo') ||
    msg.includes('connection')
  )) return 'critical';

  // CRITICAL — auth system broken
  if (status >= 500 && (
    route.includes('/auth/') ||
    msg.includes('jwt') ||
    msg.includes('token')
  )) return 'critical';

  // HIGH — any 500 on non-payment routes
  if (status >= 500) return 'high';

  // HIGH — broken integrations returning non-500 but clearly wrong
  if (
    msg.includes('cloudinary') ||
    msg.includes('agora') ||
    msg.includes('brevo') ||
    msg.includes('webpush') ||
    msg.includes('stripe') ||
    msg.includes('socket')
  ) return 'high';

  // HIGH — auth errors that are systematic (not wrong password)
  if (status === 401 && !msg.includes('invalid credentials') && !msg.includes('wrong password')) {
    return 'high';
  }

  // MEDIUM — 500s caught at lower level, third-party timeouts
  if (status === 503 || status === 502 || status === 504) return 'medium';

  // LOW — user errors
  if (status === 400 || status === 404 || status === 409 || status === 429) return 'low';
  if (status === 401 || status === 403) return 'low';

  return 'medium';  // default
};
