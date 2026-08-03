---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Privacy Runtime

**Status:** Canonical Platform Specification

The Privacy Runtime governs how operational information is prepared before reasoning occurs.

Privacy is not an implementation detail.

Privacy is a runtime responsibility.

Every Decision Contract passes through the Privacy Runtime before entering the Reasoning Runtime.

---

## Core Rule

Reasoning never receives more information than it requires.

The Privacy Runtime exists to transform operational information into the minimum trustworthy reasoning context.

Privacy is achieved through information minimization—not post-processing.

---

## Why the Privacy Runtime Exists

Operational reasoning frequently requires understanding without identity.

Examples:

Determining subsidy eligibility rarely requires names.

Classifying enrollment documents rarely requires addresses.

Matching operational patterns rarely requires phone numbers.

Most AI systems send everything and redact afterward.

The Privacy Runtime performs the opposite.

It asks:

> **What information is actually required for this decision?**

Everything else remains outside the reasoning boundary.

---

## Mental Model

```text
Truth

↓

Information Classification

↓

Privacy Runtime

↓

Reasoning Context

↓

Reasoning Runtime
```

Reasoning never consumes raw operational truth.

It consumes transformed reasoning context.

---

## Runtime Responsibilities

The Privacy Runtime owns:

- information minimization
- identity abstraction
- tokenization
- document segmentation
- semantic extraction
- privacy policy enforcement
- reasoning context construction

The Privacy Runtime never owns:

- reasoning
- knowledge retrieval
- execution
- operational truth
- authorization

---

## Privacy Lifecycle

Every Decision Contract passes through the same lifecycle.

```text
Decision Contract

↓

Determine Information Requirements

↓

Retrieve Information

↓

Classify Information

↓

Apply Privacy Policy

↓

Transform Information

↓

Retrieve Authorized Knowledge

↓

Construct Reasoning Context

↓

Reasoning Runtime
```

This lifecycle is deterministic.

Knowledge **metadata** may be resolved earlier for planning and budgeting. Knowledge **content** enters the reasoning context only after privacy preparation, which is why retrieval appears after transformation here.

---

## Information Classification

Every information element belongs to a platform-defined Information Class.

Examples include:

- Identity
- Relationship
- Operational
- Financial
- Compliance
- Communications
- Behavior
- Knowledge

Information Classes determine privacy policy.

Fields do not.

---

## Privacy Policies

Each Information Class defines an allowed transformation policy.

Examples:

```text
Identity

→ Tokenize

Financial

→ Summarize

Documents

→ Segment

Communications

→ Summarize

Knowledge

→ Pass Through

Operational

→ Pass Through
```

Policies are platform-owned.

Decision Contracts reference policies rather than implementation.

---

## Information Transformations

The Privacy Runtime transforms information before reasoning.

Supported transformations include:

### Identity Tokenization

```text
John Smith

↓

Guardian_1
```

---

### Relationship Abstraction

```text
Mother

↓

Primary Guardian
```

---

### Document Segmentation

```text
Entire Packet

↓

Sections

↓

Semantic Units
```

---

### Semantic Extraction

```text
Income Verification

↓

Household Income
```

---

### Aggregation

```text
Attendance Events

↓

Attendance Pattern
```

---

### Summarization

```text
Conversation

↓

Operational Summary
```

Transformations are deterministic.

---

## Identity Tokenization

Identity is never removed.

Identity is replaced.

Examples:

```text
Parent

↓

Guardian_A

Child

↓

Participant_B

Teacher

↓

Staff_C
```

Identity mapping remains internal to the runtime.

Reasoning receives abstractions.

---

## Progressive Disclosure

Information is earned.

Reasoning begins with the minimum required context.

If additional information is required:

```text
Reasoning Runtime

↓

Privacy Runtime

↓

Additional Context

↓

Continue Reasoning
```

Progressive disclosure prevents unnecessary exposure.

---

## Document Processing

Documents are never reasoned over as raw files.

Documents become:

```text
Document

↓

Pages

↓

Sections

↓

Semantic Units

↓

Facts

↓

Reasoning Context
```

The runtime reasons over facts whenever possible.

---

## Context Construction

The Privacy Runtime constructs the Reasoning Context.

Reasoning Context contains only:

- Required Truth
- Required Knowledge
- Required Context
- Transformed Information

No additional operational data enters reasoning.

---

## Runtime Guarantees

The Privacy Runtime guarantees:

- information minimization
- deterministic transformations
- provider independence
- reproducibility
- policy enforcement
- auditability

---

## Frozen Decisions

The following decisions are permanent.

- Reasoning never receives raw operational truth.
- Information Classes determine privacy.
- Transformation precedes reasoning.
- Identity is abstracted whenever operationally possible.
- Progressive disclosure is preferred over complete disclosure.
- Privacy policies remain independent of providers.

---

## Anti-Patterns

Never:

- Send entire records to reasoning.
- Send entire documents when facts are sufficient.
- Treat redaction as privacy.
- Couple privacy to model providers.
- Allow reasoning to bypass transformation.
- Expose identity because it is convenient.

---

## Relationship to Other Platforms

| Platform | Relationship |
|----------|--------------|
| Records Platform | Provides Truth |
| Knowledge Platform | Provides Knowledge |
| Trust Runtime | Consumes transformed context |
| Reasoning Runtime | Never consumes raw information |
| Operational Learning | Never receives customer identity |

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- [`Information Classification`](./information-classification.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)

---

## When This Document Must Be Updated

Update only when:

- transformation model changes
- runtime responsibilities change
- Information Classes change
- privacy lifecycle changes

Implementation changes do not modify this doctrine.
