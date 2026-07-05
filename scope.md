# Adyen Payment Adapter for Payload CMS – Project Specification

## Project Goal

Build a production-quality **Adyen Payment Adapter** for the Payload CMS Ecommerce plugin.

The adapter should follow the architecture and conventions of the official Stripe adapter as closely as possible, replacing only the payment-provider-specific implementation.

The end goal is to publish this adapter as a standalone Payload plugin, but **the initial development will happen inside the Payload Ecommerce Starter**. The adapter will only be extracted into its own package after it is fully functional and tested.

---

# Current Development Environment

The repository is based on the official Payload Ecommerce Starter.

Current setup includes:

- Payload Ecommerce Starter
- Seeded demo content
- Working Stripe integration
- Test infrastructure already installed
- Adyen test account available

The Ecommerce Starter serves as the development and testing environment because it already contains:

- Products
- Carts
- Checkout flow
- Orders
- Transactions
- Payment endpoints
- Frontend checkout UI

This environment should remain the primary place for development until the adapter is complete.

---

# Primary References

The implementation should use these references, in order of importance.

## 1. Stripe Adapter (Primary Reference)

Treat the official Stripe adapter as the reference implementation.

Goals:

- Mirror folder structure
- Mirror exported APIs
- Mirror server/client separation
- Mirror Payload integration
- Mirror error handling where appropriate
- Mirror transaction lifecycle
- Replace only the provider-specific Stripe API logic with Adyen

Avoid inventing a different architecture unless Adyen fundamentally requires it.

---

## 2. Payload Documentation

Use the official documentation for custom payment adapters as the specification for required interfaces and expected behavior.

https://payloadcms.com/docs/ecommerce/payments

## 3. Adyen API Documentation

Use Adyen's official API and integration documentation as the specification for provider-specific behavior.

The adapter must be compatible with Adyen's documented APIs and must not assume Stripe-style behavior where Adyen uses a different lifecycle.

Primary Adyen references:

- Sessions flow / Checkout API
- Web Drop-in integration
- Redirect handling
- Standard webhooks
- HMAC webhook verification
- Test and live environment configuration
- Currency and minor-unit amount handling
- Idempotency guidance

Relevant documentation:

- https://docs.adyen.com/online-payments/build-your-integration/sessions-flow/
- https://docs.adyen.com/online-payments/web-drop-in/
- https://docs.adyen.com/development-resources/webhooks/
- https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures/
- https://docs.adyen.com/development-resources/currency-codes/
- https://docs.adyen.com/development-resources/api-credentials/
- https://docs.adyen.com/online-payments/go-live/

Before implementing each payment lifecycle step, verify the expected request shape, response shape, status/result codes, and security requirements against the current Adyen documentation.

---

## Development Philosophy

When in doubt:

- Prefer consistency with the Stripe adapter.
- Prefer Adyen's documented API lifecycle for provider-specific behavior.
- Keep changes localized to Adyen-specific logic.
- Avoid modifying Payload Ecommerce internals unless absolutely necessary.
- Produce reusable code that can later become a standalone plugin with minimal refactoring.

---

# Initial Repository Layout

During development, keep the adapter inside the Ecommerce project.

Example structure:

```text
plugins/
    adyen/
        index.ts
        client/
        server/
        endpoints/
        webhooks/
        types.ts
```

The exact layout may evolve, but it should closely resemble the Stripe adapter.

---

# Scope

The adapter should eventually support:

- Payment initiation
- Payment confirmation
- Transaction creation
- Order confirmation
- Redirect-based payment flows if required
- Webhooks/callbacks
- Webhook HMAC signature verification
- Idempotent handling of duplicate confirmations and duplicate webhook events
- Proper error handling
- Sandbox/Test mode
- Production configuration

---

# Development Strategy

Implement incrementally.

Suggested order:

1. Study the Stripe adapter.
2. Understand the PaymentAdapter interface.
3. Study the relevant Adyen API documentation for the intended flow.
4. Decide and document the initial Adyen flow, preferably Sessions + Web Drop-in unless the API docs indicate a better fit.
5. Create a minimal Adyen adapter that compiles.
6. Register it in the Ecommerce configuration.
7. Ensure Payload boots successfully.
8. Implement payment initiation.
9. Implement the frontend Adyen checkout flow.
10. Implement confirmation flow.
11. Implement webhook handling and HMAC verification.
12. Validate the complete checkout flow.
13. Add comprehensive tests.
14. Refactor only after all tests pass.

---

# Testing

Tests should be added throughout development.

Focus on:

- Adapter logic
- Payment initiation
- Confirmation
- Webhook processing
- Webhook signature verification
- Duplicate webhook and duplicate confirmation handling
- Error handling
- Failed payment scenarios
- Successful payment scenarios
- Redirect payment scenarios

Mock Adyen APIs where practical.

---

# Refactoring Policy

Do **not** optimize for package structure during implementation.

Priority is:

1. Correct functionality
2. Stable tests
3. Readable code
4. Plugin extraction

Only after the adapter is stable and tests pass should it be extracted into its own package.

---

# Future Extraction Goal

Once complete, move the adapter into its own standalone package.

Example target structure:

```text
packages/
    payload-payment-adyen/

apps/
    ecommerce-demo/
```

The public API should remain identical to the implementation developed inside the Ecommerce Starter.

---

# Expectations for Codex

When making implementation decisions:

- Reuse existing Payload patterns whenever possible.
- Minimize unnecessary abstraction.
- Keep commits small and incremental.
- Explain any deviation from the Stripe implementation.
- Flag any Payload limitations or API assumptions.
- Ask for confirmation before introducing large architectural changes.

The objective is not to redesign Payload's payment architecture, but to implement a robust Adyen adapter that feels like an official first-party provider.
