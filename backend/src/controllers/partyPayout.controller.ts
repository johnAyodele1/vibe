import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Party from '../models/Party';
import TicketOrder from '../models/TicketOrder';
import PartyPayoutRequest from '../models/PartyPayoutRequest';

const getAdultUserId = (req: Request) => (req as any).adultUser?._id || (req as any).user?._id;

const ensureOrganizer = async (partyId: string, organizerId: any) => {
  if (!mongoose.Types.ObjectId.isValid(partyId) || !organizerId) return null;
  return Party.findOne({ _id: partyId, organizerId });
};

export const getMyHostedParties = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    if (!organizerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parties = await Party.find({ organizerId })
      .sort({ startDate: -1 })
      .lean();

    const partyIds = parties.map((party) => party._id);
    const [sales, payouts] = await Promise.all([
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
      PartyPayoutRequest.find({ organizerId, partyId: { $in: partyIds } }).lean(),
    ]);

    const salesMap = new Map(sales.map((row) => [row._id.toString(), row]));
    const payoutMap = new Map(payouts.map((payout) => [payout.partyId.toString(), payout]));

    return res.json({
      success: true,
      parties: parties.map((party) => {
        const sale = salesMap.get(party._id.toString());
        const payout = payoutMap.get(party._id.toString());
        const isPast = new Date(party.endDate) < new Date();
        return {
          ...party,
          stats: {
            ticketsSold: sale?.ticketsSold || 0,
            grossSalesNaira: sale?.grossSalesNaira || 0,
            organizerPayoutNaira: sale?.organizerPayoutNaira || 0,
          },
          payout: payout
            ? {
                status: payout.status,
                amountNaira: payout.amountNaira,
                requestedAt: payout.requestedAt,
                processedAt: payout.processedAt,
              }
            : null,
          canRequestPayout:
            isPast &&
            ['approved', 'completed'].includes(party.status) &&
            (sale?.organizerPayoutNaira || 0) > 0 &&
            !payout,
        };
      }),
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
      TicketOrder.find({ partyId: party._id, status: 'fulfilled' }).select('organizerNaira quantity priceNaira').lean(),
      PartyPayoutRequest.findOne({ partyId: party._id }).lean(),
    ]);

    const amountNaira = orders.reduce((sum, order) => sum + order.organizerNaira, 0);
    return res.json({
      success: true,
      partyId: party._id,
      partyTitle: party.title,
      partyEnded: new Date(party.endDate) < new Date(),
      amountNaira,
      payout,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch party payout' });
  }
};

export const requestPartyPayout = async (req: Request, res: Response) => {
  try {
    const organizerId = getAdultUserId(req);
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const party = await ensureOrganizer(partyId, organizerId);
    if (!party) return res.status(404).json({ success: false, error: 'Party not found' });

    if (new Date(party.endDate) >= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Party payout is available after the party ends.',
      });
    }

    if (!['approved', 'completed'].includes(party.status)) {
      return res.status(400).json({ success: false, error: 'This party is not eligible for payout.' });
    }

    const bankName = String(req.body?.bankName || '').trim();
    const accountHolder = String(req.body?.accountHolder || '').trim();
    const accountNumber = String(req.body?.accountNumber || '').trim();

    if (!bankName || !accountHolder || !/^\\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Enter a valid bank name, account holder name, and 10-digit account number.',
      });
    }

    const orders = await TicketOrder.find({ partyId: party._id, status: 'fulfilled' }).select('organizerNaira').lean();
    const amountNaira = orders.reduce((sum, order) => sum + order.organizerNaira, 0);
    if (amountNaira <= 0) {
      return res.status(400).json({ success: false, error: 'There are no ticket earnings available for this party.' });
    }

    const existing = await PartyPayoutRequest.findOne({ partyId: party._id });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A payout request already exists for this party.', payout: existing });
    }

    const payout = await PartyPayoutRequest.create({
      partyId: party._id,
      organizerId,
      partyTitle: party.title,
      amountNaira,
      payoutDetails: { bankName, accountHolder, accountNumber },
      status: 'requested',
    });

    return res.status(201).json({
      success: true,
      payout: {
        _id: payout._id,
        amountNaira: payout.amountNaira,
        status: payout.status,
        requestedAt: payout.requestedAt,
      },
    });
  } catch (error: any) {
    console.error('Error requesting party payout:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to request party payout' });
  }
};
