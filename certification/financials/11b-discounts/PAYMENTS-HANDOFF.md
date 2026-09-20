# Financials → Payments — the 11B handoff

Written at the close of Financials 11B, for the Payments master thread. Everything below is what
Payments inherits, what it must not rebuild, and the one dependency neither program can satisfy
alone.

## Identity

| | |
|---|---|
| Final Financials candidate | `0a565cf79` (`agent/financials-11a-regression-repair`) |
| Reconciled against staging | `d1b8f1319` — Payments V1 W1–W4 |
| Merge SHA | `6c1b84fdc814a1cc1e62797a690c9ef6ceb4f1d5` (PR 1111) |
| Deployed SHA | `__DEPLOYED_SHA__` |
| QA catalog version | `2026-09-20.3` — 44 `HUMAN_WALKTHROUGH` scenarios |
| Human QA PASS | **ZERO.** Engineering certification only. |

## What Payments inherits — and must not reimplement

Account · ledger · balance · payer truth · responsibility · allocation · Prepaid · GL · charge
writing · reductions · Billing and commercial truth where consumed.

**Payments EXTENDS Core.** A Payments module that grows its own account, ledger, balance, payer
model, responsibility model, allocation model, prepaid model, GL mapping, charge writer or
reduction engine has rebuilt Core badly and in parallel. The full contract is
`docs/platform/modules/core-payments-contract.md`; the authorities are
`docs/platform/modules/financials-canonical-authorities.md`.

Two invariants that must not break:

1. **Payment settlement must not rewrite responsibility.** Settling an obligation with somebody
   else's money moves no part of who owes it.
2. **Available prepaid must not be netted into Current Balance.** A balance that already includes
   it tells an operator a family owes less than they do.

## The doctrine Payments will be measured against

**PREPAID IS NOT A DEPOSIT.** Prepaid is unapplied money on the account: received, canonically
available, applicable to any obligation. A deposit is money taken for a PURPOSE and held against
it — a reason, a release condition, a refund path — and it is not available to settle whatever
comes next. `DEPOSIT_OPERATOR_PRODUCTIZATION_GAP` is carried to Payments explicitly: Core has the
deposit policy type and the model foundation; Payments owns receive, hold, apply/release, refund
and the provider implications. W4's `payment_holds` is the first piece.

**RESPONSIBILITY** has two canonical grains — household (`customer_member_id` null) and child —
resolved by one shared specificity rule. Configuring it moves no money.

**DISCOUNT** is a second consequence, never a rewrite: gross stays the accepted price, the
reduction is written beside it with its own policy, basis and provenance, and net falls out.
Eligibility is an intersection of the policy's `applies_to` and the category's discountability, and
is proven from canonical facts, never asserted by a caller. A configured policy may be EXCEPTED for
one commercial relationship — dated, reasoned, superseding rather than editing — and an excluded
policy reports `excluded_by_exception`, never `no_policy_configured`.

**ACCOUNTING PERIOD vs BILLING PERIOD.** A billing period is DERIVED from the charge's own dates;
there is no billing-period table and no billing-period setting. An accounting period is attributed
at write by the database, and a CLOSED period DEFERS to the earliest later open period rather than
refusing — a reporting boundary must never stop a family being charged. Neither word may be used
for the other.

**TUITION IS PART OF AN ASSIGNMENT.** `billing_preview` is retired from normal Focus Panel
composition. Assignment owns Accept, Override, the options, the accepted-term read-back, Billing
Frequency, the periods, responsibility and the discount forecast with its exceptions. The card and
every authority beneath it remain; only the placement changed.

## `BILLING_SCHEDULER_PLATFORM_PREREQUISITE`

Autopay needs to happen when nobody is present. So do periodic billing and charge aging. **These
are the same platform need.** The prerequisite is **GOVERNED SCHEDULED WORK V1**:

```
CLOCK → DUE WORK → CLAIM / LEASE → REGISTERED DOMAIN HANDLER → EXECUTE
      → RECORD OUTCOME → RETRY / RECOVER → CONVERGE
```

| Owner | Owns |
|---|---|
| **Scheduled Work** | the clock; the wakeup; claim/lease; dispatch; execution mechanics; retry and recovery; outcome recording |
| **Financials** | what Billing work is due; Billing Period semantics; recurring generation; charge aging; late-fee economics; financial idempotency |
| **Payments** | Autopay authorization; payer and method; collectible resolution; collection; payment recognition |

Three intended consumers: **periodic billing**, **charge aging / late fees**, **autopay**. The
scheduler knows none of their economics.

### DO NOT BUILD A PAYMENTS-SPECIFIC OR BILLING-SPECIFIC SCHEDULER.

No autopay cron, no billing cron, no late-fee cron, in either domain. Two clocks, two lease models
and two retry stories is the outcome, and the second is always written under deadline.
**CONVERGE ON GOVERNED SCHEDULED WORK V1.**

Status of Governed Scheduled Work V1 as known to this thread: **not built, and not started here.**
Financials did not begin it, and 11B deliberately shipped operator-triggered generation instead.

## What is certified, and what "certified" means

The recurring billing ENGINE is implemented and certified. AUTOMATIC PERIODIC BILLING EXECUTION is
not, and depends on the above. No copy in either program may imply recurring tuition fires on a
schedule today.

Human acceptance is separate from engineering certification and has not happened. The catalog
stands at PASS ZERO by design: Kelly's acceptance is of the integrated Financials V1 product, which
includes Payments.
