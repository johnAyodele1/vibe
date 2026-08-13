import mongoose, { Schema, Document, Types } from 'mongoose';

export type PushHealthStatus = 'unknown' | 'healthy' | 'unhealthy';
export type PushTestStatus = 'pending' | 'delivered' | 'failed' | 'expired';

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  deviceId: string;
  accountType?: string;
  zone?: 'adult' | 'dating' | 'both';
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
  platform?: string;
  isStandalone?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
  failCount?: number;
  notificationsEnabled?: boolean;
  notificationPermission?: string;
  lastSeenAt?: Date;
  lastVerifiedAt?: Date;
  lastSuccessfulPushAt?: Date;
  lastTestAt?: Date;
  lastTestId?: string;
  lastTestAckTokenHash?: string;
  lastTestStatus?: PushTestStatus;
  pushHealthStatus?: PushHealthStatus;
  isActive?: boolean;
  deactivatedAt?: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    deviceId: { type: String, required: true },
    accountType: { type: String },
    zone: { type: String, enum: ['adult', 'dating', 'both'], default: 'adult' },
    endpoint: { type: String, sparse: true },
    keys: {
      p256dh: { type: String },
      auth: { type: String },
    },
    platform: { type: String },
    isStandalone: { type: Boolean },
    lastUsed: { type: Date },
    failCount: { type: Number, default: 0 },
    notificationsEnabled: { type: Boolean, default: false },
    notificationPermission: { type: String, default: 'unknown' },
    lastSeenAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date },
    lastSuccessfulPushAt: { type: Date },
    lastTestAt: { type: Date },
    lastTestId: { type: String },
    lastTestAckTokenHash: { type: String },
    lastTestStatus: { type: String, enum: ['pending', 'delivered', 'failed', 'expired'] },
    pushHealthStatus: { type: String, enum: ['unknown', 'healthy', 'unhealthy'], default: 'unknown' },
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1, isActive: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true, sparse: true });
pushSubscriptionSchema.index({ deviceId: 1 });

export const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
export default PushSubscription;
