import mongoose, { Schema, Document } from 'mongoose';
import Party from './Party';
import TicketBuyerReservation from './TicketBuyerReservation';

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
  status: 'pending' | 'processing' | 'fulfilled' | 'failed' | 'refund_pending' | 'refund_processing' | 'provider_refunded' | 'accounting_pending' | 'refunded';
  refundReference?: string;
  refundAttempts?: number;
  nextRefundAttemptAt?: Date;
  refundError?: string;
  refundLockToken?: string;
  refundLockExpiresAt?: Date;
  fulfillmentToken?: string;
  fulfillmentLeaseExpiresAt?: Date;
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
      enum: ['pending', 'processing', 'fulfilled', 'failed', 'refund_pending', 'refund_processing', 'provider_refunded', 'accounting_pending', 'refunded'],
      default: 'pending',
    },
    refundReference: { type: String },
    refundAttempts: { type: Number, default: 0 },
    nextRefundAttemptAt: { type: Date },
    refundError: { type: String },
    refundLockToken: { type: String },
    refundLockExpiresAt: { type: Date },
    fulfillmentToken: { type: String },
    fulfillmentLeaseExpiresAt: { type: Date },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
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
TicketOrderSchema.index({ paymentReference: 1, refundLockExpiresAt: 1 });

/**
 * The ticket controller changes an order to `fulfilled` with findOneAndUpdate.
 * A read-then-count in that controller is not sufficient because two concurrent
 * orders can both observe the same prior count. This hook reserves the buyer's
 * quantity with a single conditional MongoDB update inside the caller's session.
 *
 * When a reservation is first created, seed it from already-fulfilled orders so
 * orders that existed before this feature was deployed still count toward the
 * per-person limit. Concurrent first-time reservations are allowed to race on
 * the unique key; a duplicate-key loser re-reads the reservation created by the
 * winner and continues with the same conditional update instead of failing the
 * ticket purchase.
 */
TicketOrderSchema.pre('findOneAndUpdate', function (next) {
  const queryMiddleware = this;

  void (async () => {
    const update = queryMiddleware.getUpdate() as any;
    const nextStatus = update?.$set?.status;
    if (!nextStatus || !['fulfilled', 'refunded'].includes(nextStatus)) return;

    const session = queryMiddleware.getOptions().session;
    const current = await queryMiddleware.model
      .findOne(queryMiddleware.getQuery())
      .session(session || null)
      .lean<ITicketOrder>();

    if (!current || current.status === nextStatus) return;

    if (nextStatus === 'fulfilled') {
      const party = await Party.findById(current.partyId).session(session || null).lean();
      const tier = party?.ticketTiers?.find((candidate: any) => candidate.tierId === current.tierId);
      if (!tier) throw new Error('Ticket tier not found while reserving buyer ticket limit');

      const reservationKey = {
        partyId: current.partyId,
        tierId: current.tierId,
        buyerId: current.buyerId,
      };

      const existingReservation = await TicketBuyerReservation.findOne(reservationKey)
        .session(session || null)
        .lean();

      if (!existingReservation) {
        const existingFulfilled = await queryMiddleware.model.aggregate([
          {
            $match: {
              partyId: current.partyId,
              tierId: current.tierId,
              buyerId: current.buyerId,
              status: 'fulfilled',
              _id: { $ne: current._id },
            },
          },
          {
            $group: {
              _id: null,
              reservedQuantity: { $sum: '$quantity' },
              orderIds: { $push: '$_id' },
            },
          },
        ]).session(session || null);

        const seededQuantity = existingFulfilled[0]?.reservedQuantity || 0;
        const seededOrderIds = existingFulfilled[0]?.orderIds || [];

        try {
          await TicketBuyerReservation.updateOne(
            reservationKey,
            {
              $setOnInsert: {
                ...reservationKey,
                reservedQuantity: seededQuantity,
                orderIds: seededOrderIds,
              },
            },
            { upsert: true, session }
          );
        } catch (error: any) {
          // Another concurrent fulfillment may have inserted the unique
          // reservation between our read and upsert. That is not a business
          // failure; continue and let the conditional increment below decide
          // whether this order fits within the per-person limit.
          if (error?.code !== 11000) throw error;
        }
      }

      const result = await TicketBuyerReservation.updateOne(
        {
          ...reservationKey,
          orderIds: { $ne: current._id },
          $expr: {
            $lte: [
              { $add: ['$reservedQuantity', current.quantity] },
              tier.perPersonLimit,
            ],
          },
        },
        {
          $inc: { reservedQuantity: current.quantity },
          $addToSet: { orderIds: current._id },
        },
        { session }
      );

      if (result.modifiedCount !== 1) {
        throw new Error(`Maximum ${tier.perPersonLimit} tickets per person for this tier`);
      }
      return;
    }

    await TicketBuyerReservation.updateOne(
      {
        partyId: current.partyId,
        tierId: current.tierId,
        buyerId: current.buyerId,
        orderIds: current._id,
      },
      {
        $inc: { reservedQuantity: -current.quantity },
        $pull: { orderIds: current._id },
      },
      { session }
    );
  })()
    .then(() => next())
    .catch((error) => next(error as Error));
});

export const TicketOrder = mongoose.model<ITicketOrder>('TicketOrder', TicketOrderSchema);
export default TicketOrder;
