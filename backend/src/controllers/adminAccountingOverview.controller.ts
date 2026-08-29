import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import AdultMessage from '../models/AdultMessage';
import PlatformEarning from '../models/PlatformEarning';
import PayoutRequest from '../models/PayoutRequest';
import { getDauCount } from '../middleware/trackDailyActive';
import { getDiamondNairaRate } from '../shared/pricing';

const ACTIVE_PAYOUT_STATUSES = ['pending', 'queued', 'verifying', 'processing'];

export const getReconciledAnalyticsOverview = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Optimization (⚡ Bolt): Combine all-time platform fee summation and source breakdown aggregations into a single $facet query on PlatformEarning to reduce database collection scan roundtrips from 2 to 1.
    const [
      rate,
      totalMembers,
      totalProviders,
      activeToday,
      newToday,
      onlineNow,
      platformEarningFacet,
      payouts,
      camSessionStats,
      totalMessages,
      totalTransactions,
    ] = await Promise.all([
      getDiamondNairaRate(),
      AdultUser.countDocuments({ role: 'user' }),
      AdultUser.countDocuments({ role: 'provider' }),
      getDauCount(todayStr),
      AdultUser.countDocuments({ createdAt: { $gte: startOfToday } }),
      AdultUser.countDocuments({ isOnline: true }),
      PlatformEarning.aggregate([
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: '$amount' },
                  totalNaira: { $sum: { $ifNull: ['$nairaValue', 0] } },
                },
              },
            ],
            sources: [
              { $group: { _id: '$source', total: { $sum: '$amount' } } },
            ],
          },
        },
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
            pendingNaira: {
              $sum: {
                $cond: [{ $in: ['$status', ACTIVE_PAYOUT_STATUSES] }, { $ifNull: ['$amountNaira', 0] }, 0],
              },
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0],
              },
            },
            completedNaira: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$amountNaira', 0] }, 0],
              },
            },
          },
        },
      ]),
      (async () => {
        try {
          const [active, total] = await Promise.all([
            mongoose.model('CamSession').countDocuments({ status: 'live' }),
            mongoose.model('CamSession').countDocuments(),
          ]);
          return { activeCamSessions: active, totalCamSessions: total };
        } catch {
          return { activeCamSessions: 0, totalCamSessions: 0 };
        }
      })(),
      AdultMessage.countDocuments(),
      CreditTransaction.countDocuments(),
    ]);

    const facetResult = platformEarningFacet[0] || { totals: [], sources: [] };
    const totalPlatformFees = facetResult.totals[0]?.total || 0;
    const totalPlatformNaira = facetResult.totals[0]?.totalNaira || 0;
    const paidOut = Math.abs(
      payouts[0]?.completed || 0,
    );
    const pendingPayouts = payouts[0]?.pending || 0;
    const pendingPayoutsNaira = payouts[0]?.pendingNaira || 0;

    const breakdown: Record<string, number> = {
      tips: 0,
      gifts: 0,
      calls: 0,
      service: 0,
      paidMedia: 0,
      spinWheel: 0,
    };

    (facetResult.sources || []).forEach((item: { _id: string; total: number }) => {
      const sourceKey = item._id === 'paid_media'
        ? 'paidMedia'
        : item._id === 'spin_wheel'
          ? 'spinWheel'
          : item._id;

      if (sourceKey in breakdown) {
        breakdown[sourceKey] = item.total;
      }
    });

    const { activeCamSessions, totalCamSessions } = camSessionStats;

    return res.json({
      success: true,
      users: {
        totalMembers,
        totalProviders,
        activeToday,
        newToday,
        onlineNow,
      },
      earnings: {
        totalPlatformFees,
        totalPlatformNaira,
        pendingPayouts,
        pendingPayoutsNaira,
        paidOut,
        breakdown,
      },
      content: {
        activeCamSessions,
        totalCamSessions,
        totalMessages,
        totalTransactions,
      },
    });
  } catch (error: any) {
    console.error('getReconciledAnalyticsOverview error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
