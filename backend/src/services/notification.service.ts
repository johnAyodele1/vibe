import admin from '../config/firebase';
import User from '../models/User';
import { IUser } from '../types/models';

interface NotificationPayload {
  title: string;
  body: string;
  data?: { [key: string]: string };
}

export const sendPushNotification = async (
  userId: string | IUser,
  payload: NotificationPayload
) => {
  try {
    // Check if notifications are enabled globally
    if (process.env.ENABLE_NOTIFICATIONS === 'false') {
      console.log('Push notifications are globally disabled via ENABLE_NOTIFICATIONS env var.');
      return;
    }

    // Ensure Firebase is initialized
    try {
      admin.messaging();
    } catch (e) {
      console.warn('Firebase Admin SDK not initialized. Skipping push notification.');
      return;
    }

    let user: IUser | null = null;
    if (typeof userId === 'string') {
      user = await User.findById(userId) as IUser | null;
    } else {
      user = userId;
    }

    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return;
    }

    const message: admin.messaging.MulticastMessage = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      tokens: user.fcmTokens,
      android: {
        priority: 'high',
        notification: {
          icon: 'stock_ticker_update',
          color: '#f42559',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
            badge: 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: payload.data?.type || 'general',
          renotify: true,
          requireInteraction: true,
          timestamp: Date.now(),
        },
        fcmOptions: {
          link: payload.data?.conversationId ? `/chat/${payload.data.conversationId}` : '/'
        }
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(user.fcmTokens[idx]);
          }
        }
      });

      if (failedTokens.length > 0) {
        await User.findByIdAndUpdate(user._id, {
          $pull: { fcmTokens: { $in: failedTokens } },
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

/**
 * Notify existing users that a new user who matches their preferences has joined.
 */
export const notifyUsersOfNewJoiner = async (newUser: IUser) => {
  try {
    // Only notify if notifications are enabled globally
    if (process.env.ENABLE_NOTIFICATIONS === 'false') return;

    const newUserAge = newUser.age;
    if (!newUserAge) return;

    // Find users whose preferences match the new user
    // 1. Not the new user themselves
    // 2. Not blocked
    // 3. Notification for matches enabled
    // 4. Gender preference matches new user's gender
    // 5. New user's age is within their age range
    // 6. Within distance (if location is available)

    const query: any = {
      _id: { $ne: newUser._id },
      isBlocked: false,
      'settings.notifications.matches': true,
      $or: [
        { 'preferences.genderPreference': 'Everyone' },
        { 'preferences.genderPreference': newUser.gender }
      ],
      'preferences.ageRange.min': { $lte: newUserAge },
      'preferences.ageRange.max': { $gte: newUserAge }
    };

    // Add location-based filtering if new user has coordinates
    if (newUser.location && newUser.location.coordinates && newUser.location.coordinates[0] !== 0) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: newUser.location.coordinates,
          },
          // We use the existing users' maxDistance preference
          // Since we are querying multiple users, we'll check their individual maxDistance in the next step or use a broad filter
          // For efficiency in a large DB, we might use a fixed broad radius here or omit it and filter in memory if users count is low.
          // However, $near with variable distance per document is not directly supported in a single query like this easily.
          // Let's use a reasonable max distance or skip location filter for the notification to be more inclusive.
          $maxDistance: 100000, // 100km default for "new joiner" notification radius
        },
      };
    }

    const matchingUsers = await User.find(query).limit(100); // Limit to avoid spamming/performance issues

    console.log(`Notifying ${matchingUsers.length} users about new joiner ${newUser.firstName}`);

    for (const user of matchingUsers) {
      // Final distance check if needed, but for now we rely on the $near query
      sendPushNotification(user, {
        title: "Someone new just joined! ✨",
        body: `${newUser.firstName} just joined Vibe and matches your preferences. Say hi!`,
        data: {
          type: 'new_user',
          userId: newUser._id.toString(),
        },
      });
    }
  } catch (error) {
    console.error('Error in notifyUsersOfNewJoiner:', error);
  }
};
