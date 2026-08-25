import { Request, Response } from 'express';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import CustomerRefund from '../models/CustomerRefund';
import PlatformEarning from '../models/PlatformEarning';
import { PROVIDER_EARNING_TYPES, REVERT_TYPES } from '../shared/earnings';
import { getDiamondNairaRate } from '../shared/pricing';

const ACTIVE_PAYOUT_STATUSES = ['pending', 'queued', 'verifying', 'processing'];
const PROVIDER_ACCOUNTING_STATUSES = ['completed', 'reverted'];

export const getAccountingSummary = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const rate = await getDiamondNairaRate();

    const [platformFees, payoutRequests, providerEarnings, reversions, refunds, purchases] = await Promise.all([
      // PlatformEarning is the platform ledger. Normal earnings are positive entries;
      // reversions are recorded as negative entries by the dispute resolver. Therefore
      // the signed sum is already the current/net platform earning balance.
      PlatformEarning.aggregate([
        {
          $group: {
            _id: null,
            gross: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            grossNaira: { $sum: { $cond: [{ $gt: ['$amount', 0] }, { $ifNull: ['$nairaValue', 0] }, 0] } },
            reverted: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
            revertedNaira: {
              $sum: {
                $cond: [{ $lt: ['$amount', 0] }, { $abs: { $ifNull: ['$nairaValue', 0] } }, 0],
              },
            },
            net: { $sum: '$amount' },
            netNaira: { $sum: { $ifNull: ['$nairaValue', 0] } },
          },
        },
      ]),
      PayoutRequest.aggregate([
        {
          $group: {
            _id: null,
            pending: { $sum: { $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, '$amount', 0] } },
            pendingNaira: { $sum: { $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, { $ifNull: ['$amountNaira', 0] }, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
            completedNaira: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$amountNaira', 0] }, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0] } },
            rejectedNaira: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, { $ifNull: ['$amountNaira', 0] }, 0] } },
            pendingCount: { $sum: { $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, 1, 0] } },
          },
        },
      ]),
      // Keep completed and reverted provider earning transactions so the admin view
      // can distinguish the original 85% earning from the amount that was later reversed.
      CreditTransaction.aggregate([
        { $match: { type: { $in: PROVIDER_EARNING_TYPES }, status: { $in: PROVIDER_ACCOUNTING_STATUSES } } },
        {
          $group: {
            _id: null,
            gross: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
            grossNaira: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $abs: { $ifNull: ['$nairaAmount', 0] } }, 0] } },
            reverted: { $sum: { $cond: [{ $eq: ['$status', 'reverted'] }, { $abs: '$amount' }, 0] } },
            revertedNaira: { $sum: { $cond: [{ $eq: ['$status', 'reverted'] }, { $abs: { $ifNull: ['$nairaAmount', 0] } }, 0] } },
            net: { $sum: '$amount' },
            netNaira: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$nairaAmount', 0] }, { $multiply: [{ $ifNull: ['$nairaAmount', 0] }, -1] }] } },
            platformFee: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$platformFee', 0] }, 0] } },
            paidOut: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $eq: ['$paidOut', true] }] }, '$amount', 0] } },
          },
        },
      ]),
      CreditTransaction.aggregate([
        { $match: { type: { $in: REVERT_TYPES }, status: 'completed' } },
        {
          $group: {
            _id: null,
            total: { $sum: { $abs: '$amount' } },
            totalNaira: { $sum: { $abs: { $ifNull: ['$nairaAmount', 0] } } },
          },
        },
      ]),
      CustomerRefund.aggregate([
        { $match: { status: 'REFUND_COMPLETED' } },
        {
          $lookup: {
            from: 'credittransactions',
            localField: 'originalTxId',
            foreignField: '_id',
            as: 'originalTransaction',
          },
        },
        { $unwind: { path: '$originalTransaction', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            customerRefunded: { $sum: '$amount' },
            providerReverted: { $sum: '$providerAmountReverted' },
            platformFeeReverted: { $sum: '$platformFeeReverted' },
            customerRefundedNaira: {
              $sum: {
                $cond: [
                  { $gt: [{ $ifNull: ['$originalTransaction.amount', 0] }, 0] },
                  { $multiply: [{ $divide: [{ $ifNull: ['$amount', 0] }, '$originalTransaction.amount'] }, { $abs: { $ifNull: ['$originalTransaction.nairaAmount', 0] } }] },
                  0,
                ],
              },
            },
            providerRevertedNaira: {
              $sum: {
                $cond: [
                  { $gt: [{ $ifNull: ['$originalTransaction.amount', 0] }, 0] },
                  { $multiply: [{ $divide: [{ $ifNull: ['$providerAmountReverted', 0] }, '$originalTransaction.amount'] }, { $abs: { $ifNull: ['$originalTransaction.nairaAmount', 0] } }] },
                  0,
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      CreditTransaction.aggregate([
        { $match: { type: { $in: ['purchase', 'credit_purchase'] }, status: 'completed' } },
        {
          $group: {
            _id: null,
            credits: { $sum: { $abs: '$amount' } },
            naira: { $sum: { $abs: '$nairaAmount' } },
          },
        },
      ]),
    ]);

    const feeData = platformFees[0] || { gross: 0, grossNaira: 0, reverted: 0, revertedNaira: 0, net: 0, netNaira: 0 };
    const payoutData = payoutRequests[0] || { pending: 0, pendingNaira: 0, completed: 0, completedNaira: 0, rejected: 0, rejectedNaira: 0, pendingCount: 0 };
    const providerData = providerEarnings[0] || { gross: 0, grossNaira: 0, reverted: 0, revertedNaira: 0, net: 0, netNaira: 0, platformFee: 0, paidOut: 0 };
    const reversalData = reversions[0] || { total: 0, totalNaira: 0 };
    const refundData = refunds[0] || { customerRefunded: 0, customerRefundedNaira: 0, providerReverted: 0, providerRevertedNaira: 0, platformFeeReverted: 0, count: 0 };
    const purchaseData = purchases[0] || { credits: 0, naira: 0 };

    return res.json({
      success: true,
      rate,
      accounting: {
        // PlatformEarning is already a signed ledger. Do not subtract the refund
        // record a second time from the ledger balance.
        grossPlatformFees: feeData.gross || 0,
        grossPlatformFeesNaira: feeData.grossNaira || 0,
        revertedPlatformFees: feeData.reverted || 0,
        revertedPlatformFeesNaira: feeData.revertedNaira || 0,
        netPlatformFees: feeData.net || 0,
        netPlatformFeesNaira: feeData.netNaira || 0,
        pendingPayouts: payoutData.pending || 0,
        pendingPayoutsNaira: payoutData.pendingNaira || 0,
        pendingPayoutCount: payoutData.pendingCount || 0,
        completedPayouts: payoutData.completed || 0,
        completedPayoutsNaira: payoutData.completedNaira || 0,
        rejectedPayouts: payoutData.rejected || 0,
        rejectedPayoutsNaira: payoutData.rejectedNaira || 0,
        providerEarnings: providerData.net || 0,
        providerEarningsNaira: providerData.netNaira || 0,
        grossProviderEarnings: providerData.gross || 0,
        grossProviderEarningsNaira: providerData.grossNaira || 0,
        providerAmountReverted: providerData.reverted || 0,
        providerAmountRevertedNaira: providerData.revertedNaira || 0,
        providerPaidOutFromTransactions: providerData.paidOut || 0,
        monetizedSpend: (providerData.gross || 0) + (providerData.platformFee || 0),
        monetizedSpendNaira: (providerData.grossNaira || 0) + (providerData.platformFee || 0) * rate,
        expectedPlatformFeeRate: 0.15,
        totalReversions: reversalData.total || 0,
        totalReversionsNaira: reversalData.totalNaira || 0,
        customerRefunded: refundData.customerRefunded || 0,
        customerRefundedNaira: refundData.customerRefundedNaira || 0,
        providerReverted: refundData.providerReverted || 0,
        providerRevertedNaira: refundData.providerRevertedNaira || 0,
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
