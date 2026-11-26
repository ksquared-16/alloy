# Focus Panel Surface Builder — final authoring QA pass

Run `erun_bc59fb06915aad4b`. Slot 6, `http://localhost:3016`, real
`/organization/surfaces?section=focus-panels` → Enrollment Focus Panel → Cards.

## Root causes

**Poor previews.** The composer was already right in architecture — it renders the real runtime
components against a real Operational Context built from a demo view model. The failure is one level
down: every operational card is a **container** that fetches its own subject data, and a settings
page has no subject to fetch for. So `AttendanceCard` and `HealthSafetyCard` gate on a scoped
participant (`memberId`) that a settings page never has, and `FinancialsCard` gates on an account
fetch that returns nothing. All three then render their correct **runtime** empty state:

```
Attendance      → "Select a child to see their day."          (AttendanceCard.tsx:224)
Health & Safety → "Select a child to see their health…"       (HealthSafetyCard.tsx:278)
Financials      → "No financial record."                      (FinancialsCard.tsx:523)
```

The container is what cannot resolve; the presentation is fine. So the builder now skips the
container and renders the approved presentation component with representative evidence.

**Unreliable drag/drop — three independent causes.**

1. *Column arithmetic disagreed with CSS Grid.* Two places converted pixels to cells
   (`cellFromPointer`, `composerGhostBounds`) and both used `surfaceWidth / 12`. A grid of
   `repeat(12, minmax(0,1fr))` with `column-gap: 10px` has 12 **tracks** of `(W − 11·10)/12`, each
   followed by a gap. The models agree at column 1 and diverge by ~9px more per column. Measured on
   the live canvas (grid width 1277px): column 7 truly starts at **1125px**, the old model said
   1119.5px; a 6-span is truly **634px**, the old model said 628.4px. Near a boundary the pointer
   resolved to the neighbouring column and the ghost was drawn where the card would *not* land.
2. *The drag handle vanished on narrow cards.* `.alloy-os-fp-composer-cell__drag-bar` had fixed
   insets `left: 34px; right: 156px` — 190px of gutter. A 2/12 card (~190px wide) had a handle of
   zero width and simply could not be picked up.
3. *A tray chip that could not place.* Adding Staff did nothing at all: the composer's card map is
   derived from a demo **opportunity**, which produces no Staff model, so the order reconciliation
   dropped the entry and the grid/order sync effect removed the card again. Nine of ten chips
   worked, so it read as a flaky click.

**Adding was not observably causal.** `onAddCard` mutated the grid and stopped. Selection was
attempted but resolved the card key against `order`, which only gains the card when the layout
change emitted by the *same handler* is reconciled — both batch, so the lookup ran against the order
from before the add and found nothing.

## Files / shared owners changed

| file | role |
|---|---|
| `lib/adminV2/runtime/focusPanel/authoring/focusPanelAuthoringPreview.tsx` | **new** — approved component + representative evidence |
| `lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps.ts` | **the one owner** of composer grid geometry (`composerGridMetrics`, `composerCellFromOffset`) |
| `components/admin/focusPanel/FocusPanelCardRenderer.tsx` | `authoringPreview` branch, gated on the prop |
| `components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx` | tray to the top, product names, causal add, geometry via the owner |
| `components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` | merges registry placement models so every offered card can be placed |
| `lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring.ts` | `authoringPlacementModelFor` |
| `app/adminV2/components/alloyOsRuntime.css` | proportional drag-handle gutters |
| `tests/surfaces/focusPanelComposerGeometry.test.ts` | **new** — 9 assertions |
| `tests/surfaces/focusPanelAuthoringPreviewBoundary.test.ts` | **new** — 8 assertions |

Drag/snap was fixed in the **shared** owner, not per card.

## Final canonical authorable list

Derived from the registry + supersession, unchanged. Tray, measured live:

```
Employment · Staff · Tour · Communications · Documents · Why Now ·
Required Information · Current Mission · Timeline · Notes
+ Financials · Financials — Compact   (when Financials is unplaced)
```

Absent, as required: `current_work`, `billing_preview`, `child_identity`, `health`.
`billing_preview` **still renders** as a placed cell in the published v135 layout — compatibility is
intact; only the authoring tray excludes it.

## A · Add card at top

`data-fp-composer-tray-position="top"`. Measured offset from the composer's top edge: **0px**
(before: tray at y=2018 against a composer top of y=419). Screenshot: `FINAL-builder.png`.

## B · Tray grammar

Live assertion `/\b\d+\/12\b/.test(trayText)` → **false**. Before: "Staff 6/12", "Tour 4/12",
"Financials 4/12". After: product names only; the one real presentation difference reads
"Financials — Compact". Columns still travel with the choice as its default placement.

## C · Preview fidelity

| card | rendered anatomy (live) | evidence |
|---|---|---|
| Business Process | rail Lead → Tour → Waitlist → Enrolling → Enrolled, participant markers Avery/Riley, command row, activity foot | `preview-business_process.png` |
| Financials Summary | CURRENT PERIOD · CHARGES · DISCOUNTS & CREDITS · FUNDING, 848×471 | `financials-summary.png` |
| Financials Compact | $255 past due · charges · Visa •••• 4242 Autopay paused · Pay now · Add charge → · Details →, 419×221 | `financials-compact.png` |
| Attendance | Present · In Nap Room since 12:05 PM · Expected 8:00 AM – 4:30 PM · timeline | `preview-attendance.png` |
| Health & Safety | CRITICAL Peanut allergy SEVERE · Anaphylaxis · EpiPen · HEALTH Asthma | `preview-health_safety.png` |
| Staff | Active · Taylor Reed · Lead Teacher · On site since 7:27 AM · Sunflower Room | `preview-staff.png` |
| Children | 2 children · 1 enrolled · per-child rows (real render, no fixture) | `preview-children.png` |

Zero empty-state markers remain: `[data-attendance-empty],[data-health-empty],[data-financials-empty]`
→ **[]** (before: all three present).

## D · Immediate placement

All **10/10** tray cards place (before: 9/10 — Staff silently vanished). Each add selects the card
(`is-selected` → true) and scrolls it into view.

## E · Drag/snap — browser proof

Real pointer events (`mouse.down` → 8 interpolated `mouse.move` → `mouse.up`).

| case | result |
|---|---|
| lift on drag begin | `data-fp-composer-arranging="true"` → **true** |
| ghost geometry | x=481 (grid left), w=634 (6-span) — matches the browser exactly |
| 8 + 4 | `financials c1/8 r1` + `attention c9/4 r1` — one row, span 12 |
| 6 + 6 | `staff c1/6 r1` + `communications c7/6 r1` — one row, span 12 |
| 4 + 4 + 4 | `c1/4 · c5/4 · c9/4`, all row 1 — span 12 |
| full row | `business_process c1/12 r1` |
| first → last | business_process r1 → r20, neighbours intact |
| last → first | household 7/6 r8 → 1/6 r3; readiness 3→7, billing 7→10 repacked |
| remove → repack | removing the middle 4/12 leaves neighbours alone; re-adding fills that exact hole (c5/4) |
| **overlaps** | **[] in every state measured** |

Screenshots: `drag-first-to-last.png`, `drag-last-to-first.png`, `span-8-4.png`, `span-6-6.png`,
`span-4-4-4.png`, `span-full-row.png`, `remove-repack.png`.

## F · Density

Compact `col 5/4`, 419×221. Summary `col 5/8`, 848×471. Different components' output, not one
placeholder at two sizes. Persists across publish + reload (see G).

## G · Publish / reload

Canonical Surface publish path:

```
baseline            v135, 8 areas
+ Staff             → publish → v136
reload builder      → composition byte-identical to what was authored (IDENTICAL: true), overlaps []
− Staff             → matches baseline exactly (MATCHES BASELINE: true) → publish → v137
```

The surface is left at **v137, whose composition equals the original v135** — nothing authored by
this pass remains published. Screenshot: `publish-reload.png`.

## H · Runtime isolation

Guard: the renderer's authoring branch is gated on a prop only the composer passes, and a test
asserts no runtime provider or composition owner imports the preview module or the lab fixtures.

Proven live on a real Focus Panel (`/workspace/work-unit/waitlist`, real family):

```
fixtureLeaks: []      ← searched for "Taylor Reed", "Peanut allergy", "Wright",
                        "In Nap Room since 12:05 PM", "Sunflower Room cabinet"
Financials   → $0.00 · Responsibility $0.00 · No payment method
Attendance   → No attendance recorded today
Health       → REQUIRED INFORMATION · Physical/health assessment Missing
```

Screenshot: `runtime-isolation.png`.

## Tests / typecheck

* `tests/surfaces` + `tests/operationalCards` — **42/42**, including 9 new geometry assertions and
  8 new boundary/library assertions.
* `vac run typecheck` → **rc=0**. (One real error was caught and fixed: `archetype: "reference"` —
  `reference` is a tier, not an archetype.)

## Commits

| sha | subject |
|---|---|
| `dcc09d784` | the builder previews the real card, and its grid math matches the browser |
| `423b9168f` | a tray chip that cannot place is a chip that does nothing |
| `676058c0e` | the authoring placement model uses a valid archetype |

## Known, not fixed

The published v135 layout has vertical holes in the left column (rows 5–11 empty between Readiness
and Attendance). That is the operator's own authored composition, not a packing defect — repacking a
published layout would rewrite authored intent, which this pass has no mandate to do.
