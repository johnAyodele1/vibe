import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  accountType: 'member' | 'service_provider';
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    accountType: { type: String, required: true, enum: ['member', 'service_provider'] },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    lastUsed: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate subscription endpoints for a user
pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
export default PushSubscription;
