# Operational Stack Configuration Roadmap Audit

**Path:** `docs/sprints/06_2026/operational_stack_configuration_roadmap_audit.md`  
**Status:** Audit complete — no implementation, no schema changes  
**Date:** June 2026  
**Scope:** Lifecycle → Readiness → Needs Attention → Operational Work → Actions → Automations → BOS

**Related docs:**

- `lifecycle_v2_discovery_and_operating_model.md`
- `required_information_v2_operational_readiness_framework.md`
- `needs_attention_v2_operating_model.md`
- `operational_work_framework_v1.md`
- `operational_work_v1_implementation_plan.md`
- `lifecycle_runtime_configuration_alignment_sprint.md`
- `docs/system/configuration-system.md`
- `docs/system/actions-and-workflows.md`

---

## Executive answer

**We are building a hybrid stack — not a fully hardcoded OS, but not yet a fully configurable one either.**

| Layer | Today | Long-term target |
|-------|-------|------------------|
| **Lifecycle** | **Partially configurable** (Builder + metadata) | **Builder-configurable** flow; platform owns invariants |
| **Readiness** | **Partially configurable** (per-stage field rules in Builder) | **Builder-configurable** requirements; platform owns rule catalog + evaluator |
| **Needs Attention** | **Partially configurable** (dept/WU metadata thresholds + buckets) | **Lifecycle-profile configurable**; platform owns reason codes + math |
| **Operational Work** | **Mostly hardcoded runtime** (manual/task_assist only) | **Builder-configurable definitions**; platform owns shapes + service |
| **Actions** | **Configurable** (definitions + placements) | **Admin configurable** placement/enablement; platform owns handlers |
| **Automations** | **Partially configurable** (workflow graphs) | **Builder/admin configurable** triggers + effects; platform owns action types |
| **BOS** | **Policy-configurable only** (`ai_policy`) | **Not a configuration layer** — reads, explains, proposes |

**Core principle:** Platform owns **catalogs, evaluators, and invariants**. Lifecycle Builder owns **what applies to this department's operating model**. Settings owns **cross-cutting org policy**. BOS never owns configuration truth.

**Risk to avoid:** Encoding business logic only in TypeScript resolver branches instead of metadata profiles — that path produces a powerful but hardcoded operating system.

---

## 1. Current configurability matrix

Legend: **C** = configurable today · **P** = partially configurable · **H** = hardcoded · **S** = seeded/default · **R** = runtime-only (computed, not stored as config)

### 1.1 Lifecycle

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Stage list & order | **C** | `departments.metadata.lifecycle_builder_v1` | `departments` · Lifecycle Builder · `saveLifecycleStageRuntimeConfig` | Creates/syncs WUs, statuses, queue views |
| Status keys per stage | **C** | Same + `status_definitions` | Builder save path | Denormalized to `metadata.status_keys` on WU |
| Work unit queue views | **C** | `work_units.queue_definition` | Builder · `queueDefinitionSchema` | Validated JSON v1 |
| Stage visibility / operator mapping | **P** | Builder metadata + code | `lifecycleStageVisibility.ts`, `lifecycleStageWorkspaceMapping.ts` | Palette and stage-key semantics partly platform |
| Guided board / workspace chrome | **P** | Builder + hardcoded shell | `lifecycleWorkUnitShellPills.ts` | NA row placeholder is structural, not config |
| Lifecycle templates (vertical presets) | **S** | Seed scripts / migrations | `ensureEnrollmentPipelineWorkUnitV1`, etc. | Childcare enrollment is seeded; editable after seed |
| Platform stage key vocabulary | **H** | Code | `lifecycleStageKeys.ts`, canonical vocabulary doc | Cross-lifecycle invariants |
| Transition rules (status machine) | **P** | Settings → Status transition rules + code | `status-transition-rules` page | Not fully unified with Builder |
| Department tile / workspace entry | **R** | Derived from department record | Workspace routes | — |

**Config surfaces:** Settings → Lifecycle (`/adminV2/settings/lifecycle`), Lifecycle Builder cards, Enrollment Process hub (partial).

---

### 1.2 Required Information / Readiness

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Per-stage required field rule IDs | **C** | `departments.metadata.lifecycle_builder_stage_field_rules_v1` | Builder · `LifecycleStageFieldRequirementsEditor` | `required_rule_ids`, `recommended_rule_ids` |
| Per-rule requirement level (Off/Recommended/Required/Enforced) | **C** | `rule_levels_v1.by_rule_id` in same metadata | Builder · `lifecycleBuilderRequirementLevelsUi.ts` | Suggested = template-only, not operator-facing |
| Platform field rule catalog | **H** | Code | `lifecycleFieldRuleCatalog.ts`, `readinessTypes.ts` | Rules like `person:email`, `child:dob` |
| Rule evaluator plugins | **H** | Code | `lifecycleFieldRuleEvaluator.ts`, `evaluateOperationalReadiness.ts` | Freshness, packet, relationship = not configurable |
| Readiness gate on status transition | **P** | Stage rules + transition code | `evaluateOperationalReadiness`, action preflight | Enforced blocks; Recommended warns |
| Readiness display hint | **R** | `opportunities.metadata.readiness_hint_v1` | Re-evaluated on gate; display only | Never trusted for execute |
| Readiness → NA bridge | **P** | `opportunity_attention_rules.readiness_projection_v1` | Settings → Attention & SLA | Flags missing required as attention |
| Public form submission gate | **P** | Code default (Enforced only) | `validatePublicSubmissionLifecycleRequirements` | Org policy hook planned |

**Config surfaces:** Lifecycle Builder → Required Information card per stage.

---

### 1.3 Needs Attention

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Reason code catalog | **H** | Code | `attentionPlatformCatalog.ts` | ~30+ platform codes |
| Trigger / resolver math | **H** | Code | `opportunityAttentionResolver.ts`, `opportunityAttentionRules.ts` | Opportunity-grain evaluation |
| Threshold hours (stale windows) | **C** | `metadata.opportunity_attention_rules.thresholdsHours` | Settings → Attention & SLA · dept/WU metadata | Requires `version === 1` |
| Stale day windows (high value, mid funnel) | **C** | `stale_high_value_days`, `stale_mid_funnel_days` | Same | Status allow-lists still platform |
| Wait-bucket SLA hours | **C** | `sla_wait_hours.*` | Same | Tied to `enrollment_operational.wait_bucket` |
| Attention buckets (lenses) | **C** | `needs_attention_buckets[]` | Same · `enrollmentNeedsAttentionBucketsSeed.ts` | WU overrides dept |
| Per-reason enable flags | **C** | `enabled_reason_codes` / bucket membership | Same | Not all codes exposed in UI |
| Priority score weights | **P** | `priority_score_v1` in metadata | Same | Advanced; partially wired |
| Stage → reason mapping | **H** | Code reference | `lifecycleStageWorkspaceMapping.ts` → `STAGE_NEEDS_ATTENTION` | Builder card is read-only link-out |
| Builder NA configuration | **H** (link only) | — | `LifecycleNeedsAttentionCard.tsx` → settings | No lifecycle-scoped NA editor yet |
| Default bucket presets | **S** | Seed on WU ensure | `CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED` | Editable after seed |
| Resolver output | **R** | — | Queue fetch, dept lane, drawer badges | Not persisted as config |

**Config surfaces:** Settings → Attention & SLA Rules (`/adminV2/settings/attention-sla-rules`).

---

### 1.4 Operational Work

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Work record persistence | **H** (schema) | `operational_tasks` table | `operationalTasksService` | Task is default shape |
| Work creation paths | **H** | Code | Manual UI, Task Assist, `create_task` action (partial) | No lifecycle templates yet |
| Work categories (8) | **H** | Code | `operationalWorkTypes.ts` | follow_up, scheduling, etc. |
| Work metadata conventions | **S** | JSON on create | `operationalWorkMetadata.ts` | `work_framework_version`, `shape`, `provenance` |
| Work definitions / templates | **H** | — | Planned `lifecycle_work_definitions_v1` | Not built |
| Work triggers (stage entry, NA, etc.) | **H** | — | Planned workflow `instantiate_work` | Phase 3+ |
| Assignee resolution (role → user) | **H** | — | Phase 2 metadata | UUID assignee only today |
| Recurring / checklist templates | **H** | — | Deferred | Explicitly out of PR1 |
| My Work / drawer strip UX | **H** (behavior) | Code | `MyTasksModal`, `OpportunityOperationalCompactStrip` | Surfaces exist; create path incomplete |
| NA overdue signal | **H** | — | `operational_task_overdue` reason planned | Via task sync, not separate rule engine |

**Config surfaces:** None dedicated. Work is runtime-only today.

---

### 1.5 Actions

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Action definitions (key, handler, label) | **C** | `action_definitions` | Settings → Actions · seeds/migrations | Org overrides platform keys |
| Action placements (surface, visibility) | **C** | `action_placements` | Settings → Actions · Lifecycle Builder matrix | Header, section, queue, right rail |
| Handler implementation | **H** | Code | `executeAdminAction.ts` | Settings cannot change semantics |
| Preflight / readiness gates | **H** | Code | Per-handler in execute path | Wired to readiness evaluator |
| Lifecycle Builder action matrix | **C** | Placements + builder context | Builder Actions card | Mirrors Settings |
| Legacy / placeholder actions | **S** | Migrations | `_*_placeholder` keys | e.g. `move_to_waitlist` inactive |
| Queue row / drawer hardcoded buttons | **P** | Mixed | Some surfaces not fully registry-backed | Migration in progress |

**Config surfaces:** Settings → Actions (`/adminV2/settings/actions`), Lifecycle Builder → Actions per stage.

---

### 1.6 Automations (Workflows)

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Workflow definitions (graph) | **C** | `workflow_definitions` | `/adminV2/workflows` | Org-scoped JSON graphs |
| Workflow event subscriptions | **C** | Definition + `workflow_events` | Workflow builder / seeds | Registered event keys |
| Workflow action types | **H** | Code | `workflowRun` executor | create_message, update_entity, start_workflow, etc. |
| `instantiate_work` effect | **H** | — | Planned PR3 | Not in executor yet |
| Scope partitions (dept/WU) | **P** | `workflowScopeMetadata` | Workspace KPI surfaces | Metadata on definitions |
| Workflow Assist (AI draft) | **P** | `ai_policy.allowed_features` | Org metadata | Proposal only; human applies |
| Trigger catalog | **H** | Code | Registered event keys | Cannot add arbitrary triggers in UI |

**Config surfaces:** AdminV2 Workflows hub, Workflow Assist cards on workspace.

---

### 1.7 BOS (Business Operating System / Agent layer)

| Dimension | Status | Where configured | Owner table/service/UI | Notes |
|-----------|--------|------------------|------------------------|-------|
| Capability registry | **H** | Code | `bosCapabilityRegistry.ts` | Developer-owned catalog |
| Recommendation resolver keys | **H** | Code | `operationalRecommendationResolver.ts` | Maps context → suggestions |
| AI feature enablement | **C** | `org_settings.metadata.ai_policy` | Org-level metadata | `allowed_features`, `provider` |
| Task Assist / Workflow Assist | **P** | `ai_policy` + code paths | Feature flags | Deterministic default; LLM optional |
| Config Layout Assist proposals | **P** | BOS proposal apply path | Settings → Config proposals | Proposes layout changes; human applies |
| Apply / write policy | **H** | Code | BOS capability definitions | Per-capability permissions |
| Operational summary / reasoning | **P** | `ai_policy` + runtime | Drawer / command surfaces | Read-heavy |

**Config surfaces:** Org `ai_policy` (internal/admin); no operator-facing "BOS settings" page.

---

## 2. Target configurability matrix

| Layer | Admin configurable | Builder configurable | System seeded, editable | Developer-only | Not configurable |
|-------|-------------------|---------------------|-------------------------|----------------|------------------|
| **Lifecycle** | Dept rename, visibility profiles | Stages, statuses, queues, WU mapping | Vertical presets (enrollment) | Stage key vocabulary, visibility engine | Platform invariants (org scoping, audit) |
| **Readiness** | — | Per-stage rules + levels | Default rule sets per template | Rule catalog, evaluator plugins | Evaluation algorithm, enforce semantics |
| **Needs Attention** | Global SLA defaults (org) | Lifecycle attention profile (buckets, enabled reasons, stage overrides) | Bucket presets per vertical | Reason codes, resolver math | Attention ≠ work creation |
| **Operational Work** | Org-wide defaults (due offsets, categories visibility) | Work definitions, stage templates, suggested actions | Starter templates per lifecycle | Categories enum, service API, shapes | Work record schema invariants |
| **Actions** | Enable/disable, labels, placements | Stage action matrix | Platform action seeds | Handlers, preflight logic | Execute semantics via Settings |
| **Automations** | Enable/disable workflows | Trigger ↔ effect bindings per lifecycle | Event key catalog | New action types, event registry | Workflow runtime engine |
| **BOS** | AI policy features | — | Default off | Capability registry, resolver | BOS does not own config truth |

---

## 3. Hardcoded vs seeded vs configurable inventory

### Platform-hardcoded (intentional — do not move to admin UI)

- Attention reason codes and evaluator (`attentionPlatformCatalog`, `opportunityAttentionResolver`)
- Readiness rule catalog and evaluator plugins
- Action handler implementations (`executeAdminAction`)
- Workflow executor action types
- BOS capability registry and recommendation resolver mappings
- Lifecycle platform stage key vocabulary
- Operational work service API and shape invariants
- Org scoping, RLS, audit, permission guards

### Seeded / defaulted (editable after provision)

- Enrollment pipeline WU + NA buckets (`ensureEnrollmentPipelineWorkUnitV1`, bucket seed)
- Platform `action_definitions` and placements (migrations)
- Lifecycle builder templates (childcare enrollment palette)
- Default `opportunity_attention_rules` thresholds when WU created
- `ai_policy` defaults (all enrichment off)
- Operational work metadata v1 on create (`work_framework_version: 1`)

### Configurable today (operator-facing)

- Lifecycle Builder: stages, field rules, action matrix, queue views
- Settings → Actions: definitions + placements
- Settings → Attention & SLA: thresholds, buckets, SLA hours
- Settings → Statuses, layouts, fields, communications
- Workflow definitions (graph editor)
- Org `ai_policy` feature flags

### Runtime-only (never stored as configuration)

- Readiness evaluation result (`ReadinessResult`)
- Needs Attention resolver matches (computed per fetch)
- BOS recommendations (computed per context)
- Queue row priority explanations
- `readiness_hint_v1` (display cache only)

---

## 4. Recommended configuration ownership model

### Layer responsibilities (validate / revise)

| Layer | Owns | Does not own | Configures |
|-------|------|--------------|------------|
| **Lifecycle** | Operational flow structure: stages, statuses, queues, WU grain | Reason math, work instances, action handlers | Where records live in the pipeline |
| **Readiness** | Advancement requirements: what must be true to progress | Attention surfacing (except explicit bridge flag) | Field/rule levels per stage |
| **Needs Attention** | Risk/awareness detection config: thresholds, buckets, enabled reasons | Work obligations, action execution | What appears in NA lanes — not tasks |
| **Operational Work** | Human obligations: definitions, templates, assignments | Status transitions, automated side effects | What someone must do — not why NA fired |
| **Actions** | Execution options: buttons, modals, side effects on demand | Persistent obligations (that's work) | One-click operator moves |
| **Automations** | System-performed effects on events | Human queue semantics | Trigger → effect graphs |
| **BOS** | Explain, recommend, prioritize, propose | Any configuration truth | Nothing — apply path only |

**Validated:** This boundary model is correct and matches shipped doctrine across sprint docs.

**Revisions:**

1. **Readiness ↔ NA bridge** is a *projection config* (`readiness_projection_v1`), not readiness owning attention. Keep bridge flags in the NA/lifecycle-attention profile, fed by readiness evaluator output.
2. **Actions ↔ Work:** `create_task` is an action that *instantiates* work — action configures the button; work definition (future) configures default title/due/category.
3. **Automations ↔ Work:** `instantiate_work` is the automation path to create work — automation configures *when*; work definition configures *what*.
4. **Lifecycle Builder** should become the **primary home** for lifecycle-scoped config (readiness, attention profile, work definitions, action matrix). Settings remains **org-wide** and **cross-cutting**.

### Storage ownership (recommended)

| Config domain | Primary store | Secondary / override |
|---------------|---------------|----------------------|
| Lifecycle structure | `departments.metadata.lifecycle_builder_v1` | — |
| Stage field rules | `departments.metadata.lifecycle_builder_stage_field_rules_v1` | — |
| Attention profile | `departments.metadata.lifecycle_attention_profile_v1` (future) | WU `opportunity_attention_rules` override |
| Work definitions | `departments.metadata.lifecycle_work_definitions_v1` (future) | — |
| Actions | `action_definitions` + `action_placements` | Builder mirrors placements |
| Workflows | `workflow_definitions` | Scope metadata on definition |
| AI / BOS policy | `org_settings.metadata.ai_policy` | — |

**Anti-pattern:** Spraying unrelated config into `opportunity_attention_rules` forever. Migrate to named profiles under lifecycle builder metadata with composable override precedence (dept → WU).

---

## 5. Recommended admin UX grouping

### Normal admin (visible, guided)

| Group | Location | Contents |
|-------|----------|----------|
| **Your process** | Lifecycle Builder | Stages, required info, actions per stage |
| **Alerts & SLAs** | Builder → Attention card (embedded editor) | Buckets, stale thresholds, wait SLAs |
| **Work templates** | Builder → Operational Work card (future) | Stage-entry checklists, follow-up defaults |
| **Buttons & shortcuts** | Settings → Actions (linked from Builder) | Enable/disable, labels |
| **Automations** | Workflows hub (linked from Builder) | Pre-built workflow toggles |

### Advanced settings (power users)

| Group | Location | Contents |
|-------|----------|----------|
| **Attention tuning** | Settings → Attention & SLA (full) | Per-reason enable, priority weights, readiness bridge |
| **Status machine** | Settings → Status transition rules | Non-builder transitions |
| **Queue definitions** | Settings → Work units | Raw queue JSON (or advanced editor) |
| **AI features** | Settings → (future AI policy page) | Provider, feature flags |
| **Config proposals** | Settings → Config proposals | BOS-assisted layout changes |

### Seeded defaults only (hide unless customizing)

- Platform reason code catalog (show names, not implementation)
- Vertical preset templates (enrollment palette)
- Suggested readiness level (template hardening)
- Work category enum (show labels; don't expose raw keys)
- Workflow event key registry

### Developer / internal only (for now)

- `bosCapabilityRegistry` entries
- New attention reason implementations
- New readiness rule plugins
- New workflow action types
- Handler code in `executeAdminAction`

### UX principle: **Configuration hub per lifecycle**

Consolidate scattered surfaces into Lifecycle Builder tabs:

1. **Stages** (existing)
2. **Required Information** (existing)
3. **Needs Attention** (move from link-out to embedded profile)
4. **Operational Work** (new — templates & triggers)
5. **Actions** (existing matrix)
6. **Automations** (link + lifecycle-scoped filter)

Settings → Lifecycle hub remains the entry; Enrollment Process hub becomes one vertical instance of this pattern.

---

## 6. Operational Work configurability roadmap

### Phase 1 — Runtime foundation (current / PR1–PR2)

**Goal:** Correct runtime spine without config UI.

| Item | Configurable? | Delivery |
|------|---------------|----------|
| Work service facade | No | PR1 ✓ |
| Metadata conventions (`shape`, `provenance`, `category`) | Seeded on create | PR1 ✓ |
| Manual create (My Work, drawer strip) | No — freeform | PR2 |
| `create_task` action handler fix | Uses action placement config | PR2 |
| Assignee PATCH (UUID) | No | PR2 |

**Exit:** Operators can create/complete work manually; no templates.

### Phase 2 — Lifecycle work templates (config in metadata)

**Goal:** Builder-defined defaults; still no recurring/checklists.

| Item | Configurable? | Storage |
|------|---------------|---------|
| **Work definitions** (title, category, default due offset, description) | **Builder** | `lifecycle_work_definitions_v1.definitions[]` |
| **Stage → work template bindings** (on stage entry suggest/create) | **Builder** | `lifecycle_work_definitions_v1.stage_bindings` |
| **Suggested actions** on work strip (quick-create from definition) | **Builder** | References definition IDs |
| Role-based assignee hint | **Builder** | `default_assignee_role_key` → resolved at create |
| Work categories visibility | **Admin** | Org metadata filter on enum |

**Not in Phase 2:** recurring schedules, checklist item editors, NA-triggered auto-create.

### Phase 3 — Triggers & automation binding

**Goal:** System can instantiate configured work.

| Item | Configurable? | Storage |
|------|---------------|---------|
| **Work triggers** (stage entered, action completed, NA reason fired) | **Builder** | `lifecycle_work_definitions_v1.triggers[]` |
| Workflow `instantiate_work` step | **Automation** | Workflow graph node |
| Idempotency / dedupe (`template_id`) | Platform | Service logic |
| NA `operational_task_overdue` reason | **NA profile** | Enables signal; does not create work |

### Phase 4+ — Advanced work shapes

| Item | Phase | Notes |
|------|-------|-------|
| Checklist templates | 4 | `shape: "checklist"`, sub-items in metadata |
| Recurring work | 4+ | `shape: "recurring"`, schedule config |
| Work categories (custom) | 5+ | Only if enum proves insufficient |
| Team queues | 5+ | `assigned_team_id`, team inbox view |

### What belongs where

| Concept | Owner layer | Not duplicated in |
|---------|-------------|-------------------|
| Work Definitions | Operational Work config | NA, Readiness |
| Work Triggers | Operational Work + Automations | NA resolver |
| Suggested Actions | Operational Work (UI) + Actions (execute) | — |
| Overdue signal | NA (reads open work) | Work config |
| Required fields before stage | Readiness | Work templates |

---

## 7. Needs Attention configurability roadmap

### Current state

- **Reason codes:** platform-hardcoded
- **Thresholds + buckets:** department/WU metadata (Settings)
- **Stage relevance:** hardcoded reference map
- **Builder:** read-only link to Settings

### Recommended reason ownership model

| Reason class | Configuration level |
|--------------|---------------------|
| Universal platform reasons (`missing_identity`, `follow_up_date_passed`) | Seeded on; toggled in lifecycle profile |
| Lifecycle-specific reasons (`missing_quote_after_execution`) | Enabled per lifecycle profile |
| Stage-scoped thresholds | Lifecycle profile `stage_rules[stageKey].threshold_overrides` |
| Vertical bucket presets | Seeded; editable in Builder |
| Custom operator-defined reasons | **Not Phase 1–3** — requires new evaluator framework |

**Answer to "fully custom?":** No for v1/v2. Target = **lifecycle-level configurable** selection and tuning atop **platform-owned catalog**.

### Phased path

**Phase 1 (now):** Keep Settings → Attention & SLA; document codes in criteria catalog (`attentionReasonCriteriaCatalog.ts`).

**Phase 2:** Introduce `lifecycle_attention_profile_v1` in Builder:
- Move bucket editor into Builder Attention card
- `enabled_reason_codes` per lifecycle
- `stage_rules` for threshold overrides
- Deprecate duplicative dept-only editing for builder-owned lifecycles

**Phase 3:** Readiness + work bridges:
- `missing_required_info` ← readiness evaluator (config: on/off per stage)
- `operational_task_overdue` ← open work query (config: on/off, min overdue hours)

**Phase 4+:** Department-level override remains for non-builder legacy WUs; no per-operator custom reasons.

### NA ↔ Operational Work (avoid duplication)

```
Readiness evaluator ──bridge──► NA reason (missing_required_info)
                                      │
                                      ▼ (awareness only)
                                 NA bucket / lane
                                      │
Open work (due_at) ──signal──► NA reason (operational_task_overdue)
                                      │
                                      ✗ does NOT create work

Work trigger (Phase 3) ──may──► instantiate_work
         ▲
         └── separate config path; optional correlation to NA reason
```

**Rule:** NA answers "what needs awareness?" Work answers "what is assigned?" Same underlying data may inform both, but **only work config creates obligations**.

---

## 8. Readiness configurability roadmap

### Current state (Phase 1 shipped)

- Builder UI: Off / Recommended / Required / Enforced per rule per stage
- Storage: `lifecycle_builder_stage_field_rules_v1` + `rule_levels_v1`
- Runtime: `evaluateOperationalReadiness` on transition preflight
- Bridge: optional NA projection flags

### Gaps (hardcoded today)

| Gap | Target config | Phase |
|-----|---------------|-------|
| Rule catalog extensibility | Platform catalog only; Builder picks from list | 2 |
| Freshness rules ("updated within N days") | Builder: days per stage | 2 |
| Relationship rules ("primary contact exists") | Builder toggle per stage | 2 |
| Packet / document completeness | Builder: required doc types per stage | 3 |
| Public form gate policy | Org setting: block on Recommended vs Enforced | 2 |
| Readiness UX in drawer | Display only; link to Builder | 1 ✓ |

### Recommended UX cleanup

1. **Unify terminology:** "Required Information" in Builder, "Readiness" in runtime/engine docs — operator-facing label stays *Required Information*.
2. **Rule picker grouped by entity** (Person, Child, Opportunity) — already partially present; hide platform rule IDs.
3. **Stage summary chip** in Builder: "4 required, 2 enforced" — reduces need to open each rule.
4. **Move readiness bridge toggles** from Attention Settings into Builder → Attention card (per stage: "Surface missing required in Needs Attention").
5. **Do not** expose `rule_levels_v1` JSON — always use the four-level operator UI.

### Phased path

**Phase 1 (done):** Per-stage field rules + enforce on transition.

**Phase 2:** Freshness + relationship rules in catalog with Builder toggles; org public-form policy.

**Phase 3:** Packet/document rules tied to documents config; cross-stage inherited requirements (template-level defaults).

**Phase 4+:** Custom org rules (new rule IDs) — developer-assisted, not self-serve expression builder.

---

## 9. Risks and anti-patterns

### Risk: Hardcoded resolver sprawl

**Symptom:** Each new operator rule adds an `if (deptKey === 'enrollment')` branch.  
**Mitigation:** Lifecycle attention profile selects from platform catalog; no forked math per tenant.

### Risk: NA becomes a second work queue

**Symptom:** NA reasons that auto-create tasks; bucket rows that assign work.  
**Mitigation:** Frozen doctrine — NA never creates work. Work triggers are separate config with explicit automation path.

### Risk: Readiness and NA duplicate "missing field" semantics

**Symptom:** Both show missing fields with different copy and triggers.  
**Mitigation:** Single evaluator (`evaluateOperationalReadiness`); NA bridge is a projection with one config flag.

### Risk: Over-configuration in Builder

**Symptom:** Operators must set 40 thresholds per stage; empty defaults break UX.  
**Mitigation:** Vertical presets seed sensible profiles; Builder shows "customized" vs "using defaults"; advanced tuning collapsed.

### Risk: Actions vs Work confusion

**Symptom:** `create_task` action duplicated across 6 placements with different defaults.  
**Mitigation:** Action = execute; work definition = defaults. Action references definition ID (Phase 2).

### Risk: Configuration scattered across metadata keys

**Symptom:** `opportunity_attention_rules`, `lifecycle_builder_v1`, loose dept metadata — unclear precedence.  
**Mitigation:** Named profiles under lifecycle builder; documented override chain (org → dept profile → WU override).

### Risk: BOS as shadow config layer

**Symptom:** Operators ask BOS to "change the rule" and it patches metadata ad hoc.  
**Mitigation:** BOS proposes; human applies via Builder/Settings; config proposals audited.

### Risk: Building work definitions before action/work split is clear

**Symptom:** Templates that fire actions instead of tracking obligations.  
**Mitigation:** Complete PR2 manual work path before Phase 2 templates.

---

## 10. Recommended next implementation sequence

This sequence prioritizes **configuration clarity** without expanding hardcoded runtime.

| Order | Initiative | Layer | Rationale |
|-------|------------|-------|-----------|
| **1** | PR2 — manual work create + `create_task` fix | Operational Work | Runtime before config |
| **2** | Lifecycle Builder Attention card (embedded profile v1) | Needs Attention | Moves NA config where operators expect it |
| **3** | `lifecycle_attention_profile_v1` metadata + migration from `opportunity_attention_rules` | Needs Attention | Single lifecycle-scoped home |
| **4** | Readiness bridge toggles into Builder Attention card | Readiness + NA | One UX for "surface missing required" |
| **5** | PR3 — assignee + workflow `instantiate_work` | Work + Automations | Enables trigger path |
| **6** | `lifecycle_work_definitions_v1` schema (metadata only) + Builder card (read-only list) | Operational Work | Config model before automation |
| **7** | Work definition editor in Builder (definitions + stage bindings) | Operational Work | Phase 2 config |
| **8** | `operational_task_overdue` NA plugin | Needs Attention | Signal without work duplication |
| **9** | Work triggers in Builder + workflow binding | Work + Automations | Phase 3 |
| **10** | Freshness/relationship readiness rules in catalog | Readiness | Phase 2 evaluator expansion |
| **11** | Checklist shape + templates | Operational Work | Phase 4 |
| **12** | Configuration hub spec implementation (enrollment → generic lifecycle) | Lifecycle UX | Cross-cutting polish |

**Defer:** Custom attention reasons, custom readiness rule DSL, recurring work, team queues, per-operator NA profiles.

**Parallel (non-blocking):** Action registry migration (remove hardcoded queue buttons), `move_to_waitlist` activation, AI policy admin page.

---

## Appendix A — Configuration surface map (today)

| Surface | Route / component | Layers touched |
|---------|-------------------|----------------|
| Lifecycle Builder | `/adminV2/settings/lifecycle` | Lifecycle, Readiness, Actions (partial) |
| Attention & SLA | `/adminV2/settings/attention-sla-rules` | Needs Attention |
| Actions | `/adminV2/settings/actions` | Actions |
| Workflows | `/adminV2/workflows` | Automations |
| Statuses / transitions | `/adminV2/settings/statuses`, `status-transition-rules` | Lifecycle |
| Layouts / fields | `/adminV2/settings/layouts`, `fields` | Readiness (display), Actions (sections) |
| Config proposals | `/adminV2/settings/config-proposals` | BOS apply path |
| Enrollment Process hub | `/adminV2/settings/enrollment-process` | Vertical config rollup |
| Org AI policy | metadata (no dedicated UI) | BOS |

---

## Appendix B — Decision log

| Decision | Resolution |
|----------|------------|
| Are we building hardcoded platform behaviors? | **Partially today** for evaluators and catalogs — intentional platform ownership |
| Should they become configurable? | **Selection and tuning yes; math and invariants no** |
| Who owns lifecycle-scoped config long-term? | **Lifecycle Builder profiles**, not scattered Settings pages |
| Does BOS own configuration? | **No** — read/explain/recommend/propose only |
| Can operators define custom attention reasons? | **Not in v2** — lifecycle selects from platform catalog |
| When does Operational Work become configurable? | **Phase 2** (templates in Builder) after PR2 runtime |

---

**End of audit.** No code changes. No schema changes. Use this document to gate implementation PRs against accidental hardcoding.
