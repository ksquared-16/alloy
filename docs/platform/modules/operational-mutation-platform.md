# Operational Mutation Platform

**Status:** Superseded — see [`business-process-execution-platform.md`](business-process-execution-platform.md) (canonical doctrine, July 2026).

This file is retained for historical reference. The Execution Runtime mechanics below remain accurate. The framing has been elevated: mutations are the engine underneath the Business Process Execution Platform, not the product name.

---

Every mutation an operator can perform in Alloy executes through this platform. Status changes, scheduling, enrollment, billing, documents, and communications share one runtime, one event shape, and one projection contract.

---

## Why this exists

Alloy is not a CRM. Operators do not edit records. Operators perform **operational work** — and operational work consists of **decisions**. Some decisions mutate operational state. All mutations require the same governance: transition validation, required information, preview, and atomic commit.

Without a shared runtime:
- Each command builds its own validation logic
- Required information is duplicated across commands
- Projection refresh is inconsistent
- Readiness gates are bypassed or forgotten
- Audit trails diverge

---

## Mental model

```
Operator intent
  ↓
Operational Decision (DecisionIntent)
  ↓
Mutation Runtime
  ↓
Mutation Result
  ↓
Outbox event  →  projections / readiness / needs attention / automations / BOS
```

An **Operational Decision** is always created — even when the mutation is blocked. The decision is the audit record. The mutation result (committed or blocked) is the outcome.

---

## Mutation Runtime — four phases

### 1. Resolve

| Step | Resolves |
|------|---------|
| Command | Which registered command handles this intent |
| Subject | Which record, in which operational role |
| Domain | Which status domain this mutation operates on |
| Current state | Subject's current status in this domain |
| Available outcomes | Transitions structurally available from current state |

The runtime asks the **domain registry** for current state and available outcomes. It does not read raw database columns directly.

### 2. Evaluate

Evaluated in order. Fail fast — earlier failures skip later (more expensive) checks.

| Check | Owner | Failure mode |
|-------|-------|-------------|
| Structural validity | Status domain config | Hard block |
| Role authorization | Permission config | Hard block |
| Process gates | Business process config | Block or warn |
| Readiness | Readiness engine | Block or warn |
| Required information | Transition config | Collect or block |
| Warnings | Gates that warned | Surface in preview |
| Overrides | Permission config | Audited exception path |

**Readiness is first-class here** — not a minor rule. It drives queue membership, Needs Attention, KPIs, work visibility, and mutation gating. See [Readiness](#readiness).

### 3. Preview

Operator sees before committing:
- Current → target state
- Missing required information (form fields for only what remains after auto/BOS resolution)
- Warnings (non-blocking but visible)
- Side effects (tasks that will be created, communications queued, automations fired)
- Projection changes (what UI will refresh)
- What's next (next expected transition per lifecycle)

**Goal:** the operator should never be surprised by a mutation's consequences.

### 4. Commit

```
atomic write:
  state change on entity row
  + outbox record (canonical mutation event)
→ return MutationResult
→ optimistic UI update (command surface)
→ outbox processor emits event
→ downstream subscribers: projections, readiness, needs attention, automations, BOS
```

The state write and outbox record are one transaction. If either fails, neither commits. The system never has state without a corresponding event.

---

## Operational Decision / DecisionIntent

A **DecisionIntent** is the typed input to the mutation runtime.

| Field | Description |
|-------|-------------|
| `command_key` | Which command is being executed |
| `subject_id` | Record being acted on |
| `subject_type` | Entity grain (`opportunity`, `ocm`, `person`, etc.) |
| `domain` | Status domain (e.g. `lead_status`, `enrollment_status`) |
| `target_state` | Operator's intended target status |
| `context_payload` | Required information collected from operator |
| `operator_id` | Who triggered this |
| `origin` | `operator` \| `automation` \| `api` \| `system` |
| `override_reason` | Present only when an authorized override was used |

A decision record is written before execution. If the mutation is blocked, the decision record reflects the blocked outcome. This is the audit trail.

**Not every decision produces a mutation.** Observational decisions (acknowledge a warning, mark reviewed) create decision records without entering the mutation runtime.

---

## Mutation Result

Returned synchronously after phase 4.

| Field | Description |
|-------|-------------|
| `decision_id` | Links back to the decision record |
| `mutation_id` | Idempotency key |
| `status` | `committed` \| `blocked` \| `previewed` |
| `previous_state` | Status before mutation |
| `new_state` | Status after mutation |
| `effective_at` | When the state change takes effect (may be future) |
| `warnings_surfaced` | Non-blocking findings shown to operator |
| `side_effects` | Enumeration of downstream effects that will fire |
| `blocked_reason` | Present if status = `blocked` |

The command surface consumes MutationResult to update the UI optimistically before projection refresh arrives.

---

## Canonical Mutation Event (outbox)

Every committed mutation emits one canonical event via the outbox. **Shape:**

```
mutation_id         — idempotency key
decision_id         — links to decision record
subject_id
subject_type
subject_role        — operational role of subject (e.g. prospect, enrollee)
domain
previous_state
new_state
operator_id
operator_role
origin              — operator | automation | api | system
effective_at
committed_at
context_payload     — required information collected
override_reason     — null unless override used
```

**Outbox contract:**
- Written atomically with state change (same DB transaction)
- Processed asynchronously (at-least-once delivery)
- Subscribers are idempotent on `mutation_id`
- The mutation runtime does not call projections directly — it emits, projections subscribe

---

## Status Domain

There is no generic "Update Status." Every domain is explicitly typed.

| Domain key | Subject | Canonical field |
|---|---|---|
| `lead_status` | `opportunity` | `opportunities.status_key` |
| `enrollment_status` | `opportunity_customer_member` | `opportunity_customer_members.outcome_status_key` |
| `person_status` | `person` | `persons.status_key` |
| `account_status` | `customer` | `customers.status_key` |

Future domains (billing, attendance, document, schedule) are added to this registry — they do not need a new runtime.

**Domain registry owns:**
- Valid status values for the domain
- Allowed transition graph (from this status → these statuses)
- Stage membership for each status (derived — not stored on the entity)

**Domain registry does not own:**
- Process gates (those belong to business process config)
- Required information (belongs to transition config)
- Readiness definitions (belong to lifecycle config)

---

## Readiness

Readiness is a pre-mutation evaluation, not a post-mutation observation.

**During phase 2 (Evaluate):** the Readiness Engine checks whether the subject's full operational state satisfies the configured preconditions for the target transition. Returns `ready`, `not_ready_blocking`, or `not_ready_warning`.

**After mutation commits:** the Readiness Engine re-evaluates via event subscription. The result propagates to Needs Attention and Work Views.

**Readiness is not the same as Required Information:**
- Required information: fields needed to execute the mutation. Collected during phase 2→3.
- Readiness: the subject's operational fitness (prior work completed, related records in required states). Evaluated as a gate.

**Readiness Engine owns:** evaluation only. It does not create tasks, send notifications, or make decisions.

---

## Required Information

Required information belongs to the **transition**, not the command.

The transition `lead_status: qualified → tour_scheduled` owns its required fields. Any command that executes this transition must satisfy them. The command surface collects them; the transition evaluates them.

**Resolution order (before asking the operator):**
1. Auto-resolve from existing record state
2. BOS-resolve (BOS proposes or infers)
3. Operator-collect (only what remains)

**Resolution strategies per field per transition (in config):**
- `hard_block` — cannot proceed without it
- `soft_block` — warn if missing; authorized operator can override
- `auto_resolve` — pull from record or related records
- `bos_propose` — BOS suggests; operator confirms

---

## Command Surface

Every command uses the same seven-section surface:

1. **Subject context** — who, in what role, at what center
2. **Transition** — current → target (with available targets if operator chooses)
3. **Required information** — only what could not be auto/BOS resolved
4. **Warnings** — non-blocking, must be visible before confirm
5. **Side effects** — tasks, communications, automations that will fire
6. **Projection preview** — what UI changes (queue, Focus Panel, Work View)
7. **Confirmation** — a generated natural-language statement; submit button says the action

**Where mutations live:**
- Subject in Focus Panel → mutation executes inline in Focus Panel (no modal)
- Initiated from queue/list → side panel slides in from right
- Subject creation (Create Lead) → center dialog is acceptable; subject does not yet exist

Center-screen modals are eliminated for mutations on existing subjects. They break context.

---

## Projection Contract

The mutation runtime does not call projections. It emits the canonical event. Projections subscribe.

| Projection | Subscribes to |
|---|---|
| Queue counts | `MutationCommitted` where domain ∈ subscribed domains |
| Work Views | `MutationCommitted` where subject matches filter predicates |
| Focus Panel | `MutationCommitted` where subject_id = focused subject |
| Needs Attention | `ReadinessChanged` (emitted by Readiness Engine) |
| Operational Work / Tasks | `MutationCommitted`, `TaskCreated`, `TaskCompleted` |
| Analytics | All `MutationCommitted` events |

**UI consistency:** command surface applies optimistic update from `MutationResult` immediately. Projection subscription arrives within ~1s and converges. On conflict (failure, race), projection wins.

---

## BOS boundary

BOS owns: contextual recommendations, required information resolution under ambiguity, explanation of blocked transitions, post-mutation follow-up intelligence.

BOS does not own: rules, enforcement, blocking transitions, creating records.

**BOS is called at two points in the lifecycle:**
1. Phase 2 step 9b — BOS-resolve required information
2. Post-commit (async, via event) — BOS follow-up

BOS can recommend against a transition (surfaces in Warnings). The operator still decides. BOS never hard-blocks.

---

## Configuration ownership

| Owned by | Examples |
|---|---|
| Status domain config | Status value sets, allowed transition graph |
| Business process config | Stages, process gates, automatic transitions, side effect rules |
| Transition config | Required information per transition (fields + resolution strategies) |
| Lifecycle config | Readiness definitions per expected transition |
| Permission config | Role authorization per transition, override grants |
| Action definitions | Command declarations, surface placements, visibility rules |

Configuration owns the *what*. Runtime executes the *how*. BOS explains the *why*.

---

## Mutation categories

All categories share one runtime. Category differences are expressed through domain configuration, not separate runtimes.

| Category | Domain type | Example |
|---|---|---|
| Status | Status domain | Update Lead Status, Enroll Child |
| Assignment | Assignment domain | Assign Classroom, Assign Teacher |
| Scheduling | Time-space domain | Schedule Tour |
| Relationship | Relationship graph | Link Parent to Child |
| Financial | Billing domain | Create Billing Plan |
| Document | Document domain | Generate Agreement |
| Communication | Communication domain | Send Message |
| Processing | Processing workflow | Complete Attendance Session |

---

## Implementation sequence

1. **Mutation Runtime infrastructure** — lifecycle execution, atomic write + outbox, canonical event, domain registry stub
2. **Command Surface V2** — universal seven-section surface, works with any mutation
3. **Update Lead Status** — first real mutation; proves structural validity, process gates, required info, projection refresh
4. **Schedule Tour** — first mutation with meaningful required information (Tour Date); proves BOS-resolve and side effects
5. **Update Child Enrollment Status** — second domain; cross-domain process gates, readiness with real teeth
6. **Create Task** — proves side effect emission independently
7. **Send Message** — communication domain; template/recipient/channel as required information
8. **Generate Document** — document domain; signature as readiness gate
9. **Enroll Child** — integration milestone; all framework components active
10. **Assign Room** — resource/capacity domain; conflict detection

---

## Related

- `docs/platform/core/status-and-state-system.md` — status domain definitions
- `docs/platform/modules/actions-and-workflows.md` — action registry and event spine
- `docs/system/configuration-ownership-doctrine.md` — configuration plane ownership
- `docs/platform/governance/glossary.md` — canonical vocabulary
