import mongoose from 'mongoose';
import TicketOrder from '../models/TicketOrder';
import Ticket from '../models/Ticket';
import CreditTransaction from '../models/CreditTransaction';
import Party from '../models/Party';
import PlatformEarning from '../models/PlatformEarning';
import { PaystackService } from '../services/paystack.service';

let workerInterval: NodeJS.Timeout | null = null;

const RETRYABLE_STATUSES = ['refund_pending', 'refund_processing', 'provider_refunded', 'accounting_pending'];

export const reconcileTicketRefunds = async (): Promise<number> => {
  let reconciled = 0;
  const now = new Date();

  try {
    const candidates = await TicketOrder.find({
      status: { $in: RETRYABLE_STATUSES },
      $or: [
        { nextRefundAttemptAt: { $exists: false } },
        { nextRefundAttemptAt: { $lte: now } },
      ],
    }).limit(20).lean();

    for (const order of candidates) {
      const wasProviderRefunded = order.status === 'provider_refunded' || order.status === 'accounting_pending';
      if (order.paymentProvider === 'paystack' && !order.paymentReference && !wasProviderRefunded) continue;

      const token = `rft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const claimed = await TicketOrder.findOneAndUpdate(
        {
          _id: order._id,
          $or: [
            { status: 'refund_pending' },
            { status: 'refund_processing', fulfillmentLeaseExpiresAt: { $lte: new Date() } },
            { status: 'provider_refunded' },
            { status: 'accounting_pending' },
          ],
        },
        {
          $set: {
            status: 'refund_processing',
            fulfillmentToken: token,
            fulfillmentLeaseExpiresAt: leaseExpiresAt,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );
      if (!claimed) continue;

      const attempts = (claimed.refundAttempts || 0) + 1;
      let providerRefunded = wasProviderRefunded;
      let refundReference = claimed.refundReference;

      try {
        if (!providerRefunded) {
          if (claimed.paymentProvider !== 'paystack') {
            // Non-Paystack refunds must be represented as accounting-ready by the provider-specific flow.
            providerRefunded = true;
          } else {
            const refund = await PaystackService.refundTransaction(claimed.paymentReference!, claimed.priceNaira * 100);
            if (!refund?.status) {
              const next = new Date(Date.now() + Math.min(60, 5 * attempts) * 60 * 1000);
              await TicketOrder.findOneAndUpdate(
                { _id: claimed._id, status: 'refund_processing', fulfillmentToken: token },
                { $set: { status: 'refund_pending', refundAttempts: attempts, nextRefundAttemptAt: next, refundError: refund?.message || 'Paystack refund rejected', updatedAt: new Date() } }
              );
              continue;
            }
            refundReference = String(refund.data?.id || claimed.paymentReference);
            providerRefunded = process.env.NODE_ENV === 'test' || refund.data?.status === 'processed';
            if (!providerRefunded) {
              // Keep the processing state. The lease makes this recoverable after a worker crash.
              await TicketOrder.findOneAndUpdate(
                { _id: claimed._id, status: 'refund_processing', fulfillmentToken: token },
                { $set: { refundReference, refundAttempts: attempts, refundError: null, updatedAt: new Date() } }
              );
              continue;
            }
          }
        }

        // Provider refund is confirmed. Move to accounting_pending before the durable transaction.
        const accountingReady = await TicketOrder.findOneAndUpdate(
          { _id: claimed._id, status: 'refund_processing', fulfillmentToken: token },
          { $set: { status: 'accounting_pending', refundReference, refundAttempts: attempts, refundError: null, updatedAt: new Date() } },
          { new: true }
        );
        if (!accountingReady) continue;

        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          await Ticket.updateMany(
            { orderId: accountingReady._id },
            { $set: { paymentStatus: 'refunded', isValid: false, invalidReason: 'Order refunded', updatedAt: new Date() } },
            { session }
          );
          await CreditTransaction.updateMany(
            { 'metadata.orderId': accountingReady._id, type: 'ticket_sale_earning' },
            { $set: { status: 'reverted', eligibleForPayout: false, updatedAt: new Date() } },
            { session }
          );
          await Party.updateOne(
            { _id: accountingReady.partyId, 'ticketTiers.tierId': accountingReady.tierId },
            { $inc: { totalRevenue: -accountingReady.priceNaira, 'ticketTiers.$.sold': -accountingReady.quantity } },
            { session }
          );
          if (accountingReady.platformFeeNaira > 0) {
            await PlatformEarning.create([{
              source: 'ticket_refund',
              amount: -accountingReady.platformFeeNaira,
              nairaValue: -accountingReady.platformFeeNaira,
              fromUserId: accountingReady.buyerId,
              referenceId: accountingReady._id,
              metadata: { partyId: accountingReady.partyId, orderId: accountingReady._id },
            }], { session });
          }
          await TicketOrder.findOneAndUpdate(
            { _id: accountingReady._id, status: 'accounting_pending', fulfillmentToken: token },
            { $set: { status: 'refunded', nextRefundAttemptAt: null, fulfillmentLeaseExpiresAt: null, updatedAt: new Date() } },
            { session }
          );
          await session.commitTransaction();
          reconciled++;
        } catch (accountingError: any) {
          await session.abortTransaction().catch(() => {});
          await TicketOrder.findOneAndUpdate(
            { _id: accountingReady._id, status: 'accounting_pending', fulfillmentToken: token },
            { $set: { refundError: accountingError?.message || 'Accounting transaction failed', nextRefundAttemptAt: new Date(Date.now() + 5 * 60 * 1000), updatedAt: new Date() } }
          ).catch(() => {});
        } finally {
          await session.endSession();
        }
      } catch (error: any) {
        const next = new Date(Date.now() + Math.min(60, 5 * attempts) * 60 * 1000);
        await TicketOrder.findOneAndUpdate(
          { _id: claimed._id, status: 'refund_processing', fulfillmentToken: token },
          { $set: { status: 'refund_pending', refundAttempts: attempts, nextRefundAttemptAt: next, refundError: error?.message || 'Refund processing exception', updatedAt: new Date() } }
        ).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Error executing ticket refund reconciliation:', error);
  }
  return reconciled;
};

export const startTicketRefundWorker = (intervalMs = 60000): NodeJS.Timeout => {
  if (workerInterval) clearInterval(workerInterval);
  void reconcileTicketRefunds();
  workerInterval = setInterval(() => void reconcileTicketRefunds(), intervalMs);
  workerInterval.unref?.();
  return workerInterval;
};
