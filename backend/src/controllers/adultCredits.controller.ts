import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import { createPaymentIntent } from '../services/stripeService';

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

  const paymentIntent = await createPaymentIntent(bundle.usdCents, 'usd', req.adultUser?._id.toString() || '', { bundleId });

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

    sender.credits -= amount;
    await (sender as any).save({ session });

    recipient.credits += amount;
    if (recipient.providerProfile) recipient.providerProfile.totalEarnings += amount;
    await recipient.save({ session });

    await CreditTransaction.create([{
      userId: sender._id,
      type: 'tip',
      amount: -amount,
      usdAmount: 0,
      description: `Tip to ${recipient.username}`,
      relatedUserId: recipient._id,
      status: 'completed',
    }], { session });

    await CreditTransaction.create([{
      userId: recipient._id,
      type: 'tip',
      amount: amount,
      usdAmount: 0,
      description: `Tip from ${sender.username}`,
      relatedUserId: sender._id,
      status: 'completed',
    }], { session });

    await session.commitTransaction();
    res.json({ success: true, data: { newBalance: sender.credits } });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Transaction failed' } });
  } finally {
    session.endSession();
  }
};
