# Alloy OS — Focus Panel Inline Overlay Finalization

**Status:** Complete — awaiting visual sign-off (not committed). Final interaction pass before documenting and locking the Core Four.
**Constraints honored:** no new architecture, no new cards, no live data mutation.

This pass fixes the deeper-information behavior for **non-focus** (diagnostic/action)
cards and the base card surface layout.

- **Truth cards** (Household, Children) keep their **centered Focus Card** behavior.
- **Diagnostic/action cards** (Readiness, Current Work) are **compact by default** and reveal deeper evidence as a **card-anchored inline overlay** — a dropdown that **covers the card below without moving it**. Not a modal, not a Focus Card, not route navigation.
- Base surface: **white-on-white**, locked spacing tokens, **natural card heights** (puzzle pieces, not forced equal columns).

---

## Deliverables

### Operator route (real record `lifecycle-lead / 123 main street Family`)

| # | Deliverable | Screenshot | Verified |
| --- | --- | --- | --- |
| 1 | Base Work surface | `10-operator-base.png` | Four compact, white-on-white cards |
| 2 | Readiness collapsed | `11-operator-readiness-collapsed.png` | Headline + gauge + count + `View readiness →` — **no checklist** |
| 3 | Readiness inline overlay (covers, not moves) | `12-operator-readiness-overlay.png` | Children card below stays put (`top 735 → 735`); no scrim |
| 7 | Readiness → Children handoff | `13-operator-readiness-to-children.png` | Children becomes centered Focus Card |
| 4 | Current Work inline overlay | `14-operator-current-work-overlay.png` | Overlay flips up (bottom card); `Household →` handoff; no scrim |
| 5 | Household Focus Card | `15-operator-household-focus.png` | Centered + enlarged; `← Back to panel` |
| 6 | Children Focus Card | `16-operator-children-focus.png` | Centered child detail |
| 8 | Back / click-out | `17-operator-back-to-base.png` | Base identical; record still open (`scrimAfterDismiss: 0`) |

Operator state (`_operator-state.json`):

```json
{
  "readinessChecklistVisibleCollapsed": 0,
  "readinessOverlayOpen": 1,
  "readinessScrim": 0,
  "belowCardBeforeTop": 735,
  "belowCardAfterTop": 735,
  "readinessHandoffElevated": "children",
  "currentWorkOverlayOpen": 1,
  "currentWorkScrim": 0,
  "householdElevated": "household",
  "childrenElevated": "children",
  "scrimAfterDismiss": 0
}
```

### Dev harness (fixture data, deterministic assertions)

| Shot | What it shows |
| --- | --- |
| `01-base-surface.png` | White-on-white canvas; compact Readiness + Current Work |
| `02-readiness-collapsed.png` | Readiness 2-second answer only |
| `03-readiness-overlay-covers.png` | Overlay covers Current Work below — top `587 → 587` (unmoved) |
| `04-current-work-overlay-covers.png` | Current Work overlay; no card pushed |
| `05-household-focus.png` | Household centered Focus Card |
| `06-children-focus.png` | Children centered Focus Card |
| `07-readiness-to-children.png` | Factor in overlay → Children Focus Card |
| `08-back-to-base.png` | Overlay closed via ESC; surface intact |

Dev state (`_dev-state.json`): `belowCardMoved: false`, `readinessScrim: 0`, `currentWorkScrim: 0`, all elevations correct.

---

## How the base surface stays intact

The inline overlay is **card-local**: it does not use the host depth layer (no
`reportPerspective`, no `activeDepth`, no scrim).

1. The diagnostic-card wrapper (normally `display: contents`) becomes a real
   positioning anchor on the Summary surface (`display: block; position: relative`) —
   set always, so opening the overlay never toggles layout.
2. The overlay is `position: absolute; top: 100%` — it leaves the grid flow entirely,
   so **no row reflows and no neighbour resizes**. The card footprint is unchanged.
3. When open, the card lifts to `z-index: 40` so the overlay paints **over** the card
   below it.
4. Bottom-card safety: if a downward dropdown would fall off-screen, it **flips
   upward** (`data-overlay-direction="up"`).

Proof: the card below is measured before/after opening — its `top` is identical
(operator `735 → 735`, dev `587 → 587`).

---

## Card behavior

| Card | Type | Collapsed default | `View →` | Handoff |
| --- | --- | --- | --- | --- |
| Household | Truth | Contact + counts | **centered Focus Card** | child → Children Focus Card |
| Children | Truth | Roster | **centered Focus Card** | — (owns truth, edit-ready) |
| Readiness | Diagnostic | Verdict + gauge + count | **inline overlay** (factor list) | factor → Children/Household Focus Card |
| Current Work | Action | Primary item + due | **inline overlay** (queue) | item → owner Focus Card |

---

## Spacing system (tokens)

Defined in `:root` and used consistently:

```css
--alloy-os-fp-pad: 16px;            /* panel inner padding */
--alloy-os-fp-gap-x: 12px;          /* card gap horizontal */
--alloy-os-fp-gap-y: 12px;          /* card gap vertical */
--alloy-os-fp-card-radius: 14px;
--alloy-os-fp-overlay-offset: 6px;  /* card → overlay gap */
--alloy-os-fp-overlay-shadow: …;    /* soft dropdown elevation */
--alloy-os-fp-focus-shadow: …;      /* centered Focus Card elevation */
```

Base surface is **white-on-white** (the gray/blue canvas tint was removed), cards take
their **natural height** (`align-items: start` — supporting cards are not stretched to
match Children).

---

## Navigation language

- Collapsed deeper links (right, `→`): `View readiness →`, `View →`, `View household →`, `View children →`.
- Overlay close (left, `←`): `← Close`.
- Handoff pointers (right, `→`): `Children →`, `Household →`.
- Focus Card footers: `← Back to panel`, `← All children`, `Set program →`.

No large edit buttons; one consistent size/weight/color.

---

## Files changed

| File | Change |
| --- | --- |
| `web/components/admin/focusPanel/cards/CardInlineOverlay.tsx` | **New** — card-anchored dropdown (ESC + click-out, flip-up) |
| `web/components/admin/focusPanel/cards/ReadinessCard.tsx` | Compact default + inline overlay (factor list + handoffs) |
| `web/components/admin/focusPanel/cards/CurrentWorkCard.tsx` | Compact default + inline overlay (queue + owner handoffs) |
| `web/app/adminV2/components/alloyOsRuntime.css` | Spacing tokens, white-on-white base, natural heights, overlay styles |
| `web/playwright/tests/focus-panel-inline-overlay.spec.ts` | **New** — 8 deliverables + covers-not-moves assertions |
| `docs/sprints/06_2026/focus-panel-inline-overlay-finalization/README.md` | This document |

Truth-card Focus Card behavior (`HouseholdCard`, `ChildrenCard`, the host depth
layer, the soft-glass scrim) is **unchanged** — verified, not regressed.

---

## Tests run

```bash
cd web && node_modules/.bin/tsc --noEmit            # no new errors in this surface
cd web && node_modules/.bin/vitest run tests/adminV2/runtime/focusPanelCanvasFinalization.test.ts   # 7 passed
cd web && node_modules/.bin/playwright test playwright/tests/focus-panel-inline-overlay.spec.ts      # dev passed
cd web && PLAYWRIGHT_OVERLAY=1 node_modules/.bin/playwright test playwright/tests/focus-panel-inline-overlay.spec.ts  # operator passed
```

`tsc` reports ~85 pre-existing errors elsewhere (other agents' in-flight work) — none
in the focus-panel surface.

---

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| Readiness collapsed by default | ✅ `readinessChecklistVisibleCollapsed: 0` |
| Current Work compact by default | ✅ |
| Readiness expands as inline overlay, not Focus Card | ✅ `readinessScrim: 0` |
| Current Work expands as inline overlay, not Focus Card | ✅ `currentWorkScrim: 0` |
| Overlays cover content below instead of pushing it | ✅ below-card `top` unchanged |
| Base surface never reflows | ✅ measured |
| Household/Children retain centered Focus Card | ✅ `householdElevated`/`childrenElevated` |
| Links consistent | ✅ |
| Layout feels like puzzle pieces | ✅ natural heights + locked gutters |
| Background white-on-white | ✅ canvas tint removed |
| Premium, calm, cohesive | ✅ (visual sign-off pending) |

---

## Ready for documentation lock?

**Yes, pending your visual sign-off.** All acceptance criteria pass on the real
operator route. The remaining out-of-scope item is wiring **live mutation** into the
Children edit-ready state (still a non-mutating preview).

> Note: the prior `focus-panel-canvas-finalization` spec/screenshots predate this
> change (diagnostic cards no longer expose base-card factors); the inline-overlay
> spec here supersedes them for diagnostic-card behavior.
