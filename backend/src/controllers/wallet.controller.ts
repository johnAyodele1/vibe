import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import CamSession from '../models/CamSession';
import { socketService } from '../services/socketService';
import { getDiamondNairaRate } from '../shared/pricing';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { sendPushToUser } from '../shared/push';
import { PaystackService } from '../services/paystack.service';

const PACKAGES_CONFIG: Record<string, { priceNaira: number; diamonds: number; label: string; badge?: string }> = {
  starter: { priceNaira: 800, diamonds: 8, label: 'Starter' },
  popular: { priceNaira: 2000, diamonds: 20, label: 'Popular', badge: 'Most Popular' },
  premium: { priceNaira: 10000, diamonds: 100, label: 'Premium' },
  elite: { priceNaira: 50000, diamonds: 500, label: 'Elite', badge: 'Best Value' },
};

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
          type: { $in: ['purchase', 'credit_purchase', 'tip', 'tip_sent'] }
        }
      },
      {
        $group: {
          _id: null,
          purchased: {
            $sum: {
              $cond: [{ $in: ['$type', ['purchase', 'credit_purchase']] }, '$amount', 0]
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
  const bundles = [
    { id: 'starter', credits: 8, priceNaira: 800, label: 'Starter' },
    { id: 'popular', credits: 20, priceNaira: 2000, label: 'Popular', badge: 'Most Popular' },
    { id: 'premium', credits: 100, priceNaira: 10000, label: 'Premium' },
    { id: 'elite', credits: 500, priceNaira: 50000, label: 'Elite', badge: 'Best Value' },
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

    // Optimization (⚡ Bolt): Fetch transactions and total count concurrently via Promise.all.
    const [transactions, total] = await Promise.all([
      CreditTransaction.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CreditTransaction.countDocuments({ userId: user._id }),
    ]);

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

export const initializePurchase = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const { package: packageId, amountNaira: customAmount } = req.body;

    let amountNaira = 0;
    let diamonds = 0;

    if (packageId) {
      const pkgKey = String(packageId).toLowerCase();
      const pkgConfig = PACKAGES_CONFIG[pkgKey];
      if (!pkgConfig) {
        return res.status(400).json({ success: false, error: 'Invalid wallet package selected' });
      }
      amountNaira = pkgConfig.priceNaira;
      diamonds = pkgConfig.diamonds;
    } else if (customAmount !== undefined && customAmount !== null) {
      const parsedAmount = Number(customAmount);
      if (
        isNaN(parsedAmount) ||
        !isFinite(parsedAmount) ||
        !Number.isInteger(parsedAmount) ||
        parsedAmount < 1000
      ) {
        return res.status(400).json({
          success: false,
          error: 'Custom purchase amount must be a whole number of at least ₦1,000',
        });
      }
      amountNaira = parsedAmount;
      diamonds = Math.floor(amountNaira / 100);
    } else {
      return res.status(400).json({ success: false, error: 'Package or custom amount is required' });
    }

    const amountKobo = amountNaira * 100;
    const reference = `paystack_wlt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const transaction = new CreditTransaction({
      userId: user._id,
      type: 'credit_purchase',
      amount: diamonds,
      usdAmount: parseFloat((diamonds * 0.0075).toFixed(2)),
      nairaAmount: amountNaira,
      description: `Credit Purchase - ${diamonds} Diamonds (₦${amountNaira.toLocaleString()})`,
      paymentProvider: 'paystack',
      paymentIntentId: reference,
      status: 'pending',
    });
    await transaction.save();

    const defaultFrontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const callbackUrl =
      process.env.PAYSTACK_CALLBACK_URL || `${defaultFrontendUrl}/wallet/payment/callback`;

    const paystackRes = await PaystackService.initializeTransaction({
      email: user.email || `${user.username}@zippo.app`,
      amountKobo,
      reference,
      callbackUrl,
      metadata: {
        userId: user._id.toString(),
        diamonds,
        amountNaira,
        transactionId: transaction._id.toString(),
      },
    });

    if (!paystackRes.status || !paystackRes.data?.authorization_url) {
      transaction.status = 'failed';
      await transaction.save();
      return res.status(500).json({
        success: false,
        error: paystackRes.message || 'Unable to start payment. Please try again.',
      });
    }

    return res.json({
      success: true,
      reference,
      authorizationUrl: paystackRes.data.authorization_url,
      amountNaira,
      diamonds,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyPurchase = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const rawRef = req.params.reference || req.query.reference;
    const reference = Array.isArray(rawRef) ? String(rawRef[0]) : String(rawRef || '');
    if (!reference) {
      return res.status(400).json({ success: false, error: 'Payment reference is required' });
    }

    const transaction = await CreditTransaction.findOne({
      paymentIntentId: reference,
      userId: user._id,
    });
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction reference not found' });
    }

    if (transaction.status === 'completed') {
      return res.json({
        success: true,
        status: 'completed',
        diamonds: transaction.amount,
        amountNaira: transaction.nairaAmount,
        reference: transaction.paymentIntentId,
        message: 'Payment verified and wallet credited',
      });
    }

    const paystackRes = await PaystackService.verifyTransaction(reference);

    if (!paystackRes.status || !paystackRes.data) {
      return res.status(400).json({
        success: false,
        status: 'failed',
        error: paystackRes.message || 'Payment verification failed',
      });
    }

    const paystackData = paystackRes.data;

    if (paystackData.status !== 'success') {
      if (paystackData.status === 'failed' || paystackData.status === 'abandoned') {
        transaction.status = 'failed';
        await transaction.save();
      }
      return res.json({
        success: false,
        status: paystackData.status,
        error: paystackData.gateway_response || 'Payment was not successful',
      });
    }

    const expectedKobo = (transaction.nairaAmount || 0) * 100;
    if (paystackData.amount !== expectedKobo || paystackData.currency?.toUpperCase() !== 'NGN') {
      transaction.status = 'failed';
      await transaction.save();
      return res.status(400).json({
        success: false,
        status: 'failed',
        error: 'Payment amount mismatch or invalid currency',
      });
    }

    // Atomic credit completion inside a MongoDB session transaction (with fallback for standalone Mongo setups)
    let updatedUserCredits: number | null = null;
    let dbSession: mongoose.ClientSession | null = null;

    try {
      dbSession = await mongoose.startSession();
      dbSession.startTransaction();

      const updatedTx = await CreditTransaction.findOneAndUpdate(
        { _id: transaction._id, status: 'pending' },
        { $set: { status: 'completed' } },
        { new: true, session: dbSession }
      );

      if (updatedTx) {
        const updatedUser = await AdultUser.findByIdAndUpdate(
          transaction.userId,
          { $inc: { credits: transaction.amount } },
          { new: true, session: dbSession }
        );
        if (updatedUser) {
          updatedUserCredits = updatedUser.credits;
        }
      }

      await dbSession.commitTransaction();
    } catch (sessionErr: any) {
      if (dbSession) {
        await dbSession.abortTransaction().catch(() => {});
      }

      // If standalone Mongo doesn't support transactions (code 20 / Transaction numbers error), execute safe atomic fallback
      if (sessionErr.code === 20 || sessionErr.message?.includes('Transaction numbers are only allowed')) {
        const updatedTx = await CreditTransaction.findOneAndUpdate(
          { _id: transaction._id, status: 'pending' },
          { $set: { status: 'completed' } },
          { new: true }
        );

        if (updatedTx) {
          const updatedUser = await AdultUser.findByIdAndUpdate(
            transaction.userId,
            { $inc: { credits: transaction.amount } },
            { new: true }
          );
          if (updatedUser) {
            updatedUserCredits = updatedUser.credits;
          }
        }
      } else {
        throw sessionErr;
      }
    } finally {
      if (dbSession) {
        dbSession.endSession();
      }
    }

    if (updatedUserCredits !== null) {
      socketService.emitToUser(user._id.toString(), 'wallet:updated', {
        balance: updatedUserCredits,
      });
    }

    return res.json({
      success: true,
      status: 'completed',
      diamonds: transaction.amount,
      amountNaira: transaction.nairaAmount,
      reference: transaction.paymentIntentId,
      message: 'Payment verified and wallet credited',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const handlePaystackWebhook = async (req: Request, res: Response) => {
  try {
    const signature = (req.headers['x-paystack-signature'] as string) || '';
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const isValid = PaystackService.verifyWebhookSignature(rawBody, signature);
    // Signature verification is enforced in all environments except test environment
    if (!isValid && process.env.NODE_ENV !== 'test') {
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const payload = req.body;
    if (payload.event === 'charge.success') {
      const data = payload.data;
      const reference = data.reference;
      const amountKobo = data.amount;

      if (reference) {
        const transaction = await CreditTransaction.findOne({ paymentIntentId: reference });
        if (transaction && transaction.status === 'pending') {
          const expectedKobo = (transaction.nairaAmount || 0) * 100;
          if (amountKobo === expectedKobo && data.currency?.toUpperCase() === 'NGN') {
            let updatedUserId: string | null = null;
            let updatedUserCredits: number | null = null;
            let dbSession: mongoose.ClientSession | null = null;

            try {
              dbSession = await mongoose.startSession();
              dbSession.startTransaction();

              const updatedTx = await CreditTransaction.findOneAndUpdate(
                { _id: transaction._id, status: 'pending' },
                { $set: { status: 'completed' } },
                { new: true, session: dbSession }
              );

              if (updatedTx) {
                const updatedUser = await AdultUser.findByIdAndUpdate(
                  transaction.userId,
                  { $inc: { credits: transaction.amount } },
                  { new: true, session: dbSession }
                );
                if (updatedUser) {
                  updatedUserId = updatedUser._id.toString();
                  updatedUserCredits = updatedUser.credits;
                }
              }

              await dbSession.commitTransaction();
            } catch (sessionErr: any) {
              if (dbSession) {
                await dbSession.abortTransaction().catch(() => {});
              }

              if (sessionErr.code === 20 || sessionErr.message?.includes('Transaction numbers are only allowed')) {
                const updatedTx = await CreditTransaction.findOneAndUpdate(
                  { _id: transaction._id, status: 'pending' },
                  { $set: { status: 'completed' } },
                  { new: true }
                );

                if (updatedTx) {
                  const updatedUser = await AdultUser.findByIdAndUpdate(
                    transaction.userId,
                    { $inc: { credits: transaction.amount } },
                    { new: true }
                  );
                  if (updatedUser) {
                    updatedUserId = updatedUser._id.toString();
                    updatedUserCredits = updatedUser.credits;
                  }
                }
              } else {
                throw sessionErr;
              }
            } finally {
              if (dbSession) {
                dbSession.endSession();
              }
            }

            if (updatedUserId && updatedUserCredits !== null) {
              socketService.emitToUser(updatedUserId, 'wallet:updated', {
                balance: updatedUserCredits,
              });
            }
          } else {
            transaction.status = 'failed';
            await transaction.save();
          }
        }
      }
    }

    return res.status(200).json({ status: 'success' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createPurchaseIntent = async (req: Request, res: Response) => {
  return initializePurchase(req, res);
};

export const simulateWebhookSuccess = async (req: Request, res: Response) => {
  return handlePaystackWebhook(req, res);
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
