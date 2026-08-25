import crypto from 'crypto';

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
    status: string; // 'success', 'failed', 'abandoned', etc.
    reference: string;
    amount: number; // in kobo
    message?: string;
    gateway_response?: string;
    paid_at?: string;
    created_at?: string;
    channel?: string;
    currency: string; // 'NGN'
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
    return process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_paystack_secret_key';
  }

  public static async initializeTransaction(
    options: PaystackInitializeOptions
  ): Promise<PaystackInitializeResponse> {
    const secretKey = this.getSecretKey();

    // If using mock secret in test/dev environment without real Paystack network call,
    // allow clean test behavior if configured, or hit real Paystack API.
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
      // In test mode with mock key, simulate verification based on reference naming or default success
      if (reference.includes('fail')) {
        return {
          status: true,
          message: 'Verification failed',
          data: {
            id: 12345,
            domain: 'test',
            status: 'failed',
            reference,
            amount: 200000,
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
          amount: 200000,
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
    return hash === signature;
  }
}
