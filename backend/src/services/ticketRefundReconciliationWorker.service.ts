import TicketOrder from '../models/TicketOrder';
import { reconcilePendingTicketRefunds } from '../controllers/ticket.controller';

let workerInterval: NodeJS.Timeout | null = null;

export const runTicketRefundReconciliation = async (): Promise<number> => {
  const now = new Date();

  // A crashed worker can leave an order in refund_processing after its lease expires.
  // Put it back into the durable queue so the next reconciliation pass can claim it.
  await TicketOrder.updateMany(
    {
      paymentProvider: 'paystack',
      status: 'refund_processing',
      fulfillmentLeaseExpiresAt: { $lte: now },
    },
    {
      $set: {
        status: 'refund_pending',
        nextRefundAttemptAt: now,
        updatedAt: now,
      },
      $unset: {
        fulfillmentToken: 1,
        fulfillmentLeaseExpiresAt: 1,
      },
    }
  );

  // These states mean the provider refund is already known/accepted but the local
  // accounting finalization may not have completed. Requeue them so the existing
  // fenced reconciler can finish the accounting side effects idempotently.
  await TicketOrder.updateMany(
    {
      paymentProvider: 'paystack',
      status: { $in: ['provider_refunded', 'accounting_pending'] },
      $or: [
        { nextRefundAttemptAt: { $exists: false } },
        { nextRefundAttemptAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'refund_pending',
        nextRefundAttemptAt: now,
        updatedAt: now,
      },
      $unset: {
        fulfillmentToken: 1,
        fulfillmentLeaseExpiresAt: 1,
      },
    }
  );

  return reconcilePendingTicketRefunds();
};

export const startHardenedTicketRefundReconciliationWorker = (intervalMs = 60_000): NodeJS.Timeout => {
  if (workerInterval) return workerInterval;

  void runTicketRefundReconciliation().catch((error) => {
    console.error('[Ticket Refund Worker] Initial reconciliation failed:', error);
  });

  workerInterval = setInterval(() => {
    void runTicketRefundReconciliation().catch((error) => {
      console.error('[Ticket Refund Worker] Reconciliation failed:', error);
    });
  }, intervalMs);

  workerInterval.unref();
  return workerInterval;
};
