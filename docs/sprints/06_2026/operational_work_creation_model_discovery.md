# Operational Work Creation Model — Discovery Sprint

**Path:** `docs/sprints/06_2026/operational_work_creation_model_discovery.md`  
**Date:** 2026-06-03  
**Status:** **Discovery complete — operating model frozen for Work Definitions planning**  
**Scope:** Determine how operational work is **instantiated** across the platform. No code, migrations, UI, or Work Definition editor.

**Prerequisite (shipped):**

- Operational Work V1 runtime — task-shaped instances, assignee, completion (PR1–PR3)
- [`operational_work_framework_v1.md`](./operational_work_framework_v1.md) — framework abstraction
- [`operational_work_v1_implementation_plan.md`](./operational_work_v1_implementation_plan.md) — implementation roadmap

**Frozen doctrine (do not redesign):**

```
Lifecycle → Readiness → Needs Attention → Operational Work → Actions → Automations → BOS
```

| Layer | Question |
|-------|----------|
| Readiness | Can this advance? |
| Needs Attention | What risk exists? |
| Operational Work | What obligation exists? |
| Actions | How is work executed? |
| Automations | How does the system perform work? |
| BOS | Explanation, prioritization, recommendation |

**Authority:** This document is the canonical reference for **work instantiation** before Work Definitions are built. Work Definition editor, `instantiate_work` workflow action, and recurrence scheduler must align with §1–§10 unless product records an exception in §11.

---

## Executive summary

Operational Work answers **what obligation exists, who owns it, and is it done?** This sprint answers **how obligations come into existence**.

**Locked creation principle:**

> Only **`operationalWorkService.instantiateWork(...)`** (conceptual) may create runtime work. Every other system **signals, recommends, or configures** — it does not insert rows.

**Six canonical creation sources** (validated):

| Source | Creates work? | Default mode |
|--------|---------------|--------------|
| **Manual** | Yes | Immediate |
| **BOS apply** | Yes (via manual/automation path) | Suggested → operator apply |
| **Workflow / automation** | Yes | Policy-driven automatic |
| **Recurring schedule** | Yes | Mandatory automatic |
| **Lifecycle stage-entry policy** | Yes (via automation) | Automatic with dedupe |
| **Readiness / Attention** | **No** | Signal only — optional downstream automation |

**Duplicate prevention** is the highest-risk design area. The model is **definition-keyed dedupe + aggregation policy + open-instance rule** — not 1:1 signal-to-row mapping.

**Aggregation default:** Many signals → **one work instance per subject per definition per period**, with checklist items when multiple sub-obligations exist.

**Attention and Readiness never create work.** They may **trigger automation** that calls the work service when org policy enables it — default **off** for signal-driven auto-create.

---

## 1. Operational Work Creation Model

### 1.1 The creation question

Work instantiation is a **deliberate act** that converts **signals + policy** into a **durable obligation**. It is not a side effect of evaluation.

```
┌──────────────────────────────────────────────────────────────────┐
│  SIGNALS (read-only inputs)                                       │
│  Lifecycle stage · Readiness gaps · Attention reasons · Events    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  POLICY (configuration — future Work Definitions + org toggles)   │
│  When to instantiate · aggregation · assignee · dedupe key        │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  CREATION AUTHORITY (single write path)                           │
│  operationalWorkService.instantiateWork(request)                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  RUNTIME (today: task-shaped rows in operational_tasks)           │
│  Work Instance — open | completed | canceled                      │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Instantiate request (conceptual contract)

Every creation path — manual, BOS apply, workflow, scheduler — submits the same shape:

```typescript
type InstantiateWorkRequest = {
  org_id: string;
  work_definition_key: string;           // stable dedupe identity; "manual_ad_hoc" for untemplated create
  shape: "task" | "checklist";           // V1 runtime: task only
  category?: WorkCategory;
  title: string;                         // operator-facing; may default from definition
  due_at?: string | null;
  assigned_to_user_id?: string | null;
  subjects: WorkSubject[];               // 0..N entity links
  context_snapshot?: {                    // frozen at create — never re-evaluated
    readiness_gap_ids?: string[];
    attention_reason_codes?: string[];
    lifecycle_stage_key?: string;
    event_type?: string;
  };
  provenance: {
    source: "manual" | "task_assist" | "workflow" | "lifecycle_template" | "recurrence";
    created_by_user_id?: string;
    workflow_run_id?: string;
    proposal_id?: string;
    idempotency_key?: string;
  };
};
```

**Response semantics:**

| Outcome | Meaning |
|---------|---------|
| `created` | New open instance |
| `deduped` | Matching open instance exists — no new row; optional context refresh |
| `rejected` | Policy forbids (e.g. `no_auto_instantiate`) |
| `aggregated` | Appended to existing checklist instance instead of new row |

### 1.3 Creation is not completion

Instantiation creates **obligation**. It does **not**:

- Clear attention
- Satisfy readiness
- Change lifecycle status
- Execute actions
- Run workflows (except the workflow that *called* instantiate)

Completion is a separate transition on the instance.

### 1.4 Ad hoc manual create (V1 today)

Manual create without a Work Definition uses:

- `work_definition_key: "manual_ad_hoc"` (or omitted → inferred)
- Operator-entered title, due, assignee
- Optional `context_snapshot` from drawer (readiness gaps, attention codes) for display only

This is valid V1. Work Definitions add **policy, dedupe, and suggested actions** — not the ability to create work at all.

---

## 2. Creation source matrix

### 2.1 Full matrix

| Source | May insert runtime work? | Mechanism | Typical provenance.source | Dedupe | Default tier |
|--------|--------------------------|-----------|---------------------------|--------|--------------|
| **Manual UI** (drawer modal, My Tasks) | **Yes** | Direct `instantiateWork` | `manual` | Optional idempotency key | Immediate |
| **Task Assist apply** | **Yes** | Proposal → apply → `instantiateWork` | `task_assist` | `proposal_id` | Suggested |
| **BOS operational recommendation** | **No direct** | Routes to modal or Task Assist | — | — | Suggested |
| **Registry `create_task` action** | **Yes** (via UI) | Opens modal → `instantiateWork` | `manual` | — | Immediate |
| **Workflow `instantiate_work`** | **Yes** | Automation action → service | `workflow` | `idempotency_key` + definition dedupe | Automatic |
| **Lifecycle stage-entry automation** | **Yes** (via workflow/listener) | Stage event → `instantiateWork` | `lifecycle_template` | definition + subject + period | Automatic |
| **Recurrence scheduler** | **Yes** | Cron/platform job → `instantiateWork` | `recurrence` | definition + assignee + period_key | Mandatory |
| **Readiness evaluator** | **No** | Emits gaps only | — | — | Signal |
| **Attention resolver** | **No** | Emits reason codes only | — | — | Signal |
| **BOS (autonomous)** | **No** | Explain/recommend only | — | — | N/A |
| **Action execution** | **No** (direct) | May trigger workflow that instantiates | — | — | Indirect |
| **Queue row** | **No** | Preview only | — | — | N/A |

### 2.2 Validated source taxonomy

Replace informal lists with **four creation modes** × **six entry points**:

**Modes:**

1. **Immediate** — operator or system decides now; row appears
2. **Suggested** — system proposes; human apply creates
3. **Automatic** — policy fires on signal/event/schedule; service dedupes
4. **Mandatory schedule** — recurrence spawns regardless of signals

**Entry points:**

1. Manual UI
2. BOS apply path (Task Assist, modal prefill)
3. Workflow / stage automation
4. Recurrence scheduler
5. Future: Work Definition picker in create modal
6. Future: API/integration (same service, same dedupe)

### 2.3 Source enum evolution

Today `operational_tasks.source` ∈ `{ manual, task_assist }`. Framework `provenance.source` adds:

- `workflow`
- `lifecycle_template`
- `recurrence`

Migration deferred until Phase 3 automation ships. Metadata v1 `provenance` may carry future values before CHECK constraint update.

---

## 3. Creation ownership model

### 3.1 Who may create vs recommend

| System | Create work | Recommend work | Configure creation policy |
|--------|-------------|----------------|---------------------------|
| **Operator (manual UI)** | ✅ Always | — | — |
| **BOS / Task Assist** | ✅ On apply only | ✅ Propose drafts | — |
| **Workflows / automations** | ✅ Via `instantiate_work` | — | Via workflow config |
| **Lifecycle Builder** | ❌ | — | ✅ Work Definitions + stage triggers (Phase 2+) |
| **Readiness Engine** | ❌ | ✅ Resolution hints → actions/modal | ❌ |
| **Attention resolver** | ❌ | ✅ Resolution hints | ❌ (orchestration config separate) |
| **Actions (`executeAdminAction`)** | ❌ Direct | ✅ `create_task` opens modal | — |
| **BOS orchestrator** | ❌ | ✅ "Create follow-up" routing | — |
| **Queue / NA lane** | ❌ | ✅ Row hints | — |

### 3.2 Boundary rules (locked)

1. **Evaluators evaluate.** Readiness and Attention produce snapshots — never INSERT.
2. **Assist proposes.** BOS produces drafts and recommendations — apply is the creation moment.
3. **Automations instantiate.** Workflows and schedulers call the work service with idempotency.
4. **Operators override.** Manual create always allowed; may duplicate if operator chooses (warn, don't block).
5. **Config configures.** Lifecycle Builder stores definitions and policies — Builder save does not instantiate.

### 3.3 Creation authority diagram

```
                    ┌─────────────┐
                    │  Operator   │──manual UI──────────────────┐
                    └─────────────┘                             │
                    ┌─────────────┐                             │
                    │ BOS apply   │──Task Assist / modal───────┤
                    └─────────────┘                             │
                    ┌─────────────┐                             ▼
                    │ Workflow    │──instantiate_work──▶ operationalWorkService
                    └─────────────┘                             ▲
                    ┌─────────────┐                             │
                    │ Scheduler   │──recurrence─────────────────┘
                    └─────────────┘

    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │  Readiness   │     │  Attention   │     │     BOS      │
    │  (evaluate)  │     │  (surface)   │     │  (explain)   │
    └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
           │                    │                    │
           └────────────────────┴────────────────────┘
                         signals & recommendations only
                         (may feed workflow triggers — not direct create)
```

---

## 4. Attention → Work relationship

### 4.1 Canonical bridge

| Plane | Role |
|-------|------|
| **Attention** | Identifies **that risk exists** — overlay on records |
| **Work** | Defines **what someone should do about it** — durable obligation |

**Attention does not create work.** The bridge is **optional orchestration** configured per Work Definition or org automation policy.

### 4.2 Interaction patterns

| Pattern | Description | Default |
|---------|-------------|---------|
| **Awareness only** | Attention fires; operator sees reason; no work | ✅ Default for most reasons |
| **Suggested work** | BOS/recommendation proposes work; operator apply creates | ✅ Default when product wants action |
| **Automatic work** | Workflow listens (persistent reason, event, or schedule) → `instantiate_work` | ⚠️ Opt-in per definition |
| **Work → Attention** | Open/overdue work projects attention reason (`operational_task_overdue`) | ✅ Resolver read-only |

### 4.3 Example: Tour Date Passed

| Layer | Element |
|-------|---------|
| **Signal** | `tour_scheduled` status + `metadata.tour_date` < now |
| **Attention** | Reason code `tour_date_passed` — **Risk** category |
| **Work (optional)** | Definition `record_tour_outcome` or `follow_up_after_tour` |
| **Instantiation** | **Not automatic by default** |

**Recommended path:**

1. Attention surfaces `tour_date_passed` in NA lane and drawer strip.
2. Resolution hints offer `record_tour_outcome` action.
3. BOS may recommend: "Record tour outcome or schedule follow-up."
4. **If** org enables definition policy `auto_instantiate_on: ["tour_date_passed"]`:
   - Workflow or stage listener calls `instantiateWork("follow_up_after_tour", subject)` with dedupe.
5. Operator may always manual-create regardless.

**Answer to "Should work be created?"** — **Not by attention itself.** Configurable via Work Definition automation policy — default **suggested**, not automatic.

### 4.4 Example: Outstanding Balance (future billing)

| Layer | Element |
|-------|---------|
| **Signal** | Balance > threshold past due |
| **Attention** | `outstanding_balance` (future code) |
| **Work definition** | `resolve_outstanding_balance` · aggregation `one_per_subject_per_period` |
| **Instantiation** | Automatic **only if** org enables; otherwise suggested |

**Not every balance creates work.** Policy dimensions:

- Minimum balance threshold
- Days past due
- Customer/account scope (one work per customer, not per charge)
- Collection period key for dedupe

### 4.5 Attention subscription anti-pattern

| Anti-pattern | Correct model |
|--------------|---------------|
| Attention resolver INSERT on reason fire | Workflow trigger on persistent reason |
| NA lane shows work rows | NA shows reason codes; work in My Tasks |
| One attention reason → one work row always | Definition aggregation policy decides |
| Dismissing attention creates work | No — state change or automation only |

---

## 5. Readiness → Work relationship

### 5.1 Canonical rule (locked)

**Readiness never directly creates work.**

Readiness answers **can this advance?** Gaps are **evaluation findings**, not obligations.

### 5.2 What readiness contributes

| Contribution | When | Mutable after create? |
|--------------|------|------------------------|
| `context_snapshot.readiness_gap_ids` | At instantiate | **No** — frozen snapshot |
| Checklist item population | Aggregate policy | Refresh open instance items optional |
| BOS / modal prefill | Before create | N/A |
| Resolution hints on attention reason | NA projection | N/A |

### 5.3 Example: Missing Program Interest

| Layer | Element |
|-------|---------|
| **Readiness** | Gap: `child:program_interest` enforced |
| **Attention** | `missing_required_info` (projected — not independent eval) |
| **Work (optional)** | Definition `collect_missing_information` |
| **Instantiation** | **Not from readiness evaluator** |

**Recommended path:**

1. Readiness evaluates → gaps in Required Information panel.
2. Attention projects `missing_required_info` when profile enables.
3. Operator clicks "Create work" or BOS suggests "Collect missing information."
4. **If** automation enabled: workflow on `missing_required_info` persistent + no open matching work → instantiate with `aggregate_gaps` → one checklist, N items from gap list.
5. Completing work **does not** clear gaps unless operator also fills fields via actions.

### 5.4 Readiness-triggered automation (future)

Valid pattern — **orchestration**, not evaluator insert:

```
ReadinessResult (needs_information)
    → event or workflow condition (future: requirement_violated)
    → instantiateWork("collect_missing_information", { aggregate_gaps: true })
```

Default: **off** until Work Definitions Phase 3.

---

## 6. Automation → Work relationship

### 6.1 `instantiate_work` behavior (future workflow action)

| Property | Rule |
|----------|------|
| **Entry** | Registered workflow action type — not inline handler |
| **Delegate** | Always calls `operationalWorkService.instantiateWork` |
| **Auth** | Service-role server path; org-scoped |
| **Idempotency** | Required `idempotency_key` from workflow run + step |
| **Dedupe** | Service enforces open-instance rule before insert |
| **Failure** | No partial row; workflow step fails audibly |
| **Output** | `{ instance_id, outcome: created | deduped | aggregated }` |

### 6.2 Companion actions (future)

| Action | Purpose |
|--------|---------|
| `complete_work` | Mark instance complete by id or definition + subject |
| `reassign_work` | PATCH assignee |
| `refresh_work_items` | Update checklist items from latest readiness snapshot (open only) |

### 6.3 Safeguards

| Safeguard | Purpose |
|-----------|---------|
| Single write path | No raw INSERT bypass |
| Definition must exist (or explicit ad hoc key) | Prevents orphan obligations |
| `no_auto_instantiate` flag on definition | Kill switch per template |
| Org-level automation enable | Global guard before signal-driven create |
| Rate limits on scheduler | Prevents recurrence storms |
| Audit log on provenance | Trace workflow_run_id |

### 6.4 Example: Vendor accepted job (future event)

| Element | Value |
|---------|-------|
| Event | `job.vendor_accepted` (illustrative) |
| Work definition | `confirm_vendor_schedule` · category `coordination` |
| Trigger | Workflow on event |
| Dedupe | `(org, definition_key, job_id)` — one open instance |
| Assignee | Role policy → resolved user at instantiate |

Differs from manual: **provenance.workflow**, automatic fire, dedupe enforced, title/due from definition defaults.

---

## 7. Recurring work instantiation model

### 7.1 Principle

Recurring obligations are **schedule-driven**, not signal-driven. Missing signals **do not block** spawn.

### 7.2 Model

```
Work Definition
  recurrence: { cadence: weekly, day: Friday, time: 08:00, timezone: org }
  shape: checklist
  aggregation: one_per_assignee_per_period
        ↓
Platform scheduler (Phase 3+)
        ↓
For each resolved assignee in scope:
  instantiateWork({
    work_definition_key,
    period_key: "2026-W23",
    assignee,
    title: "Week of Jun 6 — Operational review",
    items: [Attendance audit, Staffing, Licensing, Balance review]
  })
```

### 7.3 Example: Weekly Director Checklist

| Question | Answer |
|----------|--------|
| How does it instantiate? | Scheduler fires weekly → one **checklist** instance per director |
| Per record? | **No** — per assignee scope (site/role), not per opportunity |
| Signals required? | **No** |
| Completing this week? | Marks instance complete; **next period spawns new instance** |
| Same as 4 tasks? | **No** — one checklist, 4 items |

### 7.4 Recurrence dedupe key

`(org_id, work_definition_key, assignee_user_id, period_key)` — if open instance exists for same period, skip or refresh per policy.

---

## 8. Duplicate prevention model

### 8.1 The problem (four creators, one problem)

```
Missing Program Interest  →  readiness gap + attention reason
Tour overdue              →  attention reason
Workflow                  →  auto instantiate on stage entry
Operator                  →  manual "Follow up family"
```

Without dedupe → **four obligations for one enrollment** — operator fatigue, reporting noise, BOS confusion.

### 8.2 Dedupe strategy (three layers)

#### Layer 1 — Work Definition key (semantic identity)

Every instantiated work carries `work_definition_key` — stable across sources.

| Definition key | Intent |
|----------------|--------|
| `collect_missing_information` | Gather required facts |
| `follow_up_after_tour` | Post-tour outreach |
| `resolve_outstanding_balance` | Clear billing issue |
| `manual_ad_hoc` | Operator freeform — **weak dedupe** |

Same key + same subject + open status → **candidate duplicate**.

#### Layer 2 — Subject fingerprint

```typescript
subject_fingerprint = hash(org_id, primary_entity_type, primary_entity_id)
// Multi-subject: sorted stable join
```

Dedupe scope: `(org_id, work_definition_key, subject_fingerprint)`.

#### Layer 3 — Period key (recurring / billing)

Optional `period_key`: `2026-W23`, `2026-06`, `collection_cycle_42`.

Full dedupe key:

```
(org_id, work_definition_key, subject_fingerprint, period_key?)
```

### 8.3 Open instance rule (locked)

> If a matching **open** instance exists for the dedupe key, **do not create** a new row.

| On duplicate attempt | Behavior |
|----------------------|----------|
| Same definition + subject + open | Return `deduped`; optionally merge context into metadata |
| Checklist with `aggregate_gaps` | **Refresh items** from latest gap snapshot — don't second instance |
| Operator manual ad hoc | **Allow** — warn in UI if similar open work exists |
| Completed instance exists | **Allow** new open — prior obligation fulfilled |
| Canceled instance exists | **Allow** new open — operator withdrew prior |

### 8.4 Cross-source dedupe

| Scenario | Result |
|----------|--------|
| Attention suggests + operator manual same definition | Second call dedupes if first created open instance |
| Workflow auto + operator manual same day | Dedupe — one row |
| Manual ad hoc + definition-backed | **No dedupe** — different keys |
| `follow_up_after_tour` + `collect_missing_information` | **Both allowed** — different definitions, different obligations |

### 8.5 UI duplicate awareness (future)

When operator manual-creates on record with open similar work:

- Non-blocking banner: "Open follow-up already assigned to Alex — view existing?"
- Never hard-block manual create

---

## 9. Aggregation model

### 9.1 Principles

| Principle | Rule |
|-----------|------|
| **Signals are many; obligations are few** | Default many-to-one |
| **Aggregation is definition policy** | Not global platform default |
| **Subject scope first** | Aggregate within one customer/record/account before cross-record |
| **Checklist over N tasks** | Multiple sub-obligations → items, not instances |
| **Cross-record batch is operator workflow** | Queue selection → one checklist — not auto 250 rows |

### 9.2 Aggregation policies (on Work Definition)

| Policy | Behavior | Example |
|--------|----------|---------|
| `one_per_subject` | Max one open instance per subject per definition | One balance resolution per customer |
| `one_per_subject_per_period` | + period_key | Monthly collection cycle |
| `aggregate_gaps` | Readiness gaps → checklist items on one instance | 3 enforced gaps → 1 work, 3 lines |
| `aggregate_signals` | Multiple attention codes in metadata; one title | Stale + tour passed → one "Re-engage family" |
| `one_per_assignee_per_period` | Recurring scope | Friday review per director |
| `no_auto_instantiate` | Definition for manual/BOS only | Sensitive compliance review |

### 9.3 Example: 250 records missing program interest

| Approach | Verdict |
|----------|---------|
| 250 work items (1:1) | ❌ **Reject** as default — explosion |
| 25 work items (batched by assignee) | ⚠️ Possible **manual** batch workflow — not automatic |
| 1 checklist | ❌ Wrong grain — 250 different families |
| **Correct default** | **No automatic instantiate.** Attention/NA surfaces 250 flagged records. Operators work queue. Optional: operator selects cohort → "Create collection work" → **one checklist per selected record** with aggregated gaps **per record**. |

**Platform rule for bulk gaps:**

- **NA / queue** = awareness at scale
- **Work** = obligation at **actionable grain** (usually one subject)
- **Automation** may instantiate **per subject** with dedupe — never 250 in one job without explicit batch definition

### 9.4 Example: 12 overdue charges, one customer

| Approach | Verdict |
|----------|---------|
| 12 work items | ❌ |
| 1 work item `resolve_outstanding_balance` | ✅ `one_per_subject_per_period` |

### 9.5 Example: 3 readiness gaps, one opportunity

| Approach | Verdict |
|----------|---------|
| 3 tasks | ❌ default |
| 1 checklist "Collect missing information" with 3 items | ✅ `aggregate_gaps` |

---

## 10. Future Work Definitions — instantiation without editor

Work Definitions are **configuration** describing **when and how** to instantiate. The editor is Phase 2; the **instantiation contract** is defined now.

### 10.1 Work Definition schema (conceptual)

```typescript
type WorkDefinition = {
  key: string;                              // platform-stable dedupe id
  title_default: string;
  category: WorkCategory;
  default_shape: "task" | "checklist";
  outcome_intent: string;
  suggested_action_keys?: string[];
  assignment_policy: {
    default: "record_owner" | "creator" | "role" | "unassigned";
    role_key?: string;
  };
  instantiation_policy: {
    mode: "manual_only" | "suggested" | "automatic" | "recurrence";
    triggers?: {
      attention_reason_codes?: string[];    // orchestration listens — not resolver
      lifecycle_stage_entry?: string[];
      events?: string[];
      readiness_primary_state?: string[];   // workflow condition — not evaluator
    };
    aggregation: AggregationPolicy;
    auto_instantiate_default: boolean;      // default false
  };
  recurrence?: RecurrencePolicy;
};
```

### 10.2 Instantiation flow (definition-backed)

```
1. Trigger fires (event, schedule, operator picker, BOS apply with definition_key)
2. Load WorkDefinition from org config (platform catalog + org overrides)
3. Evaluate instantiation_policy — allowed? mode matches trigger?
4. Resolve assignee from assignment_policy + subject
5. Build dedupe key from definition.aggregation
6. operationalWorkService.instantiateWork(...)
7. Attach context_snapshot from current signals (optional)
8. Return instance or deduped
```

### 10.3 Platform catalog before editor

Phase 2 may ship **TS constants** for seed definitions before Builder UI:

- `collect_missing_information`
- `follow_up_after_tour`
- `contact_family`
- `resolve_outstanding_balance`
- `friday_director_operational_review`

Org enables/tunes via metadata — editor comes later.

### 10.4 Manual create + definition picker (bridge)

Create modal evolution:

1. V1 (shipped): freeform title
2. Phase 2: optional definition picker → prefill title, category, suggested actions, dedupe key
3. Operator may override title; dedupe still applies via definition key

---

## 11. BOS relationship (creation-specific)

| BOS capability | Create? | Mechanism |
|----------------|---------|-----------|
| Explain open work | ❌ | Read instances |
| Recommend action | ❌ | Route to `executeAdminAction` |
| Propose task-shaped work | ✅ On apply | Task Assist → `instantiateWork` |
| Prefill create modal | ✅ | Opens modal with draft — operator confirms |
| Orchestrator "create follow-up" | ✅ On apply | Same as modal |
| Autonomous insert | ❌ | Forbidden |
| Mark complete | ❌ | Operator or `complete_work` automation |
| Reassign as truth | ❌ | Proposal only |

**BOS creation tier:** Always **Suggested** — human apply or explicit automation config elsewhere.

---

## 12. Recommended roadmap

Work Definitions **depend on** this creation model being frozen. Recommended sequence:

### Phase A — Creation contract in service (before Builder)

| Item | Notes |
|------|-------|
| `instantiateWork` accepts full request shape | Extend facade |
| Dedupe + open-instance rule in service | Unit tests |
| `manual_ad_hoc` + definition_key paths | Backward compat |
| Platform definition catalog (TS constants) | No UI |

**Exit:** Service can instantiate definition-keyed work with dedupe — manual + workflow-ready.

### Phase B — Work Definitions config (Lifecycle Builder)

| Item | Notes |
|------|-------|
| `lifecycle_work_definitions_v1` metadata schema | Parser + validation |
| Builder CRUD section | Config only — no evaluate |
| Create modal definition picker | Prefill + dedupe |
| Stage-entry trigger metadata | Spec for automation |

**Exit:** Operators configure definitions; manual instantiate uses them.

### Phase C — Automation instantiate

| Item | Notes |
|------|-------|
| Workflow `instantiate_work` action | Delegates to service |
| Stage-entry listener or status-changed workflow | Enrollment first |
| Org toggle: auto-instantiate per definition | Default off |
| `provenance.source: workflow` migration | CHECK update |

**Exit:** Tour-complete workflow creates deduped follow-up.

### Phase D — Aggregation + checklist shape

| Item | Notes |
|------|-------|
| Checklist shape in runtime | Items model |
| `aggregate_gaps` policy | Readiness → checklist items |
| Billing `one_per_subject_per_period` | Domain seed definition |

**Exit:** Missing info = one checklist; balance = one resolution task.

### Phase E — Recurrence

| Item | Notes |
|------|-------|
| Platform scheduler | Weekly director review |
| `one_per_assignee_per_period` dedupe | |
| My Work filters by definition/category | |

**Exit:** Schedule-driven obligations without signals.

### Phase F — Signal orchestration (attention/readiness triggers)

| Item | Notes |
|------|-------|
| Workflow conditions on persistent attention | Not resolver insert |
| Readiness event hooks (`requirement_violated`) | Orchestration only |
| NA + work coherence testing | No duplication |

**Exit:** Optional auto-create — policy-gated, deduped, aggregated.

### Explicitly not in roadmap until creation model signed off

- Work Definition editor UX polish
- Cross-domain subject generalization
- Team ownership
- BOS autonomous create
- Attention/resolver INSERT paths

---

## 13. Scenario decision table

| Scenario | Create work? | How? | Dedupe / aggregation |
|----------|--------------|------|----------------------|
| Manual "Follow Up Family" | Yes | Immediate manual | `manual_ad_hoc` — warn if similar open |
| Tour date passed | Optional | Suggested default; auto if policy | `follow_up_after_tour` · one_per_subject |
| Missing program interest | Optional | Suggested; auto if policy | `collect_missing_information` · aggregate_gaps |
| Outstanding balance | Optional | Suggested; auto if policy | `resolve_outstanding_balance` · one_per_subject_per_period |
| 250 missing program interest | No auto bulk | NA queue awareness | Per-subject only if policy + dedupe |
| Weekly director checklist | Yes | Recurrence mandatory | one_per_assignee_per_period · checklist |
| Workflow vendor accepted | Yes | Automatic workflow | one_per_subject · workflow idempotency |
| BOS "you should follow up" | On apply | Task Assist / modal | Definition key if picked |
| Readiness evaluator | **No** | — | — |
| Attention resolver | **No** | — | — |

---

## 14. Open decisions (product sign-off before Work Definitions)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Default signal-driven mode | Suggested vs automatic | **Suggested**; automatic opt-in per definition |
| 2 | Manual ad hoc dedupe | Warn vs none | **Warn** when similar open exists |
| 3 | Bulk gap auto-create | Allow vs forbid | **Forbid** — NA at scale, work per subject |
| 4 | Checklist item refresh | On new gaps while open | **Refresh items** — don't second instance |
| 5 | `period_key` for non-recurring | Optional vs required for billing | **Required** for collection-cycle definitions |
| 6 | Cross-definition dedupe | Strict vs independent | **Independent** — different keys = different obligations |
| 7 | Operator override of dedupe | Block vs warn | **Warn only** |
| 8 | Attention trigger wiring | Resolver vs workflow | **Workflow/listener** — never resolver |
| 9 | Platform catalog vs org-custom keys | Platform first | **Platform keys + org enable/tune** |
| 10 | Proceed to Work Definitions Phase 2 | After this doc | **Yes** after §14 sign-off |

---

## Appendix A — Success criteria

| Criterion | Status |
|-----------|--------|
| Canonical creation model defined | Yes — §1 |
| Creation source matrix | Yes — §2 |
| Creation ownership model | Yes — §3 |
| Attention → Work relationship | Yes — §4 |
| Readiness → Work relationship | Yes — §5 |
| Automation → Work relationship | Yes — §6 |
| Recurring instantiation model | Yes — §7 |
| Duplicate prevention model | Yes — §8 |
| Aggregation model | Yes — §9 |
| Future Work Definition instantiation | Yes — §10 |
| BOS creation boundaries | Yes — §11 |
| Recommended roadmap | Yes — §12 |
| No implementation / schema / UI | Yes |
| Aligned with frozen doctrine stack | Yes |
| Builds on Operational Work V1 runtime | Yes |

---

*End of Operational Work Creation Model discovery sprint — Work Definitions implementation may begin after §14 sign-off.*
