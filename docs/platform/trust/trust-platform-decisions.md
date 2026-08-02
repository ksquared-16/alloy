---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Trust Platform Decisions

**Status:** Canonical Architectural Decision Record

This document records the permanent architectural decisions governing the Trust Platform.

Unlike implementation documents, these decisions are intended to remain stable across multiple generations of reasoning technology.

Implementation evolves.

Architecture should not.

---

## Purpose

Every platform eventually accumulates implementation pressure.

Small implementation shortcuts eventually become architectural debt.

This document exists to prevent that.

Before modifying the Trust Platform, engineers should first determine whether the proposed change violates one of these architectural decisions.

---

## Decision 001

### Trust Platform instead of AI Platform

#### Decision

Alloy introduces a Trust Platform rather than an AI Platform.

#### Rationale

Artificial intelligence is an implementation technology.

Trust is the architectural responsibility.

The platform governs trustworthy operational reasoning regardless of implementation.

#### Consequence

Future reasoning technologies integrate without architectural redesign.

---

## Decision 002

### Trust Runtime instead of Model Runtime

#### Decision

The Trust Runtime owns operational reasoning.

It does not own models.

#### Rationale

Providers and models evolve continuously.

Operational reasoning remains stable.

#### Consequence

Providers remain replaceable.

---

## Decision 003

### Decision Contracts are the universal interface

#### Decision

Every platform submits Decision Contracts.

#### Rationale

Capabilities should never communicate directly with reasoning providers.

#### Consequence

Every capability speaks one language.

---

## Decision 004

### Decision Packages are the universal output

#### Decision

The Trust Runtime always returns Decision Packages.

#### Rationale

Operational reasoning requires more than recommendations.

Decision Packages include:

- evidence
- trust
- validation
- economics
- alternatives

#### Consequence

No platform consumes raw provider output.

---

## Decision 005

### Truth and Knowledge remain separate

#### Decision

Truth and Knowledge are independent platform concepts.

#### Rationale

Truth changes continuously.

Knowledge evolves intentionally.

Mixing them destroys explainability.

#### Consequence

Operational reasoning remains reproducible.

---

## Decision 006

### Privacy precedes reasoning

#### Decision

Privacy transformation occurs before reasoning.

#### Rationale

Reasoning should consume only the minimum required information.

#### Consequence

Identity is introduced only when operationally necessary.

---

## Decision 007

### Deterministic reasoning is preferred

#### Decision

The runtime always selects deterministic reasoning whenever sufficient.

#### Rationale

Deterministic systems are cheaper, faster, more explainable, and easier to validate.

#### Consequence

Probabilistic reasoning exists only where uncertainty remains.

---

## Decision 008

### Validation is independent of reasoning

#### Decision

Validation never belongs to reasoning.

#### Rationale

Reasoning proposes.

Validation verifies.

Execution trusts validation—not reasoning.

#### Consequence

Provider improvements never change deterministic validation.

---

## Decision 009

### Trust is independent of confidence

#### Decision

Confidence and Trust remain separate.

#### Rationale

A highly confident recommendation may still be operationally unsafe.

Trust evaluates:

- evidence
- privacy
- validation
- governance
- economics

#### Consequence

Operational decisions never depend upon confidence alone.

---

## Decision 010

### Learning produces knowledge

#### Decision

Operational Learning never writes directly into runtime behavior.

Learning produces Learning Candidates.

Learning Candidates become Knowledge Assets through promotion.

#### Rationale

Platform evolution should remain governed.

#### Consequence

Learning remains explainable and reviewable.

---

## Decision 011

### Graduation is preferred over permanent reasoning

#### Decision

Every successful reasoning should seek deterministic replacement.

#### Rationale

Reasoning is operational debt.

Deterministic capability is operational maturity.

#### Consequence

The Trust Platform becomes less dependent upon probabilistic reasoning over time.

---

## Decision 012

### Providers are implementation details

#### Decision

Providers never appear in platform contracts.

#### Rationale

Capabilities depend upon reasoning.

Reasoning depends upon providers.

Platforms never depend upon providers.

#### Consequence

Changing providers never changes platform architecture.

---

## Decision 013

### One reasoning runtime

#### Decision

The Trust Runtime is the only reasoning runtime inside Alloy.

#### Rationale

Independent reasoning systems fragment governance.

#### Consequence

Every capability shares one reasoning infrastructure.

---

## Decision 014

### Execution belongs to the execution authorities, not to reasoning

**Amended 2026-08-02.** Supersedes the original wording, "Objective Runtime remains the only execution runtime". See Decision 022.

#### Decision

The Trust Platform never executes operational work.

Durable operational mutation belongs to **Operational Commands and Business Process Execution**. The **Objective Platform** coordinates objectives where an outcome spans obligations and contributions; it is not the general execution runtime.

#### Rationale

Execution already has an owner, and in Alloy that owner is the registered command path. The Objective Platform is an orchestration layer that explicitly owns no business truth, so it cannot be the universal execution runtime.

#### Consequence

Trust proposes, with evidence. A Decision Package is never directly executable.

---

## Decision 015

### Records remain the only operational truth

#### Decision

Reasoning never produces truth.

Execution produces truth.

#### Rationale

Recommendations remain proposals until executed.

#### Consequence

Operational truth remains authoritative.

---

## Decision 016

### Human judgment remains outside the platform

#### Decision

The Trust Platform supports judgment.

It never replaces accountability.

#### Rationale

Organizations remain responsible for policy, ethics, and operational exceptions.

#### Consequence

Decision Packages inform judgment.

They never eliminate it.

---

## Decision 017

### Every recommendation must be reproducible

#### Decision

Historical recommendations must always be reproducible.

#### Rationale

Audit, compliance, and operational learning require deterministic replay.

#### Consequence

Knowledge, strategies, and runtime versions are preserved.

---

## Decision 018

### Platform before implementation

#### Decision

Implementation must conform to platform doctrine.

Platform doctrine never conforms to implementation convenience.

#### Rationale

Architectural consistency compounds over time.

#### Consequence

Doctrine changes require architectural review.

Implementation shortcuts do not.

---

## Decision 019

### The Reasoning Boundary

**Ratified 2026-08-02 by the architecture owner, resolving the scope ambiguity in Law 1.**

#### Decision

The Trust Platform owns reasoning that is **probabilistic, interpretive, generative, semantic, inferential, or otherwise uncertainty-reducing**, and that produces a proposal or a Decision Package.

The Trust Platform does **not** absorb deterministic domain evaluation, eligibility enforcement, deterministic business validation, authorization, stage resolution, readiness evaluation, operational calculations, or business rules owned by existing Alloy platforms.

The [`Reasoning Boundary Test`](./trust-platform-manifesto.md#reasoning-boundary-test) decides ownership.

#### Rationale

Read without a boundary, "no capability may implement independent reasoning outside the Trust Platform" plus "deterministic" as a listed Reasoning Strategy would pull every certified deterministic evaluator in Alloy into the Trust Runtime — and would contradict Decision 008, which holds validation independent of reasoning.

#### Consequence

A deterministic strategy executed inside an explicitly submitted Decision Contract is valid Trust Runtime execution.

An existing deterministic evaluator moves into the Trust Runtime only when a capability submits a Decision Contract for it. Determinism alone never triggers migration.

---

## Decision 020

### Decision Package immutability and lineage

**Ratified 2026-08-02, resolving the conflict between stated immutability and a stated post-creation lifecycle.**

#### Decision

A Decision Package is immutable **at creation**.

Presented, accepted, rejected, overridden, executed and observed outcomes are **append-only events or observations referencing** the package.

A materially modified recommendation creates a **new Decision Contract and a new Decision Package**, with lineage to the previous package.

No mutable post-creation lifecycle state may be placed on the Decision Package row.

#### Rationale

Auditability, replay and reproducibility all require that a historical package never changes. A lifecycle column on the package row would silently defeat all three.

#### Consequence

Persistence is insert-only for contracts and packages, with a separate append-only observation store. Immutability is enforced in the database, not by service convention.

---

## Decision 021

### Canonical V1 runtime order

**Ratified 2026-08-02, resolving three mutually inconsistent orderings across three canonical documents.**

#### Decision

```text
Decision Contract
→ resolve required truth and context
→ classify information
→ apply privacy transformations
→ retrieve authorized knowledge
→ select strategy
→ execute reasoning
→ deterministic validation
→ trust evaluation
→ Decision Package
```

Knowledge **metadata** may be resolved earlier for planning and budgeting. Knowledge **content** enters the reasoning context only after privacy preparation.

#### Rationale

`trust-platform.md`, `trust-runtime.md` and `reasoning-runtime.md` each stated a different position for knowledge retrieval relative to privacy transformation, and each declared its lifecycle changeable only by architectural review. An implementer could not choose.

#### Consequence

`trust-platform.md`, `trust-runtime.md`, `reasoning-runtime.md` and `privacy-runtime.md` are normalized to this order.

---

## Decision 022

### Ownership of validation, trust evaluation and execution

**Ratified 2026-08-02, resolving three declared owners for trust evaluation and an execution-runtime naming collision.**

#### Decision

| Concern | Owner |
|---|---|
| Proposal generation and confidence | Reasoning Runtime |
| Deterministic business validation rules | The existing domain or platform validator that owns the rule |
| Validation orchestration | Trust Runtime Validation Engine — calls those validators, owns no duplicate rules |
| Trust Vector and Trust Score semantics | Trust Governance |
| Trust evidence assembly | Trust Runtime |
| Durable operational mutation | Operational Commands / Business Process Execution |
| Objective coordination | Objective Platform |

A Decision Package is **evidence** supporting a human decision, an Objective, or a registered command invocation. It is never directly executable.

#### Rationale

Alloy's standing law is one canonical owner per concern. The corpus assigned trust evaluation to three owners, described Validation as both an internal engine and a peer runtime, and named the Objective Runtime as the universal executor — but Alloy's Objective Platform owns no business truth and is not the general execution runtime.

#### Consequence

Language asserting that the Trust Runtime owns all deterministic evaluators, that the Trust Engine independently owns trust evaluation, or that the Objective Runtime directly executes Decision Packages is retired throughout the corpus. There is no separate Validation Runtime.

---

## Future Decisions

New architectural decisions should be added only when they change permanent platform behavior.

Temporary implementation decisions belong in sprint documentation.

---

## Related Documents

- [`Trust Philosophy`](./trust-philosophy.md)
- [`Trust Platform Manifesto`](./trust-platform-manifesto.md)
- [`Trust Runtime`](./trust-runtime.md)
- [`Platform Integration`](./platform-integration.md)
- [`Platform Handbook`](../foundation/alloy-platform-handbook.md)
- [`Platform Decisions`](../foundation/platform-decisions.md) (Alloy-wide register)

---

## When This Document Must Be Updated

Only when permanent architectural decisions governing the Trust Platform change.

Implementation details, providers, models, and runtime optimizations never require modification.
