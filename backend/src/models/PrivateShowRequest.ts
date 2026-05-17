import mongoose, { Schema } from 'mongoose';
import { IPrivateShowRequest } from '../types/adultModels';

const privateShowRequestSchema = new Schema<IPrivateShowRequest>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CamSession',
      required: true,
    },
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'accepted', 'rejected', 'ended', 'expired'],
      default: 'pending',
    },
    creditsPerMinute: {
      type: Number,
      required: true,
    },
    totalCreditsSpent: {
      type: Number,
      default: 0,
    },
    startedAt: Date,
    endedAt: Date,
    privateStreamKey: String,
    privatePlaybackUrl: String,
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const PrivateShowRequest = mongoose.model<IPrivateShowRequest>('PrivateShowRequest', privateShowRequestSchema);
export default PrivateShowRequest;
