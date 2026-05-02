# Billing and financials

## Purpose

Capture **payments**, **Stripe** linkage, and job pricing surfaces as they exist in code today.

## Current state

- **`payments`** rows and admin presentation rollups (e.g. `getPaymentAllocationRollup` in entity route imports).
- **Stripe:** archived implementation notes under `docs/archive/2026-05-02-docs-reset/implementation/STRIPE_SUPABASE_LINKING.md`; live behavior in `web/` (grep `stripe`, `payment_collect`, `customer_payment_methods` in schema).
- **Pricing:** `web/lib/pricing/` (`initializeJobPricing`, `overrideJobPricing`) integrates with workflow and admin flows.
- **Discounts:** admin job PATCH mentions discount code selection tokens; deals with discount tables per schema.

## How it works

- Job drawer shows computed totals via helpers (`computeJobDisplayTotalCents` etc. in admin entity route).
- Payment capture routes (e.g. payment-collect-context) assemble Stripe context for UI.
- Financial mutations should eventually reflect in events/workflows where the product uses them — **Needs verification** per route.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Job display totals | `web/lib/admin/jobDisplayPrice.ts`, `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Pricing init/override | `web/lib/pricing/initializeJobPricing.ts`, `web/lib/pricing/overrideJobPricing.ts` |
| Payment context | `web/app/api/admin/jobs/[id]/payment-collect-context/route.ts` |
| Schema | `customer_payment_methods`, `payments` in `supabase/migrations` / baseline SQL |

## Guardrails

- **Do not** calculate money only in the browser.
- **Do not** add new billing rules solely in UI components.
- **Do** run financial side effects server-side with org scoping and audit trails.

## Known gaps / risks

- **Needs verification:** End-to-end mapping of Stripe webhooks to local payment states (if any) in `web/app/api/**`.
- **Needs verification:** Refund/credit note model coverage.

## When this doc must be updated

Stripe flow changes, new tender types, tax, or pricing rule changes.
