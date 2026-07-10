# Payload Payment Adyen

This repository hosts `payload-payment-adyen`, an Adyen payment adapter and checkout helper package for Payload Ecommerce.

The npm package is published at:

```text
https://www.npmjs.com/package/payload-payment-adyen
```

Package source:

```text
packages/payload-payment-adyen
```

## Install

In a Payload Ecommerce app:

```bash
pnpm add payload-payment-adyen @adyen/adyen-web
```

The package provides:

- A server-side Payload Ecommerce payment adapter for Adyen.
- Client-side adapter configuration for Payload Ecommerce.
- React helpers for Adyen Web Drop-in and redirect returns.
- Adyen Standard webhook handling with optional HMAC verification.
- Admin-only capture, refund, and cancel endpoints.
- A best-effort migration CLI for the current Payload Ecommerce Starter.

## Starter Migration

For a fresh Payload Ecommerce Starter, install the package and run:

```bash
pnpm exec payload-payment-adyen migrate-starter --dry-run
pnpm exec payload-payment-adyen migrate-starter
```

Use `--remove-stripe` only when the project is a fresh starter and does not need Stripe for historical transactions:

```bash
pnpm exec payload-payment-adyen migrate-starter --remove-stripe
pnpm install
pnpm generate:types
```

See [packages/payload-payment-adyen/docs/payload-ecommerce-starter.md](packages/payload-payment-adyen/docs/payload-ecommerce-starter.md).

## Environment

Copy `.env.example` to `.env` and fill in your Adyen values:

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

`ADYEN_HMAC_KEY` is recommended for Standard webhook verification. `ADYEN_LIVE_ENDPOINT_URL_PREFIX` is required for live mode.

## Development

This repository is also a working Payload Ecommerce Starter used to test the package against a real storefront.

Install dependencies:

```bash
pnpm install
```

Build the package:

```bash
pnpm --filter payload-payment-adyen build
```

Run the starter:

```bash
pnpm dev
```

Run the local quality gate:

```bash
pnpm generate:types
pnpm generate:importmap
pnpm exec tsc --noEmit --pretty false
pnpm test:int
pnpm --filter payload-payment-adyen pack:dry
```

## Package Docs

- [Package README](packages/payload-payment-adyen/README.md)
- [Migrate from Stripe](packages/payload-payment-adyen/docs/migrate-from-stripe.md)
- [Payload Ecommerce Starter migration](packages/payload-payment-adyen/docs/payload-ecommerce-starter.md)

## Release

Before publishing:

```bash
pnpm --filter payload-payment-adyen pack:dry
cd packages/payload-payment-adyen
pnpm publish --dry-run
```

Publish:

```bash
pnpm publish --access public
```

## Status

The adapter is published as a pre-1.0 package. It is usable, but public APIs and the starter migration CLI may still change based on Payload Ecommerce and community feedback.

The migration CLI is intentionally best-effort for the current Payload Ecommerce Starter layout. Existing production projects should review the generated changes and keep Stripe available until historical refunds, disputes, and reconciliation are no longer needed.
