---
owner: payments
status: canonical
last_reviewed: 2026-09-30
supersedes: none
---

# Payments V1 — the current system, after W6-A1

What survives, what each thing is for, and what is still legacy. This describes the product **after
W6-A1 only**: W6-A2 residue is labelled as such rather than hidden, because a map that quietly omits
what it has not finished is how two Payments systems went unnoticed in the first place.

## 1 · Route map

Routes are read/context surfaces. **No route writes money** — every money write goes through a
registered action at `POST /api/admin/actions/execute`, which is the single admission point.

| Path | Permission | Authority | Mounted caller | Class |
| --- | --- | --- | --- | --- |
| `GET /api/admin/financials/payment-flow` | `fin.read` | `resolveFinancialPaymentFlow` | Financials Workspace → Payments | canonical |
| `GET /api/admin/financials/payment-methods` | `fin.write` | `payment_methods` reader | `PaymentMethodsSection` | canonical |
| `GET /api/admin/financials/payments-health` | `fin.read` | provider configuration health | provider readiness surface | canonical (W5) |
| `GET /api/admin/financials/autopay` | `fin.read` / `fin.write` | `payment_autopay_arrangements` | `AutopaySection` | canonical (W5) |
| `GET /api/admin/financials/card` | `fin.read` | `buildFinancialsCardVM` | Focus Panel Financials | canonical |
| `GET /api/admin/financials/collection-state` | `fin.read` | collection attempt reader | collection surfaces | canonical |
| `GET /api/admin/financials/eligible-target-charges` | `fin.read` | `eligibleTargetCharges` | apply/move chooser | canonical (courtesy chooser, not a boundary) |
| `POST /api/public/forms/[token]/enrollment-payment` | public form token | enrollment payment intake | public enrollment form | canonical, non-operator |
| `POST /api/admin/actions/execute` | per action | the action registry | every Payments control | canonical admission point |

**Deleted in W6-A1**, each with zero mounted caller measured immediately before:
`POST /api/admin/payments/run`, `PATCH`+`GET /api/admin/payments/[id]`,
`GET /api/admin/payments`, `GET /api/admin/jobs/[id]/payments`,
`GET /api/admin/jobs/[id]/payment-collect-context`,
`schedules/[id]/post-customer-payment`, `post-vendor-payout`, `post-completion`,
`jobs/[id]/charges`, plus `app/debug/stripe` and the duplicate
`legacy-admin/financials/payments` workspace.

There is now exactly one route for each of: recording money (the action registry), provider
collection (the registry), method storage (`payment-methods` + the registry), refund (the registry),
recognition (the registry) and provider configuration (`payments-health`).

## 2 · Action map

Seventeen registered actions. All money writes live here.

| Action | Permission | Canonical writer | Mounted caller |
| --- | --- | --- | --- |
| `payment.record` | `fin.write` | `recordChildcarePayment` | Financials → Record manual payment |
| `payment.collect_card` | `fin.write` | collection attempt → provider adapter | Financials → Take payment |
| `payment.apply_to_charge` | `fin.write` | `applyPaymentToCharge` | Details → Apply, and held-deposit Apply |
| `payment.reverse_application` | `fin.write` | `reverseApplication` | Details → Move payment |
| `payment.refund` | `fin.adjust` | `requestProviderRefund` / `refundChildcarePayment` | receipt → Refund, held lot → Refund |
| `payment.recognize` | `fin.provider` | `recognizeProviderRefund` / recognition | webhook + inline recognition |
| `payment_method.add` | `fin.write` | `payment_methods` | `PaymentMethodSetupField` |
| `payment_method.revoke` | `fin.write` | `payment_methods` | `PaymentMethodsSection` |
| `payment_method.set_default` | `fin.write` | `set_default_payment_method` RPC | `PaymentMethodsSection` |
| `autopay.enroll` | `fin.write` | `payment_autopay_arrangements` | `AutopaySection` → Authorize Autopay |
| `autopay.pause` / `.resume` / `.revoke` | `fin.write` | same | `AutopaySection` |
| `deposit.hold` | `fin.adjust` | `createPaymentHold` | receipt → Hold (W6-B) |
| `deposit.release` | `fin.adjust` | `disposeHold` | held lot → Release (W6-B) |
| `provider.connect` / `.disconnect` / `.refresh_readiness` | `fin.provider` | provider installation | provider settings |

There is no `deposit.apply` and no `deposit.refund`, deliberately: applying held money is an ordinary
allocation and refunding it is an ordinary refund, so both reuse the canonical action with the hold
named as an input. A second authority over money that already has one would have to be kept in
agreement forever.

**Dead aliases removed in W6-A1:** `payment.apply` (canonical: `payment.apply_to_charge`) and
`payment.move` (canonical: `payment.reverse_application`). Neither was ever registered; both were
instrumentation labels, so nothing dispatched them and nothing broke — which is exactly why they
survived. `tests/financials/payments/paymentsCommandKeysRegistered.test.ts` now refuses any mounted
Payments label that is not a registered action, and found `payment.move` on its first run.

## 3 · Schema map

**CANONICAL MONEY** — `payments`, `payment_allocations`, `charges`, `charge_line_items`,
`ledger_transactions`.

**CANONICAL PROVIDER** — `payment_collection_attempts`, `payment_provider_events`,
`payment_provider_refunds` (carrying `hold_id` since W6-B), `payment_provider_merchants`.

**CANONICAL METHODS** — `payment_methods`.

**CANONICAL AUTOPAY** — `payment_autopay_arrangements`, plus `scheduled_work` /
`scheduled_work_occurrences` / `scheduled_work_attempts` as the unattended runner.

**CANONICAL HOLDS / DEPOSITS** — `payment_holds` (immutable lots), `payment_hold_dispositions`
(append-only), `apply_held_funds_atomic` (W6-B).

**ADJACENT FINANCIALS** — `financial_responsibility_*`, `subsidy_claims`, discount and GL mapping
tables.

**W6-A2 LEGACY RESIDUE — still present, and named rather than claimed gone:**

* `payment_statuses` — **NOT dropped.** Its web readers are gone, but
  `backend/app/supabase_client.py` reads *and writes* it
  (`get_payment_status_key_by_id`, `get_payment_status_id_by_key`), and the latter is imported by
  `backend/app/routes/stripe.py`. Dropping it would break the legacy Python Stripe path, whose
  teardown is W6-A2's.
* `payments.payment_status_id` and `payments.status_key` — same blocker, same owner. Column safety
  is not inferred from table safety, and here neither is safe yet.
* The other seven candidate columns — `job_id`, `customer_id`, `provider`, `provider_payment_id`,
  `paid_at`, `posted_to_ledger_at`, `deposit_batch_id` — deliberately unanalysed here. The shared
  `payments` table crosses TypeScript, Python, SQL, views, reports, tests and historical schema;
  W6-A2 owns that proof.

`LEGACY PAYMENTS SCHEMA = NONE` is **not** claimed. That is W6-A2's target.

## Debt recorded, not repaired

* `readAllPages` reports a cohort of exactly `scanCap` as truncated, though its comment says a
  cohort of exactly the cap is complete — a full final page leaves `reachedEnd` false. For an
  account's money that errs toward refusing, which is the safe direction, so the shared primitive is
  left alone; its cohort-scan callers would change behaviour if it moved.
* `PRE_REPAIR_2100_COLLECTIBLE_DIVERGENCE_CAUSE_UNRESOLVED` — historical investigation debt. Autopay
  consumes canonical collectible, so current exposure is closed.
* W6-B's deployed held-lifecycle caveat: the position's acts are certified against the certification
  database and deployed schema parity, not on deployed staging, because the only account there with
  money state is Certhouse and `payment_holds` is append-only.
