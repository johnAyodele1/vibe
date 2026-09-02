import { Request, Response } from 'express';
import Party from '../models/Party';
import Ticket from '../models/Ticket';
import TicketOrder from '../models/TicketOrder';
import PlatformEarning from '../models/PlatformEarning';
import AdultUser from '../models/AdultUser';
import { getDiamondNairaRate } from '../shared/pricing';
import CreditTransaction from '../models/CreditTransaction';
import { generateQRCode } from '../shared/qr';
import { sendEmail } from '../shared/email/brevoClient';
import { getCache, setCache, deleteCache } from '../config/redisFallback';
import { purchaseTicketsSchema, checkinScanSchema } from '../validators/partiesAndClubs.validator';
import { PaystackService } from '../services/paystack.service';
import bcrypt from 'bcryptjs';
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

// Generate unique order reference: ZPP-ORD-XXXXXX
const generateOrderReference = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ZPP-ORD-${rand}`;
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

/**
 * Server-Authoritative Ticket Order Fulfillment inside a MongoDB Session Transaction.
 * Idempotent: If order is already fulfilled, returns existing tickets immediately.
 */
export const fulfillTicketOrderInternal = async (orderId: string) => {
  const initialOrder = await TicketOrder.findById(orderId);
  if (!initialOrder) {
    throw new Error('Ticket order not found');
  }

  // REJECT SIMULATED PAYMENTS IN NON-TEST ENVIRONMENTS
  if (initialOrder.paymentProvider === 'simulated' && process.env.NODE_ENV !== 'test') {
    throw new Error('Simulated payments are strictly forbidden in production');
  }

  const paymentRef = initialOrder.paymentReference || initialOrder.orderReference;

  // IDEMPOTENCY PROTECTION: If order is already fulfilled or processing by another thread
  if (initialOrder.status === 'fulfilled') {
    const existingTickets = await Ticket.find({ paymentRef }).lean();
    return { order: initialOrder, tickets: existingTickets, isAlreadyFulfilled: true };
  }

  if (initialOrder.status === 'processing') {
    // Wait briefly for winning thread to commit, or return existing tickets if completed
    let attempts = 0;
    while (attempts < 5) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const current = await TicketOrder.findById(orderId).lean();
      if (current?.status === 'fulfilled') {
        const existingTickets = await Ticket.find({ paymentRef }).lean();
        return { order: current, tickets: existingTickets, isAlreadyFulfilled: true };
      }
      attempts++;
    }
  }

  // ORDER EXPIRATION CHECK
  if (initialOrder.expiresAt && new Date(initialOrder.expiresAt) < new Date() && initialOrder.status === 'pending') {
    await TicketOrder.findByIdAndUpdate(initialOrder._id, { $set: { status: 'failed' } });
    throw new Error('Ticket order has expired');
  }

  // ATOMIC CLAIM: Transition from 'pending' -> 'processing'
  const claimedOrder = await TicketOrder.findOneAndUpdate(
    { _id: orderId, status: 'pending' },
    { $set: { status: 'processing', updatedAt: new Date() } },
    { new: true }
  );

  if (!claimedOrder) {
    // Competitor claimed or fulfilled the order in parallel
    const current = await TicketOrder.findById(orderId).lean();
    const existingTickets = await Ticket.find({ paymentRef }).lean();
    if (current?.status === 'fulfilled' || existingTickets.length > 0) {
      return { order: current || initialOrder, tickets: existingTickets, isAlreadyFulfilled: true };
    }
    if (current?.status === 'processing') {
      return { order: current, tickets: existingTickets, isProcessing: true };
    }
    throw new Error(`Ticket order status is already ${current?.status || 'updated'}`);
  }

  const party = await Party.findById(claimedOrder.partyId);
  if (!party || party.status !== 'approved') {
    await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
    throw new Error('Party not found or not approved');
  }

  const tier = party.ticketTiers.find((t) => t.tierId === claimedOrder.tierId);
  if (!tier || !tier.isActive) {
    await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
    throw new Error('Ticket tier not found or inactive');
  }

  // PREVENT REPLAY ATTACKS: Ensure paymentRef has not already been used for another party
  const reusedTicket = await Ticket.exists({ paymentRef, partyId: { $ne: party._id } });
  if (reusedTicket) {
    await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
    throw new Error('Payment reference has already been consumed by another transaction');
  }

  let paymentVerified = false;

  // Paystack verification
  if (claimedOrder.paymentProvider === 'paystack') {
    if (process.env.NODE_ENV !== 'test') {
      if (!claimedOrder.paymentReference) {
        await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
        throw new Error('Paystack order missing server-generated payment reference');
      }
      const verifyRes = await PaystackService.verifyTransaction(claimedOrder.paymentReference);
      if (!verifyRes.status || !verifyRes.data || verifyRes.data.status !== 'success') {
        await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
        throw new Error(`Paystack payment verification failed: ${verifyRes.message || 'Payment not successful'}`);
      }
      const expectedKobo = claimedOrder.priceNaira * 100;
      if (verifyRes.data.amount !== expectedKobo || verifyRes.data.currency?.toUpperCase() !== 'NGN') {
        await TicketOrder.findByIdAndUpdate(claimedOrder._id, { $set: { status: 'failed' } });
        throw new Error('Paid transaction amount or currency mismatch');
      }
      paymentVerified = true;
    } else {
      paymentVerified = true;
    }
  }

  const singlePrice = tier.price;
  const singlePlatformFee = Math.floor(singlePrice * party.platformFeeRate);
  const singleOrganizerNaira = singlePrice - singlePlatformFee;
  const qty = claimedOrder.quantity;

  const diamondRate = await getDiamondNairaRate();
  const requiredDiamonds = Math.ceil(claimedOrder.priceNaira / diamondRate);
  const estimatedUsdVal = parseFloat((claimedOrder.priceNaira / 1500).toFixed(2));

  // 1. PRE-GENERATE ALL TICKETS & 2D SCANNABLE QR CODES OUTSIDE MONGO TRANSACTION NETWORK I/O
  const preparedTickets: any[] = [];
  for (let i = 0; i < qty; i++) {
    const ticketCode = await generateTicketCode();
    const qrData = `https://zippo.com.ng/ticket/${ticketCode}`;
    const realQrUrl = await generateQRCode(qrData);

    preparedTickets.push({
      partyId: party._id,
      tierId: tier.tierId,
      tierName: tier.name,
      buyerId: claimedOrder.buyerId,
      buyerName: claimedOrder.buyerName,
      ticketCode,
      qrCodeUrl: realQrUrl,
      priceNaira: singlePrice,
      platformFeeNaira: singlePlatformFee,
      organizerNaira: singleOrganizerNaira,
      paymentStatus: 'paid',
      paymentRef,
      paidAt: new Date(),
      entryStatus: 'not_entered',
      isValid: true,
    });
  }

  const createdTickets: any[] = [];

  const executeFulfillmentMutations = async (session?: mongoose.ClientSession) => {
    const opts = session ? { session, new: true } : { new: true };

    // Mark Order as Fulfilled
    const updatedOrder = await TicketOrder.findOneAndUpdate(
      { _id: claimedOrder._id, status: 'processing' },
      { $set: { status: 'fulfilled', fulfilledAt: new Date(), paymentReference: paymentRef } },
      opts
    );

    if (!updatedOrder) {
      const existing = await Ticket.find({ paymentRef }).lean();
      return { order: claimedOrder, tickets: existing, isAlreadyFulfilled: true };
    }

    // Transactional Per-Person Limit
    const existingPaidCount = await Ticket.countDocuments(
      { partyId: party._id, tierId: tier.tierId, buyerId: claimedOrder.buyerId, paymentStatus: 'paid' },
      session ? { session } : {}
    );
    if (existingPaidCount + qty > tier.perPersonLimit) {
      throw new Error(`Maximum ${tier.perPersonLimit} tickets per person for this tier`);
    }

    // Atomic Conditional Inventory Reservation
    const maxAllowedSold = tier.quantity - qty;
    const reserveResult = await Party.updateOne(
      {
        _id: party._id,
        ticketTiers: {
          $elemMatch: {
            tierId: tier.tierId,
            sold: { $lte: maxAllowedSold },
          },
        },
      },
      {
        $inc: {
          'ticketTiers.$.sold': qty,
          totalRevenue: claimedOrder.priceNaira,
        },
      },
      session ? { session } : {}
    );

    if (reserveResult.modifiedCount === 0) {
      throw new Error('Not enough tickets available for this tier');
    }

    // Wallet Debit (if wallet order)
    if (claimedOrder.paymentProvider === 'wallet') {
      const updatedUser = await AdultUser.findOneAndUpdate(
        { _id: claimedOrder.buyerId, credits: { $gte: requiredDiamonds } },
        { $inc: { credits: -requiredDiamonds } },
        opts
      );
      if (!updatedUser) {
        throw new Error(`Insufficient wallet balance. Required: 💎 ${requiredDiamonds}`);
      }

      await CreditTransaction.create(
        [
          {
            userId: claimedOrder.buyerId,
            type: 'ticket_purchase',
            amount: -requiredDiamonds,
            usdAmount: estimatedUsdVal,
            nairaAmount: -claimedOrder.priceNaira,
            description: `Ticket Purchase - ${claimedOrder.quantity} ticket(s) for ${party.title}`,
            relatedUserId: party.organizerId,
            status: 'completed',
            metadata: { orderId: claimedOrder._id, partyId: party._id, tierId: claimedOrder.tierId },
          },
        ],
        session ? { session } : {}
      );
    }

    // Insert Pre-Generated Tickets
    const docs = await Ticket.create(preparedTickets, session ? { session } : {});
    createdTickets.push(...docs);

    // Record Platform Earning
    if (createdTickets.length > 0) {
      await PlatformEarning.create(
        [
          {
            source: 'ticket_sale',
            amount: claimedOrder.platformFeeNaira,
            nairaValue: claimedOrder.platformFeeNaira,
            fromUserId: claimedOrder.buyerId,
            toProviderId: party.organizerId,
            referenceId: createdTickets[0]._id,
            metadata: { partyId: party._id, partyTitle: party.title, quantity: qty, tierName: tier.name },
          },
        ],
        session ? { session } : {}
      );
    }

    return { order: updatedOrder, tickets: createdTickets, isAlreadyFulfilled: false };
  };

  let dbSession: mongoose.ClientSession | null = null;
  let fulfillmentResult: any = null;

  try {
    dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    try {
      fulfillmentResult = await executeFulfillmentMutations(dbSession);
      await dbSession.commitTransaction();
    } catch (innerErr) {
      await dbSession.abortTransaction().catch(() => {});
      throw innerErr;
    } finally {
      dbSession.endSession();
      dbSession = null;
    }

    // Email dispatch AFTER transaction commit
    if (claimedOrder.buyerId) {
      const buyerDoc = await AdultUser.findById(claimedOrder.buyerId).select('email displayName').lean();
      if (buyerDoc?.email) {
        void sendEmail({
          to: buyerDoc.email,
          toName: buyerDoc.displayName || claimedOrder.buyerName,
          subject: `Ticket Confirmation: ${party.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0608; color: #ffffff;">
              <h2 style="color: #c8102e;">🎟 Your Tickets for ${party.title}</h2>
              <p>Hi ${buyerDoc.displayName || claimedOrder.buyerName},</p>
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
                ${createdTickets.map((t) => `<li><strong>${t.ticketCode}</strong> - <a href="${t.qrCodeUrl}" style="color: #f5b041;">View QR Code</a></li>`).join('')}
              </ul>
            </div>
          `,
        });
      }
    }

    return fulfillmentResult;
  } catch (err: any) {
    // Attempt automatic Paystack refund dispatch ONLY if payment was confirmed captured AND this invocation held the processing claim
    let finalStatus: 'refunded' | 'refund_pending' | 'failed' = 'failed';
    let refundRef: string | undefined = undefined;

    if (claimedOrder.paymentProvider === 'paystack' && paymentVerified) {
      try {
        const refundRes = await PaystackService.refundTransaction(paymentRef, claimedOrder.priceNaira * 100);
        if (refundRes?.status) {
          finalStatus = 'refunded';
          refundRef = String(refundRes?.data?.id || paymentRef);
        } else {
          finalStatus = 'refund_pending';
        }
      } catch {
        finalStatus = 'refund_pending';
      }
    }

    await TicketOrder.findByIdAndUpdate(claimedOrder._id, {
      $set: { status: finalStatus, refundReference: refundRef, updatedAt: new Date() },
    }).catch(() => {});

    if (claimedOrder.paymentProvider === 'paystack') {
      console.warn(`[Paystack Refund Reconciliation] Order ${claimedOrder._id} (${claimedOrder.orderReference}) status: ${finalStatus}. Reason: ${err.message}`);
    }

    throw err;
  }
};

// POST /api/v1/parties/:partyId/tickets/orders
export const createTicketOrder = async (req: Request, res: Response) => {
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
      return res.status(400).json({ success: false, error: parseResult.error.issues[0]?.message || 'Invalid order data' });
    }

    const { tierId, quantity: qty, idempotencyKey: rawIdempotencyKey, paymentProvider = 'paystack' } = parseResult.data;
    const idempotencyKey = rawIdempotencyKey
      ? `${buyerId}_${partyId}_${tierId}_${rawIdempotencyKey}`
      : undefined;

    if (paymentProvider === 'simulated' && process.env.NODE_ENV !== 'test') {
      return res.status(400).json({
        success: false,
        error: 'Simulated payment is disabled in production. Please select Wallet or Paystack.',
      });
    }

    // 1. Validate party
    const party = await Party.findOne({
      _id: partyId,
      status: 'approved',
      startDate: { $gte: new Date() },
    });
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found, not approved, or has already ended' });
    }

    // 2. Validate tier
    const tier = party.ticketTiers.find((t) => t.tierId === tierId && t.isActive);
    if (!tier) {
      return res.status(404).json({ success: false, error: 'Ticket tier not found or is inactive' });
    }

    // 3. Check per-person limit
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
      });
    }

    // 4. Exact Fee Calculations
    const singlePrice = tier.price;
    const singlePlatformFee = Math.floor(singlePrice * party.platformFeeRate);
    const singleOrganizerNaira = singlePrice - singlePlatformFee;

    const priceNaira = singlePrice * qty;
    const platformFeeNaira = singlePlatformFee * qty;
    const organizerNaira = singleOrganizerNaira * qty;

    // STRICT IDEMPOTENCY KEY CONTRACT:
    // If idempotencyKey is supplied, reuse matching order or create new one.
    // If no idempotencyKey is supplied, always generate a brand-new TicketOrder.
    let order = null;
    if (idempotencyKey) {
      order = await TicketOrder.findOne({ idempotencyKey });
    }

    if (!order) {
      const newOrderRef = generateOrderReference();
      const newPaystackRef = `paystack_tkt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const providerRef = paymentProvider === 'paystack' ? newPaystackRef : newOrderRef;

      try {
        order = await TicketOrder.create({
          orderReference: newOrderRef,
          idempotencyKey,
          partyId: party._id,
          tierId: tier.tierId,
          tierName: tier.name,
          buyerId,
          buyerName,
          quantity: qty,
          priceNaira,
          platformFeeNaira,
          organizerNaira,
          paymentProvider: paymentProvider as 'paystack' | 'wallet' | 'simulated',
          paymentReference: newPaystackRef,
          providerReference: providerRef,
          status: 'pending',
        });
      } catch (err: any) {
        // Handle E11000 race condition on idempotencyKey
        if (err.code === 11000 && idempotencyKey) {
          order = await TicketOrder.findOne({ idempotencyKey });
        }
        if (!order) throw err;
      }
    }

    const orderReference = order.orderReference;
    const paymentReference = order.paymentReference || `paystack_tkt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    if (paymentProvider === 'paystack' && process.env.NODE_ENV !== 'test') {
      const defaultFrontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
      const callbackUrl = `${defaultFrontendUrl}/me/tickets`;

      const paystackRes = await PaystackService.initializeTransaction({
        email: buyerEmail || `${buyerId}@zippo.app`,
        amountKobo: priceNaira * 100,
        reference: paymentReference,
        callbackUrl,
        metadata: {
          orderId: order._id.toString(),
          partyId: party._id.toString(),
          tierId: tier.tierId,
          buyerId: buyerId.toString(),
        },
      });

      if (!paystackRes.status || !paystackRes.data?.authorization_url) {
        order.status = 'failed';
        await order.save();
        return res.status(500).json({ success: false, error: paystackRes.message || 'Failed to initialize Paystack checkout' });
      }

      return res.status(201).json({
        success: true,
        orderId: order._id,
        orderReference: order.orderReference,
        paymentReference,
        authorizationUrl: paystackRes.data.authorization_url,
      });
    }

    // For wallet or test environment, fulfill immediately inside MongoDB transaction
    const fulfillment = await fulfillTicketOrderInternal(order._id.toString());

    return res.status(201).json({
      success: true,
      orderReference: order.orderReference,
      tickets: fulfillment.tickets.map((t: any) => ({
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
    console.error('Error creating ticket order:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create ticket order' });
  }
};

// POST /api/v1/parties/orders/:orderId/verify
export const verifyTicketOrder = async (req: Request, res: Response) => {
  try {
    const rawOrderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.partyId || req.params.orderId;
    const userId = (req as any).adultUser?._id || (req as any).user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let order = null;
    if (typeof rawOrderId === 'string' && mongoose.Types.ObjectId.isValid(rawOrderId)) {
      order = await TicketOrder.findById(rawOrderId);
    }
    if (!order) {
      order = await TicketOrder.findOne({
        $or: [{ paymentReference: rawOrderId }, { orderReference: rawOrderId }],
      });
    }
    if (!order) {
      return res.status(404).json({ success: false, error: 'Ticket order not found' });
    }

    // STRICT OWNER AUTHORIZATION CHECK
    if (order.buyerId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this ticket order' });
    }

    const fulfillment = await fulfillTicketOrderInternal(order._id.toString());

    return res.json({
      success: true,
      orderReference: fulfillment.order.orderReference,
      status: fulfillment.order.status,
      tickets: fulfillment.tickets.map((t: any) => ({
        ticketCode: t.ticketCode,
        qrCodeUrl: t.qrCodeUrl,
        tierName: t.tierName,
        entryStatus: t.entryStatus,
      })),
    });
  } catch (err: any) {
    console.error('Error verifying ticket order:', err);
    return res.status(400).json({ success: false, error: err.message || 'Order verification failed' });
  }
};

// POST /api/v1/parties/orders/paystack-webhook
export const handlePaystackTicketWebhook = async (req: Request, res: Response) => {
  try {
    const signature = (req.headers['x-paystack-signature'] as string) || '';
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);
    if (!isValid && process.env.NODE_ENV !== 'test') {
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const payload = req.body;
    if (payload?.event === 'charge.success') {
      const data = payload.data;
      const reference = data?.reference;
      if (reference) {
        const order = await TicketOrder.findOne({ paymentReference: reference });
        if (order) {
          // Terminal no-op for already processing / fulfilled / refunded orders -> return 200 immediately
          if (order.status === 'fulfilled' || order.status === 'processing') {
            return res.status(200).json({ status: 'success', message: 'Order already processed or processing' });
          }
          if (order.status === 'pending') {
            await fulfillTicketOrderInternal(order._id.toString());
          }
        }
      }
    }

    return res.status(200).json({ status: 'success' });
  } catch (err: any) {
    console.error('Paystack ticket webhook error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Webhook processing error' });
  }
};

// POST /api/v1/parties/:partyId/tickets/purchase (Legacy alias route wrapping order creation)
export const purchaseTickets = async (req: Request, res: Response) => {
  return createTicketOrder(req, res);
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
      buyerId: userId,
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
  const lockKey = `guard_lock:${clientIp}:${partyId}`;
  const now = Date.now();

  // Try Redis first, fall back to memory
  const cachedRecord = await getCache(lockKey);
  const memoryRecord = guardFailedAttempts.get(lockKey);
  const record = cachedRecord || memoryRecord;

  if (record && record.lockedUntil > now) {
    return { authorized: false, party: null, isOrganizer: false, lockedOut: true };
  }

  const party = await Party.findById(partyId).lean();
  if (!party) return { authorized: false, party: null, isOrganizer: false, lockedOut: false };

  const guardCode = req.headers['x-guard-code'] as string;
  if (guardCode && party.guardAccessCodeHash) {
    let pinValid = false;
    // Support legacy sha256 or bcrypt
    if (party.guardAccessCodeHash.startsWith('$2a$') || party.guardAccessCodeHash.startsWith('$2b$')) {
      pinValid = await bcrypt.compare(guardCode.trim(), party.guardAccessCodeHash);
    } else {
      const hash = crypto.createHash('sha256').update(guardCode.trim()).digest('hex');
      const expectedBuf = Buffer.from(party.guardAccessCodeHash, 'hex');
      const actualBuf = Buffer.from(hash, 'hex');
      pinValid = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
    }

    if (pinValid) {
      guardFailedAttempts.delete(lockKey);
      await deleteCache(lockKey);
      return { authorized: true, party, isOrganizer: false, lockedOut: false };
    } else {
      // Record failed attempt
      const attempts = (record?.count || 0) + 1;
      const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0; // Lockout for 15 mins after 5 failures
      const updatedRecord = { count: attempts, lockedUntil };
      guardFailedAttempts.set(lockKey, updatedRecord);
      await setCache(lockKey, 15 * 60, updatedRecord);
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
    // 1. Zod schema validation first to avoid executing auth/DB operations on malformed payloads
    const parseResult = checkinScanSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid check-in request data',
      });
    }

    const partyId = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
    const { ticketCode, action } = parseResult.data;

    const { authorized, party, lockedOut } = await authenticateGuardOrOrganizer(req, partyId);
    if (lockedOut) {
      return res.status(429).json({ success: false, error: 'Too many failed PIN attempts. Locked out for 15 minutes.' });
    }
    if (!authorized || !party) {
      return res.status(403).json({ success: false, error: 'Invalid guard code' });
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
