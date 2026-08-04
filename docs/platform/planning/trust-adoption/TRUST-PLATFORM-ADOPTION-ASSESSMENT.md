---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-04
supersedes: []
---

# Trust Platform Adoption — Assessment and Program Plan

**Deliverable 1 of the Trust Platform Adoption Program, revised after architecture-owner
acceptance.** Assessment, architecture and plan only. **No production code changed.**

**Base:** `origin/staging` @ `e10d5af60`. Worktree `wt1-trust-platform-adoption`,
branch `agent/claude/1-trust-platform-adoption`.

**Mission.** Not to extend the Trust Platform — Trust Platform doctrine and Trust
Runtime V1 are complete and merged. To convert Alloy into a **Trust-native operating
system**: every capability that resolves ambiguity submits a Decision Contract,
every recommendation is one immutable Decision Package, and reasoning exists exactly
once.

---

## 0. Accepted architecture decisions

Ratified by the architecture owner, 2026-08-04. These are binding on every phase
below and on every slice document that descends from this plan.

### AD-1 — Rollout sequence

```text
Phase 0  Adoption Foundation
Phase 1  Processing — deterministic convergence
Phase 2  Communications — probabilistic proving slice
Phase 3  BOS Create Lead — proposal lifecycle convergence
Phase 4  Configuration Assist
Phase 5  Search
Phase 6  Processing — document understanding
Phase 7  Operational Intelligence — explanation and learning
Phase 8  Participant Runtime
```

**Operational Intelligence execution *measurement* belongs to Phase 0.** OI
*explanation* and *learning* remain Phase 7. The split is doctrinal: measurement is
what OI *is* (`platform-integration.md` — "Operational Intelligence never performs
reasoning. It measures reasoning."); explanation is OI *consuming* Trust.

### AD-2 — Privacy tokenization

Tokenization means **reversible, org-scoped, vault-backed opaque tokens with
server-only, permission-checked rehydration.**

**One-way pseudonyms remain a separate transformation** for cases that never
require rehydration.

Consistent with `privacy-runtime.md` §Identity Tokenization — *"Identity is never
removed. Identity is replaced… Identity mapping remains internal to the runtime."*
No doctrine amendment required. This makes `tokenize` and `pseudonymize` two
distinct entries in `TransformationPolicy`, not one.

### AD-3 — `BosProposalEnvelopeV1` becomes a presentation projection

`BosProposalEnvelopeV1` becomes a **presentation projection of one canonical
immutable Decision Package**. It **must not own an independent mutable lifecycle**.

Review, rejection, acceptance, expiration and execution become **append-oriented
records/events referencing the package** — `trust_decision_observations` plus the
Trust event vocabulary on the `workflow_events` spine.

**All proposed mutations reference registered Operational Commands.** A
recommendation names a command key; it never carries an executable payload. This
is Law 3 and Decision 022 made structural.

### AD-4 — No broad route rename in Phase 0

`app/api/admin/ai/**` is **not** broadly renamed in Phase 0. New canonical
endpoints use Trust/reasoning-native naming. Existing AI routes may temporarily
remain as **thin compatibility adapters with no independent logic** — they resolve
authorization, delegate, and shape the response. Any route that still contains
policy branching, provider selection or proposal assembly has not been converted.

---

## 1. Program shape — Converge, Enable, Adopt

The single most important correction this assessment makes to the intuitive framing
of the program: **Alloy has almost no AI to migrate.** It has a great deal of
*ungoverned proposal-making* to converge.

There is exactly **one** live provider egress path in the repository, it is off by
default, and `openAiCompatibleStructuredProvider` has **zero call sites outside
`lib/ai/` and its own tests**. Meanwhile Alloy runs **eleven** deterministic engines
that resolve ambiguity and emit confidence, across **four** different persistence
models.

The program therefore has three distinct tracks, which must not be confused with one
another because they have different risk profiles, different owners and different
certification needs.

| Track | Question it answers | Nature | Risk profile |
|---|---|---|---|
| **CONVERGE** | Where does Alloy already produce recommendations, and how do they become one canonical Decision Package? | Refactor of existing, working, operator-visible behaviour | **Regression risk.** Behaviour must be provably unchanged |
| **ENABLE** | What can the Trust Runtime not yet do that adoption requires? | New runtime capability inside `lib/trust` | **Architectural risk.** Wrong seam is expensive later |
| **ADOPT** | Which capability submits which Decision Contract, when? | Capability-by-capability use cases | **Sequencing risk.** Order determines what is proven on what data |

Phase 0 is almost entirely **ENABLE**, with the two **CONVERGE** contracts
(lifecycle projection, execution binding) that every later phase depends on.

---

## 2. Evidence base

### 2.1 Existing reasoning already present in Alloy

Applying the [Reasoning Boundary Test](../../trust/trust-platform-manifesto.md)
(1: changes durable state → execution authority; 2: applies authoritative rules or
calculates known truth → existing deterministic owner; 3: resolves ambiguity or
produces a proposal under uncertainty → **Trust Platform**).

**Clause 3 — reasoning, present today, ungoverned:**

| # | Engine | Module | Uncertainty it resolves | Confidence? | Persistence today |
|---|---|---|---|---|---|
| R1 | Non-form source classification | [classifyNonFormSource.ts](../../../../web/lib/pos/processingCase/classification/classifyNonFormSource.ts) (180 ln) | "What kind of document is this?" | **Yes** — weighted signals, capped 0.95, honest `unknown` | `processing_case_classification` |
| R2 | Canonical identity resolution | [canonicalResolutionEngine.ts](../../../../web/lib/pos/processingIdentity/canonicalResolutionEngine.ts) (302 ln) | "Is this the same family/child as an existing record?" | **Yes** — 6-band + signals + blocking conflicts | `processing_resolutions` |
| R3 | Household graph candidates | [generateCandidates.ts](../../../../web/lib/identity/generateCandidates.ts) (277 ln), [signals.ts](../../../../web/lib/identity/signals.ts) | Candidate ranking under ambiguous identity | **Yes** — `IDENTITY_RESOLVER_VERSION` pinned | in-flight |
| R4 | Free-text fact extraction | [extractFactsFromText.ts](../../../../web/lib/intake/extract/extractFactsFromText.ts) (857 ln) | "What facts are in this operator's prose?" | **Yes** — per-candidate | in-flight |
| R5 | Fact → intake-field mapping | [mapFactsToActionIntake.ts](../../../../web/lib/intake/map/mapFactsToActionIntake.ts), [buildProposals.ts](../../../../web/lib/intake/resolve/buildProposals.ts) | "Which configured field did they mean?" | **Yes** + review warnings | in-flight |
| R6 | Commit recommendation | [recommendationBuilder.ts](../../../../web/lib/pos/processingIdentity/operator/recommendationBuilder.ts) (482 ln) | "What should the operator do with this case?" | **Yes** | `processing_*` plan tables |
| R7 | Needs-attention suggestion | [buildNeedsAttentionSuggestion.ts](../../../../web/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion.ts) | "What deserves attention, and what next?" | Yes | ephemeral projection |
| R8 | Task Assist proposal | [taskAssistDeterministicProposal.ts](../../../../web/lib/agent/taskAssist/taskAssistDeterministicProposal.ts) | "What message/task does this operator intend?" | `confidence: { mode: "deterministic" }` | **`task_assist_proposals`** |
| R9 | Config Layout Assist proposal | [configLayoutAssistPropose.ts](../../../../web/lib/agent/configLayoutAssist/configLayoutAssistPropose.ts) (416 ln) | "What configuration change did they ask for?" | Yes + risk level | **`config_layout_assist_proposals`** |
| R10 | Entity search disambiguation | [taskAssistEntitySearchService.ts](../../../../web/lib/agent/taskAssist/taskAssistEntitySearchService.ts) (689 ln), [globalRecordSearchService.ts](../../../../web/lib/admin/globalSearch/globalRecordSearchService.ts) (683 ln) | "Which record did they mean?" | Ranking + dedupe + disambiguation | ephemeral |
| R11 | Packet review insight | [buildPacketReviewInsightV1.ts](../../../../web/lib/forms/packets/buildPacketReviewInsightV1.ts) (226 ln) | "What is wrong with this packet?" | Yes | ephemeral |

**~4,200 lines of clause-3 reasoning**, none producing a Decision Package, none
replayable, none carrying a privacy report or trust vector. Only **R7** is governed
today, and only along its enrichment overlay.

**Clause 1 and 2 — explicitly not Trust's.** Recorded so the program does not
over-reach; Decision 019 is explicit that *determinism alone never triggers
migration*.

- **Clause 1 (execution):** [platformTransaction.ts](../../../../web/lib/platform/transaction/platformTransaction.ts) — the one execution
  pipeline (`validate → persist → business_process → activity → relationships →
  cache_invalidation → recomposition`, compensating saga on abort). This is the
  authority a Decision Package is evidence *for*. It never moves.
- **Clause 2 (authoritative rules / known truth):** `lib/operationalCalculations/`,
  `lib/operationalExpectations/`, `lib/operationalQuestions/`, permission
  resolution, stage resolution, eligibility, `createLeadIntakeValidation`,
  Relationship Authority. **All stay.** Several become *validators the Trust Runtime
  calls out to* — a different thing from migration.

### 2.2 Trust Runtime V1 as actually built

| Extension point | Registered today |
|---|---|
| Decision Classes | **1** — `attention_suggestion_enrichment` |
| Reasoning Strategies | **1** — deterministic, escalation level 0 |
| Privacy Policies | **1** — `attention_suggestion_minimization_v1` |
| Validation Policies | **1** — one call-out into `lib/ai` |
| Knowledge Providers | **1** — `createEmptyKnowledgeProvider`, returns `[]` always |
| Consumers | **1** — attention suggestion enrichment |
| Learning | **none** — `learning_policy_key` always `none_v1` |

2,279 lines in `lib/trust`. The **architecture is complete and certified; the
registry is empty.** That is the correct V1 outcome and the exact starting condition
adoption assumes.

### 2.3 The three structural blockers

**B-1. The runtime cannot host anything above escalation level 0.**
`ReasoningStrategyV1.reason()` is **synchronous**
([reasoningStrategy.ts:68](../../../../web/lib/trust/reasoning/reasoningStrategy.ts)),
called without `await` at [trustRuntime.ts:235](../../../../web/lib/trust/runtime/trustRuntime.ts).
Validation call-outs `invoke()` are synchronous too
([validationOrchestrator.ts:41](../../../../web/lib/trust/validation/validationOrchestrator.ts)).
No provider strategy and no I/O-bearing domain validator is expressible.

**B-2. Cost is not representable in TypeScript — but the database is already
correct.** `provider_cost_units` is typed as the **literal `0`**
([decisionPackageTypes.ts:50](../../../../web/lib/trust/package/decisionPackageTypes.ts)).
The column, however, is `numeric NOT NULL DEFAULT 0`, and `economics` is `jsonb`.
**No migration is required to record non-zero cost — only a type widening.** This
materially reduces the size of that work versus the first assessment.

**B-3. Four parallel representations of "a recommendation with a lifecycle" exist,
and one contradicts a frozen decision.** See the migration inventory in §3.

### 2.4 The single provider integration, in full

| # | Integration | State | Disposition |
|---|---|---|---|
| A1 | `openAiCompatibleStructuredProvider` → `api.openai.com` | **The only egress path.** Reached only via `enrichAttentionSuggestionStubEnvelope` when `ai_policy.provider === "openai"` | Becomes a Reasoning Strategy behind the Strategy Engine. Never called from a route again |
| A2 | `enrich-attention-suggestion`, non-openai branch | **Already governed** — Trust Runtime V1 Slice 1 | Done |
| A3 | `enrich-attention-suggestion`, openai branch | Still bypasses Trust ([route.ts:189](../../../../web/app/api/admin/ai/enrich-attention-suggestion/route.ts)) | Migrate or delete — Phase 2 |
| A4 | `createStubAiProvider`, `createDisabledAiProvider` | Stub + disabled providers | Retire; runtime refusal outcomes replace them |
| A5 | `liveProviderAdapterPlaceholder`, `providerAdapterDesign` | Design notes, never invoked | Delete or fold into the provider registry |
| A6 | OCR — `ocrExtract.ts`, tesseract WASM + mupdf | Local, in-process, **no egress** | **Stays in Processing.** Not reasoning |
| A7 | `messagingComposerBosEnhance` | Unwired; ships a gap message | Becomes `communication_draft_generation`'s first consumer — Phase 2 |
| A8 | Embeddings / semantic search | **Does not exist** — no `vector`, no pgvector, no embedding column anywhere | Greenfield — Phase 5 |
| A9 | Local model inference (Layer 1) | **Does not exist** — no ollama, llama.cpp, ONNX or local inference host in the repository | New infrastructure — Phase 2 |

**Consequence: Alloy can adopt Trust without ever regressing a production AI
feature.** There is nothing live to break. This is a one-time window and it shapes
the whole sequence.

---

## 3. CONVERGE — migration inventory

Every representation in Alloy that carries "a recommendation a human may act on".
This table is the authoritative convergence register; each phase closes rows in it.

| ID | Representation | Current owner (code) | Storage | Lifecycle today | Consumers | Convergence phase | Target |
|---|---|---|---|---|---|---|---|
| **M1** | `trust_decision_packages` | [trustDecisionRepository.ts](../../../../web/lib/trust/persistence/trustDecisionRepository.ts) | `trust_decision_packages` | **Immutable at creation**; observations append-only | Trust consumers | — (canonical) | **Is the target** |
| **M2** | `BosProposalEnvelopeV1` | [bosProposalEnvelope.ts](../../../../web/lib/bos/bosProposalEnvelope.ts), [bosProposalLifecycle.ts](../../../../web/lib/bos/bosProposalLifecycle.ts), [bosProposalStatusMap.ts](../../../../web/lib/bos/bosProposalStatusMap.ts) | **In-memory** | **Mutable `status`**: `draft → validated → approved → applied \| rejected \| superseded \| failed \| expired` | 7 adapters in `lib/bos/adapters/*`; [bosCommandSurfaceEnvelope.ts](../../../../web/lib/bos/bosCommandSurfaceEnvelope.ts); [commandSurfaceThreadTypes.ts](../../../../web/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes.ts); `lib/bos/index.ts` | **Phase 0 contract, Phase 3 cutover** | Presentation projection of M1 (**AD-3**) |
| **M3** | `task_assist_proposals` | [taskAssistProposalPersistence.ts](../../../../web/lib/agent/taskAssist/taskAssistProposalPersistence.ts), [taskAssistProposalPayload.ts](../../../../web/lib/agent/taskAssist/taskAssistProposalPayload.ts) | **Durable table** (`20260521103000`) | **Mutable `status`** CHECK `draft\|approved\|rejected\|expired\|applied`, plus `approved_at/by`, `rejected_at/by`, `applied_at/by`, `updated_at` | `app/api/admin/ai/task-assist/{propose,apply,proposals/*}`; [deleteOpportunityLead.ts](../../../../web/lib/admin/opportunity/deleteOpportunityLead.ts) (cascade); `bosCapabilityRegistry` | **Phase 4** | Decision Package + observations |
| **M4** | `config_layout_assist_proposals` | [configurationProposalStore.ts](../../../../web/lib/agent/configLayoutAssist/configurationProposalStore.ts), [configurationProposalApply.ts](../../../../web/lib/agent/configLayoutAssist/apply/configurationProposalApply.ts) | **Durable table** (`20260523140000`) | **Mutable `state`** CHECK `draft\|reviewed\|approved\|rejected\|applied\|failed\|…`, plus 6 actor columns, 7 timestamp columns, `rolled_back_at` | `app/api/admin/config-layout-assist/proposals/[id]/apply`; `bosCapabilityRegistry` | **Phase 4** | Decision Package + observations |
| **M5** | Processing classification result | [processingCaseClassificationDb.ts](../../../../web/lib/pos/processingCase/classification/processingCaseClassificationDb.ts) | `processing_case_classification` | Superseded-by-rerun + `operatorCorrection` | Processing case review | **Phase 1** | Decision Package; correction → `overridden` observation |
| **M6** | Processing resolution | [processingResolutionsDb.ts](../../../../web/lib/pos/processingIdentity/processingResolutionsDb.ts) | `processing_resolutions` | Generation-scoped, `markResolutionSuperseded` | Operator review, commit plan | **Phase 1** | Decision Package with **lineage** (`supersedes_package_id`) |
| **M7** | Processing commit plan | [planDb.ts](../../../../web/lib/pos/processingIdentity/plan/planDb.ts), [planHash.ts](../../../../web/lib/pos/processingIdentity/plan/planHash.ts), [approval.ts](../../../../web/lib/pos/processingIdentity/plan/approval.ts) | `processing_*` plan tables | Hash-versioned, approved, executed | Commit executor | **Phase 1 (evidence), Phase 6 (full)** | Package = evidence; plan stays an execution artefact |
| **M8** | Intake related-record proposals | [decisions.ts](../../../../web/lib/intake/proposals/decisions.ts), [decisionVersion.ts](../../../../web/lib/intake/proposals/decisionVersion.ts) | in-flight + idempotency key | `approve \| reject \| defer` per provider ref, SHA-256 decision version | Intake review, commit | **Phase 3** | Field-level decisions → `modified` observations |
| **M9** | Needs-attention suggestion | [buildNeedsAttentionSuggestion.ts](../../../../web/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion.ts) | ephemeral projection | none | Focus Panel | **Partially converged** (enrichment overlay only) | Full class in Phase 2 |
| **M10** | Packet review insight | [buildPacketReviewInsightV1.ts](../../../../web/lib/forms/packets/buildPacketReviewInsightV1.ts) | ephemeral | none | Packet review surface | **Phase 7** | Decision Package |
| **M11** | Search result ranking | [globalRecordSearchService.ts](../../../../web/lib/admin/globalSearch/globalRecordSearchService.ts), [taskAssistEntitySearchService.ts](../../../../web/lib/agent/taskAssist/taskAssistEntitySearchService.ts) | ephemeral | none | Global search, BOS entity resolution | **Phase 5** | Decision Package when semantic; deterministic retrieval stays uncontracted |

**Reading of the register.** Only **M1** is doctrine-correct. **M2, M3 and M4** each
own an independent mutable lifecycle, which **AD-3** and Decision 020 forbid.
**M5–M8** carry versioning and supersession *concepts* that map cleanly onto
Decision Package lineage — they are convergence candidates, not rewrites.

---

## 4. ENABLE — runtime capabilities adoption requires

| # | Capability | Status | Required by | Migration? |
|---|---|---|---|---|
| **E-1** | Asynchronous reasoning (`reason()` may await) | Missing | Every phase ≥ 2 | No |
| **E-2** | Asynchronous validation call-outs | Missing | Every real domain validator | No |
| **E-3** | Capability-scoped registry composition | Missing — four single-file `Map`s | Every phase ≥ 1 | No |
| **E-4** | Authorization resolution seam | Duplicated 3× in routes | Every converted route | No |
| **E-5** | Decision Package lifecycle projection | Missing | AD-3; phases 3, 4 | **Yes** — observation-kind vocabulary |
| **E-6** | Execution binding to registered commands | Missing | AD-3; every actionable recommendation | No |
| **E-7** | Execution measurement (OI) | Missing | Phase 0 per AD-1 | Index only |
| **E-8** | Cost representability | Type-blocked only | Phase 2 | **No** — column already `numeric` |
| **E-9** | Reversible tokenization + vault + rehydration | Missing | AD-2; phase 2 onward | **Yes** — vault table |
| **E-10** | One-way pseudonymization | Missing | AD-2 | No |
| **E-11** | Provider registry inside the Reasoning Runtime | Absent (provider lives in `lib/ai`) | Phase 2 | No |
| **E-12** | Local model host (Layer 1) | **Does not exist at all** | Phase 2 | Infrastructure |
| **E-13** | Cancellation | Not expressible today. **Ruled (ADR-1):** a terminal `refused_cancelled` package outcome; **no** mutable `cancelled` lifecycle state | Phase 2 | **Yes** — `DECISION_PACKAGE_OUTCOMES` + `chk_tdp_outcome` |
| **E-14** | Retry | **Already expressible** — contracts are immutable, so a retry is a new contract with package lineage | Phase 2 | No |
| **E-15** | Scheduler (deferred / background) | Missing | Phase 6 | Deferred |
| **E-16** | Knowledge asset substrate | Missing — no `knowledge_*` table | Phase 6 | Yes |
| **E-17** | Operational Learning substrate | Missing — no `learning_*` table | Phase 7 | Yes |
| **E-18** | Document segmentation | Missing | Phase 6 | Yes |

**E-1 … E-8 constitute Phase 0.** E-9/E-10 are Phase 2 and are the program's hardest
primitive; they are specified here but built there, because building a token vault
before a single consumer needs it is how vaults get the wrong shape.

---

## 5. ADOPT — capability phases

| Phase | Capability | Decision Classes introduced | Proves | Converges |
|---|---|---|---|---|
| **0** | *(none — foundation)* | none | E-1…E-8 | M2 contract, E-6 binding |
| **1** | Processing, deterministic | `processing_source_classification`, `processing_identity_resolution` | Multi-class registry; highest-consequence proposal governed; lineage | M5, M6, M7 (evidence) |
| **2** | Communications | `communication_draft_generation` | **First probabilistic strategy**, first provider resolution, first non-zero cost, first tokenization, escalation ladder, budget refusal | M9, A1, A3, A7 |
| **3** | BOS Create Lead | `intake_fact_extraction`, `intake_field_mapping` | Decision 020 platform-wide; entity grouping on a proven probabilistic path | **M2 cutover**, M8 |
| **4** | Configuration Assist (+ Task Assist) | `configuration_proposal`, `operational_task_proposal` | Durable-store retirement pattern | **M3, M4** |
| **5** | Search | `record_resolution_search` | Highest volume; new infrastructure behind an unchanged runtime | M11 |
| **6** | Processing document understanding | `document_understanding`, `subsidy_eligibility` | E-15, E-16, E-18; region-granular privacy | M7 (full) |
| **7** | OI explanation + learning | `operational_explanation`, `packet_review_insight` | E-17; Deterministic Graduation | M10 |
| **8** | Participant Runtime | `participant_guidance` | Family-facing generation under approved templates | — |

**Sequencing principle, retained from the accepted assessment:** *prove each new
runtime capability on the lowest-stakes capability that requires it.* Processing is
first but scoped to escalation 0 with zero egress; Communications carries the first
probabilistic strategy because there, failure is cosmetic.

---

## 6. Phase 0 — Adoption Foundation architecture

Phase 0 makes the Trust Runtime *able to be adopted*. **No capability adopts in
Phase 0.** Exactly one Decision Class remains registered at the end of Phase 0, and
its observable behaviour is unchanged.

### 6.1 Target module architecture

```text
lib/trust/
  runtime/          trustRuntime.ts            ← awaits strategy + validation      (0.1)
  reasoning/
    reasoningStrategy.ts                       ← reason() may return a Promise     (0.1)
    strategies/                                ← per-capability, registered        (0.2)
    providers/                                 ← EMPTY in Phase 0; Phase 2 target
  validation/       validationOrchestrator.ts  ← async call-outs                   (0.1)
  registry/
    compose.ts                                 ← the ONLY module that imports      (0.2)
                                                 every capability registration
  capabilities/
    <capability>/register.ts                   ← classes + strategies + privacy
                                                 + validation, co-located          (0.2)
  authorization/
    resolveTrustAuthorization.ts               ← one owner-resolved decision       (0.3)
  projection/
    decisionPackagePresentation.ts             ← package → presentation projection (0.4)
  execution/
    decisionPackageExecutionBinding.ts         ← recommendation → command key      (0.5)
  measurement/
    reasoningUsageQuery.ts                     ← read-only economics query         (0.6)
```

**Invariants Phase 0 must not break.** `lib/trust` performs no durable mutation of
any business table; contains no `fetch`, provider SDK or provider credential; is not
imported by any clause-1 or clause-2 module. All three are asserted by
[trustBoundary.test.ts](../../../../web/tests/trust/trustBoundary.test.ts) and each has a negative control.

### 6.2 The lifecycle projection contract (AD-3)

```text
Decision Package (immutable)          trust_decision_packages
        │
        ├── observations (append-only) trust_decision_observations
        │     presented · accepted · rejected · overridden
        │     modified · deferred · executed · outcome
        │     + expired            ← NEW, requires migration
        │     + superseded         ← NEW, requires migration
        │
        ├── events (append-only)       workflow_events, trust_* vocabulary
        │
        └── projection (derived, never stored)
              BosProposalEnvelopeV1.status = f(package.outcome, observations, now)
```

`BosProposalStatus` is **computed**, never persisted. The mapping is total and
deterministic:

| Projected status | Derivation |
|---|---|
| `draft` | package `outcome = recommended`, no observation |
| `validated` | package `outcome = recommended`, `validation.passed = true`, no operator observation |
| `approved` | latest observation `accepted` |
| `rejected` | latest observation `rejected` |
| `applied` | observation `executed` present |
| `superseded` | a later package carries `supersedes_package_id = this.id` |
| `failed` | package `outcome ∈ {failed_validation, failed_reasoning}` |
| `expired` | observation `expired`, or contract age > class TTL with no terminal observation |

**This is the whole of AD-3.** Nothing else about the BOS surface changes in
Phase 0 — the contract is defined and certified against synthetic packages; the
cutover of live BOS traffic is Phase 3.

### 6.3 The execution binding contract (AD-3, second clause)

A recommendation that proposes a mutation **must name a registered Operational
Command key** and must not carry an executable payload.

```text
Decision Package.recommendation
        │  proposed_command: { command_key, subject_type, subject_id, inputs }
        ▼
  registered command catalog        capabilityRegistry.ts / canonicalActionRegistry.ts
        │  key must resolve, or the package is refused at validation
        ▼
  operator confirmation             prepareCommandInvocation → executeCommandInvocation
        │  staleness check          package_id + package fingerprint, on the
        │                           destructivePreviewToken precedent
        ▼
  Platform Transaction              platformTransaction.ts
        │
        ▼
  observation: executed             execution_reference = command invocation id
```

Two properties fall out, and both are certification rows:

- **No mutation before registered-command confirmation.** The Trust Runtime cannot
  execute; the command runtime refuses a recommendation whose command key does not
  resolve.
- **Stale package rejection.** Confirmation carries the package identity and
  fingerprint; if the underlying truth moved, the command runtime refuses rather
  than applying a recommendation computed against a different world. The precedent
  is [destructivePreviewToken.ts](../../../../web/lib/platform/commands/runtime/destructive/destructivePreviewToken.ts),
  which already does exactly this for destructive previews (HMAC claims with a
  `version` fingerprint for stale detection and an `exp`).

### 6.4 Execution measurement (AD-1)

Trust execution measurement is **not a new surface**. Operational Intelligence is
already a Surface Definition over the Operational Calculations registry
([operationalIntelligenceSurfaceDefinition.tsx](../../../../web/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition.tsx)).
Measurement therefore arrives as **new metrics in the existing registry**, which is
both the smallest change and the doctrine-correct one: OI *measures*, it does not
reason.

Phase 0 measurement set, all sourced from `trust_reasoning_usage` and
`trust_decision_packages`:

| Metric | Question it answers |
|---|---|
| `reasoning.decisions_total` | How many governed decisions were produced? |
| `reasoning.deterministic_resolution_rate` | What share resolved at escalation 0? |
| `reasoning.refusal_rate` | How often does the runtime decline, and why? |
| `reasoning.escalation_distribution` | Where on the ladder is work landing? |
| `reasoning.latency_p50_p95` | Is governance affordable? |
| `reasoning.cost_units_total` | What did reasoning cost? (structurally 0 until Phase 2) |
| `reasoning.acceptance_rate` | Do operators act on recommendations? |

**No provider dimension.** See §13 — recording provider identity on a package
contradicts `reasoning-runtime.md`.

---

## 7. Phase 0 slices — exact affected owners

Every slice below is independently certifiable and independently revertible.

### Slice 0.1 — Asynchronous reasoning and validation seam *(E-1, E-2)*

| | |
|---|---|
| **Code owners** | [reasoningStrategy.ts](../../../../web/lib/trust/reasoning/reasoningStrategy.ts) — `ReasoningStrategyV1.reason` return type · [trustRuntime.ts](../../../../web/lib/trust/runtime/trustRuntime.ts) — `await` at the reasoning step and the validation step · [validationOrchestrator.ts](../../../../web/lib/trust/validation/validationOrchestrator.ts) — `ValidationPolicyV1.callOuts[].invoke` return type, `orchestrateValidation` becomes async · [attentionSuggestionEnrichmentDeterministic.ts](../../../../web/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic.ts) — implementer, unchanged under a union return · [trustRuntimeSlice1.test.ts](../../../../web/tests/trust/trustRuntimeSlice1.test.ts) |
| **Schema owners** | **None.** No migration. |
| **Technique** | Widen, do not replace: `reason(): ReasoningOutcome \| Promise<ReasoningOutcome>`. Existing synchronous strategies keep compiling unchanged; the runtime awaits either. |
| **Certification** | 41 `tests/trust` assertions unchanged and green · DB suite (21 isolated + 16 full-chain) unchanged · **new:** an async strategy and an async DB-backed validator both execute inside the canonical order, `step_trace` identical · **negative control:** a strategy that rejects yields `failed_reasoning`, not an unhandled rejection |

### Slice 0.2 — Capability-scoped registry composition *(E-3)*

| | |
|---|---|
| **Code owners** | [decisionClassRegistry.ts](../../../../web/lib/trust/decisionClasses/decisionClassRegistry.ts) — `REGISTRY`, `DECISION_CLASS_REGISTRY_VERSION` · [strategyEngine.ts](../../../../web/lib/trust/strategy/strategyEngine.ts) — `STRATEGIES` · [privacyEngine.ts](../../../../web/lib/trust/privacy/privacyEngine.ts) — `PRIVACY_POLICIES` · [validationOrchestrator.ts](../../../../web/lib/trust/validation/validationOrchestrator.ts) — `VALIDATION_POLICIES` · [attentionSuggestionEnrichment.ts](../../../../web/lib/trust/consumers/attentionSuggestionEnrichment.ts) — class-key import · **new:** `lib/trust/capabilities/attentionSuggestion/register.ts`, `lib/trust/registry/compose.ts` |
| **Schema owners** | **None.** `decision_class_key` is free text with no CHECK constraint — the schema already scales to N classes without migration. |
| **Certification** | Registry version pinning still round-trips into every contract and package · **new:** two synthetic capabilities register without either touching a file the other touches · duplicate-key registration fails loudly at composition, not silently at lookup |

### Slice 0.3 — Authorization resolution seam *(E-4)*

| | |
|---|---|
| **Code owners** | [aiEnrichmentPermissions.ts](../../../../web/lib/ai/aiEnrichmentPermissions.ts) · [aiEnrichmentRouteGuards.ts](../../../../web/lib/ai/aiEnrichmentRouteGuards.ts) · [aiPolicy.ts](../../../../web/lib/ai/aiPolicy.ts) · [enrich-attention-suggestion/route.ts](../../../../web/app/api/admin/ai/enrich-attention-suggestion/route.ts) · [task-assist/propose/route.ts](../../../../web/app/api/admin/ai/task-assist/propose/route.ts) · [workflow-assist/propose/route.ts](../../../../web/app/api/admin/ai/workflow-assist/propose/route.ts) · **new:** `lib/trust/authorization/resolveTrustAuthorization.ts` |
| **Schema owners** | `org_settings.metadata.ai_policy` — **read only, no DDL.** |
| **Constraint (AD-4)** | Routes are **not renamed**. Each becomes a thin adapter: resolve authorization, delegate, shape the response. Any remaining policy branching means the slice is incomplete. |
| **Certification** | The seven-case refusal matrix still reachable from every route · `refused_policy` / `refused_permission` produced identically across all three · **negative control:** removing the permission grant still yields a Decision Package, never a bare 403 from the runtime |

### Slice 0.4 — Decision Package lifecycle projection contract *(E-5, AD-3)*

| | |
|---|---|
| **Code owners** | [bosProposalEnvelope.ts](../../../../web/lib/bos/bosProposalEnvelope.ts) · [bosProposalLifecycle.ts](../../../../web/lib/bos/bosProposalLifecycle.ts) · [bosProposalStatusMap.ts](../../../../web/lib/bos/bosProposalStatusMap.ts) · [bosCapability.ts](../../../../web/lib/bos/bosCapability.ts) — `BosProposalStatus` · the 7 adapters under `lib/bos/adapters/` · [commandSurfaceThreadTypes.ts](../../../../web/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes.ts) · **new:** `lib/trust/projection/decisionPackagePresentation.ts` |
| **Schema owners** | **`trust_decision_observations.chk_tdo_kind`** — the CHECK currently admits 8 kinds and has **no `expired` and no `superseded`**. AD-3 requires expiration as an append-oriented record, so this slice carries a migration extending the vocabulary, plus the matching widening of `TRUST_OBSERVATION_KINDS` in [trustDecisionRepository.ts](../../../../web/lib/trust/persistence/trustDecisionRepository.ts). |
| **Scope limit** | **Contract only.** Certified against synthetic packages. No live BOS traffic moves in Phase 0 — that is Phase 3. |
| **Certification** | The projection is a **total function** — every reachable `(outcome, observation set)` maps to exactly one status · **negative control:** a planted mutable status field in the projection type fails the suite · migration privilege posture declared and verified in-migration |

### Slice 0.5 — Execution binding contract *(E-6, AD-3)*

| | |
|---|---|
| **Code owners** | [capabilityRegistry.ts](../../../../web/lib/platform/commands/capabilityRegistry.ts) — `REGISTERED_ACTION_CAPABILITY_KEYS` · [canonicalActionRegistry.ts](../../../../web/lib/admin/actions/canonicalActionRegistry.ts) · [prepareCommandInvocation.ts](../../../../web/lib/platform/commands/runtime/prepareCommandInvocation.ts) · [executeCommandInvocation.ts](../../../../web/lib/platform/commands/runtime/executeCommandInvocation.ts) · [destructivePreviewToken.ts](../../../../web/lib/platform/commands/runtime/destructive/destructivePreviewToken.ts) — staleness precedent · **new:** `lib/trust/execution/decisionPackageExecutionBinding.ts` |
| **Schema owners** | **None.** Binding is a validation call-out; the command key is data inside `recommendation` jsonb. |
| **Boundary note** | `lib/trust` must **not** import `lib/adminV2/actions` — that direction is forbidden by the boundary suite. The binding validator resolves keys through a **capability-supplied catalog port**, injected by the consumer. This is the same inversion the repository port already uses. |
| **Certification** | A recommendation naming an unregistered command key yields `failed_validation` · a recommendation carrying an executable payload rather than a key fails to type-check (compile-time proof with `@ts-expect-error` + weakening negative control) · **no mutation before confirmation:** row counts across all public tables unchanged from package creation until the command runtime is invoked |

### Slice 0.6 — Execution measurement *(E-7, AD-1)*

| | |
|---|---|
| **Code owners** | [metrics/types.ts](../../../../web/lib/metrics/types.ts) — `OipMetricKey` union, `MetricPackKey` union (adds a `reasoning` pack) · `lib/metrics/registry.ts` — metric definitions · **new** resolver under `lib/metrics/` reading `trust_reasoning_usage` · [analytics/calculations/types.ts](../../../../web/lib/analytics/calculations/types.ts) — `OperationalCalculationBusinessProcess`, `PACK_TO_BUSINESS_PROCESS` · [analytics/calculations/registry.ts](../../../../web/lib/analytics/calculations/registry.ts) — `CALCULATIONS` is `Record<OipMetricKey, …>`, so a new key **forces** a registry entry at compile time · [operationalIntelligenceSurfaceDefinition.tsx](../../../../web/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition.tsx) — **consumes the registry; no change expected** · **new:** `lib/trust/measurement/reasoningUsageQuery.ts` |
| **Schema owners** | `trust_reasoning_usage` — **read only.** Existing index is `(org_id, decision_class_key, recorded_at DESC)`; org-wide time-window aggregation wants `(org_id, recorded_at DESC)`. Index-only migration. |
| **Blast radius warning** | This slice touches **closed unions consumed by many surfaces** (`OipMetricKey`, `MetricPackKey`, `PACK_TO_BUSINESS_PROCESS`). It is the widest Phase 0 slice and must not be first. |
| **Certification** | G-H reachability: the metrics render on `/organization` in a real browser · measurement is **read-only** — row counts unchanged across all tables while the OI surface is exercised · **negative control:** a metric whose resolver writes anything fails the suite |

### Slice 0.7 — Cost representability *(E-8)*

| | |
|---|---|
| **Code owners** | [decisionPackageTypes.ts](../../../../web/lib/trust/package/decisionPackageTypes.ts) — `provider_cost_units: 0` widens to `number` with a **non-negative** runtime guard · [trustRuntime.ts](../../../../web/lib/trust/runtime/trustRuntime.ts) — cost sourced from the strategy result rather than a literal · [trustDecisionRepository.ts](../../../../web/lib/trust/persistence/trustDecisionRepository.ts) — already `number` |
| **Schema owners** | **None.** `provider_cost_units` is already `numeric NOT NULL DEFAULT 0` and `economics` is `jsonb`. |
| **Deliberate scope** | Phase 0 makes cost *representable*. Cost stays **0** because no provider runs. Non-zero accounting is certified in Phase 2. |
| **Certification** | Deterministic strategies still record exactly `0` · a synthetic strategy reporting non-zero cost round-trips through package, usage row and measurement query · **negative control:** a negative cost is refused |

---

## 8. Compatibility and migration rules

Binding on every slice in every phase.

**C-1 — Additive first.** New Trust structures are added alongside existing ones.
No existing table is dropped in the slice that stops writing to it. Retirement is a
separate, later, explicitly-certified step.

**C-2 — Behaviour-preserving convergence.** When an existing engine becomes a
Reasoning Strategy, the engine is **called, never re-implemented**. Equivalence is
proven by fixture-corpus diff, not by assertion.

**C-3 — Widen, don't replace, in the runtime seam.** Interface changes inside
`lib/trust` use union widening where possible (`T | Promise<T>`) so existing
implementers keep compiling. A breaking narrowing requires its own slice.

**C-4 — Routes become adapters, not redirects (AD-4).** Existing `app/api/admin/ai/**`
routes stay at their paths and become thin adapters with no independent logic. New
canonical endpoints use Trust-native naming. No client is asked to move in Phase 0.

**C-5 — Dual-write is forbidden; dual-read is permitted.** A converging capability
writes to exactly one store from the moment it converges. Reading legacy rows for
display during a transition is allowed and must be time-boxed in the slice document.

**C-6 — In-flight rows are migrated or expired, never orphaned.** M3 and M4 both
have in-flight `draft`/`approved` rows in real tenants. Each retirement slice
declares, before it starts: how many rows exist, which are terminal, and what
happens to the non-terminal ones.

**C-7 — Every new Trust table declares its own privilege posture in its own
migration**, with an in-migration verification block: `anon` nothing,
`authenticated` SELECT only, `service_role` full. Precedent: `20260803230000`.
The schema-wide default-privileges issue on 253 non-Trust tables is **out of scope**
(tracked as #324).

**C-8 — Migrations are additive to a CHECK vocabulary, never a rewrite.** Extending
`chk_tdo_kind` adds values; it never drops one, because a dropped value would
invalidate historical rows.

**C-9 — Registry version bumps are mandatory.** `DECISION_CLASS_REGISTRY_VERSION`
is pinned into every contract and package for replay. Any class-definition change
bumps it in the same commit.

**C-10 — No phase begins until the previous phase's certification record is
committed** under `certification/`, on the Trust Runtime V1 template.

---

## 9. Non-goals

Explicit, so scope creep is a visible violation rather than a judgement call.

**N-1** — This program does **not** absorb deterministic domain evaluation,
eligibility enforcement, authorization, stage resolution, readiness evaluation,
operational calculations or business rules. Decision 019. They become *validation
call-outs*, not Decision Classes.

**N-2** — The Trust Runtime never executes. No slice adds a mutation path to
`lib/trust`. Durable mutation stays with Operational Commands and Business Process
Execution.

**N-3** — No slice weakens `trustBoundary.test.ts`. The forbidden-consumer list
**grows** as capabilities adopt; if it ever shrinks to admit a migration, the
migration is wrong.

**N-4** — Phase 0 adopts no capability. Exactly one Decision Class is registered at
the end of Phase 0.

**N-5** — Phase 0 sends nothing anywhere. No provider is wired, no egress path is
opened, no credential is read. `lib/trust` contains no `fetch`.

**N-6** — No doctrine document is amended unless a real contradiction is proven.
See §13.

**N-7** — No broad route rename in Phase 0 (AD-4).

**N-8** — No Knowledge Platform, no Operational Learning, no embeddings, no
scheduler, no document segmentation in Phase 0. Each has a named later phase.

**N-9** — Family-facing generated content is out of scope until Phase 8, and even
then only via an approved configured template mapping (ratified in the Trust Runtime
V1 certification record §7.2).

**N-10** — This program does not change Presentation Runtime, the Objective
Platform, Relationship Authority, or the participant Host.

---

## 10. Certification matrix

Fifteen required scenarios. Each row states what proves it, which phase certifies
it, and the negative control — because an assertion with no negative control has
never been shown to be able to fail.

| # | Scenario | Proof | Negative control | Certified in |
|---|---|---|---|---|
| **C1** | **Deterministic execution** | A contract resolves at escalation 0; `strategy_kind = deterministic`, `provider_cost_units = 0`, `step_trace` equals `TRUST_RUNTIME_STEPS`; no host contacted outside localhost | Registering a probabilistic strategy for the same class does **not** change selection | **0** (regression), 1 |
| **C2** | **Local-model execution** | A Layer-1 strategy executes against an Alloy-hosted model; `escalation_level ≥ 1`; every request confined to the private host; package records strategy and cost, **not provider identity** | Removing the local host yields `failed_reasoning`, never a silent fall-through to an external provider | **2** |
| **C3** | **Escalation to an external provider** | Layer-3 strategy runs only after the deterministic and local strategies are shown insufficient; escalation ladder ordering asserted; the outbound payload contains **no raw identity** | A class whose `max_escalation_level` is below the strategy's level yields `refused_budget`, never a downgrade-and-proceed | **2** |
| **C4** | **Provider failure and timeout** | Provider returns 5xx / exceeds the class latency budget → Decision Package with `failed_reasoning`, explanation naming the failure class, zero writes outside Trust tables, operator keeps the deterministic experience | Failure must not raise past the runtime: a bare exception reaching the route fails the gate | **2** |
| **C5** | **Cancellation and retry** | **Retry:** a re-run creates a *new* contract and a new package with `supersedes_package_id` set; the predecessor is byte-identical afterwards. **Cancellation:** a cancelled execution produces a terminal package with `outcome = refused_cancelled` (ADR-1); no mutable lifecycle state is introduced | A retry that mutates the predecessor fails; a cancellation that produces no package, or that leaves a contract short of a terminal package, fails | **2** |
| **C6** | **Non-zero cost accounting** | A provider-backed decision persists `provider_cost_units > 0` on both the package and `trust_reasoning_usage`, and the value aggregates into `reasoning.cost_units_total` | A negative cost is refused; a provider call that records `0` fails the gate | **0** (representable), **2** (non-zero) |
| **C7** | **Sensitive-value withholding** | A prohibited Information Class refuses the whole transform (`refused_privacy`) rather than silently dropping the element; the privacy report accounts for **every** transformation | Silently admitting a prohibited class fails; a `withhold` element appearing in the reasoning context fails | **0** (regression), **2** |
| **C8** | **Reversible tokenization** | An identity element is replaced by an opaque, **org-scoped** token; the same value yields the same token within an org and a **different** token across orgs; the raw value is absent from every serialized artefact | A planted raw identity anywhere in the outbound payload fails the gate. Cross-org token collision fails | **2** |
| **C9** | **Authorized rehydration** | A permitted server-side caller resolves tokens back to values; the resolution is logged as an auditable event; the rehydrated value never enters a Decision Package | Rehydration from a client context fails. Rehydration that writes into a package fails | **2** |
| **C10** | **Unauthorized rehydration denial** | A caller without the rehydration permission, and a caller from another org, are both refused with `insufficient_privilege` — at the **grant** layer, not by row filtering | A denial that returns an empty result instead of an error fails (precedent: the V1 privilege correction made exactly this distinction) | **2** |
| **C11** | **Immutable Decision Package behavior** | `UPDATE` and `DELETE` on `trust_decision_packages` refused by trigger; one package per contract enforced by unique constraint; no lifecycle column exists on the table | A migration adding any lifecycle column to the package table fails the suite | **0** (regression), every phase |
| **C12** | **Human rejection** | An operator rejects → append-only `rejected` observation; the package is byte-identical afterwards; the projected status becomes `rejected`; **zero operational rows change** | A rejection that writes to the package fails. A rejection that mutates any business table fails | **0** (contract), **3** (live) |
| **C13** | **Stale package rejection** | Confirmation carries package identity + fingerprint; when underlying truth moved, the command runtime refuses and explains, rather than applying | A confirmation accepted after the fingerprint changed fails. Precedent: `destructivePreviewToken` `version` claim | **0** (contract), **3** (live) |
| **C14** | **No mutation before registered-command confirmation** | Row counts across **all** public tables unchanged between package creation and command invocation; the target record's `md5` byte-identical; recommendation names a **registered** command key or is refused at validation | A recommendation carrying an executable payload rather than a key fails to compile (`@ts-expect-error` + weakening control) | **0** |
| **C15** | **OI measurement emission** | Every executed contract produces exactly one `trust_reasoning_usage` row and the declared Trust events on the `workflow_events` spine; the metrics render on `/organization` in a real browser | A decision producing no usage row fails. A measurement resolver that writes anything fails | **0** |

**Standing gates**, inherited unchanged from the Trust Runtime V1 certification
record and applied to every slice in every phase: one contract → one package; canonical
order; seven-case refusal matrix; no operational mutation; structural boundary with
negative control; provider and egress proof; operator reachability by module-graph
**and** real browser; measured non-regression against base; full-chain migration
replay; privilege posture; compile-time contract proof.

---

## 11. Phase 0 sprint plan

Seven slices, each independently certifiable, each independently revertible. The
dependency graph is shallow on purpose.

```text
0.1 async seam ─────────┬──► 0.2 registry composition ──┬──► 0.6 measurement
                        │                                │
                        ├──► 0.3 authorization seam ─────┤
                        │                                │
                        └──► 0.7 cost representability ──┘

0.4 lifecycle projection ───► 0.5 execution binding
     (independent of the runtime seam; may run in parallel)
```

| Order | Slice | Depends on | Migration | Est. certifiable unit |
|---|---|---|---|---|
| **1** | 0.1 Async reasoning + validation seam | — | none | 1 sprint slice |
| **2** | 0.2 Capability-scoped registry composition | 0.1 | none | 1 slice |
| **3** | 0.4 Lifecycle projection contract | — | **yes** (observation kinds) | 1 slice |
| **4** | 0.5 Execution binding contract | 0.4 | none | 1 slice |
| **5** | 0.3 Authorization resolution seam | 0.2 | none | 1 slice |
| **6** | 0.7 Cost representability | 0.1 | none | small slice |
| **7** | 0.6 Execution measurement | 0.2, 0.7 | index only | 1 slice, widest blast radius |

**Gate to Phase 1.** All seven certified; boundary suite green with its negative
control; exactly one Decision Class registered; `tests/trust` and the DB suites green
with a measured non-regression diff against `origin/staging`; full-chain migration
replay clean including the observation-kind migration.

---

## 12. Recommended first slice

**Phase 0 Slice 1 = 0.1, the asynchronous reasoning and validation seam.**

### Why it has the lowest architectural risk

**Smallest blast radius of any slice in the program.** Four files, all inside
`lib/trust`: the strategy type, the runtime's two call sites, the validation
orchestrator, and the one existing strategy implementation. Nothing outside
`lib/trust` changes.

**Zero schema surface.** No migration, no CHECK constraint, no index, no privilege
declaration. It cannot participate in a migration-replay failure and it cannot
affect the 253-table privilege question.

**Provably behaviour-preserving.** Widening `reason(): ReasoningOutcome` to
`ReasoningOutcome | Promise<ReasoningOutcome>` is backward compatible for every
implementer — the existing synchronous strategy compiles and behaves identically.
The runtime already sits inside an `async` function, so awaiting a non-promise
changes ordering by one microtask and nothing observable. The existing 41 runtime
assertions and 37 database assertions are the regression proof, and they should pass
**unmodified**.

**Zero operator-visible change.** No route, no surface, no envelope, no copy. It
cannot reproduce the Slice 1 defect class where a governed decision was produced but
invisible, because it produces no new decision.

**Highest leverage per unit of risk.** It is the hard gate on E-11, E-12, C2, C3,
C4 and the entire Phase 2 proving slice. Every other Phase 0 slice can proceed
without it; nothing in Phase 2 onward can.

**Cheapest possible reversal.** A type widening with no persisted artefact. If the
seam proves wrong, reverting leaves no data, no schema and no client behind.

### Compared with the alternatives

| Candidate | Why not first |
|---|---|
| 0.2 registry composition | Touches all four registry files at once; higher merge risk; better done once the seam it composes is settled |
| 0.4 lifecycle projection | Carries a migration and defines a contract seven adapters will depend on. Correct early, but not *first* — a schema change should not be the program's opening move |
| 0.6 measurement | Widest blast radius in Phase 0: touches `OipMetricKey` and `MetricPackKey`, closed unions consumed across many surfaces |
| 0.3 authorization seam | Touches three live routes. Low risk, but not lower than a four-file type widening inside `lib/trust` |

---

## 13. Doctrine — consumed versus requiring amendment

### 13.1 Consumed unchanged

`trust-platform.md` · `trust-philosophy.md` · `trust-platform-manifesto.md`
(Reasoning Boundary Test) · `trust-runtime.md` · `decision-contract.md` ·
`decision-package.md` · `information-classification.md` · `privacy-runtime.md` ·
`knowledge-platform.md` · `operational-learning.md` · `trust-governance.md` ·
`platform-integration.md` · `reasoning-deployment-strategy.md` ·
`trust-platform-decisions.md` (Decisions 001–022).

Two checks worth recording explicitly, because both were candidates for amendment
and neither needs it:

- **AD-2 (reversible tokenization) is already doctrine.** `privacy-runtime.md`
  §Identity Tokenization: *"Identity is never removed. Identity is replaced… Identity
  mapping remains internal to the runtime."* A vault with server-only rehydration is
  the implementation of that sentence, not a departure from it. The Frozen Decisions
  list says *identity is abstracted whenever operationally possible* — abstraction,
  not destruction. **No amendment.**
- **AD-3 (projection, not lifecycle) is already doctrine.** Decision 020 states it
  directly. The contradiction is in `lib/bos`, not in the corpus. **No amendment.**

### 13.2 One proven contradiction — RULED AND CORRECTED, 2026-08-04

**Status: resolved.** The architecture owner ruled that provider/model identity,
usage, latency, routing and cost belong to **Trust usage / economics telemetry
associated with a Decision Package**, and not inside the provider-independent
Decision Package. The smallest necessary correction was applied to
[`trust-economics.md`](../../trust/trust-economics.md) §Cost Measurement: `Provider`
was removed from the list of fields a Decision Package records, and the requirement
that provider and cost **are** measured in the associated usage/economics records
was made explicit. `reasoning-runtime.md` is unchanged.

The contradiction as it stood:

**`trust-economics.md` §Cost Measurement contradicted `reasoning-runtime.md`
§Provider Resolution.**

| Document | Text |
|---|---|
| `trust-economics.md` §Cost Measurement | "Every Decision Package records: — Strategy — **Provider** — Latency — Execution Cost — Cache Utilization — Escalation Level — Replay Cost" |
| `reasoning-runtime.md` §Provider Resolution | "Providers never appear inside Decision Contracts. **Providers never appear inside Decision Packages.** Provider selection remains entirely internal." |

Both are canonical. Both were last reviewed 2026-08-01. An implementer building the
Phase 0 measurement set or the Phase 2 provider strategy cannot satisfy both.

**This became load-bearing the moment measurement entered Phase 0** — the metric
dimension set either has a provider axis or it does not.

**Recommended resolution — do not amend without a ruling.** `reasoning-runtime.md`
is the stronger and more frequently restated rule: `decision-package.md` lists
"Return provider-specific payloads" among its anti-patterns and asserts "Raw provider
responses never leave the Trust Runtime"; provider independence is a stated Trust
Runtime invariant; Decision 002 makes it constitutional. The narrowest correction is
therefore to `trust-economics.md`: a Decision Package records **provider-independent
cost dimensions** — strategy, strategy kind, escalation level, deployment layer,
latency, cache utilization, cost units, replay cost — and **provider identity, if
recorded at all, lives only in internal economics telemetry**, never in the package.

The implemented shape already matches this reading: `trust_reasoning_usage` carries
`strategy_key`, `strategy_kind`, `escalation_level` and `provider_cost_units`, and
**has no provider column**. The corpus is out of step with itself; the code is not
out of step with either.

**Ruled 2026-08-04 in favour of this resolution. `trust-economics.md` corrected;
`reasoning-runtime.md` untouched.** No other doctrine file is edited by this
program.

---

## 14. Architecture decisions — resolved

Both open ADRs were ruled on 2026-08-04. Neither blocked Phase 0 Slice 0.1.

**ADR-1 — Cancellation. RULED: option 1.** Cancellation is represented as a
**terminal Decision Package outcome, `refused_cancelled`**. No mutable `cancelled`
contract lifecycle state is added — the forward-only lifecycle stands, and "one
contract produces exactly one package" is preserved. **A retry after cancellation
is a new immutable contract with lineage to the prior attempt**, which contract
immutability already makes automatic.

Implementation requires extending `DECISION_PACKAGE_OUTCOMES` and the
`chk_tdp_outcome` CHECK constraint. **Scheduled for Phase 2**, with the rest of
execution control. It is explicitly **out of scope for Slice 0.1**: no cancellation
persistence, no lifecycle state, no schema change, no provider control logic. The
async seam must not carry speculative infrastructure for it.

**ADR-2 — Provider identity in the Decision Package. RULED: keep packages
provider-independent.** See §13.2. `trust-economics.md` §Cost Measurement corrected;
`reasoning-runtime.md` unchanged. The Phase 0 measurement set therefore carries **no
provider dimension**; provider utilization is measured in the associated usage /
economics records, per that document's §Platform Metrics.

Two further items are **decided but worth restating**, because they will be
re-litigated by anyone who reads only the code:

- The **BOS projected status is derived, never stored** (AD-3). Any future column
  named `status` on a recommendation-bearing table is a violation, not an
  optimisation.
- **Retry is a new contract**, not a re-execution. Contract immutability makes this
  automatic; lineage makes it auditable.

---

## 15. What this document did not do

No production code changed. No capability migrated. No provider wired. No migration
authored. No registry extended. No doctrine document amended. No existing behaviour
altered. The Trust Runtime is exactly as certified and merged at `e10d5af60`.

The only changed file on this branch is this document.

---

## Related documents

- [`Trust Platform`](../../trust/trust-platform.md) · [`Trust Runtime`](../../trust/trust-runtime.md) · [`Decision Contracts`](../../trust/decision-contract.md) · [`Decision Packages`](../../trust/decision-package.md)
- [`Reasoning Runtime`](../../trust/reasoning-runtime.md) · [`Reasoning Deployment Strategy`](../../trust/reasoning-deployment-strategy.md) · [`Trust Economics`](../../trust/trust-economics.md) · [`Privacy Runtime`](../../trust/privacy-runtime.md) · [`Information Classification`](../../trust/information-classification.md) · [`Operational Learning`](../../trust/operational-learning.md) · [`Knowledge Platform`](../../trust/knowledge-platform.md)
- [`Trust Platform Decisions`](../../trust/trust-platform-decisions.md) — Decisions 019–022 govern every judgement here
- [`Platform Integration`](../../trust/platform-integration.md) · [`Trust Governance`](../../trust/trust-governance.md)
- [`AI Readiness Inventory`](../trust-runtime/AI-READINESS-INVENTORY.md) — the pre-Runtime survey this assessment refreshes and extends
- [`Trust Runtime V1 Implementation Plan`](../trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md) · [`Trust Runtime V1 Implementation Assessment`](../trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md)
- `certification/trust-runtime-v1/README.md` — the certification template every phase inherits
