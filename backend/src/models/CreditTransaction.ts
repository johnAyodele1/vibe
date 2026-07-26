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
        'reward'
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
      enum: ['stripe', 'apple', 'google', 'crypto'],
    },
    paymentIntentId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const CreditTransaction = mongoose.model<ICreditTransaction>('CreditTransaction', creditTransactionSchema);
export default CreditTransaction;
