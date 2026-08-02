---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Knowledge Platform

**Status:** Canonical Platform Specification

The Knowledge Platform defines how Alloy represents, retrieves, versions, governs, and evolves operational knowledge.

Knowledge is a foundational platform object.

It is distinct from:

- operational truth
- customer data
- reasoning
- execution
- learning

Knowledge exists to provide reusable understanding that allows the Trust Runtime to produce trustworthy operational recommendations.

---

## Core Rule

Knowledge is never operational truth.

Knowledge explains reality.

Truth describes reality.

The distinction is permanent.

---

## Why the Knowledge Platform Exists

Operational reasoning requires more than records.

Examples:

- licensing regulations
- subsidy policies
- enrollment handbooks
- operational procedures
- tuition rules
- platform doctrine
- organizational policies

These are not customer records.

They are reusable operational knowledge.

Without a Knowledge Platform every capability invents its own storage, retrieval, versioning, and governance.

Knowledge therefore becomes platform infrastructure.

---

## Mental Model

```text
Truth

↓

Knowledge

↓

Reasoning

↓

Decision Package

↓

Execution

↓

Truth
```

Truth changes continuously.

Knowledge evolves intentionally.

Reasoning combines both.

---

## Knowledge Is Not Truth

Truth answers:

> What is?

Knowledge answers:

> What should this mean?

Example

Truth

```text
Child Age

18 months
```

Knowledge

```text
Children under two require...
```

Truth belongs to organizations.

Knowledge belongs to the platform.

---

## Knowledge Assets

Knowledge is represented through immutable Knowledge Assets.

Examples include:

- Policies
- Procedures
- Regulations
- Operational Manuals
- Employee Handbooks
- Subsidy Rules
- Provider Documentation
- Platform Doctrine
- Blueprint Templates
- Best Practices

Knowledge Assets are reusable.

They are never customer-specific.

---

## Knowledge Asset Lifecycle

Every Knowledge Asset follows the same lifecycle.

```text
Draft

↓

Validated

↓

Published

↓

Versioned

↓

Deprecated

↓

Archived
```

Published Knowledge Assets are immutable.

Changes produce new versions.

---

## Knowledge Ownership

| Knowledge Type | Owner |
|----------------|------|
| Platform doctrine | Alloy |
| Organization policy | Organization |
| Regulatory guidance | Authority |
| Operational procedures | Organization |
| Learned patterns | Trust Platform |
| External references | External provider |

Knowledge ownership is explicit.

Reasoning never invents ownership.

---

## Knowledge Providers

Knowledge enters the platform through Knowledge Providers.

Examples:

- Platform Knowledge Provider
- Organization Knowledge Provider
- Regulatory Knowledge Provider
- Operational Learning Provider
- External Documentation Provider

Each provider implements one retrieval interface.

Reasoning never retrieves knowledge directly.

---

## Knowledge Categories

Every Knowledge Asset belongs to one or more categories.

Examples:

- Operational
- Policy
- Compliance
- Financial
- Communication
- Configuration
- Relationship
- Scheduling
- Enrollment
- Safety

Categories enable retrieval.

Categories never replace ownership.

---

## Knowledge Retrieval

Knowledge retrieval is deterministic.

Reasoning requests categories.

The Knowledge Platform resolves assets.

Example

```text
Decision Contract

↓

Requires:

Enrollment Policy

State Licensing

Organization Handbook

↓

Knowledge Platform

↓

Published Knowledge Assets
```

The Trust Runtime never searches arbitrary repositories.

---

## Knowledge Versioning

Every Decision Package records:

- Knowledge Asset
- Version
- Provider
- Publication Date

Recommendations must always be reproducible.

Future changes to knowledge never modify historical decisions.

---

## Knowledge Composition

Knowledge Assets remain independent.

Reasoning composes them.

Example

```text
Organization Policy

+

State Regulation

+

Platform Best Practice

↓

Decision Package
```

Knowledge Assets never reference each other operationally.

Composition belongs to the Trust Runtime.

---

## Knowledge Is Explainable

Every recommendation should identify:

Which Knowledge Assets were used.

Which versions were used.

Which providers supplied them.

Knowledge should always be attributable.

---

## Relationship to Operational Learning

Operational Learning never writes directly into Knowledge.

Instead it produces:

```text
Learning Candidates

↓

Review

↓

Promotion

↓

Knowledge Asset
```

The platform learns through promotion.

Not automatic mutation.

---

## Relationship to Privacy

Knowledge Assets never contain customer identity.

Customer operational history is never promoted directly into Knowledge.

Knowledge remains generalized.

Privacy remains preserved.

---

## Frozen Decisions

The following decisions are permanent.

- Knowledge is distinct from Truth.
- Knowledge Assets are immutable.
- Versioning is mandatory.
- Retrieval is deterministic.
- Knowledge Providers own retrieval.
- Learning proposes Knowledge.
- Reasoning consumes Knowledge.
- Execution authorities never consume Knowledge directly.

---

## Anti-Patterns

Never:

- Treat customer records as Knowledge Assets.
- Store prompts as Knowledge.
- Store conversations as generalized Knowledge.
- Modify published Knowledge Assets.
- Allow reasoning to retrieve arbitrary documents.
- Couple Knowledge Assets to AI providers.

---

## Relationship to Other Platforms

| Platform | Relationship |
|----------|--------------|
| Records Platform | Provides Truth |
| Trust Runtime | Consumes Knowledge |
| Operational Learning | Produces Knowledge Candidates |
| Execution authorities | Never directly consume Knowledge |
| Operational Intelligence | Measures Knowledge effectiveness |

---

## Runtime Guarantees

The Knowledge Platform guarantees:

- deterministic retrieval
- immutable publications
- reproducibility
- provider independence
- version traceability
- ownership clarity

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Decision Packages`](./decision-package.md)
- [`Privacy Runtime`](./privacy-runtime.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)
- [`Operational Learning`](./operational-learning.md)

---

## When This Document Must Be Updated

Update only when:

- Knowledge Asset semantics change
- ownership changes
- retrieval architecture changes
- versioning model changes

Changes to individual knowledge sources never require modification of this specification.
