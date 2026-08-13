import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import PushSubscription from '../models/PushSubscription';
import { ensureVapidKeys } from '../shared/push';
import webpush from 'web-push';

const TEST_TTL_MS = 30_000;

export const sendPushHealthTest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });

    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });

    await ensureVapidKeys();

    const subscription = await PushSubscription.findOne({
      userId: user._id,
      deviceId,
      isActive: true,
      notificationsEnabled: true,
    });

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(404).json({
        success: false,
        reason: 'No active push subscription exists for this device',
        status: 'backend_missing',
      });
    }

    const testId = `push_test_${randomUUID()}`;
    const now = new Date();

    await PushSubscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          lastTestAt: now,
          lastTestId: testId,
          lastTestStatus: 'pending',
          pushHealthStatus: 'unknown',
          lastSeenAt: now,
        },
      },
    );

    const payload = {
      title: 'Test notification',
      body: 'Push notifications are working on this device.',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: `push-test-${testId}`,
      renotify: true,
      silent: false,
      url: '/adult',
      type: 'push_test',
      testId,
      timestamp: Date.now(),
    };

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        JSON.stringify(payload),
      );
    } catch (error: any) {
      const stale = error.statusCode === 404 || error.statusCode === 410;
      await PushSubscription.updateOne(
        { _id: subscription._id },
        {
          $set: {
            lastTestStatus: 'failed',
            pushHealthStatus: 'unhealthy',
            notificationsEnabled: stale ? false : subscription.notificationsEnabled,
            isActive: stale ? false : subscription.isActive,
            deactivatedAt: stale ? now : subscription.deactivatedAt,
          },
          $inc: { failCount: 1 },
        },
      );

      return res.json({
        success: false,
        testId,
        deliveredToProvider: false,
        status: 'failed',
        reason: stale ? 'Push subscription expired or no longer exists' : error.message,
      });
    }

    return res.json({
      success: true,
      testId,
      deliveredToProvider: true,
      status: 'pending',
      expiresInMs: TEST_TTL_MS,
    });
  } catch (error: any) {
    console.error('[PushHealth] Test failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const acknowledgePushHealthTest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });

    const { deviceId, testId, status } = req.body || {};
    if (!deviceId || !testId) {
      return res.status(400).json({ success: false, error: 'deviceId and testId required' });
    }

    const now = new Date();
    const subscription = await PushSubscription.findOneAndUpdate(
      {
        userId: user._id,
        deviceId,
        lastTestId: testId,
        isActive: true,
      },
      {
        $set: {
          lastTestStatus: status === 'received' ? 'delivered' : 'failed',
          pushHealthStatus: status === 'received' ? 'healthy' : 'unhealthy',
          lastVerifiedAt: now,
          lastSeenAt: now,
          ...(status === 'received' ? { lastSuccessfulPushAt: now, failCount: 0 } : {}),
        },
      },
      { new: true },
    );

    if (!subscription) return res.status(404).json({ success: false, error: 'Push test not found' });

    return res.json({ success: true, status: subscription.lastTestStatus });
  } catch (error: any) {
    console.error('[PushHealth] Acknowledgement failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getPushHealthTestStatus = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: 'Auth required' });

    const { deviceId, testId } = req.query;
    if (typeof deviceId !== 'string' || typeof testId !== 'string') {
      return res.status(400).json({ success: false, error: 'deviceId and testId required' });
    }

    const subscription = await PushSubscription.findOne({ userId: user._id, deviceId, lastTestId: testId });
    if (!subscription) return res.status(404).json({ success: false, status: 'not_found' });

    if (subscription.lastTestStatus === 'pending' && subscription.lastTestAt) {
      const expired = Date.now() - subscription.lastTestAt.getTime() > TEST_TTL_MS;
      if (expired) {
        await PushSubscription.updateOne(
          { _id: subscription._id, lastTestId: testId, lastTestStatus: 'pending' },
          { $set: { lastTestStatus: 'expired', pushHealthStatus: 'unhealthy' } },
        );
        return res.json({ success: true, status: 'expired' });
      }
    }

    return res.json({
      success: true,
      status: subscription.lastTestStatus || 'unknown',
      pushHealthStatus: subscription.pushHealthStatus || 'unknown',
    });
  } catch (error: any) {
    console.error('[PushHealth] Status check failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
