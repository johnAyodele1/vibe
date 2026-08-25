import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import PayoutRequest from '../models/PayoutRequest';
import Report from '../models/Report';
import CustomerRefund from '../models/CustomerRefund';
import { recordPlatformEarning } from '../shared/fees';
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

    // Optimization (⚡ Bolt): Execute independent queries for eligible transactions, disputed transactions,
    // and diamond rate concurrently via Promise.all with .lean() to eliminate waterfall latency and hydration overhead.
    const [eligibleTxs, disputedTxs, rate] = await Promise.all([
      CreditTransaction.find({
        userId: user._id,
        type: { $in: PROVIDER_EARNING_TYPES },
        status: 'completed',
        eligibleForPayout: true,
        paidOut: { $ne: true },
        inPayoutRequest: { $exists: false },
        inDispute: { $ne: true }
      }).lean(),
      CreditTransaction.find({
        userId: user._id,
        inDispute: true,
        paidOut: { $ne: true }
      }).lean(),
      getDiamondNairaRate(),
    ]);

    const eligibleTotal = eligibleTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
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
 * Helper to verify Admin authorization on requests.
 */
const verifyAdminAuth = (req: Request): boolean => {
  const adultUser = (req as any).adultUser;
  if (adultUser && (adultUser.role === 'admin' || adultUser.isAdmin === true)) {
    return true;
  }
  const user = (req as any).user;
  if (user && (user.role === 'admin' || user.isAdmin === true)) {
    return true;
  }
  const adminId = (req as any).adminId;
  return Boolean(adminId);
};

/**
 * GET /api/v1/admin/disputes
 */
export const adminGetDisputes = async (req: Request, res: Response) => {
  try {
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

    // Optimization: Use .lean() for read-only query
    const disputes = await Report.find({ type: 'service_dispute' }).sort({ createdAt: -1 }).lean();

    if (!disputes.length) {
      return res.json({ success: true, disputes: [] });
    }

    // Extract unique IDs to batch fetch dependencies and avoid N+1 queries
    const userIds = new Set<string>();
    const originalTxIds: string[] = [];
    const disputeReportIds: string[] = [];

    for (const dispute of disputes as any[]) {
      if (dispute.reported) userIds.add(dispute.reported.toString());
      if (dispute.reporter) userIds.add(dispute.reporter.toString());
      if (dispute.originalTxId) originalTxIds.push(dispute.originalTxId.toString());
      if (dispute._id) disputeReportIds.push(dispute._id.toString());
    }

    // Perform batched queries in parallel with .lean()
    const [users, originalTxs, customerRefunds] = await Promise.all([
      AdultUser.find({ _id: { $in: Array.from(userIds) } }).select('_id displayName username providerProfile').lean(),
      originalTxIds.length > 0 ? CreditTransaction.find({ _id: { $in: originalTxIds } }).select('_id status').lean() : [],
      disputeReportIds.length > 0 ? CustomerRefund.find({ disputeReportId: { $in: disputeReportIds } }).lean() : [],
    ]);

    // Build O(1) lookup maps
    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const txMap = new Map<string, any>();
    for (const tx of originalTxs) {
      txMap.set(tx._id.toString(), tx);
    }

    const refundMap = new Map<string, any>();
    for (const ref of customerRefunds) {
      if (ref.disputeReportId) {
        refundMap.set(ref.disputeReportId.toString(), ref);
      }
    }

    // Map dispute details synchronously without database calls inside the loop
    const disputesWithParties = (disputes as any[]).map((dispute: any) => {
      const provider = dispute.reported ? userMap.get(dispute.reported.toString()) : null;
      const member = dispute.reporter ? userMap.get(dispute.reporter.toString()) : null;
      const originalTx = dispute.originalTxId ? txMap.get(dispute.originalTxId.toString()) : null;
      const customerRefund = dispute._id ? refundMap.get(dispute._id.toString()) : null;

      const amountInDispute = dispute.amountInDispute || 0;
      const providerAmountHeld = dispute.providerAmountHeld || Math.floor(amountInDispute * 0.85);
      const platformFee = Math.max(0, amountInDispute - providerAmountHeld);

      return {
        ...dispute,
        providerName: provider?.providerProfile?.stageName || provider?.displayName || 'Provider',
        memberName: member?.displayName || member?.username || 'Member',
        amountInDispute,
        providerAmountHeld,
        platformFee,
        originalTxId: originalTx?._id || null,
        originalTxStatus: originalTx?.status || null,
        supportConversationId: `support_${dispute.reporter ? dispute.reporter.toString() : ''}`,
        customerRefund: customerRefund || null,
      };
    });

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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

    const { reportId } = req.params;
    const { resolution, adminNotes } = req.body;
    const adminId = (req as any).adminId || (req as any).userId || (req as any).adultUser?._id;

    if (!['upheld', 'dismissed'].includes(resolution)) {
      return res.status(400).json({ success: false, error: 'Invalid resolution status' });
    }

    // Atomic acquisition: transition report status from 'open' -> 'resolving' atomically
    const report = await Report.findOneAndUpdate(
      { _id: reportId, status: 'open' },
      { $set: { status: 'resolving' } },
      { new: true }
    );

    if (!report) {
      const existingReport = await Report.findById(reportId);
      if (!existingReport) {
        return res.status(404).json({ success: false, error: 'Dispute report not found' });
      }
      if (existingReport.resolution === resolution || existingReport.status === 'resolved') {
        return res.json({ success: true, resolution, alreadyResolved: true });
      }
      return res.status(409).json({ success: false, error: `Dispute already resolved as ${existingReport.resolution}` });
    }

    // NEVER GUESS THE ORIGINAL TRANSACTION: originalTxId must exist canonically
    if (!report.originalTxId) {
      // Revert status back to open if canonical originalTxId is missing
      await Report.updateOne({ _id: report._id }, { $set: { status: 'open' } });
      return res.status(400).json({
        success: false,
        error: 'ORIGINAL_TX_MISSING',
        message: 'Canonical originalTxId is missing from dispute report. Resolution cannot proceed without canonical transaction.'
      });
    }

    const originalTx = await CreditTransaction.findById(report.originalTxId);
    if (!originalTx) {
      await Report.updateOne({ _id: report._id }, { $set: { status: 'open' } });
      return res.status(400).json({
        success: false,
        error: 'ORIGINAL_TX_NOT_FOUND',
        message: 'Referenced original transaction was not found in database.'
      });
    }

    const amountInDispute = report.amountInDispute || 0;
    const providerAmountHeld = report.providerAmountHeld || Math.floor(amountInDispute * 0.85);
    const platformFee = Math.max(0, amountInDispute - providerAmountHeld);

    const runFinancialMutations = async (session?: mongoose.ClientSession) => {
      const opts = session ? { session } : {};

      const currentTxQuery = CreditTransaction.findById(report.originalTxId);
      const currentTx = session ? await currentTxQuery.session(session) : await currentTxQuery;

      if (!currentTx) {
        throw new Error('Original transaction not found');
      }

      const reportQuery = Report.findById(report._id);
      const currentReport = session ? await reportQuery.session(session) : await reportQuery;

      if (resolution === 'upheld') {
        if (currentTx.status === 'reverted') {
          return { alreadyReverted: true };
        }

        currentTx.status = 'reverted';
        currentTx.inDispute = false;
        currentTx.disputeResolution = 'upheld';
        currentTx.disputeResolvedAt = new Date();
        currentTx.disputeResolvedBy = adminId;
        currentTx.eligibleForPayout = false;
        await currentTx.save(opts);

        const providerQuery = AdultUser.findById(report.reported);
        const provider = session ? await providerQuery.session(session) : await providerQuery;

        if (provider) {
          const recoverableAmount = Math.min(Math.max(0, provider.credits), providerAmountHeld);
          provider.credits -= recoverableAmount;
          if (provider.providerProfile) {
            provider.providerProfile.totalEarnings = Math.max(
              0,
              (provider.providerProfile.totalEarnings || 0) - providerAmountHeld
            );
          }
          await provider.save(opts);
        }

        if (platformFee > 0) {
          await recordPlatformEarning({
            source: 'service',
            amount: -platformFee,
            fromUserId: report.reporter,
            toProviderId: report.reported,
            referenceId: currentTx._id,
          }, opts);
        }

        // Automatically credit member's wallet balance on dispute uphold
        const customerQuery = AdultUser.findById(report.reporter);
        const customer = session ? await customerQuery.session(session) : await customerQuery;
        if (customer) {
          customer.credits += amountInDispute;
          await customer.save(opts);
        }

        // Create refund transaction record for customer wallet history
        const refundTxData = {
          userId: report.reporter,
          type: 'refund',
          amount: amountInDispute,
          usdAmount: amountInDispute * 0.0075,
          description: 'Dispute refund: Service payment returned',
          status: 'completed',
          relatedUserId: report.reported,
          metadata: { disputeReportId: report._id, originalTxId: currentTx._id },
        };

        if (session) {
          await CreditTransaction.create([refundTxData], { session });
        } else {
          await CreditTransaction.create(refundTxData);
        }

        const refundQuery = CustomerRefund.findOne({ disputeReportId: report._id });
        let customerRefund = session ? await refundQuery.session(session) : await refundQuery;

        if (!customerRefund) {
          const refundData = {
            originalTxId: currentTx._id,
            serviceRequestId: report.serviceRequestId,
            disputeReportId: report._id,
            customerId: report.reporter,
            providerId: report.reported,
            amount: amountInDispute,
            providerAmountReverted: providerAmountHeld,
            platformFeeReverted: platformFee,
            status: 'REFUND_COMPLETED',
            reference: 'Automatic dispute refund',
            adminId,
            resolvedAt: new Date(),
            completedAt: new Date(),
          };
          if (session) {
            await CustomerRefund.create([refundData], { session });
          } else {
            await CustomerRefund.create(refundData);
          }
        } else {
          customerRefund.status = 'REFUND_COMPLETED';
          customerRefund.completedAt = new Date();
          customerRefund.reference = 'Automatic dispute refund';
          await customerRefund.save(opts);
        }
      } else {
        currentTx.inDispute = false;
        currentTx.eligibleForPayout = true;
        currentTx.disputeResolution = 'dismissed';
        currentTx.disputeResolvedAt = new Date();
        currentTx.disputeResolvedBy = adminId;
        await currentTx.save(opts);
      }

      if (currentReport) {
        currentReport.status = 'resolved';
        currentReport.resolution = resolution;
        currentReport.adminNotes = adminNotes;
        currentReport.resolvedBy = adminId;
        currentReport.resolvedAt = new Date();
        await currentReport.save(opts);
      }

      return { success: true };
    };

    let result: any;
    let dbSession: mongoose.ClientSession | null = null;
    try {
      dbSession = await mongoose.startSession();
      dbSession.startTransaction();
      result = await runFinancialMutations(dbSession);
      await dbSession.commitTransaction();
    } catch (err: any) {
      if (dbSession) {
        await dbSession.abortTransaction().catch(() => {});
        dbSession.endSession();
        dbSession = null;
      }
      if (err.code === 20 || err.message?.includes('Transaction numbers are only allowed')) {
        result = await runFinancialMutations();
      } else {
        await Report.updateOne({ _id: report._id }, { $set: { status: 'open' } });
        throw err;
      }
    } finally {
      if (dbSession) {
        dbSession.endSession();
      }
    }

    if (result?.alreadyReverted) {
      return res.json({ success: true, resolution, alreadyReverted: true });
    }

    // Sockets emission
    const ns = req.app.get('adultNamespace');
    if (ns) {
      if (resolution === 'upheld') {
        const customer = await AdultUser.findById(report.reporter);
        if (customer) {
          ns.to(`user:${report.reporter.toString()}`).emit('wallet:updated', { balance: customer.credits });
          ns.to(`user:${report.reporter.toString()}`).emit('refund:completed', {
            amount: amountInDispute,
            reference: 'Automatic dispute refund',
          });
        }
      }

      ns.to(`user:${report.reporter.toString()}`).emit('dispute:resolved', {
        resolution,
        message: resolution === 'upheld'
          ? 'Dispute resolved in your favour — refund automatically added to your wallet'
          : 'The dispute was reviewed and dismissed.',
      });
      ns.to(`user:${report.reported.toString()}`).emit('dispute:resolved', {
        resolution,
        message: resolution === 'upheld'
          ? 'The dispute was upheld. The service payment was reverted.'
          : 'The dispute was dismissed. Your earnings have been released for payout.',
      });
    }

    return res.json({ success: true, resolution });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/admin/disputes/:reportId/refund-complete
 */
export const markRefundCompleted = async (req: Request, res: Response) => {
  try {
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

    const { reportId } = req.params;
    const { reference } = req.body;
    const adminId = (req as any).adminId || (req as any).userId || (req as any).adultUser?._id;

    const refund = await CustomerRefund.findOne({ disputeReportId: reportId });
    if (!refund) {
      return res.status(404).json({ success: false, error: 'Customer refund record not found' });
    }

    if (refund.status === 'REFUND_COMPLETED') {
      return res.json({ success: true, refund, alreadyCompleted: true });
    }

    // Credit customer's wallet balance
    const customer = await AdultUser.findById(refund.customerId);
    if (customer) {
      customer.credits += refund.amount;
      await customer.save();
    }

    refund.status = 'REFUND_COMPLETED';
    refund.completedAt = new Date();
    refund.reference = reference || 'Admin processed refund';
    refund.adminId = adminId;
    await refund.save();

    // Socket & Push
    const ns = req.app.get('adultNamespace');
    if (ns && customer) {
      ns.to(`user:${customer._id.toString()}`).emit('wallet:updated', { balance: customer.credits });
      ns.to(`user:${customer._id.toString()}`).emit('refund:completed', {
        amount: refund.amount,
        reference: refund.reference,
      });
    }

    return res.json({ success: true, refund });
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

    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document hydration overhead.
    const history = await PayoutRequest.find({ providerId: user._id })
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Optimization (⚡ Bolt): Use .lean() on read-only admin query to eliminate document hydration overhead
    const requests = await PayoutRequest.find(filter)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await PayoutRequest.countDocuments(filter);

    // Optimization (⚡ Bolt): Single database aggregation query for counts breakdown instead of 5 separate count queries
    const countAgg = await PayoutRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const countsMap = new Map(countAgg.map(item => [item._id, item.count]));

    const counts = {
      queued: countsMap.get('queued') || 0,
      verifying: countsMap.get('verifying') || 0,
      processing: countsMap.get('processing') || 0,
      completed: countsMap.get('completed') || 0,
      rejected: countsMap.get('rejected') || 0,
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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

    const { requestId } = req.params;
    const { reference } = req.body;
    const payout = await PayoutRequest.findById(requestId);

    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found' });
    }

    if (payout.status !== 'processing') {
      return res.status(400).json({ success: false, message: 'Payout request must be in processing status to complete' });
    }

    // Filter out any transaction that has been reverted in the meantime
    const validTxs = await CreditTransaction.find({
      _id: { $in: payout.eligibleTransactionIds },
      status: { $ne: 'reverted' }
    });

    const validTxIds = validTxs.map(t => t._id);
    const actualPayableAmount = validTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // 1. Deduct diamonds from provider wallet balance
    const provider = await AdultUser.findById(payout.providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider user not found' });
    }

    const payoutDeduction = Math.min(payout.amount, actualPayableAmount);

    if (provider.credits < payoutDeduction) {
      return res.status(400).json({ success: false, message: 'Provider has insufficient credits to complete this payout' });
    }

    provider.credits -= payoutDeduction;
    if (provider.providerProfile) {
      (provider.providerProfile as any).totalPayouts = ((provider.providerProfile as any).totalPayouts || 0) + payoutDeduction;
    }
    await provider.save();

    // 2. Mark valid covered transactions as paidOut: true (excluding reverted)
    await CreditTransaction.updateMany(
      { _id: { $in: validTxIds } },
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
    if (!verifyAdminAuth(req)) {
      return res.status(403).json({ success: false, error: 'Admin authorization required' });
    }

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
