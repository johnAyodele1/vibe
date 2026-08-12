import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';
import VapidKey from '../models/VapidKey';

let isVapidInitialized = false;

export const ensureVapidKeys = async () => {
  if (isVapidInitialized) {
    return;
  }

  // 1. Check if configured in environment variables
  if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    isVapidInitialized = true;
    console.log('[Push] VAPID initialized:', {
      subject:    process.env.VAPID_SUBJECT,
      publicKey:  process.env.VAPID_PUBLIC_KEY.slice(0, 20) + '...',
    });
    return;
  }

  try {
    // 2. Check if keys exist in the Database
    const defaultSubject = process.env.VAPID_SUBJECT || 'mailto:admin@vibe.com';
    let dbKey = await VapidKey.findOne();

    if (!dbKey || !dbKey.publicKey) {
      console.log('[Push] No VAPID keys found in DB or environment. Generating new ones...');
      const generated = webpush.generateVAPIDKeys();
      dbKey = new VapidKey({
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject: defaultSubject
      });
      await dbKey.save();
      console.log('[Push] Generated and saved new VAPID keys to DB.');
    }

    webpush.setVapidDetails(
      dbKey.subject,
      dbKey.publicKey,
      dbKey.privateKey
    );
    isVapidInitialized = true;
    console.log('[Push] VAPID initialized dynamically:', {
      subject: dbKey.subject,
      publicKey: dbKey.publicKey.slice(0, 20) + '...',
    });
  } catch (err) {
    console.error('[Push] Failed to initialize dynamic VAPID keys:', err);
  }
};

export const sendPushToUser = async (userId: any, payload: any, zone = 'adult') => {
  console.log('[Push] Attempting to send:', {
    userId,
    type:    payload.type,
    title:   payload.title,
    zone,
  });

  try {
    await ensureVapidKeys();
  } catch (err: any) {
    console.error('[Push] VAPID initialization failed in sendPushToUser:', err.message);
  }

  // SPEC: Find ALL active, enabled registrations for the user
  const subscriptions = await PushSubscription.find({
    userId,
    isActive: true,
    notificationsEnabled: true,
    endpoint: { $exists: true, $ne: null }
  });

  if (!subscriptions.length) {
    console.log('[Push] No active subscriptions found for user — notification not delivered:', {
      userId,
      payloadType: payload.type,
      hint: 'User may not have granted push permission, or has not added app to home screen',
    });
    return { sent: 0, failed: 0, reason: 'no_subscriptions' };
  }

  console.log('[Push] Found active subscriptions:', { userId, count: subscriptions.length });

  const payloadStr = JSON.stringify(payload);
  let sent = 0, failed = 0;

  for (const sub of subscriptions) {
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      continue;
    }
    try {
      console.log('[Push] Attempting to send to endpoint:', sub.endpoint.slice(0, 60) + '...');
      const result = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys:     { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        },
        payloadStr,
        {
          TTL: 60 * 60 * 24,   // 24 hours — message survives if device offline
          urgency: payload.type === 'new_message' ? 'normal' : 'low',
        }
      );

      console.log('[Push] Delivered:', {
        userId,
        type:       payload.type,
        statusCode: result.statusCode,
        endpoint:   sub.endpoint.slice(0, 60) + '...',
      });

      // Update lastUsed / lastSeenAt / reset failCount
      await PushSubscription.updateOne(
        { _id: sub._id },
        {
          $set: {
            lastUsed: new Date(),
            lastSeenAt: new Date(),
            failCount: 0,
          }
        }
      );
      sent++;

    } catch (err: any) {
      console.error('[Push] FAILED to deliver error message:', err.message, err.stack);
      console.error('[Push] FAILED to deliver:', {
        userId,
        type:       payload.type,
        statusCode: err.statusCode,
        body:       err.body,
        endpoint:   sub.endpoint.slice(0, 60) + '...',
        headers:    err.headers,
      });
      failed++;

      // SPEC: Mark invalid/expired push tokens as inactive
      if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 403) {
        await PushSubscription.updateOne(
          { _id: sub._id },
          {
            $set: {
              isActive: false,
              notificationsEnabled: false,
              deactivatedAt: new Date(),
            }
          }
        );
        console.log('[Push] Deactivated dead/expired subscription:', { userId, subId: sub._id });
      } else {
        // Temporary failure — increment failCount
        const currentFailCount = (sub.failCount || 0) + 1;
        const updateFields: any = {
          failCount: currentFailCount,
          lastFailedAt: new Date(),
        };

        // If 5 consecutive failures, deactivate the device
        if (currentFailCount >= 5) {
          updateFields.isActive = false;
          updateFields.notificationsEnabled = false;
          updateFields.deactivatedAt = new Date();
          console.warn('[Push] Deactivating device after 5 consecutive failures:', { userId, subId: sub._id });
        }

        await PushSubscription.updateOne({ _id: sub._id }, { $set: updateFields });
      }
    }
  }

  console.log('[Push] Send complete:', { userId, type: payload.type, sent, failed });
  return { sent, failed };
};
