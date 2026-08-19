import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IExpressRequest } from '../types/express';

export const authenticateAdmin = async (req: IExpressRequest, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret'
    ) as { userId: string; isAdmin?: boolean };

    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    req.user = { _id: decoded.userId } as any;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
