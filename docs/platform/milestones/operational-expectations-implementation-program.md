---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — Implementation Program

**Execution index and mobilization guide — derived from and subordinate to the canonical
[Engineering Realization](./operational-expectations-engineering-realization.md) corpus.**

> This document is an execution index derived from the canonical Operational Expectations Engineering
> Realization document. It does **not** redefine architecture, package contracts, ownership, gates,
> migration semantics, or rollout rules. Where any ambiguity exists, the
> [Engineering Realization](./operational-expectations-engineering-realization.md) document governs.

This is a **control page**, not a doctrine document. Every authoritative definition lives in the
Engineering Realization corpus and is **referenced by section**, never restated as independent
authority.

---

## 1. Authority hierarchy (binding)

```
Frozen architecture documents           (system design · doctrine convergence · closeout)
        ↓
Engineering Realization                 (single authoritative implementation contract)
        ↓
Implementation Program / Execution Index (this document — summarize · sequence · index · operationalize)
        ↓
Package implementation threads
```

This program may **summarize, sequence, index, and operationalize** the Engineering Realization
document. It must not redefine packages, restate contracts as independent authority, or create
alternative readiness criteria, gates, risks, or ownership boundaries. **Where the program and the
realization overlap, the realization governs.**

**Governing rule (binding on every implementation thread):**
> Implementation threads may not modify architecture.

Ambiguity escalates to the corpus ([Engineering Realization §22](./operational-expectations-engineering-realization.md));
no thread creates a local architectural interpretation; a thread chooses techniques only within its
declared Internal Implementation Freedom
([Realization §13](./operational-expectations-engineering-realization.md)).

---

## 2. Program status

```
Platform Discovery:      Complete
Architecture:            Frozen
Engineering Realization:  Approved
Platform Realization:    Open
Current Package:         P0
```

The corpus is merged to `staging` (PR #188, merge commit `7f8c545e8`). Operating mode is **Platform
Realization** — execute the frozen architecture; preserve boundaries, ownership contracts, gates,
migration/rollout strategy, backward compatibility, and the implementation constraints
([Realization §18](./operational-expectations-engineering-realization.md)). Discovery is not revisited;
the platform is not redesigned.

---

## 3. Program overview

**Philosophy — prove, then propagate.** Prove the one generalized engine on an already-shipped consumer
(Billing / D12a) before building any net-new consumer; nothing downstream of the keystone (P3) begins
until **G-Parity** is green. **Cadence is certification-paced, not calendar-paced** — a package is done
only when its checklists are complete and its gate(s) are green, and gates are standing CI invariants
(a regressed gate blocks the next package). Rollout is shadow-first and flag-gated; migration is
additive-then-cutover and never history-mutating. The authoritative treatment is
[Realization §1 · §6 · §8](./operational-expectations-engineering-realization.md).

---

## 4. Critical path

```
P0 → P1 → P3(keystone) → P4 → P6         (longest hard chain; staff P1 & P3 heaviest)
       └► P2 ┘  (P2 ∥ P3-skeleton after P1; converge at the parity step)
   after P3+P4 green → Lane A: P5  ∥  Lane B: P7  ∥  Lane C: P4-hardening → P6 → P8 (last)
```

- **P3 is the hard serialization point** — no downstream package starts until **G-Parity** is green.
- Billing retrofit = the P3 keystone (parity proof, first consumer). Scheduling composition proof and
  Current Work evolution land at the P5/P6 stage. AI (P8) is last and owns no operational state.
- The **authoritative dependency graph and build order** are
  [Realization §17 (Integration Dependency Matrix)](./operational-expectations-engineering-realization.md)
  and [§15 (Engineering Build Order)](./operational-expectations-engineering-realization.md). This
  diagram is an index into them, not a second matrix.

---

## 5. Readiness dashboard

Readiness **state** only — every definition is owned by the referenced Realization section.

| Package | Readiness | Blocking gate or dependency | Authoritative contract |
|---|---|---|---|
| **P0** | **Ready Now** | none (DAG root; corpus merged) | [Realization §13 · P0](./operational-expectations-engineering-realization.md) |
| P1 | Needs prerequisite | P0 + **G-Reconciliation** | [Realization §13 · P1](./operational-expectations-engineering-realization.md) |
| P2 | Blocked by dependency | P1 (tuple grammar) | [Realization §13 · P2](./operational-expectations-engineering-realization.md) |
| P3 | Blocked by dependency | P1 + P2 + Consumption V1 oracle | [Realization §13 · P3](./operational-expectations-engineering-realization.md) |
| P4 | Blocked by certification | **G-Parity** green | [Realization §13 · P4](./operational-expectations-engineering-realization.md) |
| P5 | Blocked by dependency | P3 + P4 | [Realization §13 · P5](./operational-expectations-engineering-realization.md) |
| P6 | Blocked by dependency | P5 + P4 | [Realization §13 · P6](./operational-expectations-engineering-realization.md) |
| P7 | Blocked by dependency | P2 + P4 | [Realization §13 · P7](./operational-expectations-engineering-realization.md) |
| P8 | Blocked by dependency | P1 + P5 + X0 | [Realization §13 · P8](./operational-expectations-engineering-realization.md) |

**X0 (Security · Standing · Ratification)** is **cross-cutting**, delivered inside P1 and P8 — **not** a
standalone late hardening phase ([Realization §13 · X0](./operational-expectations-engineering-realization.md)).

Only **P0 is Ready Now**; every other package is gated by design (the dependency graph is the schedule).

---

## 6. Synchronization checkpoints

Program-wide barriers; all threads reconcile at each:

1. **G-Reconciliation** (after P0) — before any ledger code.
2. **P1 public-interface freeze** — before P2/P3 attach to the tuple grammar / standing model.
3. **G-Parity** (after P3) — the program-wide barrier: **no downstream thread proceeds until green.**
4. **P3/P4 interface freeze** — before the parallel lanes branch.
5. **P6 convergence** — Lanes A + B rejoin before Current Work integration.
6. **Final rollout gates** — per-consumer cutover flags certify before the old path is retired.

Gate definitions and evidence are authoritative in
[Realization §5 · §17](./operational-expectations-engineering-realization.md).

---

## 7. Threading strategy

- **Centralized / serialized (do not parallelize):** **P0, P1, P3** — the foundation trunk and the
  keystone define the substrate, the Stable Public Interfaces, and the proven engine every other thread
  depends on. One coordinated thread, strongest engineers.
- **Parallel only after the keystone:** after **P3 + P4 green**, fan into **Lane A (P5) ∥ Lane B (P7) ∥
  Lane C (P4-hardening)** — disjoint code over frozen P3/P4 interfaces — reconverging at **P6**, with
  **P8** last.
- **Package threads pause at certification boundaries** — a thread merges only when its checklists are
  complete and its gate(s) are green; a downstream thread does not start until its upstream gate is
  green.
- **Implementation ambiguity escalates to the corpus** — never resolved by a local interpretation.

The authoritative build order and branch points are
[Realization §15](./operational-expectations-engineering-realization.md).

---

## 8. Next action

```
Next authorized implementation package: P0
P0 implementation has not started.
```

P0 begins in a separate implementation thread. Its scope, checklists, and completion definition are
authoritative in [Realization §13 · §19 · P0](./operational-expectations-engineering-realization.md).
This program authorizes no runtime change and starts no package here.

---

## 9. Index of authoritative references

This program **does not** duplicate the following; consult the Engineering Realization document directly:

| Concern | Authoritative source |
|---|---|
| Package interface contracts | [Realization §13 — Package Interface Contracts](./operational-expectations-engineering-realization.md) |
| Ownership boundaries | [Realization §14 — Ownership Boundaries](./operational-expectations-engineering-realization.md) |
| Engineering build order | [Realization §15 — Engineering Build Order](./operational-expectations-engineering-realization.md) |
| Canonical proofs | [Realization §16 — Canonical Proofs](./operational-expectations-engineering-realization.md) |
| Integration dependency matrix | [Realization §17 — Integration Dependency Matrix](./operational-expectations-engineering-realization.md) |
| Forbidden during implementation | [Realization §18 — Forbidden During Implementation](./operational-expectations-engineering-realization.md) |
| Engineering checklists (readiness/complete/cert/migration/rollout) | [Realization §19 — Engineering Checklists](./operational-expectations-engineering-realization.md) |
| Implementation risk register | [Realization §20 — Implementation Risk Register](./operational-expectations-engineering-realization.md) |
| Milestones · certification matrix · migration · rollout | [Realization §4 · §5 · §6 · §8](./operational-expectations-engineering-realization.md) |
| Frozen architecture · ontology · laws · §A resolutions | [System design](../core/operational-expectations-system-design.md) |

---

## When this program must be updated

- Implementation evidence updates a package's **readiness state**, a checkpoint's status, or the current
  package — recorded here without altering any architectural meaning.
- The realization plan changes a package, dependency, gate, or contract (only through architecture
  governance, [Realization §22](./operational-expectations-engineering-realization.md)) — this index is
  re-pointed, never a source of the change.
- **This program never modifies the frozen architecture and never overrides the realization plan.** Any
  contradiction it surfaces is escalated to the corpus.

## Cross-references

- [Engineering realization plan](./operational-expectations-engineering-realization.md) — **the single
  authoritative implementation contract**; this program is its subordinate execution index.
- [System design](../core/operational-expectations-system-design.md) — frozen architecture, packages, gates.
- [Architecture closeout](./operational-expectations-architecture-closeout.md) — the freeze.
- [Documentation governance](../governance/documentation-governance.md) — freeze policy + status vocabulary.
