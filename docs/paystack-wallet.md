# Paystack Wallet Integration Documentation

## Overview

The Adult Zone `/wallet` credit purchase system integrates directly with Paystack for real-money payment processing in NGN (Nigerian Naira). Users can purchase predefined credit bundles or enter custom Naira purchase amounts. Backend verification ensures authoritative calculation of diamond credits, server-side transaction status verification, and idempotent credit processing across duplicate webhooks and callbacks.

---

## Diamond Pricing & Conversion Economy

The platform diamond conversion rate is strictly preserved as:

```text
₦100 = 1 diamond
```

### Predefined Wallet Packages

| Package | Price (NGN) | Diamond Amount | Badge / Highlight |
| :--- | ---: | ---: | :--- |
| **Starter** | ₦800 | 💎 8 | Entry level package |
| **Popular** | ₦2,000 | 💎 20 | Most Popular |
| **Premium** | ₦10,000 | 💎 100 | Standard package |
| **Elite** | ₦50,000 | 💎 500 | Best Value |

### Custom Purchase Amounts

Users may also purchase custom diamond packages directly via the custom purchase interface:

* **Minimum Purchase:** ₦1,000 (gives 💎 10)
* **Conversion Formula:** `diamonds = Math.floor(amountNaira / 100)`
* **Validation:** Integer values only, minimum ₦1,000.

---

## Production URLs & Webhook Configuration

### Production Callback URL

Configure this URL in your Paystack Dashboard under **Settings > API Keys & Webhooks > Callback URL**:

```text
Production Callback URL:
https://YOUR_DOMAIN/wallet/payment/callback
```

*(Note: `/adult/wallet/payment/callback` is also registered as an alias route).*

### Production Webhook URL

Configure this URL in your Paystack Dashboard under **Settings > API Keys & Webhooks > Webhook URL**:

```text
Production Webhook URL:
https://YOUR_DOMAIN/api/v1/adult/wallet/paystack/webhook
```

---

## Environment Variables Configuration

Add the following environment variables to your production environment (e.g., `.env` or hosting provider configuration):

```env
# Server-side Paystack Credentials (REQUIRED)
PAYSTACK_SECRET_KEY=sk_live_...

# Optional Public Key for Client SDKs (if required)
PAYSTACK_PUBLIC_KEY=pk_live_...

# Optional Custom Callback URL (Overrides default relative callback)
PAYSTACK_CALLBACK_URL=https://YOUR_DOMAIN/wallet/payment/callback
```

> **Security Note:** Never expose `PAYSTACK_SECRET_KEY` to the frontend or commit real secrets to source control.

---

## Payment Lifecycle

```text
User selects package or custom amount (e.g., ₦2,000)
        ↓
Frontend POST /api/v1/adult/wallet/paystack/initialize
        ↓
Backend validates amount (₦2,000) & calculates diamonds (💎 20)
        ↓
Backend creates pending CreditTransaction record with unique reference
        ↓
Backend initializes Paystack transaction (converts NGN to kobo: 200,000 kobo)
        ↓
Backend returns Paystack authorization URL
        ↓
User completes payment on Paystack checkout
        ↓
Paystack redirects user to Callback URL (/wallet/payment/callback)
   AND sends HMAC-SHA512 signed event to Webhook URL
        ↓
Backend verifies Paystack transaction status & amount server-side
        ↓
Atomic & Idempotent credit deduction updates transaction to 'completed'
   and increments user credits (+20 diamonds)
        ↓
Real-time socket event ('wallet:updated') emits new balance to user
        ↓
Tip-sheet styled success UI displayed to user
```

---

## Idempotency & Security Invariants

1. **Server-Authoritative Pricing:** The frontend sends package identifiers (`package: "starter"`) or custom Naira amounts (`amountNaira: 2000`). The backend calculates the diamond amount and monetary values. Client-submitted diamond amounts are rejected.
2. **Atomic Credit Processing:** `CreditTransaction.findOneAndUpdate({ _id: transactionId, status: 'pending' }, { status: 'completed' })` ensures atomic single-execution.
3. **Webhook Signature Check:** Every incoming webhook payload is verified using `crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)` against `x-paystack-signature`.
4. **Kobo Conversion:** Backend converts NGN to Kobo (`amountNaira * 100`).
5. **Race Condition Protection:** If both the webhook and the user callback invoke transaction verification simultaneously, only the first atomic state transition succeeds. The second execution returns the existing completed state without double-crediting.

---

## Production Checklist

- [ ] `PAYSTACK_SECRET_KEY` configured in production environment variables
- [ ] Production Callback URL set to `https://YOUR_DOMAIN/wallet/payment/callback` in Paystack dashboard
- [ ] Production Webhook URL set to `https://YOUR_DOMAIN/api/v1/adult/wallet/paystack/webhook` in Paystack dashboard
- [ ] Webhook HMAC signature verification active
- [ ] Database indexes on `CreditTransaction.paymentIntentId` verified
- [ ] Tested ₦800 package purchase (8 diamonds)
- [ ] Tested ₦2,000 package purchase (20 diamonds)
- [ ] Tested ₦10,000 package purchase (100 diamonds)
- [ ] Tested ₦50,000 package purchase (500 diamonds)
- [ ] Tested ₦1,000 custom amount purchase (10 diamonds)
- [ ] Tested rejection of custom amounts < ₦1,000 or negative/float values
- [ ] Tested duplicate webhook idempotency
- [ ] Tested callback + webhook race condition
- [ ] Verified wallet balance updates automatically on UI after successful payment
- [ ] Verified transactions appear in wallet transaction history
- [ ] Verified no secret keys committed to repository
