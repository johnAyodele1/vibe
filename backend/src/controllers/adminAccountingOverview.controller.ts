import { Request, Response } from 'express';
import PayoutRequest from '../models/PayoutRequest';
import { getAnalyticsOverview } from './admin.controller';
import { getDiamondNairaRate } from '../shared/pricing';

const ACTIVE_PAYOUT_STATUSES = ['pending', 'queued', 'verifying', 'processing'];

export const getReconciledAnalyticsOverview = async (req: Request, res: Response): Promise<Response> => {
  let payload: any;

  const proxy = new Proxy(res, {
    get(target, property, receiver) {
      if (property === 'json') {
        return (body: any) => {
          payload = body;
          return target;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  await getAnalyticsOverview(req, proxy as Response);

  if (!payload?.success) {
    return res.json(payload);
  }

  const [payouts, rate] = await Promise.all([
    PayoutRequest.aggregate([
      {
        $match: { status: { $in: ACTIVE_PAYOUT_STATUSES } },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]),
    getDiamondNairaRate(),
  ]);

  const pendingPayouts = payouts[0]?.total || 0;
  payload.earnings.pendingPayouts = pendingPayouts;
  payload.earnings.pendingPayoutsNaira = pendingPayouts * rate;

  return res.json(payload);
};
