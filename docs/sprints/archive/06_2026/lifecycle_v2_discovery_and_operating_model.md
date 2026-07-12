# Lifecycle V2 — Discovery & Operating Model

**Path:** `docs/sprints/archive/06_2026/lifecycle_v2_discovery_and_operating_model.md`  
**Status:** Discovery & architecture only — **do not implement** from this document  
**Date:** 2026-06-02  
**Baseline:** Lifecycle Builder V1 (activation board on `/adminV2/settings/lifecycle`)

**Related audits (inputs, not superseded):**

- [`lifecycle_runtime_orchestration_audit.md`](./lifecycle_runtime_orchestration_audit.md)
- [`lifecycle_visibility_vs_ownership_architecture.md`](./lifecycle_visibility_vs_ownership_architecture.md)
- [`lifecycle_builder_architecture_reality_check_v1.md`](./lifecycle_builder_architecture_reality_check_v1.md)
- [`lifecycle_required_info_child_fields_audit.md`](./lifecycle_required_info_child_fields_audit.md)
- [`completed/forms_lifecycle_requirement_coverage.md`](./completed/forms_lifecycle_requirement_coverage.md)
- [`05_2026/task_system_audit_v1.md`](../05_2026/task_system_audit_v1.md)
- [`05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`](../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md)

**Canonical system docs:**

- `docs/system/configuration-system.md`, `docs/archive/2026-06-superseded-system/actions-and-workflows.md`
- `docs/archive/2026-06-superseded-system/workspace-system.md`, `docs/product/crm-system.md`
- `docs/product/bos-foundation.md`

---

## Executive summary

Lifecycle Builder V1 successfully configures **structure** — process, stages, required information, status-to-stage mapping, per-stage work unit queues, action placements, and activation proof. It does **not** own automated side effects, task creation, or attention trigger math.

Lifecycle V2 should **extend the builder as a configuration hub** with six operator-facing sections while **composing** existing platform engines:

| V2 section | Primary reuse | V2 adds |
|------------|---------------|---------|
| **Stages** | `lifecycle_builder_v1`, status-stages API | Custom stage CRUD (deferred from V1) |
| **Required Information** | Field rules metadata + catalog | Unified enforcement levels; NA bridge |
| **Actions** | `action_definitions` + placements | Stage-scoped placement UX (partially shipped) |
| **Needs Attention** | `resolveOpportunityAttention` + bucket metadata | Lifecycle-level rule authoring; stage mapping |
| **Tasks** | `operational_tasks` + Task Assist | Stage default task templates (new config surface) |
| **Orchestration** | `workflow_events` → `executeWorkflowRun` | Link-out + suggested triggers per stage |

**Hard doctrine (carry forward):**

- Lifecycle = operational **configuration** layer; stage = step; status = visibility predicate; work unit = runtime **surface** of a stage.
- Lifecycle defines **visibility lenses**, not exclusive record ownership (`work_unit_id` = execution home, not sole visibility gate).
- Lifecycle does **not** own records; it defines which records appear in which operational views.
- Do **not** build a parallel rules engine — compose Automations, Actions, Attention resolver, Tasks, and BOS.

---

## 1. Current V1 baseline

### 1.1 What Lifecycle Builder V1 ships

| Capability | Storage / API | Runtime consumer |
|------------|---------------|------------------|
| Lifecycle creation | `POST /api/admin/departments` + `lifecycle_activation_owned_v1` | Workspace dept tile |
| Stage creation & ordering | `departments.metadata.lifecycle_builder_v1` | Stage nav, guided board |
| Required Information | `lifecycle_progression_requirements_v1` + `lifecycle_builder_stage_field_rules_v1` | Preflight, forms, activation validate |
| Status-to-stage mapping | `PATCH …/status-stages`, activation `status_keys` | Queue filters, visibility evaluator |
| Lifecycle-stage work units | `work_units.key = lifecycle_wu_{stage}` | `/dept`, `/work-unit/:id` queues |
| Runtime visibility | `lifecycleVisibilityEvaluator` (status-based, no `work_unit_id` gate for builder-owned) | `QueueService`, workspace bootstrap |
| Actions Matrix | `action_placements` + lifecycle builder action visibility | `resolveActionsForContext` |
| Work unit runtime views | Per-stage `queue_definition`, shell pills | AdminV2 workspace routes |
| Activation validation | `GET …/lifecycle-activation/validate` | Proof-only gate before go-live |

**Primary UI:** Activation board (`LifecycleActivationBoard`) on `/adminV2/settings/lifecycle`. Legacy hub remains under Advanced.

### 1.2 V1 doctrine (locked)

| Concept | Meaning |
|---------|---------|
| **Lifecycle** | Department-scoped operational configuration (process + stages + rules) |
| **Stage** | Ordered step in the lifecycle; primary operator mental model |
| **Status** | CRM vocabulary; determines which records match a stage's visibility lens |
| **Work unit** | Runtime operational view/output **produced by** a stage — not a peer config concept |
| **Visibility** | Derived from stage status sets (+ optional overlays); separate from assignment |
| **Assignment** | `opportunities.work_unit_id` = execution home for actions/KPI default — one at a time |

Approved architecture: [`lifecycle_visibility_vs_ownership_architecture.md`](./lifecycle_visibility_vs_ownership_architecture.md) — **Model C (hybrid)**: many lenses, one assignment home.

---

## 2. Proposed V2 lifecycle sections

```
Lifecycle Builder (configuration plane)
├── 1. Stages          — ordered semantics, labels, active/inactive
├── 2. Required Info   — field rules per stage (required / recommended)
├── 3. Actions         — placements scoped to stage surfaces
├── 4. Needs Attention — attention rule profiles + bucket mapping
├── 5. Tasks           — default follow-up templates per stage entry
└── 6. Orchestration   — deep-links + suggested workflow triggers (read-only health)
         │
         ▼
Runtime execution plane (existing — not duplicated)
  Queues · status_definitions · executeAdminAction · completion preflight
  resolveOpportunityAttention · operational_tasks · workflow_events
         │
         ▼
Event spine + BOS (human-in-the-loop apply)
```

| Section | Configurable in Builder | Remains in advanced settings |
|---------|-------------------------|------------------------------|
| Stages | Name, order, description | Global status definitions |
| Required Info | Per-stage field rules | Field definitions, layouts |
| Actions | Stage placement picks | Handler semantics, payload schema |
| Needs Attention | Enable buckets, thresholds, stage mapping | Reason code catalog (platform) |
| Tasks | Default templates on stage entry | Task Assist, My Tasks UX |
| Orchestration | Suggested triggers, health links | Workflow CRUD in Automations |

---

## 3. Required Information architecture

### 3.1 Current implementation summary

#### Where it is stored

| Store | Key | Shape |
|-------|-----|-------|
| Department metadata (primary) | `lifecycle_progression_requirements_v1` | `stages.{operatorStage}.field_rules.{required,recommended}_rule_ids` |
| Department metadata (builder stage keys) | `lifecycle_builder_stage_field_rules_v1` | `by_stage_key.{builderStageKey}.{required,recommended}_rule_ids` |
| Platform catalog (code) | `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` | Rule ids: `person:*`, `child:*`, `opportunity:*` |
| Rule bindings (code) | `lifecycleFieldRuleBindings.ts` | Maps rule id → value source, `runtime_enforced` flag |
| Org extensions | `field_definitions` where `entity_type` ∈ person, inquiry_child, opportunity | Custom fields merged into palette |

**Precedence:** Builder stage row → operator-stage department override → platform defaults (`effectiveFieldRulesForBuilderStage`).

**API:** `GET/PATCH /api/admin/departments/[departmentId]/lifecycle-requirements`

#### How it is consumed

| Consumer | Module | Behavior |
|----------|--------|----------|
| **Runtime validation (action preflight)** | `lifecycleActionRequirementCatalog.ts`, `lifecycleFieldRuleEvaluator.ts` | Execute-now actions (`approve_enrollment`, `move_to_waitlist`, `schedule_tour`, `record_tour_outcome`) evaluate **enforced** field rules only |
| **Drawer PATCH policy** | `field_placements_v1`, `enforceDrawerFieldPoliciesOnPatch` | Layout-level requiredness on opportunity PATCH — **separate** from lifecycle field rules |
| **Forms — public submit** | `validatePublicSubmissionLifecycleRequirements.ts` | Blocks auto-create intake when submitted values miss required lifecycle fields |
| **Forms — coverage UI** | `buildFormLifecycleCoveragePresentation.ts`, `isFormLifecycleReadyForRecordCreation.ts` | Settings Form Detail shows `missing_required` vs ready |
| **Forms — contract resolution** | `resolveFormsLifecycleRequirementContract.ts` | Merges dept metadata + org field defs into forms contract |
| **Activation validation** | `validateLifecycleActivationRuntime.ts` | Structural proof; field rules inform completeness messaging |
| **Progression snapshot (display)** | `evaluateLifecycleStageProgression` | Object-label `missing_required` for drawer/summary — includes non-enforced labels |

#### Entity model note (child fields)

Operator palette entity **Child** maps to **`inquiry_child` / OCM columns**, not canonical `customer_members`. See [`lifecycle_required_info_child_fields_audit.md`](./lifecycle_required_info_child_fields_audit.md).

### 3.2 What “configuration only” means technically

Two related flags exist:

| Flag | Location | Meaning |
|------|----------|---------|
| `runtime_enforced: false` on catalog/binding | `lifecycleFieldRequirementsCatalog.ts`, `lifecycleFieldRuleBindings.ts` | Rule is **saved and displayed** in Builder but **`lifecycleFieldRuleEvaluator` skips it** for hard-block preflight |
| `config_only: true` on palette entry | Derived: `!runtime_enforced` in `lifecycleFieldPaletteMerge.ts` | UI hint that selecting this field **does not yet block** execute-now actions |

**Examples of config-only today:** most `person:*` identity fields, `child:first_name`, `child:location`, org custom fields (always `config_only: true`).

**Examples of runtime-enforced today:** `child:program_interest`, `child:desired_schedule`, `child:desired_start_date` (stage-gated), several opportunity tour/waitlist fields per bindings.

**Important:** Config-only does **not** mean “ignored everywhere.” Non-enforced rules still appear in:

- Saved required/recommended summaries in Builder
- Forms coverage mapping (when form fields align)
- Object-label progression snapshots (`missing_required` at label grain)
- Future Needs Attention predicates (recommended V2)

**Operator copy problem:** `LifecycleStageFieldRequirementsEditor.tsx` renders `(config only)` beside field labels. Tests explicitly require removal of user-facing “configuration only” warnings (`lifecycleBuilderConfigurationCompletion.test.ts`). V2 should replace with **enforcement level** labels (see §3.3) — never implementation caveats.

### 3.3 Recommended V2 model

Treat Required Information as **stage-scoped field requirements** with explicit **enforcement levels**:

| Level | Operator label (proposed) | Blocks execute-now actions | Blocks form auto-create | Surfaces Needs Attention | Blocks status transition |
|-------|---------------------------|----------------------------|-------------------------|--------------------------|--------------------------|
| **Off** | — | No | No | No | No |
| **Recommended** | Recommended | No (warning) | No | Optional (soft signal) | No |
| **Required — guidance** | Required | No | No | Yes (`missing_required_info`) | No |
| **Required — enforced** | Required (enforced) | Yes | Yes (record-creating forms) | Yes | Future: transition rules |

**V1 → V2 mapping:**

- `recommended_rule_ids` → **Recommended**
- `required_rule_ids` + `runtime_enforced: false` → **Required — guidance**
- `required_rule_ids` + `runtime_enforced: true` → **Required — enforced**

Platform gradually promotes catalog rules from guidance → enforced as bindings stabilize. Org custom fields default to **guidance** until explicit binding work.

### 3.4 Enforcement integration plan

| Phase | Work | Engine |
|-------|------|--------|
| **V2.0** | Replace `(config only)` with enforcement level badges; unify copy | Builder UI only |
| **V2.1** | Emit `requirement_satisfied` / `requirement_violated` events when enforced set changes | New canonical `event_type` + PATCH hooks |
| **V2.2** | Wire `missing_required_info` attention reason to field rule evaluator output | `resolveOpportunityAttention` extension |
| **V2.3** | Merge lifecycle field rules into unified `evaluateEffectiveRequirements` spine | Per design package v1 |
| **V2.4** | Optional: transition blockers reference same evaluator | `status_transition_rules` reference |

**Forms:** Continue server-side validation in submit route before `applyFormIntakeSafe`. Extend contract adapter as enforcement levels expand.

**Action preflight:** Keep `POST /api/admin/actions/preflight` + `ActionPreflightBlockedPanel`. Expand enforced rule set via catalog/bindings — not parallel JSON.

---

## 4. Needs Attention architecture

### 4.1 Current architecture

Needs Attention is a **two-layer system**:

```
Platform reason codes (attentionPlatformCatalog.ts)
        ↓
Resolver (resolveOpportunityAttention / opportunityAttentionResolver.ts)
        ↓
Configurable buckets (needs_attention_buckets in dept/WU metadata)
        ↓
Runtime surfaces (dept lane, work-unit pills, queue overlays, drawer badges)
```

#### What exists today

| Layer | Hardcoded vs configurable | Location |
|-------|---------------------------|----------|
| **Reason codes & trigger math** | **Platform-owned** (code) | `opportunityAttentionRules.ts`, `opportunityAttentionResolver.ts`, `QueueService.opportunityNeedsAttention` (legacy lane parity) |
| **Threshold tuning** | **Configurable** via dept metadata | `metadata.opportunity_attention_rules.thresholdsHours`, `stale_*_days`, wait-bucket SLA |
| **Buckets (lenses)** | **Configurable** | `metadata.opportunity_attention_rules.needs_attention_buckets[]` |
| **Stage → signal mapping (Settings copy)** | **Hardcoded reference** | `lifecycleStageWorkspaceMapping.ts` → `STAGE_NEEDS_ATTENTION` |
| **Builder card** | **Read-only link-out** | `LifecycleNeedsAttentionCard.tsx` → `/adminV2/settings/attention-sla-rules` |

#### Representative reason codes (platform)

| Code | Trigger (summary) | Configurable threshold? |
|------|-------------------|---------------------------|
| `stale_new_inquiry` | Intake stage idle > N hours | Yes (`thresholdsHours`) |
| `stale_qualified` | Qualification idle > N hours | Yes |
| `follow_up_date_passed` | `metadata.next_follow_up_at` < now | No (record field) |
| `tour_date_passed` | `status_key=tour_scheduled` + past `metadata.tour_date` | No |
| `high_value_stale` | Mid/late funnel `updated_at` > 2d | Partial (`stale_high_value_days`) |
| `mid_funnel_stale` | Mid-funnel statuses > 7d | Partial |
| `missing_identity` | Missing person/contact/customer | No |
| `waiting_on_family` / `waiting_on_staff` | `metadata.enrollment_operational.wait_bucket` | Bucket SLA hours |
| `missing_quote_after_execution` | Execution stage, no pricing | Yes (`thresholdsHours`) |

**Not implemented as attention reasons today:** `missing_required_info`, `task_overdue`, `enrollment_packet_incomplete`, `conflicting_child_status`, `waitlist_candidate_stale` (partial overlap via wait buckets / queue lane rules).

#### Runtime display

| Surface | Behavior |
|---------|----------|
| **`/adminV2/workspace/dept/:id`** | Department lane shows bucket chips with counts (`bucketCountsFromResolverMatches`) |
| **`/adminV2/workspace/dept/:id/work-unit/:id`** | Builder-owned: **Work Units** pill row (sibling stage WUs) + **Needs Attention** placeholder row (`lifecycleWorkUnitShellPills.ts`); legacy `enrollment_pipeline`: NA overlay queue inside same WU |
| **Queue rows** | Attention reason labels on rows; resolver v2 enriches queue fetch |
| **Drawer** | Activity signals + operational recommendation (BOS) |

**Grain:** Resolver is **opportunity-grain** (case `status_key`, metadata, tasks sync). Child/candidate stale waitlist uses separate queue lane mechanics — not unified NA reason yet.

### 4.2 Proposed lifecycle-level Needs Attention model

**Principle:** Platform owns **reason code catalog + evaluator**; Lifecycle Builder owns **which reasons matter per lifecycle/stage** and **bucket grouping** for that department.

#### Config shape (conceptual — V2)

Extend department metadata (or nested under `lifecycle_builder_v1`):

```typescript
lifecycle_attention_profile_v1: {
  version: 1;
  enabled: boolean;
  buckets: NeedsAttentionBucketConfig[];  // existing shape
  stage_rules: Record<builderStageKey, {
    reason_codes: string[];      // subset active for this stage
    threshold_overrides?: Partial<ThresholdHours>;
  }>;
  // Optional: bridge to required info
  flag_missing_required: boolean;  // default true when stage has enforced required fields
}
```

#### Mapping proposed operator rules → platform codes

| Operator rule (V2 examples) | Platform mechanism |
|-----------------------------|-------------------|
| No activity in X days | `stale_*` reasons + `thresholdsHours` / `stale_*_days` |
| Status unchanged for X days | Extend resolver: `status_unchanged_stale` (new code) or reuse `mid_funnel_stale` |
| New lead not contacted within SLA | `stale_new_inquiry` |
| Tour date passed, no follow-up | `tour_date_passed` |
| Missing required information | **New:** `missing_required_info` ← field rule evaluator |
| Task overdue | **New:** `operational_task_overdue` ← query open tasks where `due_at < now` |
| Parent message, no reply | `waiting_on_family` + comms signal inputs (partial today) |
| Waitlist candidate stale | Candidate queue grain + placement timestamps (extend resolver or candidate-specific overlay) |
| Enrollment packet incomplete | Packet status hooks (forms/documents module) → new reason code |
| Conflicting child/opportunity status | **New:** `mixed_child_disposition` ← read-only compare OCM vs case status |

### 4.3 Data model recommendation

| Approach | Recommendation |
|----------|----------------|
| New `lifecycle_attention_rules` table | **Defer** — use dept metadata like buckets today |
| Stage-scoped bucket filters | **Yes** — filter `reason_codes` per builder stage for guided board preview |
| Separate NA work unit | **No** — NA remains **overlay** inside lifecycle dept, not a lifecycle stage |
| Reason code registration | **Platform code** — tenants tune thresholds/policies, not arbitrary expressions |

### 4.4 Relationship to Tasks and BOS

| System | Relationship |
|--------|--------------|
| **Tasks** | Open tasks sync `opportunities.metadata.next_follow_up_at` → feeds `follow_up_date_passed`. V2: `operational_task_overdue` reason |
| **BOS** | Reads resolver output + completion previews → proposes actions. Does **not** define attention triggers |
| **Workflows** | Side effects (status, messages) change resolver inputs on next fetch — no direct NA flag writes |

---

## 5. Task architecture

### 5.1 Current task system

| Aspect | Today |
|--------|-------|
| **Table** | `operational_tasks` |
| **Scope** | **Opportunity-scoped** (`entity_type = 'opportunities'` only); optional unlinked tasks (general) |
| **Statuses** | `open` \| `completed` \| `canceled` |
| **Sources** | `manual` \| `task_assist` |
| **Creation paths** | My Tasks panel, Task Assist apply, `POST /api/admin/operational-tasks` |
| **Registry `create_task` action** | **`ui_intent`** → opens My Tasks panel — **does not** server-create on click |
| **Workflow creation** | **No** — workflows do not insert tasks |
| **Lifecycle Builder** | **None** — no task template step |

**Display:** My Tasks modal/panel, drawer operational strip, due date chips. Assignee supported in API — **no AdminV2 assign UI**.

See [`05_2026/task_system_audit_v1.md`](../05_2026/task_system_audit_v1.md).

### 5.2 Lifecycle task model recommendation (V2)

**Principle:** Tasks are **execution artifacts**, not lifecycle structure. Builder configures **default task templates** triggered on **stage entry** (or specific status transitions), executed via existing task API + optional future workflow action type.

#### Proposed config (metadata)

```typescript
lifecycle_stage_task_templates_v1: {
  version: 1;
  by_stage_key: Record<string, {
    templates: Array<{
      id: string;
      title: string;
      due_offset_business_days: number;
      assign_to: "owner" | "role" | "team" | null;
      assign_role_key?: string;
      trigger: "stage_entry" | "status_enter";
      status_keys?: string[];  // when trigger = status_enter
      bos_suggest_comms?: boolean;  // hand off to Task Assist on apply
    }>;
  }>;
}
```

#### Example: Lead stage entry

| Field | Value |
|-------|-------|
| Title | Contact family |
| Due | 1 business day |
| Assign | Role: enrollment coordinator |
| Trigger | `stage_entry` when opportunity first matches lead stage visibility |
| BOS | Suggest communication content via Task Assist (human apply) |

### 5.3 Task lifecycle / status model

Keep existing `operational_tasks.status` — do not introduce parallel task state machines in Lifecycle Builder.

| Event | Behavior |
|-------|----------|
| Template fires | Create `open` task via server path (workflow or stage-entry listener) |
| Complete | Operator marks complete; sync follow-up metadata |
| Cancel | Operator cancels; no auto-recreate unless re-entry rules say so |

### 5.4 Relationships

| System | Relationship |
|--------|--------------|
| **Needs Attention** | Overdue open tasks → new attention reason; complements SLA timers |
| **Orchestration** | Preferred path: workflow on `opportunity_status_changed` creates tasks once `create_operational_task` workflow action exists; until then: stage-entry server hook |
| **BOS** | Task Assist drafts comms + reminders; templates flag `bos_suggest_comms` for first-touch guidance |

---

## 6. Orchestration architecture

### 6.1 Current orchestration / workflow architecture

**Spine:** `workflow_events` → enabled `workflows` → `executeWorkflowRun`

| Capability | Exists? |
|------------|---------|
| Event + workflow execution | **Yes** |
| Status change → events | **Yes** — `opportunity_status_changed`, `child_lifecycle_status_changed` |
| Admin actions → events/workflows | **Yes** — `start_workflow`, `open_form`, status mutations |
| Workflow → messages | **Yes** — `create_message`, `send_message` |
| Workflow → status updates | **Yes** — `update_entity` (case + OCM canonical child path) |
| Workflow → tasks | **No** |
| Workflow → BOS proposals | **No** (BOS proposes workflows; does not receive them) |
| Requirement satisfied → event | **No** |
| Lifecycle Builder → workflows | **No** — builder stores structure only |

**Automations UX:** `/adminV2/workflows` — same engine as workflows tables. Settings “Workflow automation rules” = read-only `status_transition_rules` reference.

Full inventory: [`lifecycle_runtime_orchestration_audit.md`](./lifecycle_runtime_orchestration_audit.md).

### 6.2 Recommended Lifecycle Orchestration section

**Not a new engine.** A **read-only + deep-link** card:

| Subsection | Content |
|------------|---------|
| **Suggested automations** | Per-stage checklist: typical triggers (`opportunity_status_changed`, `form_submitted`, `child_lifecycle_status_changed`) with links to create/enable in Automations |
| **Bound workflows** | Read health: count enabled workflows matching dept scope |
| **Action side effects** | Which placed actions emit events / start workflows |
| **Attention & tasks** | Links to NA profile + task templates for this lifecycle |
| **Waitlist policy** | Link to placement-priority settings when waitlist stage present |

**Disclaimer copy:** “Automated side effects run through **Automations** and **Actions** — stage setup alone does not send messages or change statuses.”

### 6.3 Reuse vs advanced configuration

| Configure in Lifecycle Builder | Keep in Automations (advanced) |
|--------------------------------|--------------------------------|
| Suggested trigger list per stage | Workflow conditions (JSON-path predicates) |
| Enable/disable stage orchestration profile | Ordered workflow action steps |
| Link actions ↔ typical events | Custom `update_entity` payloads |
| Health: “3 workflows reference this dept scope” | Cross-entity chaining, scheduling |
| Task template defaults | Complex multi-branch logic |

### 6.4 Example orchestration patterns (org workflows, not builder JSON)

| Pattern | Trigger | Workflow actions |
|---------|---------|------------------|
| Lead created → contact task | `intake_case_operationalized` or status → `new_inquiry` | Future: create task + optional message |
| Tour scheduled → confirmation | `opportunity_status_changed` → `tour_scheduled` | `send_message` |
| Tour completed → follow-up task | Status → `tour_completed` | Task template + message |
| Waitlisted → waitlist packet | Child → `waitlisted` | `create_action_link` / `open_form` |
| Required info missing → NA | `requirement_violated` (V2) | Set wait bucket or flag (via metadata patch) |
| Child status → roll up case status | `child_lifecycle_status_changed` | `update_entity` on opportunity when org policy defines rollup |

---

## 7. Status ownership model

### 7.1 Current status fields audit

| Field | Table / entity | Role today | Source of truth? |
|-------|----------------|------------|------------------|
| **Case pipeline status** | `opportunities.status_key` | Queue membership (case grain), comms context, most attention | **Yes** for case-coordination domains |
| **Child inquiry / enrollment disposition** | `opportunity_customer_members.outcome_status_key` | Per-child lifecycle; waitlist candidate creation | **Yes** for child enrollment domains |
| **Waitlist ordering grain** | `placement_candidates` | Candidate queue rows (child × site × cohort) | **Yes** for waitlist position — not a “status” column |
| **Canonical household child** | `customer_members.status_key` | Roster membership | **Not** inquiry lifecycle — separate entity |
| **Person** | — | Identity | No pipeline status |
| **Derived rollup** | UI only (`buildOpportunityChildLifecycleSummary`) | Mixed-child headline | **Display only** — does not mutate case status |

**Status definitions:** `status_definitions` partitioned by `entity_type` (`opportunities`, `opportunity_customer_members`, …).

**Stage mapping (builder):** Assigns **opportunity** `status_keys` to builder stages for visibility filters. Child disposition keys are **not** stage-filter inputs in builder-owned queues today (except candidate-grain queues).

### 7.2 Recommended V2 status ownership model

| Grain | Owns | Does not own |
|-------|------|--------------|
| **Opportunity (case)** | Coordination status, tours, threads, case-grain queues, most attention | Per-child enrollment truth |
| **OCM (child inquiry)** | `outcome_status_key`, site/cohort, candidate creation | Case-wide tour schedule alone |
| **Placement candidate** | Waitlist ordering | Case status |
| **Lifecycle Builder** | Which **opportunity** status keys belong to which **stage lens** | Rollup policies, child status filters (until explicitly configured) |

**Doctrine (from child lifecycle closeout):** Opportunity trends toward **broad case states** (`open`, pipeline intermediates, `closed`) while **child disposition** carries enrollment truth. Until migration completes, pipeline `status_key` values remain in active use.

### 7.3 Mixed-child household handling

**Example:** Child A = Enrolled, Child B = Waitlisted on one opportunity.

| Question | V2 answer |
|----------|-----------|
| What should operators see? | Read-only child summary + per-child disposition in drawer |
| What status drives case queue? | **`opportunities.status_key`** — maintained by operator or **org workflow rollup policy** |
| Should case auto-sync from children? | **Not in Builder** — implement as Automations on `child_lifecycle_status_changed` |
| Can one opp appear in multiple stage WUs? | **Yes** for visibility lenses if status matches multiple configured sets (unusual; prefer single case status) |
| Should child-grain WUs exist alongside case-grain? | **Yes, by domain** — waitlist/enrollment lanes use **candidate/child grain**; lead/tour lanes use **case grain** (`queue_definition.grain`) |

### 7.4 Stage filter status source (V2 recommendation)

Support explicit **filter grain** per stage (extends current `queue_definition.grain`):

| Stage domain | Filter source | Example stages |
|--------------|---------------|----------------|
| Case-coordination | `opportunity.status_key` | Lead, Qualification, Tour |
| Child-enrollment | `opportunity_customer_members.outcome_status_key` | Waitlist, Enrolling, Enrolled (child lanes) |
| Candidate-waitlist | `placement_candidates` + OCM | Waitlist ordering views |
| Derived (read-only) | Rollup function | Reporting only — not queue membership |

**Multi-work-unit visibility:** An opportunity may appear in a **case-grain** stage WU and a **child-grain** candidate lane simultaneously when different children match — this is **expected** for mixed households; assignment home remains singular.

---

## 8. Opportunity vs Child status handling (runtime & configuration)

### 8.1 Runtime implications

| Surface | Case status | Child status |
|---------|-------------|--------------|
| Builder stage WU queue (default) | Filters `opportunities.status_key` | Not used unless grain = child/candidate |
| Waitlist candidate queue | Case status may gate domain entry | **OCM + placement_candidates** drive rows |
| Needs Attention | Resolver reads case status + metadata | No per-child NA reasons yet (gap) |
| Actions | Most actions case-grain; child lifecycle actions use OCM grain | `update_status` with child grain |
| BOS / Task Assist | Opportunity context | Child summary read-only in drawer |

### 8.2 Configuration implications

| Setting | Case | Child |
|---------|------|-------|
| Lifecycle Builder status step | Maps opportunity keys → stage | Future: optional OCM key sets for child-grain stages |
| Required Information | OCM-backed “Child” fields | Same — inquiry child snapshots |
| Actions Matrix | Case actions default | Child waitlist/enrollment actions when grain = child |
| Orchestration suggestions | `opportunity_status_changed` | `child_lifecycle_status_changed` |

---

## 9. Work Unit conceptual model

### 9.1 Confirmed V2 model

| Statement | Verdict |
|-----------|---------|
| User configures **lifecycle stages** | **Yes** — primary concept |
| Each stage **produces** a work unit / runtime view | **Yes** — `lifecycle_wu_{stage}` auto-created/repaired |
| Work unit = operational **surface** for a stage | **Yes** |
| Work unit has display name, order, layout mode, presentation | **Yes** — `work_units.name`, `queue_definition`, `lifecycleStageQueuePresentation` |
| Work unit is **not** a peer configuration concept to Stage | **Confirmed** |

### 9.2 Code alignment audit

**Aligned with stage-primary model:**

- `lifecycleStageWorkUnit.ts` — docstring: “One row per builder stage queue”
- `lifecycleWorkUnitShellPills.ts` — “Work Units row = sibling **lifecycle stage** work units”
- `lifecycleVisibilityEvaluator.ts` — stage work unit is **lens anchor**, visibility = status keys
- Guided board saves **Work Unit Queue** as consequence of stage status assignment — not independent lifecycle

**Areas that can feel WU-primary (UX debt, not doctrine conflict):**

| Pattern | Location | Risk | V2 guidance |
|---------|----------|------|-------------|
| Separate “Work Unit Queue” save step | Activation board, `saveLifecycleStageRuntimeConfig.ts` | Operators may think WU is configured independently of stage | Merge into stage save or label “Stage queue view” |
| Validation messages reference work units first | `validateLifecycleActivationRuntime.ts` | WU-centric error copy | Reframe as “stage runtime view” |
| `lifecycleStageWorkUnitIdentity.ts` repair tooling | Scripts/API | Necessary infra — keep internal |
| Legacy `enrollment_pipeline` single WU | Older tenants | Multiple domains inside one WU | Builder-owned mode uses per-stage WUs instead |
| System admin `/admin/system/work-units` | Global WU CRUD | Parallel mental model for non-lifecycle WUs | Scope: lifecycle WUs are **derived from stages**; other depts may still use classic WUs |

**No evidence** that code treats Work Unit as **authoring primary** over Stage in builder-owned mode — WU rows are **generated artifacts** keyed by `lifecycle_stage_key` metadata.

---

## 10. Existing systems to reuse

| # | System | Reuse for V2 |
|---|--------|--------------|
| 1 | `workflow_events` + `executeWorkflowRun` | All automated side effects |
| 2 | `emitStatusChangedEvent` / `emitChildLifecycleStatusChangedEvent` | Status-driven orchestration |
| 3 | `executeAdminAction` + `action_placements` | Operator-initiated mutations |
| 4 | `lifecycle_progression_requirements_v1` + builder stage field rules | Required Information |
| 5 | `lifecycleFieldRuleEvaluator` + action preflight catalog | Enforcement spine |
| 6 | Forms lifecycle contract adapter | Required info ↔ forms coverage |
| 7 | `resolveOpportunityAttention` + bucket metadata | Needs Attention |
| 8 | `operational_tasks` + Task Assist | Tasks section |
| 9 | `lifecycleVisibilityEvaluator` | Stage visibility lenses |
| 10 | `lifecycle_wu_*` work units | Stage runtime surfaces |
| 11 | `buildOpportunityChildLifecycleSummary` | Mixed-child UX |
| 12 | BOS operational recommendations | “What’s next” — hand off to actions/workflows |
| 13 | `status_definitions` + status-stages API | Status ownership vocabulary |
| 14 | `placement_candidates` + QueueService v2 | Waitlist candidate grain |

**Do not build:** Parallel rules engine, second workflow runner, lifecycle-owned task table, builder-embedded workflow CRUD.

---

## 11. Recommended roadmap

### Phase 0 — Discovery complete (this document)

Lock V2 sections, enforcement levels, status grain model, WU doctrine.

### Phase 1 — Required Information polish (low risk)

- Remove `(config only)` operator copy; show enforcement levels
- Document stage → forms coverage in builder
- Align activation validation messaging with enforcement levels

### Phase 2 — Needs Attention lifecycle profile

- Dept metadata schema for `lifecycle_attention_profile_v1`
- Settings UI: bucket authoring (extend Attention & SLA) + builder link-back
- New reason codes: `missing_required_info`, `operational_task_overdue` (platform)
- Stage → reason mapping in guided board (read-only preview first)

### Phase 3 — Task templates

- Metadata schema `lifecycle_stage_task_templates_v1`
- Stage-entry hook or workflow action type `create_operational_task`
- Improve `create_task` action → opportunity-scoped create modal
- Builder Tasks section (template CRUD)

### Phase 4 — Orchestration linkage card

- Read-only health: workflows by dept scope, suggested triggers per stage
- Deep links to Automations; no embedded workflow editor
- Optional: `requirement_satisfied` / `requirement_violated` events

### Phase 5 — Status grain expansion

- Child-grain stage filters for waitlist/enrollment builder stages
- Mixed-household rollup workflow templates (seed disabled-by-default)
- Candidate-grain NA reasons

### Phase 6 — Unified requirements spine

- Merge lifecycle field rules into `evaluateEffectiveRequirements`
- Transition blockers consume same evaluator
- BOS reads unified `RequirementValidationResult`

---

## 12. Risks and open decisions

### Risks

| Risk | Mitigation |
|------|------------|
| Operators conflate Builder with Automations | Orchestration card disclaimer + training; never hide Automations |
| Config-only required fields erode trust | Enforcement level UX; progressive promotion to enforced |
| Case vs child status drift | Workflow rollup templates; drawer mixed-child copy; strict-mode audit tooling |
| NA reason proliferation | Platform catalog governance; no arbitrary expressions |
| Task template spam on stage re-entry | Idempotent template keys; fire once per stage entry |
| WU repair complexity | Keep stage-keyed identity; dedupe scripts |
| Performance (attention + field eval on queue fetch) | Batch resolver context (already exists); cache per request |

### Open decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Where do task templates live? | Dept metadata vs `lifecycle_builder_v1` nested | Nested under builder process config |
| 2 | Who creates tasks on stage entry? | Server hook vs workflow action | Workflow action long-term; hook for MVP |
| 3 | Child-grain stage filters in builder status step? | Opportunity keys only vs dual picker | Dual picker for waitlist/enrollment stages |
| 4 | Case status rollup | Manual vs workflow-only vs platform policy table | Workflow-only (org-configured) for V2 |
| 5 | `missing_required_info` scope | Enforced rules only vs all required | Enforced only initially |
| 6 | NA as separate stage? | Yes vs overlay | **Overlay** (locked — not a stage) |
| 7 | Merge Required Info with Layouts requiredness? | Single vs layered | Layered — lifecycle rules = progression; layouts = capture UX |
| 8 | BOS auto-apply task templates? | Human-only vs suggest | Human-only (BOS doctrine) |

---

## Appendix A — Key files inspected

| Area | Paths |
|------|-------|
| Required info | `lifecycleFieldRequirementsCatalog.ts`, `lifecycleFieldRuleBindings.ts`, `lifecycleFieldRuleEvaluator.ts`, `lifecycleBuilderStageFieldRules.ts`, `lifecycle-requirements/route.ts`, `LifecycleStageFieldRequirementsEditor.tsx` |
| Forms | `resolveFormsLifecycleRequirementContract.ts`, `validatePublicSubmissionLifecycleRequirements.ts` |
| Preflight | `lifecycleActionRequirementCatalog.ts`, `adminActionPreflight.ts` |
| Needs Attention | `opportunityAttentionResolver.ts`, `needsAttentionBuckets.ts`, `attentionReasonCriteriaCatalog.ts`, `QueueService.ts`, `LifecycleNeedsAttentionCard.tsx` |
| Tasks | `operationalTasksService.ts`, `05_2026/task_system_audit_v1.md` |
| Workflows | `emitEvent.ts`, `workflowRun.ts`, `lifecycle_runtime_orchestration_audit.md` |
| Status / child | `buildOpportunityChildLifecycleSummary.ts`, `updateOpportunityCustomerMemberLifecycleStatus.ts`, child lifecycle closeout |
| Work units | `lifecycleStageWorkUnit.ts`, `lifecycleVisibilityEvaluator.ts`, `lifecycleWorkUnitShellPills.ts`, `builderOwnedLifecycleRuntime.ts` |
| Visibility architecture | `lifecycle_visibility_vs_ownership_architecture.md` |

---

## Appendix B — V1 vs V2 section mapping

| V1 builder step | V2 section | Change |
|-----------------|------------|--------|
| Lifecycle / dept | Stages (process root) | Same |
| Stage list | Stages | + custom CRUD (future) |
| Required information | Required Information | + enforcement levels, NA bridge |
| Statuses | Stages (status mapping sub-step) | + optional child-grain |
| Work unit queue | Stages (runtime view) | Reframe copy — not separate concept |
| Actions | Actions | Same + matrix UX |
| Forms coverage | Required Information (subsection) | Same |
| Needs attention (link-out) | Needs Attention | + lifecycle profile authoring |
| Runtime validation | Stages (activation) | Same |
| — | Tasks | **New** |
| — | Orchestration | **New** (link-out + health) |

---

*End of discovery document — implementation paused pending product sign-off on open decisions.*
