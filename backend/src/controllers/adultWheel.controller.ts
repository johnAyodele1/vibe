import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SpinWheel from '../models/SpinWheel';
import SpinResult from '../models/SpinResult';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import { socketService } from '../services/socketService';
import { calculateFees, recordPlatformEarning } from '../shared/fees';

export const pickWheelItem = (items: any[]) => {
  const pool = items.flatMap(item =>
    Array(item.probability || 1).fill(item)
  );
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked;
};

// GET /api/v1/adult/providers/:providerId/wheel
export const getProviderWheel = async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    const wheel = await SpinWheel.findOne({ providerId });
    if (!wheel) {
      return res.status(404).json({ success: false, error: 'Wheel config not found' });
    }
    return res.json({
      success: true,
      data: {
        isActive: wheel.isActive,
        items: wheel.items
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/providers/me/wheel
export const updateProviderWheel = async (req: Request, res: Response) => {
  try {
    const provider = req.adultUser;
    if (!provider || provider.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only service providers can configure wheels' });
    }

    const { isActive, items } = req.body;
    if (!Array.isArray(items) || items.length < 2 || items.length > 8) {
      return res.status(400).json({ success: false, error: 'Wheel must contain between 2 and 8 items' });
    }

    for (const item of items) {
      if (!item.id || !item.label || item.creditCost === undefined || !item.color) {
        return res.status(400).json({ success: false, error: 'Each item must have id, label, creditCost, and color' });
      }
      if (item.label.trim().length === 0 || item.label.length > 40) {
        return res.status(400).json({ success: false, error: 'Each item label must be between 1 and 40 characters' });
      }
      if (!Number.isInteger(item.creditCost) || item.creditCost < 5) {
        return res.status(400).json({ success: false, error: 'Each item credit cost must be an integer of at least 5' });
      }
      if (item.probability !== undefined && (!Number.isInteger(item.probability) || item.probability < 1 || item.probability > 10)) {
        return res.status(400).json({ success: false, error: 'Probability must be an integer between 1 and 10' });
      }
    }

    const wheel = await SpinWheel.findOneAndUpdate(
      { providerId: provider._id },
      {
        $set: {
          isActive: !!isActive,
          items: items.map(item => ({
            id: item.id,
            label: item.label.trim(),
            creditCost: item.creditCost,
            probability: item.probability || 1,
            color: item.color,
          }))
        }
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: wheel });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/providers/:providerId/wheel/spin
export const spinProviderWheel = async (req: Request, res: Response) => {
  const spinner = req.adultUser;
  if (!spinner) {
    return res.status(401).json({ success: false, error: 'Auth required' });
  }

  if (spinner.role !== 'user') {
    return res.status(403).json({ success: false, error: 'Only members can spin the wheel' });
  }

  const { providerId } = req.params;
  const { camSessionId } = req.body;

  if (spinner._id.toString() === providerId) {
    return res.status(403).json({ success: false, error: 'Cannot spin your own wheel' });
  }

  const maxRetries = 10;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wheel = await SpinWheel.findOne({ providerId }).session(session);
      if (!wheel || !wheel.isActive) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, error: 'Wheel is not active or not configured' });
      }

      const recipient = await AdultUser.findById(providerId).session(session);
      if (!recipient || recipient.role !== 'provider' || !recipient.isActive || recipient.isBanned) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ success: false, error: 'Provider is inactive or banned' });
      }

      // Pick the result using weighted random selection first
      const pickedItem = pickWheelItem(wheel.items);
      const cost = pickedItem.creditCost;

      // Fetch fresh spinner balance inside session
      const freshSpinner = await AdultUser.findById(spinner._id).session(session);
      const spinnerCredits = freshSpinner ? freshSpinner.credits : 0;

      // Atomic check and decrement spinner wallet
      const updatedSpinner = await AdultUser.findOneAndUpdate(
        { _id: spinner._id, credits: { $gte: cost } },
        { $inc: { credits: -cost } },
        { session, new: true }
      );

      if (!updatedSpinner) {
        await session.abortTransaction();
        session.endSession();
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          required: cost,
          current: spinnerCredits
        });
      }

      // Calculate fee splitting
      const { providerAmount: creditsToProvider, platformFee } = calculateFees(cost);

      // Increment recipient/provider profile balance
      const updatedRecipient = await AdultUser.findByIdAndUpdate(
        providerId,
        {
          $inc: {
            credits: creditsToProvider,
            'providerProfile.totalEarnings': creditsToProvider
          }
        },
        { session, new: true }
      );

      let resolvedCamSessionId = camSessionId ? new mongoose.Types.ObjectId(camSessionId) : null;
      if (!resolvedCamSessionId) {
        const activeCam = await mongoose.model('CamSession').findOne({ providerId: recipient._id, status: 'live' }).session(session);
        if (activeCam) {
          resolvedCamSessionId = activeCam._id;
        }
      }

      if (resolvedCamSessionId) {
        await mongoose.model('CamSession').findByIdAndUpdate(
          resolvedCamSessionId,
          { $inc: { totalTipsReceived: creditsToProvider } },
          { session }
        );
      }

      // Create dual transactional logs
      const spinnerTx = await CreditTransaction.create([{
        userId: spinner._id,
        type: 'spin_wheel',
        amount: -cost,
        usdAmount: 0,
        description: `Spun Wheel for ${updatedRecipient?.providerProfile?.stageName || updatedRecipient?.displayName || 'Provider'}: ${pickedItem.label}`,
        relatedUserId: recipient._id,
        status: 'completed',
        metadata: resolvedCamSessionId ? { camSessionId: resolvedCamSessionId } : undefined,
      }], { session });

      await CreditTransaction.create([{
        userId: recipient._id,
        type: 'spin_wheel',
        amount: creditsToProvider,
        platformFee: platformFee,
        usdAmount: 0,
        description: `Wheel spin received from member: ${pickedItem.label}`,
        relatedUserId: spinner._id,
        status: 'completed',
        metadata: resolvedCamSessionId ? { camSessionId: resolvedCamSessionId } : undefined,
      }], { session });

      // Record Platform Earnings
      await recordPlatformEarning({
        source: 'spin_wheel',
        amount: platformFee,
        fromUserId: spinner._id,
        toProviderId: recipient._id,
        referenceId: spinnerTx[0]._id,
      }, { session });

      // Save SpinResult record
      const spinResult = await SpinResult.create([{
        wheelId: wheel._id,
        providerId: recipient._id,
        spinnerId: spinner._id,
        spinnerName: spinner.displayName || spinner.username,
        camSessionId: resolvedCamSessionId,
        itemId: pickedItem.id,
        itemLabel: pickedItem.label,
        creditsPaid: cost,
        creditsToProvider,
        platformFee,
      }], { session });

      // Update wheel total stats
      wheel.totalSpins += 1;
      wheel.totalEarned += cost;
      await wheel.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Socket alerts
      const spinnerNewBalance = updatedSpinner.credits;
      const recipientNewBalance = updatedRecipient?.credits || 0;

      socketService.emitToUser(spinner._id.toString(), 'wallet:updated', { balance: spinnerNewBalance });
      socketService.emitToUser(providerId.toString(), 'wallet:updated', { balance: recipientNewBalance });

      // Emit wheel spin socket notification to the namespace for cams spectator feeds
      const ns = req.app.get('adultNamespace');
      if (ns && camSessionId) {
        ns.to(`cam:${camSessionId}`).emit('cam:wheel_spin', {
          spinnerName: spinner.displayName || spinner.username,
          itemId: pickedItem.id,
          itemLabel: pickedItem.label,
          creditsPaid: cost,
          timestamp: Date.now()
        });
      }

      return res.json({
        success: true,
        itemId: pickedItem.id,
        itemLabel: pickedItem.label,
        creditsPaid: cost,
        spinResultId: spinResult[0]._id
      });

    } catch (err: any) {
      await session.abortTransaction();
      session.endSession();

      const isTransient = err.message?.includes('WriteConflict') || err.code === 112 || err.hasErrorLabel?.('TransientTransactionError');
      if (isTransient && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
        continue;
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(500).json({ success: false, error: 'Transaction failed due to high concurrency. Please try again.' });
};

// GET /api/v1/adult/providers/me/wheel/stats
export const getProviderWheelStats = async (req: Request, res: Response) => {
  try {
    const provider = req.adultUser;
    if (!provider || provider.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can view their wheel stats' });
    }

    const wheel = await SpinWheel.findOne({ providerId: provider._id });
    if (!wheel) {
      return res.status(404).json({ success: false, error: 'No wheel configured' });
    }

    const recentSpins = await SpinResult.find({ providerId: provider._id })
      .sort({ createdAt: -1 })
      .limit(10);

    // Aggregate breakdown by item
    const breakdown = await SpinResult.aggregate([
      { $match: { providerId: provider._id } },
      {
        $group: {
          _id: '$itemId',
          label: { $first: '$itemLabel' },
          count: { $sum: 1 },
          earned: { $sum: '$creditsPaid' }
        }
      }
    ]);

    return res.json({
      success: true,
      data: {
        totalSpins: wheel.totalSpins,
        totalEarned: wheel.totalEarned,
        recentSpins,
        breakdown
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
