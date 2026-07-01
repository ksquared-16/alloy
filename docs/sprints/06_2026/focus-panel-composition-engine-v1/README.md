# Focus Panel — Composition Engine V1

**Status:** implemented, not committed — awaiting visual sign-off.

The Summary surface is no longer laid out as a uniform N-column grid of equal
cells. It is **composed** from card semantics (Weight, Preferred Partners,
Preferred Row, width budget) by a real layout engine. Cards do not compose
themselves; the engine receives the Surface Definition + each card's composition
preference + the available width and returns a composition the renderer paints.

This sprint is about **composition**, not CSS spacing.

---

## What changed (the engine, not the grid)

Before, every card resolved to `span 1 | 2 | "row"` on a uniform 1–4 column
grid. `narrow` and `medium` both collapsed to one column, so the surface read as
**equal widgets in two columns**. That is the root cause the prior CSS passes
could not fix.

Now `composeFocusPanelSurface()` derives layout from semantics on a finer
**12-unit** base:

- **Heavy** cards (Household, Children) are **anchors** → a dominant lead lane.
- **Medium / Light** cards (Readiness, Current Work) **balance** → a support lane.
- Lane widths are **asymmetric** (engine clamps the anchor lane to 6–8/12 so it
  stays dominant without starving support).
- Cards keep their **natural height**, so the lanes **interlock** like puzzle
  pieces instead of stretching to equal heights.

### Width-adaptive strategy

| Available width | Strategy | Composition |
| --- | --- | --- |
| ≥ 560px | `lanes` | Anchor lane (Household → Children) beside a narrower support lane (Readiness → Current Work). Different widths, natural heights. |
| 420–560px | `stack` (paired) | Full-width anchors; Readiness + Current Work **pair** side-by-side beneath them (a different rhythm than the heavy cards). |
| < 420px | `stack` (single) | One ordered column (reading order preserved). |

The **operator panel measured 745px → `lanes`** (primary 467px, support 234px).

---

## Composition engine decisions (measured)

**Dev harness (wide, 960px frame):**
- strategy = `lanes`
- primary lane = **609px** → `household`, `children`
- support lane = **305px** → `readiness_kpi`, `current_work`
- lanes asymmetric (≈ 2:1)

**Dev harness (mid, 540px frame):**
- strategy = `stack`, anchor = **506px**, support paired = **247px**

**Live operator (`lifecycle-lead`, panel 745px):**
- strategy = `lanes`
- primary lane = **467px** → `household`, `children`
- support lane = **234px** → `readiness_kpi`, `current_work`
- `View household →` still elevates Household to a centered **Focus Card**.

---

## Card footprint decisions

| Card | Weight | Lane | Width intent | Height |
| --- | --- | --- | --- | --- |
| Household | Heavy | Primary (lead) | Dominant (full lane) | Natural / tall |
| Children | Heavy | Primary (lead) | Dominant (full lane) | Natural / tall |
| Readiness | Medium | Support | Balancing (full support lane) | Compact (overlay owns depth) |
| Current Work | Light | Support | Balancing (full support lane) | Compact |

Weight also maps to a render density (heavy → standard, medium → compact, light
→ micro), surfaced via `data-fp-width-units` / density on each cell.

---

## How depth + overlays are preserved

The composition path and the legacy grid path share **one** depth machinery in
`FocusPanelCardGrid`. Composed cells keep the exact same attributes
(`data-focus-panel-grid-cell`, `data-fp-elevated`), refs, height reservation, and
zoom-from-origin, so:

- **Focus Cards** (Household, Children) still center, grow, and overlay the
  canvas; the rest recedes (no move). Verified: `householdElevated = household`.
- **Inline overlays** (Readiness, Current Work) still open as card-anchored
  dropdowns that cover the card below **without moving it**. Verified:
  `belowCardMoved = false`, `readinessScrim = 0`, handoff → `children`.

The base canvas never reflows when a card goes deep.

---

## Deliverables (screenshots)

- `01-composition-lanes.png` — dev: interlocking lanes (dominant left, support right).
- `02-composition-stack.png` — dev: composed stack with paired support row.
- `10-operator-composition.png` — operator: Summary composed into lanes.
- `11-operator-household-focus.png` — operator: Household Focus Card over the composed canvas.
- `12-operator-back-to-base.png` — operator: back to the composed base surface.

---

## Files changed

- `web/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface.ts` — **new** engine.
- `web/components/admin/focusPanel/FocusPanelCardGrid.tsx` — composed render path (lanes + stack) sharing the depth machinery.
- `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` — feeds `composeCards` for Summary.
- `web/app/dev/household-card-verify/HouseholdCardVerify.tsx` — harness now exercises the engine.
- `web/app/adminV2/components/alloyOsRuntime.css` — composition canvas (lanes/stack); reuses the existing spacing tokens.
- `web/tests/adminV2/runtime/composeFocusPanelSurface.test.ts` — **new** unit tests (engine).
- `web/playwright/tests/focus-panel-composition-engine-v1.spec.ts` — **new** dev + operator capture.

Builds on the prior declarative `cardCompositionModel.ts` (this sprint wires it
into a runtime engine).

---

## Tests run

- `vitest` — composition engine (10) + card composition model (6) + focus panel polish (19) = **35 passed**.
- Playwright dev — composition lanes/stack assertions **passed** (asymmetric lanes, paired stack).
- Playwright operator (`PLAYWRIGHT_COMPOSE=1`) — operator composes `lanes`, Household focus elevates.
- Regression: `focus-panel-inline-overlay.spec.ts` dev **passed** (overlay covers-not-moves, handoffs, focus intact).
- `tsc --noEmit` — clean on all touched files.

---

## Remaining differences vs. approved composition

- Support lane is narrow (≈234px) on the operator panel; readable for compact
  cards but a wider panel would breathe more.
- Support lane leaves whitespace beneath Current Work when Children is tall
  (natural interlock — intentional, but could host a future card).
- Paired-support stack only appears in the 420–560px band; the operator panel is
  wide enough for lanes, so most operators see lanes.
- Engine reads platform-default preferences; Surface/Business-Process overrides
  are plumbed (`overrides`) but no per-org override UI yet.

---

## Acceptance check

- [x] Layout derived from card semantics, not equal grid cells.
- [x] Cards have different widths (asymmetric lanes) and natural heights.
- [x] Household dominant; Children complements; Readiness + Current Work balance.
- [x] Inline overlays still cover-not-move; canvas never reflows.
- [x] Household / Children retain centered Focus Card behavior.
- [x] Reads as one composed workspace, not four independent cards.
