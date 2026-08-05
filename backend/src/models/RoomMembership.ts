import mongoose, { Schema } from 'mongoose';
import { IRoomMembership } from '../types/adultModels';

const roomMembershipSchema = new Schema<IRoomMembership>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    tipsReceived: {
      type: Number,
      default: 0,
    },
    mutedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index to prevent duplicate memberships
roomMembershipSchema.index({ roomId: 1, userId: 1 }, { unique: true });

export const RoomMembership = mongoose.model<IRoomMembership>('RoomMembership', roomMembershipSchema);
export default RoomMembership;
