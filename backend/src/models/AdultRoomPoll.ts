import mongoose, { Schema } from 'mongoose';
import { IAdultRoomPoll } from '../types/adultModels';

const pollOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    voteCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const adultRoomPollSchema = new Schema<IAdultRoomPoll>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    question: {
      type: String,
      required: true,
    },
    options: {
      type: [pollOptionSchema],
      default: [],
    },
    voterIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'AdultUser' }],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const AdultRoomPoll = mongoose.model<IAdultRoomPoll>('AdultRoomPoll', adultRoomPollSchema);
export default AdultRoomPoll;
