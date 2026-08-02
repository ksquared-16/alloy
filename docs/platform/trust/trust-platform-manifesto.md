---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Trust Platform Manifesto

**Audience:** Platform architects, engineers, product designers, and AI systems.

**Role:** This document defines the constitutional laws governing the Trust Platform.

Unlike implementation documents, these laws are intended to remain stable regardless of implementation, provider, model, or technology.

Every future Trust Platform capability must satisfy these principles.

---

## Purpose

The Trust Platform exists to provide trustworthy operational reasoning across Alloy.

Its purpose is not to make decisions.

Its purpose is to produce trustworthy recommendations that reduce uncertainty while preserving operational truth.

The Trust Platform is the cognitive infrastructure of Alloy.

---

## Constitutional Laws

### Law 1 — The Trust Platform Owns Reasoning

Reasoning has one owner.

No capability may implement independent reasoning outside the Trust Platform.

Processing, BOS, Communications, Search, Operational Intelligence, Configuration, and future platforms all consume Trust Platform reasoning.

#### What "reasoning" means

The Trust Platform owns reasoning that is **probabilistic, interpretive, generative, semantic, inferential, or otherwise uncertainty-reducing**, and that produces a proposal or a Decision Package.

The Trust Platform does **not** absorb deterministic domain evaluation, eligibility enforcement, deterministic business validation, authorization, stage resolution, readiness evaluation, operational calculations, or business rules owned by existing Alloy platforms. Those keep their existing owners.

#### Reasoning Boundary Test

Apply in order. The first clause that matches decides ownership.

| # | Question | If yes |
|---|----------|--------|
| 1 | Does the operation **change durable operational state**? | It belongs to the registered command, Business Process Execution, or Objective execution authority. Never to the Trust Platform. |
| 2 | Does it **apply authoritative rules or calculate known truth**? | It stays with its existing deterministic owner. |
| 3 | Does it **resolve ambiguity or produce a proposal under uncertainty**? | It belongs to the Trust Platform and must be expressed as a Decision Contract. |

A deterministic strategy executed inside an explicitly submitted Decision Contract is valid Trust Runtime execution.

An existing deterministic evaluator does **not** move into the Trust Runtime merely because reasoning has one owner. It moves only when a capability submits a Decision Contract for it.

---

### Law 2 — Truth Is Never Owned By Reasoning

Operational truth belongs exclusively to the Records Platform.

The Trust Platform reasons over truth.

It never creates truth.

Recommendations never become authoritative facts until executed through the Objective Platform.

---

### Law 3 — Execution Is Never Owned By Reasoning

The Trust Platform never performs operational execution.

Durable operational mutation belongs to **Operational Commands and Business Process Execution**. The **Objective Platform** coordinates objectives where an outcome spans obligations and contributions; it is not the general execution runtime.

A Decision Package is **evidence** supporting a human decision, an Objective, or a registered command invocation. It is never directly executable.

Reasoning and execution remain permanently separated.

---

### Law 4 — Every Recommendation Is A Decision Package

The Trust Platform never returns raw model output.

Every reasoning operation produces a structured Decision Package containing:

- recommendation
- evidence
- confidence
- trust evaluation
- validation results
- economic metadata
- privacy metadata
- alternatives when appropriate

Every consuming platform receives the same artifact.

---

### Law 5 — Every Decision Begins With A Decision Contract

Every reasoning request must declare its operational intent before reasoning begins.

Decision Contracts define:

- desired outcome
- decision class
- context
- information requirements
- validation requirements
- privacy requirements
- economic constraints

Reasoning never begins without an explicit contract.

---

### Law 6 — Information Must Be Minimized

The Trust Platform should use the smallest amount of information required to produce a trustworthy recommendation.

Information is requested progressively.

Identity is introduced only when operationally required.

Privacy is achieved through minimization rather than concealment.

---

### Law 7 — Knowledge Is Separate From Truth

Truth represents organization-specific operational facts.

Knowledge represents generalized understanding.

Truth belongs to organizations.

Knowledge belongs to the platform.

The Trust Platform never converts customer truth into generalized knowledge without explicit operational learning.

---

### Law 8 — Every Recommendation Must Be Explainable

Every Decision Package must explain:

- why the recommendation exists
- what evidence supports it
- which policies influenced it
- which uncertainty remains

Recommendations that cannot be explained are operationally incomplete.

---

### Law 9 — Deterministic Reasoning Is Preferred

Whenever deterministic reasoning can produce a trustworthy result, deterministic reasoning shall be preferred.

Probabilistic reasoning exists only where uncertainty cannot be eliminated deterministically.

---

### Law 10 — The Platform Must Learn

Operational learning exists to improve future reasoning.

Learning produces:

- generalized patterns
- deterministic rules
- reusable knowledge
- improved strategies

Learning never stores customer identity as platform knowledge.

---

### Law 11 — Every Reasoning Must Seek Its Own Deterministic Replacement

The ultimate goal of reasoning is to reduce future dependence upon probabilistic reasoning.

Successful reasoning should eventually become deterministic whenever operationally appropriate.

The Trust Platform continuously attempts to graduate reasoning into executable knowledge.

---

### Law 12 — Humans Remain Accountable

The Trust Platform assists human judgment.

It never replaces accountability.

Organizations remain responsible for:

- policy
- ethics
- legal authority
- operational exceptions
- approval where required

---

### Law 13 — Trust Is Measurable

Trust is an operational property.

Every Decision Package should be evaluated across measurable dimensions including:

- grounding
- privacy
- evidence
- validation
- reliability
- economics
- human oversight

**Trust Governance owns Trust Vector and Trust Score semantics** — the dimensions, their meaning, and their thresholds. The Trust Runtime assembles the evidence those semantics are applied to.

Trust evaluation has exactly one owner.

Trust is continuously improved.

---

### Law 14 — Provider Independence Is Mandatory

The Trust Platform shall remain independent of:

- AI providers
- model vendors
- prompting techniques
- retrieval technologies
- embedding systems
- future reasoning implementations

Reasoning techniques evolve.

Platform architecture remains stable.

---

### Law 15 — The Platform Owns Decision Infrastructure, Not Artificial Intelligence

Artificial intelligence is one implementation of reasoning.

The Trust Platform governs trustworthy operational reasoning regardless of how reasoning is performed.

Future reasoning systems should integrate without changing platform architecture.

---

### Law 16 — One Platform, One Runtime

The Trust Platform owns:

- Decision Contracts
- Decision Packages
- Knowledge retrieval
- Privacy transformation
- Reasoning orchestration
- Validation orchestration (deterministic business validation remains owned by domain validators)
- Operational learning
- Trust governance

No parallel reasoning runtime may exist.

---

## Consequences

Every future reasoning capability inside Alloy must be expressible using the Trust Platform's primitives.

New capabilities extend the platform.

They do not redefine it.

---

## Relationship To Other Platforms

| Platform | Owns |
|----------|------|
| Records Platform | Truth |
| Relationship Platform | Identity |
| Trust Platform | Reasoning |
| Objective Platform | Execution |
| Business Process Platform | Operational Work |
| Operational Intelligence Platform | Measurement |

Each platform has one owner.

Each responsibility exists exactly once.

---

## Stability

This document is constitutional.

Changes require architectural review.

Implementation convenience is never sufficient justification for changing constitutional law.

---

## Related Documents

- [`Trust Philosophy`](./trust-philosophy.md)
- [`Trust Platform`](./trust-platform.md)
- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Decision Packages`](./decision-package.md)
- [`Trust Platform Decisions`](./trust-platform-decisions.md)
- [`Platform Decisions`](../foundation/platform-decisions.md) (Alloy-wide register)

---

## When This Document Must Be Updated

Only when the constitutional principles governing operational reasoning fundamentally change.

This document is expected to remain stable for many years.
