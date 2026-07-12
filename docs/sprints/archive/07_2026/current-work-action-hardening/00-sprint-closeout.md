# Current Work + Action System Hardening — Sprint Closeout

**Sprint:** July 2026  
**Status:** **READY FOR PRODUCT QA**  
**Latest promotion:** PR [#169](https://github.com/ksquared-16/alloy/pull/169) → `staging`  
**Merge commit:** `4be866d1a07b6a54ee0d82310ac88ef09f2f4292`  
**Staging HEAD:** `4be866d1a07b6a54ee0d82310ac88ef09f2f4292`

---

## Action intent resolution promotion (July 11, 2026)

Configuration-driven Current Work action intent resolution is merged to staging and ready for focused product QA.

| Item | Value |
|------|-------|
| PR | [#169](https://github.com/ksquared-16/alloy/pull/169) |
| Branch | `fix/current-work-action-intent-resolution` |
| Commits | `e4a436246`, `8a2e97c7b`, `456309799` |
| Prior identity stream | PR [#168](https://github.com/ksquared-16/alloy/pull/168) (`be45c4da4`) — separate; already on staging |

### CI status (PR #169)

| Check | Result |
|-------|--------|
| Production graph (Web typecheck) | **pass** |
| Full graph (tests + scripts) | **pass** |
| Vercel – firefly-early-learning | **pass** |
| Vercel – workwithalloy | **pass** |
| Supabase Preview | skipped |

### Post-merge validation (staging @ `4be866d1a`)

```bash
cd web && NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck   # exit 0
cd web && npm run typecheck:tests                                   # exit 0
cd web && NODE_OPTIONS=--max-old-space-size=8192 npm run build      # exit 0

cd web && npm run test -- \
  tests/lifecycle/resolveActionIntentExecution.test.ts \
  tests/lifecycle/resolveCanonicalWorkTemplateActionOptions.test.ts \
  tests/lifecycle/resolveWorkTemplateActionOptions.test.ts \
  tests/lifecycle/lifecycleStageWorkTemplateActionsEditor.test.ts \
  tests/adminV2/runtime/currentWorkActionIntentResolution.test.ts \
  tests/adminV2/runtime/resolveCurrentWorkActionSurface.test.ts \
  tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts \
  tests/adminV2/runtime/buildCurrentWorkActivityPreviewItems.test.ts \
  tests/adminV2/runtime/workTemplateCurrentWorkRuntime.test.ts \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts \
  tests/adminV2/runtime/currentWorkCard.test.tsx \
  tests/lifecycle/stageTransitionReconciliation.test.ts
# 78/78 passed
```

### Architecture invariants (verified on staging source)

**Action intent**
- Work Templates store operator intent refs (`normalizeActionRefToIntentKey`, canonical editor options)
- Process configuration resolves subject grain (`resolveWorkTemplateSubjectGrain`)
- Runtime resolves concrete execution key (`resolveActionIntentExecution` → `handlerKey`)
- Duplicate waitlist variants do not appear as peer choices (`isNonCanonicalIntentAlias`, intent dedup in VM)
- Generic status umbrellas remain hidden (`currentWorkActionSurfacePolicy`, `HIDDEN_EDITOR_ACTION_KEYS`)
- Raw `mutation_command` cannot execute (`resolveCurrentWorkActionSurface` guard)

**Configuration ownership**
- Explicit Work Template config wins (`helpful_actions_explicit`, `alternate_paths_explicit`)
- `undefined` allows compatibility fallback; `[]` means explicitly show none
- Registry owns execution metadata; Work Template owns placement/order

**Activity**
- Current Work preview uses canonical Activity projection (`buildCurrentWorkActivityPreviewItems`)
- Initial click stays in Work mode; View full activity changes mode only when clicked (card tests)

**Multi-subject boundary (intentionally deferred)**
- Singular subject executes directly (`requiresSubjectPicker: false` when one applicable subject)
- Selection-required state does not silently execute (`evaluateRequiresSubjectPicker`; picker UI not shipped)
- **Do not mark multi-subject execution complete** — `resolveApplicableSubjectsForIntent` remains a stub

---

---

## Ready for Product QA (prior hardening stream)

The Current Work hardening stream (Phases 2–4, PR #155) remains merged on staging. The **action intent resolution** stream (PR #169) is the current QA focus. The broader product initiative is **not** complete until QA feedback is incorporated.

### Promotion summary

| Phase | Commits | Scope |
|-------|---------|-------|
| Phase 2 — Requirement timing | `112dbeb47`, `f3cd5f1e5` | `record_creation` vs stage-exit enforcement; Create Lead intake; transition preflight; legacy compatibility |
| Phase 3 — Work Template actions | `13b9062d6`, `962b9def9` | Explicit `primary_action`, `helpful_actions`, `alternate_paths`, `outcome_refs`; editor controls; runtime resolver with explicit-empty semantics |
| Phase 4 — Identity composition | `54bce7cd0`, `41b0d0af2`, `4709ad4bb`, `8136d8dc0`, `a7ff5b5c1`, `a2c0b1ff0` | Shared identity VM/renderer; Household + Children migration; Composer/runtime reconciliation; edit + save→refresh parity |

Prior Phase 1 work (PR #111, #117) remains on staging from earlier promotion.

### CI status (PR #155, post-push @ `a2c0b1ff0`)

| Check | Result |
|-------|--------|
| Production graph (Web typecheck) | **pass** |
| Full graph (tests + scripts / typecheck:tests) | **pass** |
| Vercel – firefly-early-learning | **pass** |
| Vercel Preview Comments | **pass** |
| Vercel – workwithalloy | **fail** (preview deploy only; GitHub Actions green) |
| Supabase Preview | skipped |

### Post-merge validation (staging @ `96ff1fc04`)

```bash
cd web && NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck
# exit 0

cd web && npm run test -- \
  tests/lifecycle/requirementTimingEvaluation.test.ts \
  tests/lifecycle/stageTransitionReconciliation.test.ts \
  tests/lifecycle/resolveWorkTemplateActionOptions.test.ts \
  tests/lifecycle/workTemplateActionRefs.test.ts \
  tests/adminV2/runtime/workTemplateCurrentWorkRuntime.test.ts \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts \
  tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts \
  tests/adminV2/runtime/deriveCurrentWorkSupportingActions.test.ts \
  tests/adminV2/runtime/identitySurfaceComposition.test.ts \
  tests/adminV2/runtime/identitySurfaceSaveRefresh.test.ts \
  tests/adminV2/nestedSurfaceEditorModel.test.ts \
  tests/adminV2/runtime/householdCardEvidence.test.ts \
  tests/adminV2/runtime/childrenCardEvidence.test.ts \
  tests/adminV2/focusPanelDrillInRuntimeParity.test.ts \
  tests/adminV2/runtime/focusPanelDrillInComposition.test.ts \
  tests/adminV2/focusPanelNestedSurface.test.ts \
  tests/adminV2/runtime/nestedSurfaceFieldLayout.test.ts \
  tests/admin/focusPanel/householdContactEditRuntime.test.tsx
# 256/256 passed
```

---

## Completed phases (on staging)

| Phase | Status |
|-------|--------|
| Phase 2 — Requirement timing + transition preflight | **Complete** |
| Phase 3 — Work Template-owned action placement | **Complete** |
| Phase 4 — Shared identity surface composition + convergence | **Complete** |

---

## Architecture smoke audit (staging source)

### Requirement timing

- `requirementTimingEvaluation.ts` — explicit `record_creation` vs stage-exit timing
- `evaluateTransitionRequirementPreflight.ts` — transition preflight without parallel engine
- Legacy rules preserved via compatibility paths; no Qualification-stage assumption required

### Work Template actions

- `resolveCurrentWorkTemplateFromPublishedPlan.ts` — template-owned `primary_action`, `helpful_actions`, `alternate_paths`
- Explicit empty arrays disable fallback (`helpful_actions_explicit`)
- `currentWorkActionSurfacePolicy.ts` — generic umbrella lifecycle actions excluded from CW completion/rail
- Action Registry owns execution metadata; raw `mutation_command` not exposed through Current Work

### Identity composition

- `household_surface` and `children_surface` canonical
- `child_surface` and `household_contact_surface` compatibility-only via `identitySurfaceCompat.ts`
- Composer and runtime share `reconcileIdentityNestedConfig` / `reconcileIdentityNestedConfigFromDocMetadata`
- Household + Children use shared composition semantics (`buildIdentityCardVM`, `IdentityFieldGrid`)
- Edit completion = save + authoritative truth refresh → VM recompose

---

## Intentional remaining domain adapters

These are domain-semantic by design — not open convergence gaps:

| Adapter | Role |
|---------|------|
| `ChildFocusEdit` | Dedicated child edit form |
| `saveInquiryChild` | Canonical child save command path |
| `ChildScheduleBlock` | Structured schedule chips in focus tier |
| `NestedSurfaceFieldLayoutSurface` | Composer builder drag layout (builder-only) |
| `InlineRuntimeFieldList` | Composer contact-edit preview chrome |
| `EvidenceGroup` | Child evidence archive section wrapper |
| `CONTACT_EDIT_FIELD_MAP` | `contact.*` → `PersonContactValues` save bridge |

---

## Manual QA entry points

1. **Create Lead** — create without child info; verify stage-exit requirements appear after creation, not at intake.
2. **Current Work** — primary action from Work Template; helpful actions order; empty groups stay empty; no generic enrollment status umbrella.
3. **Household card** — primary/secondary contacts, children section, field order, two-column layout, View details, editable save + refresh.
4. **Children card** — configured fields, edit policies, expanded evidence, save refresh.
5. **Surface Builder** — legacy layout load, Composer preview matches runtime, Add Field survives publish/reload.

See QA checklist in promotion report for full checkbox list.

---

## Sprint completion

**Not complete.** Marked **READY FOR PRODUCT QA** pending manual staging verification and product feedback. Do not start the next platform phase until QA findings are provided.
