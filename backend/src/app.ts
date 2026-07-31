import express, { Response, NextFunction, Request } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import dotenv from 'dotenv';
import passport from './config/passport';
import User from './models/User';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import matchRoutes from './routes/matches';
import messageRoutes from './routes/messages';
import uploadRoutes from './routes/upload';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import configRoutes from './routes/config';
import adultRoutes from './routes/adult.routes';
import v1Routes from './routes/v1.routes';

dotenv.config();

const app = express();

// Configure Express to trust proxies (first hop) behind reverse proxies like Render.
// This resolves express-rate-limit unexpected X-Forwarded-For configuration warnings/errors.
app.set('trust proxy', 1);

// // Rate limiting
// const limiter = rateLimit({
//   windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
//   max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
//   message: 'Too many requests from this IP, please try again later.',
// });

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "https://www.gstatic.com", "https://lh3.googleusercontent.com"],
        "connect-src": ["'self'", process.env.FRONTEND_URL || "https://zippo-r8hk.onrender.com"],
      },
    },
  })
);
app.use(compression());
// if (process.env.NODE_ENV !== 'test') {
//   app.use(limiter);
// }
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'vibe_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// CORS configuration
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Database connection
if (process.env.NODE_ENV !== 'test') {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB');
      try {
        // Reset all users to offline on startup
        await User.updateMany({}, { isOnline: false });
        console.log("Reset all users' online status to false");

        // Clean stale presence in Adult Zone
        const { cleanStalePresence } = require('./socket/adultSocket');
        await cleanStalePresence();
      } catch (err) {
        console.error("Error resetting users' online status:", err);
      }
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error);
    });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/config', configRoutes);
app.use('/api/adult', adultRoutes);
app.use('/api/v1', v1Routes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve static files from the React app - MUST be after API routes
app.use(express.static(path.join(__dirname, '../../vibe/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req: Request, res: Response) => {
  // If it looks like an asset or a file (has an extension), return 404 instead of index.html
  // This prevents returning index.html (with text/html MIME type) for missing assets
  if (req.path.includes('.') || req.path.startsWith('/assets/') || req.path.startsWith('/src/')) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.sendFile(path.join(__dirname, '../../vibe/dist/index.html'));
});

interface MongooseError extends Error {
    errors?: Record<string, { message: string }>;
    code?: number;
    keyValue?: Record<string, string>;
}

// Global error handler
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Global error:', error);
  }

  // Mongoose validation error
  if (error.name === 'ValidationError' && error.errors) {
    const messages = Object.values(error.errors).map((val: any) => val.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000 && error.keyValue) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
    });
  }

  // Multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 10MB.',
    });
  }

  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  // Default error
  return res.status(500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
});

export default app;
