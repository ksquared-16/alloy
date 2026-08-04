---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-04
supersedes: []
---

# Trust Platform Adoption — Implementation Assessment

**Deliverable 1 of the Trust Platform Adoption Program.** Assessment and roadmap
only. **No implementation.** Nothing in the runtime, no capability migrated, no
provider wired.

**Base:** `origin/staging` @ `e10d5af60`, worktree `wt1-trust-platform-adoption`,
branch `agent/claude/1-trust-platform-adoption`.

**Scope.** The mission is *not* to extend the Trust Platform. It is to convert
Alloy into a Trust-native operating system: every capability that resolves
ambiguity submits a Decision Contract, and reasoning exists exactly once.

---

## Headline

Three findings decide the whole program.

**1. Alloy has almost no AI to migrate. It has a great deal of *ungoverned
proposal-making* to converge.**
There is exactly **one** live provider egress path in the repository
(`enrich-attention-suggestion` → `resolveStructuredAiProviderForPolicy` →
`openAiCompatibleStructuredProvider` → `https://api.openai.com`), it is off by
default, and `openAiCompatibleStructuredProvider` has **zero call sites outside
`lib/ai/` and its tests**. Meanwhile Alloy runs at least **eleven** deterministic
engines that resolve ambiguity and emit a confidence-bearing proposal, across
four different persistence models. Adoption is therefore a **convergence**
program, not an AI-migration program.

**2. The Trust Runtime as built cannot host anything above escalation level 0.**
`ReasoningStrategyV1.reason()` is **synchronous** ([reasoningStrategy.ts:68](../../../../web/lib/trust/reasoning/reasoningStrategy.ts), called
without `await` at [trustRuntime.ts:235](../../../../web/lib/trust/runtime/trustRuntime.ts)), and validation call-outs
`invoke()` are synchronous too ([validationOrchestrator.ts:41](../../../../web/lib/trust/validation/validationOrchestrator.ts)). No
probabilistic strategy and no I/O-bearing domain validator can be registered
without changing both signatures. `provider_cost_units` is typed as the **literal
`0`** ([decisionPackageTypes.ts:50](../../../../web/lib/trust/package/decisionPackageTypes.ts)), so a non-zero provider cost is not
representable in a V1 Decision Package. These are not oversights — they are
correct V1 constraints — but they are hard gates on capabilities 2 through 7.

**3. Four parallel representations of "a recommendation with a lifecycle" exist
today, and one of them contradicts a frozen decision.**
`trust_decision_packages` (immutable, Decision 020), `task_assist_proposals`
(durable), `config_layout_assist_proposals` (durable), and the in-memory
`BosProposalEnvelopeV1` — which carries a **mutable `status`** through
`draft → validated → approved → applied | rejected | superseded | failed | expired`
([bosProposalLifecycle.ts](../../../../web/lib/bos/bosProposalLifecycle.ts)). A mutable post-creation lifecycle on a
recommendation is exactly what Decision 020 forbids on a Decision Package.
Convergence of these four is the single largest refactor in the program, and it
is the work that actually makes Alloy Trust-native.

---

## 1. Existing reasoning already present in Alloy

Applying the [Reasoning Boundary Test](../../trust/trust-platform-manifesto.md)
(1: changes durable state → execution authority; 2: applies authoritative rules
or calculates known truth → existing deterministic owner; 3: resolves ambiguity
or produces a proposal under uncertainty → **Trust Platform**).

### 1.1 Clause 3 — reasoning, already present, currently ungoverned

| # | Engine | Module | Uncertainty it resolves | Emits confidence? | Persistence today |
|---|---|---|---|---|---|
| R1 | Non-form source classification | [classifyNonFormSource.ts](../../../../web/lib/pos/processingCase/classification/classifyNonFormSource.ts) (180 ln) | "What kind of document is this?" | **Yes** — weighted signals, capped at 0.95, honest `unknown` | `processing_case_classification` |
| R2 | Canonical identity resolution | [canonicalResolutionEngine.ts](../../../../web/lib/pos/processingIdentity/canonicalResolutionEngine.ts) (302 ln) | "Is this the same family/child as an existing record?" | **Yes** — 6-band `confirmed…excluded` + signals + blocking conflicts | `processing_resolutions` |
| R3 | Household graph candidate generation | [generateCandidates.ts](../../../../web/lib/identity/generateCandidates.ts) (277 ln), [signals.ts](../../../../web/lib/identity/signals.ts) | Candidate ranking under ambiguous identity | **Yes** — `IDENTITY_RESOLVER_VERSION` pinned | in-flight |
| R4 | Free-text fact extraction | [extractFactsFromText.ts](../../../../web/lib/intake/extract/extractFactsFromText.ts) (857 ln) | "What facts are in this operator's prose?" | **Yes** — per-candidate confidence | in-flight |
| R5 | Fact → intake-field mapping | [mapFactsToActionIntake.ts](../../../../web/lib/intake/map/mapFactsToActionIntake.ts) + [buildProposals.ts](../../../../web/lib/intake/resolve/buildProposals.ts) | "Which configured field did they mean?" | **Yes** + review warnings | in-flight |
| R6 | Commit recommendation | [recommendationBuilder.ts](../../../../web/lib/pos/processingIdentity/operator/recommendationBuilder.ts) (482 ln) | "What should the operator do with this case?" | **Yes** | `processing_*` plan tables |
| R7 | Needs-attention suggestion | [buildNeedsAttentionSuggestion.ts](../../../../web/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion.ts) | "What deserves attention, and what next?" | Yes | ephemeral projection |
| R8 | Task Assist proposal | [taskAssistDeterministicProposal.ts](../../../../web/lib/agent/taskAssist/taskAssistDeterministicProposal.ts) | "What message/task does this operator intend?" | `confidence: { mode: "deterministic" }` | **`task_assist_proposals`** |
| R9 | Config Layout Assist proposal | [configLayoutAssistPropose.ts](../../../../web/lib/agent/configLayoutAssist/configLayoutAssistPropose.ts) (416 ln) | "What configuration change did they ask for?" | Yes + risk level | **`config_layout_assist_proposals`** |
| R10 | Entity search disambiguation | [taskAssistEntitySearchService.ts](../../../../web/lib/agent/taskAssist/taskAssistEntitySearchService.ts) (689 ln), [globalRecordSearchService.ts](../../../../web/lib/admin/globalSearch/globalRecordSearchService.ts) (683 ln) | "Which record did they mean?" | Ranking + dedupe + disambiguation | ephemeral |
| R11 | Packet review insight | [buildPacketReviewInsightV1.ts](../../../../web/lib/forms/packets/buildPacketReviewInsightV1.ts) (226 ln) | "What is wrong with this packet?" | Yes | ephemeral |

**~4,200 lines of clause-3 reasoning**, none of it currently producing a Decision
Package, none of it replayable, none of it carrying a privacy report or a trust
vector.

Only **R7** is governed today, and only along its enrichment overlay
(Trust Runtime V1 Slice 1).

### 1.2 Clause 1 and 2 — explicitly **not** Trust's

Recorded so the program does not over-reach. Decision 019 is explicit:
*determinism alone never triggers migration.*

- **Clause 1 (execution):** [platformTransaction.ts](../../../../web/lib/platform/transaction/platformTransaction.ts) — the one
  execution pipeline (`validate → persist → business_process → activity →
  relationships → cache_invalidation → recomposition`, compensating saga on
  abort). This is the execution authority a Decision Package is evidence *for*.
  It never moves.
- **Clause 2 (authoritative rules / known truth):** `lib/operationalCalculations/`
  (placement, capacity, scheduling), `lib/operationalExpectations/` (authored
  ledger + ratification), `lib/operationalQuestions/` (measure answers),
  permissions, stage resolution, eligibility, `createLeadIntakeValidation`,
  Relationship Authority. **All stay where they are.** Several become *validators
  the Trust Runtime calls out to*, which is a different thing from migration.

### 1.3 Trust Runtime V1, as actually built

| Extension point | Registered today |
|---|---|
| Decision Classes | **1** — `attention_suggestion_enrichment` |
| Reasoning Strategies | **1** — deterministic, escalation level 0 |
| Privacy Policies | **1** — `attention_suggestion_minimization_v1` |
| Validation Policies | **1** — one call-out into `lib/ai` |
| Knowledge Providers | **1** — `createEmptyKnowledgeProvider`, returns `[]` always |
| Consumers | **1** — attention suggestion enrichment |
| Learning | **none** — `learning_policy_key` is always `none_v1` |

2,279 lines in `lib/trust`. The **architecture is complete and certified**; the
**registry is empty**. That is the correct V1 outcome and it is exactly the
starting condition adoption assumes.

---

## 2. Deterministic systems that should become Decision Contracts

Decision 019 governs: an existing deterministic evaluator moves **only when a
capability submits a Decision Contract for it**. The right question is therefore
not "is it deterministic?" but **"does a capability need this to be governed,
explainable, replayable and privacy-reported?"**

### 2.1 Migrate — clause 3, high governance value

| Priority | Decision Class (proposed) | Absorbs | Why it must be governed |
|---|---|---|---|
| **P1** | `processing_source_classification` | R1 | Confidence already exists but is unauditable; operator corrections are recorded ([operatorCorrection.ts](../../../../web/lib/pos/processingCase/classification/operatorCorrection.ts)) with no path to learning |
| **P1** | `processing_identity_resolution` | R2, R3 | Highest-consequence proposal in the platform — a wrong match merges two families. Needs trust vector, review requirement, lineage |
| **P2** | `communication_draft_generation` | (new) + R7's overlay | The only surface where family-facing words are produced. §7.2 of the Slice 1 record already ratified that drafts require an approved template mapping |
| **P2** | `intake_fact_extraction` | R4 | 857 lines of parsing with an explicit "swap extractor for AI later" seam ([parseCreateLeadIntakeText.ts](../../../../web/lib/intake/adapt/parseCreateLeadIntakeText.ts)) |
| **P2** | `intake_field_mapping` | R5 | Ambiguity detection must be *shown*, never guessed — that is a Decision Package property |
| **P3** | `configuration_proposal` | R9 | Already has risk level + durable proposal + approve/reject. Nearest thing to a Decision Package outside `lib/trust` |
| **P3** | `operational_task_proposal` | R8 | Same shape as P3; converges `task_assist_proposals` |
| **P4** | `record_resolution_search` | R10 | Highest volume in the platform (~375k searches/yr est.). Deterministic today; contract-ify before semantics arrive |
| **P4** | `packet_review_insight` | R11 | Low stakes; good final proof of the registry |

### 2.2 Do not migrate — and say so explicitly

`lib/operationalCalculations/*`, `lib/operationalExpectations/*`,
`lib/operationalQuestions/*` (measure answers), permission resolution, stage
resolution, `commandRuntimeExecutionGate`, `destructive*`, Relationship
Authority, `createLeadIntakeValidation`, `platformTransaction`.

**These become validation call-outs, not Decision Classes.** The Validation
Orchestrator's contract is exactly right for this — a policy is an ordered list
of call-outs into the module that owns each rule ([validationOrchestrator.ts:35](../../../../web/lib/trust/validation/validationOrchestrator.ts)).
The adoption work is to make that list non-trivial, not to move the rules.

### 2.3 The structural boundary must be extended, not weakened

[trustBoundary.test.ts](../../../../web/tests/trust/trustBoundary.test.ts) enumerates
`FORBIDDEN_CONSUMERS = [lib/objective, lib/adminV2/actions, lib/relationships,
opportunityAttentionResolver.ts]`. As capabilities adopt Trust, **the forbidden
list must grow, not shrink** — every clause-1 and clause-2 module identified in
§2.2 belongs on it. If that list ever shrinks to admit a migration, the migration
is wrong.

---

## 3. AI integrations that should migrate into Trust Runtime

The complete inventory. It is short.

| # | Integration | State | Disposition |
|---|---|---|---|
| A1 | `openAiCompatibleStructuredProvider` → `api.openai.com` | **The only egress path.** Reached only via `enrichAttentionSuggestionStubEnvelope` when `ai_policy.provider === "openai"` | **Becomes a Reasoning Strategy behind the Strategy Engine.** Never called from a route again |
| A2 | `enrich-attention-suggestion` route, `provider !== "openai"` branch | **Already migrated** — Slice 1 | Done |
| A3 | `enrich-attention-suggestion` route, `provider === "openai"` branch | Still bypasses Trust ([route.ts:189](../../../../web/app/api/admin/ai/enrich-attention-suggestion/route.ts)) | **Migrate or delete.** Deliberately deferred by Slice 1 |
| A4 | `createStubAiProvider` / `createDisabledAiProvider` | Stub + disabled providers | Retire — the runtime's refusal outcomes replace them |
| A5 | `liveProviderAdapterPlaceholder`, `providerAdapterDesign` | Design notes, never invoked | Delete or fold into the Reasoning Runtime provider registry |
| A6 | OCR — `ocrExtract.ts`, tesseract WASM + mupdf | Local, in-process, **no egress** | **Stays in Processing.** Doctrine: Processing owns OCR. Not reasoning |
| A7 | `messagingComposerBosEnhance` (comms rewrite) | Unwired; ships a gap message | Becomes `communication_draft_generation`'s first real consumer |
| A8 | Embeddings / semantic search | **Does not exist** — no `vector`, no pgvector, no embedding column in any migration | Greenfield; arrives as a Reasoning Strategy, never as a capability-owned index |

**The critical consequence:** because A1 has no consumers, **Alloy can adopt Trust
without ever regressing a production AI feature.** There is nothing live to break.
That is a one-time window and it should shape the sequencing.

---

## 4. Provider-specific code that should disappear

`lib/ai` is 1,937 lines across 23 files. Under a Trust-native architecture, most
of it is either absorbed or deleted.

| Disposition | Modules | Rationale |
|---|---|---|
| **Delete** | `openAiHttpError.ts`, `openAiModelCapabilities.ts` (`OPENAI_CHAT_TEMPERATURE`), `stubProvider.ts`, `disabledProvider.ts`, `disabledStructuredProvider.ts`, `liveProviderAdapterPlaceholder.ts`, `providerAdapterDesign.ts`, `resolveStructuredAiProvider.ts` | Provider-shaped concepts that have no place above the Reasoning Runtime |
| **Absorb into `lib/trust/reasoning/providers/`** | `openAiCompatibleStructuredProvider.ts`, `aiEnrichmentEnv.ts` (`OPENAI_*` env reads) | Provider resolution is *internal to the Reasoning Runtime*, invisible above it |
| **Absorb into the Decision Class Registry** | `aiPolicy.ts` — `AI_ALLOWED_FEATURES`, a flat feature list with no risk axis | `requires_allowed_feature` already exists on `DecisionClassDefinitionV1`; `TRUST_RISK_TIERS` supplies the missing axis |
| **Absorb into Trust economics** | `aiUsageTelemetrySchema.ts`, `enrichmentTelemetry.ts` | `trust_reasoning_usage` already records strategy, escalation, latency, cost, outcome |
| **Keep, unchanged** | `lib/privacy/redactObject.ts` (already relocated out of `lib/ai` — the doctrine-correct owner), `attentionSuggestionAiEnrichmentSchema.ts` (a capability-owned output schema Trust *calls out to*) | Correct owners already |
| **Rename** | The route family `app/api/admin/ai/**` | "AI" is an implementation word. Decision 001: Alloy has a Trust Platform, not an AI Platform |

**Must disappear from the type system:** `AiProviderKey = "disabled" | "stub" |
"openai" | "anthropic" | "azure_openai"` ([providerTypes.ts:8](../../../../web/lib/ai/providerTypes.ts)). Provider names
above the Reasoning Runtime are a doctrine violation
(`platform-integration.md` — "Never call providers directly from platforms").
`ReasoningImplementationKey` already makes them unrepresentable *inside a Decision
Contract* ([decisionContractTypes.ts:19](../../../../web/lib/trust/contract/decisionContractTypes.ts)); the same prohibition must reach the
routes.

**Blast radius today:** 46 files import `@/lib/ai` — but only **9** are outside
`lib/ai` and `tests/`, and 4 of those are the Trust Runtime itself. The cleanup is
small *now* and grows with every capability that adopts before it happens.

---

## 5. Required refactors

Ordered by what blocks what. **R-1 through R-4 block every capability past
Processing-deterministic.**

| # | Refactor | Why it blocks | Size |
|---|---|---|---|
| **R-1** | **Make reasoning asynchronous.** `reason(): ReasoningOutcome` → `Promise<ReasoningOutcome>`; `await` at [trustRuntime.ts:235](../../../../web/lib/trust/runtime/trustRuntime.ts) | No provider call, no retrieval, no I/O-bearing strategy is expressible. **Hard gate on escalation > 0** | Small, mechanical, high leverage |
| **R-2** | **Make validation call-outs asynchronous.** `invoke(): {passed, detail}` → `Promise<…>` | Every real Alloy domain validator (relationship, financial, capacity, eligibility) queries the database. Today only pure in-memory validators can be registered — which is why V1's single call-out is a Zod parse | Small |
| **R-3** | **Implement the declared privacy transformations.** `INFORMATION_CLASS_TRANSFORMATIONS` declares `tokenize / abstract / aggregate / summarize`; `transformForReasoning` honours **only `withhold`**, then applies blanket pattern masking ([privacyEngine.ts:84](../../../../web/lib/trust/privacy/privacyEngine.ts)) | Layer 3 doctrine requires *tokenized identities*. `redactObject` masks (`***-***-1234`); it does not tokenize and there is no token vault. **Nothing may reach a frontier model until this exists** | **Large — the program's hardest primitive** |
| **R-4** | **Make cost representable.** `provider_cost_units: 0` is a literal type; `economics` jsonb on the package row is schema-free | A non-zero cost cannot be stored. Needs a package schema version bump + migration, and budget enforcement per `trust-economics.md` §Budgeting | Medium; migration required |
| **R-5** | **Modularize the registries per capability.** `decisionClassRegistry`, `strategyEngine`, `privacyEngine`, `validationOrchestrator` are each a single hand-written `Map` in one file | Seven capabilities × N classes in four monolithic files is unmergeable across parallel sprints. Needs per-capability registration modules with a composition root | Medium; do **before** capability 2 |
| **R-6** | **Converge the four proposal representations.** `BosProposalEnvelopeV1` (mutable `status`), `task_assist_proposals`, `config_layout_assist_proposals` → Decision Packages + append-only observations | `BosProposalEnvelopeV1`'s mutable lifecycle contradicts **Decision 020**. Until this lands, "reasoning exists exactly once" is false | **Largest single refactor.** UI blast radius across the BOS rail, drawers, approve/reject/apply routes |
| **R-7** | **Collapse the duplicated route preamble.** Three propose routes each re-implement portal access → `ai_policy` → permission → provider branch (~90 lines each) | Authorization must be resolved by its owner and *handed to* the runtime as a `TrustAuthorizationDecision`. One helper, not three copies | Small |
| **R-8** | **Build the Knowledge Platform substrate.** No `knowledge_*` table exists; the provider returns `[]` unconditionally | Processing eligibility, Configuration proposals and policy explanation all require versioned knowledge assets | Large; deferrable to capability 5+ |
| **R-9** | **Build Operational Learning substrate.** No `learning_*` table; `learning_policy_key` always `none_v1` | Deterministic Graduation — the program's stated economic objective — is unmeasurable without it | Large; **but the capture points already exist** (`operatorCorrection.ts`, `BosInputEvidence`, `trust_decision_observations`) |
| **R-10** | **Processing segmentation.** No page/region abstraction exists | "Send only the flagged region" has nothing to name. Blocks document *understanding* — not document classification | Large; blocks Processing phase 2 only |
| **R-11** | **Reasoning scheduler.** `trust-runtime.md` §Scheduler declares immediate/deferred/background/retry/escalated/cancelled; V1 is synchronous-immediate only | Processing volume (~27k page ops/yr est.) cannot be inline-synchronous | Medium; needed by Processing phase 2 |

---

## 6. Risks

| # | Risk | Evidence | Mitigation |
|---|---|---|---|
| **X1** | **Trust becomes a second proposal system instead of the only one.** Four representations exist; adding a fifth consumer without R-6 entrenches the split | §1.1, R-6 | Make R-6 a **gate**, not a follow-up. No capability adopts until its existing proposal store has a declared retirement path |
| **X2** | **The privacy story regresses the moment escalation > 0.** R-3 unbuilt; `pii_mode` is `strict\|standard\|none` with no tokenization | [privacyEngine.ts](../../../../web/lib/trust/privacy/privacyEngine.ts), [redactObject.ts](../../../../web/lib/privacy/redactObject.ts) | Certification gate: **no Decision Class may declare `max_escalation_level > 2` until R-3 is certified** |
| **X3** | **Doing Processing first puts the highest-risk data on the least-proven runtime.** Child identity, DOB, subsidy, signatures | §5 R-3, R-10, R-11 | **Scope Processing phase 1 to deterministic contracts only** (classification + identity resolution, escalation 0, zero egress). Document *understanding* waits for R-3/R-10/R-11 |
| **X4** | **Registry contention across parallel sprints.** Four single-file `Map`s | §5 R-5 | R-5 before capability 2. Non-negotiable if sprints run concurrently |
| **X5** | **Silent operator-surface invisibility.** Slice 1 produced, persisted and audited a governed decision that **no operator could see** — the consumer was mounted on a retired surface | `certification/trust-runtime-v1/README.md` §4.4 | Every capability's certification must include module-graph proof of reachability from a live surface, plus real-browser observation on `/workspace` or `/organization` |
| **X6** | **The full-project typecheck cannot run on the dev host** (exit 144 at every heap) | Cert README §4.3 | CI (`.github/workflows/web-typecheck.yml`) is the authority. Every capability needs a scoped `tsconfig.*.json` for local proof |
| **X7** | **Certification suites cannot be green in one pass.** The Playwright cert suite needs one worker and a pristine tenant per spec file | Prior sprint finding | Use `alloy-certify journey`; do not promise single-pass green |
| **X8** | **Shared-tenant destruction.** All managed worktrees write the same Supabase tenant; the shared cert stack was destroyed three times in one session | `exclusive-certification-db` lease, now enforced | Hold the lease for every DB certification. A lease is not a permit to destroy |
| **X9** | **Cost becomes invisible-then-surprising.** `provider_cost_units: 0` means the first live provider silently records zero | [decisionPackageTypes.ts:50](../../../../web/lib/trust/package/decisionPackageTypes.ts) | R-4 lands **with** the first non-deterministic strategy, in the same slice, never after |
| **X10** | **Scope creep into clause-2 territory.** "Every capability reasons through Trust" reads as "absorb every evaluator" | Decision 019 exists precisely because of this | Every migration proposal states its Reasoning Boundary Test clause and its answer, in the slice document |
| **X11** | **Default privileges on 253 non-Trust tables.** Issue #318 Part A closed `anon`; Part B (`authenticated`) is open as **#324** | `platform-default-privileges-318.md` | Out of scope here. Any new Trust table must carry its own privilege declaration, as `20260803230000` did |

---

## 7. Certification plan

Slice 1's certification is the template and it should not be diluted. Sixteen
scenarios, a negative control for every structural assertion, and refusal to
waive a gap.

### 7.1 Standing gates — every capability, every slice

| Gate | Method | Precedent |
|---|---|---|
| **G-A** One contract → one package | DB unique constraint on `contract_id` | S1, S3 |
| **G-B** Package immutability | `UPDATE`/`DELETE` refused by trigger | S2 |
| **G-C** Canonical order (Decision 021) | `step_trace` equals `TRUST_RUNTIME_STEPS` exactly | S6 |
| **G-D** Refusal matrix | Every outcome in `DECISION_PACKAGE_OUTCOMES` reachable, each yielding a package, **zero writes outside the four Trust tables** | S7 |
| **G-E** No operational mutation | Row counts across **all** public tables unchanged except Trust tables; target record `md5` byte-identical | S15 cond. 5 |
| **G-F** Structural boundary + **negative control** | `trustBoundary.test.ts` with a planted violation proving the test fails | S12 |
| **G-G** Provider and egress proof | No `fetch`/SDK/credential in `lib/trust` outside `reasoning/providers/`; observed network confined to localhost | §6 of cert README |
| **G-H** Operator reachability | **Module-graph proof** from a live surface + real-browser observation on `/workspace` or `/organization` | §4.4 — this gate exists because it caught a real defect |
| **G-I** Non-regression, measured | Base-vs-branch suite diff, failing sets byte-identical | §3 |
| **G-J** Full-chain migration replay | From-empty replay on the isolated cert project; ledger count = repo file count; zero object-name collisions | §4.1 |
| **G-K** Privilege posture | New Trust tables: `anon` nothing, `authenticated` SELECT only, `service_role` full — declared **and verified in the migration** | §4.2 |
| **G-L** Compile-time contract proof | `@ts-expect-error` assertions with a weakening negative control proving each is load-bearing | S14 |

### 7.2 Per-phase additional gates

| Phase | Additional gate |
|---|---|
| Processing (deterministic) | Classification and resolution outputs **byte-identical** to the pre-migration engines across a fixture corpus. Migration must be observably a no-op in operator experience |
| First probabilistic strategy | **G-M** Escalation ladder: a deterministic strategy that satisfies the class is *always* chosen ahead of a probabilistic one. **G-N** Budget refusal: exceeding `max_escalation_level` yields `refused_budget`, not a downgrade. **G-O** Non-zero `provider_cost_units` persisted and aggregated |
| Any class with `max_escalation_level ≥ 3` | **G-P** Tokenization proof: no raw identity in any payload crossing the process boundary; privacy report accounts for **every** transformation; a planted raw identity fails the gate |
| Proposal convergence (R-6) | **G-Q** No mutable recommendation lifecycle survives: no table or type outside `trust_decision_observations` carries a status transition on a recommendation |
| Participant Runtime | **G-R** Nothing family-facing is generated without an approved configured template mapping (ratified §7.2 of the Slice 1 record) |

### 7.3 Program-level acceptance

The program is complete when, and only when:

1. `listDecisionClassKeys()` covers all seven capabilities.
2. `openAiCompatibleStructuredProvider` has **no importer outside
   `lib/trust/reasoning/providers/`**.
3. `AiProviderKey` no longer exists above the Reasoning Runtime.
4. No recommendation-bearing table outside `trust_*` carries a mutable status.
5. `trust_reasoning_usage` is the single source of reasoning economics, and
   Operational Intelligence reads it.
6. Every migrated engine's *deterministic behaviour* is unchanged — proven by
   fixture diff, not by assertion.

---

## 8. Recommended rollout order — and the challenge

### 8.1 The expected order, and what the repository says about it

```text
1 Processing · 2 BOS Create Lead · 3 Communications · 4 Search
5 Configuration Assist · 6 Operational Intelligence · 7 Participant Runtime
```

Two problems, both evidenced.

**Problem 1 — it proves the hardest runtime capability last, on the highest-risk
data first.** Capabilities 1 and 2 are the platform's most consequential
(child identity resolution; the most-used command). Capability 3 —
Communications — is where failure is *cosmetic* and where the runtime's first
probabilistic strategy, first provider resolution, first non-zero cost and first
tokenization requirement would all land. Proving R-1/R-3/R-4 on capability 3
means capabilities 1 and 2 were built against a runtime that could not yet do
what they will eventually need.

**Problem 2 — BOS Create Lead at position 2 has two prerequisites the order does
not supply.** The readiness inventory concluded AI's value in Create Lead is
concentrated in **entity grouping** ("Avery is the parent, Joey is the child") —
genuine language understanding, i.e. escalation > 0, i.e. R-1/R-3/R-4. And
Create Lead's proposal path runs through `BosProposalEnvelopeV1`, whose mutable
lifecycle is the Decision 020 conflict (R-6). Position 2 forces the program's
largest refactor and its hardest primitive at once, on its most-used command.

**Problem 3 — Operational Intelligence at position 6 is a category error for
half of its role.** Doctrine is explicit: *Operational Intelligence never
performs reasoning. It measures reasoning.* Trust Score, reasoning cost,
graduation rate, acceptance rate and deterministic-resolution rate are the
program's **success criteria**. Measuring them at capability 6 means capabilities
1–5 ship unmeasured. OI-as-*explanation* (a genuine reasoning consumer) belongs
late; OI-as-*measurement* belongs first.

### 8.2 Recommended order

```text
Phase 0  Trust Runtime V2 core        (cross-cutting; not a capability)
Phase 1  Processing — deterministic contracts only
Phase 2  Communications               ← moved up from 3
Phase 3  BOS Create Lead              ← moved down from 2
Phase 4  Configuration Assist         ← moved up from 5
Phase 5  Search                       ← moved down from 4
Phase 6  Processing — document understanding   (re-entry)
Phase 7  Operational Intelligence — explanation
Phase 8  Participant Runtime
```

**Sequencing principle: prove each new runtime capability on the lowest-stakes
capability that requires it.**

| Phase | Contents | Proves | Prerequisites cleared |
|---|---|---|---|
| **0** | R-1, R-2, R-5, R-7; OI **measurement** surface over `trust_reasoning_usage` | The runtime can host I/O-bearing strategies and validators; registries are mergeable; economics are visible from slice 1 | — |
| **1** | `processing_source_classification`, `processing_identity_resolution` — escalation 0, zero egress | Multi-class registry; the highest-consequence proposal in Alloy under governance; volume | Phase 0 |
| **2** | `communication_draft_generation` — **first probabilistic strategy**, first provider resolution, first non-zero cost. Absorbs A1/A3/A7 | R-1 under load; R-3 tokenization; R-4 cost; escalation ladder; budget refusal | Phase 0 + R-3 + R-4 |
| **3** | BOS Create Lead: `intake_fact_extraction`, `intake_field_mapping`; **R-6 proposal convergence** | Decision 020 holds platform-wide; entity grouping on a proven probabilistic path | Phase 2 |
| **4** | `configuration_proposal`, `operational_task_proposal` — retires two durable proposal tables | Convergence pattern repeats; durable-store retirement | Phase 3 |
| **5** | `record_resolution_search` + embeddings as a Reasoning Strategy | Highest volume; new infrastructure behind an unchanged runtime | Phase 4 |
| **6** | Processing document understanding | R-10 segmentation, R-11 scheduler, R-8 knowledge | R-3 certified |
| **7** | OI explanation; **R-9 Operational Learning**; Deterministic Graduation | The economic thesis: cost falls over time | Phases 1–6 producing observations |
| **8** | Participant Runtime | Family-facing generation under G-R | Everything |

### 8.3 What is retained from the expected order

**Processing stays first.** The instinct is right — it is the highest-value,
highest-volume, highest-consequence capability, and it has the best existing
material (confidence-bearing engines, recorded operator corrections). What
changes is only its **scope in phase 1**: deterministic contracts, escalation 0,
zero egress. Document *understanding* is a distinct, later phase gated on the
primitives it actually needs. Splitting Processing is what makes "Processing
first" safe rather than heroic.

**Participant Runtime stays last.** It is the only capability whose output is
read by someone outside the organization.

---

## 9. Implementation roadmap

Each phase is one or more managed sprints, each ending in a certification record
under `certification/`, on the Slice 1 template.

### Phase 0 — Trust Runtime V2 core *(no capability adopts)*

- **0.1** R-1 async `reason()`; R-2 async validation call-outs. Certification:
  existing 41 `tests/trust` assertions unchanged; a registered async strategy and
  an async DB-backed validator both execute inside the canonical order.
- **0.2** R-5 registry modularization: `lib/trust/capabilities/<capability>/`
  registering classes, strategies, privacy policies and validation policies;
  composition root in `lib/trust/registry/`. Certification: two capabilities
  register without touching a shared file.
- **0.3** R-7 one authorization resolver producing `TrustAuthorizationDecision`;
  three propose routes converge on it.
- **0.4** OI measurement surface over `trust_reasoning_usage` — decisions by
  class, outcome mix, escalation distribution, refusal reasons, latency,
  deterministic-resolution rate. **Read-only.** Certification: G-H reachability
  on `/organization`.

**Gate to Phase 1:** 0.1–0.4 certified; boundary suite green with negative
control.

### Phase 1 — Processing, deterministic contracts

- **1.1** `processing_source_classification` — R1 becomes a deterministic
  Reasoning Strategy. Existing engine **called, never re-implemented**.
- **1.2** `processing_identity_resolution` — R2/R3. Trust vector, review
  requirement, lineage on re-resolution. This is where Decision Package **lineage**
  earns its keep: a re-run supersedes, never edits.
- **1.3** Consumer surfaces: Processing case review renders the Decision Package's
  explanation and evidence in place of ad-hoc confidence text.

**Gate:** fixture-corpus byte-identical outputs; G-A…G-L; G-H on the Processing
review surface.

### Phase 2 — Communications *(first escalation)*

- **2.1** **R-3 privacy transformations** — tokenization, abstraction,
  aggregation, summarization, with a token vault and a reversal boundary. Ships
  **before** any strategy that uses it. Certification: G-P with a planted raw
  identity.
- **2.2** **R-4 cost** — package schema v2 + migration; budgets per
  `trust-economics.md` §Budgeting; `refused_budget` on exhaustion.
- **2.3** `communication_draft_generation` with a deterministic strategy **and** a
  probabilistic strategy; A1 absorbed into `lib/trust/reasoning/providers/`;
  A3 route branch retired; A7 wired.
- **2.4** Delete A4/A5; `AiProviderKey` removed above the Reasoning Runtime.

**Gate:** G-M, G-N, G-O, G-P. Program acceptance criteria 2 and 3 satisfied here.

### Phase 3 — BOS Create Lead + proposal convergence

- **3.1** **R-6** — `BosProposalEnvelopeV1` becomes a *presentation projection* of
  a Decision Package; its `status` becomes derived from
  `trust_decision_observations`, not stored.
- **3.2** `intake_fact_extraction`, `intake_field_mapping`.
- **3.3** Entity grouping as a probabilistic strategy on the Phase 2 path;
  ambiguity **surfaced**, never resolved.

**Gate:** G-Q; Create Lead behaviour unchanged for every currently-parsed
phrasing (fixture diff).

### Phase 4 — Configuration Assist + Task Assist

- `configuration_proposal`, `operational_task_proposal`;
  `config_layout_assist_proposals` and `task_assist_proposals` retired with a
  migration path for in-flight rows. **Gate:** G-Q; program criterion 4.

### Phase 5 — Search

- `record_resolution_search`; embeddings as a Reasoning Strategy with its own
  provider; deterministic retrieval remains the default per
  `platform-integration.md` §Search. **Gate:** deterministic-first proven at
  volume; latency budget enforced.

### Phase 6 — Processing document understanding

- R-10 segmentation, R-11 scheduler, R-8 knowledge assets (state regulations,
  org policies). **Gate:** G-P at region granularity; no full document ever
  leaves the process.

### Phase 7 — Operational Intelligence explanation + Operational Learning

- R-9 learning substrate; learning candidates from the observation store and the
  correction points that already exist; Deterministic Graduation measured.
  **Gate:** program criteria 5 and 6.

### Phase 8 — Participant Runtime

- Conversational guidance for families. **Gate:** G-R; every family-facing string
  traceable to an approved configured template.

---

## 10. What this assessment did not do

No code changed. No capability migrated. No provider wired. No migration
authored. No registry extended. No existing behaviour altered. The Trust Runtime
is exactly as certified and merged.

**Open questions for the architecture owner, before Phase 0 begins:**

1. **Ordering.** Accept the §8.2 revision, or hold the expected order and accept
   that R-1/R-3/R-4 must land inside Phase 1 rather than Phase 2?
2. **Tokenization boundary (R-3).** Reversible tokens with a vault, or one-way
   pseudonyms with no reversal? This decides whether a Decision Package's
   recommendation can be re-hydrated with identity for operator display, and it
   is not a decision an implementer should make.
3. **R-6 scope.** Does `BosProposalEnvelopeV1` become a projection of a Decision
   Package (recommended), or do the two coexist with a declared retirement date?
4. **`app/api/admin/ai/**` rename.** Route-path change with client blast radius —
   Phase 0 cosmetic, or Phase 2 alongside the provider absorption?

---

## Related documents

- [`Trust Platform`](../../trust/trust-platform.md) · [`Trust Runtime`](../../trust/trust-runtime.md) · [`Decision Contracts`](../../trust/decision-contract.md) · [`Decision Packages`](../../trust/decision-package.md)
- [`Reasoning Deployment Strategy`](../../trust/reasoning-deployment-strategy.md) · [`Trust Economics`](../../trust/trust-economics.md) · [`Privacy Runtime`](../../trust/privacy-runtime.md) · [`Operational Learning`](../../trust/operational-learning.md)
- [`Trust Platform Decisions`](../../trust/trust-platform-decisions.md) — Decisions 019–022 govern every judgement in this assessment
- [`AI Readiness Inventory`](../trust-runtime/AI-READINESS-INVENTORY.md) — the pre-Runtime survey this assessment refreshes and extends
- [`Trust Runtime V1 Implementation Plan`](../trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md) · [`Trust Runtime V1 Implementation Assessment`](../trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-ASSESSMENT.md)
- `certification/trust-runtime-v1/README.md` — the certification template every phase inherits
