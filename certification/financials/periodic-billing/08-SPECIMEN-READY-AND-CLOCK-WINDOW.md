# Fresh specimen is priceable — and the next real wake is tomorrow

## What is now true

A **fresh, unmistakably-named certification child** exists in Firefly and is canonically priceable.

| | |
|---|---|
| Household | PBCert Automation · customer `e1c9afe0-5e8d-4077-904d-bb8e748a4fd4` |
| Opportunity | `7aa18e83-eea7-432c-af4b-684a1cef9386` |
| Child | Pbchild Automation · customer_member `bd5b59ae-bd04-4284-8d2a-5395960e11ab` |
| Assignment (OCM) | `ef10654a-e4cf-494d-b38e-82900af1163e` |
| Enrollment agreement | `771c085f-d145-4650-adee-4653db661975` |
| Accepted term | `ef1e0159-63b8-4879-8fb4-9e61aba0a283` — **$195.00 weekly**, effective **2026-09-22** |
| Rate source | `commercial_tuition_rates` `424c7a8a-5bd5-4c63-93f6-5591dc0afcd8` (site scope, School Age / Before & After) |
| Tuition charges | **0** |

Exactly **one** begun canonical Billing Period (2026-09-22 → 09-28), unconverged. Within N=2.
Every record was made through a governed product route. No SQL, no manual financial row.

## The fact list, traced rather than inferred (§3)

`assignmentPricingFacts` reads each fact in authority order:

| Fact | Authority | Fallback |
|---|---|---|
| `programKey` | committed `child_placements.program_category_id` | the OCM row |
| `attendanceType` | **`opportunity_customer_members.schedule_type`** | **none** |
| `daysPerWeek` | committed `schedule_assignments` pattern | requested, else absent — **not required** |
| `locationId` | committed placement site | the OCM row |
| `asOf` | caller | OCM `start_date`, else today |

That single row of the table is why the first specimen failed: attendance has **no fallback**, and
nothing I built had set it. The fix was not more scheduling — it was `PATCH
/api/admin/opportunity-customer-members/{id}`, the governed route that owns those columns.

Two further corrections came out of building it, both mine rather than the product's:

- I skipped `custom` because it is absent from the `childcare_schedule_type` option set. Certa
  carries exactly that value, so the option set is a UI vocabulary, not the column's constraint —
  and `custom` is the only School Age attendance the organisation has authored a rate for.
  `full_time` answered `no_rate_for_scope` and `part_time` `not_offered_at_scope`; both are the
  resolver being precise, not broken.
- The accept refused `stale_resolution` three times on a stable key. Sending `cadence_key` made the
  server re-resolve with facts the view had not used. The chosen rate already carries its cadence;
  naming it again was re-deciding a fact the option owns. Dropped, and it accepted.

## Why the live proofs are not in this run

The Firefly schedule is **daily**. It was activated at `2026-09-22T01:13:18Z`, so:

```
next_due_at  2026-09-23 01:13:18Z
now          2026-09-22 01:30:46Z
```

The next genuine clock dispatch is **~23.7 hours away**, and §1 forbids invoking the handler
directly — correctly, since that would certify nothing about the scheduler. `ensurePeriodicBillingSchedule`
deliberately preserves an existing `next_due_at`, so re-running activation does not pull it forward.

So §§10–19 — the automatic charge, second-evaluation convergence, manual-after/before, retry, N=2,
the over-bound refusal, no-rolling-drain and operator convergence — cannot be demonstrated inside
this run's window. Everything they need is staged and waiting.

### Recommendation

Add a bounded **"evaluate now"** to the existing schedule: set `next_due_at = now()` on the
organization's Periodic Billing row through the same `fin.write` authority. The real generic clock
then claims and dispatches it within five minutes.

**Making work due is not invoking the handler.** The claim, the lease, the dispatch, the attempt
and the outcome all still belong to the generic runtime, so the chain being certified stays the
real one. It is also genuinely useful outside certification: an operator who has just fixed
configuration should not wait a day for automation to retry.

The alternative is to wait for the natural wake and certify §§10–19 against it tomorrow.

## §21 — failed specimen disposition

**Pathb Certopp** (`e9965c7c-608e-4f68-a15b-2475374e2ecf`) remains as documented certification
residue: agreement `9134bf85…`, schedule assignment `e67c62b7…`, placement `a24a882e…`.

It is **inert**: it has no accepted tuition term, so it holds no billable assignment, produces no
canonical Billing Period, and did not appear in the first wake's evaluation. It was not used as
proof of anything. It was not hand-edited into validity, and no cleanup was attempted, because the
only path to change it is the missing one.

## §22 — `SPECIMEN_PRICEABLE_ASSIGNMENT_PATH_GAP`

An existing operational schedule cannot be superseded through a registered `schedule.change`
action, because no such action exists — `schedule.create` is the only `schedule.*` action in the
registry, and it refuses with *"use a change command to supersede"*. This is a Scheduling gap, not
a Financials automation defect, and it was not fixed here. The fresh specimen sidesteps it entirely
by never creating an operational schedule.
