---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Plan & Operational Commit

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). Defines the two structural primitives of the Planning Runtime: the **Operational Plan** (the object an operator experiments on) and the **Operational Commit** (the one-way door into truth).

---

## 1. Operational Plan

### 1.1 Definition

An **Operational Plan** is a named, addressable bundle of **proposed L2 Intent deltas**, in `proposed` standing, that has not been committed and writes no authoritative truth. It is the unit of experimentation.

```
Plan {
  id, grain (e.g. "room×day"), scope (site, date range),
  base: { intentVersion, configVersion },      // what "current" it forks from
  deltas: ProposedDelta[],                      // the proposed changes
  standing: draft | proposed | reviewed | approved | committed,
  provenance: { author, source: operator|bos|import, createdFrom },
  simulation?: SimulationResult                 // cached, non-authoritative
}
```

A **ProposedDelta** is a typed, plugin-declared change (Scheduling: `place_child`, `move_child`, `set_schedule_pattern`, `adjust_days`, `assign_staff`, `float_staff`, `open_room_day`, `close_room_day`). Deltas are declarative — *what should be true* — not imperative mutations.

### 1.2 Why a Plan is not a new authoritative store

The Plan **reuses the `proposed`-standing substrate that already exists** for Operational Expectations (`web/lib/operationalExpectations/standing/`, `ratification/`) plus a thin envelope that groups deltas and records provenance. This matters for doctrine:

- **Law: proposed state and committed state stay separate.** A Plan is *definitionally* the "proposed" side of that law made into a first-class, manipulable object. ([`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md))
- **Law 2: projections are derived / non-authoritative.** The Plan's `simulation` is a recomputable cache, never a system of record. ([`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md))
- **No universal store.** Like Facts (per RFC D3, facts live in domain-owned stores; `workflow_events` is only the event log), the Plan envelope is a lightweight coordinating object, not a new authoritative table competing with `child_placements`/`schedule_assignments`.

### 1.3 Plan lifecycle (the ratified vocabulary)

Plans move through the **already-ratified commitment vocabulary** (RFC D5): `draft → proposed → reviewed → approved → committed → posted → voided → reversed`.

| Standing | Meaning | Who moves it |
|----------|---------|--------------|
| `draft` | Being authored; not yet shared | Operator / BOS |
| `proposed` | Shared for consideration; simulated | Operator / BOS |
| `reviewed` | Consequences examined; conflicts surfaced | Operator |
| `approved` | Cleared for commit (may require authority) | Operator with authority |
| `committed` | Written to L2 Intent via supersede | **Commit primitive** |
| `voided` / `reversed` | Withdrawn / undone-by-supersede | Operator with authority |

The transition `approved → committed` is the **Operational Commit** (§2). Everything before it is disposable and consequence-free.

### 1.4 Branching and comparison

Multiple Plans may fork the same base. This is what lets an operator *"safely experiment before committing operational change"*:

- **Branch** — hold N candidate Plans against the same current state (e.g. "Room A vs Room B vs delay-one-day" for placing a child).
- **Compare** — diff their `SimulationResult`s side by side (occupancy, ratio headroom, labor delta, commercial delta, conflict count).
- **Discard** — a Plan that is never committed leaves no trace in truth. This is the safety property.

Branching is the substrate Optimization ([`operational-optimization.md`](./operational-optimization.md)) generates *into*: an optimization run produces candidate Plans, ranked.

---

## 2. Operational Commit

### 2.1 Definition

**Operational Commit** is the single, explicit, atomic, auditable act that converts an `approved` Plan into **committed L2 Intent** via effective-dated supersede — after which the normal L2 → L3 → L4 → L5 pipeline takes over. It is the one-way door between Planning and Execution.

### 2.2 Commit is the generalization of `approve_enrollment`

Alloy **already has exactly one Operational Commit, hardcoded to enrollment.** The `approve_enrollment` handoff converts the OCM enrollment *proposal* into committed `child_placements` / `schedule_assignments` rows ([`placement-system.md`](../core/placement-system.md); code: `web/lib/childcareOperational/enrollmentAgreementHandoff.ts`, `materializeEnrollmentFromProcessInstance.ts`). It:

- reads a proposal (the "plan"),
- creates or reuses the agreement,
- converts the latest valid proposal into committed placement/schedule rows,
- emits partial-handoff warnings without silently dropping data.

**The discovery is that this is a *reusable primitive wearing enrollment's clothes*.** Commit lifts it out: any Planning plugin declares its **commit target** (§7 of the platform doc), and Commit runs the same shape — read Plan deltas → validate → write effective-dated committed Intent → emit events.

### 2.3 Commit reuses the Preview→Commit engine

Commit does not invent transactional machinery. It runs on the **BPR Execution Runtime's four phases** — `Resolve → Evaluate → Preview → Commit` ([`business-process-execution-platform.md`](../modules/business-process-execution-platform.md)):

- **Resolve / Evaluate** — validate every delta against L1 config (ratio rules, capacity ceilings, schedule validity) using the same resolvers Execution uses (`web/lib/childcareOperational/config/resolveConfigRule.ts`, `capacity/resolveOperationalCapacity.ts`).
- **Preview** — the final pre-commit projection: current → target, side effects, conflicts. *"The operator is never surprised by an action's consequences."* This is the same Preview the operator has been reading throughout Simulation — Commit just re-runs it authoritatively at the moment of writing.
- **Commit** — one atomic `MutationResult` writing all deltas, with a `mutation_events` outbox entry. Queues, needs-attention, and work views **subscribe** to the event; Commit never calls them.

### 2.4 Commit writes Intent, never Facts

A committed Plan writes **L2 Intent** (`schedule_assignments`, `child_placements`), never L4 Facts. This preserves the ratified boundary: *"The Planning plane reads L3 and L4; it never authors L4."* After commit, the child *is scheduled* (Intent); whether they *attended* (Fact) is authored later by an Attendance Action. Billing still derives from the Fact, not the committed Intent (Law 3).

### 2.5 Commit is reversible by supersede, not deletion

Rollback is a **new effective-dated commit** that restores the prior state — never an in-place edit or delete. This obeys *"never overwrite operational history; corrections are new effective-dated rows"* (Law 4; `web/lib/childcareOperational/effectiveDating.ts`). The timeline of a room/child is therefore a complete, auditable ledger of every committed plan. `schedule_assignments.status` already carries `planned/active/ending/ended/superseded/canceled` — the supersede lifecycle is built.

### 2.6 Approval and authority

Commit may require **authority** (an operator with the right to commit this grain/scope). The Operational Expectations ledger already models authorities (`operational_authorities`, `_authority_assignments`) and ratification (`operational_expectation_ratifications`). Commit reuses this: `approved → committed` can be gated by an authority check and recorded as a ratification, giving Planning approval, audit, and provenance for free.

---

## 3. The commit contract (per-plugin)

| Contract element | Scheduling |
|------------------|-----------|
| **Commit target tables** | `schedule_assignments`, `child_placements` (effective-dated) |
| **Validation resolvers** | ratio (`resolveRatio.ts`), capacity (`resolveOperationalCapacity.ts`), config (`resolveConfigRule.ts`) |
| **Blocking vs warning** | hard: capacity ceiling breach, invalid pattern; warning: ratio tightening, missing pattern (partial handoff) |
| **Provenance FK** | `enrollment_agreement_id` on the placement/assignment chain |
| **Reversal** | new effective-dated supersede row; `status = superseded` on prior |

---

## 4. What this is NOT

- Not a new transaction system — it is BPR Preview→Commit.
- Not a delete/patch model — it is effective-dated supersede.
- Not a fact-authoring path — it writes Intent; Execution authors Facts.
- Not enrollment-specific — `approve_enrollment` is the first instance, not the definition.

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime and the four primitives.
- [`operational-simulation.md`](./operational-simulation.md) — what the operator reads before Commit.
- [`../core/placement-system.md`](../core/placement-system.md) — the committed Intent foundation and `approve_enrollment` handoff.
- [`../modules/business-process-execution-platform.md`](../modules/business-process-execution-platform.md) — the Preview→Commit engine and outbox.
- [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) — the four laws and commitment vocabulary.
