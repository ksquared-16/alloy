# Presentation Runtime V2 — Focus Panel Surface Composer Closeout

**Status:** Closeout (July 2026)  
**Branch (ship):** `feat/focus-panel-surface-composer` (from `origin/staging` @ `c370469cd`)  
**Companion doctrine:**
[`../operator/focus-panel-composition-v2-and-editing.md`](../operator/focus-panel-composition-v2-and-editing.md) ·
[`surface-composer.md`](./surface-composer.md)

---

## What shipped

Runtime-shaped Focus Panel Surface Composer with nested drill-in editing, publish → runtime
parity for Household / Children / Emergency / child edit, date doctrine, Activity prewarm, and
inline header close removed on `/workspace/work-unit`.

Queue Row builder remains **frozen / untouched**.

---

## Surface Composer runtime-edit model

- Composer wraps the same runtime card renderer as `/work-unit` (`FocusPanelCardRenderer` /
  `FocusPanelRuntimeComposerCanvas`).
- Edit Mode is an **overlay**: grips, section reorder, field policy, add field/section —
  not a replacement layout.
- Nested configs persist on Focus Panel summary `metadata.nestedSurfaces[surfaceId]` and are
  reconciled on read/publish (`reconcileNestedSurfaceConfig`).

---

## Focus Panel runtime parity

| Area | Behavior |
|------|----------|
| Header | `hideClose` on inline work-unit + composer; identity/pills left-aligned |
| Household drill-in | Primary → Other Parent (when present) → Additional → Emergency (if enabled) → Children; pin + reorder rules |
| Emergency empty | Actionable `Add emergency contact →` → existing relationship modal |
| Children roster | Staging `ChildrenCard` summary meta (`childRosterMeta`); nested roster field keys remain configurable |
| Child edit | Staging `ChildFocusEdit` → `saveInquiryChild` (identity + participation). Not rewritten in this PR |
| Dates | `focusPanelDateDisplay` — human-readable date + derived age |
| Activity | Idle prewarm of Activity metadata for faster Work → Activity switch |

---

## Household drill-in behavior

- Required groups survive emergency-only / sparse published configs via reconcile +
  `householdDrillInGroups`.
- Primary Contact and Other Parent / Guardian stay pinned; Additional / Emergency / Children
  reorderable (Children may appear before Emergency).
- Contact edit continues through person PATCH; empty Emergency opens `add_emergency_contact`.

---

## Known intentional limitations

1. Child edit/save remains **staging-owned** (`ChildFocusEdit` / `saveInquiryChild`). This PR
   does not include `ChildEnrollmentEdit`.
2. Further evidence-surface / roster collapsed-details polish likely.
3. Browser QA after staging deploy still required (empty emergency modal, child save, date
   render, Children-before-Emergency, no header X).
4. Pre-existing Focus Panel composer test failures (if still red on staging) are **not**
   attributed to this work unless behavior regresses:
   - `compact header removes close button`
   - `inline focus panel prewarms activity mode`

---

## Files / areas touched

- `web/components/admin/focusPanel/**` (runtime composer canvas, drill-in overlays, Household
  card) — **not** `ChildrenCard` / `ChildFocusEdit` (staging ownership)
- `web/components/presentation/workUnit/InlineOpportunityFocusPanel.tsx`
- `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx`
- `web/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx`
- `web/lib/adminV2/runtime/focusPanel/**` (evidence, mutation, date display, activity prewarm)
- `web/lib/adminV2/settings/surfaces/**` (composer context, nested model, section order/policy)
- `web/lib/platform/surfaceComposition/**` (household surface group order)
- `web/app/adminV2/components/alloyOsRuntime.css`
- Docs: this closeout · focus-panel composition Final Doctrine · surface-composer parity section
- Tests: `focusPanelDrillInComposition`, `focusPanelDateDisplay`, household/children evidence,
  lifecycle wiring, mutation

**Explicitly excluded from this ship:** settings route move
(`web/app/adminV2/settings` → `web/app/settings`), analytics/config test path churn, Queue Row
builder files.

---

## Tests run

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- \
  tests/adminV2/runtime/focusPanelDateDisplay.test.ts \
  tests/adminV2/runtime/householdCardEvidence.test.ts \
  tests/adminV2/runtime/childrenCardEvidence.test.ts \
  tests/adminV2/runtime/focusPanelDrillInComposition.test.ts \
  tests/adminV2/runtime/focusPanelCardLifecycleWiring.test.tsx \
  tests/adminV2/runtime/focusPanelMutation.test.ts
```

(Results recorded in the integration PR body after final green run on this branch.)

---

## Manual QA checklist

- [ ] `/settings/surfaces` → Enrollment Focus Panel composer opens
- [ ] Composer Edit Mode overlays runtime (no separate layout)
- [ ] `/workspace/work-unit` Focus Panel header has **no** close X
- [ ] Household drill-in: Primary + Other Parent + Emergency + Children
- [ ] Empty Emergency → **Add emergency contact →** opens relationship modal
- [ ] Children collapsed **View details →** shows configured fields
- [ ] Child Edit → DOB / start / schedule save; Program/Room/Teacher show Domain-locked
- [ ] Dates human-readable (e.g. `Mar 3, 2020 · 6y`, not ISO)
- [ ] Children section order before Emergency reflects publish
- [ ] Activity tab feels warm after idle / panel open
- [ ] Settings → Fields (Data Model) still loads (`/settings/fields`)

---

## Follow-up backlog

1. Program / schedule catalog pickers in Focus Panel child edit (unlock Program).
2. Browser QA pass on staging after deploy.
3. Evidence empty-state CTA polish beyond Emergency if needed.
4. Separate PR for any intentional settings route cleanup (not part of this closeout).
5. Reconcile any remaining Field platform availability copy in Surface Composer libraries
   with `focusPanelFieldAvailability.ts` (Fields Review ownership).
