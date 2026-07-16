import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import AdultUser from '../models/AdultUser';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret', { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_REFRESH_SECRET || 'adult_refresh', { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
  const { email, password, username, displayName, dateOfBirth, role, country } = req.body;

  const existing = await AdultUser.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email or username already in use' } });
  }

  const user = new AdultUser({
    email,
    passwordHash: password, // Pre-save hook hashes this
    username,
    displayName,
    dateOfBirth,
    role,
    country,
    emailVerified: true,
  });

  await user.save();

  const { accessToken, refreshToken } = generateTokens(user._id.toString());

  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.status(201).json({
    success: true,
    data: {
      accessToken,
      tokens: {
        accessToken,
        refreshToken
      },
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        ageVerified: user.ageVerified,
        tier: user.subscriptionTier,
        credits: user.credits
      }
    }
  });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.query;
  const user = await AdultUser.findOne({ emailVerificationToken: token as string });

  if (!user) {
    return res.status(400).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid or expired token' } });
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();

  const { accessToken, refreshToken } = generateTokens(user._id.toString());

  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, data: { accessToken, user: { id: user._id, username: user.username, role: user.role } } });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await AdultUser.findOne({ email });

  const loginAttempt = {
    ip: req.ip || '',
    userAgent: req.headers['user-agent'] || '',
    timestamp: new Date(),
    success: false,
  };

  if (!user || !user.isActive || user.isBanned) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  // Simple bcrypt compare (can use adultUserSchema.methods if defined)
  const bcrypt = require('bcryptjs');
  const isMatch = await bcrypt.compare(password, user.passwordHash);

  loginAttempt.success = isMatch;
  user.loginHistory.push(loginAttempt);
  await user.save();

  if (!isMatch) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  const { accessToken, refreshToken } = generateTokens(user._id.toString());

  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({
    success: true,
    data: {
      accessToken,
      tokens: {
        accessToken,
        refreshToken
      },
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        ageVerified: user.ageVerified,
        tier: user.subscriptionTier,
        credits: user.credits
      }
    }
  });
};

export const verifyAge = async (req: Request, res: Response) => {
  if (!req.adultUser) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

  req.adultUser.ageVerified = true;
  req.adultUser.ageVerifiedAt = new Date();
  await req.adultUser.save();

  res.json({ success: true, message: 'Age verified successfully' });
};

export const logout = async (req: Request, res: Response) => {
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out' });
};

export const getMe = async (req: Request, res: Response) => {
  if (!req.adultUser) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
  }

  const user = req.adultUser;
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        ageVerified: user.ageVerified,
        tier: user.subscriptionTier,
        credits: user.credits
      }
    }
  });
};
