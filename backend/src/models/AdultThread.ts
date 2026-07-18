import mongoose, { Schema } from 'mongoose';
import { IAdultThread } from '../types/adultModels';

const adultThreadSchema = new Schema<IAdultThread>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    authorAvatarUrl: {
      type: String,
    },
    title: {
      type: String,
      required: true,
      maxlength: 80,
    },
    body: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    mediaUrl: {
      type: String,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    reactionCounts: {
      type: Schema.Types.Mixed,
      default: {
        '🔥': 0,
        '💋': 0,
        '❤️': 0,
        '😈': 0,
        '⭐': 0,
      },
    },
    reactions: {
      type: [{
        userId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        emoji: { type: String }
      }],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lastReplyAt: {
      type: Date,
    },
    lastReplyAuthor: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const AdultThread = mongoose.model<IAdultThread>('AdultThread', adultThreadSchema);
export default AdultThread;
