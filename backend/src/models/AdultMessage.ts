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
      enum: ['text', 'image', 'video', 'audio', 'voice_note', 'gift', 'locked_image', 'locked_video', 'request_photo', 'system', 'voice', 'gift_request', 'service_request', 'request_service'],
      default: 'text',
    },
    mediaUrl: String,
    mediaThumbnailUrl: String,
    mediaDurationSeconds: Number,
    mediaFileSizeBytes: Number,
    mediaMimeType: String,
    isLocked: {
      type: Boolean,
      default: false,
    },
    creditCost: {
      type: Number,
      default: 0,
    },
    mediaBlurred: {
      type: Boolean,
      default: false,
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
    gift: {
      giftId: String,
      giftName: String,
      giftIconUrl: String,
      giftValue: Number,
      message: String,
    },
    giftRequest: {
      giftId: String,
      giftName: String,
      giftIconUrl: String,
      giftValue: Number,
      message: String,
      status: {
        type: String,
        enum: ['pending', 'fulfilled', 'different_sent', 'dismissed'],
        default: 'pending',
      },
    },
    serviceRequest: {
      baseRate: Number,
      extras: [{ label: String, amount: Number }],
      totalAmount: Number,
      note: String,
      status: {
        type: String,
        enum: ['pending', 'paid', 'completed', 'auto_completed', 'reported'],
        default: 'pending',
      },
      eligibleForPayout: { type: Boolean, default: false }
    },
    photoRequest: {
      status: {
        type: String,
        enum: ['pending', 'fulfilled', 'declined'],
      },
      note: String,
      fulfilledMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'AdultMessage',
        default: null,
      },
    },
    serviceTonightRequest: {
      status: {
        type: String,
        enum: ['pending', 'fulfilled', 'declined'],
      },
      note: String,
      fulfilledMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'AdultMessage',
        default: null,
      },
    },
    systemText: String,
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        emoji: String,
        reactedAt: { type: Date, default: Date.now },
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
    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'AdultUser',
      },
    ],
    reportedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'AdultUser',
      },
    ],
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AdultMessage = mongoose.model<IMessage>('AdultMessage', adultMessageSchema);
export default AdultMessage;
