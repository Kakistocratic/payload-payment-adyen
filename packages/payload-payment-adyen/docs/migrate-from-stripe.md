# Migrate a Payload Ecommerce Project from Stripe to Adyen

This guide is for existing Payload Ecommerce projects that use the Stripe adapter and want to move checkout traffic to Adyen.

For the exact fresh Payload Ecommerce Starter replacement flow validated from a packed dependency install, see [Payload Ecommerce Starter Migration Example](payload-ecommerce-starter.md).

The safest production migration is phased:

1. Add Adyen while keeping Stripe.
2. Switch checkout traffic to Adyen on a dev branch.
3. Test Adyen checkout, redirects, refused payments, and webhooks.
4. Deploy Adyen checkout.
5. Keep Stripe available for historical transactions, refunds, disputes, and reconciliation until you are ready to remove it.

## 1. Install

```bash
pnpm add payload-payment-adyen @adyen/adyen-web
```

Before registry publishing, install a packed tarball from this repo:

```bash
pnpm --filter payload-payment-adyen pack
pnpm add ./path/to/payload-payment-adyen-0.1.0.tgz @adyen/adyen-web
```

The package exports compiled ESM, so a normal app install should not need `transpilePackages`.

## 2. Add Environment Variables

```env
ADYEN_API_KEY=
ADYEN_MERCHANT_ACCOUNT=
ADYEN_ENVIRONMENT=test
ADYEN_HMAC_KEY=
ADYEN_LIVE_ENDPOINT_URL_PREFIX=
ADYEN_FORCE_REDIRECT_3DS=false

NEXT_PUBLIC_ADYEN_CLIENT_KEY=
NEXT_PUBLIC_ADYEN_ENVIRONMENT=test
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

## 3. Register the Server Adapter

```ts
import { adyenAdapter } from 'payload-payment-adyen'

ecommercePlugin({
  payments: {
    paymentMethods: [
      stripeAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY!,
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        webhookSecret: process.env.STRIPE_WEBHOOKS_SIGNING_SECRET!,
      }),
      adyenAdapter({
        apiKey: process.env.ADYEN_API_KEY!,
        clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY!,
        environment: process.env.ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
        forceRedirectThreeDS: process.env.ADYEN_FORCE_REDIRECT_3DS === 'true',
        hmacKey: process.env.ADYEN_HMAC_KEY,
        liveEndpointUrlPrefix: process.env.ADYEN_LIVE_ENDPOINT_URL_PREFIX,
        merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT!,
      }),
    ],
  },
})
```

Keep Stripe registered during the first migration phase so historical Stripe transactions remain readable and old Stripe operational flows keep working.

## 4. Register the Client Adapter

```tsx
import { adyenAdapterClient } from 'payload-payment-adyen/client'

<EcommerceProvider
  paymentMethods={[
    adyenAdapterClient({
      clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
      environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
    }),
  ]}
>
  {children}
</EcommerceProvider>
```

During a dual-provider phase, you can keep the Stripe client adapter too, but make sure checkout actually chooses Adyen.

## 5. Import Adyen CSS

Import this once in your app layout:

```ts
import '@adyen/adyen-web/styles/adyen.css'
```

## 6. Replace the Stripe Payment Form

Where your checkout currently calls `initiatePayment('stripe')`, switch to:

```ts
const paymentData = await initiatePayment('adyen', {
  additionalData: {
    customerEmail,
    billingAddress,
    countryCode: billingAddress?.country,
    shippingAddress,
    shopperLocale: navigator.language || 'en-US',
  },
})
```

Then mount:

```tsx
import { AdyenCheckoutForm } from 'payload-payment-adyen/react'

<AdyenCheckoutForm
  customerEmail={customerEmail}
  billingAddress={billingAddress}
  paymentData={paymentData}
  shippingAddress={shippingAddress}
/>
```

The component uses Payload Ecommerce's `usePayments()` internally to call `confirmOrder('adyen')`.

## 7. Add Redirect Return Handling

Adyen redirect flows return to:

```text
/checkout/confirm-order?sessionId=...&redirectResult=...
```

On that page:

```tsx
import { AdyenRedirectReturn } from 'payload-payment-adyen/react'

<AdyenRedirectReturn
  sessionID={sessionID}
  redirectResult={redirectResult}
  onOrderConfirmed={({ customerEmail, result }) => {
    const orderID = result && typeof result === 'object' && 'orderID' in result
      ? result.orderID
      : undefined

    if (orderID) {
      router.push(`/orders/${orderID}${customerEmail ? `?email=${encodeURIComponent(customerEmail)}` : ''}`)
    }
  }}
/>
```

If your existing Stripe return page also handles `payment_intent`, keep that branch until Stripe is fully retired.

## 8. Configure Adyen Webhooks

Configure a Standard webhook in Adyen:

```text
https://your-domain.example.com/api/payments/adyen/webhooks
```

Enable HMAC signing and put the HMAC key in `ADYEN_HMAC_KEY`.

For local testing, expose your dev server with a tunnel and use the public tunnel URL in Adyen.

## 9. Test Before Removing Stripe

Test at least:

- Successful card checkout.
- 3D Secure checkout.
- Refused payment.
- Shopper closes browser before redirect return; webhook should still create/reconcile the order.
- Duplicate redirect return; inventory should not decrement twice.
- Duplicate webhook delivery.
- Refund from Adyen Customer Area and webhook reconciliation.
- If using manual capture: capture and cancel.

## 10. Stripe Removal Strategy

Do not remove Stripe immediately from production projects unless you have confirmed what happens to historical Stripe transactions.

Recommended phases:

### Phase 1: Dual-provider

Keep Stripe and Adyen adapters registered. New checkout uses Adyen. Old Stripe orders remain readable.

### Phase 2: Stripe checkout removed

Remove Stripe frontend checkout code and Stripe client adapter if new shoppers can no longer pay with Stripe. Keep enough Stripe server/schema support to preserve historical transactions and operational needs.

### Phase 3: Full Stripe removal

Remove Stripe package, env vars, and webhook only when you no longer need:

- Stripe refunds.
- Stripe disputes.
- Stripe reconciliation.
- Readable Stripe transaction metadata in Payload.

If you want to remove the Stripe package but keep historical metadata, add a legacy transaction group before removing Stripe schema fields.
