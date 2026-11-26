# Lifecycle Runtime Orchestration Audit

**Path:** `docs/sprints/archive/06_2026/lifecycle_runtime_orchestration_audit.md`  
**Status:** Audit only — **do not implement** from this document  
**Date:** 2026-05-31  
**Principle:** Assume existing workflows, actions, events, statuses, tasks, and BOS compose into Lifecycle Builder. Do not replace them with a parallel rules engine.

**Related active docs:**

- `docs/archive/2026-06-superseded-system/actions-and-workflows.md`
- `docs/archive/2026-06-superseded-system/entity-model.md`, `docs/product/crm-system.md`
- `docs/system/configuration-system.md`, `docs/archive/2026-06-superseded-system/workspace-system.md`
- `docs/product/bos-foundation.md`
- `docs/sprints/archive/06_2026/lifecycle_runtime_alignment_matrix_v1.md`
- `docs/sprints/archive/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`
- `docs/sprints/archive/05_2026/task_system_audit_v1.md`

---

## Executive summary

Alloy **already has** a runtime orchestration spine: **`workflow_events` → enabled `workflows` → `executeWorkflowRun`**, plus **admin actions** (`executeAdminAction`) that mutate truth and emit events. Lifecycle Builder (activation board) today configures **structure** (department, stage, statuses per stage, work unit queue, action placement, forms, validation) in **`departments.metadata`** — not automated side effects.

**Gaps are mostly composition and operator surfacing**, not missing engines:

| Capability | Exists? | Lifecycle Builder connection |
|------------|---------|------------------------------|
| Event + workflow execution | **Yes** | Not wired in builder UI; lives in **Automations** (`/adminV2/workflows`) |
| Status change → events | **Yes** (case + child) | Builder assigns stage ↔ `status_keys`; transitions still platform paths |
| Admin actions (tasks, comms, status, forms) | **Yes** | Builder places actions; execution unchanged |
| Child per-child lifecycle (`outcome_status_key`) | **Yes** | Separate from case `status_key`; events exist |
| Derived **case** status from children | **No** (by design today) | Should be **workflow-driven**, not builder hardcode |
| Requirement / preflight before execute | **Partial** | Code catalog + activation validation; no workflow on “requirement satisfied” |
| Tasks | **Yes** (`operational_tasks`) | Not created by workflows; registry `create_task` opens panel |
| Needs Attention | **Yes** (resolver overlay) | Department metadata; not stage-scoped in engine |
| Waitlist | **Yes** (hybrid grain) | Case queues + candidate rows + `placement_candidates` |
| BOS recommendations | **Yes** (read-only insight) | Maps to actions; Workflow Assist proposes workflow **definitions** |

**Household question (Child A enrolled, Child B waitlisted):**  
Do **not** answer in Lifecycle Builder config. **`opportunities.status_key`** remains **case-level coordination** (queues, comms, tours, legacy lanes). **`opportunity_customer_members.outcome_status_key`** is **per-child enrollment SoT**. UI already summarizes children read-only (`buildOpportunityChildLifecycleSummary`) without mutating case status. **Recommended:** operators see mixed-child copy + optional **workflows** on `child_lifecycle_status_changed` that may set case status via `update_entity` / `update_status` actions when product rules demand it — configured per org in **Automations**, not baked into stage setup.

---

## 1. Existing runtime systems inventory

| System | Primary tables / stores | Entry points | Emits `workflow_events`? |
|--------|-------------------------|--------------|---------------------------|
| **Workflow engine** | `workflows`, `workflow_conditions`, `workflow_actions`, `workflow_runs`, `workflow_action_runs`, `workflow_events` | `emitEvent`, `emitStatusChangedEvent`, `emitChildLifecycleStatusChangedEvent`, form/tour/action-link paths → `executeWorkflowRun` | **Yes** (hub) |
| **Admin action engine** | `action_definitions`, `action_placements` | `POST /api/admin/actions/execute` → `executeAdminAction.ts` | **Often** (status updates, `start_workflow`, open_form submit) |
| **Status definitions** | `status_definitions` | PATCH entity routes, actions, workflow `update_entity` | Via status change helpers |
| **Status transition rules** | `status_transition_rules` | `validateStatusTransition` on transitions | No (gate only) |
| **Completion / preflight** | Dept metadata, `lifecycleProgressionRequirementsCatalog`, `lifecycleActionRequirementCatalog` | `evaluateOpportunityActionPreflight`, drawer PATCH policy | **No** |
| **Operational tasks** | `operational_tasks`, `task_assist_proposals` | My Tasks, Task Assist, `POST …/operational-tasks` | **No** from workflows |
| **Needs Attention** | `metadata.opportunity_attention_rules`, resolver | `resolveOpportunityAttention` on queue/GET | No |
| **Waitlist / placement** | `placement_candidates`, queue v2 defs | `QueueService`, OCM hooks, manual order APIs | Activity-style events for manual adjust |
| **Communications** | `communication_threads`, `communication_messages`, scheduled sends | Canonical enqueue, workflow `create_message` / `send_message` | Partial dual-write |
| **Forms / intake** | `form_submissions`, intake metadata | Submit paths → `formSubmissionEvents`, intake lifecycle | **Yes** (`form_submitted`, intake_case_*) |
| **BOS** | Registry + ephemeral proposals | Command bar, `_operational_recommendation` on GET | **No** (must use actions/workflows) |
| **Lifecycle Builder config** | `lifecycle_builder_v1`, `lifecycle_activation_v1`, enrollment status stages | Settings `/adminV2/settings/lifecycle` | **No** |

---

## 2. Workflow engine

### Tables (schema reference)

| Table | Role |
|-------|------|
| `workflow_events` | Append-only business facts (`event_type`, `entity_type`, `entity_id`, `payload`, `org_id`, `occurred_at`) |
| `workflows` | Trigger definition: `event_type`, `entity_type`, `enabled`, `org_id` (null = global), optional `metadata.scope` (`department_id`, `work_unit_id`) |
| `workflow_conditions` | JSON-path predicates on enriched payload |
| `workflow_actions` | Ordered steps: `action_type`, `target_entity`, `payload` |
| `workflow_runs` | Execution record; links `event_id` when event-driven |
| `workflow_action_runs` | Per-step status for observability |

Indexes support org + event_type + entity lookups (`workflow_events_org_event_occurred_idx`, etc.).

### Trigger model

1. A **server** path finalizes a fact (status PATCH, payment, form submit, action link consumed, admin action, tour booking, …).
2. **`emitEvent`** inserts `workflow_events` (or dedicated emitter wraps it).
3. Query **`workflows`** where `enabled`, matching `event_type` + `entity_type`, org global or org-scoped.
4. For each match, **`executeWorkflowRun`** with `options.event_id` for event-driven validation (`validateWorkflowEventMatch`).

**Manual run:** `POST /api/admin/workflows/[id]/run` — may omit `event_id` (documented deviation in audits).

### Execution model

- **`executeWorkflowRun`** (`web/lib/workflowRun.ts`): load workflow → insert run → evaluate conditions → switch on `workflow_actions.action_type`.
- **Supported workflow action types (runtime):** `create_message`, `send_message`, `update_entity`, `create_assignment`, `apply_job_vendor_to_upcoming`, `create_action_link`, `log` (unknown types skipped with reason).
- **`update_entity`:** Patches entity tables from template payload; for **`opportunity_customer_members.outcome_status_key`** uses canonical **`updateOpportunityCustomerMemberLifecycleStatus`** (emits `child_lifecycle_status_changed`, placement hook for waitlist).
- **Opportunity `status_key` updates** via workflow should go through paths that call **`emitStatusChangedEvent`** when implemented in patch helpers (opportunity branch in `update_entity` — verify org workflows in Automations).

### Event types (representative, not exhaustive)

**Platform vocab (partial lists — production uses string `event_type` on rows):**

| Category | Examples |
|----------|----------|
| **CRM / opportunity** | `opportunity_status_changed`, `entity_status_changed`, `child_lifecycle_status_changed`, `action_executed` (activity) |
| **Forms / intake** | `form_submitted`, `form_signed`, `form_document_generated`, `intake_case_created`, `intake_case_operationalized`, `intake_case_review_required`, `intake_case_linked` |
| **Tours** | Tour booking lifecycle types in `tourLifecycleEvents.ts` (entity `tour_bookings`) |
| **Jobs / schedules / payments** | `job_action`, `schedule_created`, `job_completed`, `payment_succeeded`, … (`workflowVocab.ts`, `events.ts`) |
| **Links** | `action_link_consumed` |
| **Enrollment packets** | `opportunity_enrollment_packet_*` (activity timeline labels) |
| **Waitlist** | Manual adjustment activity events on opportunity |

**Status changes:**

- **Case:** `emitStatusChangedEvent` → `opportunity_status_changed` for `entity_type` opportunities (`web/lib/admin/emitStatusChangedEvent.ts`).
- **Child:** `emitChildLifecycleStatusChangedEvent` → `child_lifecycle_status_changed` on `opportunity_customer_members` (`web/lib/opportunities/emitChildLifecycleStatusChangedEvent.ts`). **Card 10 shipped** — workflows can listen; seed coverage org-dependent.

### Relationship to actions / status

| Path | Status change | Workflow fan-out |
|------|---------------|------------------|
| Entity PATCH (opportunities) | Often `updateOpportunityStatusWithEvent` | `opportunity_status_changed` |
| `executeAdminAction` `update_status` | Validated + transition rules | Emits status event |
| Child drawer / action grain child | `updateOpportunityCustomerMemberLifecycleStatus` | `child_lifecycle_status_changed` |
| Workflow `update_entity` | Direct patch or child canonical path | Does not auto-chain case event unless patch includes opportunity |

### Current workflow examples (enrollment-adjacent)

- Org-seeded enrollment comms / follow-ups (migrations under `supabase/migrations/`).
- **Workflow Assist** scaffolds **disabled-by-default** starters (`opportunity_status_changed`, tour follow-up placeholders) — operator enables in **Automations**.
- **Status transition rules** table documents **condition-driven** status updates (e.g. tour date set → Tour Scheduled) — **read-only reference in Settings**; execution still workflow-owned.

### Lifecycle Builder gap

Builder does **not** create or bind `workflows` rows. Activation stores **`status_keys`** per stage and **`work_unit_id`** — runtime queue membership uses **`opportunities.status_key`** + `queue_definition`, not workflow IDs.

---

## 3. Automation framework

### Naming / UX

| Term in product | Meaning |
|-----------------|--------|
| **Automations** | Operator label for **`/adminV2/workflows`** (sidebar, BOS copy) |
| **Workflows & automation** (Settings) | Grouping for **Action buttons** + link to Automations |
| **Workflow automation rules** | Read-only **`status_transition_rules`** reference on Statuses settings |

**Workflows and “automations” are not separate engines** — Automations is the **admin UI** for the workflow tables above. There is no second automation runner in `web/lib`.

### What can already trigger automatically

- Status transitions (case and child) when writers use canonical emitters.
- Form submit / intake operationalization.
- Tour booking lifecycle.
- Payment / schedule / job / action-link consumers (vertical-dependent).
- Workflow steps: messages, entity patches, action links, assignments.

### What does not auto-trigger today

- Lifecycle Builder stage completion.
- Requirement evaluator “all fields satisfied” (no `requirement_satisfied` event).
- **`operational_tasks`** creation from workflow actions.
- Derived opportunity status rollup from children (no platform job).

---

## 4. Action engine

### Definition

- **`action_definitions`:** `key`, `action_type`, `payload_schema`, optional `workflow_id`, org/global scope.
- **`action_placements`:** surface (`record_header`, `record_section`, `queue_row`, `right_rail`), slot, section, order, `is_active`.

Settings **Actions** plane creates placements only — **not** new handlers (`docs/system/configuration-system.md`).

### Execution types (`executeAdminAction`)

| `action_type` | Behavior | Side effects |
|---------------|----------|--------------|
| `update_status` | Case or child grain (`resolveStatusMutationGrain`) | Status + events; transition rules |
| `open_form` | Launch form; optional after/submit status or `start_workflow` | PATCH, `emitEvent`, `executeWorkflowRun` |
| `ui_intent` | Client dispatch (e.g. open tasks panel, quick message) | Usually none server-side |
| `navigate` / `open_drawer` / `external_link` | UX only | None |
| `update_field` | Field PATCH | Entity-dependent |
| `start_workflow` | Emit + run bound workflow | Workflow run |
| **Lifecycle-specific handlers** | `create_lead`, `move_to_qualification`, tour actions, `approve_enrollment`, child lifecycle updates, … | Mixed |

### Can actions trigger workflows / events?

**Yes** — `start_workflow`, `open_form` submit paths, and status mutations via **`emitStatusChangedEvent`** / child emitter.

### Can actions create tasks, statuses, forms, messages?

| Output | Support |
|--------|---------|
| **Statuses** | **Yes** — `update_status`, lifecycle execute paths |
| **Forms** | **Yes** — `open_form`, `send_form` placements |
| **Messages** | **Yes** — comms actions + Task Assist apply (separate API) |
| **Tasks** | **Partial** — `create_task` → **`ui_intent`** opens My Tasks; no server create on click |

### Lifecycle Builder

Activation picks **one base action** + placements; runtime still uses global **`action_definitions`** catalog. Placements are not department-scoped in schema beyond operator practice — workflows may use `metadata.scope.department_id`.

---

## 5. Status engine

### Opportunity (case) statuses

- **SoT column:** `opportunities.status_key`
- **Labels / allowlist:** `status_definitions` (`entity_type = opportunities`)
- **Stage mapping (enrollment):** `enrollmentProcessStatusStageConfig` + operator stage metadata on status rows — **Lifecycle Builder step 3** PATCHes `status-stages` API (department-scoped buckets per stage key)
- **Transitions:** `status_transition_rules` + `validateStatusTransition` on guarded paths
- **Events:** `opportunity_status_changed` when key changes via canonical writers
- **Queues / KPIs / attention:** Predominantly case `status_key` (+ resolver overlays)

### Child / inquiry statuses

- **SoT column:** `opportunity_customer_members.outcome_status_key`
- **Labels:** `status_definitions` (`entity_type = opportunity_customer_members` / Settings “Opportunity Sub Statuses”)
- **Seeded disposition keys:** `interested`, `waitlisted`, `enrolling`, `enrolled`, `not_enrolling`, `deferred` (childcare migration)
- **Events:** `child_lifecycle_status_changed` (May 2026+)
- **Queues:** Waitlist **candidate** lanes use child/candidate grain; case lanes use opportunity grain
- **Not used for:** automatic case status sync, most attention reason codes, workflow seeds (org-dependent)

### Person / customer / household

| Grain | Status-like fields | Lifecycle role |
|-------|-------------------|----------------|
| **Person** | No enrollment pipeline status | Identity anchor |
| **Customer** | Customer-level fields | Household account |
| **`customer_members`** | `status_key` (member entity) | **Not** inquiry lifecycle (separate settings entity) |
| **Contacts** | Legacy | Compatibility only |

### Do transitions emit events?

| Entity | Emits? | Event type |
|--------|--------|------------|
| `opportunities` | Yes (canonical paths) | `opportunity_status_changed` |
| `opportunity_customer_members` | Yes (canonical path) | `child_lifecycle_status_changed` |
| Other entities | Yes | `entity_status_changed` |

### Derived statuses

- **`buildOpportunityChildLifecycleSummary`:** Read-only mixed-child headline for drawer/header — **explicitly does not mutate** `opportunities.status_key`.
- **No platform “rollup policy”** (e.g. “if all enrolled → case enrolled”) in code — **gap for orchestration**, not for a new engine: implement as **org workflows** or future **declarative rollup workflow templates**, not Lifecycle Builder stage JSON.

---

## 6. Requirement / preflight engine

### What it validates today

- **Drawer field policies:** `field_placements_v1`, `enforceDrawerFieldPoliciesOnPatch` on opportunity PATCH.
- **Lifecycle progression requirements:** `lifecycleProgressionRequirementsConfig` + department overrides in metadata.
- **Action preflight (execute-now):** `lifecycleActionRequirementCatalog` keys — `approve_enrollment`, `move_to_waitlist`, `schedule_tour`, `record_tour_outcome` via `evaluateOpportunityActionPreflight`.
- **Lifecycle field rules:** `lifecycleFieldRuleEvaluator` during activation validation / runtime checks.
- **Activation validation API:** `GET …/lifecycle-activation/validate` — structural truth (WU, statuses, placements), not workflow binding.

### Capture-first vs execute-now

Documented in `lifecycle_information_matrix_v1.md`: add child / create lead validate on submit; move to waitlist validates on execute click.

### Completion → orchestration?

**No.** Satisfying requirements does **not** emit workflow events or start workflows. BOS may surface recommendations from resolver + completion previews — still human-initiated action/workflow.

### Lifecycle Builder fit

Builder **Required information** step configures **which fields/rules** matter for activation proof — aligns with **completion catalog**, not Automations. Future card should **link** to Layouts/Fields and show **which execute-now actions** use preflight — not duplicate evaluator logic.

---

## 7. Tasks

### Model

- **Table:** `operational_tasks` — **opportunity-scoped only** (`entity_type` CHECK = `opportunities`).
- **Statuses:** `open` | `completed` | `canceled`
- **Sources:** `manual` | `task_assist`

### What tasks are not

- Not workflow action outputs (audit: **no** workflow step writes tasks).
- Not queue rows.
- Not lifecycle statuses.

### “Contact 3 times in 7 days”

Represent as:

1. **Operational tasks** — three dated follow-ups (`due_at`), or one task + comms log discipline; or
2. **Workflow** — scheduled checks / `communication_scheduled_sends` + attention reasons (`follow_up_date_passed`, stale codes); or
3. **Needs Attention** — SLA-style reason if org configures thresholds in `opportunity_attention_rules`.

**Not** a Lifecycle Builder stage setting — **runtime policy** via tasks + attention + optional workflows.

### Lifecycle Builder

No task template step today. **`create_task`** action is weak (opens panel). Orchestration card should document **Task Assist / My Tasks** as the human path, not invent task engine.

---

## 8. Needs Attention / SLA

### What it monitors

- **Platform-owned reason codes** (`attentionReasonCriteriaCatalog`) — stale inquiry, tour passed, follow-up overdue, missing identity, quote follow-up, inbound unanswered, etc.
- **Configurable buckets:** `metadata.opportunity_attention_rules.needs_attention_buckets` (dept / WU precedence).
- **Enrollment demo seed:** four lenses via `ensureEnrollmentPipelineWorkUnitV1` — optional.

### Stage-level vs lifecycle-level

- **Resolver is opportunity-grain** — reasons may reference status, tour metadata, tasks (`next_follow_up_at` sync from open tasks), comms signals.
- **Not stage-scoped in engine** — same reason can fire across stages; UI buckets group codes for operators.
- **Overlay queue:** `needs_attention` inside `enrollment_pipeline` — not a separate lifecycle stage.

### Tasks / overdue workflows feeding NA

- **Tasks:** `syncOpportunityNextFollowUpFromOperationalTasks` → `opportunities.metadata.next_follow_up_at` → can influence attention/copy.
- **Workflows:** Do not directly set attention flags; side effects (status, messages) may change resolver inputs on next fetch.

### Lifecycle Builder

Activation does not author attention buckets. Recommend **Settings → Attention & SLA** + dept metadata as orchestration surface; builder **links** rather than embeds rule math.

---

## 9. Child / Opportunity relationships

### Tables

```
customers (household)
  ├── customer_persons (person ↔ customer roles)
  ├── customer_members (children: relationship=child)
  └── opportunities (case: status_key, customer_id, work_unit_id, …)
        └── opportunity_customer_members (per-child inquiry: outcome_status_key, site, cohort, …)
              └── placement_candidates (waitlist grain: child × site × cohort)
```

### Primary operational container

**Enrollment CRM:** **`opportunities`** = household **case** (tours, threads, forms, follow-up, case queues). **Child enrollment state** = **`outcome_status_key`** on OCM (+ candidate queues for waitlist/enrolled lanes).

### Can opportunity status be derived from child statuses?

| Mechanism | Today |
|-----------|-------|
| Automatic rollup to `opportunities.status_key` | **No** |
| Read-only mixed summary UI | **Yes** (`buildOpportunityChildLifecycleSummary`) |
| Workflow listens to `child_lifecycle_status_changed` | **Possible** — org-configured |
| Strict mode audit tooling | **Readiness** (`runOcmLifecycleStrictModeAudit`) — activation deferred |

### Architecture answer (household example)

| Display | Recommended source |
|---------|-------------------|
| Child A enrolled / Child B waitlisted | OCM `outcome_status_key` + child summary strings |
| Case pipeline queue membership | **`opportunities.status_key`** (operator or workflow-maintained **coordination** status, e.g. `waitlisted` or `enrolling`) |
| “What should opportunity status be?” | **Product policy per org**, implemented as **Automations** (e.g. on child change: if all children `enrolled` → patch opportunity to `enrolled`; if any `waitlisted` and none enrolled → `waitlisted`) — **not** Lifecycle Builder stage wizard |

---

## 10. Waitlist infrastructure

### Grain

| Layer | Grain | SoT |
|-------|-------|-----|
| Case queue lanes | Opportunity | `opportunities.status_key` e.g. `waitlisted` |
| Waitlist v2 queues | **Candidate** (child × site × cohort) | `placement_candidates` + `QueueService` v2 |
| Child disposition | Per child | `outcome_status_key`; hook creates candidate when → `waitlisted` |

### Runtime filters

- Work unit `queue_definition` **`grain`:** `case` vs `candidate`
- Placement priority / ranking: `work_units.metadata.placement_priority_v1`, settings **`/adminV2/settings/placement-priority`**
- Client-side WU record filters (preview page only) — not membership truth

### Special behavior

- Manual position adjustments → activity events
- `move_to_waitlist` action **inactive** in catalog; placeholder UI intent still “coming next” for one-click case promotion
- Child waitlist → **`ensurePlacementCandidateForWaitlistedChild`** on canonical OCM update

### Lifecycle Builder

Statuses step assigns which **opportunity** `status_keys` belong to a **stage** — for waitlist stage, includes case keys used by queue filters. Does not configure ranking policy or candidate backfill rules.

---

## 11. BOS proposal framework

### What BOS can do (orchestration-related)

| Capability | Proposes | Executes? |
|------------|----------|-------------|
| **Operational recommendation** (`OperationalRecommendationV1`) | Next action, urgency, rationale from resolver/signals | **No** — maps to catalog action keys |
| **Task Assist** | Comms drafts, reminders → `operational_tasks` on apply | Apply via governed APIs only |
| **Workflow Assist** | Workflow **definition** create/apply (disabled-by-default) | CRUD + explain; uses same `executeWorkflowRun` patterns |
| **Config/Layout Assist** | Layout/field proposals | Partial apply catalog |
| **Ask BOS / handoff** | Routes to Task/Workflow Assist | None |

### Can BOS recommendations become workflow configs?

**Yes, in principle — today partial:** Workflow Assist proposals scaffold triggers (`opportunity_status_changed`, etc.) but **require human review in Automations** before enable. BOS doctrine: **no bypass** of `emitEvent` / workflows / `executeAdminAction`.

### Lifecycle Builder

BOS is **not** a lifecycle rules store. Builder should **surface links** (“Review recommended automations in Automations”) not embed Workflow Assist.

---

## 12. What already exists and should be reused

1. **`workflow_events` + `executeWorkflowRun`** for all automated side effects (messages, entity updates, links).
2. **`emitStatusChangedEvent` / `emitChildLifecycleStatusChangedEvent`** — never PATCH status without considering events.
3. **`executeAdminAction`** + **`action_placements`** for operator-initiated mutations.
4. **`status_definitions` + status-stages API** for stage ↔ status **labeling** (builder step 3).
5. **`status_transition_rules`** for transition gates (reference + validation).
6. **Completion / preflight catalogs** for execute-now gates — extend keys in code, not parallel JSON engine.
7. **`operational_tasks` + Task Assist** for human follow-up discipline.
8. **`resolveOpportunityAttention`** for SLA-style surfacing — configure via dept metadata.
9. **`placement_candidates` + QueueService v2** for waitlist execution lanes.
10. **`buildOpportunityChildLifecycleSummary`** for mixed-household UX — keep separate from case status SoT.
11. **BOS recommendations** for “what’s next” — hand off to actions/workflows.

---

## 13. What is missing (proven gaps)

| Gap | Risk | Remediation class |
|-----|------|-------------------|
| No case status rollup from children | Mixed household confusion | Org **workflows** on `child_lifecycle_status_changed` + operator training; optional future **rollup policy** table consumed by one workflow template — **not** builder hardcode |
| Workflow Assist / enrollment seeds incomplete | Automations empty on new orgs | Seeding + builder **link-out** to Automations with suggested triggers per stage |
| `operational_tasks` not workflow-creatable | “Automate follow-up” only via comms | New workflow action type (future) or document Task Assist path |
| `requirement_satisfied` not an event | No auto-advance on data complete | Add canonical `event_type` + emitters on PATCH threshold — **code registration** |
| `move_to_waitlist` inactive | Stage doctrine vs runtime | Enable canonical action + preflight — product sprint |
| Lifecycle Builder doesn’t show runtime bindings | Operators think builder **is** orchestration | UX: read-only **Orchestration** panel (links + health), not new engine |
| OCM vs case status drift | Data integrity | Strict mode + workflows; drawer copy already warns |
| `create_task` weak | Task doctrine vs UX | Improve action to open opportunity-scoped create modal |
| Stage-scoped Needs Attention | Marketing copy vs engine | Doc + optional bucket `reason_codes` per stage in metadata — config only |

---

## 14. Recommended ownership model

| Grain | Owns | Does not own |
|-------|------|--------------|
| **Opportunity (case)** | Pipeline coordination status, tours, comms threads, case queues, most attention, household forms | Per-child enrollment truth |
| **Child (OCM)** | `outcome_status_key`, site/cohort on inquiry, waitlist candidate creation | Case-wide tour schedule alone |
| **Person** | Identity, channels | Pipeline stage |
| **Customer / household** | Account, `customer_members` roster | Queue membership |
| **Placement candidate** | Waitlist ordering grain | Case status |
| **Lifecycle Builder metadata** | Stage list, activation bundle, stage↔status assignment, WU binding proof | Workflow definitions, rollup policies |

---

## 15. Recommended event model (canonical extensions)

Use **registered** `event_type` strings + `emitEvent` — extend only with migrations/docs/tests per operating doctrine.

| Event | When | Entity | Already exists? |
|-------|------|--------|-----------------|
| `child_lifecycle_status_changed` | OCM `outcome_status_key` changes | `opportunity_customer_members` | **Yes** |
| `opportunity_status_changed` | Case `status_key` changes | `opportunities` | **Yes** |
| `form_submitted` | Form submission finalized | `form_submissions` | **Yes** |
| `intake_case_operationalized` | Intake promotes to pipeline | (payload links opportunity) | **Yes** |
| `action_executed` | Admin action completes (where emitted) | varies | Partial / activity |
| `requirement_satisfied` | Stage requirements all pass (defined policy) | `opportunities` | **No — propose** |
| `workflow_completed` | Run terminal success | `workflow_runs` | Use run status today; optional explicit event for chaining |
| Tour / packet / waitlist events | Domain facts | per module | **Yes** (domain-specific) |

**Lifecycle Builder should document** which events operators typically wire per stage — not emit them itself.

---

## 16. Recommended lifecycle orchestration model

```
┌─────────────────────────────────────────────────────────────────┐
│ Lifecycle Builder (config plane)                                 │
│  lifecycle_builder_v1 · lifecycle_activation_v1                  │
│  stages · required info · status buckets · WU queue · actions    │
└────────────────────────────┬────────────────────────────────────┘
                             │ configures labels, keys, placements
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Runtime execution plane (existing)                                 │
│  Queues (grain) · status_definitions · executeAdminAction          │
│  completion preflight · resolveOpportunityAttention                │
└────────────────────────────┬────────────────────────────────────┘
                             │ facts
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Event spine: workflow_events → workflows → side effects          │
│  + BOS recommendations (read) → human → action/workflow apply      │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Stage config** | Operator stages, status keys per stage, WU sections, action placements, field rules |
| **Runtime rules/workflows** | Automations: triggers on status/form/child events; `update_entity`, messages, links |
| **Derived statuses** | Workflows (or future rollup service) — **never** builder JSON alone |
| **Tasks** | `operational_tasks` + Task Assist for discretionary follow-up |
| **Needs attention** | Resolver + bucket metadata — parallel to stages |

---

## 17. Future UI card naming recommendation

| Name | Verdict |
|------|---------|
| **Automation** | Collides with existing **Automations** = workflows hub |
| **Lifecycle Rules** | Collides with **field rules** / requirement engine language |
| **Workflows** | Too narrow — ignores tasks, attention, BOS |
| **Orchestration** | **Best umbrella label** for a **read-only + deep-link** card |

**Recommended pattern (when built):**

- Card title: **Orchestration** (or **Runtime connections**)
- Subsections: **Automations** (workflows), **Actions** (placements), **Attention & SLA**, **Tasks & follow-up**, **Waitlist policy** (link to placement-priority settings)
- Explicit disclaimer: “Side effects run through Automations and Actions — not through stage setup alone.”

Do **not** build a new rules engine UI under a new name.

---

## 18. Lifecycle Builder vs orchestration (current wiring)

| Builder step | Config written | Runtime consumer |
|--------------|----------------|------------------|
| Lifecycle / dept | `departments`, `lifecycle_builder_owned_v1` | Workspace dept list |
| Stage | `lifecycle_builder_v1` processes/stages | Stage labels, enrollment stage APIs |
| Required information | Field rules / requirements metadata | Preflight, activation validate |
| Statuses | `status-stages` PATCH, activation `status_keys` | Queue filters, status definitions |
| Work unit queue | `work_units`, `queue_definition` | `QueueService`, workspace |
| Actions | Placements | `resolveActionsForContext` |
| Forms | Links to form definitions | Intake / send form actions |
| Runtime validation | `lifecycle_activation_v1` | Proof only |

**None** of these steps create `workflows` rows.

---

## 19. Verification commands (for implementers later)

```bash
# Event / workflow touchpoints
rg "emitEvent|executeWorkflowRun|emitStatusChangedEvent|emitChildLifecycleStatusChangedEvent" web/lib web/app/api --glob "*.ts"

# Lifecycle builder
rg "lifecycle_builder_v1|lifecycle_activation_v1" web/lib web/components/adminV2/settings/lifecycle

# Child vs case status
rg "outcome_status_key|buildOpportunityChildLifecycleSummary" web/lib --glob "*.ts"
```

---

## 20. Decision log (audit outcomes)

1. **Do not build** Lifecycle Rules engine or second workflow runner before exhausting Automations + event emitters.
2. **Do not hardcode** household rollup in Lifecycle Builder; document workflow pattern for orgs.
3. **Do build** (future, separate sprint) Orchestration **linkage card** + optional `requirement_satisfied` event + workflow task action — only after product sign-off.
4. **Do align** operator docs: case status = coordination; child status = enrollment disposition; queues declare grain.

---

## Files inspected (blast radius reference)

| Area | Key paths |
|------|-----------|
| Workflows | `web/lib/emitEvent.ts`, `web/lib/workflowRun.ts`, `web/lib/admin/emitStatusChangedEvent.ts`, `web/lib/opportunities/emitChildLifecycleStatusChangedEvent.ts` |
| Actions | `web/lib/admin/actions/executeAdminAction.ts`, `docs/archive/2026-06-superseded-system/actions-and-workflows.md` |
| Status | `web/lib/lifecycle/enrollmentProcessStatusStageConfig.ts`, `web/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus.ts`, `web/lib/opportunities/buildOpportunityChildLifecycleSummary.ts` |
| Requirements | `web/lib/completion/lifecycleActionRequirementCatalog.ts`, `web/lib/admin/actions/adminActionPreflight.ts` |
| Builder | `web/lib/lifecycle/lifecycleBuilderConfig.ts`, `web/lib/lifecycle/lifecycleActivationConfig.ts`, `LifecycleActivationBoard.tsx` |
| Queues / attention | `web/lib/queues/QueueService.ts`, `docs/archive/2026-06-superseded-system/workspace-system.md`, `docs/product/crm-system.md` |
| BOS | `docs/product/bos-foundation.md`, `web/lib/bos/bosCapabilityRegistry.ts` |
| Schema | `docs/supabase/reference/supabase_tables.csv`, `supabase_schema_columns.csv` |

---

*End of audit — implementation paused per program direction.*
