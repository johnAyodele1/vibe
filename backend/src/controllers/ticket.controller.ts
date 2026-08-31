import { Request, Response } from 'express';
import Party from '../models/Party';
import Ticket from '../models/Ticket';
import PlatformEarning from '../models/PlatformEarning';
import { generateQRCode } from '../shared/qr';
import { sendEmail } from '../shared/email/brevoClient';
import { purchaseTicketsSchema } from '../validators/partiesAndClubs.validator';
import { PaystackService } from '../services/paystack.service';
import AdultUser from '../models/AdultUser';
import crypto from 'crypto';
import mongoose from 'mongoose';

// Generate unique ticket code: ZPP-XXXXXX
const generateTicketCode = async (): Promise<string> => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ZPP-${rand}`;
};

// GET /api/v1/parties/:partyId/tickets/availability
export const getTicketAvailability = async (req: Request, res: Response) => {
  try {
    const { partyId } = req.params;
    const userId = (req as any).adultUser?._id || (req as any).user?._id;
    const isAdmin = (req as any).adultUser?.isAdmin || (req as any).user?.isAdmin;

    if (typeof partyId !== 'string' || !mongoose.Types.ObjectId.isValid(partyId)) {
      return res.status(400).json({ success: false, error: 'Invalid party ID' });
    }

    const party = await Party.findById(partyId).select('ticketTiers status startDate organizerId').lean();
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    if (party.status !== 'approved' && !isAdmin && party.organizerId?.toString() !== userId?.toString()) {
      return res.status(404).json({ success: false, error: 'Party not found or not approved' });
    }

    const tiers = party.ticketTiers.map((tier) => ({
      tierId: tier.tierId,
      name: tier.name,
      description: tier.description,
      price: tier.price,
      quantity: tier.quantity,
      sold: tier.sold,
      remaining: Math.max(0, tier.quantity - tier.sold),
      perPersonLimit: tier.perPersonLimit,
      isSoldOut: tier.sold >= tier.quantity,
      isActive: tier.isActive,
    }));

    return res.json({ success: true, tiers });
  } catch (err: any) {
    console.error('Error fetching ticket availability:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch ticket availability' });
  }
};

// POST /api/v1/parties/:partyId/tickets/purchase
export const purchaseTickets = async (req: Request, res: Response) => {
  try {
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const buyerId = (req as any).adultUser?._id || (req as any).user?._id;
    const buyerName = (req as any).adultUser?.displayName || (req as any).user?.displayName || (req as any).user?.firstName || 'Guest Buyer';
    const buyerEmail = (req as any).adultUser?.email || (req as any).user?.email;

    if (!buyerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parseResult = purchaseTicketsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.issues[0]?.message || 'Invalid purchase data' });
    }

    const { tierId, quantity: qty, paymentReference, paymentIntentId, paymentProvider = 'simulated' } = parseResult.data;
    const effectivePaymentRef = paymentReference || paymentIntentId || `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Validate party is approved
    const party = await Party.findOne({
      _id: partyId,
      status: 'approved',
      startDate: { $gte: new Date() },
    });
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found, not approved, or has already ended' });
    }

    // 2. Find tier
    const tier = party.ticketTiers.find((t) => t.tierId === tierId && t.isActive);
    if (!tier) {
      return res.status(404).json({ success: false, error: 'Ticket tier not found or is inactive' });
    }

    // 3. Check per-person limit across all existing paid tickets
    const alreadyBought = await Ticket.countDocuments({
      partyId: party._id,
      tierId,
      buyerId,
      paymentStatus: 'paid',
    });
    if (alreadyBought + qty > tier.perPersonLimit) {
      return res.status(409).json({
        success: false,
        error: `Maximum ${tier.perPersonLimit} tickets per person for this tier`,
        alreadyBought,
        limit: tier.perPersonLimit,
      });
    }

    // 4. Single-ticket fee rounding consistency
    const singlePrice = tier.price;
    const singlePlatformFee = Math.floor(singlePrice * party.platformFeeRate);
    const singleOrganizerNaira = singlePrice - singlePlatformFee;

    const priceNaira = singlePrice * qty;
    const platformFeeNaira = singlePlatformFee * qty;
    const organizerNaira = singleOrganizerNaira * qty;

    // 5. ATOMIC CONDITIONAL INVENTORY RESERVATION
    // Reserves inventory FIRST before charging payment
    const maxAllowedSold = tier.quantity - qty;
    const reserveResult = await Party.updateOne(
      {
        _id: party._id,
        ticketTiers: {
          $elemMatch: {
            tierId,
            sold: { $lte: maxAllowedSold },
          },
        },
      },
      {
        $inc: {
          'ticketTiers.$.sold': qty,
          totalRevenue: priceNaira,
        },
      }
    );

    if (reserveResult.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        error: 'Not enough tickets available for this tier',
      });
    }

    let walletDeductedDiamonds = 0;

    // Server-Side Payment Provider Verification & Deduction
    try {
      if (paymentProvider === 'paystack' && process.env.NODE_ENV !== 'test') {
        const verifyRes = await PaystackService.verifyTransaction(effectivePaymentRef);
        if (!verifyRes.status || !verifyRes.data || verifyRes.data.status !== 'success') {
          throw new Error('Payment verification failed with Paystack provider');
        }
        const expectedKobo = priceNaira * 100;
        if (verifyRes.data.amount !== expectedKobo) {
          throw new Error('Paid transaction amount does not match ticket cost');
        }
      } else if (paymentProvider === 'wallet') {
        // Deduct wallet balance atomically
        const rate = 100; // 100 Naira per diamond
        const requiredDiamonds = Math.ceil(priceNaira / rate);
        const updatedUser = await AdultUser.findOneAndUpdate(
          { _id: buyerId, credits: { $gte: requiredDiamonds } },
          { $inc: { credits: -requiredDiamonds } },
          { new: true }
        );
        if (!updatedUser) {
          throw new Error(`Insufficient wallet balance. Required: 💎 ${requiredDiamonds}`);
        }
        walletDeductedDiamonds = requiredDiamonds;
      } else if (process.env.NODE_ENV !== 'test') {
        throw new Error('Simulated payment is disabled in production. Please select Wallet or Paystack.');
      }
    } catch (paymentErr: any) {
      // Revert inventory reservation if payment verification/deduction fails
      await Party.updateOne(
        { _id: party._id, 'ticketTiers.tierId': tierId },
        {
          $inc: {
            'ticketTiers.$.sold': -qty,
            totalRevenue: -priceNaira,
          },
        }
      );
      return res.status(402).json({
        success: false,
        error: paymentErr.message || 'Payment processing failed',
      });
    }

    // 6. Generate individual tickets & record platform earning with compensation rollback on error
    const tickets = [];
    try {
      for (let i = 0; i < qty; i++) {
        let created = false;
        let ticketDoc = null;
        let retries = 0;

        while (!created && retries < 5) {
          try {
            const ticketCode = await generateTicketCode();
            const qrData = `https://zippo.com.ng/ticket/${ticketCode}`;
            const qrCodeUrl = await generateQRCode(qrData);

            ticketDoc = await Ticket.create({
              partyId: party._id,
              tierId: tier.tierId,
              tierName: tier.name,
              buyerId,
              buyerName,
              ticketCode,
              qrCodeUrl,
              priceNaira: singlePrice,
              platformFeeNaira: singlePlatformFee,
              organizerNaira: singleOrganizerNaira,
              paymentStatus: 'paid',
              paymentRef: effectivePaymentRef,
              paidAt: new Date(),
              entryStatus: 'not_entered',
              isValid: true,
            });
            created = true;
          } catch (e: any) {
            if (e.code === 11000) {
              retries++;
            } else {
              throw e;
            }
          }
        }
        if (ticketDoc) tickets.push(ticketDoc);
      }

      // 7. Record platform earning
      if (tickets.length > 0) {
        await PlatformEarning.create({
          source: 'ticket_sale',
          amount: platformFeeNaira,
          nairaValue: platformFeeNaira,
          fromUserId: buyerId,
          toProviderId: party.organizerId,
          referenceId: tickets[0]._id,
          metadata: { partyId: party._id, partyTitle: party.title, quantity: qty, tierName: tier.name },
        });
      }
    } catch (createErr) {
      // Rollback reserved inventory and refund wallet credits on ticket creation failure
      await Party.updateOne(
        { _id: party._id, 'ticketTiers.tierId': tierId },
        {
          $inc: {
            'ticketTiers.$.sold': -qty,
            totalRevenue: -priceNaira,
          },
        }
      );
      if (walletDeductedDiamonds > 0) {
        await AdultUser.findByIdAndUpdate(buyerId, { $inc: { credits: walletDeductedDiamonds } });
      }
      throw createErr;
    }

    // 8. Send confirmation email AFTER transaction completion
    if (buyerEmail) {
      void sendEmail({
        to: buyerEmail,
        toName: buyerName,
        subject: `Ticket Confirmation: ${party.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0608; color: #ffffff;">
            <h2 style="color: #c8102e;">🎟 Your Tickets for ${party.title}</h2>
            <p>Hi ${buyerName},</p>
            <p>Thank you for your purchase! Here are your ticket details:</p>
            <ul>
              <li><strong>Event:</strong> ${party.title}</li>
              <li><strong>Venue:</strong> ${party.venueName} (${party.venueAddress})</li>
              <li><strong>Date & Time:</strong> ${new Date(party.startDate).toLocaleString()}</li>
              <li><strong>Tier:</strong> ${tier.name}</li>
              <li><strong>Quantity:</strong> ${qty}</li>
            </ul>
            <h3>Your Ticket Codes:</h3>
            <ul>
              ${tickets.map((t) => `<li><strong>${t.ticketCode}</strong> - <a href="${t.qrCodeUrl}" style="color: #f5b041;">View QR Code</a></li>`).join('')}
            </ul>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Present your QR code at the venue door for check-in.</p>
          </div>
        `,
      });
    }

    return res.status(201).json({
      success: true,
      tickets: tickets.map((t) => ({
        ticketCode: t.ticketCode,
        qrCodeUrl: t.qrCodeUrl,
        tierName: t.tierName,
        entryStatus: t.entryStatus,
      })),
      summary: {
        quantity: qty,
        totalPaid: priceNaira,
        platformFee: platformFeeNaira,
        organizerGets: organizerNaira,
      },
    });
  } catch (err: any) {
    console.error('Error purchasing tickets:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to purchase tickets' });
  }
};

// GET /api/v1/me/tickets
export const getMyTickets = async (req: Request, res: Response) => {
  try {
    const buyerId = (req as any).adultUser?._id || (req as any).user?._id;
    if (!buyerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const tickets = await Ticket.find({ buyerId })
      .sort({ createdAt: -1 })
      .populate('partyId', 'title coverImage startDate endDate venueName venueAddress status location')
      .lean();

    return res.json({ success: true, tickets });
  } catch (err: any) {
    console.error('Error fetching my tickets:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch tickets' });
  }
};

// GET /api/v1/me/tickets/:ticketCode
export const getTicketByCode = async (req: Request, res: Response) => {
  try {
    const { ticketCode } = req.params;
    const userId = (req as any).adultUser?._id || (req as any).user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const rawCode = Array.isArray(ticketCode) ? ticketCode[0] : ticketCode;
    const cleanTicketCode = typeof rawCode === 'string' ? rawCode.toUpperCase().trim() : '';

    const ticket = await Ticket.findOne({
      ticketCode: cleanTicketCode,
      buyerId: userId, // Enforce buyer ownership
    })
      .populate('partyId', 'title coverImage startDate endDate venueName venueAddress status location')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found or access denied' });
    }

    return res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Error fetching ticket detail:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch ticket' });
  }
};

// Guard PIN Rate Limiting / Lockout Tracker
const guardFailedAttempts = new Map<string, { count: number; lockedUntil: number }>();

// Helper to authenticate guard or organizer with constant-time hash check and rate limiting
const authenticateGuardOrOrganizer = async (req: Request, partyId: string) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown_ip';
  const lockKey = `${clientIp}:${partyId}`;
  const now = Date.now();

  const record = guardFailedAttempts.get(lockKey);
  if (record && record.lockedUntil > now) {
    return { authorized: false, party: null, isOrganizer: false, lockedOut: true };
  }

  const party = await Party.findById(partyId).lean();
  if (!party) return { authorized: false, party: null, isOrganizer: false, lockedOut: false };

  const guardCode = req.headers['x-guard-code'] as string;
  if (guardCode && party.guardAccessCodeHash) {
    const hash = crypto.createHash('sha256').update(guardCode.trim()).digest('hex');

    const expectedBuf = Buffer.from(party.guardAccessCodeHash, 'hex');
    const actualBuf = Buffer.from(hash, 'hex');

    if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      guardFailedAttempts.delete(lockKey);
      return { authorized: true, party, isOrganizer: false, lockedOut: false };
    } else {
      // Record failed attempt
      const attempts = (record?.count || 0) + 1;
      const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0; // Lockout for 15 mins after 5 failures
      guardFailedAttempts.set(lockKey, { count: attempts, lockedUntil });
    }
  }

  const userId = (req as any).adultUser?._id || (req as any).user?._id;
  if (userId && party.organizerId.toString() === userId.toString()) {
    return { authorized: true, party, isOrganizer: true, lockedOut: false };
  }

  return { authorized: false, party, isOrganizer: false, lockedOut: false };
};

// GET /api/v1/parties/:partyId/checkin/scan?code=ZPP-A8F3K2
export const scanCheckinQuery = async (req: Request, res: Response) => {
  try {
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const code = req.query.code as string;

    const { authorized, party } = await authenticateGuardOrOrganizer(req, partyId);
    if (!authorized || !party) {
      return res.status(403).json({ success: false, error: 'Invalid guard access PIN or unauthorized' });
    }

    if (!code) {
      return res.status(400).json({ success: false, error: 'Ticket code is required' });
    }

    const ticket = await Ticket.findOne({ ticketCode: code.toUpperCase().trim(), partyId: party._id }).lean();
    if (!ticket) {
      return res.status(404).json({
        success: false,
        code: 'TICKET_NOT_FOUND',
        display: '❌ Unknown Ticket',
        error: 'Ticket not found',
      });
    }

    return res.json({
      success: true,
      ticket: {
        ticketCode: ticket.ticketCode,
        buyerName: ticket.buyerName,
        tierName: ticket.tierName,
        entryStatus: ticket.entryStatus,
        entryCount: ticket.entryCount,
        isValid: ticket.isValid,
        paymentStatus: ticket.paymentStatus,
        invalidReason: ticket.invalidReason,
      },
    });
  } catch (err: any) {
    console.error('Error scanning ticket query:', err);
    return res.status(500).json({ success: false, error: err.message || 'Check-in scan failed' });
  }
};

// POST /api/v1/parties/:partyId/checkin/scan
export const performCheckinScan = async (req: Request, res: Response) => {
  try {
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const { ticketCode, action } = req.body;

    const { authorized, party, lockedOut } = await authenticateGuardOrOrganizer(req, partyId);
    if (lockedOut) {
      return res.status(429).json({ success: false, error: 'Too many failed PIN attempts. Locked out for 15 minutes.' });
    }
    if (!authorized || !party) {
      return res.status(403).json({ success: false, error: 'Invalid guard code' });
    }

    if (!ticketCode || !action) {
      return res.status(400).json({ success: false, error: 'ticketCode and action are required' });
    }

    const cleanCode = ticketCode.toUpperCase().trim();

    // 1. Initial lookup
    const ticket = await Ticket.findOne({
      ticketCode: cleanCode,
      partyId: party._id,
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
        code: 'TICKET_NOT_FOUND',
        display: '❌ Unknown Ticket',
      });
    }

    if (!ticket.isValid || ticket.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Ticket is not valid',
        code: 'TICKET_INVALID',
        display: '❌ Invalid Ticket',
        reason: ticket.invalidReason || 'Ticket cancelled or refunded',
      });
    }

    // Expected starting status for each action
    const expectedStartingStatus =
      action === 'entered' ? 'not_entered' : action === 'exited' ? 'inside' : action === 're_entered' ? 'outside' : null;

    if (!expectedStartingStatus) {
      return res.status(400).json({ success: false, error: 'Invalid check-in action' });
    }

    const newStatus = action === 'exited' ? 'outside' : 'inside';
    const isEntryAction = action === 'entered' || action === 're_entered';

    const logEntry = {
      action,
      timestamp: new Date(),
      guardId: undefined,
      guardName: 'Security',
      method: 'qr_scan' as const,
    };

    // 2. RACE-SAFE ATOMIC CONDITIONAL STATE TRANSITION
    // Matches exact expected starting status in the database query
    const updatedTicket = await Ticket.findOneAndUpdate(
      {
        _id: ticket._id,
        partyId: party._id,
        entryStatus: expectedStartingStatus,
      },
      {
        $set: { entryStatus: newStatus, updatedAt: new Date() },
        $push: { entryLog: logEntry },
        $inc: { entryCount: isEntryAction ? 1 : 0 },
      },
      { new: true }
    ).lean();

    if (!updatedTicket) {
      // Concurrency collision or state mismatch
      const currentTicketState = await Ticket.findById(ticket._id).lean();
      const stateMessages: Record<string, string> = {
        inside: 'This person is already inside',
        outside: 'This person has left — use "re_entered" to re-admit',
        not_entered: 'This ticket has not been used to enter yet',
      };
      const currStatus = currentTicketState?.entryStatus || ticket.entryStatus;
      return res.status(409).json({
        success: false,
        error: `Invalid action for current status: ${currStatus}`,
        code: 'INVALID_ACTION',
        currentStatus: currStatus,
        display: `⚠️ ${stateMessages[currStatus] || 'Invalid state transition'}`,
      });
    }

    const actionMessages: Record<string, string> = {
      entered: '✅ Admitted',
      exited: '👋 Checked Out',
      re_entered: '🔄 Re-admitted',
    };

    return res.json({
      success: true,
      display: actionMessages[action] || 'Action Recorded',
      action,
      ticketCode: ticket.ticketCode,
      tierName: ticket.tierName,
      buyerName: ticket.buyerName,
      entryStatus: newStatus,
      entryCount: updatedTicket.entryCount,
      timestamp: logEntry.timestamp,
    });
  } catch (err: any) {
    console.error('Error executing check-in scan:', err);
    return res.status(500).json({ success: false, error: err.message || 'Check-in scan execution failed' });
  }
};

// GET /api/v1/parties/:partyId/checkin/dashboard
export const getCheckinDashboard = async (req: Request, res: Response) => {
  try {
    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const { authorized } = await authenticateGuardOrOrganizer(req, partyId);
    if (!authorized) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Guard PIN or organizer login required' });
    }

    const partyObjectId = new mongoose.Types.ObjectId(partyId);

    const [total, inside, outside, notEntered, byTier] = await Promise.all([
      Ticket.countDocuments({ partyId: partyObjectId, paymentStatus: 'paid', isValid: true }),
      Ticket.countDocuments({ partyId: partyObjectId, entryStatus: 'inside' }),
      Ticket.countDocuments({ partyId: partyObjectId, entryStatus: 'outside' }),
      Ticket.countDocuments({ partyId: partyObjectId, entryStatus: 'not_entered' }),
      Ticket.aggregate([
        { $match: { partyId: partyObjectId, paymentStatus: 'paid', isValid: true } },
        {
          $group: {
            _id: '$tierName',
            total: { $sum: 1 },
            inside: { $sum: { $cond: [{ $eq: ['$entryStatus', 'inside'] }, 1, 0] } },
            outside: { $sum: { $cond: [{ $eq: ['$entryStatus', 'outside'] }, 1, 0] } },
            notEntered: { $sum: { $cond: [{ $eq: ['$entryStatus', 'not_entered'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      total,
      inside,
      outside,
      notEntered,
      byTier,
    });
  } catch (err: any) {
    console.error('Error fetching check-in dashboard:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch check-in dashboard' });
  }
};
