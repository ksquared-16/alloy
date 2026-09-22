---
owner: modules
status: canonical
last_reviewed: 2026-09-21
supersedes: []
---

# Payments V1 · W5 — the real-clock Autopay proof, and what blocks it

**Status:** the deployed clock is proven alive and reaching the platform. An Autopay *occurrence*
through it cannot be produced, for a reason outside Payments.

## What is proven on the deployed environment

Measured on `alloy_deployed_primary` and on `https://staging.workwithalloy.com` at build
`5f0c0ba00`, after PR #1170 merged and `20261004120000` was applied.

| Claim | Evidence |
|---|---|
| The W5 schema landed with its guarantees | `payment_autopay_arrangements` present; RLS **enabled and forced**; both invariant triggers; `uq_autopay_one_live_per_account`; both policies |
| The migration is in the hosted ledger | `ledger_has_w5: 1` |
| W1–W4 are intact | `payments`, `payment_methods`, `payment_collection_attempts`, `payment_holds` all present |
| **The real pg_cron clock is running** | `scheduled_work_clock.wake_count` **27 → 28** across two censuses five minutes apart, last wake 208–229s before each reading |
| The W5 read route is live | `GET /api/admin/financials/autopay` → `200 {"arrangement":null,"amountDueCents":null,"nextDueDate":null}` |
| The W5 action is live and enforcing | `POST /api/admin/actions/execute` `autopay.enroll` → `404 ACTION_BLOCKED` / `method_not_found`, the operator-safe message this workstream wrote, with a correlation id |

The last row matters more than it looks: the request passed the `fin.write` gate, reached
`validateMethodForPayer` in the deployed build, and refused truthfully. The action is not merely
registered — it executes.

## What cannot be produced, and why

An Autopay occurrence requires a `scheduled_work` row with `handler_key = payments.autopay.evaluate`.
The only thing that creates one is `enrollAutopay`, which requires a usable payment method, which
requires a connected payment provider.

The deployed staging environment has none:

```
GET /api/admin/financials/provider
{"connected":false,"processor":null,"readiness":"not_connected",
 "cardAvailable":false,"bankAvailable":false,"providerAccountRef":null,"merchantId":null}
```

And there are **zero stored payment methods across all 11 staging accounts**.

So the chain stops before Payments: no merchant → no payment method → no authorization → no schedule
→ no occurrence. This is upstream of the W2 R1 browser walkthrough being impractical; the
prerequisite that walkthrough would exercise does not exist in the environment.

Connecting a provider is a `fin.provider` configuration act on a shared deployed environment. It is
not W5's to perform, and doing it unilaterally to satisfy a certification would be mutating an
unrelated shared resource.

Had an arrangement existed, the handler would itself have refused with `merchant_not_ready` and left
the arrangement live — which is the behaviour its own suite certifies.

## What stands in its place

The same chain is certified against a **real Postgres** in
`web/tests/financials/live/autopayScheduledWork.live.test.ts`:

- enrolling registers a real `scheduled_work` row the runtime finds
- a real `runScheduledWorkWake` claims the occurrence and dispatches to `payments.autopay.evaluate`
- a second wake on the same day cannot collect twice
- revoking deactivates the schedule and nulls its next due moment

and in `web/tests/scheduledWork/scheduledWorkRuntime.test.ts`, where one wake serves all three
registered consumers and an Autopay occurrence with no tenant fails terminally rather than guessing
one.

That is the generic runtime, the real claim/lease and the real registered-handler boundary —
everything except the deployed `pg_cron` being the thing that calls it, and the clock's own
liveness is separately measured above.

## Carried

**`PAYMENTS_V1_W5_REAL_CLOCK_OCCURRENCE_PENDING_PROVIDER`** — one deployed Autopay occurrence
initiated by a real `pg_cron` tick, blocked on a payment provider being connected to the staging
environment. It becomes measurable the moment one is, and needs no Payments change.

Carried with it, unchanged: **W2 R1**, the hosted payment-method browser walkthrough.
