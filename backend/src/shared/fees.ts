import PlatformEarning from '../models/PlatformEarning';
import { getDiamondNairaRate } from './pricing';

export const PLATFORM_FEE_RATE = 0.15;
export const PROVIDER_RATE     = 1 - PLATFORM_FEE_RATE;  // 0.85

/**
 * Calculate how much the provider receives and how much the platform keeps
 * @param {number} totalAmount — total diamonds paid by the member
 * @returns {{ providerAmount, platformFee, totalAmount }}
 */
export const calculateFees = (totalAmount: number) => {
  const platformFee    = Math.round(totalAmount * PLATFORM_FEE_RATE);
  const providerAmount = totalAmount - platformFee;  // use subtraction to avoid rounding issues
  return {
    totalAmount,
    platformFee,
    providerAmount,
  };
};

/**
 * Record the platform fee earned in the ledger
 */
export const recordPlatformEarning = async (
  data: {
    source: 'tip' | 'gift' | 'call' | 'service' | 'paid_media' | 'spin_wheel';
    amount: number;
    fromUserId?: any;
    toProviderId?: any;
    referenceId?: any;
  },
  options?: { session?: any }
) => {
  try {
    const rate       = await getDiamondNairaRate();
    const nairaValue = data.amount * rate;

    const doc = new PlatformEarning({
      source: data.source,
      amount: data.amount,
      nairaValue,
      fromUserId: data.fromUserId,
      toProviderId: data.toProviderId,
      referenceId: data.referenceId,
    });

    if (options?.session) {
      await doc.save({ session: options.session });
    } else {
      await doc.save();
    }
  } catch (err) {
    console.error('recordPlatformEarning failed:', err);
  }
};
