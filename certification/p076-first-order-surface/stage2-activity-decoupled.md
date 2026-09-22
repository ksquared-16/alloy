# P0-7.6 — the drawer no longer owns first-order finality

Run: erun_44ddbc959660fdfb · Lane: lane_73a897409906
Deployed `d2905daf3` (containment proven over `58fc0ab73`). 26 of 26 kept, zero drift.

## Part 0 — the oracle was the thing that was broken

A `characterData` mutation carries **no added or removed nodes**. Downstream analysis compared
those fingerprints, found both empty, and scored a real `"1" → "2"` as same-value. That is how the
activity-count correction read as convergence for two runs.

The probe's classifier was never wrong — it has `characterDataOldValue` and compares the text. What
was missing was the **evidence in the record**. Records now carry `textBefore`/`textAfter`, and
`identical` is **null** for characterData rather than vacuously true.

**Re-judging the already-deployed data with the fixed rule turned "40 same-value, 0 changed" into
40 CHANGED.** The correction was always there; only the analysis was blind.

## Parts 1–3 — the contract decided it, not the cost

| question | answer |
|---|---|
| rendered meaning | "Recent activity" + count, on a **dropdown trigger** that opens detail on demand |
| card face | **zero activity rows** — the renderer says so: *"ACTIVITY ON DEMAND … a trigger that opens an empty menu is a broken promise"* |
| declared `firstOrderFields` for `business_process` | name, stage_count, current_stage_key, current_stage_label, stage_position, stage_entered_at — **activity is not among them** |
| first-order projection contract | names the exclusions outright: *"nested surfaces, **Recent activity**, payment applications, rails, expanded contacts, avatars, drawer content — deliberately absent"* |

**Classification C — DETAIL_ONLY_BUT_LEAKED_INTO_COLLAPSED.**

The count was never a first-order decision input. It is an affordance label that had acquired the
power to decide when the first-order surface was authoritative.

## Part 9 — the enrichment contract, implemented

The affordance is marked `data-alloy-stage2-enrichment`; the probe scores mutations inside such a
subtree `STAGE2_ENRICHMENT`, which does not advance finality.

**The count still appears, and appears exactly when it always did.** It simply may no longer claim
the first-order surface had not finished.

Guards: the marker suppresses finality for the count; **plant** — without it the same mutation does
advance; **over-reach guard** — a sibling stage-label change (`Lead` → `New Lead`) still advances,
so the marker cannot silence a real correction.

## Part 10/11 — the deployed proof

| | repairA (`03f93ec6f`) | stage2 (`d2905daf3`) |
|---|---|---|
| FIRST_PAINT P50 | 2,469 | 3,119 |
| **FIRST_ORDER_VISIBLE_COMPLETE** | 5,347 | **3,124** |
| V2.1 − drawer-end | **+39** | **−3,591** |
| drawer VM end | 5,562 | 7,162 |
| post-complete authoritative | 10 | 8 |
| post-complete **in WU-09** | present | **none** |

**`V2.1 = FIRST_PAINT` (3,124 vs 3,119).** Finality now completes **3.6 seconds before** the drawer
answers. The Focus Panel is out of the drawer's hands.

Remaining post-complete authoritative is **WU-07 (158) and WU-00 (58)** — the record header and the
OS shell. **Zero in WU-09.**

## The remaining owner

**FIRST_PAINT itself**, since V2.1 now equals it. Its composition:

| | P50 |
|---|---|
| route_meta | 190 |
| compose_wall / page_total | 2,166 |
| ├ composition_ready | 1,653 |
| └ **document_children** | **1,234** — still the pole |
| FIRST_PAINT | 3,119 |

`<1,000 ms` **FAIL**; gap **2,124 ms**.

`document_children` remains the measured binder, so Part 14's condition for reopening the children
work is met — but no specific proven repair is in hand, so this returns one owner rather than
continuing on speculation.

**POST_COMPLETE P50 = 8**, owned by the WU-07 record header — the previously reported second owner
that takes a genuine correction (`Lead` → `New Lead`) because first paint uses the queue preview
seed's status label. It was not ungated, deliberately.
