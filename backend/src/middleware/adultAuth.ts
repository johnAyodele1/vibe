import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import AdultUser from '../models/AdultUser';
import { IAdultUser } from '../types/adultModels';

declare global {
  namespace Express {
    interface Request {
      adultUser?: IAdultUser;
    }
  }
}

export const verifyAdultJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required' } });

    const decoded = jwt.verify(token, process.env.ADULT_JWT_SECRET || 'adult_secret') as { sub: string };
    const user = await AdultUser.findById(decoded.sub);

    if (!user || !user.isActive || user.isBanned) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User invalid' } });
    }

    req.adultUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
};

export const requireAdultAge = (req: Request, res: Response, next: NextFunction) => {
  if (!req.adultUser?.ageVerified) {
    return res.status(403).json({ success: false, error: { code: 'AGE_NOT_VERIFIED', message: 'Age verification required' } });
  }
  next();
};

export const requireAdultRole = (role: 'user' | 'provider') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.adultUser?.role !== role) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }
    next();
  };
};

export const requireSubscription = (tier: 'gold' | 'platinum' | 'diamond') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tiers = ['none', 'gold', 'platinum', 'diamond'];
    const userTierIdx = tiers.indexOf(req.adultUser?.subscriptionTier || 'none');
    const requiredIdx = tiers.indexOf(tier);

    if (userTierIdx < requiredIdx || (req.adultUser?.subscriptionExpiresAt && req.adultUser.subscriptionExpiresAt < new Date())) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Subscription required' } });
    }
    next();
  };
};
