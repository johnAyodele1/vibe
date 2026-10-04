import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PartyPayoutRequest from '../models/PartyPayoutRequest';
import TicketOrder from '../models/TicketOrder';
import { failPartyPayoutAndRelease, getAdminActorId, reconcilePartyPayout } from '../services/partyPayoutAccounting.service';
const ACTIVE_STATUSES = ['requested', 'verifying', 'processing'];

export const adminGetPartyPayouts = async (req: Request, res: Response) => {
  try {

    const status = String(req.query.status || 'requested');
    const filter: any = {};

    if (status !== 'all') {
      filter.status = status;
    }

    const [requests, counts] = await Promise.all([
      PartyPayoutRequest.find(filter)
        .sort({ requestedAt: 1 })
        .limit(Math.min(parseInt(String(req.query.limit || 50), 10) || 50, 100))
        .populate('organizerId', 'displayName username email')
        .populate('partyIds', 'title')
        .lean(),
      PartyPayoutRequest.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amountNaira: { $sum: '$amountNaira' },
          },
        },
      ]),
    ]);

    const countMap = Object.fromEntries(
      counts.map((row: any) => [
        row._id,
        { count: row.count, amountNaira: row.amountNaira },
      ])
    );

    return res.json({
      success: true,
      requests,
      counts: {
        requested: countMap.requested?.count || 0,
        verifying: countMap.verifying?.count || 0,
        processing: countMap.processing?.count || 0,
        paid: countMap.paid?.count || 0,
        rejected: countMap.rejected?.count || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to load party payouts' });
  }
};

export const adminVerifyPartyPayout = async (req: Request, res: Response) => {
  try {
    const actorId = getAdminActorId(req);
    const { requestId } = req.params;
    const payout = await PartyPayoutRequest.findOneAndUpdate(
      { _id: requestId, status: 'requested', isActive: true },
      {
        $set: {
          status: 'verifying',
          verifiedAt: new Date(),
          ...(actorId ? { verifiedBy: actorId } : {}),
        },
      },
      { new: true }
    );

    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Party payout request not found or no longer awaiting verification.',
      });
    }

    return res.json({ success: true, payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to verify party payout' });
  }
};

export const adminProcessPartyPayout = async (req: Request, res: Response) => {
  try {
    const actorId = getAdminActorId(req);
    const { requestId } = req.params;
    const payout = await PartyPayoutRequest.findOneAndUpdate(
      { _id: requestId, status: 'verifying', isActive: true },
      {
        $set: {
          status: 'processing',
          processingAt: new Date(),
          ...(actorId ? { processingBy: actorId } : {}),
        },
      },
      { new: true }
    );

    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Party payout request must be verified before processing.',
      });
    }

    return res.json({ success: true, payout });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to process party payout' });
  }
};

export const adminCompletePartyPayout = async (req: Request, res: Response) => {
  try {
    const actorId = getAdminActorId(req);
    const { requestId } = req.params;
    const reference = String(req.body?.reference || '').trim();
    const notes = String(req.body?.notes || '').trim();

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const payout = await PartyPayoutRequest.findOne({
        _id: requestId,
        status: 'processing',
        isActive: true,
      }).session(session);

      if (!payout) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: 'Party payout request must be in processing status before it can be marked paid.',
        });
      }

      const reconciliation = await reconcilePartyPayout(payout, session);

      if (!reconciliation.valid) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          error: 'Party payout no longer matches its claimed ticket earnings. It cannot be marked paid.',
          reconciliation,
        });
      }

      payout.status = 'paid';
      payout.isActive = false;
      payout.processedAt = new Date();
      if (reference) payout.adminReference = reference;
      if (notes) payout.adminNotes = notes;
      if (actorId) payout.processedBy = actorId;

      await payout.save({ session });
      await session.commitTransaction();

      return res.json({ success: true, payout });
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to complete party payout' });
  }
};

export const adminFailPartyPayout = async (req: Request, res: Response) => {
  try {
    const actorId = getAdminActorId(req);
    const { requestId } = req.params;
    const reason = String(req.body?.reason || '').trim();

    if (!reason) {
      return res.status(400).json({ success: false, error: 'A failure reason is required.' });
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const payout = await failPartyPayoutAndRelease(
        new mongoose.Types.ObjectId(requestId),
        reason,
        session,
        actorId && mongoose.Types.ObjectId.isValid(actorId) ? new mongoose.Types.ObjectId(actorId) : undefined
      );

      if (!payout) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: 'Only a processing party payout can be failed and released.',
        });
      }

      await session.commitTransaction();
      return res.json({ success: true, payout });
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to release party payout' });
  }
};

export const adminRejectPartyPayout = async (req: Request, res: Response) => {
  try {

    const { requestId } = req.params;
    const reason = String(req.body?.reason || '').trim();

    if (!reason) {
      return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const payout = await PartyPayoutRequest.findOne({
        _id: requestId,
        status: { $in: ['requested', 'verifying'] },
        isActive: true,
      }).session(session);

      if (!payout) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: 'Only requested or verifying party payouts can be rejected.',
        });
      }

      await TicketOrder.updateMany(
        {
          _id: { $in: payout.ticketOrderIds },
          partyPayoutId: payout._id,
        },
        { $unset: { partyPayoutId: '' } },
        { session }
      );

      payout.status = 'rejected';
      payout.isActive = false;
      payout.adminNotes = reason;
      payout.rejectedAt = new Date();
      const actorId = getAdminActorId(req);
      if (actorId && mongoose.Types.ObjectId.isValid(actorId)) payout.rejectedBy = new mongoose.Types.ObjectId(actorId);

      await payout.save({ session });
      await session.commitTransaction();

      return res.json({ success: true, payout });
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to reject party payout' });
  }
};
