import User from '../models/User';
import { IUser } from '../types/models';
import PushSubscription from '../models/PushSubscription';
import { ensureVapidKeys } from '../shared/push';
import webpush from 'web-push';

interface NotificationPayload {
  title: string;
  body: string;
  data?: { [key: string]: string };
}

export const sendPushNotification = async (userId: string | IUser, payload: NotificationPayload) => {
  try {
    if (process.env.ENABLE_NOTIFICATIONS === 'false') return;

    const user = typeof userId === 'string' ? await User.findById(userId) as IUser | null : userId;
    if (!user) return;

    await ensureVapidKeys();
    const subscriptions = await PushSubscription.find({
      userId: user._id,
      isActive: true,
      notificationsEnabled: true,
      endpoint: { $exists: true, $ne: null },
    });
    if (!subscriptions.length) return;

    const results = await Promise.all(subscriptions.map(async subscription => {
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return false;

      const notificationPayload = {
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: payload.data?.type || 'general',
        renotify: true,
        requireInteraction: true,
        url: payload.data?.conversationId ? `/chat/${payload.data.conversationId}` : '/adult',
        type: payload.data?.type || 'general',
        unreadCount: 0,
        ...payload.data,
      };

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
          JSON.stringify(notificationPayload),
        );
        await PushSubscription.updateOne(
          { _id: subscription._id },
          { $set: { lastUsed: new Date(), lastSuccessfulPushAt: new Date(), pushHealthStatus: 'healthy', lastSeenAt: new Date(), failCount: 0 } },
        );
        return true;
      } catch (error: any) {
        const stale = error.statusCode === 404 || error.statusCode === 410;
        await PushSubscription.updateOne(
          { _id: subscription._id },
          {
            $set: {
              pushHealthStatus: 'unhealthy',
              isActive: stale ? false : subscription.isActive,
              notificationsEnabled: stale ? false : subscription.notificationsEnabled,
              deactivatedAt: stale ? new Date() : subscription.deactivatedAt,
            },
            $inc: { failCount: 1 },
          },
        );
        return false;
      }
    }));

    return { sent: results.filter(Boolean).length, attempted: results.length };
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

export const notifyUsersOfNewJoiner = async (newUser: IUser) => {
  try {
    if (process.env.ENABLE_NOTIFICATIONS === 'false') return;
    const newUserAge = newUser.age;
    if (!newUserAge) return;

    const query: any = {
      _id: { $ne: newUser._id },
      isBlocked: false,
      'settings.notifications.matches': true,
      $or: [
        { 'preferences.genderPreference': 'Everyone' },
        { 'preferences.genderPreference': newUser.gender },
      ],
      'preferences.ageRange.min': { $lte: newUserAge },
      'preferences.ageRange.max': { $gte: newUserAge },
    };

    if (newUser.location?.coordinates?.[0] !== 0) {
      query.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: newUser.location.coordinates },
          $maxDistance: 100000,
        },
      };
    }

    const matchingUsers = await User.find(query).limit(100);
    console.log(`Notifying ${matchingUsers.length} users about new joiner ${newUser.firstName}`);

    for (const user of matchingUsers) {
      void sendPushNotification(user, {
        title: 'Someone new just joined!',
        body: `${newUser.firstName} just joined Vibe and matches your preferences. Say hi!`,
        data: { type: 'new_user', userId: newUser._id.toString() },
      });
    }
  } catch (error) {
    console.error('Error in notifyUsersOfNewJoiner:', error);
  }
};
