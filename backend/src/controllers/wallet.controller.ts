import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';

export const getWallet = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    // Since we store balance directly in user.credits, we fetch it from the user document
    const transactions = await CreditTransaction.find({ userId: user._id });
    const purchased = transactions
      .filter(tx => tx.type === 'purchase' && tx.status === 'completed')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const spent = transactions
      .filter(tx => tx.type === 'tip' && tx.status === 'completed')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return res.json({
      creditBalance: user.credits,
      lifetimeCreditsPurchased: purchased,
      lifetimeCreditsSpent: spent,
      estimatedUsdValue: (user.credits * 0.0075).toFixed(2),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBundles = async (req: Request, res: Response) => {
  const bundles = [
    { id: 'bundle_100',  credits: 100,   priceUsd: 4.99,   label: 'Starter' },
    { id: 'bundle_500',  credits: 500,   priceUsd: 19.99,  label: 'Popular',    badge: 'Best Value' },
    { id: 'bundle_1500', credits: 1500,  priceUsd: 49.99,  label: 'Premium' },
    { id: 'bundle_5000', credits: 5000,  priceUsd: 129.99, label: 'Elite',      badge: 'Most Popular' },
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

    const bundles = [
      { id: 'bundle_100',  credits: 100,   priceUsd: 4.99 },
      { id: 'bundle_500',  credits: 500,   priceUsd: 19.99 },
      { id: 'bundle_1500', credits: 1500,  priceUsd: 49.99 },
      { id: 'bundle_5000', credits: 5000,  priceUsd: 129.99 },
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
      priceMonthly: 9.99,
      priceAnnual:  99.99,
      currency: 'USD',
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
      priceMonthly: 19.99,
      priceAnnual:  199.99,
      currency: 'USD',
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
    }
  ];
  return res.json(plans);
};
