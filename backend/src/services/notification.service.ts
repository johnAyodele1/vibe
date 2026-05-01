import admin from '../config/firebase';
import User from '../models/User';
import { IUser } from '../types/models';

interface NotificationPayload {
  title: string;
  body: string;
  data?: { [key: string]: string };
}

export const sendPushNotification = async (
  userId: string,
  payload: NotificationPayload
) => {
  try {
    const user = await User.findById(userId) as IUser | null;
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
        await User.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: failedTokens } },
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};
