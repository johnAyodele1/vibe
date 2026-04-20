import { Response, NextFunction, Request } from 'express';
import User from '../models/User';

const updateOnlineStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (req.user && req.user._id) {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true,
      lastActive: new Date(),
    });
  }
  next();
};

export default updateOnlineStatus;
