---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Information Classification System

**Status:** Canonical Platform Specification

The Information Classification System defines the canonical information model used by the Trust Platform.

It determines:

- what information exists
- how information is classified
- how information may participate in reasoning
- how information is transformed
- how information is governed

Every Decision Contract references Information Classes.

Every Privacy Policy operates upon Information Classes.

Every Reasoning Strategy consumes transformed Information Classes.

---

## Core Rule

Information is classified by meaning.

Never by storage.

Never by field.

Never by document.

The Trust Platform reasons over semantic information.

Not implementation artifacts.

---

## Why This Exists

Traditional systems classify:

- Files
- Tables
- Columns
- Fields

The Trust Platform classifies:

- Identity
- Relationships
- Policies
- Operational State
- Financial Information
- Communications
- Knowledge
- Behavior

Meaning remains stable.

Storage changes.

---

## Mental Model

```text
Operational Truth

↓

Semantic Information

↓

Information Class

↓

Privacy Policy

↓

Reasoning Context
```

The runtime never reasons over raw storage.

---

## Information Hierarchy

Every information element belongs to exactly one primary Information Class.

Subclasses are permitted.

Multiple primary classes are not.

```text
Information

├── Identity

├── Relationship

├── Operational

├── Financial

├── Compliance

├── Communication

├── Behavior

├── Knowledge
```

---

## Identity

Identity describes who someone is.

Examples:

- Person Name
- Child Name
- Date of Birth
- Address
- Phone
- Email
- Government Identifier
- Photograph
- Biometrics

Identity is never operational knowledge.

---

## Relationship

Relationship describes how entities relate.

Examples:

- Guardian
- Parent
- Sibling
- Emergency Contact
- Authorized Pickup
- Teacher
- Administrator

Relationship never implies identity.

---

## Operational

Operational information describes current organizational reality.

Examples:

- Stage
- Objective
- Program
- Room
- Location
- Enrollment Status
- Attendance
- Waitlist Position

Operational information is often reasoned over directly.

---

## Financial

Financial information describes monetary responsibility.

Examples:

- Income
- Tuition
- Balance
- Payment History
- Aid
- Scholarships

Financial information requires explicit Decision Class approval.

---

## Compliance

Compliance information describes regulatory obligations.

Examples:

- Licensing
- Background Checks
- Medical Requirements
- State Rules
- Subsidy Rules
- Expiration Dates

Compliance information frequently combines Knowledge and Truth.

---

## Communications

Communications describe interaction history.

Examples:

- Messages
- Email
- SMS
- Announcements
- Conversation Summaries

Communications are transformed before reasoning.

---

## Behavior

Behavior describes observed operational patterns.

Examples:

- Attendance Trends
- Engagement
- Response Patterns
- Completion Rates

Behavior is typically aggregated before reasoning.

---

## Knowledge

Knowledge represents generalized understanding.

Examples:

- Policies
- Procedures
- Manuals
- Regulations
- Platform Doctrine
- Knowledge Assets

Knowledge is never customer-specific.

---

## Classification Rules

Classification follows semantics.

Not implementation.

Example.

```text
Parent Name

↓

Identity
```

Regardless of whether it exists in:

- CRM
- Enrollment Form
- PDF
- OCR
- Conversation

Identity remains Identity.

---

## Information Ownership

Each Information Class has exactly one owner.

| Class | Owner |
|---------|-------|
| Identity | Records Platform |
| Relationship | Relationship Platform |
| Operational | Owning Platform |
| Financial | Owning Platform |
| Compliance | Owning Platform |
| Communications | Communications Platform |
| Behavior | Operational Intelligence |
| Knowledge | Knowledge Platform |

Classification never changes ownership.

---

## Information Policies

Every Information Class defines:

- Privacy Policy
- Transformation Policy
- Retention Policy
- Learning Policy
- Validation Policy
- Economic Policy
- Reasoning Policy

Policies are platform-owned.

Individual Decision Contracts consume policies.

---

## Information Transformations

Classification precedes transformation.

Examples.

```text
Identity

↓

Tokenization

Operational

↓

Pass Through

Financial

↓

Aggregation

Behavior

↓

Pattern Extraction

Communications

↓

Summarization

Knowledge

↓

Direct Retrieval
```

Transformation never changes classification.

---

## Runtime Guarantees

The Information Classification System guarantees:

- Semantic stability
- Provider independence
- Deterministic classification
- Policy consistency
- Reproducibility
- Platform-wide reuse

---

## Frozen Decisions

The following decisions are permanent.

- Information is classified by meaning.
- Information Classes own policies.
- Fields never own policy.
- Documents never own policy.
- Storage never defines classification.
- Transformation never changes classification.

---

## Anti-Patterns

Never:

- Classify by table.
- Classify by document.
- Treat PDFs as information classes.
- Treat storage as semantics.
- Allow providers to determine classification.
- Duplicate Information Classes across platforms.

---

## Relationship to Other Platforms

| Platform | Relationship |
|-----------|--------------|
| Records Platform | Owns Identity |
| Relationship Platform | Owns Relationships |
| Knowledge Platform | Owns Knowledge |
| Privacy Runtime | Consumes Information Classes |
| Reasoning Runtime | Consumes transformed information |
| Operational Learning | References Information Classes |

---

## Related Documents

- [`Privacy Runtime`](./privacy-runtime.md)
- [`Knowledge Platform`](./knowledge-platform.md)
- [`Trust Runtime`](./trust-runtime.md)
- [`Decision Contracts`](./decision-contract.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)
- [`Reasoning Deployment Strategy`](./reasoning-deployment-strategy.md)

---

## When This Document Must Be Updated

Update only when:

- Information Classes change.
- Ownership changes.
- Classification model changes.
- Policy ownership changes.

Provider implementations never require modification.
