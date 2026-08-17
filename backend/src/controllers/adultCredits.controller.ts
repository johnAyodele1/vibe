import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import { createPaymentIntent } from '../services/stripeService';
import { getDiamondNairaRate } from '../shared/pricing';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { sendPushToUser } from '../shared/push';

const BUNDLES: any = {
  'bundle_100': { credits: 100, usdCents: 499 },
  'bundle_500': { credits: 500, usdCents: 1999 },
  'bundle_1500': { credits: 1500, usdCents: 4999 },
  'bundle_5000': { credits: 5000, usdCents: 12999 }
};

export const getBalance = async (req: Request, res: Response) => {
  res.json({ success: true, data: { credits: req.adultUser?.credits, tier: req.adultUser?.subscriptionTier } });
};

export const getHistory = async (req: Request, res: Response) => {
  const { page = 1, limit = 20 } = req.query;
  const history = await CreditTransaction.find({ userId: req.adultUser?._id })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  res.json({ success: true, data: { history } });
};

export const purchaseCredits = async (req: Request, res: Response) => {
  const { bundleId } = req.body;
  const bundle = BUNDLES[bundleId];

  if (!bundle) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid bundle' } });

  const rate = await getDiamondNairaRate();
  const nairaAmount = bundle.credits * rate;
  const koboAmount = nairaAmount * 100; // Smallest unit in Naira is kobo (₦1 = 100 kobo)

  const paymentIntent = await createPaymentIntent(koboAmount, 'ngn', req.adultUser?._id.toString() || '', { bundleId });

  res.json({ success: true, data: { clientSecret: paymentIntent.client_secret } });
};

export const tip = async (req: Request, res: Response) => {
  const { recipientId, amount, message } = req.body;
  const sender = req.adultUser;

  if (!sender) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
  if (sender.credits < amount) return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient balance' } });
  if (sender._id.toString() === recipientId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Cannot tip yourself' } });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const recipient = await AdultUser.findById(recipientId).session(session);
    if (!recipient) throw new Error('Recipient not found');

    const { providerAmount, platformFee } = calculateFees(amount);

    sender.credits -= amount;
    await (sender as any).save({ session });

    recipient.credits += providerAmount;
    if (recipient.providerProfile) recipient.providerProfile.totalEarnings += providerAmount;
    await recipient.save({ session });

    const activeCamSession = await mongoose.model('CamSession').findOne({ providerId: recipient._id, status: 'live' }).session(session);
    let camSessionId = null;
    if (activeCamSession) {
      camSessionId = activeCamSession._id;
      await mongoose.model('CamSession').findByIdAndUpdate(
        activeCamSession._id,
        { $inc: { totalTipsReceived: providerAmount } },
        { session }
      );
    }

    const senderTx = await CreditTransaction.create([{
      userId: sender._id,
      type: 'tip',
      amount: -amount,
      usdAmount: 0,
      description: `Tip to ${recipient.username}`,
      relatedUserId: recipient._id,
      status: 'completed',
      metadata: camSessionId ? { camSessionId } : undefined,
    }], { session });

    await CreditTransaction.create([{
      userId: recipient._id,
      type: 'tip',
      amount: providerAmount,
      platformFee: platformFee,
      usdAmount: 0,
      description: `Tip from ${sender.username}`,
      relatedUserId: sender._id,
      status: 'completed',
      metadata: camSessionId ? { camSessionId } : undefined,
    }], { session });

    // Record Platform Earnings
    await recordPlatformEarning({
      source: 'tip',
      amount: platformFee,
      fromUserId: sender._id,
      toProviderId: recipient._id,
      referenceId: senderTx[0]._id,
    }, { session });

    await session.commitTransaction();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${recipientId}`).emit('wallet:updated', { balance: recipient.credits });
      ns.to(`user:${sender._id.toString()}`).emit('wallet:updated', { balance: sender.credits });
      ns.emit('cam:tip_received', { amount: amount, fromName: sender.username, recipientId });
    }

    // Send push notification for cam tip received
    await sendPushToUser(recipientId, {
      title:       `💎 ${sender.displayName || sender.username} tipped during your stream!`,
      body:        `💎 ${providerAmount} diamonds`,
      icon:        sender.profilePhoto || '',
      tag:         `cam_tip_${Date.now()}`,
      renotify:    true,
      url:         `/adult/provider/live`,
      unreadCount: 0,
      type:        'cam_tip_received',
    });

    res.json({ success: true, data: { newBalance: sender.credits } });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Transaction failed' } });
  } finally {
    session.endSession();
  }
};

export const subscribeToTier = async (req: Request, res: Response) => {
  const { tier } = req.body;
  const user = req.adultUser;

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
  }

  const PRICES: Record<string, number> = {
    gold: 100,
    platinum: 250,
    diamond: 500
  };

  const cost = PRICES[tier];
  if (!cost) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid tier' } });
  }

  if (user.credits < cost) {
    return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient balance' } });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    user.credits -= cost;
    user.subscriptionTier = tier;
    user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await user.save({ session });

    await CreditTransaction.create([{
      userId: user._id,
      type: 'subscription',
      amount: -cost,
      usdAmount: 0,
      description: `Upgrade to ${tier.toUpperCase()} VIP membership`,
      status: 'completed',
    }], { session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Successfully subscribed to ${tier.toUpperCase()}`,
      data: {
        credits: user.credits,
        subscriptionTier: user.subscriptionTier,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Subscription transaction failed' } });
  } finally {
    session.endSession();
  }
};
