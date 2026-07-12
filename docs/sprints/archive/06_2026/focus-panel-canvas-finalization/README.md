# Alloy OS — Focus Panel Depth & Motion Final Pass

**Status:** Depth & motion pass complete — awaiting visual sign-off (not committed).
**Constraints honored:** no new architecture, no new primitives, no new cards, no Experience Builder work, no live mutation wiring.

This pass enforces the canvas rule as **product behavior**, not just positioning:

- **The base Work surface never moves.** Deeper states are an overlay layer only.
- **Truth cards** (Household, Children) elevate into a centered Focus Card with zoom motion.
- **Diagnostic cards** (Readiness, Current Work) never become Focus Cards — they show actionable rows in the base card and **hand off** to the owner truth card.
- **Soft-glass scrim** replaces the heavy gray modal veil.
- **240ms ease-out zoom** from the card's origin toward center (position-aware via `--fp-from-*`).

---

## 0. Deliverables — operator route (real record)

Record: `lifecycle-lead / 123 main street Family` (`_operator-state.json`).

| # | Deliverable | Screenshot | Verified |
| --- | --- | --- | --- |
| 1 | Base Work panel | `10-operator-base.png` | Four cards on one canvas; Readiness shows open factors inline; no overlay |
| 2 | View Household focus | `20-operator-view-household.png` | Household centered + enlarged; soft-glass scrim; `← Back to panel` |
| 3 | Household child → Children | `21-operator-household-child-children.png` | Children centered; Household receded; `Set program →` |
| 4 | Readiness factor → Children | `22-operator-readiness-children.png` | Readiness stays diagnostic (blurred behind); Children elevated |
| 5 | Children edit-ready | `23-operator-children-edit.png` | Same centered Focus Card; label/value edit preview; `← Back to Jonny` |
| 6 | Back to panel | `24-operator-back-to-base.png` | ESC returns to base identical to `10` (`scrimAfterDismiss: 0`) |

Dev harness (fixture data, same rules):

| Shot | What it shows |
| --- | --- |
| `01-canvas-baseline.png` | Base canvas — Readiness shows open factors + `Children →` pointers in place |
| `02-children-centered-focus.png` | Children truth card — soft-glass scrim, zoom focus, directional footer |
| `03-readiness-handoff.png` | Readiness factor click → Children centered (Readiness never elevates) |
| `04-household-centered.png` | View household → Household centered Focus Card |
| `05-household-to-children-centered.png` | Household child click → Children centered |

---

## 1. How the base surface stays intact

Three mechanisms work together — no row reflow, no masonry, no pushing cards down:

1. **Truth cards never expand inline.** Household and Children report `focused` (elevated) for *any* open state — expanded roster, focused child, or edit. The card lifts out of its cell; the cell keeps its slot.
2. **Diagnostic cards never expand inline either.** Readiness and Current Work are always `density: compact` at base. Open factors / next work items render in the base card footprint; clicking hands off via `requestFocus` to the owner truth card.
3. **Height reservation + absolute overlay.** While the canvas is at rest, `FocusPanelCardGrid` measures each cell's natural height. When a card elevates, that cell gets `minHeight: reserved` so the row cannot collapse. Only the `.alloy-os-ucard` lifts (`position: absolute; z-index: 60`) over the soft-glass scrim (`z-index: 55`). Neighbour cells dim (`opacity + saturate`) but **do not transform or move**.

On dismiss (ESC / click-out), the card returns and the reserved height releases — the canvas is identical to before focus.

---

## 2. Motion & visual treatment

| Element | Treatment |
| --- | --- |
| Scrim | `rgba(248,250,252,0.5)` + `blur(8px) saturate(0.85) brightness(1.02)` — light frosted veil, not gray modal |
| Receded cards | `opacity: 0.5; saturate(0.72)` — dim only, no transform |
| Focus Card | Centered in canvas, `min(560px)`, `border-radius: 20px`, premium shadow + pine ring |
| Transition | `240ms cubic-bezier(0.22, 0.61, 0.36, 1)` — `alloy-os-fp-card-zoom` from `--fp-from-x/y/scale` measured at elevation time |
| Navigation | One footer row: **left = back (`←`)**, **right = deeper (`→`)**, same size/weight/color everywhere |

---

## 3. Card rules (implemented)

| Card | Role | Depth behavior |
| --- | --- | --- |
| Household | Truth | `View household →` elevates; child click hands off to Children (Household collapses to base footprint) |
| Children | Truth | Roster expand / child focus / edit all elevate as centered Focus Card |
| Readiness | Diagnostic | Open factors shown in base card; factor click → `requestFocus("children", …)` — never elevates |
| Current Work | Diagnostic | Next items shown in base card; item click → owner handoff — never elevates |

### Card relationship map

| Source | Interaction | Result |
| --- | --- | --- |
| Household → child | click a child (belonging-only) | **Children** centered Focus Card on that child |
| Readiness → "Program/Schedule/Desired start" | click factor | **Children** centered Focus Card (Readiness stays diagnostic behind scrim) |
| Current Work → "Contact family / call / email" | click item | **Household** Focus Card (primary contact) |
| Current Work → "program / enrollment / schedule" | click item | **Children** Focus Card |
| Children (truth) | focus a child → deeper | centered Focus Card → edit-ready |

---

## 4. Tests run

```bash
cd web && node_modules/.bin/vitest run tests/adminV2/runtime/focusPanelCanvasFinalization.test.ts
# 7 passed

cd web && PLAYWRIGHT_CANVAS=1 node_modules/.bin/playwright test playwright/tests/focus-panel-canvas-finalization.spec.ts
# dev + operator deliverables passed
```

Operator state (`_operator-state.json`):

```json
{
  "viewHouseholdElevated": "household",
  "householdChildElevated": "children",
  "readinessHandoffElevated": "children",
  "editElevated": "children",
  "scrimAfterDismiss": 0
}
```

Scoped `tsc` over focus-panel files: **clean**. Full repo `tsc` reports ~85 pre-existing errors from concurrent in-flight work — none in this surface.

---

## 5. Files changed (this pass)

| File | Change |
| --- | --- |
| `web/components/admin/focusPanel/cards/HouseholdCard.tsx` | Elevate on any open state; `← Back to panel`; collapse on child handoff |
| `web/components/admin/focusPanel/cards/ChildrenCard.tsx` | Elevate on expanded/focused/edit; `← Back to panel` when expanded |
| `web/components/admin/focusPanel/cards/ReadinessCard.tsx` | Diagnostic-only: open factors in base, hand off, no expand/focus local state |
| `web/components/admin/focusPanel/cards/CurrentWorkCard.tsx` | Diagnostic-only: next items in base, hand off, no expand/focus local state |
| `web/components/admin/focusPanel/FocusPanelCardGrid.tsx` | Position-aware zoom motion (`--fp-from-*` measured at elevation) |
| `web/app/adminV2/components/alloyOsRuntime.css` | Soft-glass scrim, `alloy-os-fp-card-zoom` keyframe, 240ms timing |
| `web/playwright/tests/focus-panel-canvas-finalization.spec.ts` | Six deliverable screenshots + assertions |
| `docs/sprints/archive/06_2026/focus-panel-canvas-finalization/README.md` | This document |

---

## Prior pass notes (positioning fix)

The first canvas pass was rejected for weak visual hierarchy. Root cause: the panel
content lives inside a `container-type: inline-size` element, which broke
viewport-anchored `position: fixed`. The overlay is now **anchored to the grid
(`position: absolute`) and centered**, which is robust in both operator and dev.

Recovery note: prior depth work was surgically restored from stash before this pass.

Earlier screenshot numbering (`11`–`13`, `before-*`) remains in the folder for delta
comparison but is superseded by the deliverable set above (`20`–`24`).

---

## Recommendation

**Ready for visual sign-off** on the depth & motion pass.

The canvas rule now holds as product behavior on the real operator path: truth cards
zoom into focus, diagnostic cards coordinate without ever becoming Focus Cards, the
soft-glass treatment reads as "zoomed into this answer" not "modal opened", and ESC /
click-out return to an unchanged base surface.

The remaining open item is intentionally out of scope: wiring **live mutation** into
the edit-ready Focus Card depth (currently a non-mutating placeholder).
