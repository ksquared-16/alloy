# Current Work + Action System Hardening — Sprint Closeout

**Sprint:** July 2026  
**Status:** **READY FOR PRODUCT QA**  
**Merged:** PR [#111](https://github.com/ksquared-16/alloy/pull/111) + PR [#117](https://github.com/ksquared-16/alloy/pull/117) → `staging`  
**Merge commit (QA pass):** `c2671ea7b` — Merge PR #117  
**Staging HEAD:** `c2671ea7b`

---

## Ready for Product QA

The Current Work hardening stream is on staging and ready for manual Product QA.

### Promotion summary

| Phase | PR | Commit | Scope |
|-------|-----|--------|-------|
| Phase 1 — Published plan + checklist truth + action panel | [#111](https://github.com/ksquared-16/alloy/pull/111) | `da8a82c30` | Operating-plan wiring, checklist truth, Schedule Tour slide-in panel |
| Phase 2 — QA hardening pass | [#117](https://github.com/ksquared-16/alloy/pull/117) | `c2671ea7b` | Builder parity, field labels, activity preview, alternate-path merge, visual polish |

### CI status (PR #117, pre-merge)

| Check | Result |
|-------|--------|
| Web typecheck | pass |
| Vercel – workwithalloy | pass |
| Vercel – firefly-early-learning | pass |
| Vercel Preview Comments | pass |

### Post-merge validation (staging @ `c2671ea7b`)

```bash
cd web && NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit   # exit 0

cd web && npm run test -- \
  tests/adminV2/runtime/currentWorkCard.test.tsx \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts \
  tests/adminV2/runtime/resolveCurrentWorkActionSurface.test.ts \
  tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts \
  tests/adminV2/runtime/projectCurrentWork.test.ts \
  tests/adminV2/runtime/currentWorkCardEvidence.test.ts \
  tests/adminV2/runtime/currentWorkPolish.test.tsx \
  tests/adminV2/runtime/filterRightRailActionsForCurrentWork.test.ts \
  tests/adminV2/runtime/deriveCurrentWorkSupportingActions.test.ts \
  tests/adminV2/runtime/resolveCurrentWorkFieldRuleDisplayLabel.test.ts \
  tests/adminV2/runtime/focusPanelSummarySurfaceEditor.test.tsx \
  tests/adminV2/runtime/focusPanelRuntimeParity.test.ts \
  tests/adminV2/runtime/focusPanelMode.test.ts
# 88/88 passed
```

---

## Sprint goals (status)

| # | Goal | Status |
|---|------|--------|
| 1 | Harden Current Work (Summary, Focus, completion, handoffs, queue, empty states) | **READY FOR PRODUCT QA** |
| 2 | Audit Action System entry points | **Complete** — see [action-system.md](../../../platform/operator/action-system.md) |
| 3 | Action Registry alignment | **Partial** — category-backed CW policy; inline panel resolver started |
| 4 | Cross-domain readiness | **Partial** — published-plan + checklist truth; billing fixture covered in tests |
| 5 | Documentation | **Complete** — canonical action-system doc + current-work-surface updates |
| 6 | Refactoring | **Partial** — centralized CW action policy + surface VM layer |

---

## What shipped

### PR #111 — Published operating plan + action panel

- `resolvePublishedStageInputsForCurrentWork` — reads lifecycle builder metadata
- `resolveCurrentWorkTemplateFromPublishedPlan` — adapts to Current Work overlay
- `resolveCurrentWorkChecklistTruthFromPublishedRules` — field-rule completion from record/readiness truth
- `buildCurrentWorkSurfaceVM` — config-first VM with stage-runtime fallback
- `resolveCurrentWorkActionSurface` — `inline_form` | `communications_composer` | `header_delegate` | `unsupported`
- `CurrentWorkActionPanel` — focused-view shell inside Current Work
- Schedule Tour proof — embedded `OpportunityTourScheduleActionModal` (`variant="embedded"`)

### PR #117 — QA hardening pass

- **Surface Builder parity** — `focusPanelCurrentWorkPreviewSeed` enriches demo VM; builder uses production pipeline
- **Field label resolution** — `resolveCurrentWorkFieldRuleDisplayLabel`; canonical keys never shown to operators
- **Activity preview** — `CurrentWorkActivityPreview` inline flyout; operator stays in Work mode
- **Alternate paths merge** — catalog + record-header paths merged via `mergeActionVms`
- **Visual polish** — Bend Pine record outcome, integrated status chip, spacing hierarchy

---

## Known follow-up (post-QA — do not start until feedback)

- Email inline action panel
- SMS inline action panel
- Send Packet inline action panel
- Relative activity timestamps
- Focused activity preview polish
- Action icon polish

---

## Architecture audit summary (confirmed on staging)

```
Current Work  →  operational progression (stage-work runtime + published plan overlay)
Actions       →  execution layer (registry + placements + inline panel resolver)
Manage        →  administrative catalog slice (overflow slot)
Right rail    →  assistive inventory (demoted when CW owns completion)
BOS           →  assist only (no outcome bypass)
```

**Smoke checks (staging @ c2671ea7b):**

- Config-driven surface VM (`buildCurrentWorkSurfaceVM`)
- Published operating plan adapter (`resolveCurrentWorkTemplateFromPublishedPlan`)
- Checklist truth resolver (`resolveCurrentWorkChecklistTruthFromPublishedRules`)
- Supporting + alternate path merge (`mergeActionVms`)
- Activity preview (`CurrentWorkActivityPreview`)
- Schedule Tour panel (`CurrentWorkActionPanel` + embedded modal)
- Builder/runtime parity (`focusPanelCurrentWorkPreviewSeed` + demo VM enrich)

---

## Suggested QA entry points

1. Open an enrollment opportunity on a stage with published operating plan (e.g. Lead).
2. Focus Panel → Work mode → Current Work card.
3. Summary: verify progress, checklist labels (no canonical keys), helpful actions, recent activity preview.
4. Details → Focus: verify primary action, record outcome (Bend Pine), other paths, outcome picker.
5. Schedule Tour helpful action → inline panel → save → verify refresh without page reload.
6. `/settings/surfaces` → verify Current Work card shows Contact Family (not empty placeholder).

---

## Sprint completion

**Not complete.** Marked **READY FOR PRODUCT QA** pending manual staging verification and product feedback.
