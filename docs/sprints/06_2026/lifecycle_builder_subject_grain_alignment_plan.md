# Lifecycle Builder Subject-Grain Alignment — Design + Implementation Plan

**Path:** `docs/sprints/06_2026/lifecycle_builder_subject_grain_alignment_plan.md`  
**Date:** 2026-06-06  
**Status:** **Architecture gate — metadata bridge before Phase C lane flips resume**  
**Scope:** Design + low-risk metadata/type planning. **No queue membership, lane counts, or production behavior changes in this sprint.**

**Why now:** Phase C lane flips were paused because hardcoded queue predicates (`enrollmentPipelineQueueDefinitionV2`, `ocmEnrollmentTrackStageKeys`, Card 6/8 builders) will conflict with Lifecycle Builder as operators customize stages. This plan defines how Builder becomes the **source of truth** for subject-grain queue membership metadata before any further lane routing changes.

**Hard boundaries (this sprint):**

| Do | Do not |
|----|--------|
| Audit builder storage + propose metadata shape | Flip queue membership |
| Define default enrollment stage mapping | Change lane counts |
| Document UI + runtime resolver targets | Remove legacy queue predicates |
| Cross-link child-grain + matrix contracts | Ship builder reads in production without flag |
| Plan phases A–F for next sprints | Weaken AdminV2 reveal / queue empty semantics |

**Related (cross-links):**

| Area | Doc |
|------|-----|
| Child-grain conversion spine | [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md) |
| Disposition matrix + `enrollment_stage_key` | [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) |
| `QueueRowContext` runtime | [`work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) |
| Builder canonical model | [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md) |
| Phase C pause / Enrolled staging | [`completed/child_grain_phase_c_enrolled_staging_flip.md`](./completed/child_grain_phase_c_enrolled_staging_flip.md) |
| Grain expansion | [`status_ownership_and_lifecycle_grain_expansion.md`](./status_ownership_and_lifecycle_grain_expansion.md) |

---

## Executive summary

Lifecycle Builder already owns **stage identity**, **status assignment UI**, **per-stage work units**, and **queue_definition materialization** — but only for **case-grain opportunity status keys**. Child-grain and candidate-grain membership for Tour / Waitlist / Enrolling / Enrolled still lives in **hardcoded** enrollment pipeline predicates and Phase A builders.

**Target:** Each builder stage carries an explicit **`queue_membership_v1`** block: `subject_type`, `count_unit`, `included_disposition_keys`, optional scope fields, and optional `queue_builder_key` for legacy lane routing. Runtime (`QueueService`) eventually resolves:

```
lifecycle_builder_v1 stage.queue_membership_v1
  → subject_type + disposition keys
  → correct builder / SQL (OCM, placement_candidates, or case opportunity)
  → stable row id + QueueRowContext
```

**This sprint:** freeze the metadata contract and migration phases. **Next sprint:** Phase A (types + parser) + Phase B (seed defaults on enrollment template stages) — still no production routing change until Phase C behind `ALLOY_QUEUE_CHILD_GRAIN_LANES` or a successor flag.

---

## 1. Audit — where stage config lives today

### 1.1 Lifecycle Builder stage record (department metadata)

**Store:** `departments.metadata.lifecycle_builder_v1`  
**Parser:** `web/lib/lifecycle/lifecycleBuilderConfig.ts`

| Field today | Purpose |
|-------------|---------|
| `processes[].key` | Lifecycle key (enrollment → `ENROLLMENT_PROCESS_KEY`) |
| `processes[].primary_entity` | `opportunity` |
| `stages[].key` | Stable stage slug (`lead`, `qualification`, `tour`, `waitlist`, `enrollment`, `enrolled`) |
| `stages[].label` | Operator label ("Enrollment" for `enrollment` stage) |
| `stages[].sort_order`, `is_active` | Nav + tile ordering |

**Missing today:** `subject_type`, `count_unit`, disposition keys, location scope, queue builder key.

Default enrollment stages are seeded in `defaultLifecycleBuilderV1()` from `LIFECYCLE_STAGE_ORDER` in `lifecycleProgressionRequirementsCatalog.ts`.

**Stage key alias note:** Platform operator stage for "Enrolling" is **`enrollment`** (not `enrolling`). Custom stages may use `enrolling` as a slug; `asOperatorStageKey()` only recognizes the six canonical keys. `lifecycleStageQueuePresentation.ts` maps `operator === "enrollment"` → `child_grain` presentation.

### 1.2 Status ↔ stage assignment

| Store | Mechanism | Grain today |
|-------|-----------|-------------|
| `status_definitions.metadata.enrollment_operator_stage` | Legacy case CRM keys → builder stage | **Case** (`entity_type = opportunities`) |
| `status_definitions.metadata` (matrix seed) | `alloy_layer = enrollment_disposition`, `enrollment_stage_key` | **OCM enrollment track** |
| Status-stages API payload | `buildEnrollmentStatusStagesPayload()` buckets opportunity statuses | **Case** |
| `persistEnrollmentStageStatusAssignments()` | Writes case status metadata on save | **Case** |

**Canonical save path:** `POST …/enrollment-process/stage-runtime-config` → `saveLifecycleStageRuntimeConfig.ts` — `selectedStatusKeys` drives status persistence, work unit upsert, and queue filters in one transaction.

### 1.3 Per-stage work unit + queue view

| Store | Key / field | Purpose |
|-------|-------------|---------|
| `work_units.key` | `lifecycle_wu_{stageKey}` | One queue tab per builder stage on `/dept` |
| `work_units.metadata` | `lifecycle_stage_key`, `status_keys`, `lifecycle_builder_owned_v1` | Back-link + denormalized case status filter list |
| `work_units.queue_definition` | v2 doc | `queues[].grain`, `filters`, `filters_compat_v1`, UI sections, row_preview |

**Materialization:** `upsertLifecycleStageWorkUnitForDepartment()` + `buildLifecycleStageQueueDefinitionForPresentation()`:

- **Lead / Qualification / Tour (non-waitlist):** `grain: case`, `filters: case_status`, `filters_compat_v1: status`
- **Waitlist stage:** clones `enrollment_pipeline` waitlist lane template → `grain: candidate`
- **Enrollment (`enrollment` stage key):** `grain: child` in queue_definition but filters still **case status keys** from UI selection

**Legacy combined pipeline:** `work_units.key = enrollment_pipeline` + `RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2` — multi-lane cards on some surfaces; hardcoded per-lane `grain` and predicates in `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts`.

### 1.4 Ready checks / progression

| Store | Purpose |
|-------|---------|
| `departments.metadata.lifecycle_builder_stage_field_rules_v1` | Per-stage required/recommended field rules (`lifecycleBuilderStageFieldRules.ts`) |
| `lifecycleProgressionRequirementsCatalog.ts` | Operator doctrine for progression messaging (not queue membership) |
| `lifecycleVisibilityEvaluator` | Stage visibility from `opportunities.status_key` ∈ configured set |

Ready-to-advance is **not** queue membership; do not conflate with disposition predicates.

### 1.5 Actions / work definitions

| Store | Purpose |
|-------|---------|
| `action_definitions` + `action_placements` | Handler + surface slots; may tag `lifecycle_operator_stage` |
| `lifecycle_actions_matrix_order_v1` | Department actions matrix row order |
| `lifecycleBuilderActionVisibility` | Filters placements by stage from WU metadata |

Actions are stage-scoped via placements, not via queue membership metadata.

### 1.6 Activation / validation

| Store | Purpose |
|-------|---------|
| `departments.metadata.lifecycle_activation_v1` | Activation preview audit (initial stage, status_keys snapshot) |
| `validateLifecycleActivationRuntime.ts` | Structural go-live proof; references `enrollment_pipeline` for lane card warnings |

### 1.7 Runtime queue membership (not builder-owned today)

| Path | What drives membership |
|------|------------------------|
| Default `QueueService` | `queue_definition` on work unit + opportunity enrichment |
| `ALLOY_QUEUE_CHILD_GRAIN_LANES` | `ocmEnrollmentTrackQueueBuilder.ts` + hardcoded disposition lists in `ocmEnrollmentTrackStageKeys.ts` |
| Card 6 Waitlist (production) | `candidateGrainWaitlistQueue.ts` |
| Card 8 Enrolling (flag off) | `childGrainEnrollmentQueue.ts` |

**Gap:** Builder save does not write OCM disposition predicates or route to OCM builders; Phase A hardcodes disposition keys outside builder config.

---

## 2. Where subject-grain metadata should live

### 2.1 Authority model (target)

| Layer | Role | Authority |
|-------|------|-----------|
| **Builder stage** (`lifecycle_builder_v1.stages[]`) | Operator intent: grain, count unit, included dispositions, scope | **Source of truth** for queue membership policy per stage |
| **Status definitions** | Disposition vocabulary + `enrollment_stage_key` on each OCM disposition | **Source of truth** for label/rename/hide; must stay consistent with stage inclusion lists |
| **Work unit `queue_definition`** | Materialized executable filters + `grain` + UI | **Derived** from builder stage on save (like `status_keys` today) |
| **Work unit `metadata.status_keys`** | Denormalized case keys (transitional) | **Derived**; deprecate for child/candidate stages once dispositions own membership |
| **Enrollment pipeline v2** | Multi-lane legacy layout | **Transitional** — lanes eventually read per-stage builder metadata instead of hardcoded predicates |

### 2.2 Recommended primary shape: `queue_membership_v1` on stage record

Extend `LifecycleBuilderStageRecord` with an optional object (new stages default from enrollment template; existing stages backfilled by seed script):

```typescript
type LifecycleQueueSubjectType = "case" | "child" | "candidate";
type LifecycleQueueCountUnit =
    | "cases"
    | "enrollment_tracks"
    | "children"       // display alias for enrollment_tracks
    | "candidates";

type LifecycleStageQueueMembershipV1 = {
    version: 1;
    lifecycle_key: string;           // process.key, e.g. enrollment
    stage_key: string;               // stage.key (canonical slug)
    subject_type: LifecycleQueueSubjectType;
    count_unit: LifecycleQueueCountUnit;
    /** Primary membership predicate — OCM outcome_status_key or candidate disposition keys */
    included_disposition_keys: string[];
    /** Transitional — case CRM keys when subject_type is case; omit when dispositions-only */
    included_status_keys?: string[];
    /** Optional — see entity_status contract §7 */
    location_scope_source?: "ocm_site" | "placement_site" | "case_site" | null;
    placement_scope?: "active_only" | "active_and_paused" | null;
    /** Maps to enrollment_pipeline executable queue key during migration, e.g. enrollment_completed */
    queue_builder_key?: string | null;
};
```

**Placement:** `departments.metadata.lifecycle_builder_v1.processes[].stages[].queue_membership_v1`

**Why here (not only on work unit):**

- Builder UI edits stages before WU save; stage-runtime-config already treats builder as orchestrator.
- `enrollment_pipeline` multi-lane view needs a **per-stage policy** even when operators use combined WU.
- Activation validation and catalog APIs already read `lifecycle_builder_v1`.

**Denormalized copies (on save, same transaction as today):**

1. `work_units.metadata.queue_membership_v1` — fast runtime read without re-parsing full builder tree.
2. `queue_definition.queues[0].grain` + filter rows — executable compat for current `QueueService`.
3. Optional: `queue_definition.queues[0].membership_policy_ref` → `{ builder_stage_id, version: 1 }` for drift detection (`needs_sync`).

**Do not** move disposition vocabulary to builder-only JSON — keep `status_definitions.metadata.enrollment_stage_key` as the rename-safe binding; builder `included_disposition_keys` should be a **subset** operators explicitly include in the lane (defaults = all active dispositions for that stage from matrix).

### 2.3 Relationship to disposition matrix

| Concern | Owner |
|---------|-------|
| Which dispositions exist | `status_definitions` (OCM entity type) + matrix seed |
| Which stage a disposition belongs to | `metadata.enrollment_stage_key` on disposition row |
| Which dispositions appear **in this stage's queue** | Builder `included_disposition_keys` (can exclude terminal outcomes without deleting dispositions) |
| Case CRM keys during transition | `included_status_keys` + `enrollment_operator_stage` |

Invariant (runtime check, builder validation): every `included_disposition_key` must resolve to a disposition whose `enrollment_stage_key` matches the stage (or explicit override flag for advanced tenants — defer).

---

## 3. Default enrollment stage mapping (target defaults)

Operator label vs platform `stage_key` shown where they differ.

| Stage (label) | `stage_key` | `subject_type` (now → target) | `count_unit` (now → target) | `included_disposition_keys` | `included_status_keys` (transitional case) | `queue_builder_key` |
|---------------|-------------|-------------------------------|-----------------------------|-----------------------------|---------------------------------------------|---------------------|
| Lead | `lead` | case → case (future: child/track) | cases | — | `new_inquiry` (+ optional `open`, `new` from `ENROLLMENT_STAGE_STATUS_KEYS`) | `leads` / lifecycle primary queue |
| Qualification | `qualification` | case → case (future: child/track) | cases | `needs_qualification`, `qualified` | Legacy: `contact_attempted`, `contacted`, `qualification` until case boring | `qualification` |
| Tour | `tour` | child / enrollment_track | enrollment_tracks (`children` display) | `tour_requested`, `tour_scheduled`, `tour_completed`, `decision_pending` | Legacy case keys in `ENROLLMENT_STAGE_STATUS_KEYS.tour` for compat | `tours`, `tours_follow_up` |
| Waitlist | `waitlist` | candidate | candidates (or `children` display alias) | `waitlisted`, `waitlist_paused` | `waitlisted` case key | `waitlist` |
| Enrolling | `enrollment` | child / enrollment_track | enrollment_tracks | `offer_pending`, `registration_pending`, `paperwork_pending`, `start_date_scheduled` | `enrolling`, `ready_to_enroll` | `enrollment_offers` |
| Enrolled | `enrolled` | child / enrollment_track | enrollment_tracks | `enrolled` | `enrolled` | `enrollment_completed` |

**Extended tour dispositions** (matrix + Phase A builders, not in minimal default lane set): `follow_up_attempted`, `tour_no_show`, terminal outcomes — include in matrix seed but optional in default `included_disposition_keys` until operator enables or sub-lane (`tours_follow_up`) is configured.

**Enrolling extended keys** in Phase A code today: `enrolling`, `ready_to_enroll` — treat as transitional case-compat until dispositions fully own Enrolling lane.

Seed source of truth for disposition keys: `supabase/migrations/20260610140000_enrollment_status_matrix_seed_metadata.sql` + `enrollment_lifecycle_status_matrix_contract.md` §6.

---

## 4. Builder UI impact (future — not this sprint)

When metadata exists, Settings → Lifecycle stage setup should eventually surface:

| UI element | Behavior |
|------------|----------|
| **Subject grain selector** | `case` \| `child (enrollment track)` \| `candidate` — drives which status picker loads |
| **Included dispositions** | Multi-select from dispositions where `enrollment_stage_key` matches stage; warn on terminal outcomes in active lane |
| **Included case statuses** | Shown only when `subject_type = case` or "transitional compat" toggle on |
| **Count unit display** | Read-only derived from `subject_type` with operator-friendly label (`enrollment_tracks` → "Children") |
| **Location / program / room scope** | Indicator from `location_scope_source` + placement_scope; link to entity status contract |
| **Case-status warning** | Banner when stage uses opportunity `status_key` filters instead of OCM dispositions for Tour+ stages |
| **Legacy pipeline banner** | On `enrollment_pipeline` WU: "Lane membership migrating to per-stage builder config" with link to stage cards |
| **`needs_sync` repair** | When `queue_definition` grain/predicates drift from `queue_membership_v1` |

Save path: extend `saveLifecycleStageRuntimeConfig` to accept / persist `queue_membership_v1` and materialize queue_definition (same atomic transaction as status keys).

---

## 5. Runtime resolver impact (future — behind flag)

### 5.1 Resolution flow (target)

```
resolveWorkUnitQueueContext(workUnit, queueKey)
  → if lifecycle_wu_* or enrollment_pipeline lane:
      read queue_membership_v1 (WU metadata or builder stage)
      switch subject_type:
        case → existing opportunity query + case_status / status filters
        child  → ocmEnrollmentTrackQueueBuilder (disposition keys from config, not ocmEnrollmentTrackStageKeys constants)
        candidate → candidateGrainWaitlistQueue (disposition + placement_scope)
  → build rows (ocmrow / pcrow / opportunity id)
  → attachQueueRowContextToItems (honest row_subject)
```

### 5.2 Modules to touch (later phases)

| Module | Change |
|--------|--------|
| `web/lib/queues/QueueService.ts` (or lane router) | Branch on `queue_membership_v1.subject_type` |
| `ocmEnrollmentTrackQueueBuilder.ts` | Accept disposition list from config |
| `ocmEnrollmentTrackStageKeys.ts` | Become **default fallback** only when metadata missing |
| `enrollmentPipelineQueueDefinitionV2.ts` | Lanes read builder metadata instead of inline filters |
| `lifecycleStageQueuePresentation.ts` | Derive presentation mode from `subject_type` not hardcoded `asOperatorStageKey` |
| `saveLifecycleStageRuntimeConfig.ts` | Write metadata + materialize filters |
| `validateLifecycleStageWorkUnitQueueFilter` | Validate disposition keys + grain alignment |

### 5.3 Flag strategy

Keep `ALLOY_QUEUE_CHILD_GRAIN_LANES` for **lane-level rollout** during migration. Add optional `ALLOY_QUEUE_BUILDER_MEMBERSHIP=1` when resolver reads builder metadata instead of hardcoded Phase A keys — or merge: flag enables builder read **per `queue_builder_key`**.

**Production default:** both unset → current behavior (legacy predicates + optional Phase A hardcoded keys when child-grain flag set).

---

## 6. Migration plan — phases A–F

Aligned with child-grain Phase C–F but **builder-metadata-first** so lane flips do not chase moving hardcoded constants.

| Phase | Scope | Production behavior |
|-------|--------|---------------------|
| **A — Metadata shape** | TS types, parser for `queue_membership_v1`, extend `parseLifecycleBuilderV1` (ignore unknown fields safely), API read path returns metadata when present | **No change** — parser accepts, runtime ignores (**types/parser/defaults shipped** — see §Phase A implementation note) |
| **B — Seed defaults** | Backfill enrollment template stages on builder-owned departments; mirror to `lifecycle_wu_*` metadata; optional migration script | **No change** — metadata only (**shipped** — see §Phase B implementation note) |
| **C — Runtime read behind flag** | `QueueService` reads `queue_membership_v1` when flag on; fallback to hardcoded predicates | **No change** when flag unset |
| **D — Flip Enrolled** | Replace `enrollment_completed` hardcoded list with builder config (staging first) | Changes only when flag + lane enabled |
| **E — Flip Enrolling / Tour** | Same for `enrollment_offers`, `tours` | Staged per lane |
| **F — Legacy cleanup** | Remove duplicate predicates from `enrollmentPipelineQueueDefinitionV2`, deprecate `ocmEnrollmentTrackStageKeys` as authority, case-status compat lanes per child-grain Phase F | After operator comms + matrix migration |

**Dependency:** Phase C of child-grain (lane flip) should **prefer Phase C of this plan** (builder read) so flipped lanes do not re-hardcode disposition lists.

---

## 7. Conflicts with current builder model

| Conflict | Detail | Mitigation |
|----------|--------|------------|
| **Case-only status picker** | Stage save persists **opportunity** status keys | Dual picker: case keys vs OCM dispositions per `subject_type` |
| **`selectedStatusKeys` is single list** | One array drives status metadata + queue filters | Split: `included_disposition_keys` + optional `included_status_keys`; snapshot types in `lifecycleStageRuntimeConfigTypes.ts` |
| **Enrollment stage key `enrollment` vs label "Enrolling"** | Operators may create custom `enrolling` slug | Canonical mapping table + `asOperatorStageKey` aliases; seed uses platform keys |
| **Qualification disposition vs case keys** | `ENROLLMENT_STAGE_STATUS_KEYS.qualification` ≠ matrix `needs_qualification` | Default seed uses matrix dispositions; case keys in `included_status_keys` transitional only |
| **Per-stage WU vs `enrollment_pipeline`** | Two surfaces, one legacy multi-lane WU | `queue_builder_key` links stage metadata to executable lane; eventual deprecation of combined predicates |
| **`grain: child` with case filters** | Enrollment stage WU already sets child grain in presentation but filters case status | Materialization must set OCM disposition filters when `subject_type` is child/candidate |
| **Visibility vs membership** | `lifecycleVisibilityEvaluator` uses case status | Keep separate; visibility lens ≠ queue membership unit |
| **Matrix `enrollment_stage_key` on DB** | Builder inclusion list could drift from disposition metadata | Validation on save + `needs_sync` when disposition stage changes in Settings |
| **Phase A hardcoding** | `ocmEnrollmentTrackStageKeys.ts` duplicates target defaults | Phase F fallback only after builder read ships |

---

## 8. Recommended fastest safe implementation sequence

**Next sprint (safe, no behavior change):**

1. **Types + parser (Phase A)** — `LifecycleStageQueueMembershipV1`, extend `LifecycleBuilderStageRecord`, `parseQueueMembershipV1()`, tests for parse/round-trip on `lifecycle_builder_v1`.
2. **Default factory (Phase A)** — `defaultQueueMembershipForEnrollmentStage(stageKey)` returning table in §3; used only by seed + tests until UI ships.
3. **Seed script (Phase B)** — Admin script or migration helper: for builder-owned enrollment departments, attach `queue_membership_v1` to each canonical stage + copy to matching `lifecycle_wu_*` metadata. **Do not** alter `queue_definition` filters yet (avoid `needs_sync` storms) OR run materialization in dry-run report first.
4. **API exposure (read-only)** — Include `queue_membership_v1` in stage-bootstrap / stage-work-unit GET for builder UI prep. Strip from operator JSON if not ready for display.
5. **Docs + validation stub** — `validateLifecycleStageQueueMembership()` returns warnings only (no blocking save).

**Following sprints:**

6. Extend `saveLifecycleStageRuntimeConfig` to persist metadata + materialize queue_definition (still default-off runtime).
7. Phase C: builder membership flag + Enrolled lane flip from config (replaces paused Phase C hardcoded flip).
8. Enrolling → Tour → Waitlist flips with per-lane QA scripts (reuse `childGrainPhaseCPreflight.ts` pattern).
9. Phase F cleanup with child-grain doc.

**Do not start:** lane flip or `queue_definition` filter changes until steps 1–3 are merged and seed dry-run reviewed on staging copy.

---

## 9. Acceptance checklist

- [x] Audit: builder vs WU vs pipeline vs Phase A builders mapped
- [x] Metadata location: `queue_membership_v1` on builder stage + denormalized WU metadata
- [x] Default enrollment mapping table aligned to matrix + child-grain design
- [x] UI + runtime resolver documented for future work
- [x] Phases A–F defined with no-production-change gate
- [x] Conflicts and sequence documented
- [x] Phase A: types, parser, enrollment defaults, tests
- [x] Phase B: seed plan/apply + script (metadata only)
- [x] Phase C: runtime read behind `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER` (default off)
- [x] Phase D: full builder routing for tour/waitlist/enrollment/enrolled + row context + count_unit
- [x] Phase E: location-scope filtering + sibling redaction on builder child/candidate lanes
- [x] Phase F: save path persists queue_membership_v1 + WU denormalization
- [ ] Phase G: Builder UI, production lane flip sign-off, legacy cleanup

---

## Phase A implementation note (2026-06-09)

**Status:** Phase A contract landed — **no runtime or save-path wiring**.

| Deliverable | Location |
|-------------|----------|
| Shared types + parser | `web/lib/lifecycle/queueMembershipV1.ts` — `QueueMembershipV1`, `parseQueueMembershipV1()` |
| Enrollment default factory | `defaultQueueMembershipForEnrollmentStage(stageKey)` — locked table in §3 (`enrollment` stage key, not `enrolling`) |
| Stage resolver helper | `resolveQueueMembershipForStage(stageConfig, fallbackStageKey)` |
| Tests | `web/tests/lifecycle/queueMembershipV1.test.ts` |

**Intentionally not wired yet:**

- `parseLifecycleBuilderV1` / `LifecycleBuilderStageRecord` extension
- `saveLifecycleStageRuntimeConfig` persistence
- Work unit metadata denormalization
- `QueueService` / lane routing / hardcoded predicate replacement
- Lifecycle Builder UI grain/disposition picker
- Seed script (Phase B)

**Next sprint:** Phase B can seed `queue_membership_v1` onto enrollment template stages and mirror to `lifecycle_wu_*` metadata using this contract — still without production queue behavior change until Phase C behind flag.

---

## Phase B implementation note (2026-06-09)

**Status:** Metadata seed landed — **no `queue_definition` or QueueService changes**.

| Deliverable | Location |
|-------------|----------|
| Seed plan + apply helpers | `web/lib/lifecycle/seedEnrollmentQueueMembershipV1.ts` |
| CLI script (dry-run default) | `web/scripts/seedEnrollmentQueueMembershipV1.ts` |
| Builder parse preserves membership | `lifecycleBuilderConfig.ts` — `queue_membership_v1` on stage record |
| Work unit metadata type | `lifecycleStageWorkUnit.ts` — optional `queue_membership_v1` |
| Tests | `web/tests/lifecycle/seedEnrollmentQueueMembershipV1.test.ts` |

**Behavior:**

- Finds departments with active `lifecycle_builder_v1` process `key = enrollment`.
- Seeds each canonical stage (`lead`, `qualification`, `tour`, `waitlist`, `enrollment`, `enrolled`) when `queue_membership_v1` is **missing**.
- Skips stages/work units with **valid** explicit `queue_membership_v1` (does not overwrite).
- Skips invalid explicit blobs and unknown stage keys (`enrolling`, custom stages).
- Denormalizes matching membership to `lifecycle_wu_{stage}` work unit **metadata only**.
- Apply path verifies `queue_definition` JSON unchanged after work unit update.

**Dry run:**

```bash
cd web
ORG_ID=<org_uuid> npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts
```

**Apply (metadata only):**

```bash
cd web
CONFIRM_QUEUE_MEMBERSHIP_SEED=1 ORG_ID=<org_uuid> npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts
```

Optional: `DEPARTMENT_ID=<dept_uuid>` scopes to one department.

**Verify in Supabase (after apply):**

```sql
-- Builder stage blob (example department)
select
  d.id,
  d.name,
  jsonb_path_query_array(
    d.metadata->'lifecycle_builder_v1'->'processes',
    '$[*] ? (@.key == "enrollment").stages[*].{key: key, membership: queue_membership_v1}'
  ) as enrollment_stage_membership
from departments d
where d.org_id = '<org_uuid>'
  and d.metadata ? 'lifecycle_builder_v1';

-- Per-stage work unit metadata
select
  wu.id,
  wu.key,
  wu.metadata->'lifecycle_stage_key' as stage_key,
  wu.metadata->'queue_membership_v1' as queue_membership_v1
from work_units wu
where wu.org_id = '<org_uuid>'
  and wu.key like 'lifecycle_wu_%'
order by wu.key;
```

Expect `subject_type` / `count_unit` / `included_disposition_keys` per §3 defaults; Lead stage has `included_status_keys: ["new_inquiry"]` and empty disposition list.

**Intentionally not wired yet (post Phase C):**

- `saveLifecycleStageRuntimeConfig` persistence on operator save
- Lifecycle Builder UI grain/disposition picker
- `queue_definition` filter materialization from membership
- Production lane flips without explicit env flags

---

## Phase C implementation note (2026-06-09)

**Status:** QueueService reads `queue_membership_v1` behind flag — **default production unchanged**.

| Deliverable | Location |
|-------------|----------|
| Builder membership flag | `web/lib/queues/queueMembershipFromBuilderFeatureFlag.ts` |
| Runtime resolver + lane routing | `web/lib/queues/queueMembershipRuntimeResolver.ts` |
| QueueService wiring | `web/lib/queues/QueueService.ts` |
| OCM disposition override | `web/lib/queues/ocmEnrollmentTrackQueueBuilder.ts` — `ctx.dispositionKeys` |
| Tests | `web/tests/queues/queueMembershipRuntimeResolver.test.ts` |

### Flag

| Env | Behavior |
|-----|----------|
| unset | Legacy routing only (`ALLOY_QUEUE_CHILD_GRAIN_LANES` may still apply per Phase A) |
| `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1` | When valid `queue_membership_v1` matches executable queue key, builder config drives OCM / waitlist builders |

### Precedence (locked)

1. **`ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1`** + valid membership for queue key → builder routing (`subject_type`, `included_disposition_keys`, `count_unit` logged via `[queue-perf] queue_membership_from_builder`)
2. Else **`ALLOY_QUEUE_CHILD_GRAIN_LANES`** → Phase A hardcoded lane builders
3. Else **legacy** case-grain / compat paths

Invalid explicit `queue_membership_v1` on a work unit does **not** fall back to enrollment defaults — routes to step 2/3.

### Membership resolution order

1. `work_units.metadata.queue_membership_v1` (valid parse only)
2. Builder stage blob on `departments.metadata.lifecycle_builder_v1` (via `lifecycle_stage_key`)
3. `defaultQueueMembershipForEnrollmentStage(stage_key)` when stage key known and no invalid explicit blob

### Local test

```bash
# Seed metadata (optional)
cd web
ORG_ID=<uuid> CONFIRM_QUEUE_MEMBERSHIP_SEED=1 npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts

# Enable builder routing (counts may change vs legacy)
export ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1

cd web && npm run test -- tests/queues/queueMembershipRuntimeResolver.test.ts
```

**Next:** Phase D — lane flip from builder config in staging (can combine both flags or builder-only after seed).

---

## Phase D implementation note (2026-06-09)

**Status:** Full builder-backed routing for enrollment child/candidate lanes — **still flag-gated**.

| Capability | Detail |
|------------|--------|
| Lane coverage | `enrolled`, `enrollment` (Enrolling), `tour`, `waitlist` via builder metadata |
| Case lanes | `lead`, `qualification` stay **legacy** (builder lane allowlist excludes case `subject_type`) |
| Flags | `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1` + optional `ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES` |
| Precedence | Builder (allowlisted) → `ALLOY_QUEUE_CHILD_GRAIN_LANES` → legacy |
| Count unit | On queue summaries (`count_unit`) + `QueueRowContext.row_count_unit` when builder meta passed |
| Row context | `builderMembership` on lane params → honest `row_subject` / `drawer_open.active_subject` |
| Seed | `SEED_ALL_ORGS=1` scans all orgs; dry-run per department/stage/work unit |

**Local QA (full stack):**

```bash
cd web
CONFIRM_QUEUE_MEMBERSHIP_SEED=1 ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts
export ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1
export ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES=enrolled,enrollment,tour,waitlist
# optional rollback compare: ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_completed
```

**Remaining gaps:** `saveLifecycleStageRuntimeConfig` persistence, builder UI editors, `queue_definition` materialization from membership, production lane flip sign-off.

---

## Phase E implementation note (2026-06-09)

**Status:** Location-scope filtering for builder-backed child/candidate lanes — **flag-gated with Phase D**.

| Rule | Detail |
|------|--------|
| Child lanes (`ocm_site`) | Filter OCM `location_id`; `case_site` uses `opportunities.location_id` |
| Waitlist (`placement_site`) | Filter `placement_candidates.site_id`; fallback to opportunity when site null |
| Missing location | **Restricted** site scope: exclude row; **unrestricted**: include |
| Related siblings | `related_subjects_summary.visibility` — `full` in scope, `redacted` out of scope |
| Module | `web/lib/queues/queueMembershipLocationScope.ts` |
| Defaults | Enrollment stage defaults now seed `location_scope_source` (`ocm_site` / `placement_site`) |

**No change:** Lead/Qualification case-grain legacy paths; flags/rollback unchanged.

---

## Phase F implementation note (2026-06-09)

**Status:** `saveLifecycleStageRuntimeConfig` persists `queue_membership_v1` — **metadata only**.

| Behavior | Detail |
|----------|--------|
| Stage save | Preserve explicit valid membership; seed enrollment default when missing |
| Work unit | Denormalize membership to `lifecycle_wu_*` metadata on upsert/sync |
| Queue definition | Inert `metadata.queue_membership_v1`, `subject_type`, `count_unit` — **filters unchanged** |
| Unknown stages | No bogus membership (e.g. custom `enrolling` slug without default) |
| Builder load | `lifecycleBuilderConfig` already round-trips `queue_membership_v1` on parse |
| Module | `web/lib/lifecycle/persistQueueMembershipV1.ts` |

**Still pending:** Builder UI grain/disposition editors; production lane flip; `queue_definition` filter materialization from membership.

---

## 10. Document maintenance

Update when:

- `saveLifecycleStageRuntimeConfig` begins writing `queue_membership_v1`
- Builder UI ships grain/disposition picker
- `QueueService` reads builder metadata in production
- Phase C lane flip completes for Enrolled / Enrolling / Tour
- `enrollment` vs `enrolling` alias rules change

**Suggested commit message (this doc only):**

```
docs: lifecycle builder subject-grain alignment plan

Define queue_membership_v1 metadata bridge so Lifecycle Builder can own
per-stage subject grain and disposition predicates before resuming Phase C
lane flips. Architecture only — no runtime queue behavior change.
```
