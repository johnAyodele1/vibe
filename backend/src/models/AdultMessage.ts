import mongoose, { Schema } from 'mongoose';
import { IMessage } from '../types/adultModels';

const adultMessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    content: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      required: true,
      enum: ['text', 'image', 'voice', 'gift', 'system'],
      default: 'text',
    },
    mediaUrl: String,
    mediaBlurred: {
      type: Boolean,
      default: true,
    },
    unlockCost: {
      type: Number,
      default: 0,
    },
    unlockedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'AdultUser',
      },
    ],
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        emoji: String,
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AdultMessage = mongoose.model<IMessage>('AdultMessage', adultMessageSchema);
export default AdultMessage;
