# Canonical Status Architecture

**Status:** Phase 5 formal contract (June 2026)  
**Platform reference:** `docs/platform/core/status-and-state-system.md`

Status layers **must not be collapsed** into a single field. Each layer answers a different question.

---

## Layer definitions

### Business Process Stage

| Question | Where is this record in the operator journey? |
|----------|------------------------------------------------|
| Storage | Business Process config (`enrollment_pipeline` stages) |
| Runtime | Queue lane membership, stage operating plan |
| Mutable by | Stage transition rules, outcome picker, BP config |

**Not** the same as entity `status_key` — stages are journey steps; status keys are durable entity state.

---

### Business Status (case grain)

| Question | What is the enrollment case state? |
|----------|-------------------------------------|
| Storage | `opportunities.status_key` |
| Vocabulary | `status_definitions` (`entity_type = opportunities`) |
| Examples | new_inquiry, touring, follow_up, closed_won |
| Mutable by | Actions, workflows, bounded PATCH, stage bindings |

**Implemented:** Runtime reads `status_key` only. Legacy `opportunities.status` text deprecated.

---

### Person Status

| Question | What is this person's platform status? |
|----------|----------------------------------------|
| Storage | `persons.status_key` |
| Vocabulary | `status_definitions` (`entity_type = persons`) |
| Mutable by | Admin actions, PATCH |

---

### Household Status

| Question | What is the account/household status? |
|----------|---------------------------------------|
| Storage | `customers.status_key` |
| Vocabulary | `status_definitions` (`entity_type = customers`) |

---

### Child Enrollment Outcome Status

| Question | What is this child's enrollment outcome on this case? |
|----------|------------------------------------------------------|
| Storage | `opportunity_customer_members.outcome_status_key` |
| Vocabulary | `status_definitions` (`entity_type = opportunity_customer_members`) |
| Examples | new_inquiry, waitlisted, enrolling, enrolled, withdrawn |
| Mutable by | `update_enrollment_status`, enrollment actions |

**Critical:** Do not use case `opportunities.status_key` as every child's enrollment state.

---

### Readiness

| Question | Is required information complete for the next action? |
|----------|------------------------------------------------------|
| Storage | **None** — computed |
| Source | `evaluateCompletionRequirements`, lifecycle field_rules |
| Examples | Missing child first name before schedule_tour |

Readiness is **not** a status. Do not persist readiness as `status_key`.

---

### Needs Attention

| Question | Does an operator need to act on this record now? |
|----------|--------------------------------------------------|
| Storage | **None** — resolver output |
| Source | `resolveOpportunityAttention`, BOS recommendations |
| Examples | Stale follow-up, missing tour outcome |

Needs Attention is **not** a status.

---

### Current Work

| Question | What task is actively in progress? |
|----------|-----------------------------------|
| Storage | Operational tasks, work intents |
| Source | Task tables, stage spawn rules |

Distinct from enrollment outcome status.

---

### Task State

| Question | What is the state of an assigned task? |
|----------|----------------------------------------|
| Storage | Task / work item rows |
| Examples | open, in_progress, completed, cancelled |

---

### Workflow Run State

| Question | Where is this automation execution? |
|----------|-------------------------------------|
| Storage | `workflow_runs`, step execution tables |
| Examples | pending, running, completed, failed |

Orchestration only — not CRM business status.

---

### Mission / Objective

| Question | What is the operator or agent objective? |
|----------|------------------------------------------|
| Storage | BOS / assist context (session-scoped) |
| Examples | Review waitlist candidate, complete tour follow-up |

Ephemeral coordination — not durable entity status.

---

## Two-grain enrollment (frozen)

| Grain | Column | Scope |
|-------|--------|-------|
| Case | `opportunities.status_key` | Family coordination |
| Child enrollment | `OCM.outcome_status_key` | Per-child outcome |

---

## Read vs write contract

| Operation | Rule |
|-----------|------|
| Runtime read | `resolveCanonicalStatusKey`, `resolveOcmOutcomeStatusKey` — `status_key` / `outcome_status_key` only |
| Runtime write | `rejectLegacyTextStatusPatch` — blocks text `status` in PATCH bodies |
| Display | `status_definitions` labels via `resolveOpportunityStatusDisplay` — no legacy text fallback |
| Maintenance | `resolveLegacyStatusKeyWithTextFallback` — scripts/backfill only |

---

## Configuration surfaces

| Surface | Path |
|---------|------|
| Status definitions | Settings → Statuses |
| Stage ↔ status binding | Business Process builder |
| Transition rules | `status_transition_rules` |
| Enrollment status action | `update_enrollment_status` |

---

## Planned (not yet production-active)

- Lifecycle strict mode activation (readiness gates) — tooling shipped, activation deferred pending OCM QA.
- DB-level FK from `status_key` → `status_definitions` — deferred pending orphan cleanup.
