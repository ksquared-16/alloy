# Human-QA starting state — automatic Periodic Billing ACTIVE and certified

**Human QA PASS: ZERO / 44.** Nothing below is a QA result.

## Deployment

| | |
|---|---|
| Deployed SHA | `20c3dd7e2ee5c293df210011825734f36e45ff59` |
| Branch / env | `staging` / `production` · `ikaxilmwmrmbagoidedu` |
| Firefly Periodic Billing schedule | `5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a`, daily, active |
| Last evaluation | 2026-09-22 03:15:01Z — `no_work_due: 7`, nothing billed |
| Next due | 2026-09-23 03:14:06Z |
| Automatic catch-up limit | 2 canonical Billing Periods per assignment |

## What the real clock proved

Four consecutive genuine wakes, each claimed by a different worker under the ordinary lease. The
handler was never invoked directly; `evaluate now` only moved `next_due_at`.

| Wake | Outcome |
|---|---|
| 03:00:02 `worker-a8d926b0` | D billed 1, E billed 2, C refused, A/B/Certhouse no work |
| 03:10:01 `worker-2d0071db` | C refused again — `periods_billed: []`, **no drain** |
| 03:15:01 `worker-83ae9ac9` | after operator convergence: `no_work_due: 7`, refusal cleared |

Charges, per certification assignment: **A 2, B 3, C 4, D 1, E 2.** D received exactly one charge
for exactly its one outstanding period; E exactly two.

## Certhouse — untouched throughout

Certa 5 tuition charges, Certb 2, latest `created_at` **2026-09-20 20:55:08Z** — before any of this
run's work. Accepted terms, responsibility, discount and payment state all unchanged.

## Three consumers, one runtime

| Consumer | State |
|---|---|
| Periodic Billing | **ACTIVE**, live clock dispatch certified |
| Autopay | **PRODUCTIZED CAPABILITY / 0 staging schedule instances** — handler registered and untouched; contract suite green. Zero instances is an absence of arrangements, not inactive code |
| Charge Aging | **SHADOW** — `not_productized_v1` |

One clock (pg_cron, 5-minute), one due-work model, one claim/lease, one dispatch, one outcome
model, one retry contract. The scheduler holds no domain economics.

## Certification residue — excluded from Human QA

All in the **PBCert Automation** household (`e1c9afe0…`), opportunity `7aa18e83…`. None is Certhouse.

| Specimen | Assignment | Agreement | Shape |
|---|---|---|---|
| A Pbchild | `ef10654a…` | `771c085f…` | billed by the pre-repair wake |
| B Pbtwo | `40971cd2…` | `e5a7471e…` | billed by the pre-repair wake |
| C Pbthree | `e978987c…` | `570ef2e5…` | over-bound, then operator-converged |
| D Pbfour | `329ca704…` | `a09f8a86…` | one-period automatic bill |
| E Pbfive | `afde2aa1…` | `a09eceb9…` | two-period automatic catch-up |

Also inert residue: **Pathb Certopp** (`e9965c7c…`) — no accepted term, never used as proof.

## The defect this run's live wake caught

The first real wake billed one week PAST each specimen's outstanding set: a one-period specimen got
charges for 2026-09-22 *and* 2026-09-29. The handler asked generation for the month SPAN containing
each due period, and a span contains periods that have not begun — so the bound was computed on one
set and applied to a larger one. `generateTuitionCharges` now accepts a `periodKeys` filter and the
handler names the exact due periods; an operator asking to bill September still gets September.

Neither existing lock could have caught it: one asserted which spans were requested (correct), the
other was satisfied by a recording fake. It took a real clock billing a real future week.

## Carried

`SPECIMEN_PRICEABLE_ASSIGNMENT_PATH_GAP` — no `schedule.change` action is registered, so an
existing operational schedule cannot be superseded. Not a Financials defect; unfixed here.

Accepted tuition, discount policy (`Sibling discount (QA specimen)`, 10%), responsibility,
available prepaid $125.00 and the accounting calendar are unchanged from the prior artifact.

## Not demonstrated live

**Retry / recovery.** The generic runtime's retry contract (4 attempts, 60/300/900s backoff,
claim-token guarded finalize) is code-locked and shared with Autopay, and every attempt recorded
here shows `lease: "applied"` at `attempt_number: 1`. No safe failure injection exists on deployed
staging, so no live multi-attempt sequence was produced. Stated as a limitation rather than
claimed.
