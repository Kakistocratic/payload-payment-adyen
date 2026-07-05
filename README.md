# Payload Ecommerce Adyen Adapter

This project is a Payload Ecommerce Starter fork used to build and test an Adyen payment adapter.

The adapter now lives in the workspace package at `packages/payload-payment-adyen`. The starter app consumes that package through `payload-payment-adyen`, the same import path that can later be published or installed from Git.

## Current Status

Implemented:

- Adyen Sessions API checkout flow.
- Adyen Web Drop-in on the storefront checkout page.
- Card payment completion, including 3D Secure.
- Redirect-return handling for payment methods that leave the checkout page.
- Standard webhook endpoint with optional HMAC verification.
- Webhook-owned order completion for successful `AUTHORISATION` events.
- Idempotent browser and webhook order confirmation.
- Failed/refused/cancelled outcome recording.
- Shopper locale forwarding and Drop-in translation plumbing.
- Optional forced redirect 3DS mode.
- Admin-only capture, refund, and cancel endpoints.
- Adyen metadata fields on Payload transactions.
- Focused integration tests for utilities, order completion, and modification endpoint access.

Not finished:

- Extraction into a standalone npm package.
- Full live Adyen E2E coverage in CI.
- Admin UI buttons for capture/refund/cancel. The endpoints exist, but there is not yet a custom Payload admin action UI.
- Cleanup of unrelated starter TypeScript errors.

## Relevant Files

- `packages/payload-payment-adyen/src/index.ts`: adapter registration, transaction metadata fields, and endpoint registration.
- `packages/payload-payment-adyen/src/initiatePayment.ts`: creates Adyen Sessions and Payload transactions.
- `packages/payload-payment-adyen/src/confirmOrder.ts`: browser-return order confirmation.
- `packages/payload-payment-adyen/src/completeOrder.ts`: shared idempotent order creation used by browser return and webhooks.
- `packages/payload-payment-adyen/src/endpoints/webhooks.ts`: Standard webhook handling, HMAC validation, transaction reconciliation.
- `packages/payload-payment-adyen/src/endpoints/outcome.ts`: records failed or refused in-page outcomes.
- `packages/payload-payment-adyen/src/endpoints/modifyPayment.ts`: admin-only capture/refund/cancel endpoints.
- `packages/payload-payment-adyen/src/react/AdyenCheckoutForm.tsx`: reusable Adyen Web Drop-in integration.
- `packages/payload-payment-adyen/src/react/AdyenRedirectReturn.tsx`: reusable redirect-return handler.
- `src/components/checkout/ConfirmOrder.tsx`: starter page that wires Adyen/Stripe return handling to app routing.
- `src/components/checkout/CheckoutPage.tsx`: checkout flow wired to `initiatePayment('adyen')`.
- `src/providers/index.tsx`: client-side payment adapter registration.

## Environment Variables

Copy `.env.example` to `.env` and fill in the Adyen values.

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

### Variable Reference

| Variable | Required | Notes |
| --- | --- | --- |
| `ADYEN_API_KEY` | Yes | Server-side Adyen API key. Never expose this to the browser. |
| `ADYEN_MERCHANT_ACCOUNT` | Yes | Merchant account used for Sessions and payment modifications. |
| `ADYEN_ENVIRONMENT` | Yes | `test` or `live`. Defaults to `test` in project config. |
| `ADYEN_HMAC_KEY` | Recommended | Standard webhook HMAC key. If omitted, webhook HMAC validation is skipped. |
| `ADYEN_LIVE_ENDPOINT_URL_PREFIX` | Live only | Required by Adyen for live Checkout API URLs. |
| `ADYEN_FORCE_REDIRECT_3DS` | Optional | Set to `true` to request redirect 3DS by sending `nativeThreeDS: "disabled"`. |
| `NEXT_PUBLIC_ADYEN_CLIENT_KEY` | Yes | Browser-safe client key used by Adyen Web Drop-in. |
| `NEXT_PUBLIC_ADYEN_ENVIRONMENT` | Yes | `test` or `live` for Adyen Web. |
| `NEXT_PUBLIC_SERVER_URL` | Yes | Used to build the Adyen `returnUrl` when no explicit `returnURL` is passed. |

Stripe variables are still present because the starter still includes the Stripe adapter.

## Adyen Account Setup

In the Adyen Customer Area:

1. Create or use an API credential with Checkout API permissions.
2. Add the allowed origin for your frontend, for example `http://localhost:3000`.
3. Copy the client key into `NEXT_PUBLIC_ADYEN_CLIENT_KEY`.
4. Enable the payment methods you want to test.
5. Configure a Standard webhook pointing to:

```text
https://your-public-host.example.com/api/payments/adyen/webhooks
```

For local testing, expose your dev server with a tunnel such as ngrok or Cloudflare Tunnel and use that public URL in Adyen.

Enable HMAC signing for the Standard webhook and put the generated HMAC key in `ADYEN_HMAC_KEY`.

Useful Adyen docs:

- [Sessions flow](https://docs.adyen.com/online-payments/build-your-integration/sessions-flow/)
- [Web Drop-in](https://docs.adyen.com/online-payments/web-drop-in/)
- [Standard webhooks](https://docs.adyen.com/development-resources/webhooks/)
- [HMAC webhook verification](https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures/)
- [Capture](https://docs.adyen.com/online-payments/capture/)
- [Refund](https://docs.adyen.com/online-payments/refund/)
- [Cancel](https://docs.adyen.com/online-payments/cancel/)

## Running Locally

Install dependencies:

```bash
pnpm install
```

Start the app:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

Create the first admin user through the Payload admin onboarding flow.

## Checkout Flow

The storefront checkout currently uses Adyen:

1. Shopper enters contact and address details.
2. Checkout calls `initiatePayment('adyen')`.
3. The server creates an Adyen Session.
4. The server creates a Payload transaction with Adyen metadata.
5. The browser mounts Adyen Web Drop-in using the returned session ID and session data.
6. Drop-in completes in-page, or redirects away and returns to `/checkout/confirm-order`.
7. Successful completion creates a Payload order and links the transaction.
8. Adyen webhooks reconcile the transaction, and can also create the order if the browser never returns.

The adapter stores Adyen metadata under the `adyen` group on transactions, including:

- `sessionID`
- `merchantReference`
- `pspReference`
- `resultCode`
- `sessionResult`
- `shopperLocale`
- `paymentMethod`
- `eventCode`
- modification PSP references for capture/refund/cancel

## Redirect Returns

Redirect-based payment methods return to:

```text
/checkout/confirm-order?sessionId=...&redirectResult=...
```

The confirm page calls Adyen Web `submitDetails` and then confirms the Payload order through the ecommerce payment API.

For guest checkouts, browser-only return context such as email and shipping address is stored in `sessionStorage`. The `returnUrl` itself does not contain PII.

Webhook completion does not depend on `sessionStorage`. The server persists the shipping address on the transaction when the Adyen Session is created, so a successful authorization webhook can still create the order if the shopper closes the browser before returning.

## Webhooks

Endpoint:

```text
POST /api/payments/adyen/webhooks
```

The endpoint accepts Adyen Standard webhook payloads.

Handled event codes include:

- `AUTHORISATION`
- `CAPTURE`
- `CAPTURE_FAILED`
- `REFUND`
- `REFUND_FAILED`
- `REFUNDED_REVERSED`
- `CANCELLATION`
- `TECHNICAL_CANCEL`

`AUTHORISATION` with `success: "true"` is authoritative for successful payment. It updates the transaction and creates the order if needed.

Duplicate browser returns and duplicate webhook delivery are expected. The order creation path is idempotent and will not create a second order or decrement inventory twice.

## Payment Modifications

The adapter exposes admin-only endpoints for post-payment operations:

```text
POST /api/payments/adyen/transactions/:transactionID/capture
POST /api/payments/adyen/transactions/:transactionID/refund
POST /api/payments/adyen/transactions/:transactionID/cancel
```

These endpoints require an authenticated Payload user with the `admin` role.

### Capture

Capture is for authorized payments that have not already been auto-captured.

```http
POST /api/payments/adyen/transactions/123/capture
Content-Type: application/json

{
  "amount": {
    "currency": "EUR",
    "value": 1000
  },
  "reference": "capture-123"
}
```

If `amount` is omitted, the transaction amount is used.

### Refund

Refund is for captured payments.

```http
POST /api/payments/adyen/transactions/123/refund
Content-Type: application/json

{
  "amount": {
    "currency": "EUR",
    "value": 1000
  },
  "reference": "refund-123",
  "merchantRefundReason": "CUSTOMER REQUEST"
}
```

If `amount` is omitted, the transaction amount is used.

### Cancel

Cancel is for authorized payments that have not been captured.

```http
POST /api/payments/adyen/transactions/123/cancel
Content-Type: application/json

{
  "reference": "cancel-123"
}
```

### Modification Lifecycle

Adyen modification requests are asynchronous. A successful endpoint response means Adyen accepted the request for processing. The final result comes through webhooks.

Normal lifecycle:

- Use `capture` after authorization when manual capture is enabled.
- Use `cancel` before capture.
- Use `refund` after capture.
- Treat Adyen webhooks as the source of truth for final operation status.

## 3D Secure Testing

3D Secure is a good redirect/additional-auth test case.

Common Adyen test cards:

```text
Visa:       4917 6100 0000 0000
Mastercard: 5454 5454 5454 5454
Expiry:    03/2030
CVC:       737
Password:  password
```

Depending on Adyen configuration, 3DS can be native/in-page or redirect-based. To force redirect-style 3DS for testing, set:

```env
ADYEN_FORCE_REDIRECT_3DS=true
```

Then restart the dev server.

## iDEAL Testing

For iDEAL:

1. Enable iDEAL in your Adyen test account.
2. Use country `NL` and currency `EUR`.
3. Choose iDEAL in Drop-in.
4. Use issuer `TESTNL2A`.

iDEAL is country-specific, so it may not appear unless the checkout country/currency and merchant configuration match.

## Localization

The checkout flow sends `shopperLocale` to Adyen Sessions and passes `locale` into Adyen Web.

The adapter also supports a `translations` option:

```ts
adyenAdapter({
  apiKey: process.env.ADYEN_API_KEY!,
  clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY!,
  merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT!,
  translations: {
    'nb-NO': {
      payButton: 'Betal',
    },
  },
})
```

Payload admin translations and Adyen Drop-in translations are separate concerns. Payload localization does not automatically translate the Adyen iframe/component UI.

## Tests

Run integration tests:

```bash
pnpm test:int
```

Current focused test coverage includes:

- Adyen HMAC payload and validation.
- Adyen Sessions and modification URL generation.
- Shopper reference formatting.
- Cart item flattening for transaction rows.
- Idempotent Adyen order completion.
- Admin-only modification endpoint access.

Generate Payload types after schema changes:

```bash
pnpm generate:types
```

Run TypeScript:

```bash
pnpm exec tsc --noEmit
```

At the time this README was written, the Adyen-specific TypeScript errors were resolved, but the starter still had unrelated baseline TypeScript errors in:

- `src/components/Cart/CartModal.tsx`
- `src/components/checkout/CheckoutPage.tsx`
- `src/utilities/generatePreviewPath.ts`

## Production Notes

Before live use:

1. Use `ADYEN_ENVIRONMENT=live` and `NEXT_PUBLIC_ADYEN_ENVIRONMENT=live`.
2. Set `ADYEN_LIVE_ENDPOINT_URL_PREFIX`.
3. Use a live Adyen API key and live client key.
4. Configure live allowed origins in Adyen.
5. Configure the live Standard webhook with HMAC signing.
6. Confirm webhook delivery from Adyen to your deployed Payload app.
7. Verify currency minor-unit handling for every supported currency.
8. Decide whether the merchant uses automatic capture or manual capture.
9. Test refused, cancelled, redirect, webhook-only, refund, capture, and cancel scenarios.

## Package and Migration Docs

The installable package source lives at:

```text
packages/payload-payment-adyen
```

Package docs:

- `packages/payload-payment-adyen/README.md`
- `packages/payload-payment-adyen/docs/migrate-from-stripe.md`

The starter consumes the package through workspace imports:

```ts
import { adyenAdapter } from 'payload-payment-adyen'
import { adyenAdapterClient } from 'payload-payment-adyen/client'
import { AdyenCheckoutForm, AdyenRedirectReturn } from 'payload-payment-adyen/react'
```

Remaining package work:

- Add compiled package output for registry publishing instead of source-only workspace/Git installs.
- Add package-level API tests with mocked Adyen API responses.
- Decide whether admin capture/refund/cancel should stay endpoint-only or gain optional Payload admin UI components.
- Keep the adapter aligned with Payload Ecommerce's `PaymentAdapter` contract.
