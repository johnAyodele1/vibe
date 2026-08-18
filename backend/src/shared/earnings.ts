import { Types } from 'mongoose';
import CreditTransaction from '../models/CreditTransaction';
import { getDiamondNairaRate } from './pricing';

export const PROVIDER_EARNING_TYPES = [
  'tip_received',
  'cam_tip',
  'tip',
  'call_earning',
  'service_payment_received',
  'gift_received',
  'paid_media_earning',
  'paid_media_unlock',
  'spin_earning',
  'spin_wheel',
];

export const REVERT_TYPES = [
  'call_refund',
  'dispute_refund',
  'refund',
  'chargeback',
  'reversion',
];

/**
 * Returns the start date (lower bound) for a given date range string.
 * Supports: 'Today', 'This Week', 'This Month', 'All Time'.
 */
export const getDateRangeBounds = (dateRange: string): Date | null => {
  const now = new Date();
  if (dateRange === 'Today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (dateRange === 'This Week') {
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    return startOfWeek;
  }
  if (dateRange === 'This Month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null; // 'All Time' or unconstrained
};

export interface ProviderEarningsSummary {
  totalEarned: number; // Net provider earnings
  platformFee: number; // Total platform fees
  grossEarned: number; // Gross earnings (net + platformFee)
}

export interface ProviderBalanceBreakdown {
  totalAccumulatedCredits: number;
  totalAccumulatedNaira: number;
  grossEarnedCredits: number;
  grossEarnedNaira: number;
  platformFeeCredits: number;
  platformFeeNaira: number;
  paidOutCredits: number;
  paidOutNaira: number;
  unsettledCredits: number;
  unsettledNaira: number;
  disputedCredits: number;
  disputedNaira: number;
  withdrawableCredits: number;
  withdrawableNaira: number;
  earningsToBeClaimedCredits: number;
  earningsToBeClaimedNaira: number;
  rate: number;
}

/**
 * Aggregates earnings for a provider from completed CreditTransactions matching PROVIDER_EARNING_TYPES.
 */
export const calculateProviderEarnings = async (
  userId: Types.ObjectId | string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<ProviderEarningsSummary> => {
  const query: any = {
    userId,
    type: { $in: PROVIDER_EARNING_TYPES },
    status: 'completed',
  };

  if (startDate) {
    query.createdAt = { $gte: startDate };
    if (endDate) {
      query.createdAt.$lte = endDate;
    }
  }

  const transactions = await CreditTransaction.find(query);

  let totalEarned = 0;
  let platformFee = 0;

  for (const tx of transactions) {
    totalEarned += tx.amount;
    platformFee += tx.platformFee || 0;
  }

  const grossEarned = totalEarned + platformFee;

  return {
    totalEarned,
    platformFee,
    grossEarned,
  };
};

/**
 * Calculates a unified, reconciled provider balance breakdown across all transaction states.
 * Single source of truth for Pending Clearance, Total Accumulated Balance, and Payout Eligibility.
 */
export const calculateProviderBalanceBreakdown = async (
  userId: Types.ObjectId | string
): Promise<ProviderBalanceBreakdown> => {
  const rate = await getDiamondNairaRate();

  // Fetch all transactions for the provider
  const transactions = await CreditTransaction.find({ userId });

  let grossEarnedCredits = 0;
  let platformFeeCredits = 0;
  let totalEarnedCredits = 0;
  let paidOutCredits = 0;
  let unsettledCredits = 0;
  let disputedCredits = 0;
  let withdrawableCredits = 0;
  let totalReversionCredits = 0;

  for (const tx of transactions) {
    const isEarningType = PROVIDER_EARNING_TYPES.includes(tx.type);
    const isRevertType = REVERT_TYPES.includes(tx.type) || tx.amount < 0;

    if (tx.status === 'completed' && isEarningType) {
      const netAmount = tx.amount;
      const fee = tx.platformFee || 0;

      grossEarnedCredits += netAmount + fee;
      platformFeeCredits += fee;
      totalEarnedCredits += netAmount;

      if (tx.paidOut === true) {
        // Already paid out (accounted for in payout transactions)
      } else if (tx.inDispute === true) {
        // Disputed payment
        disputedCredits += netAmount;
      } else if (tx.eligibleForPayout === false) {
        // Unsettled / unconfirmed payment
        unsettledCredits += netAmount;
      } else if (!tx.inPayoutRequest) {
        // Eligible for withdrawal
        withdrawableCredits += netAmount;
      }
    } else if (tx.type === 'payout' && tx.status === 'completed') {
      paidOutCredits += Math.abs(tx.amount);
    } else if (tx.status === 'completed' && isRevertType && tx.type !== 'payout') {
      // Reversion/refund reduces total earnings and withdrawable balance
      const revertAmt = Math.abs(tx.amount);
      totalReversionCredits += revertAmt;
      withdrawableCredits = Math.max(0, withdrawableCredits - revertAmt);
    }
  }

  // Net earnings after reversions
  const totalAccumulatedCredits = Math.max(0, totalEarnedCredits - totalReversionCredits - paidOutCredits);
  const earningsToBeClaimedCredits = totalAccumulatedCredits;

  return {
    totalAccumulatedCredits,
    totalAccumulatedNaira: totalAccumulatedCredits * rate,
    grossEarnedCredits,
    grossEarnedNaira: grossEarnedCredits * rate,
    platformFeeCredits,
    platformFeeNaira: platformFeeCredits * rate,
    paidOutCredits,
    paidOutNaira: paidOutCredits * rate,
    unsettledCredits,
    unsettledNaira: unsettledCredits * rate,
    disputedCredits,
    disputedNaira: disputedCredits * rate,
    withdrawableCredits,
    withdrawableNaira: withdrawableCredits * rate,
    earningsToBeClaimedCredits,
    earningsToBeClaimedNaira: earningsToBeClaimedCredits * rate,
    rate,
  };
};
