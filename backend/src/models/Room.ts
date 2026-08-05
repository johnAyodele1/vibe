import mongoose, { Schema } from 'mongoose';
import { IRoom } from '../types/adultModels';

const roomSchema = new Schema<IRoom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    category: {
      type: String,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    activeUsers: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    maxUsers: {
      type: Number,
      default: 100,
    },
    isExplicit: {
      type: Boolean,
      default: true,
    },
    mood: {
      type: String,
      enum: ['chill', 'wild', 'explicit'],
      default: 'chill',
    },
    tags: [String],
    isPinned: {
      type: Boolean,
      default: false,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    coverGradient: {
      type: [String],
      default: ["#c8102e", "#0a0608"],
    },
    icon: {
      type: String,
      default: "🔴",
    },
    rules: {
      type: [String],
      default: [],
    },
    requiresSubscription: {
      type: Boolean,
      default: false,
    },
    memberCount: {
      type: Number,
      default: 0,
    },
    moderators: {
      type: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Room = mongoose.model<IRoom>('Room', roomSchema);
export default Room;
