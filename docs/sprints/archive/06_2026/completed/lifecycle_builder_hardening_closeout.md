# Lifecycle Builder Hardening — Sprint Closeout

**Path:** `docs/sprints/archive/06_2026/completed/lifecycle_builder_hardening_closeout.md`  
**Date:** 2026-06-02  
**Status:** **Closed**  
**Commit:** `6b6174ec` — `Harden Lifecycle Builder stage workspace` (branch: `staging`)

**Planning docs (sprint inputs, not moved):**

- [`../lifecycle_builder_hardening_execution_plan.md`](../lifecycle_builder_hardening_execution_plan.md)
- [`../lifecycle_builder_hardening_and_v2_canonical_model.md`](../lifecycle_builder_hardening_and_v2_canonical_model.md)
- [`../lifecycle_v2_discovery_and_operating_model.md`](../lifecycle_v2_discovery_and_operating_model.md)

---

## Sprint goal

Improve **trust and usability** of the existing Lifecycle Builder configuration plane so operators experience **one stage, one configuration flow, one save** — without building Lifecycle V2 features (Needs Attention, Tasks, Orchestration, workflow expansion, new runtime behavior, or schema changes).

**North star:** Configure a **Stage** (Statuses → Required Information → Actions → Queue View), not multiple disconnected systems.

**Explicitly out of scope:** Needs Attention, Tasks, Orchestration, Lifecycle V2, new queue/assignment/runtime semantics, migrations.

---

## Files changed

**Commit:** 30 files (`6b6174ec`)

### New

| File | Role |
|------|------|
| `web/components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx` | Unified stage shell (summary, sections, sticky save, Ready check slot) |
| `web/lib/lifecycle/persistLifecycleStageFieldRules.ts` | Server-side field-rules persistence for unified stage save |
| `docs/sprints/archive/06_2026/lifecycle_builder_hardening_execution_plan.md` | Execution plan (planning artifact) |
| `docs/sprints/archive/06_2026/lifecycle_builder_hardening_and_v2_canonical_model.md` | Builder audit + canonical model (planning artifact) |
| `docs/sprints/archive/06_2026/lifecycle_v2_discovery_and_operating_model.md` | V2 discovery (planning artifact; not implemented) |

### Modified — UI

| File | Role |
|------|------|
| `LifecycleActivationBoard.tsx` | Unified `saveStageUnified`, stable stage selection, bootstrap guards |
| `LifecycleStageConfiguration.tsx` | Delegates to `LifecycleStageWorkspace` |
| `LifecycleStageFieldRequirementsEditor.tsx` | Workspace mode, suggestions vs configured, entity labels |
| `LifecycleStageWorkUnitCard.tsx` | Queue View copy, workspace mode, no per-card save |
| `LifecycleActivationValidation.tsx` | Ready Check copy, scoped refresh |
| `LifecycleHubClient.tsx`, `LifecycleCatalogList.tsx`, `EnrollmentProcessStageStatusesCard.tsx` | Queue View terminology |
| `LifecycleBuilderPrimary.tsx`, `lifecycle/page.tsx` | Tighter vertical layout |
| `SettingsHierarchyBreadcrumb.tsx` | **Lifecycle** capitalization |

### Modified — server / lib

| File | Role |
|------|------|
| `stage-runtime-config/route.ts` | Optional `field_rules` on unified save |
| `saveLifecycleStageRuntimeConfig.ts` | Composes statuses + queue + field rules |
| `buildLifecycleStageBootstrap.ts` | `entity_display_labels` in bootstrap |
| `lifecycleStageBootstrapTypes.ts` | Bootstrap types |
| `useLifecycleStageBootstrap.ts` | Clear stale bootstrap on stage switch |
| `lifecycleActivationValidationCompact.ts` | Operator-facing Ready Check row labels |

### Modified — tests

| File |
|------|
| `lifecycleBuilderGuidedBoardPrefetch.test.ts` |
| `lifecycleBuilderConfigurationCompletion.test.ts` |
| `lifecycleActivationStep3.test.ts` |
| `lifecycleStatusStepSaveFix.test.ts` |
| `lifecycleActivationRuntimeTruth.test.ts` |
| `lifecycleRequiredInfoQueueScrollPolish.test.ts` |
| `lifecycleBuilderUxCoherencePass2.test.ts` |
| `lifecycleBuilderStabilizationPass.test.ts` |

### Not included in commit (left unstaged)

Queue filter audit / drift tooling (separate work):

- `web/app/api/admin/departments/[departmentId]/lifecycle-queue-filter-audit/`
- `web/components/adminV2/settings/lifecycle/LifecycleQueueFilterDriftAudit.tsx`
- `web/lib/lifecycle/lifecycleQueueFilterEvaluationCompare.ts`
- `web/scripts/auditLifecycleQueueFilterEvaluation.ts`
- `web/tests/lifecycle/lifecycleQueueFilterEvaluationCompare.test.ts`

### Deprecated (unreachable, not deleted)

| File | Notes |
|------|-------|
| `LifecycleStageGuidedBoard.tsx` | No production imports; superseded by `LifecycleStageWorkspace` |

---

## UX changes delivered

### Stage workspace consolidation

- Single **Stage Workspace** shell: Statuses → Required Information → Actions → Queue View → Ready check
- Stage summary header (counts for statuses, fields, actions, queue view)
- All sections **collapsed by default**; Actions section now collapsible like the others
- Ready check **lazy-mounts** when section is expanded (no background polling)

### Unified save

- One **Save stage** entry point with state machine: idle → unsaved → saving → saved → error
- **Sticky top header** and **sticky bottom save bar** so save remains visible while scrolling
- Unified POST to `stage-runtime-config` for statuses, queue display name, and field rules (when dirty)
- Actions matrix remains a **separate save** below the workspace (intentional; not in unified transaction)

### Empty-by-default stage configuration

- Builder-owned stages start with **no saved** statuses, field rules, actions, or published queue view
- **Suggested** field panel with explicit **Apply suggestions** — suggestions never appear as saved config until Save stage

### Copy and terminology

- **Queue View** (not Work Unit Queue) in Lifecycle Builder surfaces
- **Ready check** (not Activation Validation / Runtime validation) in operator UI
- Removed `(config only)` and operator-visible `needs_sync` / `lifecycle_wu_*` leakage
- Settings breadcrumb: **Lifecycle** (capitalized)
- Required Information entity dropdown uses **configured org labels** (e.g. Lead vs Opportunity)

### Stage selection stability (pre-commit fix pass)

- Hydrate once per department/process scope — no re-hydrate on catalog refresh bouncing stage tabs
- Bootstrap applies only when `builder_stage_key` matches selected stage
- Creating a stage lands on the new stage and stays there
- Suggested queue display name no longer marks stage dirty before operator edits

---

## Tests run

### Focused lifecycle builder suite (passing at closeout)

```bash
cd web && npm run test -- \
  tests/lifecycle/lifecycleBuilderGuidedBoardPrefetch.test.ts \
  tests/lifecycle/lifecycleBuilderConfigurationCompletion.test.ts \
  tests/lifecycle/lifecycleActivationStep3.test.ts \
  tests/lifecycle/lifecycleStatusStepSaveFix.test.ts \
  tests/lifecycle/lifecycleRequiredInfoQueueScrollPolish.test.ts \
  tests/lifecycle/lifecycleRuntimeUxPolish.test.ts \
  tests/adminV2/lifecycleBuilderUxCoherencePass2.test.ts \
  tests/adminV2/lifecycleBuilderStabilizationPass.test.ts
```

### TypeScript

```bash
cd web && npx tsc --noEmit
```

No TypeScript errors in changed lifecycle builder files at commit time.

### Broader suite note

A wider lifecycle test run (~68 files) reported failures in tests that still assert **guided-board** strings or unrelated runtime/workspace changes. Those were **not** fully updated in this sprint; focused builder tests above were the merge gate.

---

## Known follow-ups

| Item | Priority | Notes |
|------|----------|-------|
| Unsaved guard on stage switch | Medium | `stageDirtyRef` tracked; no confirm dialog yet |
| Actions in unified save | Low / product decision | Matrix save remains separate by design |
| Remove or formally deprecate `LifecycleStageGuidedBoard.tsx` | Low | Dead code; tests may still reference strings |
| Legacy **Advanced configuration** hub (`LifecycleHubClient`) | Low | Collapsed under shell; per-card saves remain |
| Update stale guided-board string tests in broad lifecycle suite | Low | ~13 tests in full suite |
| Queue filter audit files (uncommitted) | Separate track | Drift audit tooling, not part of this sprint |
| Stage-switch skeleton on first uncached visit | Low | Warm cache switches are smooth |

---

## Schema and runtime confirmation

| Check | Result |
|-------|--------|
| **Supabase migrations added** | **No** |
| **New tables / columns** | **No** |
| **Lifecycle runtime visibility semantics changed** | **No** |
| **QueueService / workspace queue behavior changed** | **No** |
| **Assignment or ownership model changed** | **No** |
| **Changes limited to** | Builder UI, builder API composition (`stage-runtime-config` field_rules), department metadata writes via existing paths, bootstrap payload, operator copy |

All meaningful side effects continue to route through existing **stage-runtime-config**, **lifecycle-requirements**, **lifecycle-activation**, and **lifecycle-builder** API paths already used by the builder.

---

## Success criteria (retrospective)

| Criterion | Met |
|-----------|-----|
| One stage configuration experience | Yes — `LifecycleStageWorkspace` |
| One save entry point for stage operational config | Yes — Save stage (actions matrix excepted) |
| Queue View / Ready Check terminology | Yes |
| Empty defaults with suggested ≠ configured | Yes |
| Reduced implementation leakage in operator UI | Yes |
| No Lifecycle V2 features shipped | Yes |
| No schema changes | Yes |
| No lifecycle runtime behavior changes | Yes |

---

## Next sprint

**Not started.** V2 discovery docs remain under `docs/sprints/archive/06_2026/` for a future sprint. Do not treat this closeout as approval to implement Needs Attention, Tasks, Orchestration, or runtime expansion.
