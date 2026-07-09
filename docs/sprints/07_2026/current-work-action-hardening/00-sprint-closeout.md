# Current Work + Action System Hardening — Sprint Closeout

**Sprint:** July 2026  
**Status:** **Ready for Product QA**  
**Merged:** PR [#111](https://github.com/ksquared-16/alloy/pull/111) → `staging`  
**Merge commit:** `da8a82c30d3d6162c684e50dfe455f783be82e84`  
**Staging HEAD:** `da8a82c30d3d6162c684e50dfe455f783be82e84`

---

## Ready for staging QA

PR #111 is merged. Staging is the QA target for the Current Work hardening stream (published operating-plan wiring, checklist truth resolution, supporting action slide-in panel with Schedule Tour proof).

### CI status (pre-merge, PR #111)

| Check | Result |
|-------|--------|
| Web typecheck | pass |
| Vercel – workwithalloy | pass |
| Vercel – firefly-early-learning | pass |
| Vercel Preview Comments | pass |

### Post-merge validation (staging @ `da8a82c30`)

```bash
cd web && NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit   # exit 0
cd web && npm run test -- \
  tests/adminV2/runtime/resolveCurrentWorkActionSurface.test.ts \
  tests/adminV2/runtime/currentWorkCard.test.tsx \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts \
  tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts \
  tests/adminV2/runtime/projectCurrentWork.test.ts \
  tests/adminV2/runtime/currentWorkCardEvidence.test.ts \
  tests/adminV2/runtime/currentWorkPolish.test.tsx \
  tests/adminV2/runtime/filterRightRailActionsForCurrentWork.test.ts \
  tests/adminV2/runtime/deriveCurrentWorkSupportingActions.test.ts
# 59/59 passed
```

---

## Sprint goals (status)

| # | Goal | Status |
|---|------|--------|
| 1 | Harden Current Work (Summary, Focus, completion, handoffs, queue, empty states) | **Ready for Product QA** |
| 2 | Audit Action System entry points | **Complete** — see [action-system.md](../../../platform/operator/action-system.md) |
| 3 | Action Registry alignment | **Partial** — category-backed CW policy; inline panel resolver started |
| 4 | Cross-domain readiness | **Partial** — published-plan + checklist truth; billing fixture covered in tests |
| 5 | Documentation | **Complete** — canonical action-system doc + current-work-surface updates |
| 6 | Refactoring | **Partial** — centralized CW action policy + surface VM layer |

---

## What shipped in PR #111

### Phase 1 — Published operating plan + checklist truth

- `resolvePublishedStageInputsForCurrentWork` — reads lifecycle builder metadata
- `resolveCurrentWorkTemplateFromPublishedPlan` — adapts to Current Work overlay
- `resolveCurrentWorkChecklistTruthFromPublishedRules` — field-rule completion from record/readiness truth
- `buildCurrentWorkSurfaceVM` — config-first VM with stage-runtime fallback
- Enrollment + billing fixtures and operational surface tests (18 tests)

### Phase 2 — Supporting action slide-in panel

- `resolveCurrentWorkActionSurface` — `inline_form` | `communications_composer` | `header_delegate` | `unsupported`
- `CurrentWorkActionPanel` — focused-view shell inside Current Work
- Schedule Tour proof — embedded `OpportunityTourScheduleActionModal` (`variant="embedded"`)
- Post-success: panel close + `adminv2:opportunity-updated` refresh path
- `FocusPanelCardRenderer` passes `mutation` to `CurrentWorkCard`

### Policy + docs

- `currentWorkActionSurfacePolicy.ts` — cross-domain action competition
- `docs/platform/operator/action-system.md` — canonical Action System inventory

---

## Known follow-up (post-QA — do not start until feedback)

- Email inline action panel
- SMS inline action panel
- Send Packet inline action panel
- BOS recommendation widget
- Action icons polish

Additional engineering backlog (unchanged):

- Queue row registry actions on Presentation V2 condensed rows
- Single unified action resolver for work-unit rail + drawer VM
- Operating-plan publish reconciliation job
- Remove legacy manage-key compat when overflow placement is universal

---

## Architecture audit summary (confirmed)

```
Current Work  →  operational progression (stage-work runtime + published plan overlay)
Actions       →  execution layer (registry + placements + inline panel resolver)
Manage        →  administrative catalog slice (overflow slot)
Right rail    →  assistive inventory (demoted when CW owns completion)
BOS           →  assist only (no outcome bypass)
```

---

## Suggested QA entry points

1. Open an enrollment opportunity on a stage with published operating plan (e.g. Lead / Tour stage).
2. Focus Panel → Work mode → Current Work card.
3. Summary: verify progress, checklist, helpful actions.
4. Details → Focus: verify primary action, helpful actions grid, other paths, outcome picker.
5. Schedule Tour helpful action → inline panel → save → verify refresh without page reload.

---

## Sprint completion

**Not complete.** Marked **Ready for Product QA** pending manual staging verification and product feedback.
