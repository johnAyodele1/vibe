import mongoose, { Schema } from 'mongoose';
import { IAdultRoomMessage } from '../types/adultModels';

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    userIds: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const adultRoomMessageSchema = new Schema<IAdultRoomMessage>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    threadId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultThread',
      default: null,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderAvatarUrl: {
      type: String,
    },
    senderBadge: {
      type: String,
      enum: ['Gold', 'Platinum', 'Diamond', 'Mod', null],
      default: null,
    },
    content: {
      type: String,
      required: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ['image', 'gif', 'audio', null],
      default: null,
    },
    isExplicit: {
      type: Boolean,
      default: false,
    },
    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultRoomMessage',
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const AdultRoomMessage = mongoose.model<IAdultRoomMessage>('AdultRoomMessage', adultRoomMessageSchema);
export default AdultRoomMessage;
