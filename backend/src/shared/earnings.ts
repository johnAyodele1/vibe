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
  displayedUnsettledCredits: number;
  displayedUnsettledNaira: number;
  withdrawableCredits: number;
  withdrawableNaira: number;
  earningsToBeClaimedCredits: number;
  earningsToBeClaimedNaira: number;
  rate: number;
}

/**
 * Aggregates earnings for a provider from completed CreditTransactions matching PROVIDER_EARNING_TYPES.
 * Performance: Aggregated on the MongoDB engine via $match and $group ($O(1)$ memory transfer).
 */
export const calculateProviderEarnings = async (
  userId: Types.ObjectId | string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<ProviderEarningsSummary> => {
  const matchQuery: any = {
    userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
    type: { $in: PROVIDER_EARNING_TYPES },
    status: 'completed',
  };

  if (startDate) {
    matchQuery.createdAt = { $gte: startDate };
    if (endDate) {
      matchQuery.createdAt.$lte = endDate;
    }
  }

  const aggregateResult = await CreditTransaction.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalEarned: { $sum: '$amount' },
        platformFee: { $sum: { $ifNull: ['$platformFee', 0] } },
      },
    },
  ]);

  const totalEarned = aggregateResult[0]?.totalEarned || 0;
  const platformFee = aggregateResult[0]?.platformFee || 0;
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
 * Performance: Uses MongoDB Aggregation Pipeline ($match & $group with $cond) to perform sum calculations
 * directly on the database engine, avoiding O(N) document memory instantiations in Node.js.
 *
 * Accounting Invariants:
 * 1. Total Accumulated Balance (lifetimeProviderEarnings) = grossEarned - platformFee (Payouts do NOT deduct from this).
 * 2. earningsToBeClaimed = lifetimeProviderEarnings - paidOut - reversions.
 * 3. earningsToBeClaimed = withdrawable + unsettled + disputed.
 */
export const calculateProviderBalanceBreakdown = async (
  userId: Types.ObjectId | string
): Promise<ProviderBalanceBreakdown> => {
  const rate = await getDiamondNairaRate();
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  // Aggregate financial metrics directly on database engine in O(1) response size
  const aggregateResult = await CreditTransaction.aggregate([
    { $match: { userId: userObjectId } },
    {
      $group: {
        _id: null,
        grossEarnedCredits: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'completed'] }, { $in: ['$type', PROVIDER_EARNING_TYPES] }] },
              { $add: ['$amount', { $ifNull: ['$platformFee', 0] }] },
              0,
            ],
          },
        },
        platformFeeCredits: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'completed'] }, { $in: ['$type', PROVIDER_EARNING_TYPES] }] },
              { $ifNull: ['$platformFee', 0] },
              0,
            ],
          },
        },
        lifetimeProviderEarnings: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'completed'] }, { $in: ['$type', PROVIDER_EARNING_TYPES] }] },
              '$amount',
              0,
            ],
          },
        },
        paidOutFromFlag: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$type', PROVIDER_EARNING_TYPES] },
                  { $eq: ['$paidOut', true] },
                ],
              },
              '$amount',
              0,
            ],
          },
        },
        disputedCredits: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$type', PROVIDER_EARNING_TYPES] },
                  { $ne: ['$paidOut', true] },
                  { $eq: ['$inDispute', true] },
                ],
              },
              '$amount',
              0,
            ],
          },
        },
        unsettledCredits: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$type', PROVIDER_EARNING_TYPES] },
                  { $ne: ['$paidOut', true] },
                  { $ne: ['$inDispute', true] },
                  {
                    $or: [
                      { $ne: ['$eligibleForPayout', true] },
                      {
                        $and: [
                          { $ne: ['$inPayoutRequest', null] },
                          { $ne: [{ $type: '$inPayoutRequest' }, 'missing'] },
                        ],
                      },
                    ],
                  },
                ],
              },
              '$amount',
              0,
            ],
          },
        },
        rawWithdrawableCredits: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$type', PROVIDER_EARNING_TYPES] },
                  { $ne: ['$paidOut', true] },
                  { $ne: ['$inDispute', true] },
                  { $eq: ['$eligibleForPayout', true] },
                  {
                    $or: [
                      { $eq: ['$inPayoutRequest', null] },
                      { $eq: [{ $type: '$inPayoutRequest' }, 'missing'] },
                    ],
                  },
                ],
              },
              '$amount',
              0,
            ],
          },
        },
        payoutTxCredits: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$type', 'payout'] }, { $eq: ['$status', 'completed'] }] },
              { $abs: '$amount' },
              0,
            ],
          },
        },
        totalReversionCredits: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$type', REVERT_TYPES] },
                  { $ne: ['$type', 'payout'] },
                ],
              },
              { $abs: '$amount' },
              0,
            ],
          },
        },
      },
    },
  ]);

  const stats = aggregateResult[0] || {
    grossEarnedCredits: 0,
    platformFeeCredits: 0,
    lifetimeProviderEarnings: 0,
    paidOutFromFlag: 0,
    disputedCredits: 0,
    unsettledCredits: 0,
    rawWithdrawableCredits: 0,
    payoutTxCredits: 0,
    totalReversionCredits: 0,
  };

  let {
    grossEarnedCredits,
    platformFeeCredits,
    lifetimeProviderEarnings,
    paidOutFromFlag,
    disputedCredits,
    unsettledCredits,
    rawWithdrawableCredits,
    payoutTxCredits,
    totalReversionCredits,
  } = stats;

  const paidOutCredits = Math.max(payoutTxCredits, paidOutFromFlag);
  const unflaggedPaidOut = Math.max(0, paidOutCredits - paidOutFromFlag);

  // 1. Unflagged payouts reduce raw withdrawable earnings only (payouts cannot draw from unsettled or disputed funds)
  let withdrawableCredits = Math.max(0, rawWithdrawableCredits - unflaggedPaidOut);

  // 2. Reversions (refunds/chargebacks) reduce withdrawable earnings first, then unsettled, then disputed
  let remainingReversion = totalReversionCredits;

  if (withdrawableCredits >= remainingReversion) {
    withdrawableCredits -= remainingReversion;
    remainingReversion = 0;
  } else {
    remainingReversion -= withdrawableCredits;
    withdrawableCredits = 0;

    if (unsettledCredits >= remainingReversion) {
      unsettledCredits -= remainingReversion;
      remainingReversion = 0;
    } else {
      remainingReversion -= unsettledCredits;
      unsettledCredits = 0;
      disputedCredits = Math.max(0, disputedCredits - remainingReversion);
    }
  }

  const earningsToBeClaimedCredits = withdrawableCredits + unsettledCredits + disputedCredits;
  const totalAccumulatedCredits = lifetimeProviderEarnings;

  // Requirement #1: displayedUnsettledPayment = normalUnsettledCredits + disputedCredits
  const displayedUnsettledCredits = unsettledCredits + disputedCredits;

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
    displayedUnsettledCredits,
    displayedUnsettledNaira: displayedUnsettledCredits * rate,
    withdrawableCredits,
    withdrawableNaira: withdrawableCredits * rate,
    earningsToBeClaimedCredits,
    earningsToBeClaimedNaira: earningsToBeClaimedCredits * rate,
    rate,
  };
};
