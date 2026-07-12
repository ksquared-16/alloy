# Lifecycle Canonical Vocabulary

**Path:** `docs/sprints/archive/06_2026/completed/lifecycle_canonical_vocabulary.md`  
**Date:** 2026-06-02  
**Status:** **Frozen** — canonical reference for Lifecycle domain work beginning with Required Information V2  
**Scope:** Documentation only. No code, UI, or schema changes implied by this document.

**Inputs:**

- [`lifecycle_builder_hardening_closeout.md`](./lifecycle_builder_hardening_closeout.md) (shipped terminology)
- [`../lifecycle_v2_discovery_and_operating_model.md`](../lifecycle_v2_discovery_and_operating_model.md)
- [`../lifecycle_builder_hardening_and_v2_canonical_model.md`](../lifecycle_builder_hardening_and_v2_canonical_model.md)
- [`../enrollment_lifecycle_status_matrix_contract.md`](../enrollment_lifecycle_status_matrix_contract.md) — configurable labels vs fixed enrollment layers
- [`docs/platform/governance/glossary.md`](../../../platform/governance/glossary.md)
- [`docs/product/bos-foundation.md`](../../../product/bos-foundation.md)

**Authority:** When product copy, docs, or V2 specs disagree with this file, **update the other artifact** to match this vocabulary unless an explicit exception is recorded in §6.

---

## Purpose

Freeze **operator-facing** and **internal/system** vocabulary for the Lifecycle domain before Required Information V2 and subsequent Lifecycle V2 sections (Needs Attention authoring, Task templates, Orchestration linkage).

This document answers:

- What do we call things to operators?
- What do engineers call them in code and metadata?
- How do configuration concepts relate to runtime concepts?
- Where is terminology intentionally split (Builder vs Workspace)?
- What must BOS, Tasks, and Workflows **not** collide with?

---

## 1. Canonical definitions

### Lifecycle

| | |
|---|---|
| **Operator-facing name** | **Lifecycle** |
| **Internal / system name** | `lifecycle_builder_v1` process on `departments.metadata`; builder-owned department row; catalog entry |
| **Definition** | A department-scoped **operational configuration** for how work flows through ordered stages: which statuses belong where, what information is required, which actions appear, and how queue views are published for staff. |
| **Responsibility** | Defines **visibility lenses** and **setup contracts** — not exclusive record ownership. Lifecycle does not own CRM rows; it configures which records appear in which operational views and what gates apply. |

**Not synonymous with:** Workflow, Automation, BOS, or a single Work Unit row.

---

### Stage

| | |
|---|---|
| **Operator-facing name** | **Stage** |
| **Internal / system name** | `lifecycle_builder_v1.processes[].stages[]` (`key`, `label`, `sort_order`); builder stage key (may differ from operator stage alias, e.g. `enrolling` → enrollment palette) |
| **Definition** | An ordered step in a lifecycle process — the **primary mental model** for configuration and (eventually) for stage-scoped rules (required info, actions, attention profiles). |
| **Responsibility** | Groups statuses, field requirements, action scope, and queue view publication for one operational step. |

**Related internal terms:** `operator_stage` (enrollment palette bucket), `builder_stage_key` (including custom stages).

---

### Status

| | |
|---|---|
| **Operator-facing name** | **Status** (always qualify entity when ambiguous: **Lead status**, **Child status**) |
| **Internal / system name** | `status_definitions.status_key`; `opportunities.status_key` (case/lead); `opportunity_customer_members.outcome_status_key` (child enrollment) |
| **Definition** | CRM vocabulary labeling where a **record** sits in the pipeline. For lifecycle builder stages, **lead/opportunity statuses** determine stage membership via configured status sets. |
| **Responsibility** | **Visibility predicate** for lifecycle stage queue views (`lifecycleVisibilityEvaluator`). Separate from assignment home and separate from child enrollment disposition when both exist. |

**Doctrine (locked):** Opportunity status and child status are **separate concepts**. Do not collapse in copy or config UI.

---

### Queue View

| | |
|---|---|
| **Operator-facing name** | **Queue view** (Lifecycle Builder and builder-adjacent settings only) |
| **Internal / system name** | Published output of `saveLifecycleStageRuntimeConfig`: `work_units` row (`key = lifecycle_wu_{stageKey}`), `queue_definition`, display `name` |
| **Definition** | The **presentation** staff see on the workspace for a stage — which records appear based on selected statuses, row preview, and display name. Configured in Builder; **published** on Save stage. |
| **Responsibility** | Operator-facing name for what the builder configures. Not a separate product object operators create independently of a stage. |

**Builder copy rule:** Use **Queue view**. Do not say “Work Unit Queue,” “create work unit,” or “sync queue” in Builder surfaces.

---

### Work Unit

| | |
|---|---|
| **Operator-facing name** | **Work unit** (runtime workspace only — department/work-unit navigation, settings/work-units when advanced) |
| **Internal / system name** | `work_units` table; `lifecycle_wu_{stageKey}` for builder-owned stage queues; `enrollment_pipeline` for legacy composite pipeline |
| **Definition** | A **runtime execution surface** under a department: scoped queue config, operational ownership context, and workspace routes (`/adminV2/workspace/dept/.../work-unit/...`). |
| **Responsibility** | Hosts `queue_definition`, drives `QueueService` previews, anchors assignment routing (`opportunities.work_unit_id` as execution home). **Not** a peer configuration concept to Stage in Builder. |

**Intentional split:** Builder configures a **Queue view** (output). Runtime navigates **Work units** (infrastructure). See §4.

---

### Required Information

| | |
|---|---|
| **Operator-facing name** | **Required information** (section title); field levels **Off / Recommended / Required**; optional **Suggested** (template hint, not saved until Save stage) |
| **Internal / system name** | `lifecycle_progression_requirements_v1`, `lifecycle_builder_stage_field_rules_v1`; rule ids `person:*`, `child:*`, `opportunity:*`; `runtime_enforced` on bindings |
| **Definition** | Per-stage **field rules** declaring what data should be collected or present before work moves forward — expressed as catalog rule ids with required vs recommended membership. |
| **Responsibility** | Configuration contract consumed by action preflight, forms coverage, progression display, and (V2) Needs Attention bridges. Enforcement depth varies by binding — operators see **levels**, not implementation flags. |

**Banned operator copy:** `(config only)`, `configuration only`, `runtime_enforced`, `field_rules_source`.

**V2 direction:** Enforcement levels (Recommended → Required guidance → Required enforced) — see [`lifecycle_v2_discovery_and_operating_model.md`](../lifecycle_v2_discovery_and_operating_model.md) §3.3.

---

### Ready Check

| | |
|---|---|
| **Operator-facing name** | **Ready check** |
| **Internal / system name** | `GET …/lifecycle-activation/validate`; `validateLifecycleActivationRuntime`; compact checks in `lifecycleActivationValidationCompact.ts` |
| **Definition** | Structural **go-live proof** that lifecycle configuration is wired for staff on the workspace: department tile, queue views published, filters match statuses, records query, optional actions. |
| **Responsibility** | Builder-only confidence gate. Read-only validation — does not mutate records or config. Technical details behind **Show technical details** disclosure only. |

**Retired operator copy:** Activation Validation, Runtime validation, Pass/Fail (use **Ready** / **Needs fix** / **Ready for staff on the workspace**).

---

### Action

| | |
|---|---|
| **Operator-facing name** | **Action** (Lifecycle Builder matrix: “Actions enabled”; record surfaces: action buttons from placements) |
| **Internal / system name** | `action_definitions`, `action_placements`; `executeAdminAction`; lifecycle matrix order metadata |
| **Definition** | A registered **admin operation** (send form, schedule tour, change status, etc.) placed on lifecycle-scoped surfaces (drawer header, queue row, etc.). |
| **Responsibility** | Side effects route through `executeAdminAction`, preflight, and workflows — not through builder save. Builder **enables and places** actions; platform owns handler semantics. |

**Not synonymous with:** BOS proposal, Workflow step, Task, or Automation trigger.

---

### Task

| | |
|---|---|
| **Operator-facing name** | **Task** / **Follow-up** (My Tasks, record task lists); **Task Assist** when BOS-drafted |
| **Internal / system name** | `operational_tasks`; `/api/admin/operational-tasks`; BOS `task_assist` capability |
| **Definition** | A **durable operator work item** (call back, send reminder, internal follow-up) attached to entities — created manually, via Task Assist proposal, or (V2 future) lifecycle **task templates** on stage entry. |
| **Responsibility** | Execution home for human follow-up work. Lifecycle V2 may **configure default templates**; Task Assist **proposes** drafts; neither replaces `operational_tasks` truth. |

**Future Lifecycle Builder section:** “Tasks” = **stage entry templates**, not My Tasks UX. Copy must distinguish **Task template** (config) vs **Task** (runtime row).

---

### Needs Attention

| | |
|---|---|
| **Operator-facing name** | **Needs attention** (workspace lane / overlay); individual items as **attention reasons** or **signals** — avoid “alert engine” |
| **Internal / system name** | `resolveOpportunityAttention`; `metadata.opportunity_attention_rules`; `needs_attention_buckets`; platform reason codes |
| **Definition** | **Deterministic overlay** highlighting records that merit operator review (SLA, missing info, stale activity, etc.) — layered on queue views, not a substitute for queue membership. |
| **Responsibility** | Resolver + configurable buckets/thresholds. Lifecycle V2 may add **stage-scoped profiles**; engine remains platform-owned. Not configured in Builder today (link-out to Attention & SLA settings). |

**Not synonymous with:** BOS Recommendation, Required Information gaps (though V2 may link them), or Tasks.

---

### Automation / Workflow

| | |
|---|---|
| **Operator-facing name** | **Automation** or **Workflow** (Settings → Automations; operator-facing workflow names) |
| **Internal / system name** | `workflow_definitions`, `workflow_events`, `executeWorkflowRun`, `event_type` |
| **Definition** | **Event-driven side-effect graphs** (status changed, form submitted, message sent) executed server-side after canonical event emission. |
| **Responsibility** | **Execution authority** for standardized mutations and communications. Lifecycle **Orchestration** section (V2) links and suggests triggers — does not embed workflow editor or duplicate engine. |

**Lifecycle Builder “Orchestration” (V2):** Operator name for **links + health + suggested triggers** — always qualify as **Lifecycle orchestration** in builder docs to avoid confusion with BOS Orchestrator.

---

### BOS Insight

| | |
|---|---|
| **Operator-facing name** | **Insight** / **Suggestion** (contextual, non-mutating); avoid “AI says” |
| **Internal / system name** | BOS capability class `insight`; e.g. `needs_attention_suggestion`, `attention_enrich` |
| **Definition** | **Read-only assist** that explains or polishes judgment on a record — no apply path, no operational truth writes. |
| **Responsibility** | Help operator decide; cite deterministic signals. Enrich may polish copy only. |

---

### BOS Recommendation

| | |
|---|---|
| **Operator-facing name** | **Recommendation** / **Suggested next step** (Review Assist band, queue row hints) |
| **Internal / system name** | `OperationalRecommendationV1`; deterministic builder + optional bounded enrich |
| **Definition** | **Single-record operational judgment** — why act, urgency, suggested action label — grounded in resolver/SLA/task snapshots. Assistive only. |
| **Responsibility** | Guide operator toward Task Assist, admin actions, or workflows. **Never** mutates records or auto-applies. |

---

### BOS Proposal

| | |
|---|---|
| **Operator-facing name** | **Proposal** / **Draft** (Task Assist draft, Workflow Assist change set, Config Assist layout delta) |
| **Internal / system name** | `task_assist_proposals`, `workflow_assist_proposals`, `config_layout_assist_proposals`, `ConfigurationProposalV1` |
| **Definition** | **Immutable candidate mutation** awaiting human review and explicit apply through a governed API/RPC. |
| **Responsibility** | Bridge between assist and execution. Lifecycle config saves are **not** BOS proposals — they are admin settings PATCHes. |

---

### BOS Execution (apply)

| | |
|---|---|
| **Operator-facing name** | **Send**, **Apply**, **Save** (capability-specific — never generic “Execute BOS”) |
| **Internal / system name** | `task-assist/apply`, workflow CRUD apply, config assist apply, `executeAdminAction`, `executeCommunicationsSend` |
| **Definition** | **Human-approved** commit of a proposal or explicit operator action through canonical platform paths. |
| **Responsibility** | Sole path for mutating operational truth. BOS Orchestrator **never** executes. |

---

## 2. Relationship diagram

### 2.1 Configuration plane (Lifecycle Builder)

```
Lifecycle (department-scoped process config)
│
├── Stage 1..N  (ordered steps — operator primary model)
│   ├── Statuses      → which lead statuses belong in this stage
│   ├── Required information  → field rules (required / recommended)
│   ├── Actions       → enabled matrix + placements (dept-level matrix, stage restrictions)
│   └── Queue view    → published presentation (name + status filters + row preview)
│
├── Ready check       → go-live validation (read-only)
│
└── [V2 future sections on same shell]
    ├── Needs Attention profile  → stage-scoped attention mapping (config)
    ├── Task templates           → defaults on stage entry (config)
    └── Orchestration links      → suggested workflow triggers (link-out)
```

### 2.2 Runtime plane (Workspace)

```
Department (workspace tile = Lifecycle name)
│
├── Work unit: lifecycle_wu_{stage}   ← runtime host for each stage queue view
│   └── Queue (preview rows)          ← NOT authoritative; obeys status visibility lens
│
├── Work unit: enrollment_pipeline    ← legacy composite (being converged for builder-owned)
│
├── Needs Attention lane/overlay      ← resolver overlay; not a stage
│
└── Record surfaces (drawer)
    ├── Actions (placements)
    ├── BOS Recommendation (insight)
    ├── Tasks (operational_tasks)
    └── Required info gaps (display + preflight)
```

### 2.3 Cross-plane flow (save → operate)

```
Builder: Stage config (statuses + required info + queue view name)
    → Save stage → stage-runtime-config
        → metadata (field rules, status buckets)
        → work_units.lifecycle_wu_{stage} + queue_definition

Runtime: Staff opens Department → Work unit pill → Queue rows
    → status_key ∈ stage status set (visibility)
    → optional Needs Attention overlay
    → Action / Task / BOS Recommendation on record
    → Workflow fires on events (outside builder)
```

### 2.4 BOS vs Lifecycle vs Workflow (orthogonal)

```
                    ┌─────────────────┐
                    │ Lifecycle Builder│  configures lenses + rules
                    └────────┬────────┘
                             │ publishes
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Workflow   │───▶│  Runtime record  │◀───│     BOS      │
│ (automation) │    │  queue + drawer  │    │ insight/propose│
└──────────────┘    └─────────────────┘    └──────────────┘
   event-driven          visibility +           assist only
   execution             assignment              no truth writes
```

---

## 3. Naming conflict review

### 3.1 Overlapping concepts

| Conflict | Parties | Resolution |
|----------|---------|------------|
| **Queue view** vs **Work unit queue** | Builder vs Dept workspace shell | **Intentional split.** Builder = Queue view. Runtime nav/panels may retain Work unit queue until a dedicated runtime rename sprint. Do not reintroduce Work Unit Queue in Builder. |
| **Stage** vs **Operator stage** vs **Builder stage key** | Custom stages (`enrolling`) vs palette (`enrollment`) | Operators see **Stage** label. Docs/code use `builder_stage_key`; palette mapping is implementation detail. |
| **Lifecycle** vs **Department** | Same row for builder-owned | Workspace tile uses lifecycle **name**; internal row is `departments`. Operator copy: **Lifecycle** in Settings; **department** acceptable on workspace when referring to navigation tile. |
| **Required information** vs **Field requirements** vs **Progression requirements** | API/metadata naming | Operator: **Required information** only. Internal: `field_rules`, `lifecycle_progression_requirements_v1`. |
| **Action** vs **Workflow** vs **Automation** | Settings IA | **Action** = button/handler. **Workflow/Automation** = event graph. Never call workflows “actions” in lifecycle builder. |
| **Task** vs **Task Assist** vs **Task template** | V2 planning | **Task** = runtime row. **Task Assist** = BOS draft proposal. **Task template** = future lifecycle config. |
| **Needs Attention** vs **missing required information** | V2 bridge | NA is **overlay**; missing info is **rule evaluation**. V2 may link reason codes — do not merge labels. |
| **Orchestration** (lifecycle V2) vs **Orchestrator** (BOS) | Homonym | Lifecycle section: **Workflow links** or **Automations** subsection. BOS: **Orchestrator** command bar only. |
| **Ready check** vs **Activation** | Legacy code paths | Operator: **Ready check** only. Internal routes may retain `lifecycle-activation` until alias sprint. |

### 3.2 Implementation leakage (watch list)

| Leak | Where it may appear | Operator replacement |
|------|---------------------|----------------------|
| `needs_sync`, `not_created` | Internal WU identity state | “Queue view not published” / “Out of date with status selections” |
| `lifecycle_wu_*` | Keys, debug | Never in UI |
| `config_only`, `runtime_enforced` | Palette/metadata | Enforcement level badges (V2) |
| `activation`, `completed_steps` | Legacy bundle | Remove from UI; audit pointer only |
| `enrollment-process/*` API paths | Network tab | Neutral “Saving stage…” — route rename is engineering debt |
| `Pass` / `Fail` | Validation | **Ready** / **Needs fix** |

### 3.3 Future naming risks (V2+)

| Risk | Mitigation |
|------|------------|
| Calling Needs Attention rules “lifecycle tasks” | NA = overlay signals; Tasks = `operational_tasks` |
| Calling BOS recommendations “needs attention” | Recommendations are per-record judgment; NA is bucket/lane |
| Exposing `work_unit_id` as “stage id” | Stage = config; WU = runtime host |
| Required Information V2 enforcement levels named like workflow states | Use **Recommended / Required / Enforced** — not workflow statuses |
| Cross-industry “pipeline” overloading | Prefer **Lifecycle** and **Stage**; pipeline is legacy internal (`enrollment_pipeline`) |

---

## 4. Work Unit evaluation

### 4.1 Should Work Unit remain a runtime concept?

**Yes.** Work units are the established **execution domain** in Alloy: they scope queue definitions, workspace routes, assignment defaults, and KPI context. Lifecycle builder does not eliminate work units — it **generates and configures** builder-owned rows (`lifecycle_wu_{stageKey}`).

Stages are **configuration**; work units are **runtime surfaces**. Collapsing the names would recreate the pre-hardening confusion where operators thought they were creating a separate object instead of publishing a stage view.

### 4.2 Is Queue View the correct Builder term?

**Yes.** Hardening validated this model:

- Operators configure **what staff see** (name, status filters, preview) — a **view**, not infrastructure.
- Save stage **publishes** the queue view; it does not “create a work unit” as a separate wizard step.
- Aligns with empty-by-default: “Queue view not published” vs “Work unit not created.”

### 4.3 Alternatives considered

| Alternative | Verdict |
|-------------|---------|
| **Stage queue** | Acceptable synonym in docs; **Queue view** preferred in UI for consistency with “view” metaphor |
| **Stage lane** | Reserved for workspace **navigation pills** — do not use in Builder |
| **Pipeline** | Legacy enrollment term; avoid for cross-industry lifecycle |
| **List** / **Inbox** | Too generic; loses stage binding |
| **Work unit** in Builder | **Rejected** — caused dual-save and object confusion |

### 4.4 Does terminology scale beyond Enrollment?

**Yes, with discipline:**

| Concept | Cross-industry carry |
|---------|----------------------|
| Lifecycle / Stage / Status | Generic — statuses are entity-specific definitions |
| Queue view | Generic — presentation of stage membership |
| Work unit (`lifecycle_wu_{stage}`) | Generic pattern — key encodes stage; `queue_definition` is industry-agnostic |
| Required information rule ids | Catalog presets per vertical; org fields extend palette |
| Operator stage alias | Childcare-specific palette optional; custom stages use builder keys |
| `enrollment_pipeline` | **Enrollment legacy only** — not part of canonical vocabulary for new verticals |

**Recommendation:** Keep **Work unit** as internal/runtime and **Queue view** as builder operator term. Plan a **optional** runtime rename sprint (Work unit queue → Stage queue or Queue) separately from lifecycle V2 — do not block Required Information V2 on runtime shell renames.

---

## 5. BOS vocabulary

### 5.1 Layer definitions

| Layer | Operator terms | Mutates truth? | Lifecycle relation |
|-------|----------------|----------------|-------------------|
| **Insight** | Insight, explanation, suggestion | No | Explains record context; may reference missing required info — does not configure lifecycle |
| **Recommendation** | Recommendation, suggested next step | No | Guides which **Action** or follow-up to take; not a lifecycle stage rule |
| **Proposal** | Draft, proposal, preview | Only after explicit Apply | Task Assist draft ≠ lifecycle Save stage |
| **Execution** | Send, Apply, Save, Run action | Yes (governed paths) | Workflows/automations execute; lifecycle configures what surfaces exist |

### 5.2 Non-overlap rules

| BOS term | Must not be confused with |
|----------|---------------------------|
| **Recommendation** | Needs Attention bucket membership, queue sort order, lifecycle Required Information save |
| **Proposal** | Lifecycle stage draft state, unsaved status checkboxes |
| **Task Assist proposal** | Lifecycle Task template (V2 config) or operational_task row |
| **Orchestrator** | Lifecycle Orchestration section, workflow engine |
| **Insight / enrich** | Ready check validation, activation proof |

### 5.3 Recommended operator phrases

| Situation | Say | Do not say |
|-----------|-----|------------|
| Drawer/queue judgment | “Suggested next step” | “AI decided” |
| Task Assist card | “Draft follow-up” | “Autonomous task” |
| Missing fields | “Required information missing” | “Config only gap” |
| NA lane | “Needs attention” | “BOS queue” |
| Workflow trigger | “Automation” / “Workflow” | “BOS execution” |
| Lifecycle save | “Save stage” | “Activate runtime” |

---

## 6. Surface-specific vocabulary matrix

| Concept | Lifecycle Builder | Dept / WU Workspace | Settings (other) | Internal code / metadata |
|---------|-------------------|---------------------|------------------|--------------------------|
| Process config | Lifecycle | (tile name) | — | `lifecycle_builder_v1` |
| Step | Stage | Stage pill label | — | `stages[].key` |
| CRM label | Status | Status chip | Statuses | `status_key` |
| Builder output | **Queue view** | Work unit queue / lane (legacy) | Work units | `lifecycle_wu_*`, `queue_definition` |
| Runtime host | — | Work unit | Work units | `work_units` |
| Fields | Required information | (drawer / preflight) | Fields | `field_rules`, `*_rule_ids` |
| Go-live proof | **Ready check** | — | — | `lifecycle-activation/validate` |
| Buttons | Actions | Actions | Action definitions | `action_placements` |
| Follow-ups | Task templates (V2) | Tasks | My Tasks | `operational_tasks` |
| Overlays | Needs Attention (V2) | Needs attention | Attention & SLA | `opportunity_attention_rules` |
| Event graphs | Orchestration (V2) | — | Automations | `workflow_*` |
| Assist | — | Recommendation | BOS / Orchestrator | `OperationalRecommendationV1` |

---

## 7. Required Information V2 — vocabulary guardrails

When starting Required Information V2, **use only**:

- **Required information** (section)
- **Recommended** / **Required** (levels)
- **Suggested** (template apply — not saved until Save stage)
- **Configured** vs **Not configured yet** (not “Saved” vs “platform default”)
- Entity labels from org config (**Lead**, **Guardian**, **Child** — not `opportunity`, `person`)

**Do not introduce in V2 copy:**

- Configuration only, config only, runtime enforced, enforcement gap
- Progression requirements (operator-facing)
- Field rules (operator-facing; ok in technical docs)

---

## 8. Success criteria (this audit)

| Criterion | Status |
|-----------|--------|
| Frozen lifecycle vocabulary | **Yes** — §1 + §6 |
| Clear operator terminology | **Yes** — per-concept tables |
| Clear internal terminology | **Yes** — system names documented |
| No major naming conflicts unaddressed | **Yes** — §3 + §5 |
| Safe to start Required Information V2 | **Yes** — §7 guardrails |

---

## 9. Document maintenance

Update this file when:

- Runtime workspace adopts renamed queue panel copy (if Work unit queue → Stage queue)
- Required Information V2 enforcement levels ship (add canonical level names to §1)
- Lifecycle V2 sections ship (Needs Attention, Tasks, Orchestration — add to §2.1)
- BOS proposal lifecycle standardization merges tables

**Do not** update for one-off component refactors that do not change operator vocabulary.

---

## Related documents

| Doc | Role |
|-----|------|
| [`lifecycle_builder_hardening_closeout.md`](./lifecycle_builder_hardening_closeout.md) | What shipped in hardening |
| [`../lifecycle_v2_discovery_and_operating_model.md`](../lifecycle_v2_discovery_and_operating_model.md) | V2 architecture (not implemented) |
| [`docs/platform/governance/glossary.md`](../../../platform/governance/glossary.md) | Platform-wide terms |
| [`docs/product/bos-foundation.md`](../../../product/bos-foundation.md) | BOS capability classes |
