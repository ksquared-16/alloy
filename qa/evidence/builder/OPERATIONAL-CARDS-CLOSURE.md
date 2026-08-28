# Operational Cards — final closure

Run `erun_487f7979b48885a9`. Slot 6, real `/organization/surfaces` builder and
`/workspace/work-unit/waitlist` runtime.

## 1 · Drag / snap — the actual root cause

The previous pass's "grid math now matches CSS" was real but **secondary**, and it measured the
wrong element. Two causes remained, and both were found by measuring live DOM rectangles.

### 1a · Fixed rows made cards overflow their own grid areas

`.alloy-os-fp-composer .alloy-os-fp-canvas--grid { grid-auto-rows: 76px }` — pinned so drag maths
could assume a constant pitch. A fixed row **cannot grow**, so any card whose content exceeds
`rowSpan × 76` overflowed its area and painted over whatever was declared beneath it:

| card | declared area | rendered card | overflow | covers |
|---|---|---|---|---|
| business_process | 162px | 239px | **+77** | readiness_kpi by 67px |
| attendance | 162px | 393px | **+231** | financials by 221px |
| financials | 162px | 471px | **+309** | health_safety by 298px |
| health_safety | 162px | 350px | **+188** | — |

The **declared areas never overlapped**. Area-level assertions and packing tests therefore passed
while QA saw cards stacked on each other — the previous pass asserted on `[data-fp-grid-area]`,
which is exactly the element that was correct.

The same assumption produced the reported drag symptoms. The grab offset is
`pointerRow − area.rowStart`; over a card visually spanning six rows while declaring two, that
offset is large and wrong, so drops landed far below (**"snaps back toward the bottom"**) and upward
drags clamped at row 1 and were pushed back down by collision snapping (**"some cards refuse to
move upward"**). Which cards misbehaved depended on how far each overflowed — hence "some".

**Fix.** Composer rows are content-sized (`minmax(76px, auto)`), like the runtime's. That removes the
overflow *and* the constant pitch, so geometry is now **measured** from the browser's own resolved
tracks (`getComputedStyle().gridTemplateRows`, implicit rows included) by one owner shared by the
pointer mapping, the ghost and the resize path. Ghost and drop cannot disagree — same measurement.

*After:* every card's overflow ≤ 0, live overlaps `[]`.

### 1b · The no-overlap invariant was a preference, not a rule

`sameStackColumn` decides which cards read as one visual column. It was also the **only** thing
between the model and an overlap, and a heuristic cannot carry an invariant:

```
attendance 1/8 vs staff 7/6            2 cols of overlap; narrower span 6; 2 < 80% of 6 → "not same column"
business_process 1/12 vs health 9/4    colStarts 8 apart                              → "not same column"
```

Both were produced by ordinary drags in the real builder, and both left one card on another.

**Fix.** The heuristic still runs first, for the layout it produces. A second pass then enforces the
rule: any card still colliding is pushed below everything it collides with, repeatedly — terminating
because every push moves it strictly down. `gridOverlaps` exports the check.

*Property test, not a sample:* 7 cards × every one of 12×16 target cells = **1344 moves**, zero
overlaps, no card ever dropped.

### 1c · Also fixed

The drag handle's fixed insets (`left:34px right:156px`) consumed 190px, so a 2/12 card had a handle
of **zero width** and could not be grabbed. Gutters are proportional now.

## 2 · Dense-composition browser proof

Composition: Business Process · Financials · Attendance · Health & Safety · Household · Children ·
Assignments · Staff. (Assignments was Linked on this surface; promoted to Visible for the test.)

Every drag driven with real pointer events; **zero overlaps asserted from live card rectangles at
every final state**.

| case | result |
|---|---|
| dense composition built | PASS |
| bottom → top | PASS |
| top → bottom | PASS |
| middle → top | PASS |
| full row across partial rows | PASS |
| 8/12 → top | PASS |
| 4/12 → top | PASS |
| 6/12 → top | PASS |
| 6/12 → top (second card) | PASS |
| Assignments (4/12) → top | PASS |
| **cancelled drag restores exact prior position** | PASS |
| after cancelled drag | PASS |
| remove → repack | PASS |
| re-add | PASS |

`FAILURES: []`. Card lifts on grab (`data-fp-composer-arranging`), ghost dimensions match the
landing area. Screenshots: `cert-dense.png`, `cert-dense-final.png`.

**Not left published** — the dense composition was never published.

## 3 · Financials — two named presentations, one identity

One canonical `financials` key, one read model, one cell. The choice is made in operator language
through **Configure → Presentation**, and the placement travels with it silently.

| | columns | rendered | anatomy |
|---|---|---|---|
| Summary | 1/8 | 621×471 | CURRENT PERIOD · CHARGES · DISCOUNTS & CREDITS · FUNDING · payment |
| Compact | 1/4 | 306×221 | past due · charges · Visa •••• 4242 Autopay paused · Pay now · Add charge → · Details → |

Summary → Compact → Summary → Compact all exercised; zero overlaps throughout. **Exactly one
`financials` cell** in either state — no third stale presentation. `billing_preview` remains absent
from Add card while still rendering in the published layout (compatibility intact).

Persistence: published v139 with Compact, reloaded the builder → **Compact returned at 1/4, 419×221**.

**Runtime persistence could not be proven, and the reason is not this change.** The runtime
work-unit panel is not driven by this published Surface: the surface's own Assignments tab states
*"A dedicated Business Process assignment table for this Surface is planned. No assignment is
fabricated here."* The runtime composes from the code default
(`business_process 1/12 · financials 1/8 · billing_preview 9/4 · household 1/4 · health_safety 5/4 ·
attendance 1/8 · scheduling 9/4 · children 1/6`), which is what it rendered. Until an assignment
mechanism exists there is nothing for a Surface publish to persist *into* at runtime.

Restored to Summary and published **v140**. Delta from the pre-run v137: Financials sits at 1/8
(Summary's canonical placement) rather than its previous ad-hoc 1/6. Nothing else changed.

## 4 · Process card command provenance

Stage `waitlist`, work template `review_waitlist_position`, department `3933ac47-…`.

**Published configuration → rendered commands**

| # | configured `helpful_actions` | rendered on the card |
|---|---|---|
| — | *no `primary_action`* | *no filled lead command* |
| 1 | `send_tour_invitation` | Send Tour Invitation |
| 2 | `schedule_tour` | Reschedule Tour *(same ref, booking-state aligned)* |
| 3 | `quick_message` | Message |
| 4 | `send_form` | Send form |

**Publish-only change** (canonical path: stage-runtime-config draft → `configuration/publish`,
revision **21**): reordered to `send_form, send_tour_invitation, schedule_tour` and removed
`quick_message`. No code changed.

| queue row | rendered |
|---|---|
| **1 — unpinned journey** | **Send form · Send Tour Invitation · Reschedule Tour** ← new set |
| 0, 2, 3 — pinned journeys | Send Tour Invitation · Reschedule Tour · Message · Send form ← old set retained (D-96) |

`DRIFT: null`. `WITHHELD: cancel_tour` — an executable companion a state rule adds that the
configuration never selected, correctly kept off the row and recorded.

Restored to the intended configuration at revision **22**; row 1 back to the intended four.

Regression test retained: `processCardCommandFidelity.test.ts` asserts the provider source does not
contain `recordHeaderActions` and does call `projectProcessCardCommands` — the positive control for
the whole file. 11/11.

## 5 · Clean promotion branch

`agent/claude/6-operational-cards-promotion` — **`9b5225fdbdee88a6b939b3df3848e7e1f23a3953`**,
based on `origin/staging` (`01841dcb9`). 11 cherry-picked commits, all Operational Cards /
Surface Builder / Process-command-fidelity.

* **Zero** Decision Delivery commits.
* **Zero** files outside `web/` and `qa/`.
* **Zero** `scripts/local-dev` / vacilando files.
* `web/` is byte-identical to the working branch.

60 files, +2584 / −140.

## Tests / typecheck

* `tests/surfaces` (4 suites incl. 2 new), `tests/operationalCards`,
  `processCardCommandFidelity`, `businessProcessProvider` — **75/75**.
* `vac run typecheck` → **rc=0**.
