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

### Objective Runtime remains the only execution runtime

#### Decision

The Trust Platform never executes operational work.

#### Rationale

Execution already has an owner.

#### Consequence

Trust Platform determines.

Objective Platform executes.

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
