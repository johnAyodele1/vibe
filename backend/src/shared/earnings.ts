import { Types } from 'mongoose';
import CreditTransaction from '../models/CreditTransaction';

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
