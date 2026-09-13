import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IEntryLog {
  action: 'entered' | 'exited' | 're_entered';
  timestamp: Date;
  guardId?: mongoose.Types.ObjectId;
  guardName?: string;
  method: 'qr_scan' | 'manual';
}

export interface ITicket extends Document {
  orderId?: mongoose.Types.ObjectId;
  ticketIndex?: number;
  partyId: mongoose.Types.ObjectId;
  tierId: string;
  tierName?: string;
  buyerId: mongoose.Types.ObjectId;
  buyerName?: string;
  ticketCode: string;
  priceNaira: number;
  platformFeeNaira: number;
  organizerNaira: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  paymentRef?: string;
  paidAt?: Date;
  entryStatus: 'not_entered' | 'inside' | 'outside';
  entryLog: IEntryLog[];
  entryCount: number;
  isValid: boolean;
  invalidReason?: string;
  isTransferable: boolean;
  qrCodeUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const generateTicketCode = (): string => {
  const suffix = crypto.randomBytes(8).toString('base64url').slice(0, 10).toUpperCase();
  return `ZPP-${suffix}`;
};

const TicketSchema = new Schema<ITicket>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'TicketOrder' },
    ticketIndex: { type: Number },
    partyId: { type: Schema.Types.ObjectId, required: true, ref: 'Party' },
    tierId: { type: String, required: true },
    tierName: { type: String },
    buyerId: { type: Schema.Types.ObjectId, required: true, ref: 'AdultUser' },
    buyerName: { type: String },
    ticketCode: { type: String, unique: true, required: true },
    priceNaira: { type: Number, required: true },
    platformFeeNaira: { type: Number, required: true },
    organizerNaira: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    paymentRef: { type: String },
    paidAt: { type: Date },
    entryStatus: {
      type: String,
      enum: ['not_entered', 'inside', 'outside'],
      default: 'not_entered',
    },
    entryLog: [
      {
        action: {
          type: String,
          enum: ['entered', 'exited', 're_entered'],
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
        guardId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
        guardName: { type: String, default: 'Security' },
        method: { type: String, enum: ['qr_scan', 'manual'], default: 'qr_scan' },
      },
    ],
    entryCount: { type: Number, default: 0 },
    isValid: { type: Boolean, default: true },
    invalidReason: { type: String },
    isTransferable: { type: Boolean, default: false },
    qrCodeUrl: { type: String },
  },
  {
    collection: 'tickets',
    timestamps: true,
  }
);

TicketSchema.index({ partyId: 1, entryStatus: 1 });
TicketSchema.index({ buyerId: 1, createdAt: -1 });
TicketSchema.index({ ticketCode: 1 });
TicketSchema.index({ orderId: 1, ticketIndex: 1 }, { unique: true, sparse: true });

TicketSchema.pre('validate', function (next) {
  if (this.isNew) this.ticketCode = generateTicketCode();
  next();
});

// Check-in dashboard status counters must use the same validity predicate as its
// total count. Restrict this middleware to status-count queries so unrelated
// Ticket.countDocuments calls keep their original semantics.
TicketSchema.pre('countDocuments', function () {
  const query = this.getQuery() as any;
  if (query.partyId && query.entryStatus) {
    query.paymentStatus = 'paid';
    query.isValid = true;
  }
});

export const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);
export default Ticket;
