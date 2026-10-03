# S3/S4 terminal real-clock certification — armed, awaiting the natural boundary

**Status: `IMPLEMENTED_AWAITING_REAL_CLOCK_CERTIFICATION` — unchanged, but the horizon moved from
41 days to ~25 hours, and every precondition is now verified rather than assumed.**

The proof is set up and cannot be collected inside this turn: the period's commercial boundary has
not arrived. Nothing was faked, no occurrence was manufactured, and nothing was closed by hand.

## What is armed

| | |
|---|---|
| deployed SHA | `f981b23ba9a7221ddb9999a6e88c4412624b6e22` (= origin/staging) |
| synthetic fixture | customer `fd000000-0000-4000-8000-0000000c0003` — structured fixture id, **0 charges, 0 payments, 0 reductions**, 1 active agreement, 1 location |
| daily calendar | policy `d322a255-7941-48d0-b262-68068b660be5`, `cadence: daily`, `anchor_on: 2026-01-05`, scope **customer**, already configured through canonical S1 authority in an earlier slice |
| **certification period** | **`59f50689-030f-4c91-a38e-57a3a62b6279`** — key `2026-10-03~2026-10-03`, starts/ends `2026-10-03`, **open** |
| next period | `d93a6a6f-2ea3-45ed-b878-b5549c518772` — key `2026-10-04~2026-10-04`, **open** |
| close schedule | `2edf2559-d500-4edc-a96c-501c383315de`, org `93667019…`, **daily, active**, next due **`2026-10-04T04:00:00Z`** |
| clock health | last wake 101s before census, **3,251 wakes**, worker `worker-2e38e88d` |
| eligibility | `elapsed_now: false`; **becomes eligible `2026-10-04`**, read from the database's own `current_date`, not computed here |

## The fixture needed no creation, and that is the point

§2 and §3 were already satisfied. A dedicated synthetic household with an explicit **daily** customer
calendar already existed on deployed, carrying zero economics. So this certification created no
customer, no calendar and no migration — the only write was the one §4 requires.

## The one write, through the one canonical door

`POST /api/admin/financials/billing-periods` — the S1 materialization authority, which by its own
contract "writes no charge, no reduction, no payment and no journal entry, it closes nothing, and it
corrects nothing". It returned:

```
2026-10-03~2026-10-03  open  created: true
2026-10-04~2026-10-04  open  created: true
```

Both bounds came from the daily calendar. **No backdating** (`on_date` was left to deployed's own
today, which the route reported as `2026-10-03`), no direct write to `financial_billing_periods`, no
clock or server time change, no shortened period, no change to the close service, and no
certification-only close path.

## The precondition that would have wasted a day

The handler discovers work with `findClosableBillingPeriods(orgId, …)` scoped to the occurrence's
**own org**. A period in a different org from the registered close schedule would never be found —
the handler would run, correctly report nothing, and the proof would fail for a scoping mismatch
that *looks* like a defect. So it was checked before waiting on it:

- certification period org: `93667019-bd28-49b5-a688-acc9bb1e0a19`
- close schedule org: `93667019-bd28-49b5-a688-acc9bb1e0a19` — **same**, and `close_schedule_for_this_org` returns it

## A clean experiment, with no confounders

`q3` asked what the handler would find **today**, grouped by org, and returned **nothing**: no period
anywhere on deployed is currently open-and-elapsed. So when the `2026-10-04T04:00:00Z` wake fires,
the only work it can discover is this certification period. A close transition at that wake is
therefore unambiguously attributable.

## §13 — the period is EMPTY, stated explicitly

`charges_in_period: 0`, `reductions_in_period: 0`, `is_empty: true` for both periods. No money was
manufactured to make the fixture look realistic. S1 already certifies an empty period as a valid
commercial period, and automatic close must work either way — so this is not a weaker proof, it is
the cleaner one. The thing under test is finalization, not generation.

## What remains, and exactly when

At or after **`2026-10-04T04:00:00Z`**, collect from durable evidence:

1. the occurrence created for `2edf2559…` at that due time;
2. worker claim, lease, and the attempt row;
3. the handler outcome and its diagnostic (expect `closed_count: 1` naming period `59f50689…`);
4. `59f50689…` transitioned `open → closed`, with `closed_at` populated, `close_actor = system`,
   `closed_by = NULL`;
5. the bounds unchanged — `starts_on`/`ends_on` still `2026-10-03`, snapshot still
   `{cadence: daily, anchor_on: 2026-01-05}` — proving the close used the materialized period rather
   than a reinterpreted boundary;
6. `d93a6a6f…` still open, no overlap, no gap;
7. a subsequent wake leaving `closed_at` / `close_actor` / `closed_by` untouched and creating no
   second transition.

If the period becomes eligible, the clock stays healthy, and **no close occurrence appears**, the
terminal proof FAILS per §14/§15 and the failed link is named. That judgement cannot be made yet
because the boundary has not arrived — declaring either outcome now would be fabricating it.
