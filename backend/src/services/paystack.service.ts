import crypto from 'crypto';
import CreditTransaction from '../models/CreditTransaction';
import TicketOrder from '../models/TicketOrder';

export interface PaystackInitializeOptions {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: any;
}

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message?: string;
    gateway_response?: string;
    paid_at?: string;
    created_at?: string;
    channel?: string;
    currency: string;
    metadata?: any;
    customer?: {
      id: number;
      email: string;
      customer_code: string;
    };
  };
}

export class PaystackService {
  private static getSecretKey(): string {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured');
    }
    return key;
  }

  public static async initializeTransaction(
    options: PaystackInitializeOptions
  ): Promise<PaystackInitializeResponse> {
    const secretKey = this.getSecretKey();

    if (process.env.NODE_ENV === 'test' && secretKey === 'sk_test_mock_paystack_secret_key') {
      return {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: `https://checkout.paystack.com/mock_${options.reference}`,
          access_code: `mock_access_${options.reference}`,
          reference: options.reference,
        },
      };
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: options.email,
        amount: options.amountKobo,
        reference: options.reference,
        callback_url: options.callbackUrl,
        metadata: options.metadata,
      }),
    });

    const data = (await response.json()) as PaystackInitializeResponse;
    return data;
  }

  public static async verifyTransaction(
    reference: string
  ): Promise<PaystackVerifyResponse> {
    const secretKey = this.getSecretKey();

    if (process.env.NODE_ENV === 'test' && secretKey === 'sk_test_mock_paystack_secret_key') {
      const dbTx = await CreditTransaction.findOne({ paymentIntentId: reference }).lean();
      const expectedKobo = dbTx && dbTx.nairaAmount ? dbTx.nairaAmount * 100 : 200000;

      if (reference.includes('fail')) {
        return {
          status: true,
          message: 'Verification failed',
          data: {
            id: 12345,
            domain: 'test',
            status: 'failed',
            reference,
            amount: expectedKobo,
            currency: 'NGN',
          },
        };
      }
      return {
        status: true,
        message: 'Verification successful',
        data: {
          id: 12345,
          domain: 'test',
          status: 'success',
          reference,
          amount: expectedKobo,
          currency: 'NGN',
        },
      };
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = (await response.json()) as PaystackVerifyResponse;
    return data;
  }

  public static async refundTransaction(
    transactionRef: string,
    amountKobo?: number
  ): Promise<{ status: boolean; message: string; data?: any }> {
    const secretKey = this.getSecretKey();
    const lockToken = crypto.randomUUID();
    const lockExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

    if (process.env.NODE_ENV === 'test') {
      return { status: true, message: 'Transaction refund initiated' };
    }

    // Serialize refund dispatch per TicketOrder. The provider-side GET/POST pair
    // is not itself atomic, so two workers must not be allowed to POST concurrently.
    const lockedOrder = await TicketOrder.findOneAndUpdate(
      {
        paymentReference: transactionRef,
        $or: [
          { refundLockExpiresAt: { $exists: false } },
          { refundLockExpiresAt: { $lte: new Date() } },
        ],
      },
      {
        $set: {
          refundLockToken: lockToken,
          refundLockExpiresAt: lockExpiresAt,
        },
      },
      { new: true }
    );

    if (!lockedOrder) {
      return {
        status: false,
        message: 'Refund is already being processed for this payment reference',
      };
    }

    try {
      const checkRes = await fetch(
        `https://api.paystack.co/refund?transaction=${encodeURIComponent(transactionRef)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as any;
        if (checkData?.status && Array.isArray(checkData.data) && checkData.data.length > 0) {
          const existingRefund = checkData.data.find(
            (r: any) => r.status === 'processed' || r.status === 'pending'
          );
          if (existingRefund) {
            return {
              status: true,
              message: 'Refund already executed on Paystack',
              data: existingRefund,
            };
          }
        }
      }

      const response = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: transactionRef,
          amount: amountKobo,
        }),
      });

      return (await response.json()) as any;
    } catch (err: any) {
      return { status: false, message: err.message || 'Refund dispatch failed' };
    } finally {
      await TicketOrder.updateOne(
        { _id: lockedOrder._id, refundLockToken: lockToken },
        { $unset: { refundLockToken: 1, refundLockExpiresAt: 1 } }
      ).catch(() => {});
    }
  }

  public static verifyWebhookSignature(
    rawBody: Buffer | string,
    signature: string
  ): boolean {
    if (!signature) return false;
    const secretKey = this.getSecretKey();
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (hashBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, signatureBuffer);
  }
}
