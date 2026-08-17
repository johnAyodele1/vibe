import mongoose, { Schema } from 'mongoose';
import { ICamSession } from '../types/adultModels';

const camSessionSchema = new Schema<ICamSession>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    sessionType: {
      type: String,
      required: true,
      enum: ['public', 'private', 'vip_only', 'premium_only'],
      default: 'public',
    },
    status: {
      type: String,
      required: true,
      enum: ['scheduled', 'pending', 'live', 'ended', 'interrupted'],
      default: 'scheduled',
    },
    streamKey: {
      type: String,
      required: true,
      unique: true,
    },
    streamPlaybackUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: String,
    previewGifUrl: String,
    startedAt: Date,
    endedAt: Date,
    durationSeconds: {
      type: Number,
      default: 0,
    },
    peakViewerCount: {
      type: Number,
      default: 0,
    },
    totalViewerCount: {
      type: Number,
      default: 0,
    },
    totalTipsReceived: {
      type: Number,
      default: 0,
    },
    totalTipsUsdValue: {
      type: Number,
      default: 0,
    },
    privateShowRate: {
      type: Number,
      default: 0,
    },
    tags: [String],
    title: {
      type: String,
      required: true,
    },
    resolution: {
      type: String,
      enum: ['720p', '1080p', '4K'],
      default: '1080p',
    },
    isHD: {
      type: Boolean,
      default: true,
    },
    isInteractive: {
      type: Boolean,
      default: false,
    },
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    recordingEnabled: {
      type: Boolean,
      default: false,
    },
    recordingUrl: String,
    reportCount: {
      type: Number,
      default: 0,
    },
    isFlagged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

camSessionSchema.index(
  { providerId: 1 },
  { name: 'unique_live_provider_stream', unique: true, partialFilterExpression: { status: 'live' } }
);

camSessionSchema.index(
  { providerId: 1 },
  { name: 'unique_pending_provider_stream', unique: true, partialFilterExpression: { status: 'pending' } }
);

export const CamSession = mongoose.model<ICamSession>('CamSession', camSessionSchema);
export default CamSession;
