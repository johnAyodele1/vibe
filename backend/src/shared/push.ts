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
  console.log('[Push] Fan-out:', { userId, type: payload.type });

  try {
    await ensureVapidKeys();
  } catch (err: any) {
    console.error('[Push] VAPID initialization failed in sendPushToUser:', err.message);
  }

  // Query: Find ALL active, enabled registrations for the user (NOT scoped to deviceId)
  const devices = await PushSubscription.find({
    userId,
    isActive:             true,
    notificationsEnabled: true,
    endpoint:             { $exists: true, $ne: null }
  });

  if (!devices.length) {
    console.log('[Push] No active devices:', { userId });
    return { sent: 0, failed: 0, reason: 'no_subscriptions' };
  }

  console.log('[Push] Devices to notify:', {
    userId,
    count:     devices.length,
    platforms: devices.map(d => d.platform),
  });

  let sent = 0, failed = 0;
  const payloadStr = JSON.stringify(payload);

  for (const device of devices) {
    if (!device.endpoint || !device.keys?.p256dh || !device.keys?.auth) {
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys:     { p256dh: device.keys.p256dh, auth: device.keys.auth }
        },
        payloadStr,
        {
          TTL: 86400, // 24 hours
          urgency: 'normal'
        }
      );

      await PushSubscription.findByIdAndUpdate(device._id, {
        $set: { lastSeenAt: new Date(), failCount: 0, lastUsed: new Date() },
      });
      console.log('[Push] ✅ Delivered:', { userId, platform: device.platform });
      sent++;
    } catch (err: any) {
      console.error('[Push] ❌ Failed:', {
        userId,
        platform:   device.platform,
        statusCode: err.statusCode,
        endpoint:   device.endpoint?.slice(0, 50),
      });
      failed++;

      if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 403) {
        await PushSubscription.findByIdAndUpdate(device._id, {
          $set: {
            isActive: false,
            notificationsEnabled: false,
            endpoint: null,
            keys: null,
            deactivatedAt: new Date(),
          },
        });
        console.log('[Push] Device deactivated and endpoint cleared (expired token):', device.deviceId);
      } else {
        const currentFailCount = (device.failCount || 0) + 1;
        const updateFields: any = {
          failCount: currentFailCount,
          lastFailedAt: new Date()
        };

        if (currentFailCount >= 5) {
          updateFields.isActive = false;
          updateFields.notificationsEnabled = false;
          updateFields.deactivatedAt = new Date();
          console.warn('[Push] Device deactivated after 5 failures:', device.deviceId);
        }

        await PushSubscription.findByIdAndUpdate(device._id, {
          $set: updateFields
        });
      }
    }
  }

  console.log('[Push] Complete:', { userId, sent, failed });
  return { sent, failed };
};
