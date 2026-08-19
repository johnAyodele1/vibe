import mongoose, { Schema, Document } from 'mongoose';

export interface IOfficialNotification extends Document {
  title: string;
  content: string;
  targetAudience: 'users' | 'providers' | 'both';
  createdBy?: mongoose.Types.ObjectId;
  mediaUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const officialNotificationSchema = new Schema<IOfficialNotification>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    targetAudience: {
      type: String,
      required: true,
      enum: ['users', 'providers', 'both'],
      default: 'both',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    mediaUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

officialNotificationSchema.index({ createdAt: -1 });

export const OfficialNotification = mongoose.model<IOfficialNotification>(
  'OfficialNotification',
  officialNotificationSchema
);
export default OfficialNotification;
