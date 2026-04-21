import jwt, { SignOptions } from 'jsonwebtoken';
import { Response, NextFunction, Request } from 'express';
import User from '../models/User';
import { Types } from 'mongoose';

// Generate access token
export const generateAccessToken = (userId: string | Types.ObjectId, isAdmin: boolean = false): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRE as SignOptions['expiresIn']) || '7d',
  };
  return jwt.sign({ userId, isAdmin }, process.env.JWT_SECRET || 'fallback_secret', options);
};

// Generate refresh token
export const generateRefreshToken = (userId: string | Types.ObjectId): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRE as SignOptions['expiresIn']) || '30d',
  };
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET ||
      'fallback_secret',
    options
  );
};

// Middleware to authenticate JWT token
export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret'
    ) as { userId: string };

    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    req.user = user;
    next();
  } catch (error: unknown) {
    console.error('Authentication error:', error);

    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback_secret'
      ) as { userId: string };

      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Don't fail, just continue without user
    next();
  }
};
