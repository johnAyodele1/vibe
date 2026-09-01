import mongoose, { Schema } from 'mongoose';
import { ICreditTransaction } from '../types/adultModels';

const creditTransactionSchema = new Schema<ICreditTransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'purchase',
        'spend',
        'refund',
        'tip_sent',
        'tip_received',
        'cam_tip',
        'payout',
        'bonus',
        'tip',
        'subscription',
        'reward',
        'call_charge',
        'call_earning',
        'service_payment_received',
        'service_payment_sent',
        'paid_media_unlock',
        'spin_wheel',
        'call_refund',
        'credit_purchase',
        'ticket_purchase'
      ],
    },
    amount: {
      type: Number,
      required: true,
    },
    usdAmount: {
      type: Number,
      required: true,
    },
    nairaAmount: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      required: true,
    },
    relatedUserId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    paymentProvider: {
      type: String,
      enum: ['stripe', 'apple', 'google', 'crypto', 'paystack'],
    },
    paymentIntentId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded', 'reverted'],
      default: 'pending',
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    eligibleForPayout: {
      type: Boolean,
      default: true,
    },
    paidOut: {
      type: Boolean,
      default: false,
    },
    inPayoutRequest: {
      type: Schema.Types.ObjectId,
      ref: 'PayoutRequest',
    },
    inDispute: {
      type: Boolean,
      default: false,
    },
    disputeReason: {
      type: String,
    },
    disputeResolvedAt: {
      type: Date,
    },
    disputeResolution: {
      type: String,
      enum: ['upheld', 'dismissed'],
    },
    disputeResolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    originalTxId: {
      type: Schema.Types.ObjectId,
      ref: 'CreditTransaction',
    },
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound unique indexes to enforce database-level duplicate billing and refund protection
creditTransactionSchema.index(
  { 'metadata.callId': 1, 'metadata.minuteIndex': 1, userId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      'metadata.callId': { $exists: true },
      'metadata.minuteIndex': { $exists: true },
    },
  }
);

creditTransactionSchema.index(
  { 'metadata.callId': 1, userId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      'metadata.callId': { $exists: true },
      type: 'call_refund',
    },
  }
);

export const CreditTransaction = mongoose.model<ICreditTransaction>('CreditTransaction', creditTransactionSchema);
export default CreditTransaction;
