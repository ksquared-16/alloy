---
owner: platform
status: canonical
last_reviewed: 2026-08-04
supersedes: []
---

# Reasoning Deployment Strategy

## Status

Canonical Trust Platform doctrine.

This document defines where operational reasoning executes and how the Trust Platform selects reasoning infrastructure.

It intentionally does not define specific model providers.

---

## Core Rule

The Trust Platform always selects the least expensive, least exposed reasoning strategy capable of satisfying the Decision Contract.

Capability, information exposure, and cost are independent decisions.

A more capable model never automatically receives more sensitive information.

---

## Deployment Philosophy

The objective of the Trust Platform is not to maximize AI.

The objective is to maximize trustworthy operational decisions.

Reasoning therefore escalates only when necessary.

The preferred order is:

```text
Deterministic

↓

Private Reasoning

↓

Enterprise Frontier Reasoning

↓

Human Judgment
```

---

## Layer 0 — Deterministic

Preferred whenever possible.

Examples:

- Permissions
- Status transitions
- Business rules
- Financial calculations
- Validation
- Objective execution
- Relationship resolution

No probabilistic model is invoked.

---

## Layer 1 — Alloy Private Models

Default probabilistic reasoning.

Models execute inside Alloy-controlled infrastructure.

Typical workloads:

- Classification
- OCR enrichment
- PII detection
- Entity extraction
- Matching
- Summarization
- Embeddings
- Routing

Sensitive information remains inside Alloy.

---

## Layer 2 — Larger Private Reasoning

Invoked only when Layer 1 cannot satisfy the Decision Contract.

Typical workloads:

- Complex document interpretation
- Configuration proposals
- Multi-document understanding
- Blueprint generation
- Advanced planning

Still private.

Still provider-independent.

---

## Layer 3 — Enterprise Frontier Models

Used only when previous layers cannot produce a trustworthy recommendation.

Examples:

- Large-scale reasoning
- Complex explanation
- Policy comparison
- Planning

These models receive:

- tokenized identities
- transformed documents
- semantic facts
- operational metadata
- required policy excerpts

They do not receive unnecessary operational identity.

---

## Layer 4 — Human Judgment

When uncertainty remains above the Trust threshold:

Escalate.

Do not guess.

Human accountability remains authoritative.

---

## Information Exposure

Every escalation independently evaluates:

- Decision Class
- Information Classification
- Privacy Policy
- Trust Threshold
- Cost Budget

Model capability never determines information exposure.

---

## Runtime Policy

The Trust Runtime selects:

```text
Decision Class

↓

Reasoning Strategy

↓

Deployment Layer

↓

Provider
```

Provider selection is the final decision.

Never the first.

---

## Economic Objective

The platform minimizes:

- operational cost
- information exposure
- unnecessary reasoning

while maximizing:

- trustworthy decisions
- deterministic execution
- privacy
- explainability

---

## Constitutional Principle

The Trust Platform escalates capability, cost, and information exposure independently.

No Decision Contract should expose additional information solely because a larger model is selected.

---

## Related Documents

- [`Trust Runtime`](./trust-runtime.md)
- [`Reasoning Runtime`](./reasoning-runtime.md)
- [`Trust Economics`](./trust-economics.md)
- [`Information Classification`](./information-classification.md)
- [`Privacy Runtime`](./privacy-runtime.md)
