import mongoose, { Document, Schema } from 'mongoose';

export type PartyPayoutStatus = 'requested' | 'verifying' | 'processing' | 'paid' | 'rejected';

export interface IPartyPayoutRequest extends Document {
  partyId: mongoose.Types.ObjectId;
  organizerId: mongoose.Types.ObjectId;
  partyTitle: string;
  amountNaira: number;
  payoutDetails: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
  };
  status: PartyPayoutStatus;
  adminNotes?: string;
  adminReference?: string;
  requestedAt: Date;
  processedAt?: Date;
}

const partyPayoutRequestSchema = new Schema<IPartyPayoutRequest>(
  {
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    partyTitle: { type: String, required: true },
    amountNaira: { type: Number, required: true, min: 0 },
    payoutDetails: {
      bankName: { type: String, required: true, trim: true },
      accountHolder: { type: String, required: true, trim: true },
      accountNumber: { type: String, required: true, trim: true },
    },
    status: {
      type: String,
      enum: ['requested', 'verifying', 'processing', 'paid', 'rejected'],
      default: 'requested',
      index: true,
    },
    adminNotes: { type: String },
    adminReference: { type: String },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
  },
  { collection: 'party_payout_requests', timestamps: true }
);

partyPayoutRequestSchema.index({ partyId: 1 }, { unique: true });

export const PartyPayoutRequest = mongoose.model<IPartyPayoutRequest>('PartyPayoutRequest', partyPayoutRequestSchema);
export default PartyPayoutRequest;
