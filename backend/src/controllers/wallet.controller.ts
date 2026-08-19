import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import CamSession from '../models/CamSession';
import { socketService } from '../services/socketService';
import { getDiamondNairaRate } from '../shared/pricing';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { sendPushToUser } from '../shared/push';

export const getDiamondRate = async (req: Request, res: Response) => {
  try {
    const rate = await getDiamondNairaRate();
    return res.json({ rate, formatted: `₦${rate} per diamond` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getWallet = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    // Optimization (⚡ Bolt): Use MongoDB aggregation pipeline to compute lifetime purchased and spent credits.
    // Instead of instantiating and transferring thousands of full Mongoose document objects into Node.js memory (O(N)),
    // the aggregation calculates exact totals in the database engine in O(1) transfer payload size.
    const totals = await CreditTransaction.aggregate([
      {
        $match: {
          userId: user._id,
          status: 'completed',
          type: { $in: ['purchase', 'tip', 'tip_sent'] }
        }
      },
      {
        $group: {
          _id: null,
          purchased: {
            $sum: {
              $cond: [{ $eq: ['$type', 'purchase'] }, '$amount', 0]
            }
          },
          spent: {
            $sum: {
              $cond: [{ $in: ['$type', ['tip', 'tip_sent']] }, { $abs: '$amount' }, 0]
            }
          }
        }
      }
    ]);

    const purchased = totals[0]?.purchased || 0;
    const spent = totals[0]?.spent || 0;

    const rate = await getDiamondNairaRate();
    const estimatedNairaValue = user.credits * rate;

    return res.json({
      creditBalance: user.credits,
      lifetimeCreditsPurchased: purchased,
      lifetimeCreditsSpent: spent,
      estimatedNairaValue,
      estimatedUsdValue: (user.credits * 0.0075).toFixed(2),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBundles = async (req: Request, res: Response) => {
  const rate = await getDiamondNairaRate();
  const bundles = [
    { id: 'bundle_100',  credits: 100,   priceNaira: 100 * rate,  priceUsd: 4.99,   label: 'Starter' },
    { id: 'bundle_500',  credits: 500,   priceNaira: 500 * rate,  priceUsd: 19.99,  label: 'Popular',    badge: 'Best Value' },
    { id: 'bundle_1500', credits: 1500,  priceNaira: 1500 * rate, priceUsd: 49.99,  label: 'Premium' },
    { id: 'bundle_5000', credits: 5000,  priceNaira: 5000 * rate, priceUsd: 129.99, label: 'Elite',      badge: 'Most Popular' },
  ];
  return res.json(bundles);
};

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const transactions = await CreditTransaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await CreditTransaction.countDocuments({ userId: user._id });

    return res.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createPurchaseIntent = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const { bundleId } = req.body;
    if (!bundleId) {
      return res.status(400).json({ success: false, error: 'bundleId is required' });
    }

    const rate = await getDiamondNairaRate();
    const bundles = [
      { id: 'bundle_100',  credits: 100,   priceNaira: 100 * rate,  priceUsd: 4.99 },
      { id: 'bundle_500',  credits: 500,   priceNaira: 500 * rate,  priceUsd: 19.99 },
      { id: 'bundle_1500', credits: 1500,  priceNaira: 1500 * rate, priceUsd: 49.99 },
      { id: 'bundle_5000', credits: 5000,  priceNaira: 5000 * rate, priceUsd: 129.99 },
    ];

    const bundle = bundles.find(b => b.id === bundleId);
    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Bundle not found' });
    }

    // Create a transaction record
    const transaction = new CreditTransaction({
      userId: user._id,
      type: 'purchase',
      amount: bundle.credits,
      usdAmount: bundle.priceUsd,
      nairaAmount: bundle.priceNaira,
      description: `Purchase of ${bundle.credits} credits`,
      paymentProvider: 'stripe',
      paymentIntentId: `pi_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      status: 'pending',
    });
    await transaction.save();

    // In a real flow, confirmPayment or webhook completes it.
    // For local convenience, let's allow a simulation query/header to complete it or a dedicated complete endpoint,
    // or let's create a webhook simulation endpoint `/api/v1/adult/wallet/purchase/webhook`
    return res.json({
      clientSecret: `seti_mock_secret_${transaction.paymentIntentId}`,
      transactionId: transaction._id,
      paymentIntentId: transaction.paymentIntentId,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const simulateWebhookSuccess = async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: 'paymentIntentId is required' });
    }

    const transaction = await CreditTransaction.findOne({ paymentIntentId });
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    if (transaction.status === 'completed') {
      return res.json({ success: true, message: 'Already completed', transaction });
    }

    transaction.status = 'completed';
    await transaction.save();

    const user = await AdultUser.findById(transaction.userId);
    if (user) {
      user.credits += transaction.amount;
      await user.save();
    }

    return res.json({ success: true, message: 'Purchase successful, credits added', transaction });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getSubscriptionPlans = async (req: Request, res: Response) => {
  const plans = [
    {
      id: 'gold',
      name: 'Gold',
      priceMonthly: 4999,
      priceAnnual:  49999,
      currency: 'NGN',
      features: [
        'All Free features',
        'Unlimited messages',
        'Cam room tips (500/mo)',
        '1,500 credits/month',
        'Profile boost',
        'See who liked you',
      ],
      stripePriceIdMonthly: 'price_gold_monthly',
      stripePriceIdAnnual:  'price_gold_annual',
      isPopular: false,
    },
    {
      id: 'platinum',
      name: 'Platinum',
      priceMonthly: 9999,
      priceAnnual:  99999,
      currency: 'NGN',
      features: [
        'All Gold features',
        'Direct connection priority',
        '3,500 credits/month',
        'Premium stickers & gifts',
        'Discreet billing toggle',
      ],
      stripePriceIdMonthly: 'price_plat_monthly',
      stripePriceIdAnnual:  'price_plat_annual',
      isPopular: true,
    },
    {
      id: 'diamond',
      name: 'Diamond',
      priceMonthly: 19999,
      priceAnnual:  199999,
      currency: 'NGN',
      features: [
        'All Platinum features',
        'Exclusive rooms',
        'Priority support',
        'Custom badge',
        'Ad-free experience',
      ],
      stripePriceIdMonthly: 'price_diamond_monthly',
      stripePriceIdAnnual:  'price_diamond_annual',
      isPopular: false,
    }
  ];
  return res.json(plans);
};

export const directTip = async (req: Request, res: Response) => {
  const sender = req.adultUser;
  if (!sender) {
    return res.status(401).json({ success: false, error: 'Auth required' });
  }

  // Ensure member only can tip
  if (sender.role !== 'user') {
    return res.status(403).json({ success: false, error: 'Only members can send tips' });
  }

  const { recipientId, amount, message, context } = req.body;

  // Validation
  if (amount === undefined || amount === null) {
    return res.status(400).json({ success: false, error: 'Amount is required' });
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 50000) {
    return res.status(400).json({ success: false, error: 'Amount must be an integer between 1 and 50000' });
  }
  if (!recipientId) {
    return res.status(400).json({ success: false, error: 'Recipient is required' });
  }
  if (sender._id.toString() === recipientId.toString()) {
    return res.status(403).json({ success: false, error: 'Cannot tip yourself' });
  }
  if (message && message.length > 150) {
    return res.status(400).json({ success: false, error: 'Message cannot exceed 150 characters' });
  }

  // Rate limiting check (max 20 tips per hour per user)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentTipsCount = await CreditTransaction.countDocuments({
    userId: sender._id,
    type: 'tip_sent',
    createdAt: { $gte: oneHourAgo }
  });
  if (recentTipsCount >= 20) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded: maximum 20 tips per hour.' });
  }

  const maxRetries = 10;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check recipient eligibility
      const recipient = await AdultUser.findById(recipientId).session(session);
      if (!recipient) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ success: false, error: 'Provider not found' });
      }
      if (recipient.role !== 'provider') {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ success: false, error: 'Recipient must be a service provider' });
      }
      if (recipient.isActive === false || recipient.isBanned === true || recipient.status === 'inactive') {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ success: false, error: 'Cannot tip a suspended or inactive provider' });
      }

      // Fetch fresh sender document inside session to get most accurate balance
      const freshSender = await AdultUser.findById(sender._id).session(session);
      const senderCredits = freshSender ? freshSender.credits : 0;

      // Atomic deduction and balance check using findOneAndUpdate with $gte
      const updatedSender = await AdultUser.findOneAndUpdate(
        { _id: sender._id, credits: { $gte: amount } },
        { $inc: { credits: -amount } },
        { session, new: true }
      );

      if (!updatedSender) {
        await session.abortTransaction();
        session.endSession();
        return res.status(402).json({
          error: 'Insufficient credits',
          required: amount,
          current: senderCredits
        });
      }

      const { providerAmount, platformFee } = calculateFees(amount);

      // Credit recipient
      const updatedRecipient = await AdultUser.findByIdAndUpdate(
        recipientId,
        {
          $inc: {
            credits: providerAmount,
            'providerProfile.totalEarnings': providerAmount
          }
        },
        { session, new: true }
      );

      const recipientName = updatedRecipient?.providerProfile?.stageName || updatedRecipient?.displayName || updatedRecipient?.username || 'Provider';

      // Check active cam session to associate tips
      const activeCamSession = await CamSession.findOne({ providerId: recipient._id, status: 'live' }).session(session);
      let camSessionId = null;
      if (activeCamSession) {
        camSessionId = activeCamSession._id;
        await CamSession.findByIdAndUpdate(
          activeCamSession._id,
          { $inc: { totalTipsReceived: providerAmount } },
          { session }
        );
      }

      // Create sender transaction
      const senderTx = await CreditTransaction.create([{
        userId: sender._id,
        type: 'tip_sent',
        amount: -amount,
        usdAmount: 0,
        description: `Tip to ${recipientName}` + (message ? `: ${message}` : ''),
        relatedUserId: recipient._id,
        status: 'completed',
        metadata: camSessionId ? { camSessionId } : undefined,
      }], { session });

      // Create recipient transaction
      await CreditTransaction.create([{
        userId: recipient._id,
        type: 'tip_received',
        amount: providerAmount,
        platformFee: platformFee,
        usdAmount: 0,
        description: `Tip from member` + (message ? `: ${message}` : ''),
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
      session.endSession();

      // Sockets emission
      const senderNewBalance = updatedSender.credits;
      const recipientNewBalance = updatedRecipient?.credits || 0;

      socketService.emitToUser(sender._id.toString(), 'wallet:updated', { balance: senderNewBalance });
      socketService.emitToUser(recipientId.toString(), 'wallet:updated', { balance: recipientNewBalance });
      socketService.emitToUser(recipientId.toString(), 'tip:received', {
        amount,
        fromUserId: sender._id.toString(),
        fromDisplayName: sender.displayName || sender.username,
        message,
        context
      });

      // Send push notification for tip
      const memberName = sender.displayName || sender.username || 'A member';
      sendPushToUser(recipientId, {
        title: `💎 New tip from ${memberName}!`,
        body: `${memberName} tipped you 💎 ${providerAmount} diamonds`,
        tag: 'tip',
        url: '/adult/provider/earnings',
        type: 'new_tip',
        unreadCount: 0,
      }).catch(err => console.error('[Push] Error sending tip push notification:', err));

      // Broadcast tip notification to any active live cam room if context or active sessions exist
      const activeSession = await mongoose.model('CamSession').findOne({ providerId: recipient._id, status: 'live' });
      if (activeSession) {
        const ns = req.app.get('adultNamespace');
        if (ns) {
          const notification = {
            id: `tip_${Date.now()}`,
            type: 'tip',
            fromName: sender.displayName || sender.username || 'Member',
            amount,
            content: `${sender.displayName || sender.username} tipped 💎 ${amount}!`,
            timestamp: Date.now(),
          };
          ns.to(`cam:${activeSession._id}`).emit('cam:new_message', notification);
        }
      }

      return res.status(200).json({
        success: true,
        tipId: senderTx[0]._id.toString(),
        amount,
        recipientName,
        senderNewBalance,
        message
      });

    } catch (err: any) {
      await session.abortTransaction();
      session.endSession();

      const isTransient = err.message?.includes('WriteConflict') || err.code === 112 || err.hasErrorLabel?.('TransientTransactionError');
      if (isTransient && attempt < maxRetries) {
        // Wait a tiny random time (backoff) before retrying
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
        continue;
      }

      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(500).json({ success: false, error: 'Transaction failed due to high concurrency. Please try again.' });
};
