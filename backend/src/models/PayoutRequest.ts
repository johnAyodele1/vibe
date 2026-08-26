import mongoose, { Schema, Document } from 'mongoose';

export interface IPayoutRequest extends Document {
  providerId: mongoose.Types.ObjectId;
  providerName: string;
  amount: number;
  amountNaira: number;
  nairaRateSnapshot: number;
  status: 'pending' | 'queued' | 'verifying' | 'processing' | 'completed' | 'rejected';
  queuePosition?: number;
  payoutMethod: string;
  payoutDetails: {
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    sortCode?: string;
    accountType?: string;
    paypalEmail?: string;
    cryptoCurrency?: string;
    cryptoAddress?: string;
  };
  adminNotes?: string;
  processedBy?: mongoose.Types.ObjectId;
  rejectedReason?: string;
  requestedAt: Date;
  queuedAt?: Date;
  verifyingAt?: Date;
  processingAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  eligibleTransactionIds: mongoose.Types.ObjectId[];
  adminReference?: string;
}

const payoutRequestSchema = new Schema<IPayoutRequest>({
  providerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
  providerName: { type: String, required: true },
  amount: { type: Number, required: true },
  amountNaira: { type: Number, required: true },
  nairaRateSnapshot: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'queued', 'verifying', 'processing', 'completed', 'rejected'],
    default: 'queued',
    index: true,
  },
  queuePosition: { type: Number },
  payoutMethod: { type: String, required: true },
  payoutDetails: {
    bankName: { type: String },
    accountHolder: { type: String },
    accountNumber: { type: String },
    sortCode: { type: String },
    accountType: { type: String },
    paypalEmail: { type: String },
    cryptoCurrency: { type: String },
    cryptoAddress: { type: String },
  },
  adminNotes: { type: String },
  processedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
  rejectedReason: { type: String },
  requestedAt: { type: Date, default: Date.now },
  queuedAt: { type: Date },
  verifyingAt: { type: Date },
  processingAt: { type: Date },
  completedAt: { type: Date },
  rejectedAt: { type: Date },
  eligibleTransactionIds: [{ type: Schema.Types.ObjectId, ref: 'CreditTransaction' }],
  adminReference: { type: String },
});

payoutRequestSchema.index(
  { providerId: 1 },
  {
    name: 'unique_active_payout_per_provider',
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'queued', 'verifying', 'processing'] } },
  }
);

export const PayoutRequest = mongoose.model<IPayoutRequest>('PayoutRequest', payoutRequestSchema);
export default PayoutRequest;
