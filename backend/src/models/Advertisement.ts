import mongoose, { Schema, Document } from 'mongoose';

export interface IAdvertisement extends Document {
  title: string;
  description?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  clickUrl?: string;
  targetAudience: 'user' | 'provider' | 'both';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';
  campaignStartsAt: Date;
  campaignEndsAt: Date;
  displayDurationSeconds: number;
  closeAfterSeconds: number;
  createdBy?: mongoose.Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const advertisementSchema = new Schema<IAdvertisement>(
  {
    title: {
      type: String,
      required: [true, 'Advertisement title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    mediaType: {
      type: String,
      required: [true, 'Media type is required'],
      enum: ['image', 'video'],
    },
    mediaUrl: {
      type: String,
      required: [true, 'Media URL is required'],
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    clickUrl: {
      type: String,
      trim: true,
    },
    targetAudience: {
      type: String,
      required: true,
      enum: ['user', 'provider', 'both'],
      default: 'both',
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'scheduled', 'active', 'paused', 'expired'],
      default: 'draft',
    },
    campaignStartsAt: {
      type: Date,
      required: [true, 'Campaign start date is required'],
    },
    campaignEndsAt: {
      type: Date,
      required: [true, 'Campaign end date is required'],
    },
    displayDurationSeconds: {
      type: Number,
      required: true,
      default: 30,
      min: [1, 'Display duration must be at least 1 second'],
    },
    closeAfterSeconds: {
      type: Number,
      required: true,
      default: 15,
      min: [1, 'Close delay must be at least 1 second'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query optimization
advertisementSchema.index({
  status: 1,
  isArchived: 1,
  campaignStartsAt: 1,
  campaignEndsAt: 1,
  targetAudience: 1,
});

export const Advertisement = mongoose.model<IAdvertisement>('Advertisement', advertisementSchema);
export default Advertisement;
