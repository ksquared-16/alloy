# Automatic Periodic Billing — ready for activation

**Classification: FINANCIALS_PERIODIC_BILLING_READY_FOR_ACTIVATION.** Nothing is promoted and
nothing is activated.

## The bound

N = 2 canonical Billing Periods per assignment. Beyond two, **nothing is billed** — not the newest
two, not the oldest two, not one.

That total refusal is what makes it a bound. Billing two of seven would let the next wake see five,
bill two, see three, bill two: the limit evaporates across four executions and the historical
catch-up it existed to prevent happens anyway. Because an over-bound assignment is left entirely
untouched, the outstanding set never shrinks, so every later wake reaches the same conclusion until
an operator converges the backlog through Generate Tuition. **No episode table, no high-water mark
and no second scheduler were needed** — the absence of mutation is the memory. That is §11 closed
without new state.

Retries are not the unit either. The outstanding set is re-read from canonical truth on every
attempt: a retry after a successful bill finds nothing to do; a retry after a refusal refuses again.

## What activation would actually do, measured per assignment

Scoped previews on deployed staging (`per-assignment-census.json`), which is the grain the bound
uses — six charge rows was never six billing periods:

| Assignment | Cadence | Unconverged periods in span | Begun by 2026-09-21 | Doctrine | Money |
|---|---|---|---|---|---|
| Certa Certhouse | weekly | 5 | **3** | `catch_up_requires_operator` | **$0.00** |
| Certb Certhouse | monthly | 1 | **1** | `normal_period_processed` | **$1,450.00** |

July and August: nothing, `term_not_yet_effective`. **No historical surprise.**

Note what this shows: the bound fires on the very first tenant it meets, rather than being a rule
that never fires. Certa's three begun weekly periods are exactly the "historical catch-up requiring
operator review" the doctrine was set to catch.

**So the first wake after activation writes one charge: Certb, September, $1,450.00.** That is a
real mutation on the Human-QA fixture and it is Kelly's call whether it happens before the
44-scenario walkthrough.

## Activation is two steps, and only the first is promotion

1. Promote the candidate — this ships the handler. **Automatic billing still does not happen.**
2. Provision each organization's schedule via `ensurePeriodicBillingSchedule`.

Until step 2 there is no `scheduled_work` row for billing, so nothing wakes it. That gap was found
by measurement, not assumed: the only production code that created such a row was Autopay, so
periodic billing would otherwise have shipped complete and inert while the product claimed
automation. `ensurePeriodicBillingSchedule` is therefore **called by nothing**, and a lock walks the
source tree to keep it that way — a migration or startup hook would have activated every tenant on
promotion.

## Gates

37 locks (behavioural where behaviour is the claim), 9 plants each reddening its intended gate,
610 tests / 42 suites green, Autopay 56 green and untouched, typecheck, typecheck:tests and the
qualified production build all passed.

Two hazards closed while productizing:

- `scheduled_work.org_id` is nullable and a platform-level row already exists — the clock
  activation probe, seeded with `org_id` null *precisely because* this handler was non-mutating.
  Making the body real would have woken it against a null tenant, so an occurrence with no
  organization now bills nothing and reads nothing.
- the consumers file claimed "two remaining stubs". One remains: **Charge Aging is still
  `not_productized_v1`**, and a lock says so out loud.

## Not done, because activation is not authorized

The mounted generic-scheduler proof (§23–26 of the original): clock wakes → scheduler claims →
handler runs → charge appears once → second execution converges. It needs a real schedule row, and
the repository's own three-consumer runtime suite is `describe.runIf(LIVE)` — 20 tests gated on a
service key. Those are the first things to run after authorization.

## Carried

Autopay ACTIVE and untouched. Charge Aging SHADOW. Human QA ZERO / 44 — not started.
`SHARED_POLICY_EDITOR_CONTROL_CONVERGENCE_FOLLOWUP` and
`FINANCIALS_ADMINISTRATION_BELOW_LEDGER_FOLLOWUP` still open.
