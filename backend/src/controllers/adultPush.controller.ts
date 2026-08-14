import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';
import { ensureVapidKeys } from '../shared/push';
import VapidKey from '../models/VapidKey';
import webpush from 'web-push';

export const getVapidPublicKey = async (req: Request, res: Response) => {
  try {
    await ensureVapidKeys();
    if (process.env.VAPID_PUBLIC_KEY) return res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
    const keyDoc = await VapidKey.findOne();
    if (!keyDoc) return res.status(404).json({ success: false, error: 'VAPID public key not generated' });
    return res.json({ success: true, publicKey: keyDoc.publicKey });
  } catch (error: any) {
    console.error('[Push] getVapidPublicKey error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const diagnosePush = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    const userId = user._id;
    const deviceId = req.query.deviceId as string;
    const allDevices = await PushSubscription.find({ userId });
    const thisDevice = allDevices.find(d => d.deviceId === deviceId);
    const diagnosis = {
      userId, deviceId, allDevicesCount: allDevices.length,
      activeDevicesCount: allDevices.filter(d => d.isActive).length,
      thisDevice: thisDevice ? {
        exists: true, isActive: thisDevice.isActive, hasEndpoint: !!thisDevice.endpoint,
        notificationsEnabled: thisDevice.notificationsEnabled, platform: thisDevice.platform,
        failCount: thisDevice.failCount, lastSeenAt: thisDevice.lastSeenAt,
      } : { exists: false, hint: 'Call POST /adult/devices/register to create it' },
      vapidConfigured: !!((process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) || (await VapidKey.findOne())),
      vapidKeyPrefix: process.env.VAPID_PUBLIC_KEY?.slice(0, 20) + '...',
      envFrontendKey: '(check NEXT_PUBLIC_VAPID_PUBLIC_KEY in frontend .env)',
    };
    console.log('[Diagnose]', diagnosis);
    return res.json(diagnosis);
  } catch (error: any) {
    console.error('[Diagnose] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const sendTestPush = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    await ensureVapidKeys();
    const subscriptions = await PushSubscription.find({ userId: user._id, isActive: true, notificationsEnabled: true });
    if (!subscriptions.length) return res.json({ success: false, reason: 'No push subscriptions found for this user', fix: 'Make sure notification permission was granted.' });
    const results = [];
    const isReopen = req.body?.isReopen === true;
    const payload = isReopen ? {
      title: '👋 Welcome back to Zippo', body: "You're all set — notifications are working.", icon: '/icons/icon-192x192.png', badge: '/icons/badge-72x72.png', tag: 'welcome-back', renotify: false, silent: false, url: '/adult', unreadCount: 0, type: 'test',
    } : {
      title: '✅ Test Notification', body: 'Push notifications are working on this device!', icon: '/icons/icon-192x192.png', badge: '/icons/badge-72x72.png', tag: 'notif-test', renotify: true, url: '/adult', unreadCount: 0, type: 'test',
    };
    for (const sub of subscriptions) {
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, JSON.stringify(payload));
        results.push({ endpoint: sub.endpoint.slice(0, 60), success: true });
      } catch (err: any) {
        results.push({ endpoint: sub.endpoint.slice(0, 60), success: false, statusCode: err.statusCode, reason: err.statusCode === 410 ? 'Subscription expired — device was uninstalled or PWA removed' : err.statusCode === 404 ? 'Endpoint not found' : err.message });
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.findOneAndUpdate({ _id: sub._id }, { $set: { isActive: false, notificationsEnabled: false, endpoint: null, keys: null, deactivatedAt: new Date(), pushHealthStatus: 'unhealthy' } });
        } else if (err.statusCode === 403) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    }
    return res.json({ results, summary: { sent: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, stale: results.filter(r => r.statusCode === 410).length }, hint: results.some(r => r.statusCode === 410) ? 'Some subscriptions were revoked and have been removed.' : undefined });
  } catch (error: any) {
    console.error('[Push][Test] Send test push failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const registerDevice = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    const { subscription, deviceId, platform, isStandalone, notificationPermission } = req.body;
    const userId = user._id;
    const accountType = user.role === 'provider' ? 'service_provider' : 'member';
    if (!deviceId || deviceId === 'undefined' || deviceId === 'null') return res.status(400).json({ error: 'Valid deviceId required' });

    let validSubscription = subscription;
    const endpoint = validSubscription?.endpoint;
    if (validSubscription !== undefined && validSubscription !== null && (!endpoint || endpoint === 'undefined' || endpoint === 'null' || !endpoint.startsWith('https://'))) validSubscription = undefined;

    const existingForDevice = await PushSubscription.findOne({ deviceId });
    let replaced = false;
    if (existingForDevice && existingForDevice.userId.toString() !== userId.toString()) {
      await PushSubscription.deleteOne({ deviceId });
      replaced = true;
    }

    const hasSubscription = !!validSubscription?.endpoint;
    const hasGrantedPush = notificationPermission === 'granted' && hasSubscription;
    const update: any = {
      userId, deviceId, accountType, platform: platform || 'unknown', isStandalone: !!isStandalone,
      notificationPermission: notificationPermission || 'unknown', notificationsEnabled: hasGrantedPush,
      isActive: true, failCount: 0, lastSeenAt: new Date(), updatedAt: new Date(),
      // A newly registered/rotated subscription has not been verified yet.
      // Never carry an old device's unhealthy state into a fresh subscription.
      pushHealthStatus: hasGrantedPush ? 'unknown' : undefined,
    };
    if (hasGrantedPush) {
      update.lastTestStatus = undefined;
      update.lastTestId = undefined;
      update.lastTestAckTokenHash = undefined;
      update.lastVerifiedAt = undefined;
      update.lastSuccessfulPushAt = undefined;
    }
    if (hasSubscription) {
      update.endpoint = validSubscription.endpoint;
      update.keys = { p256dh: validSubscription.keys?.p256dh || '', auth: validSubscription.keys?.auth || '' };
    }

    const existing = await PushSubscription.findOne({ userId, deviceId });
    const isNew = !existing;
    const device = await PushSubscription.findOneAndUpdate({ userId, deviceId }, { $set: update, $setOnInsert: { createdAt: new Date() } }, { upsert: true, new: true });
    return res.json({ success: true, isNew, replaced, subId: device._id, deviceId: device._id, notificationsEnabled: device.notificationsEnabled });
  } catch (error: any) {
    console.error('[Device] Register error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const savePushSubscription = registerDevice;

export const removeDevice = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    const result = await PushSubscription.deleteOne({ userId: user._id, deviceId });
    console.log('[Device] Removed device on logout:', { userId: user._id, deviceId, deleted: result.deletedCount });
    return res.json({ success: true, deleted: result.deletedCount });
  } catch (error: any) {
    console.error('[Device] Remove device error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const removePushSubscription = removeDevice;

export const getCurrentDevice = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    const deviceId = req.query.deviceId as string;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    const device = await PushSubscription.findOne({ userId: user._id, deviceId });
    return res.json({ device: device || null });
  } catch (error: any) {
    console.error('[Device] Get current error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePushToken = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });
    const { deviceId, subscription } = req.body;
    if (!deviceId || deviceId === 'undefined' || deviceId === 'null') return res.status(400).json({ error: 'deviceId required' });
    if (!subscription?.endpoint || !subscription.endpoint.startsWith('https://')) return res.status(400).json({ error: 'subscription endpoint required' });
    const device = await PushSubscription.findOneAndUpdate({ userId: user._id, deviceId }, { $set: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys?.p256dh || '', auth: subscription.keys?.auth || '' }, notificationsEnabled: true, isActive: true, failCount: 0, pushHealthStatus: 'unknown', lastVerifiedAt: undefined, lastSuccessfulPushAt: undefined, updatedAt: new Date() } }, { new: true });
    if (!device) return res.status(404).json({ error: 'Device not registered' });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Device] Token update error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
