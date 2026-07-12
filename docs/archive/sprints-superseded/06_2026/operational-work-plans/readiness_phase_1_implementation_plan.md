# Readiness Phase 1 — Implementation Plan

**Path:** `docs/sprints/archive/06_2026/readiness_phase_1_implementation_plan.md`  
**Date:** 2026-06-02  
**Status:** **Build planning complete** — ready for coding after sign-off  
**Scope:** Phase 1 implementation plan only. **No code in this sprint.**

**Frozen inputs (do not redesign):**

- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`readiness_engine_architecture_and_runtime_contract.md`](./readiness_engine_architecture_and_runtime_contract.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`completed/lifecycle_builder_hardening_closeout.md`](./completed/lifecycle_builder_hardening_closeout.md)
- [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md)

**Phase 1 lock:**

| In | Out |
|----|-----|
| Builder levels: Suggested, Recommended, Required, Enforced | Needs Attention, Tasks, Automations |
| `ReadinessResult` contract | Readiness events |
| `evaluateEffectiveRequirements` → readiness orchestrator | Packet, relationship, freshness scope |
| Consumers: progression, preflight, forms, drawer | Queue indicators, reporting, dashboards |

---

## Executive summary

Phase 1 introduces **requirement levels**, a canonical **`ReadinessResult`**, and a unified evaluation path — without schema migrations, without events, and without expanding scope beyond **record-scope stage rules**.

| Question | Answer |
|----------|--------|
| **Can Alloy begin coding safely?** | **Go** — after §8 risks acknowledged and perf budget for drawer bootstrap approved |
| **Supabase migrations?** | **None** |
| **Estimated file touch count** | ~35–45 files (18 core, 12 tests, 5–10 ancillary) |
| **Suggested sprint slices** | 6 sequential PRs (see §6) |

---

## 1. Impact analysis

### 1.1 Dependency map

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 0 — Types & config contract (no runtime consumers)         │
│  readinessTypes.ts · readinessMappers.ts · level metadata types  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Config read/write                                    │
│  lifecycleProgressionRequirementsConfig · builderStageFieldRules │
│  persistLifecycleStageFieldRules · lifecycle-requirements route  │
│  lifecycleRequirementsStagePayload · stage-runtime-config        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2 — Evaluator core                                       │
│  lifecycleFieldRuleEvaluator · lifecycleFieldPaletteMerge        │
│  effectiveRequirementsForReadiness · evaluateOperationalReadiness│
│  evaluateEffectiveRequirements (orchestrator extension)          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3 — Runtime consumers (parallel after Layer 2 stable)    │
│  adminActionPreflight · actionPreflightPresentation              │
│  validatePublicSubmissionLifecycleRequirements · forms coverage  │
│  loadOpportunityDrawerOperationalBootstrap (record_view)         │
│  evaluateLifecycleStageProgression (mapper to counts)            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4 — UI (depends on Layer 1 API shape + Layer 3 payloads) │
│  LifecycleStageFieldRequirementsEditor · LifecycleStageWorkspace│
│  ActionPreflightBlockedPanel · FormLifecycleUsagePanel         │
│  Drawer required-information display (new or extended section)   │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** No UI work until Layer 2 contract tests pass. No consumer migration until mapper tests pass.

### 1.2 Backend / lib files

#### New files (recommended)

| File | Purpose |
|------|---------|
| `web/lib/completion/readinessTypes.ts` | `ReadinessResult`, `ReadinessGap`, `ReadinessEvalInput`, triggers, states |
| `web/lib/completion/readinessMappers.ts` | `EffectiveRequirementsResult` ↔ `ReadinessResult`; gap derivation |
| `web/lib/completion/evaluateOperationalReadiness.ts` | Orchestrator entry; request memo; trigger routing |
| `web/lib/completion/effectiveRequirementsForReadiness.ts` | Config resolution + `config_fingerprint` |
| `web/lib/lifecycle/lifecycleStageRequirementLevels.ts` | Parse/persist `rule_levels` in metadata; V1 migration derive |

#### Modify — completion spine

| File | Change |
|------|--------|
| `web/lib/completion/evaluateEffectiveRequirements.ts` | Call readiness orchestrator; add `lifecycle_stage` source tag; export `evaluateOpportunityReadinessForView` |
| `web/lib/completion/effectiveRequirementsTypes.ts` | Add `lifecycle_stage` to `EffectiveRequirementSource`; optional `record_view` / `form_coverage` triggers |
| `web/lib/completion/effectiveRequirementMappers.ts` | Map lifecycle violations → `ReadinessGap` |
| `web/lib/completion/lifecycleActionRequirementCatalog.ts` | Level-aware blocking; reduce legacy object-label path where field rules cover |
| `web/lib/completion/lifecycleProgressionRequirementsConfig.ts` | Read/write level map; `effectiveStageRequirementRules()` |
| `web/lib/completion/lifecycleProgressionRequirementsCatalog.ts` | `evaluateLifecycleStageProgression` consumes `ReadinessResult` counts or parallel eval |
| `web/lib/completion/loadRecordForEffectiveRequirements.ts` | Shared snapshot for readiness (verify no duplicate fetches) |
| `web/lib/completion/bosIntegration.ts` | Accept optional `ReadinessResult` attach (no new BOS capability Phase 1) |

#### Modify — lifecycle field rules

| File | Change |
|------|--------|
| `web/lib/lifecycle/lifecycleFieldRuleEvaluator.ts` | Level-aware: Enforced → hard_block; Required → non-blocking; Recommended → recommendation |
| `web/lib/lifecycle/lifecycleFieldRuleBindings.ts` | Rename/document `runtime_enforced` → `enforceable` (alias keep) |
| `web/lib/lifecycle/lifecycleFieldRequirementsCatalog.ts` | Align catalog `enforceable` with bindings |
| `web/lib/lifecycle/lifecycleFieldPaletteMerge.ts` | Expose `enforceable` + max level per palette entry; remove internal `config_only` from API payload |
| `web/lib/lifecycle/lifecycleBuilderStageFieldRules.ts` | Store/read `rule_levels` on builder stage rows |
| `web/lib/lifecycle/persistLifecycleStageFieldRules.ts` | Persist levels; validate Enforced only when enforceable |
| `web/lib/lifecycle/lifecycleRequirementsStagePayload.ts` | Bootstrap/API payload includes levels + enforceable flags |
| `web/lib/lifecycle/lifecycleStageBootstrapTypes.ts` | Types for level in palette + effective rules |
| `web/lib/lifecycle/buildLifecycleStageBootstrap.ts` | Pass level-aware field requirements |
| `web/lib/lifecycle/saveLifecycleStageRuntimeConfig.ts` | Accept optional level map on unified save |

#### Modify — admin actions

| File | Change |
|------|--------|
| `web/lib/admin/actions/adminActionPreflight.ts` | Return `ReadinessResult`; force live eval (no cache) |
| `web/lib/admin/actions/actionPreflightPresentation.ts` | Map `ReadinessResult` → UI payload; keep `effective_requirements` shim |
| `web/lib/admin/actions/executeAdminAction.ts` | Pass through readiness on preflight failure (if not already) |
| `web/app/api/admin/actions/preflight/route.ts` | Include `readiness` in JSON response |

#### Modify — drawer bootstrap

| File | Change |
|------|--------|
| `web/lib/admin/loadOpportunityDrawerOperationalBootstrap.ts` | Optional `record_view` readiness eval (dept from WU) |
| `web/lib/admin/opportunityDrawerOperationalBootstrapTypes.ts` | Add optional `readiness?: ReadinessResult` |
| `web/lib/admin/opportunityDrawerBootstrapClient.ts` | Type update only |

#### Modify — API routes

| File | Change |
|------|--------|
| `web/app/api/admin/departments/[departmentId]/lifecycle-requirements/route.ts` | GET/PATCH level map |
| `web/app/api/admin/enrollment-process/stage-runtime-config/route.ts` | Forward `rule_levels` on unified save |

### 1.3 Lifecycle Builder files

| File | Change |
|------|--------|
| `web/components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx` | Four-level UX: Off / Recommended / Required / Enforced; enforceable cap |
| `web/components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx` | Dirty/save for level map; summary counts |
| `web/components/adminV2/settings/LifecycleActivationBoard.tsx` | Pass level payload to unified save |
| `web/components/adminV2/settings/LifecycleHubClient.tsx` | Same editor behavior (legacy path — minimal) |
| `web/components/adminV2/settings/LifecycleStagesRequirementsHub.tsx` | Same editor behavior (if still linked) |

**Not in Phase 1:** Ready check structural changes beyond optional config row (defer optional row to PR 6).

### 1.4 Forms files

| File | Change |
|------|--------|
| `web/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract.ts` | Level-aware contract (enforced vs required) |
| `web/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage.ts` | Map to `ReadinessResult` for `form_coverage` |
| `web/lib/forms/lifecycle/validatePublicSubmissionLifecycleRequirements.ts` | Block Enforced only; return readiness internally |
| `web/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation.ts` | Level-aware labels in presentation |
| `web/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation.ts` | Align readiness enum with states |
| `web/lib/forms/lifecycle/formsLifecycleCoverageTypes.ts` | Optional readiness attach |
| `web/components/forms/admin/FormLifecycleUsagePanel.tsx` | Show enforced vs required coverage |
| `web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts` | No route logic change if validator returns same block semantics |

### 1.5 Drawer / action UI files

| File | Change |
|------|--------|
| `web/components/admin/opportunity/ActionPreflightBlockedPanel.tsx` | Display `primary_state: blocked`; grouped gaps |
| `web/components/admin/opportunity/OpportunityDrawerHeaderControls.tsx` | Preflight hook consumes readiness if exposed |
| `web/lib/admin/actions/useOpportunityDrawerActionPreflight.ts` | Type updates for readiness payload |
| `web/components/admin/AdminEntityDrawer.tsx` | Render required-information section from bootstrap `readiness` (**display only — no reveal gate change**) |
| New (optional): `web/components/admin/opportunity/OpportunityRequiredInformationPanel.tsx` | Extract progression/gap list UI |

**Protected infrastructure:** `AdminEntityDrawer.tsx` changes are **display-only**. Must not alter reveal gates, cache keys, or `evaluateComposedDrawerPayload` readiness semantics. Run doctrine test suite (§5.3).

### 1.6 Test files (existing — update)

| File | Why |
|------|-----|
| `web/tests/completion/evaluateEffectiveRequirements.test.ts` | Orchestrator + mapper |
| `web/tests/lifecycle/lifecycleFieldRuleEvaluator.test.ts` | Level semantics |
| `web/tests/lifecycle/lifecycleFieldPaletteMerge.test.ts` | Enforceable flags |
| `web/tests/lifecycle/lifecycleBuilderConfigurationCompletion.test.ts` | Builder copy + levels |
| `web/tests/admin/actions/approveEnrollmentRuntimePreflight.test.ts` | Blocked state |
| `web/tests/admin/actions/lifecycleActionsRuntimePreflight.test.ts` | Four actions |
| `web/tests/admin/actions/actionPreflightDrawerEvents.test.ts` | Event payload |
| `web/tests/forms/validatePublicSubmissionLifecycleRequirements.test.ts` | Enforced-only block |
| `web/tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts` | Coverage levels |
| `web/tests/forms/buildFormLifecycleCoveragePresentation.test.ts` | Presentation |
| `web/tests/completion/lifecycleProgressionRequirementsCatalog.test.ts` | Progression counts |
| `web/tests/completion/lifecycleProgressionRequirementsConfig.test.ts` | Level persistence read |
| `web/tests/lifecycle/lifecycleBuilderGuidedBoardPrefetch.test.ts` | Bootstrap payload shape |

### 1.7 Test files (new — recommended)

| File | Purpose |
|------|---------|
| `web/tests/completion/readinessResultContract.test.ts` | Contract version, trigger matrix, state derivation |
| `web/tests/completion/readinessLevelPersistence.test.ts` | Metadata round-trip + V1 derive |
| `web/tests/completion/readinessMapperParity.test.ts` | Preflight/forms/drawer same gaps for same snapshot |
| `web/tests/admin/drawer/opportunityDrawerReadinessDisplay.test.ts` | Bootstrap attach; no reveal regression |

### 1.8 Explicitly out of scope (do not touch)

| Area | Files / systems |
|------|-----------------|
| Needs Attention | `opportunityAttentionResolver.ts`, `QueueService` NA overlays |
| Tasks | `operational_tasks`*, Task Assist |
| Automations / events | `emitEvent.ts`, workflow runners |
| Queue rows | `QueueBlock.tsx` readiness indicators |
| Reporting | KPI, dashboards |
| Supabase migrations | `supabase/migrations/*` |

---

## 2. Migration plan

### 2.1 Schema changes

**None.** Phase 1 is metadata-JSON-only on `departments.metadata`.

### 2.2 Metadata changes

#### New shape (additive)

Store per-stage **rule levels** alongside existing arrays for backward compatibility:

```typescript
// lifecycle_progression_requirements_v1.stages.{stage}.field_rules
{
  required_rule_ids: string[];      // KEEP — Required + Enforced ids
  recommended_rule_ids: string[];   // KEEP — Recommended ids
  rule_levels_v1?: {                // NEW — authoritative when present
    version: 1;
    by_rule_id: Record<string, "recommended" | "required" | "enforced">;
  };
}

// lifecycle_builder_stage_field_rules_v1.by_stage_key.{key} — same pattern
```

#### V1 read precedence

```
1. If rule_levels_v1.by_rule_id[rule_id] exists → use level
2. Else if rule_id ∈ recommended_rule_ids → recommended
3. Else if rule_id ∈ required_rule_ids:
     if binding.enforceable → enforced   // migration default for existing tenants
     else → required
4. Else → off
```

**Migration default policy (locked):** Existing `required_rule_ids` map to **enforced** when `binding.enforceable === true`, else **required**. This preserves current runtime block behavior for enforceable fields while making semantics explicit.

**Suggested** remains non-persisted template state in builder UI only (unchanged from hardening).

#### Write path

On Save stage / PATCH lifecycle-requirements:

1. Compute `rule_levels_v1` from UI levels
2. Derive `required_rule_ids` = rules where level ∈ `{required, enforced}`
3. Derive `recommended_rule_ids` = rules where level === `recommended`
4. Write both (dual-write) until Phase 2 can deprecate array-only readers

### 2.3 Compatibility requirements

| Consumer | Requirement |
|----------|-------------|
| Old builder clients | Arrays still written; old UI continues to work until upgraded |
| Old evaluator | Reads derived levels from arrays + bindings if `rule_levels_v1` absent |
| Forms contract | Continues to resolve from `effectiveFieldRulesForBuilderStage` — level-aware |
| External scripts | Audit scripts reading metadata — arrays still populated |

### 2.4 Rollout safety

| Phase | Action | Rollback |
|-------|--------|----------|
| **PR 1–2** | Types + read path only; no behavior change | Remove new files |
| **PR 3** | Evaluator level-aware behind parity tests | Revert evaluator; arrays unchanged |
| **PR 4** | Consumers use ReadinessResult; shims keep old JSON fields | Revert consumer mapping |
| **PR 5** | Builder writes `rule_levels_v1` | Old saves still write arrays only — forward compatible |
| **PR 6** | Drawer display | Hide UI section via empty readiness |

**Feature flag:** Not required if dual-write + parity tests pass. Optional env `READINESS_LEVELS_V1=0` to force legacy derive-only read for emergency rollback.

**Tenant impact:** Existing depts get derive migration on read — no manual migration script. First Save stage after deploy persists explicit levels.

### 2.5 Migration sequence

1. Ship read-path derive (`rule_levels_v1` optional)
2. Ship evaluator level semantics + tests proving parity with current preflight for enforceable rules
3. Ship dual-write on save
4. Monitor preflight block rates (should be unchanged ± enforceable catalog fixes)
5. Deprecate array-only write in Phase 2 (not Phase 1)

---

## 3. Runtime contract plan

### 3.1 Types (`readinessTypes.ts`)

Implement exactly as [`readiness_engine_architecture_and_runtime_contract.md`](./readiness_engine_architecture_and_runtime_contract.md) §2.3:

| Type | Notes |
|------|-------|
| `ReadinessResult` | `contract_version: "1.0"` |
| `ReadinessGap` | `scope_type: "record"` only in Phase 1 |
| `ReadinessEvalInput` | Wraps context currently in `EffectiveRequirementsContext` |
| `ReadinessPrimaryState` | 5 states |
| `ReadinessTrigger` | Phase 1: `record_view`, `action_execute`, `form_submit`, `form_coverage` |

### 3.2 Evaluator extensions

| Function | Role |
|----------|------|
| `evaluateOperationalReadiness(input)` | **Canonical entry** |
| `evaluateOpportunityReadinessForView(supabase, {...})` | Drawer / progression |
| `evaluateOpportunityActionReadiness(supabase, {...})` | Preflight — **no request cache** |
| `evaluateFormCoverageReadiness(...)` | Form settings |
| `evaluateFormSubmitReadiness(...)` | Public submit |

Internal flow:

```
evaluateOperationalReadiness
  → resolveEffectiveRequirements(config)
  → loadSnapshot (reuse loadOpportunityRecordForEffectiveRequirements)
  → lifecycleFieldRuleEvaluator.evaluateWithLevels(...)
  → merge layout/action/transition plugins (existing)
  → derivePrimaryState + buildCounts + ok
  → ReadinessResult
```

### 3.3 Compatibility shims

| Shim | Duration |
|------|----------|
| `EffectiveRequirementsResult` preserved | Phase 1 entire; populate from `ReadinessResult` via mapper |
| `actionPreflightPresentation.effective_requirements` | Keep in API response |
| Add `readiness: ReadinessResult` | New field on preflight + drawer bootstrap |
| `completion_requirements` | Map from `ReadinessResult.gaps` blocking subset |
| `evaluateEffectiveRequirements()` | Delegates to orchestrator; returns legacy shape |

### 3.4 Deprecation strategy

| Artifact | Phase 1 | Phase 2+ |
|----------|---------|----------|
| `config_only` in palette API | Remove from client payload | — |
| Object-label progression checks | Keep; mark `@deprecated` in catalog | Remove when field rules cover |
| `runtime_enforced` naming | Alias `enforceable` in types | Remove alias |
| Array-only metadata | Dual-write | Read levels only |
| `EffectiveRequirementsResult` as primary | Shim | Consumers migrate to `ReadinessResult` |

---

## 4. UI rollout plan

### 4.1 Lifecycle Builder

| Change | Detail |
|--------|--------|
| Level control | Replace binary Required/Recommended with stepped control: Off → Recommended → Required → Enforced (Enforced disabled when `!enforceable`) |
| Enforceable badge | "Blocks actions when enforced" — not "config only" |
| Suggested panel | Unchanged — template only, not saved |
| Save stage | Sends `rule_levels_v1` + derived arrays via unified save |
| Dirty state | Track level map changes |
| Summary header | Count by level (recommended / required / enforced) |

**Copy (frozen vocabulary):** Required information, Recommended, Required, Enforced, Suggested.

### 4.2 Drawer

| Change | Detail |
|--------|--------|
| Data source | `drawer-operational-bootstrap.readiness` (`record_view` trigger) |
| Placement | New collapsible section or extend existing operational strip — **below header, above tabs** |
| Content | `completion_summary.label`; gaps grouped by level; Enforced first |
| Reveal | **Must not** block drawer reveal — section skeleton/empty until readiness loads OK |
| Empty state | Ready → "Required information complete" or hide section |

**Performance:** Readiness eval piggybacks existing opportunity + children load; target +15ms p95 budget on bootstrap (see §7).

### 4.3 Forms

| Change | Detail |
|--------|--------|
| Form Detail / usage panel | Coverage badges: **Enforced missing** vs **Required missing** |
| Share readiness | Block messaging unchanged semantics — enforced only on submit |
| Settings copy | "Lifecycle defines required information; this form covers …" |

### 4.4 Actions

| Change | Detail |
|--------|--------|
| Preflight panel | Show `primary_state === 'blocked'`; list blocking gaps |
| Recommended gaps | Shown as Warning — non-blocking |
| Required (guidance) gaps | Shown under "Complete before advancing" — action may still proceed if no enforced gaps |
| Action buttons | No change to click flow — preflight on execute |

### 4.5 UI rollout order

1. Builder levels (admin-only — lowest runtime risk)
2. Preflight panel (gate — highest correctness value)
3. Forms coverage labels
4. Drawer section (visible polish — perf monitored last)

---

## 5. Testing strategy

### 5.1 Unit tests (required before merge)

| Suite | File | Covers |
|-------|------|--------|
| Contract | `readinessResultContract.test.ts` | States, triggers, severity order, `ok` vs blocked |
| Levels | `readinessLevelPersistence.test.ts` | Dual-write, derive, enforceable cap |
| Evaluator | `lifecycleFieldRuleEvaluator.test.ts` | Enforced blocks; Required does not on action_execute |
| Mapper | `readinessMapperParity.test.ts` | Same snapshot → same gaps across triggers |
| Orchestrator | `evaluateEffectiveRequirements.test.ts` | lifecycle_stage source; legacy shim |

### 5.2 Lifecycle tests

| Suite | Covers |
|-------|--------|
| `lifecycleBuilderConfigurationCompletion.test.ts` | No banned copy; four levels |
| `lifecycleProgressionRequirementsConfig.test.ts` | effective rules with levels |
| `lifecycleBuilderGuidedBoardPrefetch.test.ts` | Bootstrap payload includes levels |

### 5.3 Readiness / runtime doctrine tests (required)

Run before merge on any drawer/bootstrap touch:

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

Plus new: `opportunityDrawerReadinessDisplay.test.ts` — readiness present does not change reveal predicates.

### 5.4 Forms tests

| Suite | Covers |
|-------|--------|
| `validatePublicSubmissionLifecycleRequirements.test.ts` | Enforced blocks; Required allows |
| `evaluateFormsLifecycleFieldCoverage.test.ts` | Level-aware coverage |
| `buildFormLifecycleCoveragePresentation.test.ts` | Operator labels |
| `formsLifecycleRequirementCoverageCloseout.test.ts` | Regression guard |

### 5.5 Action tests

| Suite | Covers |
|-------|--------|
| `approveEnrollmentRuntimePreflight.test.ts` | blocked state |
| `lifecycleActionsRuntimePreflight.test.ts` | four lifecycle actions |
| `approveEnrollmentAction.test.ts` | execute path blocked |
| `actionPreflightDrawerEvents.test.ts` | payload shape |

### 5.6 Pre-merge gates

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/completion/readinessResultContract.test.ts \
  tests/completion/evaluateEffectiveRequirements.test.ts \
  tests/lifecycle/lifecycleFieldRuleEvaluator.test.ts \
  tests/admin/actions/approveEnrollmentRuntimePreflight.test.ts \
  tests/forms/validatePublicSubmissionLifecycleRequirements.test.ts
```

Full lifecycle builder suite recommended before staging deploy.

### 5.7 Manual QA checklist

- [ ] Configure field Enforced in builder → blocks approve enrollment
- [ ] Same field Required (non-enforceable custom field) → warns in drawer, does not block
- [ ] Recommended → Warning only everywhere
- [ ] Form with enforced gap → submit blocked; required gap → allowed
- [ ] Drawer opens on warm navigation without waiting for readiness section
- [ ] Save stage persists levels; reload shows same levels

---

## 6. Implementation sequence

### Recommended coding order (6 PRs)

| PR | Slice | Files | Exit criteria |
|----|-------|-------|---------------|
| **1** | Types + mappers | `readinessTypes.ts`, `readinessMappers.ts`, tests | Contract tests green; no runtime wire |
| **2** | Metadata read/write | `lifecycleStageRequirementLevels.ts`, config patches, persist, API routes, tests | Dual-write; derive parity |
| **3** | Evaluator | `lifecycleFieldRuleEvaluator`, `evaluateOperationalReadiness`, orchestrator, tests | Level semantics; preflight parity tests |
| **4** | Consumers (headless) | preflight, forms validator, progression mapper, tests | No UI; APIs return `readiness` |
| **5** | Builder UI | `LifecycleStageFieldRequirementsEditor`, workspace save | Admin can set four levels |
| **6** | Display UI | preflight panel, forms panel, drawer section, doctrine tests | End-to-end QA |

### Within-PR order (typical)

1. Types
2. Persistence / read path
3. Evaluator
4. Mapper + orchestrator
5. Single consumer (preflight first)
6. Remaining consumers
7. UI
8. Tests

### Parallelization

- PR 1 must merge first
- PR 2 and PR 3 can be one PR if small team
- PR 5 can start after PR 2 merges (mock API levels)
- PR 6 waits for PR 4

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drawer bootstrap latency | Medium | High | Share snapshot loader; perf test +15ms budget; readiness optional field |
| Reveal regression in AdminEntityDrawer | Medium | Critical | Display-only; doctrine test suite; no gate on readiness |
| Enforced migration changes block behavior | Low | High | Parity tests vs current preflight before merge |
| Catalog/binding enforceable drift | Medium | Medium | Single `enforceable` in palette merge PR 3 |
| Dual-write desync | Low | Medium | Single persist function; validation on save |
| Scope creep (queue indicators) | Medium | Medium | Explicit exclusion in PR template |
| Custom org fields marked Enforced in UI but not enforceable | Low | Low | Cap Enforced in editor when `!enforceable` |
| `EffectiveRequirementsResult` consumers break | Low | Medium | Shim + dual field on API |

---

## 8. Open questions (resolve at PR 1 kickoff)

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Single PR vs 6 PR sequence | **6 PRs** for reviewability |
| 2 | Drawer readiness in bootstrap vs lazy fetch | **Bootstrap attach** with perf budget; lazy fallback if over budget |
| 3 | Emergency rollback env flag | **Optional** `READINESS_LEVELS_V1=0` |
| 4 | New drawer component vs inline | **New `OpportunityRequiredInformationPanel`** — keeps AdminEntityDrawer diff small |

---

## 9. Go / No-Go recommendation

| Criterion | Status |
|-----------|--------|
| Architecture frozen | ✅ |
| File impact identified | ✅ |
| No schema migration required | ✅ |
| Backward-compatible metadata plan | ✅ |
| Runtime contract specified | ✅ |
| Consumer scope bounded | ✅ |
| Test plan includes doctrine suite | ✅ |
| Performance constraint documented | ✅ |
| Exclusions explicit | ✅ |

### Verdict: **GO**

Alloy can begin **Readiness Phase 1** coding safely starting with **PR 1 (types + contract tests)**.

**Conditions:**

1. AdminV2 drawer work stays **display-only** (PR 6).
2. No queue, NA, events, or reporting in Phase 1 PRs.
3. `npx tsc --noEmit` + contract tests gate each PR.
4. Resolve open questions §8 at kickoff (defaults above are acceptable).

---

## Appendix A — PR checklist template

```markdown
## Readiness Phase 1 PR

- [ ] Scope matches Phase 1 lock (§ header)
- [ ] No supabase/migrations
- [ ] No emitEvent / readiness events
- [ ] Dual-write metadata if touching persist
- [ ] ReadinessResult contract_version set
- [ ] Preflight uses live eval (no cache)
- [ ] Tests added/updated
- [ ] tsc --noEmit clean
- [ ] Drawer doctrine tests if touching AdminEntityDrawer/bootstrap
```

## Appendix B — Document cross-reference

| Topic | Doc |
|-------|-----|
| States & levels | `required_information_v2_operational_readiness_framework.md` §5–§6 |
| ReadinessResult fields | `readiness_engine_architecture_and_runtime_contract.md` §2 |
| Consumption doctrine | `required_information_v2_operational_readiness_framework.md` §9 |
| Vocabulary | `lifecycle_canonical_vocabulary.md` §7 |

---

*End of Phase 1 implementation plan.*
