# Baseline — deployed `258aa858c`, before the instrumented build

Mounted sample, ordinary Workspace → Financials → Accounts navigation. Cold n=5 in their own
browser contexts; warm n=8 on one primed page. 116 ledger rows every opening.

## The two numbers, and why only one of them is a real answer

| | COLD n=5 | WARM n=8 |
|---|---|---|
| click → interactive list | **1,432 ms** | **101 ms** |
| target | <1,000 ms | <500 ms (preferred <300) |
| verdict | **NOT MET** | met — *but see below* |

**All 8 warm openings became interactive BEFORE their data arrived.** Both routes were still
issued and still cost the server ~1,270 ms of wall time; the list simply rendered the cohort
already in memory and refetched behind it. So the warm figure measures the client cache, not the
cohorts, and reporting 101 ms as the target met would be reporting the cache.

The honest reading: **the operator's first arrival at Accounts costs 1,432 ms**, and every warm
re-entry is free because the answer is already held.

## Where the cold 1,432 ms actually goes

| segment | P50 | owned by |
|---|---|---|
| click → first request starts | 136 ms | client — tab mount + effects |
| data wait (max of both branches, never the sum) | 1,253 ms | server + network |
| last response → interactive | 46 ms | client — join + render |

And inside the data wait, the split that matters:

| route | starts | wire | **server (`serialize` offset)** | **not server** |
|---|---|---|---|---|
| subjects | +139 ms | 1,250 ms | **717 ms** | **~533 ms** |
| position | +136 ms | 1,159 ms | **633 ms** | **~526 ms** |

**~530 ms of every cold request is not server time**, and it is the same ~530 ms on a 4.2 KB
response as on a 52.9 KB one. That rules out transfer size: it is connection establishment and
round-trip latency on a cold browser context, and it is not Financials-owned.

## What this bounds

Even if both cohorts became instantaneous, cold click → interactive could not fall below roughly
`136 + 530 + 46 ≈ 712 ms`. The <1,000 ms cold target is reachable, but only ~720 ms of the
current 1,432 ms is Financials-owned server time, and the whole of it is the budget.

## Subjects, coarse decomposition (this build's vocabulary)

| phase | offset P50 | delta P50 |
|---|---|---|
| auth | 3.3 | 3.3 |
| perm | 3.4 | **0.2** — the shared auth repair holds |
| households | 140.2 | 128.4 |
| agreement_sites | 370.7 | 229.9 |
| facets | 716.3 | **331.4** ← largest single term |
| assemble | 716.5 | 0.0 |

Position reports one `cohort` label at 633 ms. Both are what the promoted build replaces with a
real interior.

## Method notes

The first pass of this sample reported wire times near `-1.79e12`. Playwright's
`ResourceTiming.startTime` is a wall-clock epoch value and every other field, `responseEnd`
included, is already relative to it; subtracting the two is meaningless. The Server-Timing phase
offsets were unaffected, being independent of Playwright's clock. Fixed, and the sample re-run —
the corrected numbers are the ones above.
