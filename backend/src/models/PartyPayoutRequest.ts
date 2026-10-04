import mongoose, { Document, Schema } from 'mongoose';

export type PartyPayoutStatus = 'requested' | 'verifying' | 'processing' | 'paid' | 'rejected' | 'failed';

export interface IPartyPayoutRequest extends Document {
  organizerId: mongoose.Types.ObjectId;
  partyIds: mongoose.Types.ObjectId[];
  ticketOrderIds: mongoose.Types.ObjectId[];
  /** Legacy field retained so existing records can still be read safely. */
  partyId?: mongoose.Types.ObjectId;
  /** Legacy snapshot retained for existing records. */
  partyTitle?: string;
  amountNaira: number;
  payoutDetails: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
  };
  status: PartyPayoutStatus;
  isActive: boolean;
  adminNotes?: string;
  adminReference?: string;
  requestedAt: Date;
  verifiedAt?: Date;
  processingAt?: Date;
  processedAt?: Date;
  rejectedAt?: Date;
  failedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  processingBy?: mongoose.Types.ObjectId;
  processedBy?: mongoose.Types.ObjectId;
  rejectedBy?: mongoose.Types.ObjectId;
  failedBy?: mongoose.Types.ObjectId;
}

const partyPayoutRequestSchema = new Schema<IPartyPayoutRequest>(
  {
    organizerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    partyIds: [{ type: Schema.Types.ObjectId, ref: 'Party', required: true }],
    ticketOrderIds: [{ type: Schema.Types.ObjectId, ref: 'TicketOrder', required: true }],
    partyId: { type: Schema.Types.ObjectId, ref: 'Party' },
    partyTitle: { type: String, trim: true },
    amountNaira: { type: Number, required: true, min: 10000 },
    payoutDetails: {
      bankName: { type: String, required: true, trim: true },
      accountHolder: { type: String, required: true, trim: true },
      accountNumber: { type: String, required: true, trim: true },
    },
    status: {
      type: String,
      enum: ['requested', 'verifying', 'processing', 'paid', 'rejected', 'failed'],
      default: 'requested',
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    adminNotes: { type: String, trim: true },
    adminReference: { type: String, trim: true },
    requestedAt: { type: Date, default: Date.now, index: true },
    verifiedAt: { type: Date },
    processingAt: { type: Date },
    processedAt: { type: Date },
    rejectedAt: { type: Date },
    failedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    processingBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    failedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
  },
  { collection: 'party_payout_requests', timestamps: true }
);

partyPayoutRequestSchema.index(
  { organizerId: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'one_active_party_payout_per_organizer',
  }
);
partyPayoutRequestSchema.index({ status: 1, requestedAt: -1 });
partyPayoutRequestSchema.index({ organizerId: 1, requestedAt: -1 });

export const PartyPayoutRequest = mongoose.model<IPartyPayoutRequest>('PartyPayoutRequest', partyPayoutRequestSchema);
export default PartyPayoutRequest;
