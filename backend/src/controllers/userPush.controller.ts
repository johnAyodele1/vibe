import { Response } from 'express';
import PushSubscription from '../models/PushSubscription';

export const registerUserPushDevice = async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { deviceId, subscription, platform, isStandalone, notificationPermission } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required' });
    if (!subscription?.endpoint?.startsWith('https://')) return res.status(400).json({ success: false, message: 'valid subscription required' });

    const existing = await PushSubscription.findOne({ userId: req.user._id, deviceId });
    const endpointChanged = Boolean(existing?.endpoint && existing.endpoint !== subscription.endpoint);

    const set: Record<string, unknown> = {
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
    };

    // A foreground sync must not erase a verified health result. If the
    // browser has rotated to a different subscription, force verification.
    if (!existing || endpointChanged || existing.pushHealthStatus === 'unhealthy') {
      set.pushHealthStatus = 'unknown';
    }

    const device = await PushSubscription.findOneAndUpdate(
      { userId: req.user._id, deviceId },
      {
        $set: set,
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

export const getUserPushDevice = async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId required' });
    const device = await PushSubscription.findOne({ userId: req.user._id, deviceId });
    return res.json({ success: true, device: device ? {
      deviceId: device.deviceId,
      endpoint: device.endpoint,
      isActive: device.isActive,
      notificationsEnabled: device.notificationsEnabled,
      pushHealthStatus: device.pushHealthStatus,
      lastVerifiedAt: device.lastVerifiedAt,
      lastSuccessfulPushAt: device.lastSuccessfulPushAt,
      failCount: device.failCount,
    } : null });
  } catch (error: any) {
    console.error('[UserPush] Current device lookup failed:', error);
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
