---
owner: platform
status: assessment
mission: trust-runtime-v1-implementation-assessment
last_reviewed: 2026-08-01
---

# Trust Runtime V1 — Implementation Assessment

**Nothing was implemented.** No runtime code, no AI, no schema, no prompt, no
pipeline change. This document is doctrine comprehension, repository impact
analysis, and a phased plan.

**Doctrine read (16 documents, `docs/platform/trust/`).** The Trust Platform
corpus is **not on this branch** — it landed on `origin/staging` via
`agent/cursor/1-trust-platform-pub` (`fd66d5e35`…`17272e700`), and this branch
forked at `3fc2e0f4e`, 56 commits behind. Every quotation below is read from
`origin/staging`, not from the working tree. Also read: the Objective Platform
handoff, the AI Readiness Inventory, `CLAUDE.md`, and the existing foundational
doctrine for Records, Relationships, Business Process, Objective,
Communications, Configuration and Operational Intelligence.

**Status: PLAN PROVISIONAL.** Four doctrinal conflicts (§11) bind the design of
the first slice. Everything not dependent on them is specified below; the parts
that are dependent are stated as explicit assumptions and must be ratified
before code is written.

---

## 1. Overall understanding of the platform

The Trust Platform claims one unowned responsibility in the Alloy OS:
**reasoning**. Records own truth, Relationships own identity, Business Process
owns operational work, Objective owns execution, Communications owns
conversation, Operational Intelligence owns measurement. Trust owns the step
between truth and execution — the reduction of uncertainty — and it owns that
step *for every capability*, exactly once.

Four things distinguish it from an "AI platform", and each is load-bearing:

1. **Reasoning is not intelligence.** Artificial intelligence is one
   implementation of a Reasoning Strategy. Deterministic rules, symbolic
   evaluation and knowledge retrieval are peers of it, and the *preferred*
   peers (Law 9, Decision 007). The platform's stated success metric is
   **reduction** in probabilistic reasoning over time (Law 11, Operational
   Learning's Constitutional Principle), not adoption of it.
2. **The interface is a contract, not a call.** Every consumer submits a
   **Decision Contract** describing *what decision must be made* — intent,
   decision class, context, information requirements, knowledge requirements,
   privacy policy, validation policy, economic constraints, success criteria.
   Contracts may never contain prompts, providers, models or API parameters.
3. **The output is a package, not an answer.** Every completed contract yields
   exactly one immutable **Decision Package**: recommendation, evidence,
   confidence, Trust Vector, validation results, economics, alternatives,
   learning metadata. Raw provider output never leaves the runtime. Failures —
   including refusals, budget exhaustion and privacy restrictions — are also
   Decision Packages.
4. **Trust is produced by governance, not by the model.** Confidence and Trust
   are deliberately separate (Decision 009). Validation is deterministic and
   independent of reasoning (Decision 008). Review requirements are declared by
   Decision Class, never determined by reasoning (Trust Governance).

The philosophical core — "software exists to reduce uncertainty between
intention and execution", and "every successful reasoning should eventually
become deterministic" — is unusually well-matched to Alloy's current state.
Alloy is almost entirely deterministic today. The doctrine does not ask Alloy to
become probabilistic; it asks Alloy to build the governed seam **before** any
probabilistic path carries traffic, and then to keep graduating what works back
into deterministic capability.

**The single most important consequence for implementation:** the Trust Runtime
is not an integration project. It is a *precondition*. It can and should be
built and certified with **zero live provider traffic**, because a Decision
Contract satisfied by a deterministic strategy is a first-class, fully
conforming execution of the runtime.

---

## 2. Runtime architecture summary

### Canonical flow

```
Consumer platform
      │  CreateDecisionContract()
      ▼
┌──────────────────────── TRUST RUNTIME ─────────────────────────┐
│  Decision Engine        contract lifecycle, one contract →     │
│                         exactly one package                    │
│  Classification Engine  information classes, sensitivity,      │
│                         decision class, privacy requirements   │
│  Retrieval Engine       truth · knowledge · policy · context   │
│  Privacy Engine         tokenize · abstract · segment ·        │
│                         summarize · aggregate → Reasoning      │
│                         Context                                │
│  Strategy Engine        deterministic → knowledge retrieval →  │
│                         classification → small → large →       │
│                         human review  (least-cost-sufficient)  │
│  Reasoning Runtime      capability resolution, provider        │
│                         resolution, reasoning graph, evidence, │
│                         confidence                             │
│  Validation Engine      deterministic verification, never      │
│                         dependent on reasoning                 │
│  Trust Engine           Trust Vector → Trust Score             │
│  Learning Engine        observations → learning candidates     │
└────────────────────────────────────────────────────────────────┘
      │  Decision Package (immutable)
      ▼
Governance  →  Human judgment  →  Objective Runtime  →  Truth
```

### Contract lifecycle

`Created → Accepted → Prepared → Executing → Validated → Packaged → Completed →
Archived`. Immutable once execution begins; new information produces a **new**
contract.

### Package lifecycle

`Created → Presented → Accepted | Rejected | Modified → Executed → Observed →
Archived`. The package itself is immutable; the lifecycle is therefore
necessarily an **append-only observation stream referencing** the package, not
mutation of it (see §11.2 — this reading requires ratification).

### Extension model

Platforms never extend the runtime. They **register**: Decision Classes,
Knowledge Providers, Reasoning Strategies, Validation Policies, Learning
Policies. A Decision Class is the unit of governance — it declares required
evidence, privacy requirements, validation policy, trust thresholds, review
requirements, learning policy and economic policy. This maps almost exactly onto
Alloy's existing registry idiom (Action Registry, `contributionHandlerRegistry`,
`requirementKindRegistry`, `interactionRegistry`, metric registry).

### Invariants the runtime must guarantee

One contract → one package · reasoning never modifies truth · validation is
deterministic · reasoning is explainable · provider independence · complete
auditability · reproducibility of *inputs and versions* · privacy policy
enforcement · platform-wide consistency.

---

## 3. Repository impact analysis

### Where it lands

| Concern | Location | Nature |
|---|---|---|
| Runtime kernel, contracts, packages | `web/lib/trust/` (new) | New |
| Decision Class registry | `web/lib/trust/decisionClasses/` | New |
| Reasoning strategies (incl. providers) | `web/lib/trust/reasoning/` | **Absorbs `web/lib/ai/`** |
| Privacy engine | `web/lib/trust/privacy/` | Absorbs `lib/ai/redaction.ts` |
| Persistence | `supabase/migrations/2026MMDDHHMMSS_trust_*` | New tables |
| Events | `emitEvent` → `workflow_events`, code-owned closed vocabulary | Extends existing |
| Consumer entry | `app/api/admin/trust/…` | New |

**No new event bus, audit ledger or workflow runtime.** The Objective Platform
established the correct precedent in M3: `workflow_events` remains the store,
the platform owns only the vocabulary, the payload contracts and the envelope.
Trust Runtime events (`DecisionRequested` … `LearningPromoted`) follow that
exact pattern, which also satisfies "these events feed Operational Intelligence"
for free — OI already reads `workflow_events`.

### New persistence (minimum for V1)

| Table | Why doctrine requires it |
|---|---|
| `trust_decision_contracts` | Contracts are immutable and replayable; reproducibility requires the contract itself (Trust Governance §Reproducibility) |
| `trust_decision_packages` | Packages are permanent operational artifacts; "historical Decision Packages are never modified" |
| `trust_decision_observations` | `CaptureOutcome()` — accepted/rejected/modified/overridden/deferred, append-only, referencing a package |
| `trust_reasoning_usage` | Economics: latency, strategy, escalation level, cache utilization, cost. The telemetry *schema* exists with no persistence (`retention_mode: "durable_future"`) — Economics and Governance both block on this |

Deferred beyond V1: `trust_knowledge_assets` / versions (Knowledge Platform),
`trust_learning_candidates` (Operational Learning). Both are separate platforms
in the corpus and neither is needed to prove the runtime.

### Existing code that moves or changes

| Module | Today | Impact |
|---|---|---|
| `lib/ai/providerTypes.ts` | Provider indirection, closed outcome set | Becomes internal to Reasoning Runtime; `AiProviderOutcome` widens toward package outcomes |
| `lib/ai/aiPolicy.ts` | Per-org policy from JSON metadata, defaults off | Becomes Decision-Class-aware; `AI_ALLOWED_FEATURES` gains a risk tier |
| `lib/ai/redaction.ts` | Deterministic, pure, path-aware, auditable `RedactionStep[]` | Becomes the Privacy Engine's transformation primitive |
| `lib/ai/aiUsageTelemetrySchema.ts` | Schema only | Gains persistence, becomes economics record |
| `lib/ai/aiEnrichmentPermissions.ts`, `aiEnrichmentRouteGuards.ts` | Permission + route gating, already separated from provider | Become Governance review-policy inputs |
| `lib/ai/enrichAttentionSuggestionStub.ts` | Deterministic enrichment | Becomes a **deterministic Reasoning Strategy** |
| `lib/ai/buildOperationalSummary.ts` | **Deterministic**, imported by `lib/queues/QueueService.ts` | **Misfiled today.** Deterministic operational code living under an AI namespace, consumed by a non-AI path. Must not be dragged into `lib/trust/` |
| `lib/pos/…/auditExistingChildCommit.ts` | Imports `redactObjectForAi` for **audit**, not AI | Same misfiling. Needs a privacy primitive that is not AI-namespaced |
| `lib/bos/auth/index.ts` | Re-exports AI policy/guards | Re-point at trust contracts |
| `lib/adminV2/viewModel/drawer/types.ts` | Imports `OperationalSummaryRiskHint` | Type-only; re-point |

### The boundary that must not move — verified, not assumed

`grep -rl 'lib/ai' lib/objective lib/adminV2/actions` returns **nothing** today.
The prohibited set — authorization, execution, permissions, business truth,
validation, record ownership — is structurally unreachable from the AI namespace
right now. Trust Runtime V1 must ship an **automated structural test** that
keeps this true for `lib/trust`, because the doctrine's "AI prohibited" class is
otherwise only a convention.

### Non-impacts (explicitly)

Objective Platform (M1–M6), Relationship Authority (P7.0), Participant Host,
Focus Composition, Interaction Registry, BOS routing and command convergence are
**complete** and are not touched. Trust Runtime is additive to all of them.

---

## 4. Existing systems that already partially satisfy the doctrine

Alloy is further along than "no Trust Platform" suggests. Ranked by how much
doctrine each already discharges:

| # | Existing system | Doctrine satisfied | Gap |
|---|---|---|---|
| 1 | **`lib/ai/redaction.ts`** | Privacy Runtime transformations; deterministic, pure, path-aware, returns auditable `RedactionStep[]` | No Information Classification above it; no tokenization (it *masks*, doctrine wants `John Smith → Guardian_1`); no coverage for subsidy ids, signature images, document binaries |
| 2 | **Objective authorization conjunction (M5)** | The disposition doctrine needs everywhere: *unevaluable REFUSES rather than passing by omission*; `authorization_basis` records which conjuncts were evaluated and how they decided, at one moment, for one Contribution | Not generalized; Objective-owned |
| 3 | **`objective_contributions` + `objective_contribution_effects` + `objective_attestations`** | A worked, DB-enforced precedent for *proposal → validation → authorization → evidence → immutable record*, with server-derived handlers the client cannot name | Objective-specific; not a reasoning artifact |
| 4 | **`lib/ai/providerTypes.ts`** | Provider independence; closed outcome set already includes `policy_denied` as a first-class result — literally the Trust Runtime's refusal vocabulary | Only OpenAI-compatible adapter implemented; `anthropic`/`azure_openai` are keys with no adapter |
| 5 | **`lib/ai/aiPolicy.ts`** | Economic/governance policy per org, from JSON metadata, **defaults fully off** | Flat `AI_ALLOWED_FEATURES` with no risk tier; no Decision Class axis; no budgets |
| 6 | **Action Registry + Command Runtime** | "Reasoning proposes, execution is separate": BOS prepares, the server validates/authorizes/executes through one registered path; `executePlatformCommandViaActionsApi` | Consumes proposals, not Decision Packages |
| 7 | **`classifyNonFormSource.ts`** | Confidence-honest reasoning that *declines to guess* | Confidence not separated from Trust; no package |
| 8 | **`operatorCorrection.ts`, `BosInputEvidence`, `objective_contributions.authorization_basis`** | Operational Learning observation substrate. `BosInputEvidence` already distinguishes `parsed_from_source` / `operator_edit` / `option_match` — the label a learning system needs and the hardest thing to retrofit | Captured operationally, never modelled as learning candidates; no promotion path |
| 9 | **Deterministic assist paths** (Task Assist, Workflow Assist, Config Layout Assist, BOS intake, Processing extraction/classification) | Law 9 / Decision 007 already honoured — several state "no LLM" in their own headers | Not expressed as Reasoning Strategies; each is its own seam |
| 10 | **`workflow_events` + `emitEvent`** | Runtime events feeding Operational Intelligence | No DB-level immutability on the shared table (a deliberate prior refusal) |
| 11 | **OCR (`ocrExtract.ts`)** | Privacy by minimization at the highest-risk surface: WASM tesseract + mupdf, model in-repo, works offline — the most sensitive content in Alloy never leaves the machine | No region/page abstraction, so "send only the flagged region" has nothing to name |
| 12 | **Metric registry / MetricEngine** | Operational Intelligence "measures reasoning, never performs it" — and already refuses LLM-computed KPIs | No trust/economics metrics yet |

**Net:** policy, redaction, provider indirection, telemetry contract, refusal
semantics, permission gating and a deterministic fallback for *every* proposed
consumer all exist. What does not exist is the **kernel** — contracts, packages,
classification, strategy selection, trust evaluation — and any **persistence**.

---

## 5. Required new runtime components

Ordered by dependency. Bracketed labels mark what V1 needs versus later.

| # | Component | Responsibility | V1? |
|---|---|---|---|
| 1 | **Decision Contract type + builder** | Six sections: intent, decision class, context, information/knowledge requirements, constraints, success criteria. Invariants: no prompt, provider, model or API parameter may be representable in the type | **V1** |
| 2 | **Decision Class Registry** | Code-owned, closed. Per class: required evidence, privacy requirements, validation policy, trust threshold, review policy, learning policy, economic policy, risk tier | **V1** |
| 3 | **Decision Engine** | Contract lifecycle; guarantees one contract → exactly one package; immutability after execution begins | **V1** |
| 4 | **Information Classification** | Eight classes (Identity, Relationship, Operational, Financial, Compliance, Communications, Behavior, Knowledge); one primary class per element; classification by meaning, never by field/table/document | **V1** |
| 5 | **Privacy Engine** | Requirements → retrieve → classify → apply policy → transform → construct Reasoning Context. Identity tokenization with a runtime-internal mapping; progressive disclosure | **V1** |
| 6 | **Strategy Engine** | Deterministic strategy selection; least-cost-sufficient ordering; deterministic escalation ladder | **V1** |
| 7 | **Reasoning Runtime** | Capability resolution → provider resolution → reasoning steps → evidence → confidence. Provider selection strictly internal and strictly after strategy selection | **V1** (deterministic strategy only) |
| 8 | **Validation Engine** | Deterministic verification of the proposal, independent of reasoning, versioned | **V1** |
| 9 | **Trust Engine** | Trust Vector (grounding, privacy, evidence, validation, reliability, human oversight) → Trust Score. Separate from confidence | **V1** |
| 10 | **Decision Package builder** | Immutable artifact; failure outcomes are packages too | **V1** |
| 11 | **Economics recorder** | Latency, strategy, escalation level, cache utilization, cost per decision | **V1** |
| 12 | **Runtime event vocabulary** | Closed set over `workflow_events`, code-owned, atomic where the Objective precedent requires it | **V1** |
| 13 | **`CaptureOutcome()`** | Append-only observation referencing a package | **V1** |
| 14 | **Governance / review policy resolver** | Deterministic review requirement per Decision Class; recommendations requiring review never execute automatically | **V1** |
| 15 | **Budget enforcement** | Org / process / class / capability / contract budgets; exhaustion never bypasses governance | V2 |
| 16 | **Scheduler** | Immediate / deferred / background / retry / escalated / cancelled | V2 |
| 17 | **Knowledge Platform** | Immutable versioned Knowledge Assets, categories, providers, deterministic retrieval, attribution | V2 |
| 18 | **Probabilistic strategies + provider adapters** | LLM strategy; Anthropic adapter; strategy-private, versioned prompt store | V2 |
| 19 | **Cache** | Knowledge retrieval, document transformations, reasoning context, intermediate results | V2 |
| 20 | **Learning Engine + promotion + graduation** | Observations → candidates → evidence → review → promotion → Knowledge Asset → deterministic graduation | V3 |
| 21 | **Replay** | Re-execute a historical contract at current versions, producing a *new* package | V3 |

---

## 6. Required refactoring

| # | Refactor | Why | Size | Blocking |
|---|---|---|---|---|
| 1 | **Extract deterministic utilities out of `lib/ai/`** — `buildOperationalSummary.ts` (used by `QueueService`) and the audit use of `redactObjectForAi` | Deterministic operational code is misfiled under an AI namespace and consumed by non-AI paths. Moving `lib/ai` wholesale into `lib/trust` would drag the queue and the Processing commit audit into the reasoning platform | Small | Do first — it de-risks everything after |
| 2 | **Give `AI_ALLOWED_FEATURES` a risk tier** | Doctrine's classes — mandatory / fallback / convenience / **prohibited** — must be a first-class axis, and Decision Class must carry it. Flagged as debt in the Objective handoff and the AI inventory | Small | Before the first Decision Class |
| 3 | **Introduce Information Classification above redaction** | `redaction.ts` classifies by *key regex*, i.e. by field. Doctrine: "Information is classified by meaning. Never by field." Redaction stays as the transformation; classification moves above it | Medium | Before any Privacy Engine claim |
| 4 | **Tokenization, not masking** | Today `John Smith → J. S…`. Doctrine: `John Smith → Guardian_1`, with the mapping internal to the runtime. Masking destroys referential structure the reasoning needs | Medium | Before the first probabilistic strategy |
| 5 | **Persist telemetry** | `retention_mode: "durable_future"` means no persistence. Economics, Governance audit and reproducibility all block on this | Medium | V1 |
| 6 | **Prompt handling** | The AI inventory recommends a *prompt registry*; the Reasoning Runtime lists "treat prompts as platform primitives" and "store prompts as operational artifacts" as **anti-patterns**. Resolution: prompts are private to a Reasoning Strategy and versioned as its Strategy Version. Doctrine supersedes the inventory recommendation here | Medium | Before the second probabilistic consumer |
| 7 | **Redaction coverage gaps** | No handling for subsidy identifiers, signature images, document binaries — exactly the Processing payloads | Medium | Blocks any Processing Decision Class |
| 8 | **Processing segmentation** | No region/page abstraction, so "send only the flagged region" has nothing to name. Document *regions* are ~108k ops/yr, the dominant volume | Large | Blocks Processing entirely |
| 9 | **Provider adapters** | `anthropic` and `azure_openai` are in the key union with no adapter; `liveProviderAdapterPlaceholder.ts` is a design note | Medium | V2 |
| 10 | **`workflow_events` immutability** | Objective events are append-only by construction and test only; the platform deliberately declined an Objective-only trigger on a shared table. Trust's own tables must carry their own DB-level immutability rather than repeat that gap | Small | V1, on new tables |

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Scope explosion from Law 1.** "No capability may implement independent reasoning outside the Trust Platform" + "deterministic" listed as a Reasoning Strategy ⇒ a literal reading pulls the Stage Resolver, Action Evaluator, Participation Resolver, `classifyNonFormSource`, `documentFacts`, the Objective authorization conjunction and every validator into the Trust Runtime. That is a multi-quarter rewrite of certified, working systems and would violate Decision 008 (validation independent of reasoning) | **Critical** | **§11.1 — blocking clarification.** Need an explicit Reasoning Boundary Test before any consumer migrates |
| 2 | **Merge risk.** This branch is 23 ahead / 56 behind `origin/staging`, unpushed and unmerged, and holds the entire Objective Platform. Building a second platform on top compounds an already-flagged "single biggest merge risk" | **High** | Rebase and re-certify the Objective Platform **before** Trust code lands, or land Trust on a branch forked from current staging |
| 3 | **The Trust Runtime becomes the one place PII can leak.** Today the blast radius of a privacy bug is one stubbed, disabled feature. After V1 it is every consumer | **High** | Privacy Engine certified independently, adversarially, with a "no raw identity may reach a strategy" DB/unit invariant; ship with policy still defaulting off |
| 4 | **Unbounded cost.** Economics doctrine mandates budgets; there is no persistence, no budget model and no cost surface today. Volume is dominated by document regions (~108k/yr) and semantic search (~375k/yr) — both currently zero, both easy to switch on | **High** | No probabilistic strategy ships before persisted economics and a hard per-class ceiling |
| 5 | **Certifying a live path that has never carried traffic.** All four prerequisites exist and none has run in production. A live provider cannot be certified without either a real key or recorded-fixture provider | Medium | Recorded-fixture provider adapter as a certification artifact; live path certified separately and last |
| 6 | **Immutability by convention.** Objective learned this: append-only "by construction and tests" on a shared table is weaker than a trigger | Medium | DB-level immutability + append-only triggers on all four Trust tables, following the M1/M4 precedent |
| 7 | **Doctrine ratified faster than it is proven.** Fifteen documents were published `status: canonical` in one day with no implementation. Several forward-reference platforms that do not exist (Validation Runtime, Objective Platform doctrine, Records Platform doctrine — all TODO links) | Medium | Treat V1 as the ratification instrument: what the slice cannot express is a doctrine defect, reported, not worked around |
| 8 | **Two "Objective Platform" meanings.** The corpus repeatedly calls the Objective Platform the *execution* platform. Alloy's Objective Platform is a **participant-obligation orchestration layer** that "owns no business truth" — it is not the general execution runtime; Command Runtime is. A Decision Package cannot simply be "handed to the Objective Runtime" | Medium | §11.4 — needs naming resolution before any package→execution wiring |
| 9 | **Regression of certified deterministic paths.** The deterministic paths in production are the thing worth protecting | Medium | Every consumer migration is additive: deterministic path stays the default until its Decision Class is certified |

---

## 8. Recommended implementation sequence

**Phase 0 — Ratification (no code).** Resolve §11.1–§11.4. Rebase the Objective
Platform onto current `origin/staging` and re-certify, or fork Trust from
staging. *Exit: four answers recorded; a clean base.*

**Phase 1 — Kernel, deterministic only.** Contract type, Decision Class
registry, Decision Engine, Information Classification, Privacy Engine, Strategy
Engine (deterministic only), Validation Engine, Trust Engine, Package builder,
four tables with DB-enforced immutability, event vocabulary, `CaptureOutcome()`,
structural boundary test. **No provider is wired. No AI exists in Phase 1.**
*Exit: one contract → one package, proven end to end, with zero network egress.*

**Phase 2 — Governance and economics.** Review policy resolver, persisted
economics, per-class budget ceilings, refusal outcomes as packages, Operational
Intelligence metrics (Trust Score, cost per decision, deterministic resolution
rate, review rate, override rate). *Exit: a package that requires review cannot
execute; a class that exceeds budget refuses.*

**Phase 3 — First probabilistic strategy.** LLM strategy behind the existing
policy layer, escalation ladder deterministic→small→large→human, tokenization,
recorded-fixture provider for certification. Consumer: attention enrichment
only. *Exit: the live seam runs through the runtime, still off by default.*

**Phase 4 — Knowledge Platform.** Immutable versioned Knowledge Assets,
categories, providers, deterministic retrieval, attribution in packages.

**Phase 5 — Second consumer, in risk order.** Communications rewrite (lowest
risk: unwired, cosmetic failure) → BOS entity grouping and ambiguity detection
(medium: PII, deterministic fallback exists) → Search (high volume, greenfield)
→ Processing document understanding (**last**: highest risk, blocked on
segmentation and redaction coverage).

**Phase 6 — Operational Learning.** Observations → candidates → evidence →
review → promotion → Knowledge Asset → graduation. Built on `BosInputEvidence`
and `operatorCorrection.ts`, which already carry the provenance labels.

**Rationale for this order.** It is the doctrine's own preference order made
into a schedule: deterministic before probabilistic, governance before
capability, cheapest-and-least-risky consumer first, and the highest-risk
surface (child identity, DOB, signatures on scanned documents — currently
processed entirely on-premises) touched only after segmentation exists.

---

## 9. Suggested vertical slices

### Slice 1 — `attention_suggestion_enrichment`, deterministic strategy

**The smallest complete vertical slice of Trust Runtime V1.**

One Decision Class. One consumer — the enrichment route, today the *only* live
LLM seam in the repository and stubbed by default. One Reasoning Strategy:
`deterministic`, implemented by promoting the existing
`enrichAttentionSuggestionStub.ts` to a registered strategy.

Full path exercised: `CreateDecisionContract` → classify → privacy-transform →
select strategy (deterministic) → reason → validate → Trust Vector → build
Decision Package → persist contract + package + economics → emit events →
present → `CaptureOutcome`.

Why this one:

- It is **complete** — every runtime engine participates, none is stubbed out of
  the path.
- It is **provable with no provider**, so it certifies the kernel without any
  network egress, any key, or any cost.
- It has a **guaranteed deterministic fallback** because the deterministic path
  *is* the implementation.
- Failure is **cosmetic** — operator-facing wording only.
- It touches **nothing prohibited** — no authorization, execution, permission,
  truth, validation or record ownership.
- Everything it needs already exists in some form: policy, redaction, permission
  guards, route guards, a Zod-validated envelope, telemetry contract.

Explicitly out of Slice 1: knowledge retrieval, alternatives, budgets,
scheduler, learning promotion, replay, any provider.

### Slice 2 — same class, probabilistic strategy + escalation

Adds the LLM strategy, the deterministic escalation ladder, tokenization and the
recorded-fixture provider. Proves Law 9 operationally: the runtime must be shown
*choosing* the deterministic strategy when it suffices, and escalating only when
it does not.

### Slice 3 — `communication_draft`

Second Decision Class, second consumer, first genuinely new capability
(`messagingComposerBosEnhance.ts` currently ships a documented gap message).
Proves the platform claim that a new consumer registers rather than builds.

### Slice 4 — `knowledge_grounded_explanation`

First Knowledge Platform consumer; proves versioned attribution in a package.

### Slice 5 — `bos_entity_grouping`

Highest-value AI application identified in the readiness inventory ("Avery is
the parent, Joey is the child"), with the existing rule parser as the certified
fallback and ambiguity *shown, never guessed*.

---

## 10. Certification strategy

Mirror what the Objective Platform proved, because it worked: **invariants in
the database, derived state never persisted, refusal as the default, and
authored content that cannot become a program.**

### Layers

| Layer | Instrument | Asserts |
|---|---|---|
| **DB invariants** | SQL suite per migration, run on an isolated project against the full migration chain | Packages immutable after creation; contracts immutable after execution begins; observations append-only; exactly one package per completed contract (enforced, not asserted in service code) |
| **Type invariants** | Typecheck + unit | A Decision Contract *cannot represent* a prompt, provider, model or API parameter. This is the "authored content cannot become a program" property, applied to contracts |
| **Structural boundary** | Automated import test in CI | Nothing in `lib/objective/`, `lib/adminV2/actions/`, relationship-authority modules or validation paths imports `lib/trust`. The "AI prohibited" class becomes enforced, not conventional |
| **Refusal-by-default** | Adversarial unit suite | Every failure mode — unable to reason, insufficient information, conflicting knowledge, provider failure, budget exceeded, privacy restriction, validation failure — yields a **Decision Package**, and **zero** operational mutation. Disabled policy refuses. Unknown Decision Class refuses. Unevaluable trust refuses |
| **Privacy** | Unit + property test | No value classified `Identity` reaches a strategy in raw form under any policy; `RedactionStep[]` accounts for every transformation; the tokenization map never leaves the runtime |
| **Determinism preference** | Unit | Given a contract satisfiable deterministically, the Strategy Engine selects deterministic. Escalation occurs only on a recorded insufficiency, never on provider preference |
| **Reproducibility** | Integration | A persisted contract + recorded knowledge/strategy/validation/runtime versions re-executes; replay produces a **new** package and never mutates the historical one |
| **Economics** | Integration | Every package carries strategy, latency, escalation level, cache utilization; a class at its ceiling refuses rather than exceeding |
| **Consumer** | Browser QA | The operator sees a Decision Package — recommendation, evidence, remaining uncertainty — never raw provider output |
| **Non-regression** | Existing suites | Objective (M1 19/19, deletion 9/9, M6 28/28, P7.0 15/15, authority integration 12/12), BOS, typecheck rc=0 |

### Certification rules carried forward from the Objective Platform

1. **Historical suites are never rewritten.** If a later slice supersedes an
   earlier assertion, the failure is documented with its supersession reason —
   rewriting destroys the evidence that the earlier milestone was ever true.
2. **Baselines are measured, not remembered.** Pre-existing failures are proven
   pre-existing by a scoped base-vs-branch comparison with identical
   dependencies.
3. **A failed read is never an empty result.**
4. **Certification runs on an isolated Supabase project against the full
   migration chain**, not against a shared stack.

### Known-red inheritance

M2/M3/M4/M5 SQL suites **fail by design** (documented supersession) and three
`tests/bos/` failures are pre-existing — 0 commits in this branch touch any
module they exercise. Trust Runtime certification must not silently absorb
these.

---

## 11. Blocking clarifications — architectural, not implementation

Per the mission's own instruction, work stops here rather than resolving these
by interpretation. Each changes the shape of Slice 1.

### 11.1 — What counts as "reasoning"? (Critical)

Law 1: *"No capability may implement independent reasoning outside the Trust
Platform."* Law 16: *"No parallel reasoning runtime may exist."* Decision 013:
*"The Trust Runtime is the only reasoning runtime inside Alloy."*

But the Strategy Engine lists **`deterministic`** and **`rule evaluation`** as
Reasoning Strategies, and Trust Economics' preferred order *begins* with
Deterministic.

Read literally, every deterministic inference in Alloy is reasoning and must be
routed through the Trust Runtime: the Stage Resolver, the Action Evaluator, the
Participation Resolver, `classifyNonFormSource`, `documentFacts`, the Objective
authorization conjunction, the relationship-authority resolver, every validator.
That is a rewrite of certified systems, and it directly contradicts Decision 008
("validation never belongs to reasoning") and the readiness inventory's
prohibited class.

**Question.** Does "reasoning" mean *any* inference, or specifically *the
reduction of operational uncertainty where the outcome is not determined by
configuration, rules or authoritative truth*? Equivalently: is there a
**Reasoning Boundary Test** that tells an engineer whether a given computation
must become a Decision Contract? Without it, every subsequent scoping decision
is a guess.

*Assumption if unanswered:* the narrow reading — a computation is reasoning only
when its outcome is **not** determined by configuration, rules or authoritative
truth. Certified deterministic engines stay where they are; the Trust Runtime's
`deterministic` strategy means *a Decision Contract may be satisfied without
probability*, not *all determinism is a contract*.

### 11.2 — Immutable Decision Packages with a mutable lifecycle

`decision-package.md` states both *"Decision Packages are immutable"* /
*"Historical Decision Packages are never modified"* **and** a lifecycle
`Created → Presented → Accepted → Rejected → Modified → Executed → Observed →
Archived`, plus Learning Metadata carrying outcomes (Accepted / Rejected /
Modified / Overridden / Deferred).

**Question.** Is the lifecycle an append-only **observation stream referencing**
an immutable package (which `CaptureOutcome()` supports), or does the package
row itself carry a mutable lifecycle column? These produce different schemas and
different immutability triggers.

*Assumption if unanswered:* append-only observations; the package row is
insert-only with no updatable column.

### 11.3 — Runtime step order: Knowledge before Privacy, or after?

Three canonical documents state the order three ways:

| Document | Order |
|---|---|
| `trust-platform.md` (front door) | Information Retrieval → **Privacy Transformation** → **Knowledge Retrieval** → Reasoning |
| `trust-runtime.md` (lifecycle) | Prepared → **Knowledge Retrieved** → **Privacy Transformed** → Reasoning |
| `reasoning-runtime.md` (position) | Contract → **Knowledge Retrieval** → **Privacy Runtime** → Reasoning |

`privacy-runtime.md`'s own lifecycle omits knowledge retrieval entirely.

This is not cosmetic: it determines whether knowledge retrieval may be
parameterized by privacy-transformed context, and both `trust-runtime.md` and
`reasoning-runtime.md` declare "update only when the runtime lifecycle changes"
— so the order cannot be chosen by an implementer.

**Question.** Which ordering is canonical, and should the other two documents be
corrected?

*Assumption if unanswered:* the front door governs — privacy transformation
precedes knowledge retrieval, since knowledge is by definition non-customer and
retrieving it against a minimized context is strictly safer.

### 11.4 — Three owners for Trust Evaluation, and one undefined Validation Runtime

Alloy's own standing law is *one canonical owner per concern*
(`platform-decisions.md`, 2026-07). The Trust corpus assigns **Trust
evaluation** to three:

- `trust-runtime.md` — a **Trust Engine** inside the Trust Runtime
- `reasoning-runtime.md` — *"The runtime owns … trust evaluation"*
- `trust-governance.md` — *"The Trust Governance Platform owns … trust
  evaluation"*

Separately, `trust-runtime.md` places **Validation** as an *engine inside* the
Trust Runtime, while `reasoning-runtime.md` lists a **Validation Runtime** as a
*peer runtime* alongside Privacy, Reasoning and Objective — with a TODO link to
doctrine that does not exist.

And throughout the corpus, *"the Objective Runtime executes approved Decision
Packages."* In Alloy, the Objective Platform is a participant-obligation
orchestration layer that explicitly **owns no business truth**; general
operational execution belongs to **Command Runtime** via
`POST /api/admin/actions/execute`. A Decision Package cannot be handed to the
Objective Runtime for execution in the general case.

**Questions.** (a) Who owns Trust evaluation? (b) Is Validation an engine of the
Trust Runtime or a peer runtime requiring its own doctrine? (c) Does "Objective
Runtime" in the Trust corpus mean Alloy's Objective Platform, or the general
execution runtime — and if the latter, should the corpus say Command Runtime?

*Assumptions if unanswered:* (a) the Trust Engine computes the Trust Vector,
Governance sets the thresholds and review policy that consume it; (b) Validation
is an engine of the Trust Runtime in V1, with a peer runtime deferred until its
doctrine is published; (c) execution means Alloy's **Command Runtime**, and the
corpus's "Objective Runtime" is a naming collision to be corrected.

---

## What was deliberately not done

No Trust Runtime code. No AI added. No schema. No prompt. No pipeline change. No
modification to the Objective Platform, Relationship Authority, the participant
Host, Focus Composition, the Interaction Registry, or BOS routing. No
architecture was redesigned and no platform primitive was invented — §11 reports
conflicts rather than resolving them. Nothing pushed, merged or rebased.

## Related

- [`docs/platform/trust/`](../../trust/) — the 16-document Trust Platform corpus
  (**on `origin/staging`, not on this branch**)
- [`AI-READINESS-INVENTORY.md`](./AI-READINESS-INVENTORY.md)
- [`../objective-platform/OBJECTIVE-PLATFORM-HANDOFF.md`](../objective-platform/OBJECTIVE-PLATFORM-HANDOFF.md)
