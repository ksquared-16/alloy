---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Decision Contracts

**Status:** Canonical Platform Specification

A **Decision Contract** is the universal interface between every Alloy platform and the Trust Runtime.

Every request for reasoning begins with a Decision Contract.

No platform performs operational reasoning without creating one.

---

## Purpose

A Decision Contract defines **what decision needs to be made**.

It does **not** define:

- how reasoning occurs
- which model is used
- which provider executes reasoning
- how recommendations are generated

Those responsibilities belong to the Trust Runtime.

The Decision Contract exists to describe the decision—not its implementation.

---

## Why Decision Contracts Exist

Without Decision Contracts every platform would independently determine:

- what information to retrieve
- what privacy policy applies
- what reasoning should occur
- which model to use
- what validation is required

Decision Contracts centralize these concerns.

Every capability speaks one language.

---

## Fundamental Principle

A Decision Contract represents uncertainty.

It asks:

> "Given this operational situation, what trustworthy recommendation should be produced?"

It never asks:

> "Ask AI this question."

Reasoning implementation is intentionally absent.

---

## Contract Structure

Every Decision Contract contains six logical sections.

```text
Intent

↓

Decision

↓

Information

↓

Constraints

↓

Success

↓

Lifecycle
```

---

## Intent

Intent describes why reasoning is required.

Examples:

- Determine subsidy eligibility
- Classify uploaded document
- Recommend enrollment stage
- Generate communication
- Match existing family
- Explain operational policy
- Produce blueprint proposal

Intent is always operational.

General conversation is not a Decision Contract.

---

## Decision Class

Every Decision Contract belongs to one Decision Class.

Decision Classes determine runtime behavior.

Examples include:

- Identity
- Classification
- Matching
- Communications
- Scheduling
- Compliance
- Financial
- Planning
- Forecasting
- Explanation
- Configuration

Each Decision Class defines:

- required evidence
- privacy requirements
- validation policies
- trust thresholds
- learning policy
- economic policy

---

## Context

Context describes the operational environment.

Examples:

- organization
- business process
- stage
- current objective
- operator role
- permissions
- location
- time
- active record

Context is never inferred.

Platforms provide context explicitly.

---

## Information Requirements

The contract specifies what information is required.

Not what is available.

Example:

Requires:

- child age
- requested program
- household income

Does Not Require:

- parent name
- phone number
- address

The runtime retrieves only required information.

---

## Knowledge Requirements

Knowledge is retrieved independently of operational truth.

Examples:

- organizational policies
- subsidy handbook
- enrollment handbook
- licensing rules
- pricing rules
- platform guidance

Decision Contracts request knowledge categories.

They never reference storage.

---

## Privacy Requirements

Every Decision Contract declares privacy expectations.

Examples:

- Identity Required
- Identity Optional
- Identity Prohibited
- Customer Information Restricted
- Knowledge Only
- Platform Default

The Privacy Runtime determines implementation.

---

## Validation Requirements

The contract specifies deterministic validation expectations.

Examples:

- Required
- Optional
- Human Review
- Compliance Review
- Financial Validation
- Relationship Validation

Validation always occurs after reasoning.

---

## Economic Constraints

Decision Contracts define operational budgets.

Examples:

- Maximum latency
- Maximum cost
- Preferred strategy
- Escalation policy
- Retry policy
- Background execution

These influence Reasoning Strategy selection.

---

## Success Criteria

Every contract declares success.

Examples:

- Recommendation produced
- Confidence threshold achieved
- Evidence available
- Validation passed
- Decision Package complete

The runtime knows when execution is complete.

---

## Decision Contract Lifecycle

Every contract follows the same lifecycle.

```text
Created

↓

Accepted

↓

Prepared

↓

Executing

↓

Validated

↓

Packaged

↓

Completed

↓

Archived
```

Contracts are immutable after execution begins.

Changes create a new contract.

---

## Immutability

Decision Contracts are immutable.

Reasons:

- Reproducibility
- Auditability
- Versioning
- Learning
- Replay

Updated information always produces a new Decision Contract.

A materially modified recommendation also produces a new Decision Contract, whose Decision Package carries **lineage** to the previous package.

---

## Runtime Ownership

Platforms own creation.

The Trust Runtime owns execution.

Platforms never manipulate Decision Contracts after submission.

---

## Extension

Platforms extend the Trust Runtime by defining new Decision Classes.

Platforms never modify the Decision Contract specification.

Extension points include:

- Decision Classes
- Knowledge Providers
- Validation Policies
- Learning Policies
- Reasoning Strategies

The contract itself remains universal.

---

## Relationship To Decision Packages

Decision Contracts are inputs.

Decision Packages are outputs.

```text
Decision Contract

↓

Trust Runtime

↓

Decision Package
```

One completed Decision Contract always produces one Decision Package.

---

## Examples

### Processing

Intent:

Determine subsidy eligibility.

Decision Class:

Compliance.

Knowledge:

State regulations.

Validation:

Required.

---

### Communications

Intent:

Generate enrollment reminder.

Decision Class:

Communications.

Knowledge:

Organization communication policy.

Validation:

Optional.

---

### Search

Intent:

Find operational subject.

Decision Class:

Matching.

Knowledge:

Identity resolution policy.

Validation:

Required.

---

### BOS

Intent:

Create enrollment lead.

Decision Class:

Classification.

Knowledge:

Organization enrollment policy.

Validation:

Required.

---

## Platform Guarantees

Every Decision Contract guarantees:

- explicit intent
- explicit context
- explicit information requirements
- explicit privacy expectations
- deterministic validation
- reproducible execution
- provider independence

---

## Invariants

Decision Contracts never contain:

- Prompt text
- Provider names
- Model identifiers
- API parameters
- Embedding references
- Implementation details

They remain stable regardless of reasoning technology.

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Packages`](./decision-package.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- [`Privacy Runtime`](./privacy-runtime.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)

---

## When This Document Must Be Updated

Update only when:

- Decision Contract semantics change
- lifecycle changes
- runtime ownership changes
- extension model changes

Provider or model changes never require modification.
