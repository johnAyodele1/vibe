import { Request, Response } from 'express';
import Party from '../models/Party';
import Ticket from '../models/Ticket';
import PlatformEarning from '../models/PlatformEarning';
import { generateQRCode } from '../shared/qr';
import { sendEmail } from '../shared/email/brevoClient';
import crypto from 'crypto';
import mongoose from 'mongoose';

// Generate unique ticket code: ZPP-XXXXXX
const generateTicketCode = async (): Promise<string> => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let isUnique = false;
  let code = '';

  while (!isUnique) {
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    code = `ZPP-${rand}`;
    const exists = await Ticket.exists({ ticketCode: code });
    if (!exists) {
      isUnique = true;
    }
  }
  return code;
};

// GET /api/v1/parties/:partyId/tickets/availability
export const getTicketAvailability = async (req: Request, res: Response) => {
  try {
    const { partyId } = req.params;
    if (typeof partyId !== 'string' || !mongoose.Types.ObjectId.isValid(partyId)) {
      return res.status(400).json({ success: false, error: 'Invalid party ID' });
    }

    const party = await Party.findById(partyId).select('ticketTiers status startDate').lean();
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
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
    const { partyId } = req.params;
    const { tierId, quantity, paymentIntentId } = req.body;
    const buyerId = (req as any).adultUser?._id || (req as any).user?._id;
    const buyerName = (req as any).adultUser?.displayName || (req as any).user?.displayName || (req as any).user?.firstName || 'Guest Buyer';
    const buyerEmail = (req as any).adultUser?.email || (req as any).user?.email;

    if (!buyerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      return res.status(400).json({ success: false, error: 'Quantity must be between 1 and 10' });
    }

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

    // 3. Check remaining
    const remaining = tier.quantity - tier.sold;
    if (qty > remaining) {
      return res.status(409).json({
        success: false,
        error: 'Not enough tickets available',
        remaining: Math.max(0, remaining),
      });
    }

    // 4. Check per-person limit
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

    // 5. Calculate fees (5% platform fee floored)
    const priceNaira = tier.price * qty;
    const platformFeeNaira = Math.floor(priceNaira * party.platformFeeRate);
    const organizerNaira = priceNaira - platformFeeNaira;

    // 6. Generate individual tickets
    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const ticketCode = await generateTicketCode();
      const qrData = `https://zippo.com.ng/ticket/${ticketCode}`;
      const qrCodeUrl = await generateQRCode(qrData);

      const singlePrice = tier.price;
      const singlePlatformFee = Math.floor(singlePrice * party.platformFeeRate);
      const singleOrganizerNaira = singlePrice - singlePlatformFee;

      const ticket = await Ticket.create({
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
        paymentRef: paymentIntentId || `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        paidAt: new Date(),
        entryStatus: 'not_entered',
        isValid: true,
      });
      tickets.push(ticket);
    }

    // 7. Update tier sold count and total party revenue atomically
    await Party.updateOne(
      { _id: party._id, 'ticketTiers.tierId': tierId },
      {
        $inc: {
          'ticketTiers.$.sold': qty,
          totalRevenue: priceNaira,
        },
      }
    );

    // 8. Record platform earning
    await PlatformEarning.create({
      source: 'ticket_sale',
      amount: platformFeeNaira,
      nairaValue: platformFeeNaira,
      fromUserId: buyerId,
      toProviderId: party.organizerId,
      referenceId: tickets[0]._id,
      metadata: { partyId: party._id, partyTitle: party.title, quantity: qty, tierName: tier.name },
    });

    // 9. Send confirmation email if email available
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
    const ticket = await Ticket.findOne({ ticketCode })
      .populate('partyId', 'title coverImage startDate endDate venueName venueAddress status location')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    return res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Error fetching ticket detail:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch ticket' });
  }
};

// Helper to authenticate guard or organizer
const authenticateGuardOrOrganizer = async (req: Request, partyId: string) => {
  const party = await Party.findById(partyId).lean();
  if (!party) return { authorized: false, party: null, isOrganizer: false };

  const guardCode = req.headers['x-guard-code'] as string;
  if (guardCode && party.guardAccessCodeHash) {
    const hash = crypto.createHash('sha256').update(guardCode.trim()).digest('hex');
    if (hash === party.guardAccessCodeHash) {
      return { authorized: true, party, isOrganizer: false };
    }
  }

  const userId = (req as any).adultUser?._id || (req as any).user?._id;
  if (userId && party.organizerId.toString() === userId.toString()) {
    return { authorized: true, party, isOrganizer: true };
  }

  return { authorized: false, party, isOrganizer: false };
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

    const { authorized, party } = await authenticateGuardOrOrganizer(req, partyId);
    if (!authorized || !party) {
      return res.status(403).json({ success: false, error: 'Invalid guard code' });
    }

    if (!ticketCode || !action) {
      return res.status(400).json({ success: false, error: 'ticketCode and action are required' });
    }

    const ticket = await Ticket.findOne({
      ticketCode: ticketCode.toUpperCase().trim(),
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

    // Strict Anti-Scam State Machine Verification
    const validActions: Record<string, string[]> = {
      not_entered: ['entered'],
      inside: ['exited'],
      outside: ['re_entered'],
    };

    if (!validActions[ticket.entryStatus]?.includes(action)) {
      const stateMessages: Record<string, string> = {
        inside: 'This person is already inside',
        outside: 'This person has left — use "re_entered" to re-admit',
        not_entered: 'This ticket has not been used to enter yet',
      };
      return res.status(409).json({
        success: false,
        error: `Invalid action for current status: ${ticket.entryStatus}`,
        code: 'INVALID_ACTION',
        currentStatus: ticket.entryStatus,
        display: `⚠️ ${stateMessages[ticket.entryStatus] || 'Invalid state transition'}`,
        allowedActions: validActions[ticket.entryStatus],
      });
    }

    const newStatus: 'inside' | 'outside' | 'not_entered' =
      action === 'entered' ? 'inside' : action === 'exited' ? 'outside' : action === 're_entered' ? 'inside' : ticket.entryStatus;

    const logEntry = {
      action,
      timestamp: new Date(),
      guardId: undefined,
      guardName: 'Security',
      method: 'qr_scan' as const,
    };

    const isEntryAction = action === 'entered' || action === 're_entered';
    const updatedTicket = await Ticket.findByIdAndUpdate(
      ticket._id,
      {
        $set: { entryStatus: newStatus, updatedAt: new Date() },
        $push: { entryLog: logEntry },
        $inc: { entryCount: isEntryAction ? 1 : 0 },
      },
      { new: true }
    ).lean();

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
      entryCount: updatedTicket?.entryCount || ticket.entryCount + (isEntryAction ? 1 : 0),
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
