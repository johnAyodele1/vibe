import mongoose, { Schema } from 'mongoose';
import { IProviderEarnings } from '../types/adultModels';

const providerEarningsSchema = new Schema<IProviderEarnings>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    period: {
      type: String,
      required: true,
    },
    totalTipsCredits: {
      type: Number,
      default: 0,
    },
    totalPrivateShowCredits: {
      type: Number,
      default: 0,
    },
    totalCreditsEarned: {
      type: Number,
      default: 0,
    },
    platformFeePercent: {
      type: Number,
      required: true,
    },
    netCreditsAfterFee: {
      type: Number,
      default: 0,
    },
    usdEquivalent: {
      type: Number,
      default: 0,
    },
    payoutStatus: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'paid', 'failed'],
      default: 'pending',
    },
    payoutMethod: {
      type: String,
      required: true,
      enum: ['bank', 'crypto', 'check'],
      default: 'bank',
    },
    payoutReference: String,
    paidAt: Date,
  },
  {
    timestamps: true,
  }
);

export const ProviderEarnings = mongoose.model<IProviderEarnings>('ProviderEarnings', providerEarningsSchema);
export default ProviderEarnings;
