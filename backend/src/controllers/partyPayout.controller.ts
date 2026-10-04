import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Party from '../models/Party';
import TicketOrder from '../models/TicketOrder';
import PartyPayoutRequest from '../models/PartyPayoutRequest';

const MINIMUM_PARTY_PAYOUT_NAIRA = 10_000;
const ELIGIBLE_PARTY_STATUSES = ['approved', 'completed'];

const getAdultUserId = (req: Request) =>
  (req as any).adultUser?._id || (req as any).user?._id;

const ensureOrganizer = async (partyId: string, organizerId: any) => {
  if (!mongoose.Types.ObjectId.isValid(partyId) || !organizerId) return null;
  return Party.findOne({ _id: partyId, organizerId });
};

const getEligiblePartyIds = async (
  organizerId: mongoose.Types.ObjectId,
  requestedPartyIds?: mongoose.Types.ObjectId[],
  session?: mongoose.ClientSession
) => {
  const filter: any = {
    organizerId,
    endDate: { $lt: new Date() },
    status: { $in: ELIGIBLE_PARTY_STATUSES },
  };

  if (requestedPartyIds?.length) {
    filter._id = { $in: requestedPartyIds };
  }

  const parties = await Party.find(filter)
    .select('_id title')
    .session(session || null)
    .lean();

  return parties;
};

const getEligibleOrders = async (
  partyIds: mongoose.Types.ObjectId[],
  session?: mongoose.ClientSession
) => {
  if (!partyIds.length) return [];

  return TicketOrder.find({
    partyId: { $in: partyIds },
    status: 'fulfilled',
    partyPayoutId: { $exists: false },
  })
    .select('_id partyId organizerNaira')
    .session(session || null)
    .lean();
};

const validatePayoutDetails = (body: any) => {
  const bankName = String(body?.bankName || '').trim();
  const accountHolder = String(body?.accountHolder || '').trim();
  const accountNumber = String(body?.accountNumber || '').trim();

  if (!bankName || !accountHolder || !/^\d{10}$/.test(accountNumber)) {
    return {
      error: 'Enter a valid bank name, account holder name, and 10-digit account number.',
    };
  }

  return {
    bankName,
    accountHolder,
    accountNumber,
  };
};

const requestPayout = async ({
  organizerId,
  body,
  requestedPartyIds,
}: {
  organizerId: mongoose.Types.ObjectId;
  body: any;
  requestedPartyIds?: mongoose.Types.ObjectId[];
}) => {
  const payoutDetails = validatePayoutDetails(body);
  if ('error' in payoutDetails) {
    return { status: 400, body: { success: false, error: payoutDetails.error } };
  }

  const existing = await PartyPayoutRequest.findOne({
    organizerId,
    isActive: true,
  })
    .select('_id status amountNaira requestedAt')
    .lean();

  if (existing) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'A party payout is already being processed.',
        payout: existing,
      },
    };
  }

  let session: mongoose.ClientSession | null = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const activeInsideTransaction = await PartyPayoutRequest.findOne({
      organizerId,
      isActive: true,
    })
      .session(session)
      .lean();

    if (activeInsideTransaction) {
      await session.abortTransaction();
      return {
        status: 409,
        body: {
          success: false,
          error: 'A party payout is already being processed.',
          payout: activeInsideTransaction,
        },
      };
    }

    const parties = await getEligiblePartyIds(organizerId, requestedPartyIds, session);
    const partyIds = parties.map((party) => party._id);

    const orders = await getEligibleOrders(partyIds, session);
    const amountNaira = orders.reduce((sum, order) => sum + order.organizerNaira, 0);

    if (amountNaira < MINIMUM_PARTY_PAYOUT_NAIRA) {
      await session.abortTransaction();
      return {
        status: 400,
        body: {
          success: false,
          error: `Minimum party payout is ₦${MINIMUM_PARTY_PAYOUT_NAIRA.toLocaleString('en-NG')}.`,
          availableNaira: amountNaira,
          minimumNaira: MINIMUM_PARTY_PAYOUT_NAIRA,
        },
      };
    }

    if (!orders.length || !partyIds.length) {
      await session.abortTransaction();
      return {
        status: 400,
        body: {
          success: false,
          error: 'There are no ticket earnings currently available for payout.',
          availableNaira: 0,
          minimumNaira: MINIMUM_PARTY_PAYOUT_NAIRA,
        },
      };
    }

    const payoutDocs = await PartyPayoutRequest.create(
      [
        {
          organizerId,
          partyIds,
          ticketOrderIds: orders.map((order) => order._id),
          partyTitle: parties.length === 1 ? parties[0].title : undefined,
          partyId: parties.length === 1 ? parties[0]._id : undefined,
          amountNaira,
          payoutDetails,
          status: 'requested',
          isActive: true,
          requestedAt: new Date(),
        },
      ],
      { session }
    );

    const payout = payoutDocs[0];

    const lockResult = await TicketOrder.updateMany(
      {
        _id: { $in: orders.map((order) => order._id) },
        partyPayoutId: { $exists: false },
      },
      { $set: { partyPayoutId: payout._id } },
      { session }
    );

    if (lockResult.modifiedCount !== orders.length) {
      throw Object.assign(new Error('Some ticket earnings changed while the payout was being created.'), {
        code: 'PAYOUT_BALANCE_CHANGED',
      });
    }

    await session.commitTransaction();

    return {
      status: 201,
      body: {
        success: true,
        payout: {
          _id: payout._id,
          amountNaira: payout.amountNaira,
          status: payout.status,
          requestedAt: payout.requestedAt,
        },
      },
      payout,
    };
  } catch (error: any) {
    await session.abortTransaction().catch(() => {});

    if (
      error?.code === 11000 ||
      error?.message?.includes('one_active_party_payout_per_organizer')
    ) {
      return {
        status: 409,
        body: {
          success: false,
          error: 'A party payout is already being processed.',
        },
      };
    }

    if (error?.code === 'PAYOUT_BALANCE_CHANGED') {
      return {
        status: 409,
        body: {
          success: false,
          error: 'Your available party earnings changed. Refresh and try again.',
        },
      };
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

export const getMyHostedParties = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    if (!organizerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parties = await Party.find({ organizerId })
      .sort({ startDate: -1 })
      .lean();

    const partyIds = parties.map((party) => party._id);

    const [sales, payouts, eligibleOrders, activePayout] = await Promise.all([
      TicketOrder.aggregate([
        { $match: { partyId: { $in: partyIds }, status: 'fulfilled' } },
        {
          $group: {
            _id: '$partyId',
            ticketsSold: { $sum: '$quantity' },
            grossSalesNaira: { $sum: '$priceNaira' },
            organizerPayoutNaira: { $sum: '$organizerNaira' },
          },
        },
      ]),
      PartyPayoutRequest.find({
        organizerId,
        partyIds: { $in: partyIds },
      })
        .sort({ requestedAt: -1 })
        .lean(),
      getEligibleOrders(
        (
          await Party.find({
            organizerId,
            _id: { $in: partyIds },
            endDate: { $lt: new Date() },
            status: { $in: ELIGIBLE_PARTY_STATUSES },
          })
            .select('_id')
            .lean()
        ).map((party) => party._id)
      ),
      PartyPayoutRequest.findOne({
        organizerId,
        isActive: true,
      })
        .select('_id amountNaira status requestedAt')
        .lean(),
    ]);

    const salesMap = new Map(sales.map((row) => [row._id.toString(), row]));
    const latestPayoutByParty = new Map<string, any>();

    for (const payout of payouts) {
      for (const payoutPartyId of payout.partyIds || []) {
        const key = payoutPartyId.toString();
        if (!latestPayoutByParty.has(key)) {
          latestPayoutByParty.set(key, payout);
        }
      }

      if (payout.partyId && !latestPayoutByParty.has(payout.partyId.toString())) {
        latestPayoutByParty.set(payout.partyId.toString(), payout);
      }
    }

    const eligibleByParty = new Map<string, number>();
    for (const order of eligibleOrders) {
      const key = order.partyId.toString();
      eligibleByParty.set(key, (eligibleByParty.get(key) || 0) + order.organizerNaira);
    }

    const availableNaira = eligibleOrders.reduce((sum, order) => sum + order.organizerNaira, 0);

    return res.json({
      success: true,
      parties: parties.map((party) => {
        const sale = salesMap.get(party._id.toString());
        const payout = latestPayoutByParty.get(party._id.toString());
        const isPast = new Date(party.endDate) < new Date();
        const availableForParty = eligibleByParty.get(party._id.toString()) || 0;

        return {
          ...party,
          stats: {
            ticketsSold: sale?.ticketsSold || 0,
            grossSalesNaira: sale?.grossSalesNaira || 0,
            organizerPayoutNaira: sale?.organizerPayoutNaira || 0,
          },
          availablePayoutNaira: availableForParty,
          payout: payout
            ? {
                status: payout.status,
                amountNaira: payout.amountNaira,
                requestedAt: payout.requestedAt,
                processedAt: payout.processedAt,
              }
            : null,
          canRequestPayout: isPast && availableForParty >= MINIMUM_PARTY_PAYOUT_NAIRA,
        };
      }),
      payoutSummary: {
        availableNaira,
        minimumNaira: MINIMUM_PARTY_PAYOUT_NAIRA,
        canRequest: !activePayout && availableNaira >= MINIMUM_PARTY_PAYOUT_NAIRA,
        activePayout: activePayout
          ? {
              _id: activePayout._id,
              amountNaira: activePayout.amountNaira,
              status: activePayout.status,
              requestedAt: activePayout.requestedAt,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching hosted parties:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch hosted parties' });
  }
};

export const getPartyPayout = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const party = await ensureOrganizer(partyId, organizerId);

    if (!party) return res.status(404).json({ success: false, error: 'Party not found' });

    const [orders, payout] = await Promise.all([
      getEligibleOrders([party._id]),
      PartyPayoutRequest.findOne({
        organizerId,
        partyIds: party._id,
      })
        .sort({ requestedAt: -1 })
        .lean(),
    ]);

    const amountNaira = orders.reduce((sum, order) => sum + order.organizerNaira, 0);

    return res.json({
      success: true,
      partyId: party._id,
      partyTitle: party.title,
      partyEnded: new Date(party.endDate) < new Date(),
      amountNaira,
      minimumNaira: MINIMUM_PARTY_PAYOUT_NAIRA,
      canRequest: amountNaira >= MINIMUM_PARTY_PAYOUT_NAIRA,
      payout,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch party payout' });
  }
};

export const requestPartyPayout = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    if (!organizerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const party = await ensureOrganizer(partyId, organizerId);

    if (!party) return res.status(404).json({ success: false, error: 'Party not found' });

    if (new Date(party.endDate) >= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Party payout is available after the party ends.',
      });
    }

    if (!ELIGIBLE_PARTY_STATUSES.includes(party.status)) {
      return res.status(400).json({ success: false, error: 'This party is not eligible for payout.' });
    }

    const result = await requestPayout({
      organizerId: new mongoose.Types.ObjectId(organizerId),
      body: req.body,
      requestedPartyIds: [party._id],
    });

    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Error requesting party payout:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to request party payout' });
  }
};

export const requestHostedPayout = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    if (!organizerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await requestPayout({
      organizerId: new mongoose.Types.ObjectId(organizerId),
      body: req.body,
    });

    if (result.payout) {
      const ns = req.app.get('adultNamespace');
      ns?.emit('admin:new_party_payout_request', {
        requestId: result.payout._id,
        organizerId,
        amountNaira: result.payout.amountNaira,
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Error requesting hosted party payout:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to request party payout' });
  }
};

export const PARTY_PAYOUT_MINIMUM_NAIRA = MINIMUM_PARTY_PAYOUT_NAIRA;
