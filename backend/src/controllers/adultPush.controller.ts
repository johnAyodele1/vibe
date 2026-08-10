import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';

export const savePushSubscription = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Subscription data required' });
    }

    const userId = user._id;
    const accountType = user.role === 'provider' ? 'service_provider' : 'member';

    await PushSubscription.findOneAndUpdate(
      { userId, endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          accountType,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Push] savePushSubscription error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const removePushSubscription = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const userId = user._id;
    await PushSubscription.deleteMany({ userId });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Push] removePushSubscription error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
