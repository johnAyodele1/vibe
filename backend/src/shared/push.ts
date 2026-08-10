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
    console.log('[Push] VAPID keys initialized from environment variables.');
    return;
  }

  try {
    // 2. Check if keys exist in the Database
    const defaultSubject = process.env.VAPID_SUBJECT || 'mailto:admin@vibe.com';
    let dbKey = await VapidKey.findOne();

    if (!dbKey) {
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
    console.log('[Push] VAPID keys successfully initialized dynamically.');
  } catch (err) {
    console.error('[Push] Failed to initialize dynamic VAPID keys:', err);
  }
};

export const sendPushToUser = async (userId: any, payload: any) => {
  try {
    await ensureVapidKeys();
    const subscriptions = await PushSubscription.find({ userId });
    if (!subscriptions.length) {
      console.log(`[Push] No subscriptions found for user ${userId}`);
      return [];
    }

    const results = await Promise.allSettled(
      subscriptions.map(sub => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth
          }
        };
        return webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        ).then(async (res) => {
          // Update lastUsed
          await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsed: new Date() } });
          return res;
        }).catch(async (err: any) => {
          // Subscription expired or invalid — remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push] Subscription expired (${err.statusCode}) for user ${userId}, removing endpoint:`, sub.endpoint);
            await PushSubscription.deleteOne({ _id: sub._id });
          }
          throw err;
        });
      })
    );

    return results;
  } catch (error) {
    console.error(`[Push] Error in sendPushToUser for user ${userId}:`, error);
    return [];
  }
};
