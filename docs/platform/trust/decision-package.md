---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Decision Packages

**Status:** Canonical Platform Specification

A **Decision Package** is the immutable output of the Trust Runtime.

Every completed Decision Contract produces exactly one Decision Package.

Decision Packages are the **only** artifact returned from the Trust Runtime.

No platform consumes raw AI output, prompts, provider responses, or intermediate reasoning.

---

## Core Rule

The Trust Runtime never returns answers.

It returns **Decision Packages**.

Every operational capability inside Alloy consumes Decision Packages rather than directly consuming reasoning.

Decision Packages are the boundary between reasoning and execution.

---

## Why Decision Packages Exist

Operational reasoning is incomplete without context.

A recommendation alone cannot safely drive execution.

Every operational recommendation must also communicate:

- why it exists
- what evidence supports it
- how trustworthy it is
- what uncertainty remains
- what validation occurred
- what alternatives were considered
- what operational cost was incurred

The Decision Package standardizes this information.

---

## Mental Model

```text
Decision Contract

↓

Trust Runtime

↓

Decision Package  ·  evidence

↓

Human Judgment

↓

Registered command · Business Process Execution · Objective

↓

Execution
```

The Trust Runtime owns the package.

An execution authority consumes the package as **evidence**. The package is never itself executable.

The Records Platform records the resulting truth.

---

## Ownership

| Concern | Owner |
|---------|-------|
| Recommendation | Trust Runtime |
| Evidence | Trust Runtime |
| Confidence | Trust Runtime |
| Trust Evaluation | Trust Runtime |
| Validation Results | Trust Runtime |
| Human Decision | Operator / Organization |
| Trust Vector and Trust Score semantics | Trust Governance |
| Deterministic business validation rules | Owning domain validator |
| Execution | Operational Commands / Business Process Execution |
| Objective coordination | Objective Platform |
| Operational Truth | Records Platform |

---

## Canonical Structure

Every Decision Package contains the following logical sections.

```text
Recommendation

↓

Evidence

↓

Trust

↓

Validation

↓

Economics

↓

Alternatives

↓

Learning
```

---

## Recommendation

The recommendation represents the best operational proposal produced by the Trust Runtime.

Examples:

- Create new family
- Match existing family
- Subsidy likely eligible
- Recommend waitlist placement
- Send communication
- Approve blueprint

Recommendations remain proposals until accepted.

---

## Evidence

Evidence explains why the recommendation exists.

Evidence may include:

- authoritative records
- policies
- knowledge assets
- deterministic rules
- operational observations
- supporting documents

Evidence must be reproducible.

---

## Confidence

Confidence measures statistical certainty.

Confidence does **not** measure operational trust.

Those concepts remain intentionally separate.

---

## Trust Vector

Every Decision Package contains a Trust Vector.

Example dimensions:

| Dimension | Purpose |
|-----------|----------|
| Grounding | Was authoritative truth used? |
| Privacy | Was unnecessary information avoided? |
| Evidence | Is the recommendation explainable? |
| Validation | Did deterministic validation succeed? |
| Reliability | Historical recommendation quality |
| Human Oversight | Required review level |

The Trust Vector supports Trust Score calculation.

---

## Validation

Validation records deterministic verification performed after reasoning.

Examples:

- policy validation
- relationship validation
- financial validation
- workflow validation
- identity validation
- business rule validation

Validation is deterministic.

Reasoning is not.

The distinction is intentional.

---

## Economics

Every Decision Package records operational economics.

Examples:

- execution latency
- reasoning strategy
- provider cost
- token usage
- cache utilization
- escalation decisions

Economics support platform optimization.

---

## Alternatives

When operationally appropriate, Decision Packages may contain alternative recommendations.

Examples:

- Primary Recommendation
- Alternative A
- Alternative B

The runtime determines when alternatives are useful.

---

## Learning Metadata

Decision Packages carry learning metadata declared **at creation** — which learning policy applies, and whether this decision is eligible to produce Learning Candidates.

Outcomes — accepted, rejected, modified, overridden, deferred — are **observations referencing the package**, never fields on it. Operational Learning consumes the package together with its observation stream.

Customer information never becomes learning.

Only generalized operational outcomes.

---

## Lifecycle

A Decision Package is **immutable at creation**. It therefore carries no lifecycle column and no post-creation mutable state.

What follows creation is an **append-only stream of observations referencing the package**:

```text
Decision Package  ·  immutable
        │
        ├── observed: presented
        ├── observed: accepted | rejected | overridden
        ├── observed: executed   (by an execution authority)
        └── observed: outcome
```

Observations are recorded by `CaptureOutcome()`. They never modify the package.

A **materially modified recommendation is not an edit.** It creates a new Decision Contract and a new Decision Package, carrying lineage to its predecessor.

Do not place presented, accepted, rejected, overridden, executed or observed state on the Decision Package row.

---

## Immutability

Decision Packages are permanent operational artifacts.

Reasons:

- auditability
- replay
- explainability
- learning
- reproducibility

Historical Decision Packages are never modified.

---

## Human Judgment

Decision Packages support judgment.

They never replace judgment.

Organizations remain responsible for:

- operational exceptions
- ethical decisions
- legal responsibility
- policy interpretation
- final approval where required

---

## Runtime Guarantees

Every Decision Package guarantees:

- complete recommendation
- supporting evidence
- deterministic validation
- reproducibility
- provider independence
- explainability
- auditability

---

## Extension Model

Platforms may extend Decision Packages through structured metadata.

Platforms may not:

- change package semantics
- remove required sections
- bypass validation
- replace recommendations with raw provider output

---

## Frozen Decisions

The following decisions are permanent.

- Every Decision Contract produces exactly one Decision Package.
- Decision Packages are immutable **at creation**; outcomes are append-only observations referencing them.
- A materially modified recommendation creates a new Decision Contract and a new Decision Package with lineage to its predecessor.
- Raw provider responses never leave the Trust Runtime.
- Confidence and Trust remain separate concepts.
- Validation is deterministic, and its rules are owned by domain validators.
- A Decision Package is evidence, never a directly executable instruction.

---

## Anti-Patterns

Never:

- Execute directly from model output.
- Store prompts as operational artifacts.
- Return provider-specific payloads.
- Skip deterministic validation.
- Treat confidence as trust.
- Mutate Decision Packages after creation.
- Place post-creation lifecycle state on a Decision Package row.
- Execute directly from a Decision Package.

---

## Relationship To Other Platforms

| Platform | Relationship |
|----------|--------------|
| Trust Runtime | Produces Decision Packages |
| Trust Governance | Owns Trust Vector and Trust Score semantics |
| Operational Commands / Business Process Execution | Execute, using an approved Decision Package as evidence |
| Objective Platform | Coordinates objectives where an outcome spans obligations |
| Records Platform | Records resulting truth |
| Operational Intelligence | Measures package quality |
| Operational Learning | Learns from package outcomes |

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- [`Privacy Runtime`](./privacy-runtime.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)
- [`Operational Learning`](./operational-learning.md)

---

## When This Document Must Be Updated

Update only when:

- Decision Package semantics change
- runtime guarantees change
- lifecycle changes
- platform ownership changes

Provider implementations never require updates to this specification.
