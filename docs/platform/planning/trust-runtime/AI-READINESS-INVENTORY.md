---
owner: platform
status: proposed
mission: ai-readiness-and-trust-runtime-preparation
last_reviewed: 2026-08-01
---

# AI Readiness & Trust Runtime Preparation

An inventory, dependency and architecture-readiness survey. **Nothing was
implemented, no AI was added, and no prompt or pipeline was redesigned.**

## Headline finding

**Alloy is almost entirely deterministic today.** There is exactly **one** live
LLM seam in the repository, it is consumed by one feature, and it is **off by
default**. Everything else that looks like AI — Task Assist, Workflow Assist,
Config Layout Assist, BOS Create Lead parsing, Processing extraction and
classification, communications rewrite — is deterministic code or an explicitly
unwired placeholder. OCR **is** built, but it is local WASM tesseract, not a
model call: no data leaves the machine.

That inverts the usual readiness problem. The Trust Runtime does not have to
retrofit governance onto entrenched AI; it has to arrive **before** the AI does.
The migration risk is not churn in existing consumers — it is that the seams
which exist have never carried real traffic, and that the deterministic paths
now in production are the thing worth protecting.

---

## 1. AI capability inventory

| # | Touchpoint | Owner | Capability | Trigger | Model today | Prompt location | Data supplied | Structured output | Downstream consumer | Deterministic alternative |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `openAiCompatibleStructuredProvider` | `lib/ai/` | Structured JSON completion — the **only live LLM call path** | Called by `resolveStructuredAiProvider` | `OPENAI_MODEL` env; no default | Caller-supplied request, not a prompt file | Whatever the caller passes, after redaction | `AiStructuredResponseV1<T>` with schema | Attention-suggestion enrichment | n/a — this *is* the seam |
| 2 | Attention-suggestion enrichment | `lib/ai/enrichAttentionSuggestionStub.ts`, `app/api/admin/ai/enrich-attention-suggestion` | Rewrites/enriches an operator attention suggestion | Operator-initiated API call | Same as #1; **stub by default** | Schema in `attentionSuggestionAiEnrichmentSchema.ts` | Suggestion text + operational context | Zod-validated envelope | Operator UI only | **Yes** — the stub returns a deterministic enrichment |
| 3 | Task Assist | `lib/agent/taskAssist/` | Comms/reminder intent + proposal | Operator types in BOS | **None** | n/a | n/a | Typed proposal | **Already deterministic** — `taskAssistDeterministicProposal.ts`, `confidence: { mode: "deterministic" }` |
| 4 | Workflow Assist | `lib/agent/workflowAssist/` | Workflow read + draft proposals | Operator types in BOS | **None** in default path | n/a | n/a | Typed draft | **Already deterministic** |
| 5 | Config Layout Assist | `lib/agent/configLayoutAssist/` | Field/section/layout config proposals | Operator types in BOS | **None** | n/a | n/a | Configuration proposal | **Already deterministic** — regex intent parsing |
| 6 | BOS Create Lead intake | `lib/bos/commandSession/conversationIntake/` | Parse a pasted note / operator sentence into lead fields | Operator submits intake text | **None** | n/a | Operator-pasted text (stays in Alloy) | `BosCommandDraft` + effective intake spec | **Already deterministic** — rule/regex parsing against the configured intake spec |
| 7 | BOS command routing | `lib/adminV2/aiCommandSurface/` | Route operator language to a specialist or registered command | Every BOS message | **None** | n/a | n/a | Route + intent | **Already deterministic** — bounded aliases, slot extraction |
| 8 | Processing extraction | `lib/pos/processingCase/extraction/documentFacts.ts` | Document → `IntakeFact[]` | Document import | **None** | n/a | Filename/title/doc_type/metadata only | `IntakeFact[]` | Processing candidates → review | **Already deterministic** — header states "No OCR, no LLM" (this module; OCR is a separate step, #12) |
| 9 | Processing classification | `lib/pos/processingCase/classification/classifyNonFormSource.ts` | Classify a non-form source | Document import | **None** | n/a | Cheap structured signals | Confidence-scored class | Operator review | **Already deterministic** — weighted token scoring, header states "NO OCR, NO LLM" |
| 10 | Communications rewrite | `lib/adminV2/messaging/messagingComposerBosEnhance.ts` | "Make clearer / warmer / shorter" | Operator clicks an intent | **Not wired** | n/a | n/a | n/a | n/a | Ships a documented gap message instead of calling anything |
| 11 | Semantic / vector search | — | — | — | **Does not exist** | — | — | — | — | No embeddings, no pgvector, no vector column anywhere |
| 12 | **OCR** | `lib/pos/processingCase/structure/ocrExtract.ts` | Scanned PDF/image → text | `POST /api/admin/documents/upload` | **Local WASM tesseract v5** + `mupdf`; English model in-repo | n/a — not a prompt | Page images, **in-process only** | `OcrResult` with confidence + provenance | Extraction review + correction | Not an LLM; already the deterministic option. No external service, no CDN, works offline |

### Model selection

There is no model-choice logic. `OPENAI_MODEL` is read from env and
`openAiModelCapabilities.ts` describes capability flags. `AiProviderKey` admits
`disabled | stub | openai | anthropic | azure_openai`, but only the
OpenAI-compatible adapter is implemented; `liveProviderAdapterPlaceholder.ts` and
`providerAdapterDesign.ts` are design notes, not adapters.

---

## 2. AI usage classification

| Class | Touchpoints | Note |
|---|---|---|
| **Mandatory AI** | *(none today)* | **OCR is built and wired** (`ocrExtract.ts` → document upload) but is **not an LLM** — it is local WASM tesseract, deterministic in the governance sense: no data leaves the machine. Document *understanding* on top of OCR text, and Blueprint proposal, remain unbuilt. |
| **AI fallback** | #6 BOS intake, #2 attention enrichment | Both have a working deterministic path today; AI would be an upgrade, not a dependency. |
| **AI convenience** | #10 communications rewrite, #2 wording | Pure phrasing. Failure is cosmetic. |
| **AI prohibited** | Authorization, execution, permissions, business truth, validation, record ownership | **Already structurally enforced** — see §9. The M5 authorization conjunction, the Contribution handler registry, `scope_rule` authority and the Action Registry all decide these in code, and none of them can call an LLM. |

The prohibited set is not aspirational. Nothing in `lib/objective/`,
`lib/adminV2/actions/` or the relationship-authority modules imports anything
from `lib/ai/`.

---

## 3. Data exposure inventory

**What leaves Alloy today: effectively nothing.** The single live path (#1/#2) is
disabled by default policy (`enabled: false`, `provider: "disabled"`,
`pii_mode: "strict"`), and every other touchpoint runs in-process.

Classification of what *would* leave, per touchpoint, if enabled:

| Touchpoint | Would expose | Class | Minimum semantic representation | Redaction opportunity | Deterministic alternative |
|---|---|---|---|---|---|
| #2 attention enrichment | Suggestion text, operational context | Organization content; possibly parent identity if names appear in free text | Role + status + urgency, no names | `redactObjectForAi` already covers email/phone/address/dob/financial/person_name/child_name | Stub enrichment exists |
| #6 BOS intake (if AI-assisted) | Parent name, child name, DOB, phone, email, program, location | **PII, child identity, parent identity, DOB** | Field-shaped tokens: "a phone-shaped value at span 42–54" | High — parse spans, not values | Existing rule parser |
| #8/#9 Processing (if AI-assisted) | Document text — the highest-risk surface | **Child identity, DOB, addresses, financial, subsidy, signatures** | Layout + field-type map without values | Very high — segment before send | Existing metadata-only extraction |
| #10 comms rewrite | Draft message body | Parent identity, organization content | Tone instruction + skeleton | Medium — names are the point of the message | None |

`lib/ai/redaction.ts` is deterministic, pure, path-aware, and returns
`RedactionStep[]` — an auditable record of what was removed. It is the strongest
existing Trust Runtime primitive.

**Not yet covered by redaction:** subsidy identifiers, signature images, and
document binaries. All three are Processing concerns and none is currently sent
anywhere.

---

## 4. Processing analysis

Current pipeline, as built:

```
Import  →  (OCR)  →  Parsing  →  Understanding  →  (Blueprint proposal)
```

| Step | Status | Deterministic / AI | Redaction opportunity | Segmentation opportunity | Learning opportunity |
|---|---|---|---|---|---|
| **Import** | Built | Deterministic — file + metadata capture | n/a | Split multi-document uploads before anything reads them | Which sources an org actually sends |
| **OCR** | **BUILT + WIRED** (`ocrExtract.ts`, called by `/api/admin/documents/upload`) | Deterministic, and **fully local**: WASM `tesseract.js` + `mupdf`, English model in-repo, "no external OCR service, no CDN, works offline". Printed text only — no handwriting, no table reconstruction, by mandate. Best-effort, never blocks upload; failure yields an honest "couldn't read". | **Already maximal** — page images never leave the machine | Per-page rasterization exists; per-region does not | Low-confidence OCR is already flagged and gated for operator correction |
| **Parsing** | Built, deterministic | `documentFacts.ts` — filename/title/doc_type/metadata only, value-driven typing, explicitly "no OCR, no LLM" | Facts are already value-shaped, not semantic | Fact-level rather than document-level | Fact→field mapping corrections |
| **Understanding** | Built, deterministic | `classifyNonFormSource.ts` — weighted token scoring with honest confidence; `operatorCorrection.ts` records overrides | Classify on tokens, never on full text | Classify header separately from body | **Operator corrections are already captured** |
| **Blueprint proposal** | **Not built** | — | Propose structure, never content | Per-section proposals | Accepted/rejected proposals |

**Four of the five steps exist and all four are deterministic.** Only Blueprint
proposal is unbuilt. Every built step emits confidence rather than false
certainty — `classifyNonFormSource` is "honest and confidence-based", and OCR
flags low-confidence output and routes it through the same operator
review-and-correction experience.

**OCR is the single most important readiness fact in Processing**: the highest-risk
data in Alloy (child identity, DOB, subsidy, signatures on scanned documents) is
already processed **entirely on-premises**. Any future document *understanding*
step would be the first thing to move that content off the machine — which is
precisely where the Trust Runtime must sit, and why §10 lists redaction coverage
for document binaries as blocking.

---

## 5. BOS analysis — Create Lead

Responsibility split as it stands after the routing work:

| Step | Belongs to | Today | Where AI is actually valuable |
|---|---|---|---|
| **Intent** ("is this a Create Lead request?") | AI *eventually*, Alloy today | Bounded alias vocabulary + interrogative guard + configuration veto | **Moderate** — aliases cover the phrasings we predicted; AI would cover the ones we did not. Low stakes: a miss falls through to clarify. |
| **Entity grouping** ("Avery is the parent, Joey is the child") | **AI** | Rule-based role assignment | **High** — this is genuine language understanding and the deterministic parser is weakest here |
| **Relationship inference** | **Alloy** | Relationship Authority, from stored facts | **None.** Inferring a guardian from prose is precisely what P7.0 forbids |
| **Field mapping** | AI-assisted, Alloy-authoritative | Effective intake spec from field definitions/option sets | **Moderate** — matching "preschool" to a configured option is fuzzy; the *set of legal targets* must stay configuration |
| **Option matching** | AI-assisted, Alloy-authoritative | Deterministic match against option sets | **High for ambiguity detection**, zero for resolution — ambiguity must be shown, never guessed |
| **Validation** | **Alloy only** | `createLeadIntakeValidation.ts` | **Prohibited** |
| **Permissions** | **Alloy only** | Action Registry + eligibility resolver | **Prohibited** |
| **Execution** | **Alloy only** | `POST /api/admin/actions/execute` → registered `create_lead` | **Prohibited** |

The honest summary: AI's value in BOS is concentrated in **entity grouping** and
**ambiguity detection**. Everything downstream of "which fields did the operator
mean" is already deterministic and must stay that way.

---

## 6. Operational volume estimates

Basis: 50 locations · 100 operators · 2,000 enrollments/year · 5,000 subsidy
documents/year. **Operations only — no token or price estimates.**

| Domain | Driver | Annual operations | Peak assumption |
|---|---|---|---|
| **Processing** | 5,000 subsidy docs + ~2 enrollment docs per enrollment (4,000) | **~9,000 documents/yr** | Pages, not documents, is the real unit: at ~3 pages average, **~27,000 page operations/yr** (~110/business day) |
| **Processing (if per-region)** | ~4 regions/page | **~108,000 region operations/yr** | This is the number that matters for a per-call Trust Runtime |
| **BOS Create Lead** | 2,000 enrollments, ~1.3 attempts each | **~2,600 intake parses/yr** | ~10/business day across 100 operators — trivially small |
| **BOS other commands** | ~8 commands/operator/day × 100 × 250 days | **~200,000 command invocations/yr** | Almost all deterministic today |
| **Communications** | ~6 messages/enrollment | **~12,000 drafts/yr** | Rewrite is opt-in; assume ≤30% → **~3,600** |
| **Search** | ~15 searches/operator/day | **~375,000 searches/yr** | **Deterministic today**; semantic search would make this the single largest AI consumer by an order of magnitude |

**Implication for the Trust Runtime:** document *regions* and *search* dominate
volume, and both are currently zero. A per-call governance design must be sized
for ~100k–400k operations/yr, not for the ~2.6k Create Lead parses that get all
the attention.

---

## 7. Learning inventory

Places Alloy already captures human judgement that could become canonical
learning:

| Source | Where | Captured today | Reusable signal |
|---|---|---|---|
| **Document classification corrections** | `lib/pos/processingCase/classification/operatorCorrection.ts` | **Yes** — explicit correction module | Per-org document-type recognition |
| **Processing field mappings** | `mapProcessingCandidates.ts`, review flow | Partly — the mapping is applied; acceptance is not obviously retained | Fact → field mapping per org and document type |
| **BOS intake corrections** | `draftEdits.ts`, `BosInputEvidence` (`operator_edit`, `option_match`) | **Yes** — evidence kinds already distinguish parsed vs operator-edited | Which phrasings mean which field |
| **Objective Contributions** | `objective_contributions.authorization_basis`, resolution history | **Yes**, richly | Confirmation vs dissent per requirement type |
| **Command confirmations** | Action Registry preview → confirm | Partly — outcomes are audited; the *diff* the operator accepted is not modelled as learning | Which previews operators accept unchanged |
| **Relationship authority** | `person_child_relationship_roles` | **Yes** | Ground truth — must **never** be inferred |

`BosInputEvidence` is the most valuable existing artefact: it already
distinguishes `parsed_from_source` from `operator_edit` from `option_match`,
which is exactly the label a learning system needs and the hardest thing to
retrofit.

---

## 8. Trust Runtime dependency map

```
                    ┌─────────────────────────┐
                    │   TRUST RUNTIME (TBD)   │
                    └───────────┬─────────────┘
        ┌───────────────┬───────┴────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   POLICY          REDACTION        PROVIDER           TELEMETRY
   aiPolicy.ts     redaction.ts     providerTypes.ts   aiUsageTelemetrySchema.ts
   (exists)        (exists)         (exists)           (exists)
        │               │                │                  │
        └───────────────┴────────┬───────┴──────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │  CONSUMERS (by risk)   │
                    ├────────────────────────┤
   HIGH  ─────────► │ Doc understanding      │  child identity, subsidy, signatures
                    │ (unbuilt; OCR is local)│
   MED   ─────────► │ BOS intake             │  PII, deterministic fallback exists
   MED   ─────────► │ Semantic search        │  unbuilt; highest volume
   LOW   ─────────► │ Comms rewrite          │  unwired
   LOW   ─────────► │ Attention enrichment   │  only live consumer; stubbed
                    └────────────────────────┘
                                 │
                    ══════════ HARD BOUNDARY ══════════
                                 │
                    ┌────────────────────────┐
                    │ NEVER AI-REACHABLE     │
                    │ authorization · exec   │
                    │ permissions · truth    │
                    │ validation · ownership │
                    └────────────────────────┘
```

Critical path: **policy → redaction → provider → telemetry**. All four exist as
modules today; none has carried production traffic.

---

## 9. Existing seams that already support migration

1. **`lib/ai/aiPolicy.ts`** — per-org/work-unit policy from JSON metadata, no
   migration needed. Already models `enabled`, `provider`, `allowed_features`,
   `pii_mode`, `logging_mode`, `retention_mode`. **Defaults to fully off.**
2. **`lib/ai/redaction.ts`** — deterministic, pure, path-aware, returns auditable
   `RedactionStep[]`.
3. **`lib/ai/providerTypes.ts`** — provider indirection with a closed outcome set
   (`ok | disabled | policy_denied | timeout | error`). `policy_denied` as a
   first-class outcome is exactly the Trust Runtime's vocabulary.
4. **`lib/ai/aiUsageTelemetrySchema.ts`** — usage telemetry contract.
5. **`aiEnrichmentPermissions.ts` / `aiEnrichmentRouteGuards.ts`** — permission
   and route gating already separated from the provider.
6. **`BosInputEvidence`** — provenance per value (parsed / operator-edited /
   option-matched / system default). The learning substrate, already in place.
7. **The Objective authorization conjunction** — a worked precedent for
   "unevaluable REFUSES rather than passing by omission", which is the disposition
   a Trust Runtime needs.
8. **Confidence-honest classification** — `classifyNonFormSource` already returns
   confidence and declines to guess.
9. **Deterministic fallbacks everywhere** — every proposed AI consumer has a
   working non-AI path today. Migration can be additive.

---

## 10. Areas that would require refactoring

| Area | Issue | Effort |
|---|---|---|
| **Provider adapters** | Only OpenAI-compatible is implemented; `anthropic` and `azure_openai` are in the key union but have no adapter. `liveProviderAdapterPlaceholder.ts` is a design note. | Medium |
| **Prompt location** | There is no prompt registry. Requests are composed by callers, so prompts would scatter the moment a second consumer appears. | **Do before the second consumer** |
| **Model selection** | `OPENAI_MODEL` from env, globally. No per-capability or per-org model choice, no fallback chain. | Medium |
| **Redaction coverage** | No handling for subsidy identifiers, signature images, or document binaries — precisely the Processing payloads. | Medium, blocking Processing AI |
| **Telemetry persistence** | Schema exists; `retention_mode: "durable_future"` signals no persistence today. Cost and audit both need it. | Medium |
| **Learning capture** | Corrections are captured for *operational* purposes, not modelled as reusable training signal. No canonical store. | Large — but do not build until the runtime exists |
| **Search** | No embeddings, no pgvector, no vector column. Semantic search is greenfield and would be the largest consumer. | Large |
| **`AI_ALLOWED_FEATURES`** | A flat feature list with no risk tier. Trust Runtime will want mandatory/fallback/convenience/prohibited as a first-class axis. | Small, do early |
| **Processing segmentation** | The pipeline has no region/page abstraction, so "send only the flagged region" has nothing to name. | Large, blocking |

---

## What was deliberately not done

No Trust Runtime code. No AI added. No prompt rewritten. No pipeline redesigned.
No change to the Objective Platform, Relationship Authority, the participant
Host, or BOS routing. This document is inventory and dependency analysis only.
