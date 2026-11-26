# Automatic Periodic Billing — activation gate

**Classification: BLOCKED at §15 (backlog bounds). No handler body was written.**

Measured against deployed staging `1ce2e31a5ff10fd2187d2102de9baf959d9c7fbc`.

## Why this stopped here rather than further along

§18 says the SHADOW body may be replaced "only after the preceding contract is settled", and §15
says that if no canonical bound exists on how far automatic Billing may catch up, STOP and return
the decision. No such bound exists — searched `financials-canonical-authorities.md`, the scheduled
work runtime, and the Financials library. The bound is the one part of the contract that changes
the handler's core loop, so writing the loop first would have meant choosing the policy silently.

## What is already settled (no decision needed)

| Concern | Owner, as it already exists |
|---|---|
| clock, due work, claim/lease, retry, attempt, convergence | `lib/scheduledWork/scheduledWorkRuntime.ts` — one conditional UPDATE stamping `claim_token` + 300s lease; `SCHEDULED_WORK_MAX_ATTEMPTS = 4`; delays 60/300/900s |
| only registered code runs | `scheduledWorkRegistry.ts` — a `handler_key` is a name; unresolved is terminal, not executable |
| domain no-op is success | `ScheduledWorkOutcomeKind` — `completed` explicitly includes a domain no-op |
| domain owns its cadence | `computeNextDueAt` returns `null` for `domain_computed`; the handler supplies `nextDueAt` |
| billing economics | `generateTuitionCharges` / `previewTuitionGeneration`, behind action `billing.generate_tuition` |
| financial idempotency | `tuitionOccurrenceKey(assignmentId, periodKey)` — one occurrence per assignment per service period, converged by the database |
| accepted price beats catalog | the generation fact carries `acceptedPricing`; its presence is what makes the catalog lookup unreachable |
| period identity | `assignmentBillingPeriods` tiles from the earliest accepted term's effective start — the family's anchor, not the calendar's |
| unsupported cadence | `isPeriodBillableCadence` refuses `hourly` / `per_session` |
| due date | `lib/financials/policies/resolveDueDate.ts` |
| "scheduler holds no economics" | already locked: `tests/scheduledWork/scheduledWorkRuntime.test.ts` |

The scheduler already has everything a Billing handler needs. Nothing new is required of it.

## The activation dry run (§16), and what it proves

19 months x 3 billable cadences = 57 preview runs through the product's own preview seam, which
shares every decision with the real run and writes nothing. Artifact: `activation-dry-run.json`.

```
would create/recalculate : 6          (monthly 2026-09: 1 - $1,450.00
gross if created         : $2,375.00   weekly  2026-09: 5 - $925.00)
already converged        : 0
refused                  : 0
not due                  : 348
```

Every one of the 18 historical months answers `term_not_yet_effective`. **There is no historical
backlog on this tenant** — activation today would bill the CURRENT period only.

## Why that is not the same as a bound

`term_not_yet_effective` bounds the *pre-agreement* past. It says nothing about the
*post-agreement, unbilled* past. A tenant whose terms became effective twelve months ago and who
activates automation today has twelve months of periods that are covered by an accepted term, have
never been billed, and would all answer `generated`. Nothing in the authority refuses a period for
being merely old.

So this tenant is safe by the shape of its data, not by a rule. The rule does not exist.

## The decision required

**When automatic Billing wakes and finds periods it has never evaluated, how far back may it bill?**

- **A — Last period only.** Bill the period containing the scheduled moment; never catch up. Simple
  and safe; silently drops owed periods after an outage, which §14 forbids.
- **B — Catch up without limit to the accepted term's effective start.** Faithful to what is owed;
  makes activation on an established tenant an uncontrolled billing event.
- **C — Bounded catch-up (recommended).** Catch up at most N canonical periods; beyond N, refuse
  with a domain reason naming the periods left unbilled so an operator converges them through
  Generate Tuition. Honours §14 (no owed period skipped, no "bill now" substitution) and §17
  (no uncontrolled historical event). Needs one number: **N**.
- **D — First activation bills nothing.** Automation records a high-water mark on activation and
  bills only forward. Safest for activation; needs an explicit operator path for what came before.

My recommendation is **C**, with N expressed in canonical periods rather than days so weekly and
monthly tenants get the same guarantee. The value of N is Kelly's to set.

Whichever is chosen, the same catch-up must be driven by canonical period identity — enumerate the
periods between the last successful evaluation and now via `billingPeriodsBetween`, never
substitute "bill now", and rely on `tuitionOccurrenceKey` so re-evaluation converges.

## Not done, and deliberately

No handler body, no locks, no plants, no promotion. Each of those encodes the bound.

## Carried unchanged

Autopay ACTIVE (untouched, no code changed). Periodic Billing SHADOW. Charge Aging also still
non-productized (`evaluated("charge_aging", ctx)`, `mutation: "not_productized_v1"`). Human QA
remains ZERO / 44; the 44-scenario walkthrough has not begun.
