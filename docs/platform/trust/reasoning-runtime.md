---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Reasoning Runtime

**Status:** Canonical Platform Runtime

The Reasoning Runtime is responsible for transforming prepared operational context into trustworthy operational recommendations.

It is the execution engine of the Trust Platform.

The runtime owns reasoning.

It never owns truth.

It never owns execution.

---

## Core Rule

Reasoning is a bounded attempt to reduce operational uncertainty.

The runtime never attempts to replace operational truth.

The runtime never executes operational changes.

The runtime produces Decision Packages.

---

## Runtime Purpose

The Reasoning Runtime answers one question:

> Given this Decision Contract and this prepared reasoning context, what recommendation best satisfies the operational objective?

Everything else is implementation.

---

## Runtime Position

```text
Decision Contract

↓

Information Classification

↓

Privacy Runtime

↓

Authorized Knowledge Retrieval

↓

Reasoning Runtime

↓

Decision Package

↓

Execution authority  ·  registered command · Business Process Execution · Objective
```

The runtime consumes prepared information.

The runtime never retrieves operational information directly.

---

## Runtime Responsibilities

The runtime owns:

- reasoning orchestration
- strategy selection
- provider selection
- execution planning
- confidence estimation
- proposal generation
- explanation generation
- evidence assembly for trust evaluation

The runtime never owns:

- retrieval
- privacy
- validation
- execution
- learning promotion
- operational truth
- Trust Vector and Trust Score semantics

---

## Runtime Lifecycle

Every reasoning execution follows the same lifecycle.

```text
Prepared

↓

Strategy Selection

↓

Capability Resolution

↓

Execution

↓

Proposal Generation

↓

Evidence Assembly

↓

Confidence Evaluation

↓

Trust Evaluation

↓

Decision Package
```

The lifecycle is provider independent.

---

## Strategy Selection

The runtime never chooses providers directly.

It first selects a Reasoning Strategy.

Examples:

- Deterministic
- Rule Evaluation
- Knowledge Retrieval
- Classification
- Matching
- Summarization
- Planning
- Explanation
- Vision
- Language Reasoning

Only after a strategy has been selected does provider resolution occur.

---

## Capability Resolution

Reasoning capabilities are platform concepts.

Examples:

- Document Understanding
- Identity Matching
- Operational Planning
- Communication Drafting
- Policy Interpretation
- Blueprint Generation
- Forecasting

Capability resolution determines:

- required strategy
- required providers
- expected outputs
- validation policy

Capabilities remain provider independent.

---

## Provider Resolution

Providers satisfy capabilities.

Examples:

- Anthropic
- OpenAI
- Google
- Local Model
- Deterministic Engine
- Future Providers

Providers never appear inside Decision Contracts.

Providers never appear inside Decision Packages.

Provider selection remains entirely internal.

---

## Reasoning Execution

Execution consists of one or more Reasoning Steps.

Examples:

```text
Knowledge Retrieval

↓

Classification

↓

Matching

↓

Explanation

↓

Proposal
```

Each step is independently observable.

---

## Reasoning Graphs

Complex reasoning composes multiple Reasoning Steps.

Example.

```text
Document

↓

OCR

↓

Field Extraction

↓

Classification

↓

Identity Matching

↓

Proposal
```

Each node:

- Produces evidence.
- Can fail independently.
- Can be replayed.
- Can be replaced.

Reasoning Graphs are immutable.

---

## Confidence

Confidence estimates statistical certainty.

Confidence belongs to individual reasoning results.

Confidence never determines execution.

Confidence is one input into Trust evaluation.

---

## Trust Evaluation

Trust evaluation occurs after reasoning.

The Reasoning Runtime owns **proposal generation and confidence**, and supplies the evidence trust evaluation consumes. [`Trust Governance`](./trust-governance.md) owns the Trust Vector and Trust Score semantics — the dimensions, their meaning and their thresholds.

Trust considers:

- Grounding
- Evidence
- Privacy
- Validation
- Historical Reliability
- Economic Cost
- Human Oversight

Trust remains separate from confidence.

---

## Failure Handling

Reasoning failures never produce operational mutations.

Supported outcomes include:

- Unable To Reason
- Insufficient Information
- Conflicting Knowledge
- Provider Failure
- Budget Exceeded
- Privacy Restriction
- Validation Failure

Failures remain Decision Packages.

Execution never occurs.

---

## Replay

Reasoning is replayable.

Replay supports:

- Knowledge updates
- Policy changes
- Runtime upgrades
- Audit
- Compliance
- Historical reproduction

Replay never modifies historical Decision Packages.

Replay produces new Decision Packages.

---

## Runtime Invariants

The runtime guarantees:

- Provider independence.
- Deterministic strategy selection.
- Complete observability.
- Replayability.
- Reproducibility.
- Immutable reasoning history.
- Reasoning never mutates truth.

---

## Frozen Decisions

- Reasoning consumes prepared context.
- Reasoning never performs retrieval.
- Reasoning never performs validation.
- Reasoning always produces Decision Packages.
- Reasoning remains provider independent.
- Reasoning strategies remain replaceable.

---

## Anti-Patterns

Never:

- Call providers directly from capabilities.
- Select providers before selecting strategy.
- Treat prompts as platform primitives.
- Allow reasoning to retrieve arbitrary data.
- Execute directly from reasoning.
- Treat confidence as operational approval.

---

## Relationship To Other Runtimes

| Runtime / owner | Responsibility |
|----------|----------------|
| Privacy Runtime | Prepares reasoning context |
| Reasoning Runtime | Produces proposals and confidence |
| Validation Engine (Trust Runtime) | Orchestrates deterministic validation; domain validators own the rules |
| Trust Governance | Owns Trust Vector and Trust Score semantics |
| Operational Commands / Business Process Execution | Perform durable mutation |
| Objective Platform | Coordinates objectives |

Each responsibility has exactly one owner.

There is **no separate Validation Runtime**. Validation is an engine of the [`Trust Runtime`](./trust-runtime.md) that calls validators owned elsewhere.

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Decision Packages`](./decision-package.md)
- [`Privacy Runtime`](./privacy-runtime.md)
- [`Operational Learning`](./operational-learning.md)
- [`Trust Governance`](./trust-governance.md)
- [`Reasoning Deployment Strategy`](./reasoning-deployment-strategy.md)

---

## When This Document Must Be Updated

Update only when:

- Reasoning lifecycle changes.
- Runtime ownership changes.
- Reasoning strategy model changes.
- Capability model changes.

Provider changes never require modification.
