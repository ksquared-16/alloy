# Operational Work Framework V1

**Path:** `docs/sprints/06_2026/operational_work_framework_v1.md`  
**Date:** 2026-06-03  
**Status:** **Operating model frozen — discovery only** (architecture only; no implementation)  
**Scope:** Define Alloy's **domain-agnostic operational work model**. Not a UI sprint, schema sprint, workflow sprint, Tasks sprint, or Needs Attention sprint.

**Canonical inputs (frozen unless major architectural issue):**

- [`completed/lifecycle_builder_hardening_closeout.md`](./completed/lifecycle_builder_hardening_closeout.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`tasks_v2_operational_work_framework.md`](./tasks_v2_operational_work_framework.md) (Tasks V2 — input that surfaced this broader question)

**Authority:** This document is the canonical reference for **what operational work means in Alloy** before any Tasks V2 implementation proceeds. If Tasks V2 and this framework disagree, **this framework wins** on abstraction; Tasks V2 remains valid as the **task-shaped work** implementation track.

---

## Executive summary

The Tasks V2 discovery sprint asked whether Alloy is building a **Task system**. This sprint concludes:

**Alloy is designing an Operational Work Framework.**

A **Task** is **one presentation and persistence shape** of operational work — not the primary platform abstraction.

| Layer | Question | Owner |
|-------|----------|-------|
| **Lifecycle** | Where is the record in configured flow? | Lifecycle Builder + status visibility |
| **Readiness** | Is required information satisfied? | Readiness Engine (evaluates) |
| **Needs Attention** | Should operators be aware? | Attention resolver (surfaces) |
| **Operational Work** | **What work should exist / happen next?** | **Work service (tracks)** |
| **Actions** | How is side-effect executed? | `executeAdminAction` |
| **Workflows** | What automates on events? | `executeWorkflowRun` |
| **BOS** | What should operator consider? | Assist capabilities (explain / recommend) |

**Locked spine:**

```
Signals (lifecycle, readiness, attention, events, schedules)
        ↓
Work Definition (config — outcome intent, category, suggested actions)
        ↓
Work Instance (runtime — assignee, due, status, subject link)
        ↓
Operator completes work ──optional──▶ Actions / Workflows mutate truth
        ↓
Signals re-evaluate → attention may clear; readiness may improve
```

**Today:** `operational_tasks` is a **V1 implementation** of **task-shaped** work instances (single item, due date, open/complete/cancel). It is **not** the full framework — it cannot express recurring obligations, multi-item checklists, or non-CRM subjects without conceptual extension.

**Recommendation:** Adopt **Operational Work** as the canonical model. Evolve `operational_tasks` as the **first work shape** rather than renaming the entire platform "Tasks."

---

## Canonical doctrine (frozen stack)

```
Lifecycle → Readiness → Needs Attention
```

| System | Role | Owns operational work? |
|--------|------|------------------------|
| **Readiness** | Evaluates required information | **No** |
| **Needs Attention** | Surfaces operational awareness | **No** |
| **Operational Work** | Tracks human obligations | **Yes** (execution home) |

**Cross-cutting rules (locked):**

1. Readiness **never creates** work instances.
2. Needs Attention **never creates** work instances.
3. Work instances **may consume** readiness, attention, lifecycle, and event **snapshots** as context at creation time.
4. Overdue or unfulfilled work **may project** attention signals — attention does not mirror full work lists.
5. Completing work **does not imply** readiness satisfied or attention cleared unless underlying truth changed.

---

## 1. What is operational work?

### 1.1 Definition

**Operational work** is **durable human obligation** — something an operator or team is expected to **do**, **review**, **decide**, or **resolve** — with identifiable completion and optional deadline.

Operational work answers:

| Question | Plane |
|----------|-------|
| **What work should exist at all?** | Work Definition + creation policy |
| **What work should happen next?** | Open Work Instances + prioritization |

Operational work is **domain-agnostic**. The same framework applies to enrollment CRM, billing, documents, scheduling, subsidy, compliance, and future modules — differing only in **subject linkage** and **work definition catalog**, not core semantics.

### 1.2 Concept map

| Concept | Plane | Definition |
|---------|-------|------------|
| **Work Definition** | Configuration | Reusable template describing **outcome intent**, category, default assignment, suggested actions, completion hints, optional recurrence, and dedupe key |
| **Work Template** | Operator synonym | Same as Work Definition — use **Work Definition** in platform docs; **template** in Builder copy |
| **Work Instance** | Runtime | A concrete obligation currently tracked — assignee, due, status, subject(s), provenance |
| **Task** | Runtime shape + operator term | A **single-item** work instance with due date — maps to `operational_tasks` today |
| **Checklist** | Runtime shape | A **multi-item** work instance; sub-items are checklist lines, not separate platform objects |
| **Review** | Work **category** | Work requiring inspection/judgment before sign-off — not a separate engine |
| **Follow-Up** | Work **category** | Time-bound outreach or check-in — often task-shaped |
| **Decision** | Work **category** | Work requiring explicit choice/outcome (approve/deny/route) — may gate progression via linked action |

### 1.3 Are Task, Checklist, Review, Follow-Up, Decision the same thing?

**No — but they are not separate platform engines.**

| Term | What it is | Recommendation |
|------|------------|----------------|
| **Task** | **Work shape** (`shape: task`) — one title, one due, binary complete | Keep as primary operator word for simple follow-ups |
| **Checklist** | **Work shape** (`shape: checklist`) — one instance, many items | Use for packet review, Friday audits, multi-gap collection |
| **Review** | **Category** (`category: review`) | Applies to task or checklist shape |
| **Follow-Up** | **Category** (`category: follow_up`) | Applies to task shape most often |
| **Decision** | **Category** (`category: decision`) | Records outcome in metadata or linked action result |

**Unified model:**

```typescript
// Conceptual — not a schema proposal
type WorkInstance = {
  id: string;
  org_id: string;
  work_definition_key: string;
  shape: "task" | "checklist";
  category: WorkCategory;
  status: "open" | "completed" | "canceled";
  title: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  subjects: WorkSubject[];           // 0..N entity links
  items?: ChecklistItem[];           // when shape = checklist
  outcome?: WorkOutcome | null;      // when category = decision | review
  provenance: WorkProvenance;
  metadata: Record<string, unknown>;
};

type WorkDefinition = {
  key: string;                       // stable dedupe id
  category: WorkCategory;
  default_shape: "task" | "checklist";
  outcome_intent: string;            // operator-facing "done means"
  suggested_action_keys?: string[];  // not mandatory path
  assignment_policy: AssignmentPolicy;
  recurrence?: RecurrencePolicy;     // optional — schedule-driven
  aggregation?: AggregationPolicy;   // anti-explosion
};
```

### 1.4 Work vs adjacent concepts

| Concept | Difference from work |
|---------|---------------------|
| **Queue row** | Record **preview** for selection — not an obligation |
| **Attention reason** | **Awareness signal** — not trackable work (may spawn work via automation) |
| **Readiness gap** | **Evaluation finding** — not work until instantiated |
| **Action** | **Execution verb** — side effect, not durable obligation |
| **Workflow run** | **Automation execution** — not operator to-do |
| **BOS recommendation** | **Judgment** — not work truth |

---

## 2. What creates work?

### 2.1 Creation sources (evaluation)

| Source | Creates work directly? | Mechanism | Recommendation |
|--------|------------------------|-----------|----------------|
| **Lifecycle** | No (config only) | Work Definitions on stage entry; **listener/automation instantiates** | **Yes** — template config in Builder |
| **Readiness** | **No** | Evaluator read-only; gaps are context | **Consume only** |
| **Needs Attention** | **No** | Resolver read-only; reasons are context | **Consume only** |
| **Workflow events** | Yes (via automation) | `instantiate_work` action → work service | **Yes** — canonical automation path |
| **Manual creation** | Yes | Operator UI → work service | **Yes** — always allowed |
| **Recurring schedules** | Yes | Schedule evaluator → work service | **Yes** — **required** for obligations without signals |

**Canonical creation model (locked):**

```
┌─────────────────────────────────────────────────────────────┐
│                    Work Creation Authority                   │
├─────────────────────────────────────────────────────────────┤
│  instantiateWork(definition_key, subjects, context)          │
│    ← manual UI                                               │
│    ← workflow / stage-entry automation                     │
│    ← recurrence scheduler                                    │
├─────────────────────────────────────────────────────────────┤
│  NEVER: readiness evaluator · attention resolver · BOS apply  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Signal-driven vs schedule-driven

| Mode | When work exists | Example |
|------|------------------|---------|
| **Signal-driven** | Underlying condition or event suggests obligation | Missing program interest → Collect missing information |
| **Schedule-driven** | Calendar/policy says work exists **regardless of signals** | Every Friday: Attendance audit review |
| **Manual** | Operator decides | Ad hoc call-back |
| **Hybrid** | Schedule spawns work; signals add context items | Weekly balance review + overdue charges listed in checklist items |

**Recurring obligations doctrine:**

- Recurrence is a property of **Work Definition**, not Work Instance.
- Each period spawns **one instance per assignee scope** (user, role, or site) — not one instance per underlying record unless definition says so.
- Missing signals **do not block** scheduled work creation.
- Completing this week's instance **does not delete** the definition — next period spawns anew.

### 2.3 Context at creation (not creation authority)

When instantiating work, callers may attach **read-only snapshots**:

```typescript
context: {
  readiness_gap_ids?: string[];
  attention_reason_codes?: string[];
  lifecycle_stage_key?: string;
  event_type?: string;
  event_payload_ref?: string;
}
```

These inform title copy, checklist items, and BOS explanation — they **do not** substitute for Work Definition.

### 2.4 Dedupe and idempotency

| Key | Prevents |
|-----|----------|
| `(org_id, work_definition_key, subject_fingerprint, period_key)` | Duplicate stage-entry work |
| `(org_id, work_definition_key, assignee, period_key)` | Duplicate recurring instances |
| `idempotency_key` in provenance | Workflow double-fire |

**Open instance rule:** If matching open instance exists, **do not create** — optionally refresh checklist items from latest signal snapshot.

---

## 3. Work categorization model

### 3.1 Problem

Without categories, every domain invents task types → hundreds of strings → unmaintainable UX and reporting.

### 3.2 Recommendation: small fixed category enum

Platform-owned **`WorkCategory`** — tenants customize **Work Definitions**, not the enum.

| Category | Outcome intent | Typical shape | Examples |
|----------|----------------|---------------|----------|
| **`information_collection`** | Required facts/documents gathered | task or checklist | Collect missing information; Request enrollment packet |
| **`review`** | Human inspected and acknowledged | checklist or task | Attendance audit; Packet review; Licensing review |
| **`follow_up`** | Contact/outreach completed | task | Call family; Send reminder |
| **`decision`** | Choice recorded | task | Approve subsidy; Route to manager |
| **`resolution`** | Operational issue cleared | task or checklist | Resolve outstanding balance; Fix failed payment |
| **`compliance`** | Policy obligation met | checklist | Staffing ratio review; Document expiry check |
| **`coordination`** | Handoff completed | task | Assign tour guide; Route to billing |
| **`other`** | Escape hatch — requires definition justification | any | Rare; flagged in reporting |

**Eight categories.** Domains map local language to these — e.g. "Collect Missing Information" = `information_collection`; "Resolve Outstanding Balance" = `resolution`.

### 3.3 Category vs shape vs subject

| Dimension | Cardinality | Example |
|-----------|-------------|---------|
| **Category** | Exactly one | `resolution` |
| **Shape** | Exactly one | `checklist` (4 review lines) |
| **Subjects** | Zero to many | `customer_id`, `site_id`, or unlinked |
| **Work Definition key** | Exactly one | `weekly_balance_review` |

### 3.4 Operator copy

Categories drive **icons, filters, and reporting** — not operator primary labels. Operators see **Work Definition title** or contextual instance title:

- "Collect missing information" (not "information_collection task")
- "Friday operational review" (checklist with sub-items)

---

## 4. Relationship to Tasks

### 4.1 Determination (locked)

| Question | Answer |
|----------|--------|
| Is Task the primary work object? | **No** |
| Is Task a subtype of operational work? | **Yes** |
| What is Task? | **Work shape** `task` + primary operator-facing word for simple instances |
| What is `operational_tasks`? | **V1 persistence** for task-shaped instances — migrate toward work service, not abandon |

### 4.2 Implications for Tasks V2

[`tasks_v2_operational_work_framework.md`](./tasks_v2_operational_work_framework.md) remains valid for **near-term delivery** with these adjustments:

| Tasks V2 assumption | Framework V1 refinement |
|-----------------------|-------------------------|
| `operational_tasks` is the spine | Task-shaped instances are **slice 1** of work |
| "Task template" in Lifecycle Builder | Rename internally to **Work Definition** (task-shaped default) |
| My Tasks | Becomes **My Work** over time — task filter preset on shape=task |
| Source enum | Becomes `provenance.source` on work instance |

**Do not block Tasks V2 Phase 1** (modal, assignee, complete action) — implement as task-shaped work with metadata room for framework fields.

### 4.3 When to use task shape vs checklist shape

| Use task shape | Use checklist shape |
|----------------|---------------------|
| Single action path sufficient | Multiple distinct sub-obligations |
| One due date for whole obligation | Same due, multiple lines |
| Quick follow-up | Friday director reviews (4 lines) |
| One readiness gap theme | Many gaps aggregated |

---

## 5. Relationship to Actions

### 5.1 Model (validated and refined)

**Work defines outcomes. Actions define execution.**

| Plane | Responsibility |
|-------|----------------|
| **Work Instance** | Tracks obligation until operator marks done |
| **Work Definition** | Declares **outcome intent** + **suggested actions** |
| **Action** | Mutates operational truth when executed |

Completing work and executing an action are **orthogonal** — related but not identical.

### 5.2 Example: Resolve outstanding balance

| Element | Value |
|---------|-------|
| **Attention signal** | `outstanding_balance` (future billing resolver) |
| **Work category** | `resolution` |
| **Work title** | Resolve outstanding balance |
| **Outcome intent** | Balance cleared, plan in place, or exception documented |
| **Suggested actions** | Send statement · Call parent · Create payment plan · Apply adjustment |
| **Work complete** | Operator attests resolution — any valid action path |

**Flow:**

```
Billing signal → Attention (awareness)
              → Automation may instantiate Work (optional)
              → Operator opens record
              → BOS recommends action
              → Operator executes Send Statement OR Create Payment Plan
              → Operator marks Work complete with outcome note
              → Attention clears when balance signal false
```

### 5.3 Work Definition → Action linkage

```typescript
type WorkDefinition = {
  // ...
  suggested_action_keys: string[];     // CTAs — not exhaustive
  resolution_hints?: ResolutionHint[]; // same pattern as NA §4.2
  completion_requires_action?: false;  // default false — trust operator complete
};
```

**Locked:** Work completion **must not auto-fire** actions. Actions require explicit operator execution through `executeAdminAction`.

### 5.4 Action → Work (reverse)

Actions **may** instantiate work as side effect (via workflow):

- `record_tour_outcome` → workflow creates `follow_up` work
- Not inline in action handler — delegate to work service for dedupe

### 5.5 Anti-pattern

| Anti-pattern | Why wrong |
|--------------|-----------|
| One action per work type hardcoded | Domains cannot extend |
| Work complete triggers action automatically | Bypasses preflight/permissions |
| Action registry owns work lifecycle | Split responsibilities |

---

## 6. Relationship to Automations

### 6.1 Principle (locked)

Automations **invoke the work service** — they do not embed work logic or create parallel tables.

### 6.2 Automation roles

| Role | Mechanism |
|------|-----------|
| **Create work** | `instantiate_work` workflow action (conceptual) |
| **Complete work** | `complete_work` by id or definition_key + subject |
| **Escalate work** | Create **new** higher-priority instance or reassign — not status enum |
| **Route work** | PATCH assignee; optional notify via `send_message` |
| **Refresh checklist items** | Update items from new readiness snapshot — open instance only |

### 6.3 Event patterns

| Trigger | Work response |
|---------|---------------|
| `opportunity_status_changed` | Stage-entry definitions |
| `requirement_violated` (future) | `information_collection` instance |
| `charge_overdue` (future) | `resolution` instance |
| `document_missing` (future) | `information_collection` or `compliance` |
| Cron: Friday 8am | Recurring `review` checklist instances |
| Persistent attention + no open work | Optional escalation instance |

### 6.4 What automations must not do

| Forbidden | Why |
|-----------|-----|
| Raw INSERT bypassing work service | Breaks dedupe, provenance, attention projection |
| Attention resolver creates work | NA doctrine |
| Readiness evaluator creates work | Readiness doctrine |
| Second work table per domain | Framework collapse |

---

## 7. Relationship to BOS

### 7.1 Responsibility split (locked)

```
┌─────────────────────────────────────────────────────────┐
│  Operational Work (platform)                             │
│  TRUTH: open instances, dues, assignees, categories      │
└───────────────────────────┬─────────────────────────────┘
                            │ read-only
                            ▼
┌─────────────────────────────────────────────────────────┐
│  BOS                                                     │
│  EXPLAIN · PRIORITIZE · RECOMMEND ACTIONS · PREDICT      │
└─────────────────────────────────────────────────────────┘
```

| Work provides | BOS provides |
|---------------|--------------|
| Open instances + shapes | Natural language explanation |
| Categories + outcome intent | "What to tackle first" judgment |
| Checklist item state | Draft proposals (Task Assist) |
| Provenance context | Impact framing (non-authoritative) |
| Due urgency | Suggested action routing |

| BOS must not | Because |
|--------------|---------|
| Create work without apply | Human/automation authority |
| Mark work complete | Operator or automation authority |
| Override assignee/due as truth | Proposal ≠ instance |
| Re-evaluate readiness | Single evaluator |
| Invent work not grounded in definitions + signals | Prevents LLM obligation drift |

### 7.2 BOS capabilities mapped to work

| Capability | Work interaction |
|------------|-------------------|
| **`task_assist`** | Proposes task-**shaped** work drafts — apply → instantiate |
| **`operational_recommendation`** | Reads work + attention → suggests action |
| **`orchestrator`** | "What should I do?" → routes to work list + explain |
| **`readiness_explain`** (future) | Explains gaps — may suggest work definition, not insert |
| **Impact prediction** (future) | "If you complete X work, likely Y" — assistive only |

### 7.3 Prioritization model

**My Work / workspace sort** (deterministic first, BOS weight optional):

1. Overdue instances assigned to current user
2. Due today
3. Attention severity on linked subjects (presentation weight)
4. Category priority policy (compliance > resolution > collection > follow_up)
5. Due date ascending

BOS may **reorder recommendations** — not mutate instance priority fields without operator action.

---

## 8. Preventing work explosion

### 8.1 The trap

```
250 attention reasons → 250 work instances → unusable operator queue
N readiness gaps → N tasks → notification fatigue
M overdue charges → M balance tasks → duplicate effort
```

### 8.2 Strategies (locked)

#### A. Aggregation policy on Work Definition

| Policy | Behavior |
|--------|----------|
| **`one_per_subject`** | One open instance per subject per definition key |
| **`one_per_subject_per_period`** | Recurring + dedupe period key |
| **`aggregate_gaps`** | Multiple readiness gaps → one checklist instance with N items |
| **`aggregate_signals`** | Multiple attention codes → one work title; codes in metadata |
| **`no_auto_instantiate`** | Definition exists for manual/BOS only — automation disabled |

#### B. Signal → work is many-to-one

| Signals | Work instances |
|---------|----------------|
| 3 enforced readiness gaps | **1** "Collect missing information" checklist (3 items) |
| `missing_required_info` + `stale_qualified` | **0–1** — attentionawareness only; work optional via automation policy |
| 12 overdue charges one customer | **1** "Resolve outstanding balance" |
| Friday review obligation | **1** checklist (4 sub-reviews) — not 4 tasks |

#### C. Attention ≠ work inventory

Needs Attention lane shows **reason codes** — never full work instance lists. Work lives in **My Work**.

#### D. Checklist sub-items ≠ instances

Sub-items update in place. Completing all items → complete parent instance.

#### E. Tiered instantiation

| Tier | Behavior |
|------|----------|
| **Awareness only** | Attention fires; no work unless operator or policy opts in |
| **Suggested** | BOS proposes work; operator apply creates |
| **Automatic** | Automation instantiates with dedupe |
| **Mandatory schedule** | Recurrence always spawns — independent of signals |

**Default for signal-driven:** **Suggested** or **Automatic with aggregation** — not 1:1.

### 8.3 Example mappings

| Scenario | Wrong | Right |
|----------|-------|-------|
| Missing program interest | Task per gap field | One `information_collection` work; optional single gap item |
| Outstanding balance | Task per charge | One `resolution` work per customer/account period |
| Contract missing | Separate from packet work | One work definition keyed to document policy |
| Friday director reviews | 4 recurring tasks | 1 `review` checklist, 4 items, weekly recurrence |

---

## 9. Ownership model

### 9.1 Evaluation

| Model | Long-term role | Recommendation |
|-------|----------------|----------------|
| **User** | Primary assignee | **Canonical** — `assigned_to_user_id` on instance |
| **Role** | Resolution at instantiate | Policy on definition → resolve to user UUID |
| **Team** | Visibility/filter | Metadata + My Work filter — not row owner |
| **Department** | Context only | Derive from subject — **do not store on instance** |
| **Queue** | Record preview | **Not work ownership** — reject |

### 9.2 Recommendation (locked)

**Primary ownership = assigned user at instance creation (snapshot).**

| Question | Answer |
|----------|--------|
| Can work be unassigned? | Yes — pool visible in "Unassigned" filter |
| Does record owner auto-own work? | **Policy default**, not live sync |
| Recurring work for role | Scheduler resolves role → user(s); one instance per resolved user |
| Escalation | New instance or reassignment — explicit |

### 9.3 Multi-assignee

**One assignee per instance** in V1 framework. Shared obligations use:

- Separate instances per assignee (recurring reviews), or
- Checklist items with per-item assignee (future shape extension) — **not** multiple top-level owners

---

## 10. Work lifecycle

### 10.1 Instance status (recommended)

| Status | Meaning |
|--------|---------|
| **`open`** | Obligation active |
| **`completed`** | Operator/automation attests done |
| **`canceled`** | Withdrawn — not done |

No `in_progress` in V1 — use checklist item completion for partial progress.

### 10.2 Checklist item status

| Status | Meaning |
|--------|---------|
| **`pending`** | Not done |
| **`done`** | Item complete |
| **`skipped`** | Operator waived with reason |

Parent work completes when all items `done` or `skipped` per policy.

### 10.3 Completion vs truth

| Completion clears | Automatically? |
|-------------------|----------------|
| Task-sourced attention (`operational_task_overdue`) | Yes — when no other overdue work |
| Readiness gaps | **No** |
| Billing balance signal | **No** — unless action/workflow changed truth |
| Document missing signal | **No** — unless upload action ran |

### 10.4 Outcome recording (decision/review categories)

```typescript
type WorkOutcome = {
  kind: "approved" | "denied" | "deferred" | "resolved" | "not_applicable";
  note?: string;
  recorded_by: string;
  recorded_at: string;
};
```

Optional on complete — required for `decision` category per org policy (future config).

---

## 11. Domain examples (framework applied)

### 11.1 Enrollment — missing program interest

| Layer | Element |
|-------|---------|
| Readiness | Gap: `child:program_interest` enforced |
| Attention | `missing_required_info` (projection) |
| Work Definition | `collect_missing_information` · category `information_collection` · shape checklist · aggregate_gaps |
| Work Instance | "Collect missing information" — items populated from gap list |
| Actions | Edit field · Send intake form · Open drawer field |
| Complete | Operator marks done when gaps cleared OR documents exception |

### 11.2 Billing — outstanding balance

| Layer | Element |
|-------|---------|
| Signal | Balance > 0 past due (future billing evaluator) |
| Attention | `outstanding_balance` (future code) |
| Work Definition | `resolve_outstanding_balance` · category `resolution` |
| Work Instance | One per customer per collection period |
| Actions | Send statement · Call parent · Create payment plan · Apply adjustment |
| Complete | Operator attests resolution |

### 11.3 Documents — contract missing

| Layer | Element |
|-------|---------|
| Signal | Required document type absent (future document scope) |
| Attention | `required_document_missing` (future) |
| Work Definition | `resolve_missing_documentation` · category `information_collection` or `compliance` |
| Work Instance | Linked to enrollment subject |
| Actions | Upload document · Send request · Open packet |
| Complete | Document scope satisfied |

### 11.4 Recurring — Friday school director reviews

| Layer | Element |
|-------|---------|
| Signals | **None required** |
| Work Definition | `friday_director_operational_review` · category `review` · shape checklist · recurrence weekly(Fri) |
| Work Instance | "Week of Jun 6 — Operational review" with items: Attendance audit · Staffing · Licensing · Balance review |
| Actions | Deep links per item (reports, queues) — informational |
| Complete | Director checks all items |

**This case cannot be modeled as tasks-only** — it requires schedule-driven checklist work.

---

## 12. Canonical vocabulary

Per [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md) — extensions:

| Use | Avoid |
|-----|-------|
| Operational work | Work item ticket system |
| Work instance | Task row (when meaning any shape) |
| Task | Work (when meaning checklist/recurring) |
| Work definition / template | Task type enum explosion |
| My Work | My Tasks ( eventual — Tasks OK for task-only phase) |
| Complete work | Close ticket |
| Outcome intent | Action description |
| Suggested action | Required action |
| Checklist item | Sub-task table row |
| Recurring obligation | Recurring task (implies task shape only) |
| Shape | Type ( overloaded with entity types) |
| Category | Priority (orthogonal) |

**Operator-facing:** Keep **Task** and **Follow-up** for simple cases. Use **Review checklist** or **Work** when shape = checklist.

---

## 13. Current-state alignment

| Today | Framework mapping | Gap |
|-------|-------------------|-----|
| `operational_tasks` | Task-shaped work instances | No checklist, recurrence, multi-subject |
| `task_assist_proposals` | BOS proposal before instantiate | Reminder type only |
| Lifecycle task templates (planned) | Work definitions (task default) | Not implemented |
| Readiness gaps | Signal input — not work | Correct |
| Attention reasons | Signal input — not work | Correct |
| Packet review UX | Ad hoc UI | Could become checklist-shaped work |
| Workflow actions | No `instantiate_work` | Gap |
| My Tasks | Task-shaped work list | Rename/evolve later |

**Strategic path:** Implement framework **conceptually** first; **physically** extend task service with metadata before new tables.

---

## 14. Risks, traps, and anti-patterns

| Risk | Trap | Mitigation |
|------|------|------------|
| **Tasks-as-platform** | Everything called task | Work framework + shape/category |
| **Work explosion** | 1:1 signal-to-instance | Aggregation policies §8 |
| **NA creates work** | Resolver insert | Locked doctrine |
| **Readiness creates work** | Evaluator insert | Automation-only |
| **Action = work** | Send message completes obligation | Separate complete + execute |
| **Work = queue row** | Queue as to-do | Queue = record preview |
| **BOS owns work** | LLM inserts obligations | Apply + service only |
| **Per-domain work engines** | Billing tasks table | Single work service |
| **Checklist as N tasks** | 4 Friday tasks | One checklist instance |
| **Recurring as cron tasks** | Without definition | Recurrence on definition |
| **Category proliferation** | Tenant-defined enums | 8 platform categories |
| **Completion = truth** | Mark done clears balance | Signal re-eval |
| **Assignee live sync** | Record owner drift | Snapshot at create |
| **Premature schema split** | New tables before model freeze | This document first |
| **Blocking Tasks V2** | Waiting for full framework | Task shape Phase 1 proceeds |

---

## 15. Recommended phased roadmap

### Phase 0 — Framework freeze (this document)

- [x] Determine Task vs Operational Work relationship
- [x] Define work definition / instance / shape / category
- [x] Creation, ownership, lifecycle, action, automation, BOS models
- [x] Work explosion prevention
- [x] Domain examples including recurring
- [ ] Product sign-off on §16 before Tasks V2 Phase 1 coding

### Phase 1 — Task-shaped work (Tasks V2 alignment)

**Goal:** Deliver operator value without waiting for full work service.

| Work | Notes |
|------|-------|
| Tasks V2 Phase 1 (modal, assignee, complete action) | Implement as task **shape** |
| Add conceptual metadata keys on instances | `work_definition_key`, `category`, `shape: task` |
| Document mapping in tasks_v2 doc | Cross-link |

**Exit:** Task-shaped work usable; metadata ready for framework.

### Phase 2 — Work definitions in Lifecycle Builder

**Goal:** Configurable definitions; stage-entry instantiate.

| Work | Notes |
|------|-------|
| `lifecycle_work_definitions_v1` metadata (rename from task templates) | Category + shape + aggregation |
| Builder section | Work definitions CRUD |
| Stage-entry automation | `instantiate_work` spec |

**Exit:** Lead stage entry spawns definition-backed work.

### Phase 3 — Automation + aggregation

**Goal:** Workflows create work; gap aggregation live.

| Work | Notes |
|------|-------|
| Workflow `instantiate_work` / `complete_work` | Delegates to service |
| Aggregate readiness gaps → checklist | One instance, many items |
| Billing/document definition seeds (spec) | Domain-agnostic catalog |

**Exit:** No 1:1 gap-to-task explosion.

### Phase 4 — Checklist shape + recurring obligations

**Goal:** Friday review pattern; checklist UI.

| Work | Notes |
|------|-------|
| Checklist shape in service | Items array on instance or child rows — implementation TBD later |
| Recurrence scheduler | Schedule-driven create |
| My Work UI | Filter by shape/category |

**Exit:** Recurring director reviews without signals.

### Phase 5 — Cross-domain subjects

**Goal:** Billing, documents, subsidy link to work instances.

| Work | Notes |
|------|-------|
| Subject model generalization | Beyond `opportunities` |
| Domain evaluators → attention → optional work | Billing, documents |
| Reporting by category | Operational intelligence |

**Exit:** Framework truly domain-agnostic in runtime.

### Phase 6 — Unified My Work + BOS depth

**Goal:** Single operator queue for all shapes.

| Work | Notes |
|------|-------|
| My Work replaces My Tasks branding | All shapes |
| BOS impact prediction (assistive) | Non-authoritative |
| Team filters + escalation automations | Ownership polish |

---

## 16. Open decisions (require product sign-off)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Primary operator word | Task vs Work | **Task** for simple; **Work** for product shell long-term |
| 2 | Checklist persistence | JSON items on instance vs child table | **Defer** — Phase 4 implementation |
| 3 | Rename `operational_tasks` | Rename vs keep | **Keep table name**; treat as task-shaped storage |
| 4 | Auto-instantiate from attention | Never vs policy | **Policy per definition** — default off |
| 5 | Recurrence owner | Platform scheduler vs external cron | **Platform scheduler** long-term |
| 6 | Decision outcome required | Optional vs required | **Required for `decision` category** when enforced gates exist |
| 7 | Tasks V2 proceed? | Wait vs parallel | **Proceed Phase 1** as task-shaped work |
| 8 | Work definition catalog scope | Platform vs org | **Platform keys + org enable/tune** |
| 9 | One My Work queue | Unified vs per-domain | **Unified** with filters |

---

## Appendix A — Relationship to Tasks V2 document

[`tasks_v2_operational_work_framework.md`](./tasks_v2_operational_work_framework.md) discovered task runtime truth and boundaries. This document **generalizes** that work:

| Tasks V2 | Operational Work V1 |
|----------|---------------------|
| Task as spine | Work as spine; task as shape |
| Task template | Work definition (default shape task) |
| `operational_tasks` truth | Task-shaped instance storage |
| Six task sources | Six work **instantiation** sources (same doctrine) |
| NA / readiness / BOS boundaries | Unchanged — inherited |

**No contradiction** on doctrine — only abstraction elevation.

---

## Appendix B — Success criteria (framework freeze)

| Criterion | Status |
|-----------|--------|
| Operational Work defined as primary abstraction | Yes |
| Task determined as subtype/shape | Yes — §4 |
| Work Definition / Instance / shape / category defined | Yes — §1 |
| All creation sources evaluated | Yes — §2 |
| Category model (small enum) | Yes — §3 |
| Action relationship (outcome vs execution) | Yes — §5 |
| Automation relationship | Yes — §6 |
| BOS relationship | Yes — §7 |
| Work explosion prevention | Yes — §8 |
| Ownership model | Yes — §9 |
| Work lifecycle | Yes — §10 |
| Domain examples (4 scenarios) | Yes — §11 |
| Risks + roadmap | Yes — §14–§15 |
| No implementation proposed | Yes |
| Aligned with frozen readiness/attention doctrine | Yes |

---

*End of Operational Work Framework V1 — Tasks V2 implementation may proceed as task-shaped Phase 1 after §16 sign-off.*
