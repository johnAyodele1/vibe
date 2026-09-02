import mongoose, { Schema, Document } from 'mongoose';

export interface ITicketOrder extends Document {
  orderReference: string;
  idempotencyKey?: string;
  partyId: mongoose.Types.ObjectId;
  tierId: string;
  tierName?: string;
  buyerId: mongoose.Types.ObjectId;
  buyerName?: string;
  quantity: number;
  priceNaira: number;
  platformFeeNaira: number;
  organizerNaira: number;
  paymentProvider: 'paystack' | 'wallet' | 'simulated';
  paymentReference?: string;
  providerReference?: string;
  status: 'pending' | 'fulfilled' | 'failed' | 'refund_pending' | 'refunded';
  expiresAt: Date;
  fulfilledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TicketOrderSchema = new Schema<ITicketOrder>(
  {
    orderReference: { type: String, unique: true, required: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    partyId: { type: Schema.Types.ObjectId, required: true, ref: 'Party' },
    tierId: { type: String, required: true },
    tierName: { type: String },
    buyerId: { type: Schema.Types.ObjectId, required: true, ref: 'AdultUser' },
    buyerName: { type: String },
    quantity: { type: Number, required: true },
    priceNaira: { type: Number, required: true },
    platformFeeNaira: { type: Number, required: true },
    organizerNaira: { type: Number, required: true },
    paymentProvider: {
      type: String,
      enum: ['paystack', 'wallet', 'simulated'],
      default: 'paystack',
    },
    paymentReference: { type: String, unique: true, sparse: true },
    providerReference: { type: String },
    status: {
      type: String,
      enum: ['pending', 'fulfilled', 'failed', 'refund_pending', 'refunded'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 mins expiration
    },
    fulfilledAt: { type: Date },
  },
  {
    collection: 'ticket_orders',
    timestamps: true,
  }
);

TicketOrderSchema.index({ buyerId: 1, createdAt: -1 });
TicketOrderSchema.index({ partyId: 1, status: 1 });
TicketOrderSchema.index({ paymentProvider: 1, providerReference: 1 });

export const TicketOrder = mongoose.model<ITicketOrder>('TicketOrder', TicketOrderSchema);
export default TicketOrder;
