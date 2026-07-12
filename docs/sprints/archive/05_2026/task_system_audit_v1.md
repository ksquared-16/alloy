# Task System Audit v1

**Path:** `docs/sprints/archive/05_2026/task_system_audit_v1.md`  
**Status:** Audit (May 2026) — no implementation  
**Scope:** AdminV2 operational tasks (`operational_tasks`), Task Assist V1.1, BOS handoffs, registry `create_task`, and adjacent scheduled communications.

**Related:** [`task_assist_v1_1.md`](./task_assist_v1_1.md), [`adminv2_action_runtime_audit_and_plan_v1.md`](./adminv2_action_runtime_audit_and_plan_v1.md), [`lifecycle_sprint_final_coverage_closeout_audit_v1.md`](./lifecycle_sprint_final_coverage_closeout_audit_v1.md)

---

## Executive summary

Alloy’s **operator task system** today is **`operational_tasks`**: lightweight follow-up rows scoped to **`opportunities`**, with statuses `open` | `completed` | `canceled`. The **richest UX** lives in **My Tasks** (modal + panel), **drawer operational strip** (chips + detail popover), and **Task Assist / BOS** (reminder proposals → create via API).

The registry action **`create_task`** does **not** open a dedicated create modal on the opportunity; it dispatches **`adminv2:open-tasks-panel`** (workspace My Tasks). **Workflows do not insert `operational_tasks`.** There is **no** recurring tasks, task templates table, hard delete, or assignee UI despite API support.

---

## Data model (`operational_tasks`)

| Column | Role |
|--------|------|
| `entity_type` | **`opportunities` only** (CHECK + FK CASCADE) |
| `entity_id` | Opportunity UUID |
| `title`, `description`, `due_at` | Core capture |
| `status` | `open`, `completed`, `canceled` |
| `source` | `task_assist` \| `manual` (CHECK; migration `20260603100000`) |
| `assigned_to_user_id` | Nullable UUID — **API only, no AdminV2 assign UI** |
| `created_by` | Actor who created |
| `proposal_id` | Optional link to `task_assist_proposals` |
| `metadata` | JSON bag |

**Adjacent tables (not `operational_tasks`):**

| Table | Purpose |
|-------|---------|
| `task_assist_proposals` | Draft/approved AI proposals (comms + reminder intents); approve ≠ auto-create task |
| `communication_scheduled_sends` | Scheduled email/SMS sends (Task Assist / tours); “reschedule” in comms UI is **not** the same as task registry `reschedule_task` |

**Deprecated / absent:** No `public.tasks` usage in `web/`; no generic cross-entity task queue table beyond opportunity grain.

---

## Where tasks appear

| Surface | What operators see | Create | Complete / edit |
|---------|-------------------|--------|-------------------|
| **Top nav → My Tasks** | Workspace-wide list (filters: open, due today, overdue, completed) | **MyTasksCreateTaskCard** (requires linked opportunity in assistant context) | Full card UX |
| **`/adminV2/tasks`** | Same **MyTasksPanel** (fallback page) | Same | Same |
| **Opportunity drawer — operational strip** | Task chips + scheduled-send chips; BOS handoff card | Via command bar / BOS → Task Assist reminder card | **OperationalTaskDetailPopover** (complete, cancel, edit due/title/notes) |
| **Opportunity drawer — inquiry summary** | Task preview chips from `_operational_tasks_preview` / metadata `next_follow_up_at` | — | Read-only preview |
| **OpportunityOperationalTasksSection** | Full list section (when mounted) | Points to command bar | Complete / cancel per row |
| **AI Command Surface / Task Assist panel** | Reminder compact card | **TaskAssistCompactReminderCard** → POST operational-tasks | — |
| **BOS “Work with BOS”** | Seeds command for reminder or draft | Handoff → Task Assist (`create_reminder` mode) | — |
| **Registry `create_task`** | Opens **tasks panel/modal**, not inline form | **Partial** — no opportunity-scoped modal from action alone |
| **Nav badge** | Open/overdue counts (`scope=workspace&summary=true`) | — | — |
| **Work unit bootstrap** | Prefetches `operational_tasks` summary (deferred) | — | — |

**Gate:** UI surfaces depend on **`isTaskAssistV1UiEnabled()`** — when off, opportunity task sections return null.

---

## How tasks are created

| Path | `source` | Mechanism |
|------|----------|-----------|
| **My Tasks → New task** | `manual` | `POST /api/admin/operational-tasks` |
| **Task Assist reminder card** | `task_assist` | `POST` with optional `proposal_id` |
| **Direct API** | `manual` \| `task_assist` | Same route; validation in `validateOperationalTaskCreateBody` |
| **Registry `create_task`** | — | `ui_intent` → `adminv2:open-tasks-panel` → user must create in My Tasks |
| **BOS `complete_follow_up` / `escalate_operational_review`** | — | Maps to canonical `create_task` → panel only |
| **Workflow engine** | — | **Missing** — no workflow action writes `operational_tasks` |
| **Form outcome `createTask`** | — | **Partial** — `outcomeConfigPresentation` reads flag; not unified with operational_tasks |

**Side effect:** For `task_assist` and `manual` sources, **`syncOpportunityNextFollowUpFromOperationalTasks`** updates `opportunities.metadata.next_follow_up_at` from earliest open task `due_at`.

---

## How tasks are completed

| Path | API | Terminal status |
|------|-----|-----------------|
| My Tasks card | `PATCH …/[id]` `{ status: "completed" }` | `completed` |
| My Tasks dismiss | `PATCH` `{ status: "canceled" }` | `canceled` |
| Opportunity section / popover | Same | Same |
| Registry **`complete_task`** | — | **Missing** — not in `action_definitions`; strip uses direct PATCH |

Only **`open`** tasks can be completed, canceled, or field-edited.

---

## Lifecycle stages

Tasks are **not** first-class lifecycle statuses. They **support** lifecycle work:

| Stage | Typical task use | BOS catalog signals (examples) |
|-------|------------------|--------------------------------|
| **Lead** | First outreach reminder; stale inquiry follow-up | `stale_new_inquiry` → comms, not always task |
| **Qualification** | Follow up after contact; gather missing info | Missing child/program → often comms or focus actions |
| **Tour** | Remind before tour; record outcome follow-up | `tour_date_passed`, tour confirmation |
| **Waitlist** | Long-wait outreach | Opening available (partial) |
| **Enrollment** | Packet / missing info follow-up | `request_missing_information`, packet signals |
| **Enrolled** | Onboarding check-ins | Limited catalog |

**Doctrine:** [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md) lists **Create Task** as universal — runtime is **follow-up rows**, not stage transitions.

**Needs Attention:** Attention rules can use **`next_follow_up_at`** (derived from tasks) but are **not** a dedicated task queue lane.

---

## BOS relationship

| Mechanism | Behavior |
|-----------|----------|
| **Catalog keys** | `complete_follow_up`, `escalate_operational_review` → map to **`create_task`** |
| **Handoff mode `create_reminder`** | Seeds Task Assist command (“Set a reminder for …”) |
| **Assist intents** | `create_reminder` vs `draft_message` / `schedule_message` |
| **Preflight** | BOS can enrich `recommended_action_preflight` for mapped canonical keys; **`create_task` has no lifecycle preflight** |
| **Overview payload** | `_operational_tasks_preview` feeds inquiry summary chips |

BOS **does not** insert tasks without operator approval through Task Assist / My Tasks / API.

---

## Work unit relationship

| Integration | Exists |
|-------------|--------|
| WU **bootstrap** prefetch `operational_tasks` summary | **Yes** (deferred phase) |
| WU **queue rows** | Opportunities — tasks are **not** queue items |
| WU-scoped task list filter | **Partial** — workspace list is org-wide; site filter via enrichment on opportunity context |
| Per-WU task policy Settings | **Missing** |

Tasks are **operator-owned follow-ups** on opportunities that may appear in any enrollment work unit queue.

---

## Task Capability Matrix

| Capability | Status | Primary surfaces | API / storage | Notes |
|------------|--------|------------------|---------------|-------|
| **Create Task** | **Working** | My Tasks, Task Assist reminder card, POST API | `POST /api/admin/operational-tasks` | Registry `create_task` only opens panel — **Partial** for action-catalog story |
| **Edit Task** | **Working** | My Tasks (edit mode), OperationalTaskDetailPopover | `PATCH` title, description, due_at | Open tasks only |
| **Assign Task** | **Partial** | — | `assigned_to_user_id` on POST | **No UI**; not in lifecycle matrix |
| **Complete Task** | **Working** | My Tasks, drawer section, popover | `PATCH` status `completed` | Not exposed as `complete_task` action key |
| **Reschedule Task** | **Working** | My Tasks “reschedule” mode, popover edit due | `PATCH` `due_at` | **Not** registry `reschedule_task` (that targets **scheduled sends**) |
| **Delete Task** | **Missing** | — | No DELETE route | Use **cancel** (`canceled`) as soft delete |
| **Recurring Task** | **Missing** | — | — | No recurrence model |
| **Task Template** | **Missing** | — | — | No template library |
| **Workflow-Created Task** | **Missing** | — | — | Workflows may schedule **messages**, not operational_tasks |
| **BOS-Created Task** | **Partial** | BOS → Task Assist reminder flow | Indirect via operator-approved POST | BOS seeds intent; **no** autonomous insert |

### Registry vs runtime (task actions)

| action_key | Catalog status | Actual behavior |
|------------|----------------|-----------------|
| `create_task` | active (`ui_intent`) | Opens **tasks panel** — **Partial** vs “create task modal” |
| `complete_task` | **Not in registry** | PATCH in UI — **Missing** from action system |
| `reschedule_task` | **Not in registry** (comms) | **communication_scheduled_sends** popover — different domain |

---

## Task Runtime Gaps

### P0 — Demo / operator clarity

| Gap | Impact |
|-----|--------|
| **`create_task` opens panel, not create form** | Lifecycle matrix says “Create Task”; registry action does not match My Tasks create card |
| **`create_task` requires opportunity context for meaningful create** | My Tasks create gated on `globalAssistant.currentContext` opportunity |
| **`complete_task` / `reschedule_task` not in action_definitions** | Action inventory incomplete; hardcoded PATCH |
| **Task Assist UI gate** | Entire task UX hidden when V1 gate off |

### P1 — Product completeness

| Gap | Impact |
|-----|--------|
| **No assignee UI** | `assigned_to_user_id` unused in practice |
| **No in-drawer “Add task”** on opportunity from registry | Must use strip/command bar or open My Tasks |
| **OpportunityOperationalTasksSection** | Secondary mount; strip is primary |
| **BOS → task without Task Assist path** | Always human-in-the-loop through assist UI |
| **Workflow-created tasks** | Automations cannot spawn follow-ups in `operational_tasks` |
| **Entity scope** | Jobs/customers cannot have operational_tasks (by design today) |
| **cancel vs delete** | Operators may expect delete; only soft cancel |

### P2 — Later

| Gap | Impact |
|-----|--------|
| Recurring / templates | — |
| Task permissions beyond `requireAdminOrOps` | — |
| Per-stage task placement in Settings | — |
| `contact_family` / dedicated waitlist task types | — |
| Unified “scheduled item” model (task vs scheduled send) | Two parallel concepts |

---

## Task Product Roadmap Recommendations

### Phase 1 — Align actions with runtime (Lifecycle Runtime sprint)

1. **`create_task` → capture-first modal** on opportunity (title, due, notes) calling existing POST — mirror Pass A/B convergence.  
2. Register **`complete_task`** as `execute_now` → PATCH completed (drawer strip + My Tasks).  
3. Document or register **`reschedule_task`** separately for **scheduled sends** vs rename to `reschedule_scheduled_message`.  
4. Wire registry **`create_task`** placements on **family_contacts / header overflow** for pilot org.

### Phase 2 — Operator completeness

1. **Assignee** — optional dropdown on create/edit (staff list); filter My Tasks by assignee.  
2. **In-drawer create** — button on operational strip without opening global modal.  
3. **BOS handoff** — one-click “Create follow-up” with pre-filled title from recommendation copy.  
4. **`next_follow_up_at`** — show in BOS blocked/preflight copy when tasks exist.

### Phase 3 — Platform (post-demo)

1. **Workflow action** — `create_operational_task` effect with title/due template from event payload.  
2. **Templates** — org-level follow-up templates by lifecycle stage.  
3. **Cross-entity tasks** — only if product expands beyond opportunity grain.  
4. **Settings** — task defaults (due offset, assignee, stage-scoped visibility).

---

## Sources inspected

| Area | Location |
|------|----------|
| Schema | `docs/supabase/reference/supabase_schema_columns.csv` (`operational_tasks`) |
| Service | `web/lib/admin/operationalTasksService.ts` |
| API | `web/app/api/admin/operational-tasks/route.ts`, `[id]/route.ts` |
| My Tasks | `web/app/adminV2/components/MyTasksPanel.tsx`, `MyTasksCreateTaskCard.tsx`, `MyTasksModal.tsx` |
| Drawer | `OpportunityOperationalCompactStrip.tsx`, `OperationalTaskDetailPopover.tsx`, `OpportunityOperationalTasksSection.tsx` |
| Task Assist | `TaskAssistCompactReminderCard.tsx`, `task_assist_v1_1.md` |
| BOS | `operationalRecommendationCatalog.ts`, `mapCatalogKeyToCanonicalActionKey.ts`, `bosAssistHandoffRouting.ts` |
| Registry | `applyRegistryResolvedActionClient.ts`, migration `20260602180000` (`create_task`) |
| WU | `operational-bootstrap/route.ts`, `adminV2SidecarSession.ts` |

---

## Sprint closeout linkage

This audit supplements **Part 2 (Action Inventory)** in [`lifecycle_sprint_final_coverage_closeout_audit_v1.md`](./lifecycle_sprint_final_coverage_closeout_audit_v1.md): **`create_task` = Partial** is now expanded with task-system truth. Recommended **P0** for next sprint: **create_task modal convergence** (same pattern as Add Child / Add Person).
