---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Trust Platform Integration

**Status:** Canonical Platform Specification

The Trust Platform is a foundational platform consumed by every operational capability inside Alloy.

No capability owns independent reasoning.

Every capability submits Decision Contracts.

Every capability consumes Decision Packages.

The Trust Platform becomes the single reasoning infrastructure for the Alloy Operating System.

---

## Core Rule

Every platform reasons through the Trust Platform.

No platform implements independent:

- prompts
- model selection
- provider routing
- privacy transformation
- reasoning orchestration
- trust evaluation
- learning

Reasoning exists exactly once.

---

## Platform Position

```text
Records

Relationships

Knowledge

↓

Trust Platform

↓

Objective Platform

↓

Business Processes

↓

Experience

↓

Operational Intelligence
```

The Trust Platform sits between operational truth and execution.

---

## Integration Philosophy

Platforms own operational expertise.

The Trust Platform owns reasoning.

Platforms contribute:

- Decision Classes
- Knowledge Providers
- Validation Policies
- Learning Policies

The Trust Platform orchestrates them.

---

## Processing

### Purpose

Processing converts inbound operational information into trustworthy operational understanding.

Processing owns:

- OCR
- Document ingestion
- Fact extraction

Processing never owns:

- Reasoning
- Provider selection
- Policy interpretation
- Decision making

---

### Decision Contracts

Examples:

- Determine Subsidy Eligibility
- Extract Enrollment Facts
- Resolve Identity
- Interpret Uploaded Document
- Classify Intake

---

### Decision Packages

Examples:

- Eligibility Recommendation
- Identity Match
- Extracted Operational Facts
- Document Classification
- Missing Information

---

### Knowledge

Consumes:

- State Regulations
- Organization Policies
- Platform Guidance
- Provider Rules

---

## BOS

### Purpose

BOS is the conversational interface to the Trust Platform.

BOS owns:

- Conversation
- Intent collection
- Operator interaction

BOS never owns:

- Reasoning
- Execution
- Learning
- Provider selection

---

### Decision Contracts

Examples:

- Create Lead
- Generate Blueprint
- Recommend Workflow
- Interpret Question
- Summarize Operations

---

### Decision Packages

Returned directly to BOS.

BOS presents Decision Packages.

BOS never presents raw provider responses.

---

## Communications

Communications owns:

- Threads
- Delivery
- Scheduling
- Templates

Reasoning remains external.

---

### Decision Contracts

- Generate Communication
- Determine Tone
- Summarize Conversation
- Recommend Follow-up

---

### Decision Packages

- Message Draft
- Tone Recommendation
- Communication Summary
- Suggested Follow-up

---

## Search

Search remains deterministic by default.

Trust Platform activates only when semantic reasoning is required.

Examples:

- Operational Intent
- Natural Language Search
- Identity Resolution
- Context Discovery

Search always prefers deterministic retrieval.

---

## Configuration

Configuration owns:

- Platform configuration
- Surface configuration
- Business Process configuration

Trust Platform assists through:

- Blueprint proposals
- Configuration recommendations
- Policy explanations

Configuration never owns reasoning.

---

## Participant Runtime

Participant Runtime owns:

- Conversation flow
- Objective progression
- User experience

Trust Platform owns:

- Understanding
- Interpretation
- Recommendations
- Decision support

Participant Runtime consumes Decision Packages.

---

## Operational Intelligence

Operational Intelligence never performs reasoning.

It measures reasoning.

Examples:

- Trust Score
- Reasoning Cost
- Graduation Rate
- Recommendation Acceptance
- Knowledge Growth
- Deterministic Resolution Rate

Operational Intelligence measures the platform.

It never becomes the platform.

---

## Execution authorities

The Trust Platform is a peer of the execution authorities.

```text
Decision Contract

↓

Trust Platform

↓

Decision Package  ·  evidence

↓

Human decision · Objective · registered command invocation

↓

Operational Commands / Business Process Execution

↓

Operational Truth
```

Trust proposes, with evidence.

Operational Commands and Business Process Execution perform durable mutation. The Objective Platform coordinates objectives where an outcome spans obligations and contributions; it is not the general execution runtime.

The separation is permanent.

---

## Records Platform

Records provide Truth.

Trust Runtime reasons over Truth.

Trust Runtime never modifies Truth.

Only execution authorities produce Truth changes.

---

## Relationship Platform

Relationship Platform owns identity.

Trust Platform reasons over identity.

Trust Platform never owns identity.

Identity remains authoritative.

---

## Knowledge Platform

Knowledge provides reusable understanding.

Trust Runtime consumes Knowledge.

Operational Learning evolves Knowledge.

Knowledge never performs reasoning.

---

## Platform Responsibilities

| Platform | Responsibility |
|----------|----------------|
| Records | Truth |
| Relationships | Identity |
| Knowledge | Understanding |
| Trust | Reasoning |
| Operational Commands / Business Process Execution | Durable mutation |
| Objective | Objective coordination |
| Business Processes | Operational Work |
| Communications | Conversation |
| Operational Intelligence | Measurement |

Each platform owns exactly one responsibility.

---

## Runtime Flow

Every platform follows the same integration pattern.

```text
Platform

↓

Decision Contract

↓

Trust Runtime

↓

Decision Package  ·  evidence

↓

Execution authority (optional)

↓

Execution

↓

Operational Truth
```

This flow never changes.

---

## Runtime Guarantees

The Trust Platform guarantees:

- One reasoning runtime.
- One Decision Contract interface.
- One Decision Package interface.
- Provider independence.
- Platform-wide consistency.
- Replayability.
- Explainability.
- Auditability.

---

## Frozen Decisions

- Every platform reasons through the Trust Platform, as scoped by the [`Reasoning Boundary Test`](./trust-platform-manifesto.md#reasoning-boundary-test).
- Platforms contribute capabilities.
- Platforms never implement independent reasoning.
- The Trust Platform never performs durable mutation; Operational Commands and Business Process Execution do.
- Records remain the only operational truth.

---

## Anti-Patterns

Never:

- Call providers directly from platforms.
- Build capability-specific prompt systems.
- Implement capability-specific privacy rules.
- Implement capability-specific learning.
- Return provider responses to platforms.
- Duplicate reasoning infrastructure.

---

## Constitutional Principle

The Trust Platform is not another capability.

It is foundational infrastructure shared by every capability in Alloy.

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Decision Packages`](./decision-package.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- Objective Platform — **TODO:** link when canonical Objective Platform doctrine is published
- Records Platform — **TODO:** link when canonical Records Platform doctrine is published
- [`Trust Platform Decisions`](./trust-platform-decisions.md)
- [`Platform Decisions`](../foundation/platform-decisions.md) (Alloy-wide register)

---

## When This Document Must Be Updated

Update only when:

- Platform ownership changes.
- Integration boundaries change.
- Core runtime flow changes.
- New foundational platforms are introduced.
