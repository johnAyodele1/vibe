import mongoose from 'mongoose';
import PartyPayoutRequest from '../models/PartyPayoutRequest';
import TicketOrder from '../models/TicketOrder';

type Session = mongoose.ClientSession | undefined;

const ACTIVE_PAYOUT_STATUSES = ['requested', 'verifying', 'processing'] as const;

export const getAdminActorId = (req: any) =>
  req?.user?._id || req?.userId || req?.adminId || req?.adultUser?._id || undefined;

export const releasePartyPayoutClaims = async (
  payoutId: mongoose.Types.ObjectId,
  reason: string,
  session?: Session,
  actorId?: mongoose.Types.ObjectId
) => {
  const query = PartyPayoutRequest.findOne({
    _id: payoutId,
    isActive: true,
    status: { $in: ACTIVE_PAYOUT_STATUSES },
  });

  const payout = session ? await query.session(session) : await query;
  if (!payout) return null;

  const now = new Date();

  await TicketOrder.updateMany(
    {
      _id: { $in: payout.ticketOrderIds },
      partyPayoutId: payout._id,
    },
    { $unset: { partyPayoutId: '' } },
    session ? { session } : {}
  );

  payout.status = 'rejected';
  payout.isActive = false;
  payout.adminNotes = reason;
  payout.rejectedAt = now;
  if (actorId) payout.rejectedBy = actorId;

  await payout.save(session ? { session } : undefined);
  return payout;
};

export const failPartyPayoutAndRelease = async (
  payoutId: mongoose.Types.ObjectId,
  reason: string,
  session?: Session,
  actorId?: mongoose.Types.ObjectId
) => {
  const query = PartyPayoutRequest.findOne({
    _id: payoutId,
    isActive: true,
    status: 'processing',
  });

  const payout = session ? await query.session(session) : await query;
  if (!payout) return null;

  const now = new Date();

  await TicketOrder.updateMany(
    {
      _id: { $in: payout.ticketOrderIds },
      partyPayoutId: payout._id,
    },
    { $unset: { partyPayoutId: '' } },
    session ? { session } : {}
  );

  payout.status = 'failed';
  payout.isActive = false;
  payout.adminNotes = reason;
  payout.failedAt = now;
  if (actorId) payout.failedBy = actorId;

  await payout.save(session ? { session } : undefined);
  return payout;
};

export const invalidatePartyPayoutForOrder = async (
  orderId: mongoose.Types.ObjectId,
  reason: string,
  session?: Session
) => {
  const query = TicketOrder.findById(orderId).select('_id partyPayoutId');
  const order = session ? await query.session(session).lean() : await query.lean();

  if (!order?.partyPayoutId) return null;

  return releasePartyPayoutClaims(
    order.partyPayoutId,
    reason,
    session
  );
};

export const reconcilePartyPayout = async (
  payout: { _id: mongoose.Types.ObjectId; ticketOrderIds: mongoose.Types.ObjectId[]; amountNaira: number },
  session?: Session
) => {
  const query = TicketOrder.find({
    _id: { $in: payout.ticketOrderIds },
    partyPayoutId: payout._id,
    status: 'fulfilled',
  }).select('_id organizerNaira');

  const orders = session ? await query.session(session).lean() : await query.lean();
  const amountNaira = orders.reduce((sum, order) => sum + order.organizerNaira, 0);

  return {
    valid:
      orders.length === payout.ticketOrderIds.length &&
      amountNaira === payout.amountNaira,
    orderCount: orders.length,
    expectedOrderCount: payout.ticketOrderIds.length,
    amountNaira,
    expectedAmountNaira: payout.amountNaira,
  };
};
