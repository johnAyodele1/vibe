import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import AdultUser from '../models/AdultUser';
import CamSession from '../models/CamSession';
import PushSubscription from '../models/PushSubscription';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ sub: userId }, process.env.ADULT_JWT_SECRET || 'adult_secret', { expiresIn: '1d' });
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

  if (!user || user.isBanned) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  // Simple bcrypt compare
  const isMatch = await bcrypt.compare(password, user.passwordHash);

  loginAttempt.success = isMatch;

  if (!isMatch) {
    user.loginHistory.push(loginAttempt);
    await user.save();
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  // Password matched! Reactivate if deactivated
  if (!user.isActive) {
    user.isActive = true;
    console.log('[Auth] Reactivated account during login for user:', user._id);
  }

  user.loginHistory.push(loginAttempt);
  await user.save();

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

export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.adultUser?._id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Both passwords required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
  }

  const user = await AdultUser.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  user.passwordHash = newPassword; // Pre-save hook hashes this
  await user.save();

  console.log('[Auth] Password changed for user:', userId);
  return res.json({ success: true, message: 'Password changed successfully' });
};

export const deactivateAccount = async (req: Request, res: Response) => {
  const userId      = req.adultUser?._id;
  const accountType = req.adultUser?.role;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  console.log('[Auth] Account deactivation requested:', { userId, accountType });

  // Soft delete — mark as deactivated, do NOT delete data
  await AdultUser.findByIdAndUpdate(userId, {
    $set: {
      isActive:       false,
      isOnline:       false,
    }
  });

  // If provider: end any live cam session and mark offline
  if (accountType === 'provider') {
    const session = await CamSession.findOne({ providerId: userId, status: 'live' });
    if (session) {
      await CamSession.findByIdAndUpdate(session._id, {
        $set: { status: 'ended', endedAt: new Date() }
      });
      const ns = req.app.get('adultNamespace');
      if (ns) {
        ns.emit('cam:session_ended', { sessionId: session._id });
      }
    }
    await AdultUser.findByIdAndUpdate(userId, {
      $set: {
        'providerProfile.isOnline': false,
        'providerProfile.isLive': false,
      }
    });
  }

  // Remove push subscriptions (all devices)
  await PushSubscription.updateMany(
    { userId },
    { $set: { isActive: false, notificationsEnabled: false } }
  );

  console.log('[Auth] Account deactivated:', userId);
  return res.json({ success: true });
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
