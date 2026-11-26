---
owner: platform
status: canonical
last_reviewed: 2026-09-30
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

## Certification record — measured 2026-09-30

**State:** `AI_BOS_DOCUMENTATION_CONTEXT_READY`. Measured against staging `3c4ac97f1`. This records what
is implemented, not what is intended.

### One provider, and no SDK

| Fact | Measured |
|---|---|
| provider | **OpenAI wire protocol only**, via `lib/ai/trust/openAiCompatibleProviderAdapter.ts` |
| transport | raw HTTP to `https://api.openai.com` — **no AI SDK in `package.json`** (no `openai`, no `@ai-sdk`, no langchain) |
| configuration | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_CHAT_TEMPERATURE`, `OPENAI_REQUEST_TIMEOUT_MS` |
| abstraction | the adapter is the **first** real implementation of Trust's provider port; the port is a type Trust declares and never looks behind |

`OPENAI_BASE_URL` makes the endpoint configurable, so an OpenAI-**compatible** endpoint can be substituted.
That is not the same as multi-provider support: **there is exactly one adapter**, and it speaks one wire
protocol. Do not describe provider switching, local models or self-hosted inference as current Alloy
capability — and note that the deployment-strategy document does not claim them either.

### Not everything called "AI" invokes a model

This is the distinction most likely to be inferred wrongly. Four Trust capabilities exist; **two reach a
model and two do not**:

| Capability | Model-backed? |
|---|---|
| `attentionSuggestionEnrichment` | **yes** — reaches the provider port |
| `participantConversationInterpretation` | **yes** |
| `processingIdentitySubjectResolution` | **no** — deterministic |
| `processingSourceClassification` | **no** — deterministic |

And a whole mounted surface is deterministic despite its path. `app/api/admin/ai/task-assist/propose`
builds its suggestion with `buildDeterministicTaskAssistSuggestionV1`, whose own output string says it
plainly: **"Deterministic template draft (V1) — not from a live model."** A reader who assumed every
`/api/admin/ai/*` route implies inference would be wrong about this one.

### The Trust boundary is enforced by control, not convention

`lib/trust` is asserted to contain **no `fetch(`, no provider SDK, no credential — and not even the
substring `openai`**. The dependency inversion runs one way only: `lib/ai` depends on Trust's *types*;
nothing in `lib/trust` imports the adapter. The pipeline is

```
Eligible Reasoning Input (governed, minimized, provenanced upstream)
  → governed execution request
  → provider adapter (translate, transport, normalize)
  → normalized result
```

so minimisation and provenance happen **before** anything leaves the building. This is guard-enforced:
`tests/trust/trustBoundary.test.ts`, `tests/trust/ungovernedEgressRetired.test.ts` and `tests/ai/**` —
**133 tests, all passing** at time of certification.

### Authority — reasoning confers nothing

AI authority is a **Trust authorization**, resolved per request through
`resolveTrustAccessAuthorization` / `completeTrustAuthorization`, which refuses with an explicit
`trust_outcome: "refused_permission"` rather than failing open. Capability keys measured on the mounted
surface: `ai.enrichment.use` (6 writes), the three-stage `config_assist.generate` / `.review` / `.apply`,
plus domain keys where an AI path touches a domain — `layouts.manage`, `fields.manage`,
`ops.workflows.write`, `work.configure`, `communications.send`.

**That last row is the invariant.** When an AI path applies a change, it takes the DOMAIN's capability, not
an AI one — an Agent suggestion applied to a layout requires `layouts.manage`, exactly as a human edit
does. Apply follows the business object, never the folder the request arrived through. Reasoning itself
grants no mutation authority.

### Surface census — exact, and overlapping on purpose

**25 route files · 27 handlers (18 write, 9 read) · 8 mounted UI pages.** 16 of 18 writes are declared.

Some handlers appear in both this census and Configuration's — `config-layout-assist/**` is an AI path that
writes configuration. **That overlap is not double ownership:** Configuration owns the authored settings,
their lifecycle and the capability that applies them; AI/BOS owns the reasoning that proposes them. Do not
count a shared handler as evidence that either domain owns the other's half.

### The OI boundary

Operational Intelligence is certified and **deterministic** — registered calculations with declared
handlers. AI/BOS **consumes** OI (the BOS turn parses an intent and runs an operational question) and
**does not author it**: no AI path writes `operational_expectations`, a metric snapshot or an OI
observation. The BOS turn's entire import closure writes nothing. An OI metric is therefore never model
output, and a model output is never an OI measurement.

### Benchmark inference contract

**SAFE, because measured:** AI/BOS reads only context Trust has made eligible, minimized and provenanced;
recommendations and drafts are not domain facts; a domain action applied through an AI path retains the
domain's own capability; provider and model come from configuration; OI and AI/BOS are distinct, with AI
consuming OI and never authoring it; exactly two Trust capabilities are model-backed.

**FORBIDDEN:** an AI recommendation is an approved action · model output is durable domain truth · AI
bypasses capability or scope checks · access to an AI surface confers action authority · planned autonomous
agents are current runtime · provider switching, local models or self-hosted inference are current Alloy
capability · AI automatically has access to every certified domain · an OI metric is model inference · a
route under `/api/admin/ai/**` necessarily invokes a model (`task-assist/propose` does not) · `lib/trust`
talks to a provider (it cannot — the guard forbids the substring).

### Owner set

DIRECT: this document and `trust-platform.md`. REFERENCE_ON_DEMAND: `privacy-runtime.md`,
`information-classification.md` and `decision-contract.md` for the governance of reasoning inputs;
`reasoning-deployment-strategy.md`. PLANNED_ONLY: `docs/platform/planning/trust-runtime/**`.
EXCLUDE_HISTORY: `milestones/bos-command-runtime-convergence-closeout.md` (frozen) and the
`certification/**` trust-adoption evidence.

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
