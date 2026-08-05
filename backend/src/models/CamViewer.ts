import mongoose, { Schema } from 'mongoose';
import { ICamViewer } from '../types/adultModels';

const camViewerSchema = new Schema<ICamViewer>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CamSession',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: Date,
    totalWatchSeconds: {
      type: Number,
      default: 0,
    },
    totalTipped: {
      type: Number,
      default: 0,
    },
    isInPrivateShow: {
      type: Boolean,
      default: false,
    },
    privateShowStartedAt: Date,
    privateShowEndedAt: Date,
    privateShowCreditsSpent: {
      type: Number,
      default: 0,
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
    },
    connectionQuality: {
      type: String,
      enum: ['low', 'medium', 'high'],
    },
  },
  {
    timestamps: false,
  }
);

export const CamViewer = mongoose.model<ICamViewer>('CamViewer', camViewerSchema);
export default CamViewer;
