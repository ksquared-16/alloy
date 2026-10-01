---
owner: payments
status: canonical
last_reviewed: 2026-09-30
supersedes_note: rewritten for W6-A2
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

**SURVIVING CURRENT FIELDS on `payments`** — kept on evidence of CURRENT authority, not called
legacy because their origin predates canonical Payments:

| Column | Why it is current |
| --- | --- |
| `job_id` | read by `accessScope` (workspace layout, its providers, the customers route) and by `jobPaymentBalances`, which canonical `childcarePaymentService` and `financialJournalService` both import. Canonical childcare payments write it NULL deliberately — a childcare payment is not a job payment |
| `customer_id` | WRITTEN by canonical `recordChildcarePayment` so job-era readers of "whose payment is this" keep working; read by the related-records API |
| `paid_at` | named by the childcare immutability trigger, SELECTed by `/api/admin/related/[entity]/[id]`, and an editable entity-drawer field |
| `status_key` | named by the same trigger; job rows still edit it through their PATCH route by design. NOT the platform `status_key` vocabulary on assignments, opportunities, tour_bookings and case statuses, which is untouched |
| `provider_payment_id` | read by `/api/admin/entity` and `/api/admin/related` as the legacy provider reference |
| `posted_to_ledger_at` | a rendered entity-drawer field |

**DELETED LEGACY AUTHORITY (W6-A2):** `payment_statuses`, `payments.payment_status_id`,
`payments.deposit_batch_id`, `payments.provider` (superseded by `processor`, which the migration
that introduced it backfilled from this column), the Python payment executor and its 41-function
closure, `service_auth`, the four `fin.post` handlers, `JobManualChargeForm`, `jobPaymentSummary`,
`JobDrawerV2`, and the `fin.post` permission with its grants.

`LEGACY PAYMENTS SCHEMA = NONE` is **still not claimed**, and that is the correct end state rather
than a shortfall: six columns survive because something reads or writes them today. W6-A2 succeeded
by deleting the second payment system and its dead authority, not by deleting every old-looking
column.

## Canonical writer proof

One write architecture. No route writes money; every money write is a registered action.

| Act | Path |
| --- | --- |
| Manual receipt | `payment.record` → `recordChildcarePayment` |
| Provider collection | `payment.collect_card` → `payment_collection_attempts` → provider adapter → canonical posting |
| Application | `payment.apply_to_charge` → `applyPaymentToCharge` |
| Application reversal | `payment.reverse_application` |
| Refund | `payment.refund` → `requestProviderRefund` / `refundChildcarePayment` |
| Provider return | provider dispute recognition (`payments.reversal_origin = 'provider'`) |
| Autopay | the ordinary collection engine, via Scheduled Work |
| Held application | `payment.apply_to_charge` with the hold named → `apply_held_funds_atomic` |

There is **no Python payment writer**, **no job-era direct Payment writer**, **no direct Payment
status mutation route** and **no second provider execution engine**.

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
