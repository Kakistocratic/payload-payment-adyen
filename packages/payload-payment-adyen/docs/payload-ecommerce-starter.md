# Payload Ecommerce Starter Migration Example

This guide shows the concrete changes needed to replace the default Stripe checkout in a fresh Payload Ecommerce Starter with `payload-payment-adyen`.

It was validated against a clean starter by installing the packed package tarball, wiring the compiled exports, running checkout, and regenerating Payload types. Use this as the source example before building an automated migrate script.

## Scope

This example assumes a fresh Payload Ecommerce Starter that still uses the default Stripe integration:

- `src/plugins/index.ts` registers `stripeAdapter`.
- `src/providers/index.tsx` registers `stripeAdapterClient`.
- `src/components/checkout/CheckoutPage.tsx` mounts Stripe Elements.
- `src/components/checkout/ConfirmOrder.tsx` handles Stripe return parameters.
- `src/components/forms/CheckoutForm/index.tsx` contains the Stripe payment form.

For a production migration with historical Stripe transactions, keep Stripe registered until you have a retention plan. For a fresh starter, replacing Stripe fully is reasonable.

## Install

```bash
pnpm add payload-payment-adyen @adyen/adyen-web
```

For local package testing before publishing:

```bash
pnpm add ./path/to/payload-payment-adyen-0.8.0.tgz @adyen/adyen-web
```

## Environment

Replace the Stripe variables in `.env` and `.env.example` with:

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

`ADYEN_HMAC_KEY` is required for signed webhook verification. `ADYEN_LIVE_ENDPOINT_URL_PREFIX` is only required for live mode.

## Server Adapter Config

In `src/plugins/index.ts`, replace the Stripe adapter import and payment method registration.

```ts
import { adyenAdapter } from 'payload-payment-adyen'
```

```ts
ecommercePlugin({
  payments: {
    paymentMethods: [
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

The adapter adds the Adyen transaction group and the `/api/payments/adyen/*` endpoints through Payload Ecommerce.

## Client Provider Example

In `src/providers/index.tsx`, replace the Stripe client adapter.

```tsx
import { adyenAdapterClient } from 'payload-payment-adyen/client'
```

```tsx
<EcommerceProvider
  enableVariants={true}
  api={/* keep the starter's existing API options */}
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

## Import Adyen Web CSS

Import Adyen's CSS once from the storefront layout, usually `src/app/(app)/layout.tsx`.

```ts
import '@adyen/adyen-web/styles/adyen.css'
import './globals.css'
```

Keep the Adyen import before your app CSS if you want local styles to override Adyen defaults.

## Checkout Form Replacement Example

In `src/components/checkout/CheckoutPage.tsx`, remove Stripe Elements and the starter `CheckoutForm`. Use the package React helper instead.

```tsx
import { AdyenCheckoutForm, type AdyenPaymentData } from 'payload-payment-adyen/react'
```

Store the initiated payment response as Adyen session data:

```tsx
const [paymentData, setPaymentData] = useState<AdyenPaymentData | null>(null)
const { initiatePayment } = usePayments()
const { cart, clearCart } = useCart()
```

Initiate Adyen with billing, shipping, country, and locale details:

```tsx
const paymentData = (await initiatePayment('adyen', {
  additionalData: {
    ...(email ? { customerEmail: email } : {}),
    billingAddress,
    countryCode: billingAddress?.country,
    shippingAddress: billingAddressSameAsShipping ? billingAddress : shippingAddress,
    shopperLocale:
      typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US',
  },
})) as AdyenPaymentData

if (paymentData) {
  setPaymentData(paymentData)
}
```

Mount Drop-in when `paymentData` exists:

```tsx
{paymentData && (
  <div className="pb-16">
    <h2 className="font-medium text-3xl">Payment</h2>
    <div className="flex flex-col gap-8">
      <AdyenCheckoutForm
        billingAddress={billingAddress}
        customerEmail={email}
        onOrderConfirmed={({ accessToken, customerEmail, orderID }) => {
          const queryParams = new URLSearchParams()

          if (customerEmail) {
            queryParams.set('email', customerEmail)
          }
          if (accessToken) {
            queryParams.set('accessToken', accessToken)
          }

          clearCart()

          const queryString = queryParams.toString()
          router.push(`/orders/${orderID}${queryString ? `?${queryString}` : ''}`)
        }}
        paymentData={paymentData}
        setProcessingPayment={setProcessingPayment}
        shippingAddress={billingAddressSameAsShipping ? billingAddress : shippingAddress}
      />
      <Button variant="ghost" className="self-start" onClick={() => setPaymentData(null)}>
        Cancel payment
      </Button>
    </div>
  </div>
)}
```

The helper calls `confirmOrder('adyen')` internally after successful payment completion.

## Redirect Return Page Example

Adyen redirect flows return to:

```text
/checkout/confirm-order?sessionId=...&redirectResult=...
```

In `src/components/checkout/ConfirmOrder.tsx`, replace the Stripe `payment_intent` handling with `AdyenRedirectReturn`.

```tsx
'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { AdyenRedirectReturn } from 'payload-payment-adyen/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

export const ConfirmOrder: React.FC = () => {
  const { clearCart } = useCart()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionID = searchParams.get('sessionId')
  const redirectResult = searchParams.get('redirectResult')
  const email = searchParams.get('email')

  useEffect(() => {
    if (!sessionID || !redirectResult) {
      router.push('/')
    }
  }, [redirectResult, router, sessionID])

  if (sessionID && redirectResult) {
    return (
      <AdyenRedirectReturn
        redirectResult={redirectResult}
        sessionID={sessionID}
        onOrderConfirmed={({ accessToken, customerEmail, orderID }) => {
          const queryParams = new URLSearchParams()
          const resolvedEmail = customerEmail || email

          if (resolvedEmail) {
            queryParams.set('email', resolvedEmail)
          }
          if (accessToken) {
            queryParams.set('accessToken', accessToken)
          }

          clearCart()

          const queryString = queryParams.toString()
          router.push(`/orders/${orderID}${queryString ? `?${queryString}` : ''}`)
        }}
      />
    )
  }

  return (
    <div className="text-center w-full flex flex-col items-center justify-start gap-4">
      <h1 className="text-2xl">Confirming Order</h1>
      <LoadingSpinner className="w-12 h-6" />
    </div>
  )
}
```

## Fresh Starter Cleanup

For a fresh starter where Stripe is not needed:

```bash
pnpm remove @stripe/react-stripe-js @stripe/stripe-js stripe
pnpm run generate:types
```

Then remove:

- `stripe-webhooks` from `package.json` scripts.
- `src/components/forms/CheckoutForm/index.tsx` if it is only used for Stripe.
- Stripe seed transaction data, or convert sample transactions to `paymentMethod: 'adyen'`.
- Stripe setup copy from checkout/admin onboarding components.

Generated `payload-types.ts` should show `paymentMethod?: 'adyen' | null` and an `adyen` transaction group.

## Verification Checklist

Before turning this into an automated migration script, verify manually:

- The app starts with the package installed as a normal dependency or packed tarball.
- `/api/payments/adyen/initiate` creates an Adyen session and pending transaction.
- Drop-in renders after `initiatePayment('adyen')`.
- A successful card payment creates an order and clears the cart.
- Redirect payment methods return through `AdyenRedirectReturn` and create exactly one order.
- Refused payments show an error and record outcome where possible.
- `/api/payments/adyen/webhooks` accepts signed Adyen Standard webhook events.
- `pnpm run generate:types` reflects the Adyen transaction schema.

## Automation Notes

The package includes a narrow `migrate-starter` CLI based on these examples:

```bash
pnpm exec payload-payment-adyen migrate-starter --dry-run
pnpm exec payload-payment-adyen migrate-starter
```

For a fresh starter where Stripe should be removed:

```bash
pnpm exec payload-payment-adyen migrate-starter --remove-stripe
pnpm install
pnpm generate:types
```

The script is based on these examples, not on assumptions about arbitrary app structure. Keep it narrow:

- Detect a Payload Ecommerce Starter layout.
- Replace known Stripe imports and adapter calls.
- Add Adyen env vars without overwriting existing local secrets.
- Patch known Stripe-specific checkout and redirect-return sections in place.
- Remove Stripe dependencies only when the user explicitly chooses a fresh-starter replacement mode.
- Convert known starter Stripe seed transactions to Adyen seed transactions in fresh-starter replacement mode.
- Run `payload generate:types` after schema changes.
