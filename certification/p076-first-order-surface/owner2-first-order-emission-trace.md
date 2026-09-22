# P0-7.6 Owner 2 (Part 13) — why first-order bytes wait for whole-page composition

Run: erun_82492021ea8477a1 · Lane: lane_73a897409906
Seven cold real-page samples, deployed `a1ecf609`, pinned six-card specimen. All numbers are the
page's OWN server marks, carried in the response that was timed.

## The question

Why does commit-critical first-order truth wait until near whole-page composition completion
before its authoritative payload is emitted?

## The answer: one awaited parent, and the collapsed surface does not read it

| span inside composition | P50 | P95 |
|---|---|---|
| `composition_ready` | **2,595** | 3,311 |
| `focus_panel_summary_rows_done_ms` | 2,595 | 3,311 |
| **`document_children_ms`** | **2,468** | 3,102 |
| └ `document_children_tail_ms` | **1,852** | 2,442 |
| `cohort_rows_done_ms` | **778** | 925 |
| `actions_projection_done_ms` | **778** | 925 |
| `focus_panel_stage_work_done_ms` | **778** | 925 |
| `header_kpi_execution_elapsed_ms` | 382 | 447 |

**Everything the collapsed first-order surface needs is finished at 778 ms.** Composition does not
declare itself ready until **2,595 ms**.

```
composition_ready − first-order-ready = 1,853 ms P50 / 2,443 ms P95   (n=7)
document_children_tail_ms             = 1,852 ms P50
```

Those two agree to a millisecond at P50. **The awaited parent is `document_children`, and
specifically its tail.**

## Corroborated at the byte level

The streaming probe on the same page, independently: 90,313 bytes (the shell) delivered by
~532 ms, then a **2,350 ms gap between chunks**, then the remaining ~128 KB at once — with only
~29 KB encoded on the wire. The stall matches `compose_wall_ms` as a duration (ratio 0.92). The
server is holding the stream open while composition finishes; Resource Timing scores it as
"download", and the chunk record refutes that.

## Why this is safe to change

The collapsed card census established, and `firstOrderSurfaceGenerality` guards, that the six
configured collapsed cards consume **no `document_children`**. The Children card reads
`truth._inquiry_children` — the answer's own identity truth — not the document's children
projection. Nothing on the collapsed surface reads the payload it is waiting for.

## What Owner 2 is, and is NOT

**Is:** emit the first-order authoritative payload when commit-critical truth is ready (~778 ms),
and let `document_children`, the drawer VM, photos and expanded detail continue afterwards.

**Is NOT:** optimising `document_children`. Its cost is unchanged; only its position relative to
first-order emission changes. The dispatch's rule against optimising it is respected — this
removes a *wait*, not a query.

## Expected

Removing this wait should move first-order emission from ~2,595 ms to ~778 ms, roughly
**1,853 ms P50**. Combined with Owner 1 it is the difference between a surface that paints after
the whole page composes and one that paints when its own truth is ready.

**A prediction to be measured on the deployed path, not claimed.**
