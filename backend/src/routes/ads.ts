import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import AdultUser from '../models/AdultUser';
import {
  getEligibleAd,
  recordImpression,
  recordClick,
} from '../controllers/advertisement.controller';

const router = Router();

export const authenticateUserOrAdultUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'undefined' || token === 'null' || token === '') {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    // 1. Try standard dating zone JWT secret
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { userId: string };
      let user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        user = (await AdultUser.findById(decoded.userId).select('-passwordHash')) as any;
      }
      if (user) {
        req.user = user;
        return next();
      }
    } catch {
      // Ignore and proceed to try Adult Zone token
    }

    // 2. Try Adult Zone JWT secret
    try {
      const decoded = jwt.verify(token, process.env.ADULT_JWT_SECRET || 'adult_secret') as { sub: string };
      const adultUser = await AdultUser.findById(decoded.sub).select('-passwordHash');
      if (adultUser && adultUser.isActive && !adultUser.isBanned) {
        req.adultUser = adultUser;
        return next();
      }
    } catch {
      // Ignore
    }

    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

router.get('/eligible', authenticateUserOrAdultUser, getEligibleAd);
router.post('/:id/impression', authenticateUserOrAdultUser, recordImpression);
router.post('/:id/click', authenticateUserOrAdultUser, recordClick);

export default router;
