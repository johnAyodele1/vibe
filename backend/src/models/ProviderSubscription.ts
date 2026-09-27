import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProviderSubscription extends Document {
  providerId: Types.ObjectId;
  subscriberId: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const providerSubscriptionSchema = new Schema<IProviderSubscription>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    subscriberId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

providerSubscriptionSchema.index({ providerId: 1, subscriberId: 1 }, { unique: true });
providerSubscriptionSchema.index({ providerId: 1, isActive: 1 });
providerSubscriptionSchema.index({ subscriberId: 1, isActive: 1 });

export const ProviderSubscription = mongoose.model<IProviderSubscription>(
  'ProviderSubscription',
  providerSubscriptionSchema,
);

export default ProviderSubscription;
