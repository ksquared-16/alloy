---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Trust Runtime

**Status:** Canonical Platform Runtime

The Trust Runtime is the execution kernel of the Trust Platform.

Its responsibility is to transform uncertainty into trustworthy operational recommendations without modifying operational truth.

The Trust Runtime is not an AI runtime.

It is the runtime responsible for orchestrating trusted reasoning.

---

## Purpose

The Trust Runtime exists to answer one operational question:

> Given this operational decision, what is the most trustworthy recommendation that can be produced?

It accomplishes this by orchestrating:

- information retrieval
- privacy transformation
- knowledge retrieval
- reasoning
- validation
- decision packaging
- operational learning

The runtime never executes operational changes.

Execution belongs exclusively to the Objective Platform.

---

## Runtime Responsibilities

The Trust Runtime owns:

- Decision Contract execution
- Decision Package production
- Information preparation
- Privacy transformation
- Knowledge retrieval
- Reasoning strategy selection
- Reasoning orchestration
- Validation orchestration
- Trust evidence assembly
- Operational learning
- Runtime events

The runtime never owns:

- Records
- Relationships
- Permissions
- Business Rules
- Operational execution
- Deterministic business validation rules
- Trust Vector and Trust Score semantics
- Workflow state
- Customer identity
- Operational truth

Scope is decided by the [`Reasoning Boundary Test`](./trust-platform-manifesto.md#reasoning-boundary-test).

---

## Runtime Inputs

Every Trust Runtime execution begins with a Decision Contract.

The runtime never accepts free-form reasoning requests.

Decision Contracts define:

- operational intent
- decision class
- context
- available truth
- information requirements
- knowledge requirements
- privacy policy
- validation policy
- economic constraints

The runtime treats every capability identically.

Processing.

Communications.

Search.

Configuration.

Participant Runtime.

BOS.

All submit Decision Contracts.

---

## Runtime Outputs

Every runtime execution produces one Decision Package.

Decision Packages are immutable.

They contain:

- recommendation
- evidence
- confidence
- trust vector
- validation results
- privacy report
- economic metadata
- alternatives
- learning metadata

Decision Packages never mutate records.

---

## Runtime Lifecycle

Every Decision Contract follows the same lifecycle.

```text
Requested

↓

Prepared  ·  required truth and context resolved

↓

Classified  ·  information classes assigned

↓

Privacy Transformed

↓

Knowledge Retrieved  ·  authorized knowledge enters the reasoning context

↓

Strategy Selected

↓

Reasoning Completed

↓

Deterministic Validation

↓

Trust Evaluated

↓

Decision Package Produced

↓

Presented

↓

Accepted | Rejected

↓

Observed

↓

Learning

↓

Archived
```

This ordering is canonical for V1.

Knowledge **metadata** may be resolved earlier for planning and budgeting. Knowledge **content** enters the reasoning context only after privacy preparation.

Execution begins only after the Decision Package leaves the Trust Runtime, and only through an execution authority — never from the package itself.

---

## Runtime System Calls

The Trust Runtime exposes platform operations rather than provider operations.

### CreateDecisionContract()

Registers a new operational reasoning request.

---

### PrepareContext()

Retrieves context.

Resolves information requirements.

Applies privacy policy.

Produces reasoning context.

---

### RetrieveKnowledge()

Retrieves required knowledge assets.

Knowledge providers are selected by runtime policy.

Runs **after** `PrepareContext()` has applied privacy policy. Knowledge metadata may be resolved earlier for planning; content enters the reasoning context only after privacy preparation.

---

### ExecuteReasoning()

Selects an appropriate Reasoning Strategy.

Produces a Recommendation.

---

### ValidateProposal()

Runs deterministic validation.

Produces validation report.

---

### BuildDecisionPackage()

Constructs immutable Decision Package.

---

### CaptureOutcome()

Records acceptance, rejection, override, or modification.

---

### Learn()

Evaluates operational outcome.

Produces Learning Candidates.

---

## Runtime Engines

The runtime is composed of specialized engines.

### Decision Engine

Owns Decision Contract lifecycle.

---

### Classification Engine

Determines information classes.

Sensitivity.

Decision class.

Privacy requirements.

---

### Retrieval Engine

Retrieves:

- Truth
- Knowledge
- Policies
- Context

according to Decision Contract requirements.

---

### Privacy Engine

Transforms information before reasoning.

Examples:

- tokenization
- abstraction
- segmentation
- summarization
- redaction

The runtime reasons over transformed information whenever possible.

---

### Strategy Engine

Determines how reasoning should occur.

Examples:

- deterministic
- symbolic
- retrieval
- embeddings
- vision
- language model

Reasoning techniques remain replaceable.

---

### Validation Engine

**Orchestrates** deterministic verification. It calls the validators owned by the domain or platform that owns each rule — Records, Relationship, Business Process Execution, Objective, Financial — and records their results in the Decision Package.

The Validation Engine owns no business rules and never duplicates one. A rule that exists in a domain validator is invoked, never re-implemented.

Validation never depends upon reasoning.

---

### Trust Engine

Assembles the evidence a Trust evaluation requires — grounding, privacy, evidence quality, validation results, historical reliability, economics, required oversight — and applies the Trust Vector and Trust Score semantics **owned by [`Trust Governance`](./trust-governance.md)**.

The Trust Engine does not own trust evaluation. It computes trust from governance-owned semantics, so dimensions and thresholds can change without a runtime change.

---

### Learning Engine

Produces Learning Candidates.

Promotes generalized knowledge after approval.

Never stores customer identity.

---

## Runtime Events

The Trust Runtime is event driven.

Canonical events include:

- DecisionRequested
- DecisionPrepared
- KnowledgeRetrieved
- PrivacyTransformed
- ReasoningCompleted
- ValidationSucceeded
- ValidationFailed
- DecisionPackageCreated
- DecisionAccepted
- DecisionRejected
- LearningCandidateCreated
- LearningPromoted
- KnowledgeUpdated

These events feed Operational Intelligence.

---

## Scheduler

Reasoning execution is scheduled.

Execution modes include:

- Immediate
- Deferred
- Background
- Retry
- Escalated
- Cancelled

The scheduler optimizes:

- latency
- cost
- operational priority
- provider availability

---

## Extension Points

Capabilities extend the runtime by registering:

- Decision Classes
- Knowledge Providers
- Reasoning Strategies
- Validation Policies
- Learning Policies

Platforms never extend the runtime directly.

They register capabilities.

---

## Runtime Invariants

The Trust Runtime guarantees:

- one Decision Contract produces one Decision Package
- reasoning never modifies truth
- validation is deterministic
- reasoning is explainable
- provider independence
- complete auditability
- reproducibility
- privacy policy enforcement
- platform-wide consistency
- a Decision Package is evidence and is never directly executable

---

## Relationship to Execution

The Trust Runtime is a peer of the execution authorities.

```text
Decision Contract

↓

Trust Runtime

↓

Decision Package  ·  evidence, never directly executable

↓

Human decision · Objective · registered command invocation

↓

Operational Commands / Business Process Execution

↓

Truth
```

The Trust Runtime proposes what should happen and supplies the evidence for that proposal.

Durable mutation is performed by Operational Commands and Business Process Execution. The Objective Platform coordinates objectives where an outcome spans obligations and contributions.

The separation is permanent.

---

## Relationship to Other Platforms

Every platform consumes the Trust Runtime.

None own independent reasoning.

| Platform | Uses Trust Runtime For |
|-----------|------------------------|
| Processing | Document understanding |
| BOS | Operational assistance |
| Communications | Message generation |
| Search | Semantic reasoning |
| Configuration | Blueprint proposals |
| Operational Intelligence | Explanations |
| Participant Runtime | Conversational guidance |

---

## Runtime Stability

The runtime is independent of:

- AI vendors
- language models
- embedding providers
- OCR engines
- future reasoning techniques

Only Reasoning Strategies change.

The runtime architecture remains stable.

---

## Related Documents

- [`Trust Platform`](./trust-platform.md)
- [`Trust Philosophy`](./trust-philosophy.md)
- [`Trust Platform Manifesto`](./trust-platform-manifesto.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Decision Packages`](./decision-package.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- [`Privacy Runtime`](./privacy-runtime.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)
- [`Reasoning Deployment Strategy`](./reasoning-deployment-strategy.md)

---

## When This Document Must Be Updated

Update only when:

- runtime lifecycle changes
- runtime ownership changes
- runtime system calls change
- runtime invariants change
- extension model changes

Provider implementations never require updates to this document.
