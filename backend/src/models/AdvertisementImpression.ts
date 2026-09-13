import mongoose, { Schema, Document } from 'mongoose';

export interface IAdvertisementImpression extends Document {
  advertisementId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  shownAt: Date;
  closedAt?: Date;
  clickedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const advertisementImpressionSchema = new Schema<IAdvertisementImpression>(
  {
    advertisementId: {
      type: Schema.Types.ObjectId,
      ref: 'Advertisement',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    shownAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    closedAt: {
      type: Date,
    },
    clickedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast cooldown queries per user
advertisementImpressionSchema.index({ userId: 1, shownAt: -1 });

export const AdvertisementImpression = mongoose.model<IAdvertisementImpression>(
  'AdvertisementImpression',
  advertisementImpressionSchema
);
export default AdvertisementImpression;
