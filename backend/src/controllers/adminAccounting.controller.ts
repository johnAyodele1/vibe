import { Request, Response } from 'express';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import CustomerRefund from '../models/CustomerRefund';
import PlatformEarning from '../models/PlatformEarning';
import { PROVIDER_EARNING_TYPES, REVERT_TYPES } from '../shared/earnings';
import { getDiamondNairaRate } from '../shared/pricing';

const ACTIVE_PAYOUT_STATUSES = ['pending', 'queued', 'verifying', 'processing'];

export const getAccountingSummary = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const rate = await getDiamondNairaRate();

    const [
      platformFees,
      payoutRequests,
      providerEarnings,
      reversions,
      refunds,
      purchases,
    ] = await Promise.all([
      PlatformEarning.aggregate([
        { $group: { _id: null, gross: { $sum: '$amount' }, grossNaira: { $sum: { $ifNull: ['$nairaValue', 0] } } } },
      ]),
      PayoutRequest.aggregate([
        {
          $group: {
            _id: null,
            pending: {
              $sum: {
                $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, '$amount', 0],
              },
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0],
              },
            },
            pendingCount: {
              $sum: {
                $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, 1, 0],
              },
            },
          },
        },
      ]),
      CreditTransaction.aggregate([
        {
          $match: {
            type: { $in: PROVIDER_EARNING_TYPES },
            status: 'completed',
          },
        },
        {
          $group: {
            _id: null,
            gross: { $sum: '$amount' },
            platformFee: { $sum: { $ifNull: ['$platformFee', 0] } },
            paidOut: {
              $sum: {
                $cond: [{ $eq: ['$paidOut', true] }, '$amount', 0],
              },
            },
          },
        },
      ]),
      CreditTransaction.aggregate([
        {
          $match: {
            type: { $in: REVERT_TYPES },
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CustomerRefund.aggregate([
        {
          $match: { status: 'REFUND_COMPLETED' },
        },
        {
          $group: {
            _id: null,
            customerRefunded: { $sum: '$amount' },
            providerReverted: { $sum: '$providerAmountReverted' },
            platformFeeReverted: { $sum: '$platformFeeReverted' },
            count: { $sum: 1 },
          },
        },
      ]),
      CreditTransaction.aggregate([
        { $match: { type: { $in: ['purchase', 'credit_purchase'] }, status: 'completed' } },
        { $group: { _id: null, credits: { $sum: { $abs: '$amount' } }, naira: { $sum: { $abs: '$nairaAmount' } } } },
      ]),
    ]);

    const feeData = platformFees[0] || { gross: 0, grossNaira: 0 };
    const payoutData = payoutRequests[0] || { pending: 0, completed: 0, rejected: 0, pendingCount: 0 };
    const providerData = providerEarnings[0] || { gross: 0, platformFee: 0, paidOut: 0 };
    const reversalData = reversions[0] || { total: 0 };
    const refundData = refunds[0] || { customerRefunded: 0, providerReverted: 0, platformFeeReverted: 0, count: 0 };
    const purchaseData = purchases[0] || { credits: 0, naira: 0 };

    const grossPlatformFees = feeData.gross || providerData.platformFee || 0;
    const revertedPlatformFees = refundData.platformFeeReverted || 0;
    const netPlatformFees = Math.max(0, grossPlatformFees - revertedPlatformFees);

    return res.json({
      success: true,
      rate,
      accounting: {
        grossPlatformFees,
        grossPlatformFeesNaira: grossPlatformFees * rate,
        revertedPlatformFees,
        revertedPlatformFeesNaira: revertedPlatformFees * rate,
        netPlatformFees,
        netPlatformFeesNaira: netPlatformFees * rate,
        pendingPayouts: payoutData.pending || 0,
        pendingPayoutsNaira: (payoutData.pending || 0) * rate,
        pendingPayoutCount: payoutData.pendingCount || 0,
        completedPayouts: payoutData.completed || 0,
        completedPayoutsNaira: (payoutData.completed || 0) * rate,
        rejectedPayouts: payoutData.rejected || 0,
        rejectedPayoutsNaira: (payoutData.rejected || 0) * rate,
        providerEarnings: providerData.gross || 0,
        providerEarningsNaira: (providerData.gross || 0) * rate,
        providerPaidOutFromTransactions: providerData.paidOut || 0,
        totalReversions: reversalData.total || 0,
        totalReversionsNaira: (reversalData.total || 0) * rate,
        customerRefunded: refundData.customerRefunded || 0,
        customerRefundedNaira: (refundData.customerRefunded || 0) * rate,
        providerReverted: refundData.providerReverted || 0,
        providerRevertedNaira: (refundData.providerReverted || 0) * rate,
        refundCount: refundData.count || 0,
        completedPurchaseCredits: purchaseData.credits || 0,
        completedPurchaseNaira: purchaseData.naira || 0,
      },
    });
  } catch (error: any) {
    console.error('getAccountingSummary error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
