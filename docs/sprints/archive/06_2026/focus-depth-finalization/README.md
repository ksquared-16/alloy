# Alloy OS — Focus Depth Finalization Pass

**Status:** Implemented · validated on the real operator path.
**Recommendation:** Ready to commit (see "Ready to commit?" below).
**Scope:** Refines the depth/focus model only. No live mutation, no new primitives,
no new cards, no route changes.

This finalizes the in-panel depth model: a focused/edit card now **comes forward and
centers** in the Focus Panel canvas above a scrim, the rest recede behind it, and
clicking outside (or ESC) returns to the base Work surface. Focus behaves
consistently across all four cards, and the edit entry is now a directional link, not
a form button.

---

## What changed (by requirement)

### 1. Center focused cards
When a card enters **Focused** or **Edit** depth it is lifted out of the grid and
**centered within the panel band** (`position: fixed` anchored to
`--alloy-os-focus-panel-left` / `--alloy-os-op-surface-*`, with viewport fallbacks for
the dev harness). A **scrim** (`.alloy-os-fp-depth-scrim`) covers the band and recedes
the base cards behind a blur. The Focus Panel shell (subject identity + Work/Activity
switch) stays crisp above the scrim (`z-index` raised). It reads as the card *coming
forward*, not expanding inline.

- **Click outside** the focused card (the scrim is a button) → returns to base.
- **ESC** → returns to base (host keydown listener while a card is elevated).

Mechanism: a new `dismiss` signal on `FocusPanelCoordination`. The host emits it on
scrim-click / ESC; the active card resets its local state via `useDismissSignal`, then
reports `base`, which clears `activeDepth` and removes the overlay. No new primitive —
the same coordination seam as the handoffs.

### 2. Consistent focus behavior
Every card that goes deeper than **Evidence** becomes the active centered card:
Household focused group, Children focused child, Readiness handoff target, Current Work
focused item, and the Edit-ready state. Each card reports `focused` / `edit` via
`useReportPerspective`; the host centers whichever cell is active. **Evidence stays
inline** (in-place expand); only Focus/Edit uses the depth overlay.

### 3. Directional links (no edit buttons)
The boxed *"Edit program / schedule"* button is gone. Deeper actions are now
right-pointing links (`.alloy-os-card-deeper-link`):
- **right = go deeper:** `Set program →`, `Resolve schedule →`, `Edit enrollment →`
  (label names the most relevant gap).
- **left = go back:** `← All children`, `← Back to {name}`, `← All work`.
- base card links unchanged (`View children →`, `View household →`).

### 4. Household → Children handoff
Household children remain **belonging-only** (name + `Children →` pointer + caption
"Belonging only — open Children for enrollment detail"). Clicking a child focuses the
**Children** card on that child, which centers; Household recedes. No duplicate
operational child detail in Household.

### 5. Readiness → owner card handoff
Clicking **Program / Schedule / Desired start** (incomplete) hands off to **Children**,
which centers and focuses; Readiness recedes. Readiness diagnoses, Children owns the
editable truth.

### 6. Mode cleanup
Unchanged: two-mode model **Work** + **Activity**. Summary is not back.

---

## Files changed

- `lib/adminV2/runtime/focusPanel/focusPanelCoordination.ts` — `dismissed` +
  `dismiss` + `useDismissSignal`.
- `components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` — dismiss state, ESC
  listener, backdrop wiring.
- `components/admin/focusPanel/FocusPanelCardGrid.tsx` — renders the scrim backdrop +
  `onBackdropClick`.
- `components/admin/focusPanel/cards/ChildrenCard.tsx` — directional deeper-link
  (`deeperEditLabel`), dismiss reset.
- `components/admin/focusPanel/cards/HouseholdCard.tsx`,
  `cards/CurrentWorkCard.tsx`, `cards/ReadinessCard.tsx` — dismiss reset.
- `app/adminV2/components/alloyOsRuntime.css` — centered overlay + scrim + shell
  z-index + directional-link styling (replaces in-place elevation + edit-button).
- `app/dev/household-card-verify/HouseholdCardVerify.tsx` — dismiss + ESC wired for
  capture.
- `web/playwright/tests/focus-depth-finalization.spec.ts` — **new** capture spec.

---

## Click-out / back behavior

| Trigger | Result |
| --- | --- |
| Click the scrim (anywhere outside the centered card) | Active card collapses to base; overlay + scrim removed |
| Press **ESC** while a card is focused/edit | Same — returns to base Work surface |
| `← back` link inside the card | Steps one depth level back (Edit → Focused → … ) |

The base grid is untouched on return — cards are back in place, crisp, no residual
dim. (`04-click-out-base.png`; the operator base surface is `10-operator-base.png`.)

**ESC safety fix:** in the operator path the drawer has its own ESC-to-close handler.
The Focus Panel now intercepts ESC in the **capture phase** and stops propagation
*only while a card is deep*, so ESC dismisses the depth layer first and does **not**
also close the record. When no card is focused, ESC behaves normally (closes the
drawer).

## Readiness → Children walkthrough
Readiness *Program/Schedule/Desired start missing* → Children centers, focused on the
relevant child, showing the gap as a sentence and a `Set program →` / `Resolve
schedule →` deeper-link. Readiness recedes behind the scrim. Dev: `02`. Operator: `11`.

## Household → child walkthrough
Household (belonging-only) → click a child → Children centers, focused on that child.
Household recedes. Dev: `05`.

---

## Screenshots

Dev harness (real components):
- `01-overview-baseline.png` — calm base composition.
- `02-centered-focus-children.png` — Readiness → Children, **centered** over scrim.
- `03-edit-ready-centered.png` — directional link → edit-ready, centered.
- `04-click-out-base.png` — after scrim click, back to base.
- `05-household-to-children-centered.png` — Household child → Children centered.

Live operator path (authenticated work-unit record):
- `10-operator-base.png` — base Work surface (also the exact post-dismiss state).
- `11-operator-centered-focus.png` — Children **centered within the panel band**
  (between queue and BOS columns), Readiness receded, shell stable.

> The operator centered shot (`11`) was captured against `lifecycle-lead`
> (`123 main street Family`) with `centeredScrimSeen: true`. After the capture run the
> local dev server was stopped; re-running `PLAYWRIGHT_DEPTH=1 … focus-depth-finalization`
> regenerates `12-operator-back-to-base.png` (identical to `10`). The ESC capture-phase
> fix landed after the first operator run, so any earlier closed-panel artifact was
> removed.

---

## Tests run
- `tsc --noEmit` — clean for all depth-finalization files (unrelated pre-existing
  `scripts/**` + `tests/admin/**` errors are not touched).
- Targeted vitest (mode, activation, polish, evidence builders) — **58 pass**.
- Dev capture spec passes; live operator capture confirms band-anchored centering.

---

## Ready to commit?
**Yes.** The depth/focus model now matches the intended OS feel — centered focus,
recede, click-out/ESC return, consistent across cards, directional links, two-mode
shell. No live mutation was added (edit remains a clearly-labeled non-mutating
preview), no new primitives, no new cards, no route changes. The only known failing
tests in this area are pre-existing and unrelated (verified by stash baseline in the
prior pass).

Re-capture operator: `PLAYWRIGHT_DEPTH=1 npx playwright test focus-depth-finalization --project=chromium`
