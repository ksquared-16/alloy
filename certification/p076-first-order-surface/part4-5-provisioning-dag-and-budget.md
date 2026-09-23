# P0-7.6 Parts 4–5 — the provisioning DAG, ranked, and the product budget

Run: erun_6b716ffca386c6b7 · Lane: lane_73a897409906

Lineage: deployed `680e5765` (PR #1193). Specimen PINNED: member
`bd5b59ae-bd04-4284-8d2a-5395960e11ab`, customer `e1c9afe0-…`, six configured cards.
21 cold samples, one request per fresh page. **Attendance outcome `full` in 21 of 21.**

## Specimen drift was real and was caught

The previously pinned member `a227e460` now has **no active enrolment**, so attendance
fail-closes at 111 ms with one mark and the frame "improves" to 878 ms by doing less. An
unpinned run focuses a 4-card household with no attendance card at all (960 ms). Both are the
documented trap. Five candidates were probed; all five give `full`. The one above was pinned.

## Part 4 — ranked by CRITICAL-PATH CONTRIBUTION, not by duration

| span | start P50 | end P50 | end P95 | slack P50 | binds | frame if removed |
|---|---|---|---|---|---|---|
| **attendance_fold** | 0 | **898** | 1087 | **0** | **21/21** | 758 |
| work_view_totals | 121 | 758 | 889 | 126 | 0/21 | 898 |
| children_projection | 115 | 340 | 384 | 566 | 0/21 | 898 |
| account_ledger | 0 | 333 | 390 | 552 | 0/21 | 898 |
| prepaid_position | 0 | 324 | 368 | 579 | 0/21 | 898 |
| header_kpis | 1 | 246 | 384 | 635 | 0/21 | 898 |
| personal_seen | 115 | 232 | 251 | 672 | 0/21 | 898 |
| crm_projection | 115 | 224 | 302 | 667 | 0/21 | 898 |
| process_config | 0 | 121 | 154 | 785 | 0/21 | 898 |
| health_supplements | 0 | 120 | 131 | 769 | 0/21 | 898 |
| health_profile | 0 | 119 | 149 | 773 | 0/21 | 898 |
| population | 0 | 115 | 134 | 778 | 0/21 | 898 |

- **BINDING OWNER: `attendance_fold`** — binds in 21 of 21 samples, zero slack.
- **RUNNER-UP: `work_view_totals`** at 758 ms.
- **MAX RECOVERABLE by repairing attendance alone = 140 ms.** Past that the runner-up promotes.
  This is the max()-shaped DAG: a 300 ms attendance saving still yields only 140 ms of frame.

Aggregates: `outerWallMs` P50 900 / P95 1089 · `readDagMs` P50 898 · `assemblyMs` 2 · 28 queries.

## Part 5 — the budget, from measured terms only

Measured in-browser on the deployed origin, same page, same connection
(`PerformanceResourceTiming`, 5 runs):

| term | measurement | method |
|---|---|---|
| wire + edge + a route that composes nothing | **~190 ms** steady state (`/api/build-info`; first call 228–422 ms cold, then 185–196 ms) | Resource Timing |
| response transfer (`responseEnd − responseStart`) | **0–1 ms**, body ~304–309 bytes encoded | Resource Timing |
| DNS / connect / TLS | **0 ms** (connection reused) | Resource Timing |
| A′ composition (`outerWallMs`) | **P50 900 ms** | server span |
| client apply | ~121 ms | prior run's measurement, not re-measured here |

So, honestly:

```
MAX_SERVER_BUDGET_FOR_LT_1S = 1000 − 190 (wire) − 121 (client apply) ≈ 690 ms
```

Current A′ composition is **900 ms**, so provisioning must lose **≥ 210 ms**.
Attendance can contribute at most **140 ms** before `work_view_totals` binds at 758 ms.
**Attendance alone cannot reach the budget; it lands at 758 ms, still 68 ms over.**

## A term I have NOT explained, stated as such

The sampler's `clientWallMs` (browser wall around `await fetch`, resolving at response headers)
is **P50 2876 / P95 3217 ms**, against an `outerWallMs` of 900 ms and a measured wire of ~190 ms.
That leaves roughly **1.8 s unaccounted**.

What the evidence does say:

- It is **not transfer**: `downloadMs` is 0–1 ms for a ~300-byte body.
- It is **not the wire**: a trivial authenticated route on the same connection returns in ~190 ms.
- The same endpoint returning a **304-byte diagnostic with no shadow composition** still costs
  **837–1167 ms TTFB**, so several hundred ms is per-request overhead outside the composition span.

What it does **not** yet establish: the prototype endpoint also performs parity, prepaid and dag
diagnostics that the product path does not. **`clientWallMs` on this endpoint is therefore NOT
`FIRST_ORDER_VISIBLE_COMPLETE`**, and it must not be reported as the product metric. The product
figure still stands at the prior run's page measurement (~3,367 ms), which this run did not
re-take.

**This unexplained ~1.8 s, not the provisioning DAG, is the decisive open term for the <1 s
target.** Closing the entire A′ composition to zero would still not reach 1,000 ms if it is real
on the product path.
