import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import Report from '../models/Report';
import { getDiamondNairaRate } from '../shared/pricing';
import { sendPushToUser } from '../shared/push';
import { PROVIDER_EARNING_TYPES } from '../shared/earnings';

/**
 * Helper to construct payout details snapshot from provider profile.
 */
const buildPayoutDetailsSnapshot = (user: any) => {
  const profile: any = user.providerProfile || {};
  const method = profile.payoutInfo?.method || profile.payoutMethod || 'pending';
  const details = profile.payoutInfo?.details || {};

  return {
    bankName: details.bankName || details.bankDetails?.bankName || '',
    accountHolder: details.accountHolder || details.bankDetails?.accountHolder || details.accountHolderName || '',
    accountNumber: details.accountNumber || details.bankDetails?.accountNumber || '',
    sortCode: details.routingCode || details.routingNumber || details.bankDetails?.routingNumber || details.sortCode || '',
    accountType: details.accountType || details.bankDetails?.accountType || '',
    paypalEmail: details.paypalEmail || '',
    cryptoCurrency: details.currency || details.cryptoCurrency || '',
    cryptoAddress: details.address || details.cryptoAddress || '',
  };
};

/**
 * GET /api/v1/adult/providers/me/payout/eligible
 */
export const getEligiblePayout = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can check eligible payouts' });
    }

    // Unpaid, eligible transactions for this provider
    const eligibleTxs = await CreditTransaction.find({
      userId: user._id,
      type: { $in: PROVIDER_EARNING_TYPES },
      status: 'completed',
      eligibleForPayout: true,
      paidOut: { $ne: true },
      inPayoutRequest: { $exists: false },
      inDispute: { $ne: true }
    });

    const disputedTxs = await CreditTransaction.find({
      userId: user._id,
      inDispute: true,
      paidOut: { $ne: true }
    });

    const eligibleTotal = eligibleTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const rate = await getDiamondNairaRate();
    const eligibleNaira = eligibleTotal * rate;

    const disputedAmount = disputedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const disputedNaira = disputedAmount * rate;

    // Breakdown calculation
    const breakdown = {
      tips: 0,
      calls: 0,
      service_charges: 0,
      gifts: 0,
      paid_media: 0,
      spin_wheel: 0,
    };

    eligibleTxs.forEach(tx => {
      const amt = Math.abs(tx.amount);
      const typeStr = tx.type as string;
      if (typeStr === 'tip_received' || typeStr === 'cam_tip' || typeStr === 'tip') {
        breakdown.tips += amt;
      } else if (typeStr === 'call_earning') {
        breakdown.calls += amt;
      } else if (typeStr === 'service_payment_received') {
        breakdown.service_charges += amt;
      } else if (typeStr === 'gift_received') {
        breakdown.gifts += amt;
      } else if (typeStr === 'paid_media_earning' || typeStr === 'paid_media_unlock') {
        breakdown.paid_media += amt;
      } else if (typeStr === 'spin_earning' || typeStr === 'spin_wheel') {
        breakdown.spin_wheel += amt;
      }
    });

    return res.json({
      success: true,
      eligibleAmount: eligibleTotal,
      eligibleNaira,
      disputedAmount,
      disputedNaira,
      disputeCount: disputedTxs.length,
      eligibleTransactionIds: eligibleTxs.map(tx => tx._id),
      breakdown,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/admin/disputes
 */
export const adminGetDisputes = async (req: Request, res: Response) => {
  try {
    const disputes = await Report.find({ type: 'service_dispute' }).sort({ createdAt: -1 });

    const disputesWithParties = await Promise.all(disputes.map(async (dispute) => {
      const provider = await AdultUser.findById(dispute.reported);
      const member = await AdultUser.findById(dispute.reporter);

      return {
        ...dispute.toObject(),
        providerName: provider?.providerProfile?.stageName || provider?.displayName || 'Provider',
        memberName: member?.displayName || member?.username || 'Member',
      };
    }));

    return res.json({ success: true, disputes: disputesWithParties });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/admin/disputes/:reportId/resolve
 */
export const resolveDispute = async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { resolution, adminNotes } = req.body;
    const adminId = (req as any).adminId || (req as any).userId;

    if (!['upheld', 'dismissed'].includes(resolution)) {
      return res.status(400).json({ success: false, error: 'Invalid resolution status' });
    }

    const report = await Report.findById(reportId);
    if (!report || report.status !== 'open') {
      return res.status(404).json({ success: false, error: 'Dispute not found or already resolved' });
    }

    if (resolution === 'upheld') {
      // Refund the member
      await AdultUser.findOneAndUpdate(
        { _id: report.reporter },
        { $inc: { credits: report.amountInDispute || 0 } }
      );

      // Deduct from provider
      await AdultUser.findOneAndUpdate(
        { _id: report.reported },
        { $inc: { credits: -(report.providerAmountHeld || 0) } }
      );

      // Mark transaction as inDispute = false, resolution = upheld
      await CreditTransaction.updateOne(
        { userId: report.reported, 'metadata.serviceRequestId': report.serviceRequestId, type: 'service_payment_received' },
        {
          $set: {
            eligibleForPayout: false,
            inDispute: false,
            disputeResolution: 'upheld',
            disputeResolvedAt: new Date(),
          }
        }
      );
    } else {
      // Release payment to provider: make transaction eligible for payout again
      await CreditTransaction.updateOne(
        { userId: report.reported, 'metadata.serviceRequestId': report.serviceRequestId, type: 'service_payment_received' },
        {
          $set: {
            eligibleForPayout: true,
            inDispute: false,
            disputeResolution: 'dismissed',
            disputeResolvedAt: new Date(),
          }
        }
      );
    }

    // Update report
    report.status = 'resolved';
    report.resolution = resolution;
    report.adminNotes = adminNotes;
    report.resolvedBy = adminId;
    report.resolvedAt = new Date();
    await report.save();

    // Sockets emission
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${report.reporter.toString()}`).emit('dispute:resolved', {
        resolution,
        message: resolution === 'upheld'
          ? 'Dispute resolved in your favour — refund applied'
          : 'The dispute was reviewed and dismissed.',
      });
      ns.to(`user:${report.reported.toString()}`).emit('dispute:resolved', {
        resolution,
        message: resolution === 'upheld'
          ? 'The dispute was upheld. The service charge was refunded to the member.'
          : 'The dispute was dismissed. Your earnings have been released for payout.',
      });
    }

    return res.json({ success: true, resolution });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/adult/providers/me/payout/request
 */
export const requestPayout = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can request payout' } });
    }

    const profile: any = user.providerProfile || {};
    const method = profile.payoutInfo?.method || profile.payoutMethod || 'pending';

    // 1. Get provider's payout method - reject if not configured
    if (!method || method === 'pending' || method === '') {
      return res.status(400).json({
        success: false,
        error: 'PAYOUT_METHOD_NOT_SET',
        message: 'Please set up your payout method in Settings before requesting a payout.',
        action: 'Go to Settings → Payout Settings',
      });
    }

    // 2. Check no existing pending request
    const existing = await PayoutRequest.findOne({
      providerId: user._id,
      status: { $in: ['pending', 'queued', 'verifying', 'processing'] },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'REQUEST_ALREADY_PENDING',
        message: 'You already have a payout in progress.',
        existingRequestId: existing._id,
      });
    }

    // 3. Calculate eligible amount
    const eligibleTxs = await CreditTransaction.find({
      userId: user._id,
      type: { $in: PROVIDER_EARNING_TYPES },
      status: 'completed',
      eligibleForPayout: true,
      paidOut: { $ne: true },
      inPayoutRequest: { $exists: false },
      inDispute: { $ne: true }
    });

    const eligibleTotal = eligibleTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const rate = await getDiamondNairaRate();

    if (eligibleTotal <= 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_ELIGIBLE_BALANCE',
        message: 'You have no earnings available for payout. Earnings become available after services are confirmed.',
      });
    }

    if (eligibleTotal < 500) {
      return res.status(400).json({
        success: false,
        error: 'MINIMUM_THRESHOLD_NOT_MET',
        message: `Minimum payout threshold is 500 diamonds (≈ ₦${(500 * rate).toLocaleString('en-NG')}).`,
      });
    }

    if (req.body.amount !== undefined && req.body.amount < 500) {
      return res.status(400).json({
        success: false,
        error: 'MINIMUM_THRESHOLD_NOT_MET',
        message: `Requested payout amount must be at least 500 diamonds (≈ ₦${(500 * rate).toLocaleString('en-NG')}).`,
      });
    }

    const requestedAmount = req.body.amount
      ? Math.min(req.body.amount, eligibleTotal)
      : eligibleTotal;

    // Double check: can provider afford to withdraw this amount (does provider have enough diamonds)?
    const finalAmount = Math.min(requestedAmount, user.credits);
    if (finalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_ELIGIBLE_BALANCE',
        message: 'No withdrawable balance remaining in your wallet',
      });
    }
    const amountNaira = finalAmount * rate;

    // 5. Get queue position
    const queueLength = await PayoutRequest.countDocuments({
      status: { $in: ['queued', 'verifying', 'processing'] },
    });
    const queuePosition = queueLength + 1;

    // 6. Snapshot payout details
    const payoutDetails = buildPayoutDetailsSnapshot(user);

    // 7. Create request
    const request = await PayoutRequest.create({
      providerId: user._id,
      providerName: profile.stageName || user.displayName || user.username,
      amount: finalAmount,
      amountNaira,
      nairaRateSnapshot: rate,
      status: 'queued',
      queuePosition,
      payoutMethod: method,
      payoutDetails,
      eligibleTransactionIds: eligibleTxs.map(t => t._id),
      requestedAt: new Date(),
      queuedAt: new Date(),
    });

    // 8. Mark transactions as "in payout" (frozen - cannot be double-paid)
    await CreditTransaction.updateMany(
      { _id: { $in: eligibleTxs.map(t => t._id) } },
      { $set: { inPayoutRequest: request._id } }
    );

    // 9. Notify admin (emit to admin socket room)
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.emit('admin:new_payout_request', {
        requestId: request._id,
        providerName: profile.stageName || user.displayName || user.username,
        amount: finalAmount,
        amountNaira,
      });
    }

    return res.status(201).json({
      success: true,
      requestId: request._id,
      amount: finalAmount,
      amountNaira,
      queuePosition,
      status: 'queued',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/adult/providers/me/payout/status
 */
export const getPayoutStatus = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can view payout status' });
    }

    const activeRequest = await PayoutRequest.findOne({
      providerId: user._id,
      status: { $in: ['pending', 'queued', 'verifying', 'processing'] }
    });

    if (!activeRequest) {
      const lastRequest = await PayoutRequest.findOne({ providerId: user._id }).sort({ requestedAt: -1 });
      if (lastRequest && (lastRequest.status === 'completed' || lastRequest.status === 'rejected')) {
        return res.json({ success: true, data: lastRequest });
      }
      return res.json({ success: true, data: null });
    }

    // Recalculate queue position dynamically
    const queuePosition = await PayoutRequest.countDocuments({
      status: { $in: ['queued', 'verifying', 'processing'] },
      requestedAt: { $lt: activeRequest.requestedAt }
    }) + 1;

    activeRequest.queuePosition = queuePosition;

    // Estimate time based on queuePosition (e.g. 1.5 hours per request, minimum 1 hour)
    const hours = Math.max(1, Math.round(queuePosition * 1.5));
    const estimatedTime = `${hours} hour${hours > 1 ? 's' : ''}`;

    const rawRequest = activeRequest.toObject();
    (rawRequest as any).estimatedTime = estimatedTime;

    return res.json({
      success: true,
      data: rawRequest
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/adult/providers/me/payout/history
 */
export const getPayoutHistory = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can view history' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const history = await PayoutRequest.find({ providerId: user._id })
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await PayoutRequest.countDocuments({ providerId: user._id });

    return res.json({
      success: true,
      data: history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ADMIN ENDPOINTS
 */

/**
 * GET /admin/payouts
 */
export const adminGetPayouts = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const requests = await PayoutRequest.find(filter)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await PayoutRequest.countDocuments(filter);

    // Counts breakdown
    const counts = {
      queued: await PayoutRequest.countDocuments({ status: 'queued' }),
      verifying: await PayoutRequest.countDocuments({ status: 'verifying' }),
      processing: await PayoutRequest.countDocuments({ status: 'processing' }),
      completed: await PayoutRequest.countDocuments({ status: 'completed' }),
      rejected: await PayoutRequest.countDocuments({ status: 'rejected' }),
    };

    return res.json({
      success: true,
      requests,
      counts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /admin/payouts/:requestId/verify
 */
export const adminVerifyPayout = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const payout = await PayoutRequest.findById(requestId);

    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found' });
    }

    if (payout.status !== 'queued') {
      return res.status(400).json({ success: false, message: 'Payout request must be queued to verify' });
    }

    payout.status = 'verifying';
    payout.verifyingAt = new Date();
    payout.processedBy = (req as any).adminId || (req as any).userId || undefined;

    await payout.save();
    return res.json({ success: true, data: payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /admin/payouts/:requestId/process
 */
export const adminProcessPayout = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const payout = await PayoutRequest.findById(requestId);

    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found' });
    }

    if (payout.status !== 'verifying') {
      return res.status(400).json({ success: false, message: 'Payout request must be in verifying status to process' });
    }

    payout.status = 'processing';
    payout.processingAt = new Date();

    await payout.save();
    return res.json({ success: true, data: payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /admin/payouts/:requestId/complete
 */
export const adminCompletePayout = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { reference } = req.body;
    const payout = await PayoutRequest.findById(requestId);

    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found' });
    }

    if (payout.status !== 'processing') {
      return res.status(400).json({ success: false, message: 'Payout request must be in processing status to complete' });
    }

    // 1. Deduct diamonds from provider wallet balance
    const provider = await AdultUser.findById(payout.providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider user not found' });
    }

    if (provider.credits < payout.amount) {
      return res.status(400).json({ success: false, message: 'Provider has insufficient credits to complete this payout' });
    }

    provider.credits -= payout.amount;
    if (provider.providerProfile) {
      // Record in total payouts or earnings
      (provider.providerProfile as any).totalPayouts = ((provider.providerProfile as any).totalPayouts || 0) + payout.amount;
    }
    await provider.save();

    // 2. Mark covered transactions as paidOut: true
    await CreditTransaction.updateMany(
      { _id: { $in: payout.eligibleTransactionIds } },
      { $set: { paidOut: true } }
    );

    // 3. Create a debit "payout" credit transaction to keep historical records consistent
    await CreditTransaction.create({
      userId: payout.providerId,
      type: 'payout',
      amount: -payout.amount,
      usdAmount: -(payout.amount * 0.0075),
      nairaAmount: -payout.amountNaira,
      description: `Payout completed: Ref ${reference || 'N/A'}`,
      status: 'completed',
    });

    // 4. Update PayoutRequest
    payout.status = 'completed';
    payout.completedAt = new Date();
    payout.adminReference = reference;
    await payout.save();

    // 5. Emit socket event
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${payout.providerId}`).emit('payout:completed', {
        requestId: payout._id,
        amount: payout.amount,
        adminReference: reference,
      });
    }

    // 6. Send push notification
    sendPushToUser(payout.providerId, {
      title: '✅ Payout Sent!',
      body: `Your payout of ₦${payout.amountNaira.toLocaleString('en-NG')} has been sent!`,
      tag: 'payout',
      url: '/adult/provider/payout',
      type: 'payout_update',
      unreadCount: 0,
    }).catch(err => console.error('[Push] Error sending completed payout push:', err));

    return res.json({ success: true, data: payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /admin/payouts/:requestId/reject
 */
export const adminRejectPayout = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reason for rejection is required' });
    }

    const payout = await PayoutRequest.findById(requestId);

    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found' });
    }

    if (!['queued', 'verifying', 'processing'].includes(payout.status)) {
      return res.status(400).json({ success: false, message: 'Can only reject pending/active payout requests' });
    }

    // 1. Return transactions to eligible state (remove inPayoutRequest)
    await CreditTransaction.updateMany(
      { _id: { $in: payout.eligibleTransactionIds } },
      { $unset: { inPayoutRequest: '' } }
    );

    // 2. Update status and save
    payout.status = 'rejected';
    payout.rejectedReason = reason;
    payout.rejectedAt = new Date();
    await payout.save();

    // 3. Emit socket event
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${payout.providerId}`).emit('payout:rejected', {
        requestId: payout._id,
        reason,
      });
    }

    // 4. Send push notification
    sendPushToUser(payout.providerId, {
      title: '⚠️ Payout Update',
      body: `Your payout request status has been updated.`,
      tag: 'payout',
      url: '/adult/provider/payout',
      type: 'payout_update',
      unreadCount: 0,
    }).catch(err => console.error('[Push] Error sending rejected payout push:', err));

    return res.json({ success: true, data: payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
