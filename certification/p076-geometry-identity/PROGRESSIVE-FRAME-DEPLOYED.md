# P0-7.6 — the progressive authoritative frame, measured on deployed `a5eb2f29`

24 cold samples kept of 26 (2 dropped to specimen drift), pinned six-card / full-attendance
configuration, compared against `d3cad7ec` (n=26) which is the same specimen before the change.

## The change did exactly what it was designed to do

| span | before | after | delta |
| --- | ---: | ---: | ---: |
| `geometry_identity_ms` | 138 | 144 | +6 |
| **`composition_ready`** | **1734** | **310** | **−1424** |
| `compose_total_ms` | 1739 | 450 | −1289 |
| `document_children_ms` | 1440 | 1401 | −40 |

The frame is genuinely publishing UNKNOWN rather than racing to fill: `cohort_enriched_at_commit`
landed in **0 of 24** samples and `document_children_at_commit` in **1 of 24**. So the 1,596ms of
holding an already-decided geometry is gone, and it was not replaced by a quieter wait.

## The product gate FAILS

| metric | P50 | P75 | P90 | P95 |
| --- | ---: | ---: | ---: | ---: |
| **FIRST_AUTHORITATIVE_FRAME** | **1938** | 2141 | 2522 | 3427 |

Target `< 1,000ms`. **0 of 24** samples pass. Before the change it was 2,692ms, so the frame improved
by 754ms — a fifth of the 1,424ms the server gave back.

## Where the other 670ms went: the runner-up was promoted

| term | before | after | delta |
| --- | ---: | ---: | ---: |
| `route_identity_ms` | 189 | 156 | −33 |
| `compose_total_ms` | 1739 | 450 | −1289 |
| **`card_producers_ms`** | **0** | **740** | **+740** |
| `page_total_ms` (server) | 2124 | 1408 | −716 |
| `transferMs` (stream hold) | 2448 | 1702 | −746 |
| `documentMs` | 2692 | 1938 | −754 |

`projectFocusPanelCardProducers` used to cost the route **nothing**, because it ran concurrently with
composition and finished first — `card_producers_ms` measured only what was left at the join, and
that was zero. Composition now ends at 310ms, so the producers are no longer hidden underneath it
and the route waits 740ms for them.

This is the max()-shaped DAG behaving exactly as it has all programme: removing the binder promotes
the runner-up, and the saving reappears one term to the right.

The producers resolve attendance and health — **facts, not geometry**. They are eligible for
precisely the treatment this change gave the cohort and the roster.

## Why I stopped rather than repairing it

Part 16 authorises one final bounded repair without a further prompt only if the predicted P50
saving is at least the measured gap plus 50ms of headroom.

```
measured gap            1938 − 1000 = 938ms
required saving         938 + 50    = 988ms
predicted saving        740ms  (the whole producer join)
counterfactual frame    1938 − 740  = 1198ms   → still 198ms over
```

**740 < 988.** The condition is not met: removing the producer wait entirely still misses the target.
So the authorisation does not extend to it and I did not implement it. The owner is named by
measurement rather than suspicion, and the next decision is the Director's.

## Correctness — the part that matters more than the number

Post-complete mutations classified per Part 9 (`textBefore`/`textAfter` for characterData, added and
removed fingerprints for childList, with `data-focus-panel-cell-reserved=true` and "Resolving …"
read as UNKNOWN):

| | before | after |
| --- | ---: | ---: |
| MONOTONIC_RESOLUTION P50 | 6 | **16** |
| AUTHORITATIVE_CORRECTION P50 | 2 | **2** |

**Corrections did not get worse.** The rise is entirely monotonic — UNKNOWN cells resolving, which is
the permitted behaviour and the direct consequence of publishing earlier.

The dominant correction is identical in both builds: a WU-07 teardown of
`DIV|Automation FamilyLeadWorkActivity|…BUTTON/aria-controls=focus-panel-mode-activity`. That is the
pre-existing Focus Panel mode-control defect Part 8 names, present before this change and untouched
by it. `AUTHORITATIVE_CORRECTION P50 = 0` is therefore still not met, and this change is not the
reason.

Geometry stayed stable across every sample: 6 of 6 configured cards rendered, 0 unavailable, no
schema error, configured KPI slots 3.

## The honest cost, measured rather than assumed

| metric | before | after | delta |
| --- | ---: | ---: | ---: |
| ALL_FIRST_ORDER_FACTS_RESOLVED (V2.1) | 2822 | **5717** | **+2895** |
| ALL_VISIBLE_AUTHORITATIVE_FINAL (V2) | 6266 | 5730 | −536 |

This is the trade the dispatch asked to be made visible, and it is a large one: the frame arrives
754ms sooner and the facts arrive 2,895ms later. Every configured card now settles together at
~5,730ms, because they all wait on the same Settlement pass rather than on the server.

Whether that trade is worth taking is a product judgement, not a measurement. The frame is faster and
honest; the surface is fully answered considerably later.

## P0-7.6 closure

**NOT closeable.** Both conditions fail:

- `FIRST_AUTHORITATIVE_FRAME P50 < 1,000ms` — **FAIL** at 1,938ms
- `POST_COMPLETE_AUTHORITATIVE_CORRECTION P50 = 0` — **FAIL** at 2, pre-existing, owned by WU-07
