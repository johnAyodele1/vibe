import { Request, Response } from 'express';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import CustomerRefund from '../models/CustomerRefund';
import PlatformEarning from '../models/PlatformEarning';
import { PROVIDER_EARNING_TYPES, REVERT_TYPES } from '../shared/earnings';
import { getDiamondNairaRate } from '../shared/pricing';

const ACTIVE_PAYOUT_STATUSES = ['pending', 'queued', 'verifying', 'processing'];
const PROVIDER_ACCOUNTING_STATUSES = ['completed', 'reverted'];
const CREDIT_PURCHASE_TYPES = ['purchase', 'credit_purchase'];

export const getAccountingSummary = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const rate = await getDiamondNairaRate();

    const [platformFees, platformSpendAndExpected, payoutRequests, providerEarnings, reversions, refunds, purchases] = await Promise.all([
      // 1. Platform Earning ledger
      PlatformEarning.aggregate([
        {
          $group: {
            _id: null,
            gross: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            grossNaira: { $sum: { $cond: [{ $gt: ['$amount', 0] }, { $ifNull: ['$nairaValue', 0] }, 0] } },
            reverted: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
            revertedNaira: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: { $ifNull: ['$nairaValue', 0] } }, 0] } },
            net: { $sum: '$amount' },
            netNaira: { $sum: { $ifNull: ['$nairaValue', 0] } },
          },
        },
      ]),

      // 2. Underlying completed provider transactions -> Money Spent on Platform & Expected Platform Fees
      CreditTransaction.aggregate([
        { $match: { type: { $in: PROVIDER_EARNING_TYPES }, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalProviderAmount: { $sum: '$amount' },
            totalExpectedPlatformFee: { $sum: { $ifNull: ['$platformFee', 0] } },
            totalMoneySpentOnPlatform: {
              $sum: { $add: ['$amount', { $ifNull: ['$platformFee', 0] }] },
            },
            totalMoneySpentOnPlatformNaira: {
              $sum: {
                $cond: [
                  { $gt: [{ $ifNull: ['$nairaAmount', 0] }, 0] },
                  {
                    $add: [
                      { $abs: '$nairaAmount' },
                      {
                        $cond: [
                          { $gt: ['$amount', 0] },
                          { $multiply: [{ $divide: [{ $ifNull: ['$platformFee', 0] }, '$amount'] }, { $abs: '$nairaAmount' }] },
                          0,
                        ],
                      },
                    ],
                  },
                  { $multiply: [{ $add: ['$amount', { $ifNull: ['$platformFee', 0] }] }, rate] },
                ],
              },
            },
            expectedPlatformFeesNaira: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: [{ $ifNull: ['$nairaAmount', 0] }, 0] }, { $gt: ['$amount', 0] }] },
                  { $multiply: [{ $divide: [{ $ifNull: ['$platformFee', 0] }, '$amount'] }, { $abs: '$nairaAmount' }] },
                  { $multiply: [{ $ifNull: ['$platformFee', 0] }, rate] },
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),

      // 3. Payout Requests
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

      // 4. Provider Earnings
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

      // 5. Reversions
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

      // 6. Customer Refunds
      CustomerRefund.aggregate([
        { $match: { status: 'REFUND_COMPLETED' } },
        {
          $lookup: {
            from: 'credittransactions',
            let: { origTxId: '$originalTxId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$origTxId'] } } },
              // Optimization (⚡ Bolt): Project only fields required for Naira calculation to reduce BSON memory transfer.
              { $project: { _id: 1, amount: 1, nairaAmount: 1 } },
            ],
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

      // 7. Credit Purchases
      CreditTransaction.aggregate([
        { $match: { type: { $in: CREDIT_PURCHASE_TYPES }, status: 'completed' } },
        {
          $group: {
            _id: null,
            credits: { $sum: { $abs: '$amount' } },
            naira: { $sum: { $abs: { $ifNull: ['$nairaAmount', 0] } } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const feeData = platformFees[0] || { gross: 0, grossNaira: 0, reverted: 0, revertedNaira: 0, net: 0, netNaira: 0 };
    const spendData = platformSpendAndExpected[0] || { totalProviderAmount: 0, totalExpectedPlatformFee: 0, totalMoneySpentOnPlatform: 0, totalMoneySpentOnPlatformNaira: 0, expectedPlatformFeesNaira: 0, count: 0 };
    const payoutData = payoutRequests[0] || { pending: 0, pendingNaira: 0, completed: 0, completedNaira: 0, rejected: 0, rejectedNaira: 0, pendingCount: 0 };
    const providerData = providerEarnings[0] || { gross: 0, grossNaira: 0, reverted: 0, revertedNaira: 0, net: 0, netNaira: 0, platformFee: 0, paidOut: 0 };
    const reversalData = reversions[0] || { total: 0, totalNaira: 0 };
    const refundData = refunds[0] || { customerRefunded: 0, customerRefundedNaira: 0, providerReverted: 0, providerRevertedNaira: 0, platformFeeReverted: 0, count: 0 };
    const purchaseData = purchases[0] || { credits: 0, naira: 0, count: 0 };

    // Money Spent on Platform
    const totalMoneySpentOnPlatform = spendData.totalMoneySpentOnPlatform || 0;
    const totalMoneySpentOnPlatformNaira = Math.round(spendData.totalMoneySpentOnPlatformNaira || 0);

    // Platform Fee Reconciliation
    const expectedPlatformFees = spendData.totalExpectedPlatformFee || 0;
    const expectedPlatformFeesNaira = Math.round(spendData.expectedPlatformFeesNaira || 0);
    const recordedGrossPlatformFees = feeData.gross || 0;
    const recordedGrossPlatformFeesNaira = Math.round(feeData.grossNaira || 0);
    const revertedPlatformFees = feeData.reverted || 0;
    const revertedPlatformFeesNaira = Math.round(feeData.revertedNaira || 0);
    const currentPlatformEarnings = feeData.net || 0; // Recorded Gross - Reverted
    const currentPlatformEarningsNaira = Math.round(feeData.netNaira || 0);
    const reconciliationDifference = recordedGrossPlatformFees - expectedPlatformFees;
    const reconciliationDifferenceNaira = Math.round(recordedGrossPlatformFeesNaira - expectedPlatformFeesNaira);

    return res.json({
      success: true,
      rate,
      accounting: {
        // Money Movement
        totalMoneySpentOnPlatform,
        totalMoneySpentOnPlatformNaira,
        completedPurchaseCredits: purchaseData.credits || 0,
        completedPurchaseNaira: Math.round(purchaseData.naira || 0),
        completedPurchaseCount: purchaseData.count || 0,
        providerTransactionVolume: totalMoneySpentOnPlatform,
        providerTransactionVolumeNaira: totalMoneySpentOnPlatformNaira,

        // Platform Fee Reconciliation
        expectedPlatformFees,
        expectedPlatformFeesNaira,
        recordedGrossPlatformFees,
        recordedGrossPlatformFeesNaira,
        revertedPlatformFees,
        revertedPlatformFeesNaira,
        currentPlatformEarnings,
        currentPlatformEarningsNaira,
        reconciliationDifference,
        reconciliationDifferenceNaira,

        // Backward compatibility alias keys
        grossPlatformFees: recordedGrossPlatformFees,
        grossPlatformFeesNaira: recordedGrossPlatformFeesNaira,
        netPlatformFees: currentPlatformEarnings,
        netPlatformFeesNaira: currentPlatformEarningsNaira,

        // Payout Liability
        pendingPayouts: payoutData.pending || 0,
        pendingPayoutsNaira: Math.round(payoutData.pendingNaira || 0),
        pendingPayoutCount: payoutData.pendingCount || 0,
        completedPayouts: payoutData.completed || 0,
        completedPayoutsNaira: Math.round(payoutData.completedNaira || 0),
        rejectedPayouts: payoutData.rejected || 0,
        rejectedPayoutsNaira: Math.round(payoutData.rejectedNaira || 0),

        // Provider Earnings
        grossProviderEarnings: providerData.gross || 0,
        grossProviderEarningsNaira: Math.round(providerData.grossNaira || 0),
        providerAmountReverted: providerData.reverted || 0,
        providerAmountRevertedNaira: Math.round(providerData.revertedNaira || 0),
        providerEarnings: providerData.net || 0,
        providerEarningsNaira: Math.round(providerData.netNaira || 0),
        netProviderEarnings: providerData.net || 0,
        netProviderEarningsNaira: Math.round(providerData.netNaira || 0),
        providerPaidOutFromTransactions: providerData.paidOut || 0,
        grossProviderPlatformFee: providerData.platformFee || 0,

        // Refunds & Reversions
        totalReversions: reversalData.total || 0,
        totalReversionsNaira: Math.round(reversalData.totalNaira || 0),
        customerRefunded: refundData.customerRefunded || 0,
        customerRefundedNaira: Math.round(refundData.customerRefundedNaira || 0),
        providerReverted: refundData.providerReverted || 0,
        providerRevertedNaira: Math.round(refundData.providerRevertedNaira || 0),
        platformFeeReverted: revertedPlatformFees,
        platformFeeRevertedNaira: revertedPlatformFeesNaira,
        refundCount: refundData.count || 0,
      },
    });
  } catch (error: any) {
    console.error('getAccountingSummary error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
