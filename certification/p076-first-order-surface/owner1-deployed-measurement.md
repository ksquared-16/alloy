# P0-7.6 Owner 1 — the deployed measurement, and why Gate A does not pass

Run: erun_82492021ea8477a1 · Lane: lane_73a897409906
Deployed `65337e45b`; containment proven by ancestry (`65337e45b` contains `ac32e786b`).
**24 cold real-page samples**, pinned six-card specimen. Baseline: `a1ecf609`, 7 samples.

## What the repair did

| | before (n=7) | after (n=24) |
|---|---|---|
| FIRST_PAINT | 3,399 | 3,526 |
| **FIRST_ORDER_VISIBLE_COMPLETE (V2.1)** P50 | **8,122** | **7,951** |
| V2.1 P95 | 8,724 | 9,634 |
| V2.1 − drawer-VM end | 30 | 44 |
| **POST_COMPLETE authoritative** | **16** | **8** |
| post-complete by section | WU-09 60, WU-07 36 | WU-09 34, WU-07 104, WU-00 6 |

**The value defect is fixed.** At drawer arrival, WU-09 now shows **18 authoritative batches, 18
same-value, 0 changed** — the cards no longer change any value when the drawer lands. WU-09's
post-complete authoritative share fell from **8.6 to 1.4 per sample**.

## The population split — where the predicted saving actually appears

| population | n | V2.1 P50 | V2.1 P95 |
|---|---|---|---|
| **drawer VM not requested** | 7 | **3,647** | 5,178 |
| drawer VM requested | 17 | 8,112 | 9,775 |

Against the 8,122 ms baseline, the no-drawer population measures a **4,475 ms saving** — which is
the ~4,460 ms the census predicted, almost exactly. The mechanism is confirmed. But it only
appears when nothing else pulls the drawer VM onto the critical path.

## GATE A — FAIL, and the field that fails it

| gate | result |
|---|---|
| A.1 LEGITIMATE_AUTHORITATIVE_CORRECTION = 0 | **FAIL — one field** |
| A.2 post-complete attributable to drawer settlement = 0 | **FAIL — 8 (halved from 16)** |
| A.3 finality no longer waits for the drawer VM | **FAIL in 17 of 24** (delta 44 ms) |

The remaining authoritative mutation at drawer arrival is a single `characterData` change on
`<SPAN class="alloy-os-process__activity-count">` — the **Business Process card's activity
count** — whose text resolves to `1` only when the drawer answers.

Per Part 3 this field is **NOT ungated**, and is returned instead:

- **field** — `business_process` collapsed activity count
- **first-paint owner** — none; the commit producer states these signals as
  *"Settlement-owned signals — honest empty (reserved), never fabricated"*
  (`attention`, `tour`, `communications`, `billing` are all NULL at commit **by design**)
- **Drawer VM owner** — the settled activity signal
- **why commitCritical lacks the truth** — it is not an oversight. The answer deliberately declines
  to state these signals at commit rather than fabricate them, which is the correct doctrine
  (UNKNOWN != ZERO). The card then legitimately corrects from UNKNOWN to `1`.
- **smallest owner correction** — have the provisioning answer RESOLVE the activity signal at
  commit, the way it already resolves participation, so the count is `known` at first paint instead
  of settlement-owned. That is an answer-side change, not a presentation change.

**This is a real authoritative correction, so freezing it would trade slow for stale.** The repair
stops here deliberately.

## Why Owner 2 was not started

Part 3 says STOP before ungating when a configured collapsed field takes a legitimate correction.
One does. Owner 2 (first-order emission, `document_children` tail, ~1,853 ms P50) is fully traced
and ready, but it moves *emission*; it cannot remove a wait for a value the answer has not
computed. Sequencing Owner 2 first would leave the same gate open one level down.

## Status

- The deployed repair is **correct and net-positive**: value changes eliminated, post-complete
  authoritative halved, and a measured 4,475 ms saving wherever the drawer is not pulled in.
- It is **not sufficient** to close Gate A, and the blocker is named, measured, and one field wide.
