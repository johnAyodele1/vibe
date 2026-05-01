import cron from 'node-cron';
import User from '../models/User';
import Message from '../models/Message';
import { sendEmail } from '../services/email.service';
import dotenv from 'dotenv';

dotenv.config();

const NOTIFICATION_CRON_SCHEDULE = process.env.NOTIFICATION_CRON_SCHEDULE || '0 0 * * *'; // Default to midnight

export const initNotificationJob = () => {
  cron.schedule(NOTIFICATION_CRON_SCHEDULE, async () => {
    console.log('Running notification cron job...');

    try {
      // 1. Get IDs of users with unread messages
      const usersWithUnreadMessages = await Message.distinct('receiver', {
        isRead: false,
        isDeleted: false
      });

      // 2. Find users who have either unseen matches OR unread messages
      // We only notify if they are not blocked
      const users = await User.find({
        $and: [
          { isBlocked: false },
          {
            $or: [
              { 'matches': { $elemMatch: { isActive: true, isSeen: false } } },
              { _id: { $in: usersWithUnreadMessages } }
            ]
          }
        ]
      });

      console.log(`Found ${users.length} potential users to notify.`);

      for (const user of users) {
        // Check for NEW unseen matches since last notification
        const hasNewUnseenMatches = user.matches.some(match => {
          const isNew = match.matchedAt > user.lastNotificationSentAt;
          return match.isActive && !match.isSeen && isNew;
        });

        // Check for NEW unread messages since last notification
        const newUnreadMessagesCount = await Message.countDocuments({
          receiver: user._id,
          isRead: false,
          isDeleted: false,
          createdAt: { $gt: user.lastNotificationSentAt }
        });
        const hasNewUnreadMessages = newUnreadMessagesCount > 0;

        if (hasNewUnseenMatches || hasNewUnreadMessages) {
          let subject = '';
          let htmlContent = '';

          if (hasNewUnseenMatches && hasNewUnreadMessages) {
            subject = 'You have a new message and new match';
            htmlContent = `
              <div style="font-family: sans-serif; color: #333;">
                <h1>Hello ${user.firstName}!</h1>
                <p>Great news! You have <strong>new matches</strong> and <strong>new messages</strong> waiting for you on Zippo.</p>
                <p>Log in now to see who's interested and keep the conversation going!</p>
                <br>
                <p>Best,<br>The Zippo Team</p>
              </div>
            `;
          } else if (hasNewUnreadMessages) {
            subject = 'You have a new message';
            htmlContent = `
              <div style="font-family: sans-serif; color: #333;">
                <h1>Hello ${user.firstName}!</h1>
                <p>You have <strong>new messages</strong> waiting for you on Zippo.</p>
                <p>Log in now to read them and reply!</p>
                <br>
                <p>Best,<br>The Zippo Team</p>
              </div>
            `;
          } else if (hasNewUnseenMatches) {
            subject = 'You have a new match';
            htmlContent = `
              <div style="font-family: sans-serif; color: #333;">
                <h1>Hello ${user.firstName}!</h1>
                <p>You have <strong>new matches</strong> waiting for you on Zippo.</p>
                <p>Log in now to see your matches and start chatting!</p>
                <br>
                <p>Best,<br>The Zippo Team</p>
              </div>
            `;
          }

          if (subject && htmlContent) {
            const success = await sendEmail({
              to: user.email,
              subject,
              htmlContent
            });

            if (success) {
              user.lastNotificationSentAt = new Date();
              await user.save();
              console.log(`Notification sent to ${user.email}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in notification cron job:', error);
    }
  });

  console.log(`Notification job scheduled with: ${NOTIFICATION_CRON_SCHEDULE}`);
};
