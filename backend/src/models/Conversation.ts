import mongoose, { Schema } from 'mongoose';
import { IConversation, IConversationModel, IMessage, IParticipantInfo } from '../types/models';

const conversationSchema = new Schema<IConversation, IConversationModel>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    participantInfo: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        firstName: String,
        lastName: String,
        photos: [
          {
            url: String,
            isMain: Boolean,
          },
        ],
        isOnline: {
          type: Boolean,
          default: false,
        },
        lastActive: Date,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only two participants for direct conversations
conversationSchema.pre('save', function (next) {
  if (this.participants.length !== 2) {
    return next(new Error('Conversations must have exactly 2 participants'));
  }
  next();
});

// Index for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ 'participantInfo.user': 1 });

// Static method to find direct conversation between two users
conversationSchema.statics.findDirectConversation = function (
  userId1: string | mongoose.Types.ObjectId,
  userId2: string | mongoose.Types.ObjectId
) {
  const id1 = new mongoose.Types.ObjectId(userId1);
  const id2 = new mongoose.Types.ObjectId(userId2);
  return this.findOne({
    participants: { $all: [id1, id2], $size: 2 },
    isActive: true,
  });
};

// Instance method to update participant info
conversationSchema.methods.updateParticipantInfo = async function (this: IConversation) {
  try {
    const User = mongoose.model('User');
    const participantInfo: IParticipantInfo[] = [];

    for (const participantId of this.participants) {
      const user = await User.findById(participantId).select(
        'firstName lastName photos isOnline lastActive'
      );

      if (user) {
        const mainPhoto = user.photos.find((photo: { isMain: boolean; url: string }) => photo.isMain);
        participantInfo.push({
          user: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          photos: mainPhoto ? [{ url: mainPhoto.url, isMain: true }] : [],
          isOnline: user.isOnline,
          lastActive: user.lastActive,
        });
      }
    }

    this.participantInfo = participantInfo;
    const saved = await this.save();
    console.log('Conversation saved with ID:', saved._id);
    return saved;
  } catch (error) {
    console.error('Error updating participant info:', error);
    throw error;
  }
};

// Instance method to update last message
conversationSchema.methods.updateLastMessage = async function (this: IConversation, message: IMessage) {
  this.lastMessage = message._id as mongoose.Types.ObjectId;
  this.lastMessageAt = message.createdAt;
  return this.save();
};

// Instance method to get unread count for a user
conversationSchema.methods.getUnreadCount = function (this: IConversation, userId: string | mongoose.Types.ObjectId) {
  return this.unreadCount.get(userId.toString()) || 0;
};

// Instance method to increment unread count for a user
conversationSchema.methods.incrementUnreadCount = function (this: IConversation, userId: string | mongoose.Types.ObjectId) {
  const currentCount = this.getUnreadCount(userId);
  this.unreadCount.set(userId.toString(), currentCount + 1);
  return this.save();
};

// Instance method to reset unread count for a user
conversationSchema.methods.resetUnreadCount = function (this: IConversation, userId: string | mongoose.Types.ObjectId) {
  this.unreadCount.set(userId.toString(), 0);
  return this.save();
};

export const Conversation = mongoose.model<IConversation, IConversationModel>('Conversation', conversationSchema);
export default Conversation;
