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

---

## Development Philosophy

When in doubt:

- Prefer consistency with the Stripe adapter.
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
- Proper error handling
- Sandbox/Test mode
- Production configuration

---

# Development Strategy

Implement incrementally.

Suggested order:

1. Study the Stripe adapter.
2. Understand the PaymentAdapter interface.
3. Create a minimal Adyen adapter that compiles.
4. Register it in the Ecommerce configuration.
5. Ensure Payload boots successfully.
6. Implement payment initiation.
7. Implement confirmation flow.
8. Implement webhook handling.
9. Validate the complete checkout flow.
10. Add comprehensive tests.
11. Refactor only after all tests pass.

---

# Testing

Tests should be added throughout development.

Focus on:

- Adapter logic
- Payment initiation
- Confirmation
- Webhook processing
- Error handling
- Failed payment scenarios
- Successful payment scenarios

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
