import express, { Response, NextFunction, Request } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import dotenv from 'dotenv';
import passport from './config/passport';
import User from './models/User';
import PushSubscription from './models/PushSubscription';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import matchRoutes from './routes/matches';
import messageRoutes from './routes/messages';
import uploadRoutes from './routes/upload';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import adultRoutes from './routes/adult.routes';
import v1Routes from './routes/v1.routes';
import providerDiscoveryRoutes from './routes/providerDiscovery.routes';

dotenv.config();
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"], "img-src": ["'self'", "data:", "https://www.gstatic.com", "https://lh3.googleusercontent.com"], "connect-src": ["'self'", process.env.FRONTEND_URL || "https://zippo-r8hk.onrender.com"] } } }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'vibe_session_secret', resave: false, saveUninitialized: false, cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 } }));
app.use(passport.initialize());
app.use(passport.session());

// Secure CORS configuration: Restrict allowed origins to process.env.ALLOWED_ORIGINS / FRONTEND_URL or default local URLs
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      process.env.FRONTEND_URL || 'https://zippo-r8hk.onrender.com',
      process.env.FRONTEND_DATING_URL || 'http://localhost:3000',
      process.env.FRONTEND_ADULT_URL || 'http://localhost:3001',
      'http://localhost:5173',
    ];

const allowedPreviewOrigin =
  /^https:\/\/deploy-preview-\d+--petheven\.netlify\.app$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or during tests
      if (
        !origin ||
        process.env.NODE_ENV === 'test' ||
        allowedOrigins.includes(origin) ||
        allowedPreviewOrigin.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy violation: Access denied for origin ' + origin));
    },
    credentials: true,
  })
);

const repairPushSubscriptionEndpointIndex = async () => {
  // Legacy deployments may contain endpoint:null values. Remove those
  // explicit nulls before creating the unique sparse index; sparse indexes
  // still index an explicitly stored null value.
  await PushSubscription.updateMany(
    { endpoint: null },
    { $unset: { endpoint: 1, keys: 1 } },
  );

  const indexes = await PushSubscription.collection.indexes();
  const endpointIndex = indexes.find(index => index.name === 'endpoint_1');

  if (endpointIndex) {
    const isCorrect = endpointIndex.unique === true && endpointIndex.sparse === true;
    if (!isCorrect) {
      console.warn('[Push] Rebuilding legacy endpoint_1 index as unique sparse index');
      await PushSubscription.collection.dropIndex('endpoint_1');
    }
  }

  await PushSubscription.collection.createIndex(
    { endpoint: 1 },
    { unique: true, sparse: true, name: 'endpoint_1' },
  );
};

if (process.env.NODE_ENV !== 'test') {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';
  mongoose.connect(mongoUri).then(async () => {
    console.log('Connected to MongoDB');
    try {
      await repairPushSubscriptionEndpointIndex();
      await User.updateMany({}, { isOnline: false });
      const { cleanStalePresence } = require('./socket/adultSocket');
      await cleanStalePresence();
    } catch (err) {
      console.error("Error resetting users' online status:", err);
    }
  }).catch(error => console.error('MongoDB connection error:', error));
}

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/adult', adultRoutes);
app.use('/api/adult', providerDiscoveryRoutes);
app.use('/api/v1/adult', providerDiscoveryRoutes);
app.use('/api/v1', v1Routes);

app.get('/api/health', (req: Request, res: Response) => res.json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() }));
app.use(express.static(path.join(__dirname, '../../vibe/dist')));
app.get('*', (req: Request, res: Response) => {
  if (req.path.includes('.') || req.path.startsWith('/assets/') || req.path.startsWith('/src/')) return res.status(404).json({ error: 'Asset not found' });
  res.sendFile(path.join(__dirname, '../../vibe/dist/index.html'));
});

import { errorCaptureMiddleware } from './middleware/errorCapture';
app.use(errorCaptureMiddleware);

export default app;
