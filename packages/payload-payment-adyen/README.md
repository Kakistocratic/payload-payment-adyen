# payload-payment-adyen

Adyen payment adapter and checkout helpers for Payload Ecommerce.

This package is developed inside a Payload Ecommerce Starter so it can be tested against a real storefront while remaining installable as a standalone package.

## Install

Workspace development:

```bash
pnpm add payload-payment-adyen@workspace:*
```

Registry install after publishing:

```bash
pnpm add payload-payment-adyen @adyen/adyen-web
```

Packed tarball install before registry publishing:

```bash
pnpm --filter payload-payment-adyen pack
pnpm add ./path/to/payload-payment-adyen-0.8.0.tgz @adyen/adyen-web
```

The package exports compiled ESM from `dist`, so consuming apps should not need `transpilePackages` for normal registry or tarball installs.

## Package Build

Build the package:

```bash
pnpm --filter payload-payment-adyen build
```

Check what would be published:

```bash
pnpm --filter payload-payment-adyen pack:dry
```

The package publishes only `dist`, `docs`, `README.md`, and `package.json`.

## Starter Migration CLI

For a fresh Payload Ecommerce Starter, run the migration helper from the target project:

```bash
pnpm exec payload-payment-adyen migrate-starter --dry-run
pnpm exec payload-payment-adyen migrate-starter
```

Use `--remove-stripe` only when the project is a fresh starter and you do not need Stripe for historical transactions:

```bash
pnpm exec payload-payment-adyen migrate-starter --remove-stripe
pnpm install
pnpm generate:types
```

The script detects the known starter layout, adds Adyen env vars and CSS, patches the server/client adapter wiring, patches known Stripe-specific checkout sections in place, and with `--remove-stripe` converts known Stripe seed transactions to Adyen seed transactions. See [docs/payload-ecommerce-starter.md](docs/payload-ecommerce-starter.md).

## Server Adapter

```ts
import { adyenAdapter } from 'payload-payment-adyen'

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

## Client Adapter

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

## React Helpers

Import Adyen Web CSS once in your app layout:

```ts
import '@adyen/adyen-web/styles/adyen.css'
```

Mount Drop-in after calling `initiatePayment('adyen')`:

```tsx
import { AdyenCheckoutForm } from 'payload-payment-adyen/react'

<AdyenCheckoutForm
  customerEmail={email}
  billingAddress={billingAddress}
  paymentData={paymentData}
  shippingAddress={shippingAddress}
/>
```

Handle redirect returns:

```tsx
import { AdyenRedirectReturn } from 'payload-payment-adyen/react'

<AdyenRedirectReturn
  sessionID={sessionID}
  redirectResult={redirectResult}
  onOrderConfirmed={({ customerEmail, result }) => {
    // route to your order page
  }}
/>
```

## Environment

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

## Endpoints

The adapter registers:

- `POST /api/payments/adyen/initiate`
- `POST /api/payments/adyen/confirm-order`
- `POST /api/payments/adyen/outcome`
- `POST /api/payments/adyen/webhooks`
- `POST /api/payments/adyen/transactions/:transactionID/capture`
- `POST /api/payments/adyen/transactions/:transactionID/refund`
- `POST /api/payments/adyen/transactions/:transactionID/cancel`

The capture/refund/cancel endpoints are admin-only and asynchronous. Adyen webhooks remain the source of truth for final operation status.

## Migration

- [Migrate from Stripe](docs/migrate-from-stripe.md)
- [Payload Ecommerce Starter migration example](docs/payload-ecommerce-starter.md)
