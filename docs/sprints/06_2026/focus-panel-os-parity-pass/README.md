# Alloy OS — Focus Panel OS Parity Pass

**Status:** Implemented · not yet committed (per sprint instruction)
**Scope:** Visual parity, focus behavior, and real operator usability. No new
architecture, primitives, cards, routes, drawers, or card-local fetches.

This pass closes the gap between the runtime Focus Panel and the approved mocks.
The Core Four already existed and were coherent; here they are made to **feel** like
one operating system — calmer chrome, real in-panel focus, depth-based expansion, an
edit-ready surface, and a simplified header + mode model.

---

## What changed (by problem)

### 1. Runtime cards look premium, not sloppy

`web/app/adminV2/components/alloyOsRuntime.css` (Parity Pass block):

- **Title / answer hierarchy** — the card title is now a quiet uppercase category
  label (`HOUSEHOLD`, `READINESS`, …) and the **answer line owns the weight** (14px,
  midnight). Applied uniformly across all tiers including metric (Readiness) and the
  Current Work key.
- **Spacing / rhythm** — normalized header / body / footer padding for a steady
  vertical rhythm; hairline separators between evidence blocks only.
- **Calmer chrome** — softened borders and icon tile; footers demoted to quiet links.

See `01-overview-baseline.png` and the live `06-operator-focus-panel.png`.

### 2. Focus is visually real (in-panel depth)

Clicking a Readiness factor no longer just opens a section lower down. The owner card
**comes forward** and the rest of the surface **recedes**:

- New `FocusPanelCoordination.reportPerspective` + `activeDepth` (orchestration, not a
  primitive) in `focusPanelCoordination.ts`.
- The host (`OpportunityFocusPanelModeGrid`) tracks which card is "deep"
  (`focused` / `edit`) and marks that grid cell elevated; `FocusPanelCardGrid` sets
  `data-fp-depth="active"` + `data-fp-elevated="true"`.
- CSS raises the elevated card (Bend Pine ring + lifted shadow) and recedes siblings
  (opacity / desaturate / pointer-events off).

See `02-depth-focus-children.png` — Readiness → Children focus, Children raised, the
rest dimmed behind it.

### 3. Expansion uses depth, not page-stretch

Overview → Evidence → **Focused** → **Edit** are reported as depth levels. The two deep
levels elevate the card above the grid in place — base cards stay put, nothing jumps
to a route, drawer, or disconnected modal. Back actions return to the base surface.

### 4. Editing is represented

`web/components/admin/focusPanel/cards/CardEditPlaceholder.tsx` — a reusable,
**non-mutating** edit-ready surface. From a focused child you can open
*Edit program / schedule* and see real edit fields (Program / Room / Schedule /
Desired start), a disabled Save, and a clear "Preview only — editing isn't wired yet."
notice. This validates how edit *feels* and marks the seam for live mutation later.

See `03-edit-ready.png`.

### 5. Household and Children coherence

- **Household = belonging / reachability.** Its children rows are name-only and now
  carry an explicit caption: *"Belonging only — open Children for enrollment detail."*
- **Children = operational truth** (program / schedule / status / start).
- Clicking a child in Household performs a **cross-card handoff** to the Children card
  (Perspective Change, no fetch), which focuses that child. Each Household child row
  shows a `Children →` pointer.

See `04-household-to-children.png`.

### 6. Mode labels cleaned up

Temporary two-mode model: **Work** (the Core Four operating surface) + **Activity**.

- `summary` mode now reads as **"Work"** (operators operate here).
- The legacy split **Work** mode is **merged / hidden** — it was duplicative; the
  cards own overview/evidence/focus/edit themselves, so a third tab added noise.
- `FOCUS_PANEL_SWITCH_MODES = ["summary", "activity"]` drives the switch; the legacy
  `work` mode still renders if reached but is no longer a tab, and unknown drawer tabs
  now route to Work instead of the split view.

Live proof (`_operator-state.json`): `modeLabels: ["Work", "Activity"]`.

### 7. Header mission removed

The stale "Mission: review inbound lead…" row is gone. The header now carries only
subject identity + read-only context chips (status / process / location) + BOS /
Manage. The operating cue belongs to the **Current Work** card, so the header no
longer competes with the cards.

Live proof (`_operator-state.json`): `missionPresent: false`. See
`07-operator-header-modes.png`.

---

## Files changed

**Runtime / orchestration**
- `web/lib/adminV2/runtime/focusPanel/focusPanelCoordination.ts` — depth level types,
  `activeDepth`, `reportPerspective`, `isElevatedLevel`, `useReportPerspective` hook.
- `web/lib/adminV2/runtime/focusPanel/focusPanelMode.ts` — `summary` → "Work" label,
  `FOCUS_PANEL_SWITCH_MODES`, legacy-tab default routes to Work.
- `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` — depth state +
  `elevatedCellKey` plumbing.
- `web/components/admin/focusPanel/FocusPanelCardGrid.tsx` — `data-fp-depth` /
  `data-fp-elevated`.

**Cards**
- `cards/ChildrenCard.tsx` — depth reporting, edit-ready state + trigger.
- `cards/HouseholdCard.tsx` — depth reporting, belonging-only caption, child → Children
  handoff with `Children →` pointer.
- `cards/CurrentWorkCard.tsx`, `cards/ReadinessCard.tsx` — depth reporting.
- `cards/CardEditPlaceholder.tsx` — **new**, non-mutating edit surface.

**Header / mode switch**
- `FocusPanelModeSwitch.tsx` — two-mode switch.
- `FocusPanelSubjectIdentityBlock.tsx`, `FocusPanelCompactHeader.tsx`,
  `OpportunityFocusPanelHeader.tsx` — mission removed.

**Styling**
- `web/app/adminV2/components/alloyOsRuntime.css` — Parity Pass block (depth layer,
  edit UI, household handoff, title/answer hierarchy, rhythm).

**Harness / tests / docs**
- `web/app/dev/household-card-verify/HouseholdCardVerify.tsx` — depth wired for capture.
- `web/playwright/tests/focus-panel-os-parity-pass.spec.ts` — **new** capture spec.
- `web/tests/adminV2/runtime/opportunityFocusPanelActivation.test.ts`,
  `web/tests/adminV2/runtime/focusPanelPolish.test.ts` — updated for the new
  mode/header contract.

---

## Visual parity notes vs approved mocks

| Mock intent | Runtime now |
| --- | --- |
| Quiet category label, loud answer | ✅ uppercase title, 14px answer |
| Calm borders / demoted footer | ✅ hairlines, link-style footer |
| One focused answer brought forward | ✅ in-panel depth elevation + recede |
| Belonging vs operational split | ✅ Household caption + Children handoff |
| Two clear modes | ✅ Work / Activity |
| Uncluttered header | ✅ mission removed |

Remaining nuance: a small number of records carry imperfect source data (e.g. a
primary-contact name that is actually an address). That is data, not layout, and is out
of scope for this pass.

---

## Screenshots

Dev harness (real components, fixture data):
- `01-overview-baseline.png` — calm Core Four composition.
- `02-depth-focus-children.png` — Readiness → Children focus (depth layer).
- `03-edit-ready.png` — focused child → edit-ready surface.
- `04-household-to-children.png` — Household child → Children focus handoff.

Live operator path (authenticated work-unit record):
- `05-operator-full-page.png`, `06-operator-focus-panel.png` — real surface.
- `07-operator-header-modes.png` — simplified header + Work / Activity switch.
- `_operator-state.json` — `modeLabels: ["Work","Activity"]`, `missionPresent: false`.

---

## Tests run

- `tsc --noEmit` — clean for all parity-pass files (pre-existing errors in unrelated
  `scripts/**` and `tests/admin/**` in-progress work are not introduced here).
- Targeted vitest (mode, activation, polish, evidence builders) — **all pass**.
- Capture spec dev tests pass; live operator capture confirms mode labels + no mission.
- Pre-existing failures in `workspaceLayoutSurface.test.ts`,
  `adminV2RuntimeContract.test.ts`, `focusPanelSummaryDocOps.test.ts`,
  `focusPanelCardPresentation.test.ts` were verified to fail identically with this
  pass stashed — **not introduced here**.

Re-capture live: `PLAYWRIGHT_PARITY=1 npx playwright test focus-panel-os-parity-pass --project=chromium`
