import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';

if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[Push] VAPID keys are not completely set in environment variables. Web push may not work properly.');
}

export const sendPushToUser = async (userId: any, payload: any) => {
  try {
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
