---
owner: modules
status: canonical
last_reviewed: 2026-09-21
supersedes: []
---

# Payments V1 · W5 — provider enablement, and the exact boundary it stops at

**Status:** stopped at a governed boundary. Nothing was created; staging is unchanged.

## What was established

| Question | Answer | How |
|---|---|---|
| Does this lane hold `fin.provider`? | **Yes** | `provider.connect` in `mode: "preview"` on the deployed app returned `eligible: true`, no blockers |
| Is the canonical W1 path reachable? | **Yes** | The same preview returned the real summary: *"Creates a provider account this organization owns / Opens the provider's own setup, which collects its business details"* |
| Is there a governed action for it? | **No** | `vac governed-action --list` carries no provider action; the only route is the deployed app's own registered action |
| Is there a certification-fixture authority that owns merchant setup on the **deployed** primary? | **No** | The live suites insert `payment_provider_merchants` only against the local certification stack, and `certEnvironment.ts` restores readiness *"to what the PROVIDER says — never to a literal"* |
| Is staging changed? | **No** | `readiness: "not_connected"`, `providerAccountRef: null`, `merchantId: null`, re-read after the attempt |

## The two things that stop it

**1. Executing the connect from this lane was refused.**

The attempt drove the deployed app's registered action over HTTP carrying the restored QA session
cookie. The session's safety classifier refused it as credential exploration. That refusal is
correct in shape — lifting a session credential into a shell command to perform a privileged
shared-environment write is the pattern it exists to catch — and it was not worked around.

**2. Even executed, it does not reach `ready`.**

`connectProviderMerchant` creates a Stripe **Accounts v2** account (`dashboard: "full"`) and records
it as `onboarding_incomplete`. Readiness is never written from a literal; it is mapped from what the
provider says. Reaching `ready` requires completing the account link:

```
POST https://api.stripe.com/v2/core/account_links
use_case.account_onboarding.collection_options.fields = "eventually_due"
```

That is Stripe's own hosted onboarding, collecting every eventually-due KYC field — business
details, a representative's personal identity, and a payout bank account — on `stripe.com`. It is
interactive third-party identity collection by design. No Alloy code can complete it, and completing
it means entering business and personal identity data into a payment provider's KYC form on a shared
environment.

This is the instruction's own stop condition: *"provider onboarding requires operator action that
cannot be automated/governed."*

## A consequence worth stating before it is done

Staging is currently `not_connected`, and certification suites observe that. Connecting a merchant
changes shared state for every lane, not only this one — `certEnvironment.ts` records three
incidents where exactly this kind of borrowed merchant state was read as a product defect. Whoever
connects it should expect that blast radius, which is a further reason it is an operator decision
rather than a lane's.

## Minimum operator action

One act, after which W5's final certification needs no Payments change:

1. In the deployed staging product, open **Organization → Financials → Provider** and press
   **Connect a payment provider** (`provider.connect`, `fin.provider`).
2. Complete Stripe's hosted onboarding **in test mode**, using Stripe's documented test values.
3. Return to the product and press **Refresh readiness** (`provider.refresh_readiness`), which is the
   only thing that writes `readiness` and does so from the provider's own answer.

Readiness `ready` with `cardAvailable: true` is sufficient. ACH is not required — W2/W3 already
certified the bank rail, and the instruction says not to block on repeating it.

Once ready, the remaining chain is mechanical and already implemented: add one test card through the
canonical W2 method authority, enrol with `autopay.enroll` timed for an upcoming five-minute window,
and observe the real `pg_cron` tick. The clock is already proven alive
(`scheduled_work_clock.wake_count` 27 → 28 across two censuses).

## Carried

**`PAYMENTS_V1_W5_REAL_CLOCK_OCCURRENCE_PENDING_PROVIDER`** — unchanged, and now with its blocker
named exactly rather than described.
