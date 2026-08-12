import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';
import { ensureVapidKeys } from '../shared/push';
import VapidKey from '../models/VapidKey';
import webpush from 'web-push';

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

export const sendTestPush = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const userId = user._id;
    console.log('[Push][Test] Sending test push to:', userId);

    // Ensure VAPID keys are initialized
    await ensureVapidKeys();

    const subscriptions = await PushSubscription.find({ userId });
    console.log('[Push][Test] Found subscriptions:', {
      userId,
      count: subscriptions.length,
      endpoints: subscriptions.map(s => s.endpoint.slice(0, 60) + '...'),
    });

    if (!subscriptions.length) {
      return res.json({
        success: false,
        reason:  'No push subscriptions found for this user',
        fix:     'Make sure the browser asked for notification permission and it was granted',
      });
    }

    const results = [];
    const isReopen = req.body?.isReopen === true;

    const payload = isReopen ? {
      title:       '👋 Welcome back to Zippo',
      body:        'You\'re all set — notifications are working.',
      icon:        '/icons/icon-192x192.png',
      badge:       '/icons/badge-72x72.png',
      tag:         'welcome-back',
      renotify:    false,     // don't re-alert if they already saw the welcome
      silent:      false,
      url:         '/adult',
      unreadCount: 0,
      type:        'test',
    } : {
      title:       '✅ Test Notification',
      body:        'Push notifications are working on this device!',
      icon:        '/icons/icon-192x192.png',
      badge:       '/icons/badge-72x72.png',
      tag:         'notif-test',
      renotify:    true,
      url:         '/adult',
      unreadCount: 0,
      type:        'test',
    };

    for (const sub of subscriptions) {
      try {
        console.log('[Push][Test] Attempting to send to endpoint:', sub.endpoint.slice(0, 60));

        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify(payload)
        );

        console.log('[Push][Test] SUCCESS for endpoint:', sub.endpoint.slice(0, 60));
        results.push({ endpoint: sub.endpoint.slice(0, 60), success: true });

      } catch (err: any) {
        console.error('[Push][Test] FAILED for endpoint:', sub.endpoint.slice(0, 60), {
          statusCode: err.statusCode,
          body:       err.body,
          message:    err.message,
          headers:    err.headers,
        });

        results.push({
          endpoint:   sub.endpoint.slice(0, 60),
          success:    false,
          statusCode: err.statusCode,
          body:       err.body,
          message:    err.message,
        });

        // Clean up dead subscriptions
        if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 403) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.log('[Push][Test] Removed dead or mismatched subscription:', sub._id);
        }
      }
    }

    return res.json({ results });
  } catch (error: any) {
    console.error('[Push][Test] Send test push failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const savePushSubscription = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { subscription, deviceId, platform, isStandalone } = req.body;
    const userId = user._id;
    const accountType = user.role === 'provider' ? 'service_provider' : 'member';

    console.log('[Push][Subscribe] Sync request:', {
      userId,
      deviceId,
      platform,
      isStandalone,
      endpoint: subscription?.endpoint?.slice(0, 60) + '...',
    });

    // Validate
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      console.error('[Push][Subscribe] Invalid subscription object');
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    if (!deviceId) {
      console.warn('[Push][Subscribe] No deviceId provided');
      return res.status(400).json({ error: 'deviceId required' });
    }

    // Check if this device previously had a subscription for a DIFFERENT user
    const existingForDevice = await PushSubscription.findOne({ deviceId });

    let replaced = false;
    if (existingForDevice && existingForDevice.userId.toString() !== userId.toString()) {
      // Different user was subscribed on this device — remove their subscription
      console.log('[Push][Subscribe] Removing old user subscription from this device:', {
        oldUserId: existingForDevice.userId,
        newUserId: userId,
        deviceId,
      });
      await PushSubscription.deleteOne({ deviceId });
      replaced = true;
    }

    // Upsert subscription for current user + device
    const existing = await PushSubscription.findOne({ userId, deviceId });
    const isNew = !existing;

    const saved = await PushSubscription.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          userId,
          deviceId,
          accountType,
          endpoint:     subscription.endpoint,
          keys:         {
            p256dh: subscription.keys.p256dh,
            auth:   subscription.keys.auth,
          },
          platform:     platform || 'unknown',
          isStandalone: isStandalone || false,
          updatedAt:    new Date(),
          failCount:    0,   // reset fail count on successful sync
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    console.log('[Push][Subscribe] Saved:', {
      userId,
      deviceId,
      isNew,
      replaced,
      docId: saved._id,
    });

    return res.json({ success: true, isNew, replaced, subId: saved._id });
  } catch (error: any) {
    console.error('[Push][Subscribe] DB save failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const removePushSubscription = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { deviceId } = req.body;
    const userId = user._id;

    console.log('[Push][Unsubscribe]', { userId, deviceId });

    if (deviceId) {
      const result = await PushSubscription.deleteOne({ userId, deviceId });
      console.log('[Push][Unsubscribe] Removed by deviceId:', {
        deviceId,
        deleted: result.deletedCount,
      });
    } else {
      // Fallback: remove all subscriptions for this user
      const result = await PushSubscription.deleteMany({ userId });
      console.log('[Push][Unsubscribe] Removed all for user:', {
        userId,
        deleted: result.deletedCount,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Push] removePushSubscription error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
