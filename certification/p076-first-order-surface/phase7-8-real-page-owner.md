# P0-7.6 Phases 7–8 — the real operator page, traced, and the owner of the product gap

Run: erun_77eca4a07ae34742 · Lane: lane_73a897409906
Lineage `b4a4a2bf` (pre-repair). 12 cold real-page samples, 11 valid with attendance configured.
Samples lacking the attendance card were **discarded loudly**, never counted as a quiet zero.

## The prototype was wrong by a factor of three

| | |
|---|---|
| prototype `clientWallMs` P50 (previous run) | 2,876 ms |
| **real page `FIRST_ORDER_VISIBLE_COMPLETE` (V2.1) P50** | **7,731 ms** (P95 8,590) |

Every inference about product time drawn from the prototype endpoint was unsafe. Retiring it was
correct.

## The owner, read off two endpoints on the same clock

```
V2.1 MINUS drawer-VM response end     P50  40 ms     P95  49 ms     n=11
```

Semantic finality lands **40 ms after** `/api/admin/view-models/drawer/opportunity/<id>` returns,
in every sample. Both numbers come from one probe on one clock (`performance.now()`, origin
navigationStart). This is an **owner**, not a residual and not a subtraction.

The metric independently names the completion owner **WU-09 in 11 of 11** — and WU-09 is the Focus
Panel; all the cards live inside it.

| | P50 | P95 |
|---|---|---|
| document | 3,177 | 3,776 |
| WU-09 first authoritative paint | 3,280 | 3,877 |
| **drawer VM duration** | **4,536** | 4,764 |
| **V2.1 FIRST_ORDER_VISIBLE_COMPLETE** | **7,731** | 8,590 |
| first paint → finality (the churn) | 4,546 | 4,770 |
| API responses landing after first paint | 16 | 17 |
| post-complete visible / authoritative mutations | 23 / 16 | |

The churn is **59%** of the metric; everything before first paint is 42%.

## Why this is decisive

The card-model census in this programme proved the six configured collapsed cards read only
`{model, context}`, consume **no** drawer view model, and need **no** `document_children`.

The page fetches it anyway and the Focus Panel keeps mutating authoritatively until it lands.
**The collapsed first-order surface is gated on a payload it provably does not read.**

The drawer VM's own server marks decompose its 4,331 ms:

```
visible_entity_ms                        3,096
  visible_shell_children_ms              2,745
    children_overlay_parallel_fetch_ms   2,147   ← dominant
```

The dominant term is children-overlay work — exactly the `document_children` cost the dispatch
ruled out optimising, and exactly what the collapsed cards do not consume.

## The server page, and the stall that is not network

| | P50 | P95 |
|---|---|---|
| TTFB | 424 | 486 |
| **largest inter-chunk gap (the stall)** | **2,330** | 2,625 |
| gap starts at | 581 | 636 |
| bytes delivered before the gap | 90,313 | |
| `responseStart → responseEnd` | 2,506 | 2,711 |
| **encoded on the wire** | **29,122 B** | |
| decoded | 218,051 B | |
| chunks | 6 | 7 |
| server `compose_wall_ms` | 2,540 | 2,840 |
| ├ `composition_ms` | 2,259 | 2,514 |
| ├ `presentation_ms` | 593 | 704 |
| └ `records_ms` | 113 | 140 |
| `route_meta_ms` / `layout_total_ms` | 140 | 180 |

**Resource Timing scores 2,506 ms as "download". It is not.** Only 29 KB crossed the wire, and the
gap sits between two chunks while the server reports 2,540 ms of composition. Stall and
`compose_wall_ms` are compared as **durations** (ratio 0.92), never as instants.

Measured clock skew **+326 ms P50** — published, never subtracted.

This is precisely the trap that once produced an "807 ms delivery floor". The chunk record refutes it.

## Phase 8 classification — measured owners

| interval | P50 ms | share | class |
|---|---|---|---|
| request → first authoritative card paint | 3,280 | 42% | A + **C/E** (page composition holding the stream) |
| ├ of which TTFB | 424 | | F ACTUAL_NETWORK — small, and proven small |
| ├ of which the stall | 2,330 | | **E STREAM_WAIT**, caused by **C PAGE_COMPOSITION** |
| **first paint → semantic finality** | **4,546** | **59%** | **I SEMANTIC_FINALITY_WAIT**, owned by the drawer VM |
| drawer-VM end → V2.1 | 40 | 0.5% | H REACT_RENDER_COMMIT |

**Reconciliation ≈ 99%.** Unattributed < 1%. No generic residual, no subtraction bucket.

Dominant owner **I**; second **C/E**. The previously unexplained ~1.8 s from the prototype is
**void** — an artefact of a diagnostic endpoint that also ran parity, prepaid and dag work. It does
not exist on the product path and is not carried forward.

## Phase 9 — the real budget

Target 1,000 ms against a measured 7,731 ms. Gap **6,731 ms**.

Even if the drawer-VM wait were removed entirely, finality would sit at first paint —
**3,280 ms**, still 2,280 ms over. And even if page composition were free, the drawer-VM wait alone
(4,546 ms) exceeds the whole budget.

**Neither owner alone reaches <1,000 ms. Both must change.**

## Phase 10 — decision

**D — MULTI_OWNER_ARCHITECTURE_CHANGE_REQUIRED.**

Not E: the trace does not show an unavoidable floor above the target — it shows two addressable
waits, one of which the first-order surface provably does not need. Not A: no single bounded repair
closes 6,731 ms. Selected from the real page, never from the prototype.

---

## Phase 1 addendum — the attendance repair, measured on deployed code (FINAL, n=22)

PR #1195 merged as **`a1ecf609`**, deployed 02:25:32 PDT. Containment proven by git ancestry:
`a1ecf609` contains `63931a86`. The first sampling run straddles the deploy, so samples partition
by `deployedSha`; a second batch brought the post-repair lineage to **22 valid samples**, meeting
the >=21 requirement.

| real-page metric | `b4a4a2bf` (pre) n=11 | `a1ecf609` (post) **n=22** |
|---|---|---|
| **V2.1 FIRST_ORDER_VISIBLE_COMPLETE** P50 | **7,731** | **7,614** |
| V2.1 P95 | 8,590 | 8,058 |
| WU-09 first authoritative paint P50 | 3,280 | 3,166 |
| drawer VM duration P50 | 4,536 | 4,449 |
| first paint -> finality (churn) P50 | 4,546 | 4,460 |
| **V2.1 − drawer-VM end** P50 / P95 | **40 / 49** | **44 / 57** |
| completion owner | WU-09, 11/11 | **WU-09, 22/22** |
| post-complete authoritative mutations | 16 | 16 |

Post-repair server and byte terms (n=25 byte samples):

| | P50 | P95 |
|---|---|---|
| `compose_wall_ms` | 2,568 | 2,883 |
| ├ `composition_ms` | 2,282 | 2,595 |
| └ `presentation_ms` | 598 | 786 |
| `route_meta_ms` / `layout_total_ms` | 136 | 187 |
| TTFB | 372 | 517 |
| **largest inter-chunk gap (stall)** | **2,350** | 2,630 |
| gap starts at / bytes before it | 532 / 90,313 | |
| encoded on the wire | 29,138 B | |
| clock skew (reported, never subtracted) | +274 | +360 |

`compose_wall_ms` 2,568 vs observed stall 2,350 — **ratio 0.92**, compared as durations.

### What the repair bought

**118 ms on a 7,614 ms metric — about 1.5%.** Consistent with the <=140 ms the provisioning DAG
said was recoverable before `work_view_totals` promotes. The repair is correct and was correctly
shipped; it simply was never where the operator's time was going.

**The owner does not change.** WU-09 in **33 of 33** samples across both lineages, with semantic
finality landing 40-57 ms after the drawer view model returns.

### Sample discipline

Four samples across both runs were **discarded loudly** for specimen drift — the queue focused a
4-card household with no attendance card. Discards are reported, never counted as quiet zeros.
That is the trap that once made a frame "improve" to 805 ms by doing less.
