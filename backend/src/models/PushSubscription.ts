import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  deviceId: string;
  accountType?: string;
  zone?: 'adult' | 'dating' | 'both';
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform?: string;
  isStandalone?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
  failCount?: number;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId:      { type: Schema.Types.ObjectId, required: true, index: true },
    deviceId:    { type: String, required: true },
    accountType: { type: String },
    zone:        { type: String, enum: ['adult', 'dating', 'both'], default: 'adult' },
    endpoint:    { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    platform:    { type: String },
    isStandalone:{ type: Boolean },
    lastUsed:    { type: Date },
    failCount:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Compound index: one subscription per device per user
pushSubscriptionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
pushSubscriptionSchema.index({ endpoint: 1 });
pushSubscriptionSchema.index({ deviceId: 1 }); // for logout cleanup

export const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
export default PushSubscription;
