import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';
import { ensureVapidKeys } from '../shared/push';
import VapidKey from '../models/VapidKey';

export const getVapidPublicKey = async (req: Request, res: Response) => {
  try {
    await ensureVapidKeys();

    // Check if configured in environment variables first
    if (process.env.VAPID_PUBLIC_KEY) {
      return res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
    }

    const keyDoc = await VapidKey.findOne();
    if (!keyDoc) {
      return res.status(404).json({ success: false, error: 'VAPID public key not generated' });
    }

    return res.json({ success: true, publicKey: keyDoc.publicKey });
  } catch (error: any) {
    console.error('[Push] getVapidPublicKey error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

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
