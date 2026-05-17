import helmet from 'helmet';

export const adultSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'cdn.tailwindcss.com', 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
      imgSrc: ["'self'", 'data:', 'res.cloudinary.com', 'images.unsplash.com'],
      connectSrc: ["'self'", 'wss:', 'https://api.stripe.com'],
      frameSrc: ["'self'", 'https://js.stripe.com'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin' },
});
