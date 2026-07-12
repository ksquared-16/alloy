# Tasks V2 — Operational Work Framework

**Path:** `docs/sprints/archive/06_2026/tasks_v2_operational_work_framework.md`  
**Date:** 2026-06-03  
**Status:** **Operating model frozen — discovery only** (architecture only; no implementation)  
**Scope:** Define Alloy's **operational work framework**. Not a UI sprint, schema sprint, workflow sprint, or Needs Attention sprint.

**Canonical inputs (frozen unless major architectural issue):**

- [`completed/lifecycle_builder_hardening_closeout.md`](./completed/lifecycle_builder_hardening_closeout.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`needs_attention_v2_phase_0_implementation_plan.md`](./needs_attention_v2_phase_0_implementation_plan.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md) (§5 Task architecture — planning baseline)
- [`05_2026/task_system_audit_v1.md`](../05_2026/task_system_audit_v1.md) (May 2026 runtime audit)

**Note:** `needs_attention_v2_phase_1_closeout.md` was listed as a sprint input but is **not present** in the repo at discovery time. Needs Attention Phase 1 bridge doctrine is taken from the operating model and Phase 0 plan.

**Authority:** This document is the canonical reference for Tasks V2 implementation planning. Product copy, Lifecycle Builder task templates, workflow actions, and BOS Task Assist routing should align with **Operational Work Doctrine**, **Canonical Responsibilities**, **Attention Relationship Doctrine**, and §2–§12 unless an explicit exception is recorded in §13.

---

## Executive summary

**Tasks V2** reframes operational work as Alloy's **execution home for human follow-up** — a composable framework for answering: *What work should happen next?*

Today, task logic is **functional but narrow**:

- `operational_tasks` table — lightweight follow-up rows, mostly opportunity-linked
- Rich UX in My Tasks, drawer operational strip, and Task Assist
- No lifecycle task templates, no workflow-created tasks, no assignee UI
- Partial registry `create_task` action (opens panel, does not capture)
- Tasks feed Needs Attention indirectly via `metadata.next_follow_up_at` sync

V2 **does not invent a parallel work queue**. It **unifies vocabulary, ownership, creation sources, lifecycle semantics, and consumption patterns** around one task spine that existing paths extend — with **readiness, attention, lifecycle, and events as signal inputs**, not evaluators or owners.

| V2 delivers | V2 does not deliver (separate sprints) |
|-------------|----------------------------------------|
| Task framework + canonical definitions | `operational_tasks` schema migrations |
| Task template config model (Lifecycle Builder) | Task template CRUD UI |
| Creation / completion / ownership doctrine | Workflow `create_operational_task` action |
| Readiness / attention / BOS / automation boundaries | Needs Attention resolver changes |
| Phased implementation roadmap | Event materialization (`task_created`) |

**Target architecture (locked):**

```
Lifecycle Builder (future task templates)
        ↓
Platform task service (operational_tasks truth)
        ↑ consumes signals (does not re-derive)
Lifecycle state · ReadinessResult · AttentionResult · Events
        ↓
Task { id, title, due_at, status, assignment, source, entity_link }
        ↓
┌───────────┬───────────┬───────────┬───────────┐
│ My Tasks  │  Drawer   │   BOS     │ Automations│
│  panel    │  strip    │ propose   │ create/    │
│           │           │ explain   │ complete   │
└───────────┴───────────┴───────────┴───────────┘
        ↓
Needs Attention (project overdue / follow-up signals — read-only)
```

**Locked principles:**

1. Tasks answer **"What work should happen next?"**
2. Tasks **consume** lifecycle state, readiness, needs attention, and events — they **do not evaluate readiness** and **do not own attention**.
3. Attention **never creates** tasks. Tasks **may generate** attention signals when overdue or implied by open state.
4. **`operational_tasks`** remains the single runtime truth table. No lifecycle-owned task store.

---

## Operational Work Doctrine

Tasks track **durable human work** that an operator (or team) is expected to perform.

Tasks exist to coordinate follow-up — not to gate progression, not to explain decisions, and not to replace automations.

Tasks may represent:

### Follow-up

Human outreach or check-in expected by a date.

Examples:

- Call family back
- Send enrollment reminder
- Review packet after tour

### Collection

Work to gather missing operational information.

Examples:

- Collect child program interest
- Request missing documents
- Confirm tour attendance

### Review

Internal operational review requiring staff judgment.

Examples:

- Escalate stale inquiry for manager review
- Reconcile conflicting child dispositions
- Verify payment before enrollment

### Coordination

Cross-role or cross-team handoff work.

Examples:

- Assign tour guide
- Route to billing team
- Schedule placement follow-up

**Due date** determines scheduling urgency for the assignee.

**Status** determines whether the work item is active, done, or withdrawn.

**Source** determines provenance for audit and deduplication — not operator-facing priority.

Platform task taxonomy (§3) and template config map onto these intent classes. A single task carries one primary work intent plus optional entity linkage.

---

## Canonical Responsibilities

| System | Role |
|--------|------|
| **Readiness** | Evaluates required information |
| **Needs Attention** | Surfaces operational awareness |
| **Tasks** | Track human work |
| **Actions** | Resolve (side effects) |
| **Workflows** | Automate (create/complete tasks via platform API) |
| **BOS** | Explains, prioritizes, and recommends — proposes task drafts |

Tasks are a **consumer and executor**, not an evaluator or overlay owner.

The platform responsibilities are:

| Concern | Owner |
|---------|-------|
| Task row truth | `operational_tasks` + `operationalTasksService` |
| Task template config | Lifecycle Builder metadata (future) |
| Overdue / follow-up signals for NA | Attention resolver plugins (read task state) |
| Gap evaluation | Readiness Engine only |
| Action gating | Preflight / enforced readiness |
| Task draft proposals | BOS Task Assist |
| Autonomous task insert | Workflows / stage-entry listeners only |

---

## Attention Relationship Doctrine

Tasks may create attention.

Attention never creates tasks.

Examples:

| Layer | Example |
|-------|---------|
| **Task** | "Contact family" (due Friday) |
| **Attention** | "Follow-up date passed" or "Operational task overdue" |

The overdue or passed-due condition creates the attention signal.

Completing the task removes the attention signal (automatic resolution per NA doctrine).

This prevents circular operational behavior and preserves clean separation between work tracking and operational awareness.

*(Expanded patterns: §8.)*

---

## 1. Current-state audit

### 1.1 Data model (`operational_tasks`)

**Table:** `public.operational_tasks`  
**Migration origin:** `20260521103000_task_assist_v1_1_foundation.sql`  
**Recent extensions:** `20260603100500` (source `manual`), `20260603120000` (unlinked general tasks)

| Column | Role |
|--------|------|
| `id` | UUID primary key |
| `org_id` | Tenant scope (FK `orgs`) |
| `entity_type` | `opportunities` when linked; `NULL` for general tasks |
| `entity_id` | Opportunity UUID when linked; `NULL` for general tasks |
| `assigned_to_user_id` | Nullable UUID — **API only, no AdminV2 assign UI** |
| `created_by` | Actor who created |
| `title`, `description`, `due_at` | Core capture |
| `status` | `open` \| `completed` \| `canceled` (CHECK) |
| `source` | `task_assist` \| `manual` (CHECK) |
| `proposal_id` | Optional FK → `task_assist_proposals` |
| `metadata` | JSON bag (no platform schema yet) |
| `created_at`, `updated_at` | Audit timestamps |

**Constraints:**

- Entity link: both `entity_type` and `entity_id` null (general task) **or** both set with `entity_type = 'opportunities'`
- Org match trigger: linked opportunity must belong to same `org_id`
- Indexes: `(org_id, entity_type, entity_id, status)`, partial open-by-due

**Adjacent tables (not `operational_tasks`):**

| Table | Purpose |
|-------|---------|
| `task_assist_proposals` | Draft/approved AI proposals (comms + reminder intents); approve ≠ auto-create task |
| `communication_scheduled_sends` | Scheduled email/SMS — **separate domain** from tasks |

**Absent today:**

- No `task_templates` table (config lives in future metadata only)
- No recurring tasks
- No hard delete (cancel is soft terminal)
- No cross-entity types beyond opportunities (jobs/customers not supported)
- No task events in `workflow_events` catalog

---

### 1.2 Task creation paths

| Path | `source` | Mechanism | Creates row? |
|------|----------|-----------|--------------|
| **My Tasks → New task** | `manual` | `POST /api/admin/operational-tasks` | Yes |
| **Task Assist reminder card** | `task_assist` | POST with optional `proposal_id` | Yes |
| **Task Assist opportunity workspace** | `task_assist` | Same API | Yes |
| **Direct API** | `manual` \| `task_assist` | `validateOperationalTaskCreateBody` → `createOperationalTask` | Yes |
| **Registry `create_task`** | — | `ui_intent` → `adminv2:open-tasks-panel` | **No** — opens panel only |
| **BOS `complete_follow_up` / `escalate_operational_review`** | — | Maps to `create_task` → panel | **No** |
| **Workflow engine** | — | No `create_operational_task` action type | **No** |
| **Lifecycle stage entry** | — | Not implemented | **No** |
| **Readiness gap detection** | — | Evaluator read-only | **No** |
| **Needs Attention reason** | — | NA doctrine forbids | **No** |
| **Form outcome `createTask`** | — | `outcomeConfigPresentation` reads flag; not unified | **Partial** |

**Side effect (linked opportunity tasks):**

`syncOpportunityNextFollowUpFromOperationalTasks` recomputes `opportunities.metadata.next_follow_up_at` from earliest open task `due_at` where `source ∈ {task_assist, manual}`. This metadata field feeds attention reason `follow_up_date_passed`.

**Service layer:** `web/lib/admin/operationalTasksService.ts` — single write path for create, complete, cancel, update, list, workspace summary.

**API routes:**

- `GET/POST /api/admin/operational-tasks` — workspace list + create
- `PATCH /api/admin/operational-tasks/[id]` — status + field edits (open only)

**Auth:** `requireAdminOrgContextLight` on routes.

---

### 1.3 Task assignment behavior

| Aspect | Today |
|--------|-------|
| **Schema** | `assigned_to_user_id` nullable UUID on insert |
| **Create API** | Accepts `assigned_to_user_id` in POST body |
| **Update API** | **No** assignee PATCH — create-time only |
| **AdminV2 UI** | **No assignee picker** on My Tasks, drawer, or Task Assist |
| **My Tasks filters** | Open / due today / overdue / completed — **not by assignee** |
| **Default assignment** | Implicitly creator (`created_by`); assignee usually null |
| **Opportunity `assigned_to`** | Separate CRM field — **not synced** with task assignee |
| **Team / role / dept assignment** | **Not supported** |

**Practical behavior:** All open org tasks appear in workspace list (up to limit 200); assignment is inert in production UX.

---

### 1.4 Workflow integrations

**Spine:** `workflow_events` → enabled workflows → `executeWorkflowRun`

| Capability | Exists for tasks? |
|------------|-------------------|
| Workflow inserts `operational_tasks` | **No** — no action type in `workflowRun.ts` switch |
| Workflow completes tasks | **No** |
| Workflow reads task state | **No** first-class step |
| Event on task create/complete | **No** registered event keys |
| Workflow → messages | Yes — `create_message`, `send_message` (parallel scheduled comms) |
| Workflow → status | Yes — `update_entity` |
| Form submit → workflow | Yes — may indirectly change attention inputs |

**Orchestration audit conclusion:** Workflows may schedule **messages**, not operational tasks. Lifecycle V2 discovery recommends a future `create_operational_task` workflow action that delegates to `operationalTasksService` — not implemented.

**Form outcome flag:** `outcomeConfigPresentation` exposes `createTask` boolean from merged form config — not wired to `operational_tasks` insert path today.

---

### 1.5 UI surfaces

| Surface | What operators see | Create | Complete / edit |
|---------|-------------------|--------|-----------------|
| **Top nav → My Tasks** | Workspace-wide list (filters: open, due today, overdue, completed) | **MyTasksCreateTaskCard** | Full card UX |
| **`/adminV2/tasks`** | Same **MyTasksPanel** | Same | Same |
| **Opportunity drawer — operational strip** | Task chips + scheduled-send chips; BOS handoff | Via command bar / BOS → Task Assist | **OperationalTaskDetailPopover** |
| **Opportunity drawer — inquiry summary** | Task preview chips from `_operational_tasks_preview` | — | Read-only |
| **OpportunityOperationalTasksSection** | Full list (when mounted) | Points to command bar | Complete / cancel per row |
| **AI Command Surface / Task Assist** | Reminder compact card | **TaskAssistCompactReminderCard** | — |
| **BOS "Work with BOS"** | Seeds command for reminder | Handoff → Task Assist | — |
| **Registry `create_task`** | Opens tasks panel/modal | **Partial** — no inline create form |
| **Nav badge** | Open/overdue counts (`scope=workspace&summary=true`) | — | — |
| **Work unit bootstrap** | Prefetches `operational_tasks` summary (deferred) | — | — |

**Feature gate:** `isTaskAssistV1UiEnabled()` — when off, opportunity task sections return null.

**Urgency presentation:** `taskAssistOperationalUrgency.ts` — open / due soon / overdue badges; explicitly **not** conflated with scheduled send delivery state.

---

### 1.6 Lifecycle integrations

| Integration | Today | V2 direction |
|-------------|-------|--------------|
| **Lifecycle Builder Tasks section** | **None** — out of scope for hardening sprint | Stage task template config |
| **Actions matrix `create_task`** | Universal base action; `ui_intent` only | Capture-first modal on opportunity |
| **Stage entry templates** | Not implemented | `lifecycle_stage_task_templates_v1` metadata |
| **Lifecycle stage → task defaults** | Not configured | Template fires on `stage_entry` or `status_enter` |
| **Task ↔ lifecycle status** | Independent — tasks don't change status | Unchanged |
| **Required Information** | Readiness panel separate from tasks | Tasks consume gap lists for copy/context |
| **Needs Attention** | `follow_up_date_passed` via metadata sync | `operational_task_overdue` resolver plugin |
| **Ready check** | Does not validate task wiring | Optional row: "Task templates configured" |

**Doctrine:** Tasks are **not** lifecycle statuses. Lifecycle configures **templates**; runtime creates **rows** via platform task service.

**Stage typical use (from lifecycle matrix / BOS catalog):**

| Stage | Typical task use |
|-------|------------------|
| Lead | First outreach reminder; stale inquiry follow-up |
| Qualification | Follow up after contact; gather missing info |
| Tour | Remind before tour; record outcome follow-up |
| Waitlist | Long-wait outreach |
| Enrollment | Packet / missing info follow-up |
| Enrolled | Onboarding check-ins |

---

## 2. Task framework

### 2.1 What is a Task?

An **operational task** is a **durable, org-scoped work item** representing human follow-up expected by a due date — optionally linked to a record (today: opportunity) — with explicit status and provenance.

```
Task = platform service.create({ template?, signals?, actor, entity? }) → operational_tasks row
```

- **Durable** — survives page navigation; listed in My Tasks until terminal status
- **Human-executed** — completion implies operator acknowledgment, not automatic system resolution
- **Not a gate** — open tasks do not block actions (readiness preflight owns gates)
- **Not attention** — overdue tasks may **project** attention reasons; task rows are not NA queue items

### 2.2 Task Template

A **task template** is **configuration** — a reusable definition of default work to spawn when a lifecycle trigger fires.

| Field | Definition | Owner |
|-------|------------|-------|
| **`id`** | Stable template key within stage (for idempotency) | Lifecycle Builder |
| **`title`** | Default task title (may interpolate record context) | Config |
| **`due_offset`** | Business days/hours from trigger | Config |
| **`assign_to`** | Assignment policy: owner, role, team, or null | Config |
| **`trigger`** | `stage_entry` \| `status_enter` \| `event` | Config |
| **`trigger_keys`** | Status keys or event types when applicable | Config |
| **`completion_hints`** | Optional links to actions/forms that satisfy intent | Config |
| **`metadata`** | Template version, BOS suggest flag, dedupe key | Config |

**Distinction (frozen vocabulary):**

| Concept | Plane | Question |
|---------|-------|----------|
| **Task template** | Configuration | What work should we spawn on this trigger? |
| **Task** | Runtime | What work is assigned and due now? |
| **Task Assist proposal** | BOS draft | What work might the operator want to create? |

Templates live in **`lifecycle_stage_task_templates_v1`** metadata (proposed) — not a separate DB table in V2 Phase 1.

### 2.3 Task Assignment

**Task assignment** binds an open task to an **execution owner** — who is expected to perform the work.

| Assignment type | V2 support | Recommendation |
|-----------------|------------|----------------|
| **User** | Schema today (`assigned_to_user_id`) | **P0** — UI + PATCH |
| **Creator default** | Implicit via `created_by` | Default when assignee null |
| **Record owner** | Opportunity `assigned_to` exists separately | **Resolve at create time** — copy to `assigned_to_user_id`, don't live-sync |
| **Role** | Not in schema | **P2** — resolve role → user at create; store resolved UUID + `metadata.assigned_role_key` |
| **Team** | Not in schema | **P3** — team queue view; optional `metadata.assigned_team_id` |
| **Department** | Not in schema | **Defer** — use work unit + record context, not task column |
| **Queue** | Not in schema | **Defer** — My Tasks is user-centric; WU queues remain record previews |

**Locked:** Assignment is **snapshot at creation** — changing opportunity owner does not retroactively reassign open tasks unless automation or operator edits.

### 2.4 Task Status

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| **`open`** | Work pending | No |
| **`completed`** | Operator finished work | Yes |
| **`canceled`** | Withdrawn / dismissed (soft delete) | Yes |

**Recommendation:** Keep three-status model for V2. Do **not** introduce `in_progress`, `snoozed`, or parallel state machines in Lifecycle Builder.

| Future optional status | When | Notes |
|------------------------|------|-------|
| `snoozed` | Product requests deferral | Requires `snoozed_until` + attention interaction — defer to Phase 4+ |
| `blocked` | External dependency | Prefer attention + wait bucket over task status |

### 2.5 Task Completion

**Task completion** marks human work done — **without implying** readiness satisfied, attention cleared (except auto-resolved task-sourced reasons), or lifecycle progression.

| Completion kind | Mechanism | Side effects |
|-----------------|-----------|--------------|
| **Operator complete** | PATCH `status: completed` | Re-sync `next_follow_up_at` if task_assist source |
| **Operator cancel** | PATCH `status: canceled` | Same sync |
| **Automation complete** | Future workflow action → service | Same sync + optional event emit |
| **Implicit complete** | **Forbidden** — no auto-complete on message sent | |

**Completion criteria (V2):**

- Default: **operator explicit** — one-click complete in My Tasks or drawer
- Template `completion_hints`: **informational only** — link to actions that *may* satisfy underlying need; completing task does not execute actions
- **Readiness:** Completing "Collect program interest" task does **not** populate field unless operator also edits record or workflow PATCHes

---

## 3. Task sources

Evaluation of six creation sources with recommendations:

### 3.1 Lifecycle stage entry

| | |
|---|---|
| **Definition** | When a record first enters a lifecycle stage (visibility lens match), spawn configured templates |
| **Today** | Not implemented |
| **Recommendation** | **Yes — P2 (Builder + listener)**. Templates in `lifecycle_stage_task_templates_v1`; server hook on stage-entry detection or workflow on `opportunity_status_changed` |
| **Idempotency** | Required — `metadata.template_id` + entity + stage key; fire once per stage entry |
| **Owner** | Lifecycle config defines templates; platform task service creates rows |

### 3.2 Readiness

| | |
|---|---|
| **Definition** | Readiness evaluation detects gaps → spawn collection tasks |
| **Today** | Readiness Phase 1 **explicitly excludes** task creation |
| **Recommendation** | **No direct creation.** Readiness **consumes into Task Assist copy** and template **wording** only. **Automations** may create tasks on `requirement_violated` (orchestration sprint) |
| **Anti-pattern** | Readiness evaluator inserting `operational_tasks` |

### 3.3 Needs Attention

| | |
|---|---|
| **Definition** | Attention reason fires → auto-create task |
| **Today** | Not implemented; doctrine forbids |
| **Recommendation** | **No.** NA **never creates** tasks. Reverse path only: open/overdue tasks → `operational_task_overdue` / `follow_up_date_passed` attention reasons |
| **Automation bridge** | Workflow on persistent attention (Phase 6 NA roadmap) **may** create task — that is orchestration reacting to signal, not NA resolver |

### 3.4 User actions

| | |
|---|---|
| **Definition** | Operator clicks Create Task / completes registry action |
| **Today** | `create_task` opens My Tasks panel — weak |
| **Recommendation** | **Yes — P0.** Capture-first modal on opportunity (title, due, notes, optional assignee) calling existing POST. Register **`complete_task`** as `execute_now` PATCH |
| **Surfaces** | Drawer strip, header overflow, My Tasks, queue row (when placed) |

### 3.5 Workflow events

| | |
|---|---|
| **Definition** | Automation reacts to `opportunity_status_changed`, `form_submitted`, etc. |
| **Today** | No task workflow action |
| **Recommendation** | **Yes — P3.** New workflow action type `create_operational_task` delegating to `operationalTasksService` with payload `{ title, due_at, assign_to_policy, entity_id, template_id?, metadata }`. Same service path as manual create — **no duplicate insert logic in workflow runner** |
| **Complete / escalate** | `complete_operational_task` action (by id or template_key + entity) — Phase 3+ |

### 3.6 Manual creation

| | |
|---|---|
| **Definition** | Operator creates task without template or automation |
| **Today** | My Tasks create card — supports linked + general tasks |
| **Recommendation** | **Keep — first-class.** `source: manual`. General (unlinked) tasks remain valid for internal ops work |
| **Enhancement** | Assignee UI; link-to-record picker beyond opportunity context |

### 3.7 Source summary

| Source | Creates task? | Owner | Phase |
|--------|---------------|-------|-------|
| Lifecycle stage entry | Yes (via template) | Automation/listener + config | P2 |
| Readiness evaluator | **No** | — | — |
| Readiness → automation | Yes | Workflow | P3+ |
| Needs Attention | **No** | — | — |
| User action | Yes | Operator + action runtime | P0 |
| Workflow event | Yes | Workflow engine | P3 |
| Manual | Yes | Operator | Maintain |
| BOS Task Assist | Yes (on apply) | Operator applies proposal | Maintain |

**`source` enum extension (future):**

| Value | Meaning |
|-------|---------|
| `manual` | Operator My Tasks / modal |
| `task_assist` | BOS proposal applied |
| `lifecycle_template` | Stage template spawn |
| `workflow` | Automation created |
| `system` | Platform maintenance (rare) |

---

## 4. Task lifecycle

### 4.1 Status model (recommended)

Keep existing CHECK constraint values. State diagram:

```
                    ┌──────────┐
         create ──▶ │   open   │
                    └────┬─────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌──────────┐ ┌──────────┐  (edit due/title/
     │completed │ │ canceled │   title/desc only)
     └──────────┘ └──────────┘
```

**Rules:**

- Only `open` → editable fields
- Terminal states immutable (no reopen in V2 — create new task if needed)
- No deleted rows — cancel preserves audit trail

### 4.2 Assignment model (recommended)

**Phase 1:** User assignment with UI

- Create/edit assignee dropdown (staff list)
- My Tasks filter: mine / unassigned / all
- Default: opportunity `assigned_to` when linked, else creator

**Phase 2:** Role-based resolution at template spawn

- Template `assign_to: "role"` + `assign_role_key`
- Listener resolves to user UUID at create; stores role key in metadata for audit

**Phase 3:** Team visibility

- Team filter in My Tasks; no separate team inbox table

### 4.3 Escalation model (recommended)

Tasks do **not** own escalation state machines. Escalation is **cross-cutting**:

| Escalation signal | Mechanism | Owner |
|-------------------|-----------|-------|
| Task overdue | Attention reason `operational_task_overdue` | NA resolver |
| SLA breach on record | Existing attention reasons | NA resolver |
| Manager review needed | Template or BOS proposal with title copy | Config / BOS |
| Automated escalation | Workflow on attention + task age | Automations |

**Recommendation:** Do **not** add `escalation_level` column in V2 Phase 1. Use:

1. Attention overlay for visibility
2. Workflow triggers for reassignment or new task creation
3. BOS recommendation for "escalate" copy → `create_task` handoff

### 4.4 Due date model (recommended)

| Aspect | Recommendation |
|--------|----------------|
| **Required** | Yes — `due_at` NOT NULL (existing) |
| **Default manual create** | +1 business day org default (Settings, Phase 2) |
| **Template offset** | `due_offset_business_days` from trigger timestamp |
| **Timezone** | Store UTC; display local (existing My Tasks behavior) |
| **Snooze** | Defer — edit `due_at` is sufficient for V2 |
| **Sync to opportunity** | Keep `next_follow_up_at` sync for linked tasks — earliest open due |
| **Attention coupling** | Overdue = `due_at < now()` ∧ `status = open` |

---

## 5. Ownership model

### 5.1 Evaluation

| Model | Fit | Recommendation |
|-------|-----|----------------|
| **User ownership** | Primary execution unit | **Canonical** — `assigned_to_user_id` |
| **Team ownership** | Group visibility | **Phase 3** — filter + metadata, not row ownership |
| **Department ownership** | Implicit via org + dept context | **Do not store on task** — derive from linked record / WU |
| **Queue ownership** | WU queues are record previews | **Reject** — tasks are not queue rows |

### 5.2 Recommendation (locked)

**Primary ownership = assigned user UUID.**

| Question | Answer |
|----------|--------|
| Who owns task truth? | Platform task service + `operational_tasks` |
| Who owns template config? | Lifecycle Builder metadata |
| Who owns overdue signaling? | Needs Attention resolver (read-only query) |
| Who owns work completion side effects? | Actions/workflows — not task module |
| Can one task have multiple assignees? | **No** in V2 — create multiple tasks or use team filter |

**Record linkage:**

- Linked tasks inherit **context** (opportunity label, site, WU) via enrichment — `operationalTasksWorkspaceEnrichment.ts`
- Linkage does **not** imply assignee = record owner unless template policy says so

---

## 6. Creation model

### 6.1 Single write path (locked)

All task inserts route through **`createOperationalTask`** in `operationalTasksService.ts`:

```
Manual UI ──────┐
Task Assist ────┤
Workflow action ┼──▶ createOperationalTask() ──▶ operational_tasks
Stage listener ─┤
API POST ───────┘
         │
         └──▶ syncOpportunityNextFollowUpFromOperationalTasks (when linked)
```

**No client-side direct DB inserts. No parallel task tables.**

### 6.2 Template instantiation

```typescript
function instantiateTaskFromTemplate(params: {
  template: LifecycleTaskTemplateV1;
  entityId: string;
  orgId: string;
  actorUserId: string;
  triggerContext: { stage_key: string; status_key?: string };
}): CreateOperationalTaskParams {
  // Resolve assignee from template policy
  // Compute due_at from offset
  // Dedupe: skip if open task with same metadata.template_id exists
  // source: 'lifecycle_template'
}
```

### 6.3 Dedupe keys

| Source | Dedupe strategy |
|--------|-----------------|
| Lifecycle template | `(org_id, entity_id, metadata.template_id, status=open)` |
| Workflow | Payload `idempotency_key` in metadata |
| Task Assist proposal | `proposal_id` uniqueness (existing) |
| Manual | No dedupe — operator intent |

### 6.4 Provenance metadata (recommended shape)

```typescript
metadata: {
  template_id?: string;
  template_version?: number;
  workflow_run_id?: string;
  idempotency_key?: string;
  assigned_role_key?: string;
  readiness_gap_ids?: string[];  // context only — not evaluation
  attention_reason_codes?: string[];  // context at create time
}
```

---

## 7. Completion model

### 7.1 Operator completion

| Surface | Action |
|---------|--------|
| My Tasks card | Complete / dismiss (cancel) |
| Drawer popover | Complete / cancel / edit |
| Future `complete_task` action | PATCH via action runtime |

### 7.2 Automation completion

Future workflow action `complete_operational_task`:

- Match by `task_id` or `(entity_id + template_id)` for open task
- Delegate to `completeOperationalTask()` — same as PATCH

### 7.3 Completion ≠ resolution

| System | Clears on task complete? |
|--------|--------------------------|
| Task-sourced NA reason (`operational_task_overdue`) | **Yes** — automatic |
| Readiness gaps | **No** — unless action/workflow PATCHes fields |
| Activity stale reasons | **No** |
| `follow_up_date_passed` | **Yes** if no other open tasks with past due |

### 7.4 Events (future)

| Event | When | Phase |
|-------|------|-------|
| `operational_task_created` | After insert | P4 |
| `operational_task_completed` | After terminal status | P4 |
| `operational_task_overdue` | Scheduled job / attention bridge | P4+ |

Not required for V2 Phase 0–2. Workflows can poll or react to attention until events ship.

---

## 8. Readiness integration

### 8.1 Locked doctrine (from Readiness framework §9.1)

Per [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md):

| Question | Answer |
|----------|--------|
| Should readiness **create** tasks? | **No** — not directly |
| Should tasks **consume** readiness? | **Yes** — templates and Task Assist use gap lists and state |
| Does task completion satisfy readiness? | **Only if** separate action/workflow PATCHes satisfied fields |

### 8.2 Consumption patterns

| Pattern | Mechanism | Owner |
|---------|-----------|-------|
| Task Assist draft title/body | BOS reads `ReadinessResult.gaps[]` | BOS proposal |
| Template default copy | Builder references requirement labels | Config |
| "Collect missing X" task from gap | Workflow on `requirement_violated` | Automations (P3+) |
| My Tasks context chip | Show readiness state on linked opportunity | UI (P2) |

### 8.3 Integration architecture

```
evaluateOperationalReadiness(record)
        ↓
ReadinessResult { primary_state, gaps[] }
        ↓
┌───────────────────┬────────────────────┐
│ Task Assist (BOS) │ Template wording   │
│ proposes draft    │ (config only)      │
└───────────────────┴────────────────────┘
        ↓ (human apply or workflow)
createOperationalTask()  ← never called from evaluator
```

### 8.4 Anti-patterns

| Anti-pattern | Why forbidden |
|--------------|---------------|
| Evaluator inserts task on gap | Violates single evaluator doctrine |
| Task complete → auto-clear readiness gap | Field truth unchanged |
| Readiness panel "Create task" bypassing BOS/workflow | OK as **UI shortcut to modal** — still calls task API, not evaluator |

---

## 9. Attention integration

### 9.1 Locked doctrine (from NA operating model §7)

| Question | Answer |
|----------|--------|
| Should attention **create** tasks? | **No** |
| Should tasks **generate** attention? | **Yes** — via resolver plugins |
| Should NA show task rows? | **No** — signal codes only |

### 9.2 Current coupling

| Mechanism | Direction |
|-----------|-----------|
| `operational_tasks` → `metadata.next_follow_up_at` | Task sync → `follow_up_date_passed` |
| Resolver → tasks | **No** reverse query today |
| Task Assist urgency | May read attention severity — presentation only |

### 9.3 V2 projection (from NA roadmap Phase 4)

| Task state | Attention reason | Source tag |
|------------|------------------|------------|
| Open task `due_at < now()` | `operational_task_overdue` | `tasks` |
| `next_follow_up_at` passed | `follow_up_date_passed` | `tasks` (via metadata) |

**Implementation shape:**

```typescript
function collectTaskAttentionCodes(
  openTasks: OperationalTaskRow[],
  nowMs: number,
): AttentionReasonCode[] {
  // Aggregate — one reason per record, not per task row
}
```

### 9.4 Duplicate avoidance

| Surface | Shows |
|---------|---------|
| My Tasks | Full task list |
| Drawer task strip | Task chips |
| Needs Attention lane | **Reason codes only** — "Follow-up overdue" not task title list |
| BOS | May reference primary open task title in recommendation copy |

---

## 10. BOS integration

### 10.1 Responsibility split (locked)

```
┌─────────────────────────────────────────────────────────┐
│  Tasks (platform)                                        │
│  Provides TRUTH: operational_tasks rows, due, status     │
└───────────────────────────┬─────────────────────────────┘
                            │ read-only snapshot
                            ▼
┌─────────────────────────────────────────────────────────┐
│  BOS                                                     │
│  Provides: EXPLANATION · PRIORITIZATION · PROPOSALS      │
└─────────────────────────────────────────────────────────┘
```

| Tasks provide | BOS provides |
|---------------|--------------|
| Open task list + due dates | "Suggested next step" judgment |
| Task titles in handoff copy | Task Assist reminder drafts |
| Overdue state (derived) | Urgency framing (non-authoritative) |
| Entity context | Natural language explanation |

| BOS must not | Because |
|--------------|---------|
| Insert tasks without apply | Human-in-the-loop doctrine |
| Become task infrastructure | Platform service owns CRUD |
| Override task assignee/due | Proposal ≠ truth |
| Auto-complete tasks | Completion is operator/automation authority |
| Re-evaluate readiness for task copy | Single evaluator |

### 10.2 Capability mapping

| Capability | Input | Output | Creates task? |
|------------|-------|--------|---------------|
| **`task_assist`** (reminder) | Record + gaps + attention | Proposal → apply | On operator apply only |
| **`operational_recommendation`** | Attention + tasks preview | Suggested action → often `create_task` | Handoff only today |
| **`complete_follow_up`** catalog | Stale / follow-up signals | Maps to `create_task` | Handoff only |
| **`escalate_operational_review`** | SLA / blocked signals | Maps to `create_task` | Handoff only |

### 10.3 Explain tasks

BOS explains **why follow-up matters** using deterministic signals:

1. Primary attention reason + SLA tier
2. Readiness gap headlines (from snapshot)
3. Open task title + due urgency badge semantics

Copy pattern: *"Follow-up overdue · Contact family was due yesterday · 2 required fields still missing"*

### 10.4 Recommend tasks

BOS recommends **creating or completing** work — routes to:

- Task Assist `create_reminder` mode (prefilled title/due)
- Registry action `create_task` (future: modal with prefill)
- `complete_task` when open task matches recommendation

Recommendation **≠** task row. Applying proposal creates row.

### 10.5 Prioritize tasks

My Tasks sort order (recommended):

1. Overdue linked to record in current drawer context
2. Overdue assigned to current user
3. Due today
4. Attention severity on linked record (presentation weight — `taskAssistOperationalUrgency.ts`)
5. Due date ascending

BOS prioritization is **assistive ordering** for recommendations — My Tasks owns default sort unless operator chooses filter.

---

## 11. Automation integration

### 11.1 Principle (locked)

Workflows **invoke platform task service** — they do **not** duplicate task logic inline.

### 11.2 Create tasks

**New action type (spec):** `create_operational_task`

```json
{
  "action_type": "create_operational_task",
  "payload": {
    "title": "Contact family after tour",
    "due_at": "{{event.payload.scheduled_at + 1d}}",
    "entity_id": "{{event.payload.opportunity_id}}",
    "assigned_to_user_id": "{{resolve_role('enrollment_coordinator')}}",
    "source": "workflow",
    "metadata": {
      "template_id": "tour_follow_up",
      "workflow_run_id": "{{run.id}}"
    }
  }
}
```

**Implementation:** One case in `executeWorkflowRun` → `createOperationalTask()`.

### 11.3 Complete tasks

**New action type (spec):** `complete_operational_task`

```json
{
  "action_type": "complete_operational_task",
  "payload": {
    "task_id": "{{...}}",
    "or": {
      "entity_id": "{{...}}",
      "template_id": "contact_family"
    }
  }
}
```

### 11.4 Escalate tasks

Escalation = **create replacement task** and/or **reassign** — not a task status:

| Pattern | Workflow |
|---------|----------|
| Overdue 3 days | Create task "Manager review" assigned to role |
| Reassign | PATCH assignee (when PATCH supported) or cancel + recreate |
| Notify | `send_message` to assignee — parallel to task row |

### 11.5 Trigger catalog (lifecycle orchestration examples)

| Trigger | Task action |
|---------|-------------|
| `opportunity_status_changed` → `new_inquiry` | Create "Contact family" from template |
| `requirement_violated` | Create "Collect {{gap.label}}" |
| `operational_task_overdue` (future event) | Escalation task |
| Stage entry (listener) | Instantiate stage templates |

### 11.6 What workflows must not do

| Forbidden | Why |
|-----------|-----|
| Raw INSERT into `operational_tasks` | Bypasses sync, validation, dedupe |
| Set `next_follow_up_at` without task row | Split brain vs task truth |
| Complete task when message sent | Completion ≠ delivery |

---

## 12. Relationship model

### 12.1 Task vs Lifecycle

| Dimension | Lifecycle | Task |
|-----------|-----------|------|
| **Question** | Where is record in pipeline? | What work is due? |
| **Owns** | Stage config, templates | Runtime work rows |
| **Mutual effect** | Stage entry spawns templates | Task complete does not change stage |

### 12.2 Task vs Readiness

| Dimension | Readiness | Task |
|-----------|-----------|------|
| **Question** | Is required info present? | Is follow-up work done? |
| **Creates** | Gaps | Nothing from evaluator |
| **Clears** | Field populated | Operator complete |

### 12.3 Task vs Needs Attention

| Dimension | Needs Attention | Task |
|-----------|-----------------|------|
| **Question** | Should operator be aware? | What should operator do? |
| **Creates** | Nothing | Nothing from NA |
| **Coupling** | Reads task overdue state | Independent execution home |

### 12.4 Task vs Actions

| Dimension | Action | Task |
|-----------|--------|------|
| **Question** | What side effect to execute now? | What work to track over time? |
| **Examples** | Send form, change status | Call back Friday |
| **Registry** | `create_task` opens panel today | Future: modal + `complete_task` |

### 12.5 Task vs BOS

| Dimension | BOS | Task |
|-----------|-----|------|
| **Role** | Propose, explain, prioritize | Durable work truth |
| **Mutates** | Only via apply paths | CRUD via task service |

### 12.6 Task vs Automations

| Dimension | Workflow | Task |
|-----------|----------|------|
| **Role** | Event-driven side effects | Human work tracking |
| **Creates tasks** | Via service call (future) | — |
| **Replaces tasks** | No — comms ≠ tasks | — |

### 12.7 Overlap prevention matrix

| Responsibility | Owner | Must not also live in |
|----------------|-------|------------------------|
| Evaluate readiness | Readiness Engine | Tasks, NA, BOS |
| Surface awareness | Needs Attention | Tasks UI, BOS truth |
| Track human work | Tasks | NA queue rows |
| Execute side effect | Actions / Workflows | Task completion |
| Explain / recommend | BOS | Task CRUD |
| Template config | Lifecycle Builder | Workflow JSON |
| Task row truth | operational_tasks | Metadata mirrors, LLM memory |

---

## 13. Risks and architectural traps

| Risk | Trap | Mitigation |
|------|------|------------|
| **Parallel task stores** | Lifecycle metadata rows as tasks | Templates ≠ tasks; one table |
| **NA creates tasks** | Resolver insert on reason | Locked doctrine §9 |
| **Readiness creates tasks** | Evaluator side effect | Automation-only path §8 |
| **BOS auto-insert** | LLM creates follow-up | Proposal + apply only |
| **Task = message** | Scheduled send as task | Separate domains; existing urgency split |
| **Task complete = gap cleared** | Operator confusion | Copy + separate readiness panel |
| **Split follow-up truth** | PATCH `next_follow_up_at` without task | Always sync from tasks; deprecate manual metadata edit |
| **Registry/action drift** | `create_task` opens panel | P0 modal convergence |
| **Template spam** | Re-entry creates duplicates | Idempotent template keys |
| **Assignee drift** | Live-sync from record owner | Snapshot at create |
| **Queue as task inbox** | WU shows task rows | My Tasks + drawer strip only |
| **Workflow raw SQL** | Bypass service | Single `createOperationalTask` path |
| **Snooze as status** | Complex state machine | Edit due_at in V2 |
| **Entity scope creep** | Jobs/customers tasks before product need | Opportunity + general first |
| **Attention task list** | NA lane shows tasks | Aggregate reason codes only |
| **Feature gate hides all** | Task Assist gate kills tasks | Decouple core task UX from assist gate (P1) |
| **Reveal regression** | Task fetch blocks drawer | Keep deferred bootstrap pattern |

---

## 14. Phased implementation roadmap

### Phase 0 — Discovery (this document)

- [x] Current-state audit
- [x] Task framework definitions
- [x] Task lifecycle + ownership + creation + completion models
- [x] Source evaluation + recommendations
- [x] Readiness / attention / BOS / automation integration doctrine
- [x] Relationship model + overlap prevention
- [x] Risks + roadmap
- [ ] Product sign-off on §15 open decisions before Phase 1 coding

### Phase 1 — Action alignment + operator completeness (runtime)

**Goal:** Registry actions match task runtime; core assignee support.

| Work | Type |
|------|------|
| `create_task` → capture-first modal on opportunity | Action UX |
| Register `complete_task` as `execute_now` | Action catalog |
| Assignee dropdown on create/edit | UI |
| PATCH `assigned_to_user_id` | API |
| My Tasks: mine / unassigned filter | UI |
| Decouple base task UX from Task Assist-only gate (where safe) | UI |
| Tests: action + PATCH + sync | QA |

**Exit:** Operator creates and completes tasks from drawer without opening global panel only.

**Depends on:** None (builds on existing service).

### Phase 2 — Lifecycle task templates (config + listener)

**Goal:** Builder defines templates; stage entry creates rows.

| Work | Type |
|------|------|
| `lifecycle_stage_task_templates_v1` metadata schema | Config |
| Lifecycle Builder Tasks section (template CRUD) | Builder UI |
| Stage-entry listener or status-changed workflow seed | Runtime |
| `source: lifecycle_template` enum extension | Schema + service |
| Template dedupe via `metadata.template_id` | Service |
| Ready check optional row | Builder |

**Exit:** Lead stage entry creates "Contact family" task once per record.

**Depends on:** Phase 1 create path stable.

### Phase 3 — Workflow task actions

**Goal:** Automations create and complete tasks without duplicating logic.

| Work | Type |
|------|------|
| `create_operational_task` workflow action | workflowRun |
| `complete_operational_task` workflow action | workflowRun |
| Workflow template seeds (tour follow-up, etc.) | Seeds/docs |
| `requirement_violated` → task pattern doc | Orchestration |
| `source: workflow` enum | Schema + service |

**Exit:** Status change workflow creates follow-up task via service.

**Depends on:** Phase 2 template keys for idempotency patterns.

### Phase 4 — Attention bridge + events

**Goal:** Task overdue surfaces in NA; optional events for analytics/automation.

| Work | Type |
|------|------|
| `operational_task_overdue` resolver plugin | NA (coordinate with NA Phase 4) |
| Task ↔ `next_follow_up_at` sync audit | Tasks |
| Optional `operational_task_*` events | Events |
| BOS prefill from open tasks + gaps | BOS |

**Exit:** Overdue tasks appear as attention signals; completing task clears reason.

**Depends on:** NA V2 Phase 4 task extensions (parallel-safe).

### Phase 5 — Platform breadth

**Goal:** Settings, reporting, cross-entity expansion if product approved.

| Work | Type |
|------|------|
| Org task defaults (due offset, default assignee policy) | Settings |
| Task template library presets by vertical | Seeds |
| Cross-entity task links (beyond opportunity) | Schema + product decision |
| Reporting: open/overdue task aggregates | Reporting |
| Packet/readiness-driven template completion hints | Builder |

**Exit:** Operators configure task defaults without code changes.

### Phase 6 — Operational intelligence

**Goal:** Work prioritization dashboards and persistent-signal automations.

| Work | Type |
|------|------|
| My Tasks smart sort with BOS weighting (optional) | UI |
| Workflow on persistent attention + no open task | Automations |
| Team task views | UI |
| Recurring task templates (if approved) | Config + scheduler |

---

## 15. Open decisions (require product sign-off before Phase 1)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | General unlinked tasks | Keep vs require entity link | **Keep** — internal ops use case shipped |
| 2 | `create_task` modal scope | Opportunity-only vs entity picker | **Opportunity-first**; general in My Tasks |
| 3 | Default assignee | Creator vs record owner vs null | **Record owner when linked**, else creator |
| 4 | Template metadata location | Nested in `lifecycle_builder_v1` vs dept metadata | **Nested under builder process** (per lifecycle V2 discovery) |
| 5 | Stage re-entry templates | Fire again vs once per lifetime | **Once per stage entry episode** — idempotent keys |
| 6 | Task Assist gate decoupling | Split gates for task UX vs assist | **Decouple** — tasks are core ops, assist is enhancement |
| 7 | `source` enum migration | CHECK constraint vs app-only | **Migration when adding `lifecycle_template` + `workflow`** |
| 8 | Reopen canceled tasks | Allow vs create new | **Create new** — simpler audit |
| 9 | BOS one-click task from recommendation | Prefilled modal vs Task Assist only | **Prefilled modal** (Phase 1) |
| 10 | NA Phase timing | Task overdue before/after NA Phase 4 | **Coordinate** — plugin ready when NA extends task category |

---

## Appendix A — Key files (current implementation)

| Area | Paths |
|------|-------|
| Schema | `supabase/migrations/20260521103000_task_assist_v1_1_foundation.sql`, `20260603100500_*`, `20260603120000_*` |
| Service | `web/lib/admin/operationalTasksService.ts` |
| API | `web/app/api/admin/operational-tasks/route.ts`, `[id]/route.ts` |
| Client API | `web/lib/agent/taskAssist/taskAssistV11OpportunityApi.ts` |
| My Tasks | `web/app/adminV2/components/MyTasksPanel.tsx`, `MyTasksCreateTaskCard.tsx`, `MyTasksModal.tsx` |
| Drawer | `OpportunityOperationalCompactStrip.tsx`, `OperationalTaskDetailPopover.tsx` |
| Task Assist | `TaskAssistCompactReminderCard.tsx`, `task_assist_v1_1.md` |
| BOS handoff | `web/lib/adminV2/bos/operationalRecommendationHandoff.ts` |
| BOS catalog map | `web/lib/adminV2/bos/recommendations/preflight/mapCatalogKeyToCanonicalActionKey.ts` |
| Registry client | `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` |
| Urgency | `web/lib/agent/taskAssist/taskAssistOperationalUrgency.ts` |
| Follow-up sync | `syncOpportunityNextFollowUpFromOperationalTasks` in service |
| Task preview | `web/lib/admin/drawer/opportunityInquirySummaryTaskPreview.ts` |
| WU bootstrap | `web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts` |
| May 2026 audit | `docs/sprints/archive/05_2026/task_system_audit_v1.md` |
| Lifecycle V2 task § | `docs/sprints/archive/06_2026/lifecycle_v2_discovery_and_operating_model.md` §5 |

---

## Appendix B — Vocabulary alignment

Per [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md):

| Use | Avoid |
|-----|-------|
| Task / Follow-up | Lifecycle task (for runtime row) |
| Task template | Task (when meaning config) |
| My Tasks | Alert queue |
| Complete / Dismiss | Delete |
| Open / Overdue | SLA breach (for human tasks) |
| Suggested next step (BOS) | AI decided |
| Work item | Ticket (unless vertical config) |

---

## Appendix C — Success criteria (framework freeze)

| Criterion | Status |
|-----------|--------|
| Operational Work Doctrine stated | Yes — post Executive summary |
| Canonical Responsibilities + Attention Relationship Doctrine | Yes |
| Current state documented | Yes — §1 |
| Task / Template / Assignment / Status / Completion defined | Yes — §2 |
| Six task sources evaluated | Yes — §3 |
| Status / assignment / escalation / due models recommended | Yes — §4 |
| Ownership model evaluated | Yes — §5 |
| Creation + completion models | Yes — §6–§7 |
| Readiness integration (consume, not evaluate) | Yes — §8 |
| Attention integration (signal, not create) | Yes — §9 |
| BOS integration boundaries | Yes — §10 |
| Automation integration (service delegation) | Yes — §11 |
| Relationship model + overlap prevention | Yes — §12 |
| Risks enumerated | Yes — §13 |
| Phased roadmap | Yes — §14 |
| Aligned with canonical vocabulary | Yes — Appendix B |
| No implementation in discovery sprint | Yes — constraints honored |

---

*End of operating model — implementation planning may begin after §15 sign-off.*
