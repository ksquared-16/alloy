# P0-7.6 Gate A — the last legitimate first-order correction is closed

Run: erun_e03540b4bdb6707c · Lane: lane_73a897409906
Deployed `1072986ab` (containment proven over `49b7f1154`). **26 of 26 samples kept, zero drift.**

## Gate A

| gate | before (`65337e45b`, n=24) | after (`1072986ab`, n=26) | verdict |
|---|---|---|---|
| A.1 LEGITIMATE_AUTHORITATIVE_CORRECTION | 1 (activity count) | **0** | **PASS** |
| A.2 POST_COMPLETE authoritative | 8 | **0** (P50) | **PASS at P50**, P95 8 |
| A.3 finality waits for the drawer | 17 of 24 | 8 of 26 | improved, not eliminated |

At drawer arrival, WU-09 now shows **16 authoritative batches, 16 same-value, 0 CHANGED**. No
collapsed card changes any value when the drawer lands.

**OWNER 1 = CLOSED.**

## The product metric

| | before Owner 1 | after attendance | after activity |
|---|---|---|---|
| FIRST_ORDER_VISIBLE_COMPLETE P50 | 8,122 | 7,951 | **4,762** |
| P95 | 8,724 | 9,634 | 9,433 |
| FIRST_PAINT P50 | 3,399 | 3,526 | 3,555 |
| POST_COMPLETE authoritative | 16 | 8 | **0** |

**Cumulative improvement: 8,122 → 4,762 ms P50, a 3,360 ms saving**, and post-complete semantic
mutations eliminated at P50.

`<1,000 ms`: **FAIL.** Remaining gap **3,762 ms**.

## What the activity repair was

The collapsed Business Process card's activity count is `evidence.activity.length`, and that
projection falls back to ONE item derived from `signals.tour` when truth carries no canonical
activity entries. The commit producer declared `signals.tour` settlement-owned, so that item — and
its count — appeared only when the drawer answered.

The answer now resolves it, through the **one** canonical query owner
(`loadOpportunityTourProjectionForViewModel`) and the **one** canonical mapping owner
(`buildTourSignalFromBookings`, extracted from `buildOperationalContext` so settlement and commit
share it). A strict read policy raises on failure so the composer omits the field rather than
publishing an empty nobody established — UNKNOWN != ZERO.

**Scope held:** only `signals.tour` moved. The card's evidence chain was censused and reads
`signals.tour` and `signals.work` only — attention, communications and billing stay Stage 2.

## The remaining owner

`FIRST_PAINT` is 3,555 ms and `composition_ready` is ~2,595 ms, whose pole is `document_children`.
With the Children card configured and needing its roster, the surface cannot be authoritative
before that chain completes — so the floor is structural, not a scheduling accident.

See `owner2-the-wait-is-load-bearing.md`: Owner 2 as specified cannot be implemented without
reintroducing the exact defect Owner 1 removed. The only sanctioned lever is moving **photo
minting** out of the first-order children attach (Part 12 permits Stage 2 to resolve photos). Its
share of the 2,468 ms chain is **not instrumented**, so no saving is claimed for it.
