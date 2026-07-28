---
owner: modules
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Business Process Execution Platform

**Status:** Canonical doctrine — Business Process Execution Platform (July 2026).

**Supersedes:** `operational-mutation-platform.md` (archived; content incorporated here).

---

## Core realization

Operators do not update statuses. Operators perform **operational work**.

Statuses are the durable state produced by operational actions — nothing more. Actions are not derived from statuses. Actions are evaluated within business process context. Business Processes are the primary operational model.

This distinction governs every platform decision that follows.

---

## Architecture

```
CONFIGURED LAYER
──────────────────────────────────────────────
Business Process
  └── Stage
        ├── grain
        ├── surface references
        ├── candidate actions (with recommendation levels)
        ├── entry conditions
        ├── exit conditions
        └── readiness expectations

Action Definition
  ├── [platform-defined] key, subject_type, execution_type
  └── [tenant-configured] label, icon, placement, visibility, recommended stages

RUNTIME LAYER
──────────────────────────────────────────────
Stage Resolver
  "Given this subject, which stage is it in?"
  → current stage + evaluated action set

Action Evaluator
  "Is this action Ready / Recommended / Warning / Blocked / Unavailable here?"
  → per-action status + reason

Subject Resolver
  "Which subjects does this action apply to?"
  → eligible subject list + selection spec

Execution Runtime (4-phase)
  Resolve → Evaluate → Preview → Commit
  → MutationResult

DATA LAYER
──────────────────────────────────────────────
Durable State         entity fields (including status_key)
Outbox                mutation_events (canonical event per commit)
Projections           queue membership, needs attention, work views
```

The runtime does not know which Business Process is active. It receives a `DecisionIntent` and executes it. Process gates, readiness, and required information are resolved during phase 2 by calling configured evaluators — the runtime calls them; it does not hard-code them.

---

## Platform constructs

### Business Process

The primary configured unit of operational work. Operators navigate from the workspace landing to a business process, then work records through its stages.

A Business Process defines:

| Field | Description |
|-------|-------------|
| `key` | Machine identifier |
| `label` | Operator-facing name (e.g. "Enrollment Process") |
| `entity_types` | Which entity types are subjects |
| `stages` | Ordered list of stage configs |
| `command_set_v1` | **Sole target process-wide Command selection** (P6.S1). Typed Capability keys + enabled/variant/policy metadata. Legacy stage catalogs remain compatibility inputs until migrated. |
| `candidate_actions` | **Legacy / doctrinal alias** for process-wide selection — prefer `command_set_v1` in code |
| `surface_refs` | Default surface references |

A Business Process does **not** own status values. It does not define allowed statuses. Status is an entity field; the process is an operational context.

---

### Stage

A stage is where operators **work a cohort of records** with shared expected actions and readiness expectations.

A Stage defines:

| Field | Description |
|-------|-------------|
| `key` | Machine identifier |
| `label` | Operator-facing name (e.g. "Waitlist") |
| `grain` | `family \| child \| household \| case` |
| `entry_conditions` | Conditions that place a subject in this stage |
| `exit_conditions` | Conditions that move a subject out |
| `candidate_actions` | Ordered list of actions with recommendation levels (**recommendation/evaluation only** once `command_set_v1` is present — cannot create process selection) |
| `surface_refs` | `queue_surface_key`, `focus_surface_key`, `header_surface_key` |
| `readiness_expectations` | What must be true for subjects at this stage |
| `operating_plan` | Purpose, expected work, success criteria |

Stages **do not** define status. Entry conditions may reference status (e.g. `outcome_status_key in ['waitlisted']`) but the stage is not a status — it is an operational context that may span multiple statuses or none.

**Grain is declared at the stage level.** A single business process can contain stages at different grains. The queue built for a stage uses the stage's grain, not a work-unit default.

---

### Status

Status is a **durable state field** on an entity row.

| Grain | Storage field |
|-------|--------------|
| Case | `opportunities.status_key` |
| Child enrollment | `opportunity_customer_members.outcome_status_key` |
| Person | `persons.status_key` |
| Account | `customers.status_key` |

**Status owns nothing.** It does not own queue behavior, actions, work, readiness, or dashboards. Those come from configured processes.

Status can be referenced in stage entry/exit conditions, action visibility rules, and readiness expectations. In those contexts it is an input to evaluation — not the driver.

All operator-facing status changes pass through the Execution Runtime. The runtime produces the state change; the status field records the result.

---

### Action

An action is a **platform-defined operational capability**.

**Platform defines (in code / seed data):**
- `key` — machine identifier, stable across tenants
- `subject_type` — what entity grain this operates on
- `execution_type` — `mutation_command | form | workflow | observation`
- `execution_config` — handler reference, RPC, form key, or workflow ID

**Tenant configuration defines (in `action_definitions` table):**
- `label` — display name (operators never see internal key)
- `icon`, `style` — visual treatment
- `placement` — which surfaces show this action
- `visibility_rules` — condition-based show/hide
- `confirmation_wording` — custom confirmation statement
- `recommended_stages` — which stages show this as Recommended vs Ready

The runtime **never** depends on the displayed label. All execution paths use the `key`.

Examples of platform-defined capabilities:

```
create_lead           subject: case
schedule_tour         subject: case
confirm_tour          subject: case
update_lead_status    subject: case
waitlist_child        subject: child enrollment
offer_placement       subject: child enrollment
enroll_child          subject: child enrollment
pause_enrollment      subject: child enrollment
withdraw_child        subject: child enrollment
close_lead            subject: case
archive_lead          subject: case
```

---

### Action Evaluation

Actions do not disappear because of stage. They are **evaluated** within the current process context.

Every action returns one of five states:

| State | Meaning | UI treatment |
|-------|---------|-------------|
| **Recommended** | Expected at this stage, all preconditions met | Highlighted in primary surface |
| **Ready** | Available and executable, not the recommended next step | Available in action list |
| **Warning** | Executable, but with advisory notices | Available with badge |
| **Blocked** | Cannot execute; reason is shown | Shown as disabled with explanation |
| **Unavailable** | Not applicable in this context | Hidden or collapsed |

This model allows operators to **expedite** (e.g. enroll a child who skipped the waitlist) while still enforcing business rules (e.g. placement confirmation required). The action is visible and explains its state — it doesn't silently disappear.

Evaluation inputs:
- Current stage candidate actions + recommendation levels
- Subject's current state
- Operator permissions
- Process gates (entry/exit conditions, business rules)
- Readiness expectations
- Required information availability

---

### Subject Resolution

Actions declare their subject type. The runtime resolves actual subjects.

When an action applies to a context with multiple eligible subjects (e.g. "Withdraw Child" on a household with three children), the runtime presents **subject selection** before entering the execution flow:

```
Withdraw Child
─────────────────────────────
Apply to:
  ☑ Emma Kaplan (enrolled)
  ☐ Liam Kaplan (waitlisted)
  ☐ Noah Kaplan (waitlisted)

  or  Apply to all eligible children
```

Each selected subject goes through a full Resolve → Evaluate → Preview → Commit cycle. The preview consolidates results so the operator sees one confirmation for the batch.

Subject resolution modes (declared per action):
- `single` — action always applies to one explicit subject (most actions)
- `multi_select` — operator chooses from eligible subjects in context
- `all_eligible` — applies to all eligible subjects; operator confirms count

This is a first-class runtime capability, not a one-off UI pattern.

---

### Operational Work and Readiness

**Operational Work** is the discrete work expected of operators at a stage. Configured as work items, task templates, required information collections, and stage operating plans.

**Readiness** is the evaluation of whether a subject's full operational state satisfies the configured preconditions for a transition or stage advancement.

- **Work readiness** — are the required fields and prior work complete for this work item?
- **Action readiness** — are the preconditions met for this action to proceed?

Readiness is **pre-execution evaluation**, not a post-mutation observation. It feeds the Action Evaluator (producing Blocked vs Ready/Recommended). After a mutation commits, the Readiness Engine re-evaluates via event subscription and propagates the result to Needs Attention and Work Views.

**Readiness is not the same as Required Information:**
- Required information: fields needed to execute the mutation. Collected during phase 2→3 of the Execution Runtime.
- Readiness: the subject's operational fitness. Evaluated as a precondition gate.

---

### Surface

Surfaces are configured via **Surface Builder**. Business Processes and Stages reference surfaces by key — they do not define surfaces inline.

A stage declares surface references:

| Surface role | Reference key |
|---|---|
| Queue surface | `queue_surface_key` |
| Focus surface | `focus_surface_key` |
| Header surface | `header_surface_key` |
| Dashboard surface | `dashboard_surface_key` |

The platform does not introduce a second surface definition system. Surface Builder is the canonical surface authoring tool.

---

### Queue

Queues are configured per business process stage. The stage declares **grain** — the queue uses it.

| Stage | Grain |
|-------|-------|
| Enrollment Intake | family |
| Waitlist | child |
| Attendance | child |
| Billing | household |
| Family Summary | household |

Queue membership is evaluated by the Stage Resolver: given a subject, does it belong in this stage's queue? Entry conditions determine membership. Status may be one condition — it is not the only one, and it is not the definition.

---

## Execution Runtime

The Execution Runtime is the generic engine underneath Business Process Execution. It does not know which Business Process called it. It receives a `DecisionIntent` and runs four phases.

This is the platform that was previously named "Operational Mutation Platform." The name was technically accurate but developer-centric. It is the engine. Business Process Execution is the product.

### DecisionIntent

Typed input to the Execution Runtime:

| Field | Description |
|-------|-------------|
| `command_key` | Which registered command handles this intent |
| `subject_id` | Record being acted on |
| `subject_type` | Entity grain |
| `domain` | State domain (e.g. `lead_status`, `enrollment_status`) |
| `target_state` | Operator's intended target state |
| `context_payload` | Required information collected from operator |
| `operator_id` | Who triggered this |
| `origin` | `operator \| automation \| api \| system` |
| `override_reason` | Present only when authorized override was used |

### Phase 1 — Resolve

| Step | Resolves |
|------|----------|
| Command | Which registered handler processes this intent |
| Subject | Which record, in which operational role |
| Domain | Which state domain this action operates on |
| Current state | Subject's current state in this domain |
| Available outcomes | Transitions structurally available from current state |

The domain handler resolves current state. The runtime does not read raw entity columns directly.

### Phase 2 — Evaluate

Evaluated in order. Earlier failures skip later (more expensive) checks.

| Check | Failure mode |
|-------|-------------|
| Structural validity | Hard block |
| Role authorization | Hard block |
| Process gates | Block or warn |
| Readiness | Block or warn |
| Required information | Collect or block |
| Warnings | Surface in preview |
| Overrides | Audited exception path |

### Phase 3 — Preview

Operator sees before committing:
- Current → target state
- Missing required information
- Warnings (non-blocking but visible)
- Side effects that will fire
- What refreshes in the UI
- What's expected next

**Goal:** the operator is never surprised by an action's consequences.

### Phase 4 — Commit

```
atomic write:
  state change on entity row
  + mutation_events outbox record
→ return MutationResult
→ optimistic UI update (command surface)
→ outbox processor emits canonical event
→ downstream: projections, readiness, needs attention, automations, BOS
```

The state write and outbox record are one transaction. The system never has state without a corresponding event.

### MutationResult

Returned synchronously after phase 4.

| Field | Description |
|-------|-------------|
| `mutation_id` | Idempotency key |
| `status` | `committed \| blocked \| previewed` |
| `previous_state` | State before mutation |
| `new_state` | State after mutation |
| `warnings_surfaced` | Non-blocking findings shown to operator |
| `blocked_reason` | Present if status = `blocked` |
| `side_effects` | Enumeration of downstream effects that will fire |

### Canonical Mutation Event (outbox)

Every committed mutation emits one canonical event. Shape:

```
mutation_id         — idempotency key
subject_id
subject_type
domain
previous_state
new_state
operator_id
origin              — operator | automation | api | system
effective_at
committed_at
context_payload
override_reason     — null unless override used
```

Outbox contract:
- Written atomically with state change (same DB transaction)
- Processed asynchronously (at-least-once delivery)
- Subscribers are idempotent on `mutation_id`
- The Execution Runtime does not call projections directly — it emits; projections subscribe

### Domain Registry

There is no generic "Update Status" — not in the runtime, and not on operator surfaces. Every
domain is explicitly typed with its own handler, and operators reach it only through domain
verbs bound to stage outcomes (`waitlist_child`, `enroll_child`, `close_lead`, …). The
Enrollment Alignment sprint removed the operator-facing `update_status` / `update_enrollment_status`
actions; the typed domains below remain the internal mutation mechanism invoked by outcome execution.

| Domain key | Subject | Canonical field |
|---|---|---|
| `lead_status` | `opportunity` | `opportunities.status_key` (`open`\|`closed`) + `close_reason_key` |
| `enrollment_status` | `opportunity_customer_member` | `opportunity_customer_members.outcome_status_key` + `close_reason_key` |
| `stage` | `opportunity` / `opportunity_customer_member` | `stage_key` (moved by `move_to_stage` outcome targets only) |
| `person_status` | `person` | `persons.status_key` |
| `account_status` | `customer` | `customers.status_key` |

Future domains (billing, attendance, document, schedule) are added to the registry — not to a new runtime.

**Immutable isolation rule:** each domain handler reads and writes exactly one canonical field. `enrollment_status` never touches `opportunities.status_key`. `lead_status` never touches `opportunity_customer_members.outcome_status_key`. This is enforced at the RPC layer, not just convention.

---

## Command Surface

Every action uses the same seven-section surface:

1. **Subject context** — who, in what role, at what center
2. **Transition** — current → target
3. **Required information** — only what could not be auto/BOS resolved
4. **Warnings** — non-blocking; must be visible before confirm
5. **Side effects** — tasks, communications, automations that will fire
6. **Projection preview** — what UI changes
7. **Confirmation** — a generated natural-language statement; submit button says the action

Destructive delete via Command Runtime (`delete_lead`, P4.S3) additionally requires an authoritative
impact preview, server-derived typed confirmation, and a correlated preview token before commit.
Domain deletion semantics are unchanged (hard-delete opportunity graph; work units retained).

**Placement rules:**
- Subject is the Focus Panel subject → command renders inline in Focus Panel (no modal)
- Initiated from queue/list → side panel slides in from right
- Subject creation (e.g. Create Lead) → center dialog is acceptable; subject does not yet exist

Center-screen modals are eliminated for actions on existing subjects. They break operational context.

---

## BOS boundary

BOS owns: contextual recommendations, required information resolution under ambiguity, explanation of blocked transitions, post-action follow-up intelligence.

BOS does not own: rules, enforcement, blocking actions, creating records.

BOS is called at two points:
1. Phase 2 (Evaluate) — BOS-resolve for required information
2. Post-commit (async, via event) — BOS follow-up

BOS can recommend against a transition (surfaces in Warnings). The operator decides. BOS never hard-blocks.

---

## Configuration ownership

| Owned by | Examples |
|---|---|
| Domain config | State value sets, allowed transition graph, canonical field |
| Business process config | Stages, process gates, candidate actions, stage-action recommendation levels, surface refs |
| Stage config | Grain, entry/exit conditions, readiness expectations, operating plan |
| Action definition | Command key, subject type, execution type |
| Action placement | Surface, slot, tenant display config, visibility rules |
| Transition config | Required information per transition (fields + resolution strategies) |
| Readiness config | Preconditions per action/stage (field requirements, related record states) |
| Permission config | Role authorization per action, override grants |

Configuration owns the *what*. The Execution Runtime executes the *how*. BOS explains the *why*.

---

## Classification of V1 implementation

The sprint that built the Operational Mutation Platform V1 shipped substantial infrastructure. None of it should be discarded. This table classifies it correctly within the final architecture.

### Platform foundation — keep as-is

| Component | File / location | Classification |
|---|---|---|
| 4-phase executor | `web/lib/mutations/runtime.ts` | Generic Execution Runtime — foundation |
| DomainHandler interface | `web/lib/mutations/domainRegistry.ts` | Foundation — correct abstraction |
| Domain registry (`COMMAND_DOMAIN_MAP`) | `web/lib/mutations/domainRegistry.ts` | Foundation — will expand |
| DecisionIntent type | `web/lib/mutations/types.ts` | Foundation — keep |
| MutationResult type | `web/lib/mutations/types.ts` | Foundation — keep |
| `mutation_events` table + RLS | `20260630120000_*.sql` | Foundation — atomic outbox, keep |
| `execute_lead_status_mutation` RPC | `20260630120000_*.sql` | Foundation — correct atomicity |
| `execute_enrollment_status_mutation` RPC | `20260630140000_*.sql` | Foundation — correct atomicity |
| Lead status domain handler | `web/lib/mutations/domains/leadStatus.ts` | First production domain — keep |
| Enrollment status domain handler | `web/lib/mutations/domains/enrollmentStatus.ts` | Second production domain — keep |
| Drawer command panel registry | `web/lib/mutations/drawerCommandPanelRegistry.ts` | Foundation — right pattern for command dispatch |
| Action definitions + placements schema | `action_definitions`, `action_placements` tables | Foundation — correct configuration plane |
| `resolveActionsForContext` | `web/lib/admin/actions/resolveActionsForContext.ts` | Foundation — will become Stage Action Evaluator |
| UpdateLeadStatusPanel | `web/components/mutations/UpdateLeadStatusPanel.tsx` | Production V1 command surface |
| ChildEnrollmentStatusPanel | `web/components/mutations/ChildEnrollmentStatusPanel.tsx` | Production V1 command surface |
| POST `/api/admin/mutations/execute` | `web/app/api/admin/mutations/execute/route.ts` | Foundation — the execution API |

### Temporary proof — documented, not discarded

| Component | File | Temporary because | Path to production |
|---|---|---|---|
| `OCM_MUTATION_COMMAND_REGISTERED` gate | `OpportunityInquiryChildrenSection.tsx` | Checks domain registry, not `action_placements` | Per-row action resolution (Phase 2) |
| Row-level trigger button in children section | `OpportunityInquiryChildrenSection.tsx` | Not driven by resolved action set | Action Evaluator returns row-level actions (Phase 3) |

### Should move to configuration

| What | Currently | Target |
|---|---|---|
| `ENROLLMENT_READINESS_RULES` array | Hardcoded in `enrollmentStatus.ts` | DB-driven readiness config table (Phase 5) |
| `targetStatusKeys` in readiness rules | Hardcoded status key strings | Stage exit conditions reference in process config |
| Status options in panels (via `fetchEffectiveStatusDefinitions`) | Fetches all active status defs for entity type | Stage's configured transition set (long-term) |

---

## Projection contract

The Execution Runtime does not call projections. It emits the canonical event. Projections subscribe.

| Projection | Subscribes to |
|---|---|
| Queue membership | `MutationCommitted` where domain ∈ subscribed domains |
| Work Views | `MutationCommitted` where subject matches filter predicates |
| Focus Panel | `MutationCommitted` where subject_id = focused subject |
| Needs Attention | `ReadinessChanged` (emitted by Readiness Engine) |
| Operational Work | `MutationCommitted`, `TaskCreated`, `TaskCompleted` |
| Analytics | All `MutationCommitted` events |

**UI consistency:** command surface applies optimistic update from `MutationResult` immediately. Projection arrives within ~1s and converges. On conflict, projection wins.

---

## Implementation roadmap

### Phase 1 — Execution Runtime V1 (complete)

- 4-phase generic executor
- Lead status domain + command surface
- Child enrollment status domain + command surface
- `mutation_events` outbox
- `action_definitions` + `action_placements` seeded for both commands
- Drawer command panel registry
- POST `/api/admin/mutations/execute`

### Phase 2 — Per-row action resolution

**Unlocks:** `update_child_enrollment_status` becomes placement-configurable.

- Build per-row action fetch in `OpportunityInquiryChildrenSection`: `GET /api/admin/actions?surface=record_section&entity_type=opportunity_customer_member&entity_id=<ocm_id>&section_key=children`
- Remove `OCM_MUTATION_COMMAND_REGISTERED` hardcode
- Children section renders "Update status" button only when placement resolves it
- Disabling the `action_placements` row hides the button

### Phase 3 — Action Evaluation Model

**Unlocks:** stage-aware action surfacing; operators see why an action is blocked.

- Action Evaluator: given (action, subject, stage context) → `Ready | Recommended | Warning | Blocked | Unavailable`
- Stage-action linkage in business process config: candidate actions per stage with recommendation level
- `resolveActionsForContext` upgraded to return evaluation state, not just presence
- UI renders Blocked actions with reason (not silently hidden)

### Phase 4 — Subject Resolution

**Unlocks:** household/family-scoped actions, batch operations.

- Subject resolution modes declared per action: `single | multi_select | all_eligible`
- Command surface renders subject selection UI when multiple eligible subjects
- Batch preview consolidates results before confirmation

### Phase 5 — Readiness Configuration

**Unlocks:** operators configure readiness requirements without code changes.

- Move `ENROLLMENT_READINESS_RULES` from code to DB table (e.g. `action_readiness_rules`)
- Readiness Engine reads config, not hardcode
- Builder UI to configure required fields per action/stage

### Phase 6 — Schedule Tour (second domain)

**Proves:** time-space domain, required information collection, side effects, BOS-resolve.

- `schedule_tour` mutation command
- Scheduling domain handler
- Required information: tour date, time, assigned staff
- Side effects: calendar invite, confirmation message queued
- BOS-resolve for tour slot suggestions

### Phase 7 — Process Gates

**Unlocks:** stage entry/exit conditions enforced at runtime; automatic transitions.

- Stage entry/exit conditions fed into phase 2 (Evaluate)
- Exit condition met → automatic stage advancement (origin: `system`)
- Process gates produce Block or Warning in action evaluation

### Phase 8 — Generic Command Surface

**Unlocks:** any action type (form, workflow, observation) uses the same 7-section surface.

- Command surface decoupled from mutation-specific rendering
- Form-based actions render in section 3 (Required information)
- Workflow-triggering actions show side effect preview in section 5
- One surface pattern for the entire platform

---

## Related

- `docs/platform/core/business-process-system.md` — business process and stage doctrine
- `docs/platform/core/status-and-state-system.md` — status domain definitions
- `docs/platform/modules/actions-and-workflows.md` — action registry and event spine
- `docs/platform/governance/glossary.md` — canonical vocabulary
