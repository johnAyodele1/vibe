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

    for (const sub of subscriptions) {
      try {
        console.log('[Push][Test] Attempting to send to endpoint:', sub.endpoint.slice(0, 60));

        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          JSON.stringify({
            title:       '✅ Push Test — Zippo',
            body:        'Push notifications are working! You will now receive message alerts.',
            icon:        '/icons/icon-192x192.png',
            badge:       '/icons/badge-72x72.png',
            tag:         'push-test',
            url:         '/adult',
            unreadCount: 0,
            type:        'test',
          })
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

    const { subscription } = req.body;
    const userId = user._id;
    const accountType = user.role === 'provider' ? 'service_provider' : 'member';

    // Log everything about the incoming subscription
    console.log('[Push][Subscribe] Incoming subscription:', {
      userId,
      endpoint:    subscription?.endpoint?.slice(0, 80) + '...',
      hasP256dh:   !!subscription?.keys?.p256dh,
      hasAuth:     !!subscription?.keys?.auth,
      p256dhLen:   subscription?.keys?.p256dh?.length,
      authLen:     subscription?.keys?.auth?.length,
      bodyKeys:    Object.keys(subscription || {}),
    });

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      console.error('[Push][Subscribe] INVALID subscription — missing fields:', {
        hasEndpoint: !!subscription?.endpoint,
        hasP256dh:   !!subscription?.keys?.p256dh,
        hasAuth:     !!subscription?.keys?.auth,
      });
      return res.status(400).json({ success: false, error: 'Invalid subscription object' });
    }

    const saved = await PushSubscription.findOneAndUpdate(
      { userId, endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          accountType,
          endpoint:    subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth:   subscription.keys.auth,
          },
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    console.log('[Push][Subscribe] Saved to DB:', {
      userId,
      docId:       saved._id,
      accountType: saved.accountType,
      endpoint:    saved.endpoint.slice(0, 80) + '...',
    });

    return res.json({ success: true, subId: saved._id });
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

    const userId = user._id;
    await PushSubscription.deleteMany({ userId });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Push] removePushSubscription error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
