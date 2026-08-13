import { Response } from 'express';
import PushSubscription from '../models/PushSubscription';

export const registerUserPushDevice = async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { deviceId, subscription, platform, isStandalone, notificationPermission } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required' });
    if (!subscription?.endpoint?.startsWith('https://')) return res.status(400).json({ success: false, message: 'valid subscription required' });

    const device = await PushSubscription.findOneAndUpdate(
      { userId: req.user._id, deviceId },
      {
        $set: {
          userId: req.user._id,
          deviceId,
          accountType: 'member',
          zone: 'dating',
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys?.p256dh || '', auth: subscription.keys?.auth || '' },
          platform: platform || 'unknown',
          isStandalone: !!isStandalone,
          notificationPermission: notificationPermission || 'granted',
          notificationsEnabled: notificationPermission !== 'denied',
          isActive: true,
          failCount: 0,
          lastSeenAt: new Date(),
          pushHealthStatus: 'unknown',
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true },
    );

    return res.json({ success: true, deviceId: device.deviceId, notificationsEnabled: device.notificationsEnabled });
  } catch (error: any) {
    console.error('[UserPush] Register failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeUserPushDevice = async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required' });
    await PushSubscription.deleteOne({ userId: req.user._id, deviceId });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[UserPush] Remove failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
