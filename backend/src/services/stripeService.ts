import Stripe from 'stripe';

const stripe = new Stripe(process.env.ADULT_STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2022-11-15' as any,
});

export const createPaymentIntent = async (amount: number, currency: string = 'usd', userId: string, metadata: any) => {
  return await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: {
      ...metadata,
      userId,
    },
  });
};

export const verifyWebhookSignature = (payload: string | Buffer, signature: string) => {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.ADULT_STRIPE_WEBHOOK_SECRET || 'whsec_placeholder'
  );
};
