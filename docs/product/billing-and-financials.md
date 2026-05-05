# Billing and financials

## Purpose

Capture **payments**, **Stripe** linkage, and job pricing surfaces **as wired in `web/` today** — without claiming webhook or refund flows that are not verified in this app.

## Current state

- **`payments`** rows and admin presentation rollups (e.g. `getPaymentAllocationRollup` in entity route imports).
- **Stripe:** archived notes under `docs/archive/2026-05-02-docs-reset/implementation/STRIPE_SUPABASE_LINKING.md`; live code paths include **`payment-collect-context`**, **`customer_payment_methods`** in schema, and Stripe usage in job/admin flows (grep `stripe` under `web/`).
- **`customer_payment_methods`:** RLS is **deny-by-default** for browser/`authenticated` roles (no table policies). Treat as **service-role / server-only** today: reads and writes go through trusted API paths using the admin client or backend, not direct Supabase client access from the browser. **Do not add `authenticated` RLS policies** until product defines **customer portal / saved payment UX** and least-privilege rules are designed.
- **Pricing:** `web/lib/pricing/` (`initializeJobPricing`, `overrideJobPricing`) integrates with workflow and admin flows.
- **Discounts:** Admin job PATCH supports discount selection tokens per schema/routes.
- **Ledger / financials APIs:** e.g. **`web/app/api/admin/financials/ledger/route.ts`**, **`web/app/api/admin/financials/snapshot/route.ts`** — org-scoped reads for privileged roles.

## How it works

- Job drawer shows computed totals via helpers (`computeJobDisplayTotalCents` etc. in admin entity route).
- Payment capture routes (e.g. **`payment-collect-context`**) assemble Stripe context for UI.
- **Not fully verified:** Per financial mutation route, whether **`emitEvent`** / workflows always run where product intent expects — see **`docs/audits/event-integrity-audit.md`**.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Job display totals | `web/lib/admin/jobDisplayPrice.ts`, `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Pricing init/override | `web/lib/pricing/initializeJobPricing.ts`, `web/lib/pricing/overrideJobPricing.ts` |
| Payment context | `web/app/api/admin/jobs/[id]/payment-collect-context/route.ts` |
| Financials read APIs | `web/app/api/admin/financials/**` |
| Schema | `customer_payment_methods` (server-controlled; see note above), `payments` in `supabase/migrations` / baseline SQL |

## Guardrails

- **Do not** calculate money only in the browser.
- **Do not** add new billing rules solely in UI components.
- **Do** run financial side effects server-side with org scoping and audit trails.

## Known gaps / risks

- **Needs verification:** Stripe **webhook** handler location — smoke helpers reference **`${backendBase}/stripe/webhook`** (`web/tests/payments/paymentsTask2.smoke.helpers.ts`), which may be a **separate service** rather than `web/app/api/**`; confirm per deployment before documenting as Next route.
- **Needs verification:** Refund/credit note model coverage and UI completeness.

## When this doc must be updated

Stripe flow changes, new tender types, tax, or pricing rule changes.
