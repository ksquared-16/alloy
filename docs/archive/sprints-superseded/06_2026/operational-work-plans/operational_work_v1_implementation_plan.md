# Operational Work V1 — Implementation Plan

**Path:** `docs/sprints/archive/06_2026/operational_work_v1_implementation_plan.md`  
**Date:** 2026-06-03  
**Status:** **Planning complete — architecture frozen for implementation** (no code in this sprint)  
**Scope:** Convert approved Operating Work Framework V1 into a **safe, reuse-first implementation roadmap**. Not a coding sprint, schema sprint, or discovery reopen.

**Canonical operating model (frozen — do not redesign):**

- [`operational_work_framework_v1.md`](./operational_work_framework_v1.md)
- [`tasks_v2_operational_work_framework.md`](./tasks_v2_operational_work_framework.md)
- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)

**Authority:** Implementation PRs must follow §4–§12 unless product records an exception in §14. Discovery questions (Task vs Work, category model, aggregation) are **closed**.

---

## Executive summary

Operational Work V1 introduces the **framework at the service and metadata layer** while **keeping `operational_tasks` as the sole runtime store** for the first delivery slice: **task-shaped work only**.

| Decision | V1 choice |
|----------|-----------|
| **Smallest slice** | Task-shaped instances (`shape: task`) — validates framework without checklist/recurrence |
| **Runtime store** | **`operational_tasks`** — no new work table in V1 |
| **Abstraction layer** | **`operationalWorkService`** facade over existing task service — not a second framework |
| **API stability** | Keep `/api/admin/operational-tasks`; add work types + metadata conventions first |
| **Status model** | **`open` \| `completed` \| `canceled`** — align with existing CHECK; **no `in_progress`** in V1 |
| **Ownership V1** | User assignee UI + PATCH; default from record owner when linked |
| **Work Definitions** | Metadata schema + Lifecycle Builder section — **Phase 2** |
| **Recurring / checklists** | **Phase 3–4** — requires shape extension, not V1 schema |
| **Attention bridge** | Keep `follow_up_date_passed`; add `operational_task_overdue` — **Phase 4** (coordinate NA sprint) |

**North star:** One write path, one table, one operator queue (My Tasks), framework vocabulary in code — **maximum reuse, minimal disruption**.

```
┌─────────────────────────────────────────────────────────────┐
│  Lifecycle · Readiness · Needs Attention · Events · Schedules │
│                    (signals — read-only to work)              │
└────────────────────────────┬────────────────────────────────┘
                             │ instantiate (Phase 2+ automation)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  operationalWorkService  (V1 public API — framework types)  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  operationalTasksService  (persistence — task-shaped rows)  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    operational_tasks
```

---

## Frozen doctrine stack

```
Lifecycle → Readiness → Needs Attention → Operational Work → Actions → Automations → BOS
```

| Layer | Role | V1 implementation touch |
|-------|------|---------------------------|
| **Readiness** | Determines ability to advance | Context on create modal / BOS only — **no work insert** |
| **Needs Attention** | Identifies operational risk | `follow_up_date_passed` today; overdue plugin Phase 4 |
| **Operational Work** | Defines operational obligations | `operationalWorkService` + `operational_tasks` |
| **Actions** | Execution mechanisms | Suggested on definitions Phase 2; `create_task` / `complete_task` Phase 1 |
| **Automations** | System-performed work | `instantiate_work` workflow action — **Phase 3** |
| **BOS** | Prioritization and explanation | Read instances; propose via Task Assist — **no autonomous create** |

---

## 1. Current-state audit

### 1.1 Existing task infrastructure

#### Data model

| Asset | Location | State |
|-------|----------|-------|
| Table | `public.operational_tasks` | Shipped — open/complete/cancel, manual + task_assist sources |
| Unlinked tasks | `20260603120000_operational_tasks_general_unlinked.sql` | Shipped — nullable entity link |
| Proposals | `task_assist_proposals` | Adjacent — BOS draft path, not work truth |

#### Service layer

| Module | Role |
|--------|------|
| `web/lib/admin/operationalTasksService.ts` | **Single write path** — create, complete, cancel, update, list, workspace summary, `next_follow_up_at` sync |
| `web/lib/admin/operationalTasksWorkspaceEnrichment.ts` | Presentation enrichment (labels, site, children) |
| `web/lib/agent/taskAssist/taskAssistV11OpportunityApi.ts` | Client fetch/create/PATCH wrappers |

#### APIs

| Route | Methods | Auth |
|-------|---------|------|
| `/api/admin/operational-tasks` | GET (workspace list, summary), POST (create) | `requireAdminOrgContextLight` |
| `/api/admin/operational-tasks/[id]` | PATCH (status or fields) | `requireAdminOrOps` |

**PATCH gaps:** No `assigned_to_user_id` update path.

#### Creation paths

| Path | Creates row | `source` |
|------|-------------|----------|
| My Tasks create card | Yes | `manual` |
| Task Assist reminder apply | Yes | `task_assist` |
| Direct POST | Yes | `manual` \| `task_assist` |
| Registry `create_task` | **No** — opens panel | — |
| BOS catalog → `create_task` | **No** | — |
| Workflow | **No** | — |
| Readiness / NA | **No** (doctrine) | — |

#### Completion paths

| Path | Terminal status |
|------|-----------------|
| My Tasks card | `completed` \| `canceled` |
| Drawer popover / section | Same via PATCH |
| Registry `complete_task` | **Missing** from action catalog |

#### Assignment

| Capability | Status |
|------------|--------|
| Column `assigned_to_user_id` | Exists |
| POST accept assignee | Exists |
| PATCH assignee | **Missing** |
| AdminV2 assign UI | **Missing** |
| My Tasks assignee filter | **Missing** |

#### UI surfaces

| Surface | File(s) | Gate |
|---------|---------|------|
| Top nav My Tasks | `MyTasksModal.tsx`, `MyTasksPanel.tsx`, `OperationalTasksNavBadge.tsx` | Task Assist UI gate |
| `/adminV2/tasks` | Same panel | Same |
| Drawer operational strip | `OpportunityOperationalCompactStrip.tsx`, `OperationalTaskDetailPopover.tsx` | Task Assist gate |
| Inquiry summary preview | `OpportunityInquirySummaryTaskPreview.tsx` | Drawer bootstrap |
| Task Assist workspace | `TaskAssistOpportunityWorkspace.tsx`, `TaskAssistCompactReminderCard.tsx` | Task Assist gate |
| Full tasks section | `OpportunityOperationalTasksSection.tsx` | Secondary mount |

#### Side effects

| Effect | Trigger |
|--------|---------|
| `opportunities.metadata.next_follow_up_at` sync | Create/update/complete/cancel linked tasks (manual + task_assist) |
| Attention `follow_up_date_passed` | Metadata field passed due — **not** direct task query |

#### Workflow integrations

| Integration | Status |
|-------------|--------|
| `create_operational_task` action | **Absent** from `workflowRun.ts` |
| Task events | **Absent** from event catalog |
| Form `createTask` outcome flag | Read in presentation — **not wired** to POST |

#### Tests (existing coverage)

| Area | Tests |
|------|-------|
| API routes | `operationalTasksApiRoutes.test.ts` |
| Create validation | `operationalTasksCreateValidation.test.ts` |
| Enrichment | `operationalTasksWorkspaceEnrichment.test.ts` |
| UI contracts | `myTasksModal.contract.test.ts`, `operationalTaskPopover.contract.test.ts`, `opportunityOperationalTasksSection.contract.test.ts` |
| Client API | `taskAssistV11OpportunityApi.test.ts`, `buildOperationalTaskBody.test.ts` |

---

### 1.2 Existing lifecycle integration

| Integration point | Today | Work V1 attach | Isolate |
|-------------------|-------|----------------|---------|
| **Lifecycle Builder** | No Tasks section | **Phase 2** — Work Definitions metadata + Builder UI | Do not embed work engine in builder save |
| **Stage entry** | No listener | **Phase 2** — automation spec + optional hook | Stage visibility unchanged |
| **Actions matrix** | `create_task` universal base action | **Phase 1** — modal + placements | Matrix save separate (existing) |
| **Readiness panel** | Display-only gaps | **Phase 1** — optional chips in create modal | Evaluator never inserts work |
| **Readiness preflight** | Blocks enforced actions | **No change** | Gates stay on readiness |
| **Needs Attention resolver** | `follow_up_date_passed` via metadata | **Phase 4** — direct overdue query | Resolver never inserts work |
| **NA buckets** | Reason code filters | **No work rows in NA lane** | Overlay only |
| **WU bootstrap** | Prefetches task summary (deferred) | **Keep** deferred pattern | No reveal gate |
| **Queue rows** | Record previews | **Never** work instances | Queue ≠ work |

**Attachment rule:** Operational Work **consumes** lifecycle stage context at instantiate time (metadata). Lifecycle **configures** definitions (Phase 2). Lifecycle **does not** evaluate or complete work.

---

### 1.3 Existing actions framework

| Asset | Role | Work V1 use |
|-------|------|-------------|
| `action_definitions` | Catalog keys | `create_task`, new `complete_task` |
| `action_placements` | Surface buttons | Drawer header, overflow, queue row |
| `executeAdminAction` | Server execution | Unchanged for work-complete (client PATCH today) |
| `applyRegistryResolvedActionClient` | Client routing | **Phase 1** — `create_task` → modal not panel |
| `ui_intent` action type | Shell dispatch | `create_task` today |
| `create_action_link` (workflow) | Tokenized links | Orthogonal — not work |
| Resolution hints (NA) | `AttentionResolutionHint` | **Phase 2** — reuse shape for work definition suggested actions |

**Validated model (locked):**

| Plane | Responsibility |
|-------|----------------|
| **Work instance** | Outcome obligation until operator marks complete |
| **Work definition** (Phase 2) | Outcome intent + `suggested_action_keys[]` |
| **Action** | Side effect via `executeAdminAction` |

Work complete **does not** invoke actions. Actions may **precede** complete (operator sends statement, then marks work done).

---

### 1.4 Existing BOS surfaces

| Surface | Work consumption today | V1 rule |
|---------|------------------------|---------|
| **Drawer Review Assist** | `_operational_recommendation`, `_operational_tasks_preview` | Read-only; handoff to Task Assist |
| **Operational strip** | Task chips + scheduled sends | Primary record-scoped work UX |
| **Task Assist** | Proposes reminder → POST task | Apply = instantiate task-shaped work |
| **BOS catalog** | `complete_follow_up` → `create_task` | Phase 1 prefill modal |
| **Queue rows** | Recommendation hints only | **No work list on rows** |
| **Needs Attention lane** | Attention reasons only | **No work inventory** |
| **Orchestrator** | Routes to Task Assist | Explain + recommend — not create |

**BOS V1:** Consume open instances + readiness/attention snapshots; prioritize in copy; route to actions. **Never** insert work without human apply or automation (Phase 3+).

---

## 2. Gap analysis

### 2.1 Reuse vs build vs defer

| Capability | Exists | Gap | V1 disposition |
|------------|--------|-----|----------------|
| Task-shaped persistence | ✅ | — | **Reuse** `operational_tasks` |
| Single write path | ✅ | — | **Reuse** → wrap with work facade |
| My Tasks UX | ✅ | Assignee, filters | **Extend** |
| Drawer task strip | ✅ | In-drawer create | **Extend** Phase 1 |
| Create API | ✅ | Work metadata validation | **Extend** POST body (metadata keys) |
| Complete API | ✅ | — | **Reuse** |
| Assign POST | ✅ | PATCH + UI | **Build** Phase 1 |
| `create_task` action | ⚠️ Panel only | Capture modal | **Build** Phase 1 |
| `complete_task` action | ❌ | Registry + handler | **Build** Phase 1 |
| Work framework types | ❌ | TS types + constants | **Build** Phase 1 (no migration) |
| Work definition config | ❌ | Metadata + Builder | **Defer** Phase 2 |
| Workflow instantiate | ❌ | Action type | **Defer** Phase 3 |
| Recurrence scheduler | ❌ | Platform job | **Defer** Phase 3 |
| Checklist shape | ❌ | Items model + UI | **Defer** Phase 4 |
| Gap aggregation | ❌ | One work, N gaps | **Defer** Phase 3–4 |
| `operational_task_overdue` NA | ❌ | Resolver plugin | **Defer** Phase 4 |
| Cross-entity subjects | ⚠️ General unlinked only | Billing/doc links | **Defer** Phase 5+ |
| `/operational-work` API alias | ❌ | Optional rename | **Defer** — keep existing routes V1 |
| Task Assist UI gate | ⚠️ Hides all task UX | Decouple core work | **Build** Phase 1 (scoped) |

### 2.2 What becomes Work V1

| Legacy name | Work V1 name | Change type |
|-------------|--------------|-------------|
| `operational_tasks` row | Task-shaped **work instance** | Conceptual + metadata |
| `operationalTasksService` | Persistence adapter (internal) | Keep file; called from facade |
| — | `operationalWorkService` | **New** public module |
| Task template (Tasks V2 doc) | **Work definition** (task default shape) | Phase 2 naming |
| My Tasks | **My Work** (task filter) — copy optional Phase 1 | UI label optional |
| `source: manual \| task_assist` | `provenance.source` (+ future values) | Metadata convention Phase 1; enum migration Phase 3 |

### 2.3 What remains unchanged

- Table name `operational_tasks`
- API paths `/api/admin/operational-tasks`
- Status enum `open` \| `completed` \| `canceled`
- `next_follow_up_at` sync behavior
- Readiness evaluator (no work insert)
- NA resolver ownership (no work insert)
- Queue row semantics (preview only)
- AdminV2 reveal doctrine (deferred bootstrap)

---

## 3. Operational Work V1 implementation architecture

### 3.1 Layering (no second framework)

```
web/lib/admin/operationalWork/
├── operationalWorkTypes.ts       # WorkInstance, WorkCategory, WorkShape, WorkProvenance, metadata schema
├── operationalWorkMetadata.ts    # validate/normalize metadata v1 keys
├── operationalWorkService.ts     # instantiateTaskWork, completeWork, listWork, assignWork
└── index.ts                      # public exports

web/lib/admin/operationalTasksService.ts   # UNCHANGED role: DB CRUD + sync (called by facade)
```

**Rule:** All external callers (API routes, future workflow action, stage listener) import **`operationalWorkService`**. Only the facade imports `operationalTasksService`.

**Migration path:** Existing imports of `operationalTasksService` in API routes redirect to facade in Phase 1 PR 1; internal tests updated incrementally.

### 3.2 Work instance metadata v1 (JSON — no migration)

Stored in existing `metadata` jsonb column:

```typescript
type OperationalWorkMetadataV1 = {
  work_framework_version: 1;
  shape: "task";                              // V1 literal only
  category?: WorkCategory;                    // optional Phase 1; required Phase 2 with definitions
  work_definition_key?: string;               // Phase 2+
  provenance: {
    source: "manual" | "task_assist" | "workflow" | "lifecycle_template";
    proposal_id?: string;
    workflow_run_id?: string;
    idempotency_key?: string;
  };
  context_snapshot?: {                        // read-only at create — never re-evaluated
    readiness_gap_ids?: string[];
    attention_reason_codes?: string[];
    lifecycle_stage_key?: string;
  };
  suggested_action_keys?: string[];             // Phase 2 — copied from definition
};
```

Top-level columns remain source of truth for query paths: `status`, `due_at`, `assigned_to_user_id`, `entity_*`, `title`.

**Backward compat:** Rows without `work_framework_version` treated as task-shaped work with inferred provenance from legacy `source` column.

### 3.3 API contract (V1 extensions)

| Endpoint | V1 change |
|----------|-----------|
| POST | Accept optional `category`, `context_snapshot`, `work_definition_key` inside `metadata`; facade normalizes |
| PATCH | Add `assigned_to_user_id` for open tasks |
| GET | Return normalized `work` view `{ ...task, work: { shape, category, provenance } }` — additive field |

No new routes required for V1.

### 3.4 Action registry (Phase 1)

| Key | Type | Behavior |
|-----|------|----------|
| `create_task` | `ui_intent` → **modal** | Open capture modal on opportunity with optional BOS prefill |
| `complete_task` | `execute_now` or client PATCH | Complete open task by id from drawer context |

### 3.5 AdminV2 runtime doctrine

| Rule | V1 |
|------|-----|
| No new drawer reveal gate | Work list stays optional/deferred on bootstrap |
| No section-owned above-fold skeletons | My Tasks loading unchanged |
| No false empty while loading | Preserve existing panel semantics |

---

## 4. Reuse strategy

### 4.1 Decision: `operational_tasks` = Work V1 runtime store

**Validated.** No parallel table. No ORM abstraction that duplicates rows.

| Alternative | Rejected because |
|-------------|------------------|
| New `operational_work_instances` table | Disruption, dual write, migration risk |
| View over tasks | No checklist/recurrence benefit yet |
| Event-sourced work log | Over-engineering for V1 slice |

### 4.2 Facade vs rename

| Approach | Choice |
|----------|--------|
| Rename table | **No** — keep `operational_tasks` |
| Rename service file | **No** — keep `operationalTasksService.ts` as internal |
| Add `operationalWorkService` | **Yes** — framework public API |
| Rename UI "My Tasks" | **Optional** Phase 1 — can stay "My Tasks" until Phase 4 checklist |

### 4.3 Reuse matrix

| Component | Reuse % | Notes |
|-----------|---------|-------|
| DB table | 100% | +metadata conventions only |
| Service CRUD | 95% | Wrap, don't rewrite |
| API routes | 90% | Extend PATCH/POST validation |
| My Tasks UI | 85% | Add assignee + modal |
| Drawer strip | 90% | Wire create modal |
| Task Assist | 100% | Remains proposal path |
| Tests | 80% | Extend + facade tests |
| BOS handoff | 95% | Prefill modal |
| Workflow | 0% | Phase 3 new action type |

---

## 5. Work V1 scope (Question 1)

### 5.1 Validated smallest slice

**Task-shaped work only** — confirmed.

| In V1 | Out of V1 |
|-------|-----------|
| Single-item obligation | Checklist items |
| Due date required | Recurrence |
| open / completed / canceled | in_progress |
| User assignee | Role/team assign |
| Opportunity link + general unlinked | Billing/customer subjects |
| Manual + Task Assist + action modal create | Workflow auto-create |
| Metadata framework keys | Builder definition CRUD |
| `complete_task` action | Aggregation policies |

### 5.2 V1 definition of done

Operators can:

1. Create task-shaped work from drawer modal, My Tasks, and Task Assist
2. Assign work to a user at create and edit
3. Filter My Tasks by mine / unassigned / open / overdue
4. Complete work from drawer and My Tasks via action or PATCH
5. See work on drawer strip and My Tasks — not on NA lane as rows

Platform can:

1. Route all creates through `operationalWorkService`
2. Attach framework metadata on new rows
3. Preserve `next_follow_up_at` sync and existing tests

---

## 6. Work definition strategy (Question 3)

| Capability | Phase | Rationale |
|------------|-------|-----------|
| **Metadata keys** (`work_definition_key`, `category`) | **1** | Room for Phase 2 without migration |
| **Platform definition catalog** (TS constants) | **2** | Seed keys + categories before Builder UI |
| **Lifecycle Builder section** | **2** | Config CRUD for definitions |
| **Stage-entry instantiate** | **2–3** | Needs definitions + dedupe + automation |
| **Aggregation policy** | **3–4** | Needs checklist or smart merge |
| **Recurring definitions** | **3** | Needs scheduler infrastructure |
| **Checklist shape** | **4** | Needs items model |
| **Org-custom definition keys** | **5** | After platform catalog stable |

**Phase 1:** Hardcode nothing except optional `category` on manual create. Definitions are **operator-entered title** only.

---

## 7. Work lifecycle (Question 4)

### 7.1 Finalized V1 status model

| Status | Operator label | Maps to framework |
|--------|----------------|-------------------|
| **`open`** | Open | Active obligation |
| **`completed`** | Complete | Outcome attested |
| **`canceled`** | Dismiss | Withdrawn |

**Rejected for V1:** `created`, `assigned`, `in_progress` as separate statuses.

| Concept | V1 representation |
|---------|-------------------|
| Created | `created_at` timestamp |
| Assigned | `assigned_to_user_id != null` |
| In progress | **No platform state** — operator works outside system until complete |

**Rationale:** Matches existing CHECK constraint, PATCH logic, tests, and urgency badges. Adding `in_progress` requires migration, UI, and NA re-evaluation — defer to V2+ only if product demands partial completion without checklists.

### 7.2 Checklist partial progress (Phase 4 preview)

Parent `open` + item-level done/skipped — not V1.

---

## 8. Ownership strategy (Question 5)

| Model | V1 | Later |
|-------|-----|-------|
| **User assignment** | ✅ POST + PATCH + UI dropdown | — |
| **Default assignee** | Record `assigned_to` when linked; else creator | Configurable org default |
| **Unassigned pool** | ✅ Filter tab | — |
| **Role-based** | ❌ | Phase 2 definition policy |
| **Team** | ❌ | Phase 3 filter |
| **Department** | ❌ Derive from subject | Never stored on row |
| **Queue** | ❌ **Rejected** | — |

---

## 9. UI strategy (Question 6)

### 9.1 Canonical placement

| Surface | Role | V1 |
|---------|------|-----|
| **My Tasks (top nav)** | **Primary work queue** — org-wide, assignee-filtered | ✅ Extend |
| **Opportunity drawer — operational strip** | **Record-scoped** open work + create entry | ✅ Add create modal |
| **Opportunity drawer — inquiry preview** | Read-only chips | ✅ Keep |
| **Task Assist / BOS** | Propose → apply creates work | ✅ Keep |
| **WU queue rows** | Record selection only | ❌ No work rows |
| **Needs Attention lane** | Risk signals | ❌ No work rows |
| **Department dashboard** | — | ❌ Defer Phase 6 |

### 9.2 UI gate decoupling (Phase 1)

**Problem:** `isTaskAssistV1UiEnabled()` hides My Tasks and drawer strip.

**Plan:** Introduce **`isOperationalWorkV1Enabled()`** (or split gate):

- Core work UI (My Tasks, strip, modal) → **on** when AdminV2 ops enabled
- Task Assist AI draft cards → remain on Task Assist flag

Prevents framework delivery blocked by assist feature flag.

### 9.3 Create UX convergence

| Entry | V1 target |
|-------|-----------|
| Registry `create_task` | **OpportunityWorkCreateModal** — title, due, assignee, notes |
| My Tasks | Same component |
| BOS handoff | Modal with prefilled title/due |
| Strip "+" | Opens same modal |

---

## 10. Lifecycle integration strategy (Question 7 — lifecycle stack)

### 10.1 Attachment map

```
Lifecycle Builder
    └── [Phase 2] Work Definitions section → metadata only
         └── triggers (stage_entry) → [Phase 2–3] automation

Readiness Engine
    └── [Phase 1] context_snapshot on manual create (optional display)
    └── NEVER instantiate

Needs Attention
    └── [Phase 4] operational_task_overdue plugin reads open tasks
    └── NEVER instantiate

Events / Workflows
    └── [Phase 3] instantiate_work action → operationalWorkService
```

### 10.2 Isolation boundaries (do not cross in V1)

| Boundary | Rule |
|----------|------|
| Readiness → work | Snapshot only |
| NA → work | Signal only |
| Work → readiness | Complete does not clear gaps |
| Work → lifecycle status | Complete does not change status |
| Queue → work | No membership coupling |

### 10.3 Configurable later

- Lifecycle Builder Work Definitions CRUD (Phase 2)
- Stage-scoped definition enablement (Phase 2)
- Org default due offsets (Phase 2 Settings)
- Auto-instantiate policy per definition (Phase 3)

---

## 11. Attention integration strategy (Question 7 — attention)

### 11.1 Doctrine (locked)

| Layer | Question |
|-------|----------|
| **Attention** | What risk exists? |
| **Work** | What obligation exists? |

Work definitions do **not subscribe** to attention reasons in V1. **Automations** (Phase 3+) may instantiate work **when** a reason persists — subscription is orchestration config, not resolver logic.

### 11.2 V1 attention coupling (existing — keep)

| Mechanism | Direction |
|-----------|-----------|
| Task → `next_follow_up_at` | Write on task mutate |
| `next_follow_up_at` → `follow_up_date_passed` | NA resolver read |

### 11.3 Phase 4 addition (coordinate NA sprint)

| Plugin | Logic |
|--------|-------|
| `operational_task_overdue` | EXISTS open task WHERE `due_at < now()` — aggregate one reason per record |

**No duplicated business logic:** Attention reads task **state**; work service does not compute attention codes.

### 11.4 Preventing duplication

| Anti-pattern | Prevention |
|--------------|------------|
| NA creates work on reason fire | Orchestration-only instantiate |
| Work list in NA UI | Lane shows codes only |
| One reason → one task auto | Default automation off; aggregation Phase 3+ |

---

## 12. Action integration strategy (Question 5 — actions)

### 12.1 V1 deliverables

| Item | Delivery |
|------|----------|
| `create_task` → modal | Phase 1 PR 2 |
| `complete_task` registration | Phase 1 PR 3 |
| Suggested actions on work instance UI | Phase 2 — read `suggested_action_keys` from definition metadata |
| Resolution hints reuse | Map definition keys → `action_definitions` for CTA chips on My Tasks card |

### 12.2 Work completion vs action execution

```
Operator opens work
    → optional: executes Send Statement (action)
    → marks work Complete (work service)
    → readiness re-eval on next gate (unchanged)
    → attention re-eval on next fetch (unchanged)
```

**No** `on_complete_action` automation in V1.

### 12.3 Example: Resolve outstanding balance (future)

| Phase | Delivery |
|-------|----------|
| 3 | Work definition `resolve_outstanding_balance` + workflow instantiate on billing signal |
| 2 | Suggested actions: send_statement, create_payment_plan, etc. |
| 1 | Manual task only |

---

## 13. BOS integration strategy

### 13.1 V1 consumption paths (keep)

| Input | Source |
|-------|--------|
| Open work titles | `_operational_tasks_preview` on entity GET |
| Due urgency | Instance `due_at` + status |
| Readiness gaps | `readiness` bootstrap attach |
| Attention | `_operational_attention` |

### 13.2 V1 BOS behaviors

| Behavior | Allowed |
|----------|---------|
| Explain why work matters | ✅ |
| Recommend which action first | ✅ |
| Prefill create modal | ✅ Phase 1 |
| Task Assist proposal → apply | ✅ |
| Autonomous work insert | ❌ |
| Mark complete | ❌ |

### 13.3 Phase 5 prioritization

- Deterministic sort in My Tasks first
- Optional BOS reorder of **recommendations** only — not instance fields

---

## 14. Recommended phased roadmap

### Phase 1 — Task-shaped work (framework facade + operator completeness)

**Goal:** Introduce `operationalWorkService`; ship assignee + modal + complete action; decouple UI gate.

| PR | Work | Exit criterion |
|----|------|----------------|
| **1.1** | `operationalWork/*` types + facade; API routes call facade; metadata v1 normalize on create | Facade tests green; existing API tests green |
| **1.2** | `OpportunityWorkCreateModal`; `create_task` opens modal; strip create button | Create from drawer without My Tasks panel |
| **1.3** | PATCH assignee; assignee UI create/edit; My Tasks mine/unassigned filters | Assignee persisted and filterable |
| **1.4** | Register `complete_task`; wire popover + My Tasks | Complete from action key |
| **1.5** | UI gate split — core work vs Task Assist | Work visible when assist flag off |

**Tests to run:**

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- \
  tests/agent/taskAssist/operationalTasksApiRoutes.test.ts \
  tests/admin/operationalTasksCreateValidation.test.ts \
  tests/admin/operationalTasksWorkspaceEnrichment.test.ts \
  tests/agent/taskAssist/myTasksModal.contract.test.ts \
  tests/agent/taskAssist/operationalTaskPopover.contract.test.ts
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts
```

**Depends on:** None.

---

### Phase 2 — Work definitions (config + Lifecycle Builder)

**Goal:** Definitions in metadata; Builder CRUD; platform catalog constants.

| PR | Work |
|----|------|
| **2.1** | `lifecycle_work_definitions_v1` metadata schema + parser |
| **2.2** | Platform catalog TS (`collect_missing_information`, `contact_family`, …) |
| **2.3** | Lifecycle Builder Work Definitions section |
| **2.4** | Instantiate from definition in manual modal (picker) |
| **2.5** | `suggested_action_keys` on definitions → CTA chips on work card |

**Exit:** Operator configures stage definitions in Builder; create modal can pick definition.

---

### Phase 3 — Recurring work + automation instantiate

**Goal:** Schedule-driven obligations; workflow creates work.

| PR | Work |
|----|------|
| **3.1** | Recurrence policy on definition metadata (spec + scheduler hook) |
| **3.2** | `instantiate_work` workflow action → facade |
| **3.3** | Dedupe/idempotency in facade |
| **3.4** | `source: workflow` CHECK migration |
| **3.5** | Stage-entry listener OR status-changed workflow seeds |

**Exit:** Friday review spawns weekly instance; tour-complete workflow creates follow-up.

---

### Phase 4 — Checklists

**Goal:** Multi-item work shape.

| PR | Work |
|----|------|
| **4.1** | Shape `checklist` — items in metadata or child table (implementation decision) |
| **4.2** | Checklist UI in My Work |
| **4.3** | Gap aggregation → one checklist instance |
| **4.4** | NA `operational_task_overdue` plugin |

**Exit:** Director weekly review as one checklist; overdue tasks surface in NA.

---

### Phase 5 — BOS prioritization

**Goal:** Smarter ordering and cross-signal recommendations.

| PR | Work |
|----|------|
| **5.1** | My Work sort policy (category + due + attention weight) |
| **5.2** | BOS recommendation binds open work + suggested action |
| **5.3** | Optional "impact" copy (assistive) |

---

### Phase 6 — Operational intelligence

**Goal:** Reporting and cross-domain subjects.

| Work |
|------|
| Work aggregates by category/definition |
| Billing/document subject linkage |
| Team work views |
| Dashboard widgets |

---

## 15. Open decisions (pre-Phase 1 sign-off)

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Facade file location | `web/lib/admin/operationalWork/` |
| 2 | API additive `work` field on GET | Yes — optional normalized view |
| 3 | Rename My Tasks in Phase 1 | **No** — defer to Phase 4 with checklists |
| 4 | `complete_task` server vs client | Client PATCH acceptable V1; server wrapper optional |
| 5 | Assignee required on create | **No** — optional |
| 6 | Category required on create | **No** Phase 1 — optional metadata |
| 7 | Phase 1 before NA Phase 4 | **Yes** — parallel safe |

---

## Appendix A — File touch list (Phase 1 forecast)

| File | Change |
|------|--------|
| `web/lib/admin/operationalWork/*` | **New** |
| `web/lib/admin/operationalTasksService.ts` | Called from facade; optional metadata helpers |
| `web/app/api/admin/operational-tasks/route.ts` | Facade + assignee POST |
| `web/app/api/admin/operational-tasks/[id]/route.ts` | Facade + assignee PATCH |
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | Modal dispatch |
| `web/components/admin/opportunity/OpportunityWorkCreateModal.tsx` | **New** |
| `web/app/adminV2/components/MyTasksPanel.tsx` | Assignee filters |
| `web/app/adminV2/components/MyTasksTaskCard.tsx` | Assignee display/edit |
| `web/components/admin/opportunity/OpportunityOperationalCompactStrip.tsx` | Create button |
| `supabase/migrations/*` | **None in Phase 1** |

---

## Appendix B — Success criteria (planning sprint)

| Criterion | Status |
|-----------|--------|
| Complete task infrastructure audit | Yes — §1.1 |
| Lifecycle / readiness / NA attachment audit | Yes — §1.2 |
| Actions framework audit | Yes — §1.3 |
| BOS surfaces audit | Yes — §1.4 |
| Gap analysis | Yes — §2 |
| Implementation architecture | Yes — §3 |
| Reuse strategy (`operational_tasks` as store) | Yes — §4 |
| Work V1 scope validated | Yes — §5 |
| Work definition deferral plan | Yes — §6 |
| Lifecycle status model finalized | Yes — §7 |
| Ownership V1 vs defer | Yes — §8 |
| UI placement strategy | Yes — §9 |
| Attention integration | Yes — §11 |
| Action integration | Yes — §12 |
| BOS integration | Yes — §13 |
| Phased roadmap | Yes — §14 |
| No implementation / migrations | Yes |

---

*End of Operational Work V1 implementation plan — Phase 1 coding may begin after §15 sign-off.*
