---
owner: platform
status: proposed
mission: trust-platform-adoption
last_reviewed: 2026-08-07
supersedes: []
---

# Phase 2.0 — Provider, Privacy and Communications Adoption Assessment

**Assessed against `origin/staging` at `edf2a629a52035af2637bca5aee6fd7b81c8a398`**, which contains the
Phase 1 closeout merge `2d24b00da285fdefc0c696a6078721d232360591` (PR #356).

This is a code-grounded implementation assessment. It implements nothing, redesigns neither Trust nor
Communications, and modifies no canonical doctrine. Every claim below cites the file that proves it.

> **F-1 was closed by Phase 2.8 Gate D (2026-08-10).** The ungoverned egress this document is built
> around — `lib/ai/openAiCompatibleStructuredProvider.ts`, together with
> `enrichAttentionSuggestionStub.ts`, `resolveStructuredAiProvider.ts`, `disabledProvider.ts` and
> `scripts/validateOpenAiEnrichmentLocal.ts` — was **deleted**, not unlinked. The enrichment route
> reaches a provider only through the governed Trust path, and
> `tests/trust/ungovernedEgressRetired.test.ts` fails if any module in the tree reintroduces provider
> egress, whether or not anything imports it.
>
> The paths and line numbers below are left exactly as written. They are the record of what was
> assessed; rewriting them in place would erase the finding rather than close it.

---

## 0. The three findings that govern everything else

Stated first, because the rest of this document is their evidence.

### F-1 — Alloy already has exactly ONE live external-provider egress path, and it is NOT Trust-governed

`web/lib/ai/openAiCompatibleStructuredProvider.ts:149` performs the only outbound provider call in the
repository. It is reached from `app/api/admin/ai/enrich-attention-suggestion/route.ts:130`.

That route has two mutually exclusive branches:

```text
route.ts:70   permitsReasoningMode(authorization, "deterministic_local")
                → enrichAttentionSuggestionViaTrustRuntime(...)   → Trust Runtime, NO provider
route.ts:130  otherwise (provider_backed)
                → enrichAttentionSuggestionStubEnvelope(...)      → OpenAI, NO Trust Runtime
```

The route's own comment states the intent plainly (`route.ts:67-69`): *"The live-provider branch is
deliberately untouched — Slice 1 sends nothing anywhere, and rerouting a provider call is Slice 2's
decision to make."*

So the provider path and the governed path are alternatives, not a pipeline. **Phase 2's first
structural obligation is not to add a provider — it is to move the provider that already exists inside
the governed path.** No new egress is required to prove provider-backed Trust reasoning; one existing
egress must be re-parented.

### F-2 — The Privacy Engine honours exactly ONE of six declared transformations

`lib/trust/classification/informationClasses.ts:37-46` declares a transformation per information class:

| Class | Declared transformation |
|---|---|
| `identity` | `tokenize` |
| `relationship` | `abstract` |
| `operational` | `pass_through` |
| `financial` | `aggregate` |
| `compliance` | `pass_through` |
| `communications` | `summarize` |
| `behavior` | `aggregate` |
| `knowledge` | `pass_through` |

`lib/trust/privacy/privacyEngine.ts:91-96` consumes them:

```ts
for (const element of input.classification.elements) {
    if (element.transformation === "withhold") continue;
    admitted[element.key] = element.value;
}
const { redacted, steps } = redactObjectForAi(admitted, { pii_mode: input.policy.pii_mode });
```

`withhold` drops the element. **Every other transformation is a no-op** — `tokenize`, `abstract`,
`aggregate`, `summarize` and `pass_through` are behaviourally identical, and the only actual
minimization is the generic regex masker. A repository-wide search finds no tokenization, no vault, no
rehydration and no detokenization anywhere (`grep -rl "tokenize\|rehydrat\|detokeniz\|pseudonym" lib/`
returns three files, none of which implements any of it).

Phase 1 was safe under this because every governed element it produced was a category, a count, a band
or a Processing-authored sentence — PII-free by construction, so a no-op transformation cost nothing.
**That property ends the moment a message body becomes an element.**

### F-3 — The existing privacy primitive cannot pass a message body to a provider *at all*

`lib/privacy/redactObject.ts` decides by **field name**, not by content:

```ts
const NOTE_KEY = /(note|notes|body|message|comment|transcript)$/i;
...
if (NOTE_KEY.test(key)) return redactFreeform(s, path, steps);   // → "[note:redacted:412chars]"
```

Given `{ message_body: "Hi, this is Sarah Jones, my daughter Emma starts Monday" }`, the key matches
`NOTE_KEY` and the entire body is replaced by a length token. Given a key that does *not* match — say
`inbound_text` — the body passes through **completely unredacted** except for incidental email/phone/
date pattern hits.

There is no middle. The primitive can destroy a message or leak one; it cannot minimize one. This is
the single hard blocker between here and the first Communications provider call, and it is exactly the
deferred decision the Phase 1 closeout §13.4 named.

---

## 1. Current provider inventory

Complete. Every provider-related module in the repository.

| Provider/path | Owner | Live? | Callers | Data sent | Structured output | Cost | Timeout | Trust-governed? |
|---|---|---|---|---|---|---|---|---|
| `lib/ai/openAiCompatibleStructuredProvider.ts` → `${OPENAI_BASE_URL}/v1/chat/completions` | `lib/ai` | **YES — the only live egress** | `resolveStructuredAiProvider.ts:41` ← `enrichAttentionSuggestionStub.ts:152` ← `app/api/admin/ai/enrich-attention-suggestion/route.ts:130`; also `scripts/validateOpenAiEnrichmentLocal.ts:149` | System prompt + JSON of `{correlation_id, request_id, org_id, feature, redacted_context}`; `redacted_context` is `redactObjectForAi` output over six fields of the deterministic suggestion | `response_format: {type:"json_object"}`, then `safeParseAttentionSuggestionAiEnrichmentV1` | **none measured** | `AbortController`, `OPENAI_REQUEST_TIMEOUT_MS`, default 20 s, clamped 1–30 s | **NO** |
| `lib/ai/stubProvider.ts` | `lib/ai` | no (in-process) | `resolveStructuredAiProvider.ts:48` | n/a | fabricated envelope | n/a | n/a | no |
| `lib/ai/disabledStructuredProvider.ts` | `lib/ai` | no | default branch of resolver | nothing | n/a | n/a | n/a | n/a |
| `lib/ai/liveProviderAdapterPlaceholder.ts` | `lib/ai` | no | none in `app`/`lib` | nothing | n/a | n/a | n/a | n/a |
| `lib/ai/providerAdapterDesign.ts` | `lib/ai` | **types only** | type-exported via `lib/ai/index.ts:101-108`; zero implementations | n/a | declares `structured_json`, `streaming: false` | n/a | declares `AlloyProviderTimeoutPolicyV1` | n/a |
| `lib/trust/reasoning/strategies/*` (3 files) | `lib/trust` | no — all `deterministic` | Trust Runtime | context only | proposal object | reports nothing (⇒ 0) | none | **yes** |
| `lib/adminV2/bos/communication/generateOperationalDraft.ts` | Communications/BOS | no | BOS rail | n/a | template output | n/a | n/a | no |

**Live external-provider egress paths: exactly one.**

### Provider identity, credentials and configuration as they exist today

- **No vendor SDK is installed.** `package.json` contains no `openai`, `@anthropic-ai/*`, `@ai-sdk/*`,
  `ollama`, `cohere-ai` or `langchain` dependency. Every provider interaction is raw `fetch`.
- **Declared provider keys** (`lib/ai/providerTypes.ts:8`):
  `"disabled" | "stub" | "openai" | "anthropic" | "azure_openai"`. Only `openai` has an implementation;
  `anthropic` and `azure_openai` are parsed by `parseAiPolicyFromMetadata` (`aiPolicy.ts:61`) and then
  **fail closed** at `resolveTrustAuthorization.ts:378` with `AI_POLICY_PROVIDER`.
- **No xAI/Grok, Ollama, vLLM or OpenRouter integration exists**, by name or by adapter.
- **Credentials are environment-only**: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`,
  `OPENAI_REQUEST_TIMEOUT_MS`, `OPENAI_CHAT_TEMPERATURE`, plus the gates `AI_ENRICHMENT_STUB_ENABLED`
  and `AI_ENRICHMENT_USE_PERMISSION_REQUIRED`. There is no per-org credential storage for AI.
- **Fallback: none.** `resolveStructuredAiProviderForPolicy` returns exactly one provider; a failed
  live call yields a null overlay, never a second attempt at another provider.
- **Retry: none.** `AlloyProviderRetryPolicyV1` is a type with no implementation.
- **Cancellation:** timeout-driven `AbortController` only; no caller-supplied signal reaches the
  provider (`AiStructuredProvider.completeStructured` accepts `{timeout_ms}`, not `{signal}` —
  `providerTypes.ts:67`; the design type at `providerAdapterDesign.ts:70` accepts a signal, but nothing
  implements it).
- **Health checking: none.**
- **Cost / token / compute reporting: none.** The provider discards the OpenAI `usage` object entirely
  — `extractChatCompletionContent` reads only `choices[0].message.content`.
- **Egress telemetry** (`lib/ai/enrichmentTelemetry.ts`, `aiUsageTelemetrySchema.ts`) records
  `provider_key`, `outcome`, `latency_ms` and a redaction step count — but this is the **`lib/ai` event
  stream, not `trust_reasoning_usage`.** The two do not meet.

### Authorization already in place (and it is good)

`lib/ai/resolveTrustAuthorization.ts` is a two-stage seam covering three consumers
(`attention_draft_enrichment`, `task_assist_propose`, `workflow_assist_propose`). Stage 1 = identity /
org / portal, before any request body is parsed. Stage 2 = org policy, reasoning mode, provider
availability, actor. It fails closed on unknown providers. Its module header states the dependency
direction Phase 2 must preserve: *"`lib/ai` imports the Trust authorization CONTRACT (types only,
erased at runtime). Trust never imports `lib/ai` for authorization."*

**This is not a gap.** Phase 2 should consume it, not rebuild it. Its one Phase 2-relevant limitation is
that `TrustReasoningMode` is a two-valued distinction (`deterministic_local` / `provider_backed`) that
cannot express *local model* as a third posture — see §5.

---

## 2. Current privacy implementation

| Privacy capability | Doctrine requires | Implemented | Used live | Blocker before provider call? |
|---|---|---|---|---|
| Privacy policy registry | yes | **yes** — `TRUST_REGISTRY.getPrivacyPolicy`, dangling refs fail composition | yes | no |
| Platform-owned policies (capabilities reference by key) | yes | **yes** — `platformPrivacyPolicies.ts`, 3 policies, all `pii_mode: "strict"` | yes | no |
| `withhold` | yes | **yes** — `privacyEngine.ts:92` | never exercised (no element declares it) | no |
| Masking / field minimization | yes | **partial** — `redactObjectForAi`, key-name regexes | yes | **yes — cannot minimize free text (F-3)** |
| `tokenize` | yes (`identity` class) | **NO — declared, silently ignored** | no | **YES — hard blocker for any identity-bearing element** |
| `abstract` | yes (`relationship`) | **NO — no-op** | no | yes, if a relationship element is ever sent |
| `aggregate` | yes (`financial`, `behavior`) | **NO — no-op** | no | mitigated: all 3 policies list `financial` in `prohibited_classes`, so financial refuses outright |
| `summarize` | yes (`communications`) | **NO — no-op** | **yes, latently** — `draft_body` is classified `communications` and passes through unsummarized | **YES — this is the Communications class** |
| Vault | implied by `tokenize` | **NO — does not exist** | no | no (not required for the recommended first use case — see §6) |
| Rehydration | implied by `tokenize` | **NO — does not exist** | no | no (not required for the recommended first use case) |
| Information classification | yes | **yes** — `classifyElements`, per-capability `semanticMap`, unmapped ⇒ `identity` (conservative) | yes | no |
| Sensitive-field detection | yes | **partial** — by KEY NAME only, never by content | yes | **yes — no content-based detection exists** |
| Provider-bound payload construction | yes | **NO** — the governed path builds a `ReasoningContextV1`, but nothing turns one into a provider payload | no | **YES — the seam does not exist** |
| Egress audit / telemetry | yes | **partial** — `privacy_report` on the package records `pii_mode`, `classes_present` and redaction step paths+kinds; the `lib/ai` egress event stream is separate and unlinked | yes | yes, for truthful egress reporting |
| Refusal on prohibited class | yes | **yes** — `PRIVACY_PROHIBITED_CLASS` refuses the WHOLE transform, never silently drops | yes | no |
| Privacy tests / certification | yes | **yes** — Phase 1 closeout §7 privacy audit, plus `trustBoundary.test.ts` | yes | no |

### The compatibility trap in making transformations real

Turning `transformation` into a real dispatch is **not** behaviour-neutral for the existing registered
classes. `ATTENTION_SUGGESTION_SEMANTIC_MAP` (`lib/trust/consumers/attentionSuggestionEnrichment.ts:37`)
declares `draft_body: "communications"` and `channel: "communications"` — both of which map to
`summarize`. Today `summarize` is a pass-through. If Phase 2 implements `summarize` honestly, the live
attention-enrichment class changes what it feeds its strategy, and if `summarize` is implemented as
*refuse-until-built* the class stops producing recommendations.

**Any transformation-dispatch slice must therefore pin current behaviour for already-registered classes
explicitly**, not rely on the dispatch defaulting the same way. This is the single most likely source of
a silent Phase 2 regression.

---

## 3. Communications inventory and candidate matrix

### What exists

- **Schema** (`supabase/migrations/20260430254100_communications_v1_foundation.sql`):
  `communication_threads` (org, primary entity, channel ∈ `sms|email|in_app`, recipient key, metadata
  jsonb) and `communication_messages` (thread, channel, `direction ∈ inbound|outbound`, `status`,
  **`body text`**, `from_address`, `to_address`, `provider`, `provider_message_id`, metadata jsonb).
  Plus `communication_preferences`, `communication_delivery_events`, `communication_scheduled_sends`,
  `communication_templates` / `_template_versions`, `communication_identities` / `_grants` /
  `_location_bindings`, `communication_provider_accounts` / `_bindings`, `communication_message_reads`,
  `communication_message_recipients`, `messages`, `messages_outbox`.
- **Inbound processing**: `lib/communications/v2/inboundNormalization.ts` (69 lines),
  `lib/communications/identity/inboundResolveIdentity.ts`, `lib/communications/v2/smsKeywords.ts`
  (50 lines — STOP/START/HELP compliance keywords).
- **Deterministic signal layer**: `lib/communications/v2/bosIntelligence.ts` (130 lines, its header
  says *"PURE, DETERMINISTIC, no I/O"*). `buildConversationSignals()` computes `awaitingResponse`,
  `openedNotReplied`, `sentNotOpened`, `responseRate`, `openRate` **from timestamps and direction
  only — it never reads a body.**
- **Topic presentation**: `lib/communications/v2/familyWorkspace/threadTopicPresentation.ts` (278 lines).
- **Drafts / composer**: `lib/adminV2/bos/communication/` — `generateOperationalDraft.ts` (header:
  *"deterministic-first with optional AI hook (future) … Currently deterministic-only; AI-assisted mode
  reserved for future provider wiring"*), `communicationDraftSynthesis.ts`,
  `communicationDraftChannelCompose.ts`, `communicationObjectives.ts`.
- **Send pipeline**: `lib/communications/send/canonicalSend.ts`, `canonicalOutboundEnqueue.ts`,
  `eligibility/evaluateEligibility.ts`, `v2/consentGate.ts`, `v2/preferences.ts`,
  `communicationScheduledSendsService.ts`, `v2/providers/twilioSmsAdapter.ts`.
- **Current Communications Trust adoption: ZERO.** `lib/trust/capabilities/` contains exactly three
  directories — `attentionSuggestionEnrichment`, `processingSourceClassification`,
  `processingIdentitySubjectResolution`. No Communications decision class, no Communications privacy
  policy, no Communications strategy.
- **There is no `reply_needed` column or state.** The nearest thing is the derived, in-memory
  `ConversationSignals.awaitingResponse`.

### Candidate matrix

Scored from the code above. **Lower authority risk and lower PII exposure are better; higher provider
benefit and testability are better.**

| Candidate | Authority risk | PII exposure | Reversibility | Provider benefit | Deterministic fallback | Testability | Verdict |
|---|---|---|---|---|---|---|---|
| **Inbound message classification** (closed label vocabulary over ONE inbound body) | **none** — writes nothing; a label is metadata, and no send path reads it | **one message body** | **total** — a label is corrected by an operator; Phase 1.6 supersession lineage already exists | **high** — `smsKeywords.ts` handles only STOP/START/HELP; everything else is unclassified today | **yes** — `smsKeywords.ts` + `threadTopicPresentation.ts` give a real level-0 strategy to escalate FROM | **highest** — fixed corpus, expected labels, exact-match assertions | ✅ **RECOMMENDED FIRST** |
| Reply-needed explanation | none | **lowest** — signals only, no body | total | **low** — `buildConversationSignals().awaitingResponse` already answers it deterministically | complete | high | ❌ proves nothing about provider value or privacy |
| Thread summarization | none directly | **highest** — the entire thread's bodies | total | high | **none** | **low** — free text cannot be asserted, only shape-checked | ❌ see below |
| Suggested reply / draft | **HIGH** — output is a body destined for `canonicalSend` / `canonicalOutboundEnqueue`, behind eligibility, consent gate and preferences | high | operator-gated, but the artefact is a sendable message | high | **yes** — `communicationDraftChannelCompose.ts` | medium | ❌ not first — see §7 D-3 |

**Why not thread summarization, explicitly.** Its output is free text. Phase 1's entire safety model is
that the Trust Runtime *deterministically validates* the proposal before it becomes a recommendation
(`trustRuntime.ts:278`, `orchestrateValidation`). A free-text summary can only be shape-checked, never
validated — so choosing it first would prove the provider seam while quietly retiring the validation
guarantee that makes the seam safe. A closed-vocabulary classification can be validated **totally**: a
label outside the declared vocabulary is refused, exactly like `safeParseAttentionSuggestionAiEnrichmentV1`
refuses a malformed overlay today.

---

## 4. Telemetry gaps

`trust_reasoning_usage` as built (`supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql:202`):

```sql
id, org_id, contract_id, decision_class_key,
strategy_key, strategy_kind, escalation_level,
latency_ms, cache_utilized,
provider_cost_units numeric NOT NULL DEFAULT 0,  -- "V1 runs no provider, so this is structurally zero"
outcome, recorded_at
```

Written once, from `trustRuntime.ts:392` (`repository.insertReasoningUsage`). Append-only, enforced by
`refuse_trust_reasoning_usage_mutation()`.

Operational Intelligence already reads it and already **documents its own blindness** — from
`lib/metrics/registry.ts`: *"Local-model execution is NOT distinguishable from deterministic in the
current schema"* and *"This counts escalation DEPTH, not provider usage — the schema records no provider
identity."* Four Trust metrics exist: `trust.deterministic_resolution_rate`,
`trust.escalated_decision_count`, `trust.reasoning_latency_p50`, `trust.provider_cost_units`.

| Field | Present | Required for first live provider call | Note |
|---|---|---|---|
| `strategy_key`, `strategy_kind`, `escalation_level` | ✅ | ✅ | already sufficient |
| `latency_ms` | ✅ | ⚠️ **insufficient** | measured across the WHOLE runtime pass (`clock() - startedAt`), not the provider call. Provider latency is unrecoverable from it |
| `provider_cost_units` | ✅ | ✅ | validated by `parseProviderCostUnits`; refuses NaN/∞/negative rather than clamping |
| `outcome` | ✅ | ✅ | |
| `cache_utilized` | ✅ column | ⚠️ **hard-coded `false`** at `trustRuntime.ts:360` and `:403` — the column is real, the value is a literal | must become strategy-reported |
| **`provider_key`** | ❌ | ✅ **required** | the point of the phase |
| **`model_key`** | ❌ | ✅ **required** | |
| **`execution_locality`** (`local` / `external`) | ❌ | ✅ **required** | without it the local-first claim is unverifiable, and OI says so already |
| **`input_units` / `output_units`** | ❌ | ✅ **required** | the OpenAI `usage` object is currently discarded outright |
| **`routing_reason`** | ❌ | ✅ **required** | why this strategy, over which alternative |
| **`escalation_source`** | ❌ | recommended | deterministic-declined vs policy-forced vs operator-requested |
| **`provider_latency_ms`** | ❌ | ✅ **required** | distinct from runtime latency |

**Doctrine constraint, restated:** provider identity belongs in usage/economics telemetry and **must not**
enter a Decision Package. This is enforced today by
`tests/trust/phase1CloseoutCertification.test.ts:337` — *"no Decision Package carries provider identity
or a command binding"*, screening for `provider`, `model`, `command_key`, `prompt`. Note the package's
`economics.provider_cost_units` survives that screen because the assertion targets package **content**,
not the literal substring; any Phase 2 telemetry work must re-read that control rather than assume it.

**Minimum viable telemetry addition: 7 columns** (`provider_key`, `model_key`, `execution_locality`,
`input_units`, `output_units`, `provider_latency_ms`, `routing_reason`) — the first migration of the
entire Trust adoption program (§11).

---

## 5. Provider configuration and credential ownership

Answering the seven questions with repository evidence.

**1. Which provider settings are platform-global?**
Provider *implementations*, the strategy ladder (`REASONING_STRATEGY_KINDS`), privacy policies
(`platformPrivacyPolicies.ts` — doctrine: *"Policies are platform-owned"*), the transformation table
(`INFORMATION_CLASS_TRANSFORMATIONS`), and default timeout/retry ceilings. Precedent: the Trust Registry
is composed once, at module load, and frozen (`trustRegistry.ts:52`).

**2. Which are organization-specific?**
Whatever `ai_policy` already owns, in `org_settings.metadata` (`aiPolicy.ts:10,121`): `enabled`,
`provider`, `allowed_features`, `pii_mode`, `logging_mode`, `retention_mode`. Phase 2 adds at most
`allowed_models` and a local-vs-external posture. **No migration is needed for org policy** — it is JSON
metadata by design, and that is why the AI foundation shipped without one.

**3. Which are capability policy?**
The Decision Class, verbatim from `DecisionClassDefinitionV1`: `strategy_preference`,
`economic_policy.max_escalation_level`, `economic_policy.max_latency_ms`, `trust_threshold`,
`review_requirement`, `privacy_policy_key`, `validation_policy_key`, `requires_allowed_feature`.

This matters more than it looks. `ATTENTION_SUGGESTION_ENRICHMENT_CLASS` sets
`max_escalation_level: 0` (`contribution.ts:42`) and `strategy_preference: ["deterministic"]`. A
provider-backed strategy at level 3 or 4 would be **refused by `selectStrategy`**
(`strategyEngine.ts:54`, `STRATEGY_EXCEEDS_ESCALATION_BUDGET`) even after registration. Registering a
provider strategy is therefore necessary but not sufficient — the class ceiling is a second, independent
gate, and that is the correct place for the routing policy to live. **No product-specific routing policy
belongs in a capability's code; it belongs in its Decision Class declaration.**

**4. Which values are secrets?**
API keys only. Everything else — base URL, model id, deployment id, api-version — is non-secret.
`providerAdapterDesign.ts:22` already states the rule: *"resolve from env at runtime — never embed
secrets in JSON."*

**5. Which settings belong in normal configuration?**
Model ids, base URLs, allowed-model lists, per-class ceilings, timeouts, budgets.

**6. What minimum config is needed before the first live call?**
Nothing new. `OPENAI_API_KEY` + `OPENAI_MODEL` (+ optional `OPENAI_BASE_URL`), the two env gates, and an
org `ai_policy` naming the provider and allowing the feature. All of it exists and is already exercised
by `scripts/validateOpenAiEnrichmentLocal.ts`.

**7. What management UI should be deferred until after runtime proof?**
All of it. See §12.

### Secret-storage precedent worth following

Communications already solved per-tenant provider credentials without storing secrets:
`communication_provider_bindings.secret_ref` and `communication_provider_accounts.secret_ref`, documented
as *"Opaque ref: `legacy_global_twilio` | `unconfigured` | `env:VAR_NAME` — resolved at runtime"*
(migration `20260430254100`, line 169). **When per-org AI credentials eventually arrive, they should use
`secret_ref`, not a new mechanism.** This is a precedent to reuse, not a Phase 2 deliverable.

---

## 6. Local / open-source model assessment

**Does a local execution path exist today?** No — but the seam does, and it is one environment variable
wide.

Evidence:

- `getOpenAiBaseUrl()` (`aiEnrichmentEnv.ts:34`) reads `OPENAI_BASE_URL` and only defaults to
  `https://api.openai.com`. The provider posts to `${base}/v1/chat/completions` with a bearer token.
  **Any OpenAI-compatible server — Ollama, vLLM, llama.cpp, LM Studio, LocalAI, OpenRouter — is already
  reachable by setting two env vars.** No code change.
- `AlloyLiveProviderFamily` already includes `"local_self_hosted"` (`providerAdapterDesign.ts:16`).
- **But it cannot be registered without special-casing**, for three reasons:
  1. `AiProviderKey` is a closed union (`"disabled"|"stub"|"openai"|"anthropic"|"azure_openai"`) with no
     local member, and `parseAiPolicyFromMetadata` fails closed on anything else.
  2. A local model routed through `OPENAI_BASE_URL` is **indistinguishable from OpenAI** in every
     telemetry field that exists. OI states this limitation itself.
  3. `TrustReasoningMode` is two-valued (`deterministic_local` | `provider_backed`). Local inference is
     *provider-backed* and *local* simultaneously; the type cannot say so.
- **What changes when inference is local:** the privacy boundary moves from *"data left the trust
  boundary"* to *"data stayed inside it."* That is a categorical difference and it should relax which
  transformations are required — but **only if `execution_locality` is a recorded, enforced fact**, not
  an operator's belief about a URL. A base URL pointing at `localhost` proves nothing about where the
  model runs; a declared, registered provider identity does.
- **Is local-first routing technically possible today?** Mechanically, yes — the escalation ladder
  already orders strategies by cost (`strategyEngine.ts:37`) and `selectStrategy` is deterministic
  least-cost-sufficient. Truthfully, no: nothing distinguishes a local strategy from an external one, so
  "local first" would be an unverifiable claim. **`execution_locality` telemetry is a prerequisite for
  local-first routing, not a follow-on to it.**

No specific open-source model is recommended. The platform seam is the deliverable; the model is a
configuration value.

---

## 7. The ten central architecture questions

**Q1 — What is the exact first provider-backed capability?**
**Inbound Communications message classification**: a single inbound `communication_messages.body`, one
closed label vocabulary, one bounded confidence band, operator-reviewable, writing nothing. Escalated to
from an existing deterministic strategy built on `smsKeywords.ts` + `threadTopicPresentation.ts`.

**Q2 — What information would it send?**
One element only: the minimized text of one inbound message body, plus its `channel` and `direction`. No
thread history, no participant identity, no entity ids, no addresses, no org name.

**Q3 — What privacy transformation is required before sending it?**
A transformation that does not currently exist: **in-text identity minimization** — detecting and
replacing identity spans *within* free text, as opposed to masking whole fields by key name. `withhold`
destroys the classification signal; the existing masker either destroys the body (`NOTE_KEY` match) or
passes it through (no match). See F-3.

**Q4 — Is reversible tokenization required for that use case?**
**No.** The output is a label; nothing in it needs to refer back to a real person, so a one-way,
non-reversible replacement is sufficient and a vault is not needed. Reversible tokenization becomes
required at the moment a model authors *text that is handed to a human containing real names* — i.e.
suggested reply and draft composition. **That is the precise boundary at which the vault decision must
be taken, and it is not in the first slice.** Recording it here is the answer to the Phase 1 closeout
§13.4 condition: the deferred decision is *taken*, with a stated scope, rather than deferred again.

**Q5 — Can a local model execute it through the same strategy contract?**
Yes, mechanically — `ReasoningStrategyV1.reason` already returns `ReasoningOutcome | Promise<...>`
(`reasoningStrategy.ts:100`), and `trustRuntime.ts:232` awaits either, so an async provider-backed
strategy needs **no runtime change**. But it cannot be *distinguished* as local until
`execution_locality` exists (§6).

**Q6 — What exact provider/configuration seam is missing?**
Three concrete things:
  1. **A provider port injectable into a Reasoning Strategy.** `lib/trust` may contain no `fetch(` and no
     `/openai/i` — enforced by `tests/trust/phase1CloseoutCertification.test.ts:131` and
     `tests/trust/trustBoundary.test.ts:114`. So the adapter must live outside `lib/trust`.
  2. **But there is no injection point.** `TRUST_CONTRIBUTION_MANIFEST` (`trustRegistry.ts:40`) is a
     static array of static imports, composed at module load and frozen; there is *no registration API
     after startup*. A provider-backed strategy must therefore be imported by a module under
     `lib/trust` — which puts a provider-reaching import inside the boundary control's scan scope.
     **This is the sharpest architectural gap in Phase 2** (see D-1).
  3. **No `ReasoningContextV1` → provider-payload builder.** The Privacy Engine produces a context; the
     provider consumes an `AiStructuredRequestV1`. Nothing maps one to the other, and that mapping is
     precisely where an un-minimized value would leak.

**Q7 — What exact telemetry fields are missing?**
`provider_key`, `model_key`, `execution_locality`, `input_units`, `output_units`,
`provider_latency_ms`, `routing_reason` (+ optional `escalation_source`); and `cache_utilized` must stop
being a hard-coded `false`. §4.

**Q8 — What failure semantics are missing?**
Retry (typed, unimplemented), fallback between providers, caller cancellation reaching the provider,
health checking, per-org budgets/limits, circuit breaking, and — the important one — **partial-cost
accounting on failure.** `ReasoningCostReport` is deliberately present on both the `ok: true` and
`ok: false` branches (`reasoningStrategy.ts:81-87`) because *"a provider call that ultimately failed
still spent something"*, but no strategy reports a cost today, so this correct design has never been
exercised. A timed-out provider call must report what it spent.

**Q9 — What should be the first implementation slice?**
**Not the provider contract.** The strategy contract is already async-capable and needs nothing; the
Privacy Engine is a no-op for five of six transformations and needs everything. The first slice must be
**the privacy transformation execution seam** — pure, dormant, behaviour-pinned for the three registered
classes. See §8.

**Q10 — What must explicitly wait?**
Suggested-reply/draft generation; the vault and rehydration; thread-level summarization; per-org AI
credentials; any provider-management UI; `anthropic` and `azure_openai` adapters; auto-send of anything;
BOS, Search, Configuration and Participant Runtime adoption.

---

## 8. Recommended Phase 2 slice plan

The suggested sequence is **reordered on evidence**. The proposed 2.1 (provider/strategy execution
contract) is largely already built; the privacy work is the blocker and must come first. Each slice
follows the Phase 1 pattern that worked: pure → dormant → live.

| Slice | Deliverable | Live? | Migration | Why here |
|---|---|---|---|---|
| **2.1** | **Privacy transformation execution seam.** Make `transformation` a real dispatch in `transformForReasoning`. Implement each named transformation as a pure function or an explicit `PRIVACY_TRANSFORM_UNIMPLEMENTED` refusal. **Pin current behaviour for all three registered classes by test.** | no — pure | no | F-2 is the blocker; nothing provider-backed is safe before it |
| **2.2** | **In-text identity minimization.** A content-based (not key-name-based) minimizer for free text, one-way, no vault. Registered as the `communications`/`summarize` implementation. Certified against an adversarial corpus. | no — pure | no | F-3; the specific capability the first use case needs |
| **2.3** | **Provider telemetry + the program's first migration.** Add the 7 columns to `trust_reasoning_usage`; extend `ReasoningCostReport` to carry provider identity and units; thread it to `insertReasoningUsage`; make `cache_utilized` strategy-reported. Assert provider identity still cannot reach a Decision Package. | no | **YES — the first** | telemetry must precede the call it describes, or the first call is unmeasurable |
| **2.4** | **Provider port + injection seam.** Resolve D-1. Define a `ReasoningProviderPort` in `lib/trust` (types only), implement it in `lib/ai` over the existing OpenAI-compatible provider, and establish how it reaches the registry without violating the boundary control. Register a **dormant** provider-backed strategy with zero callers. | no — dormant | no | mirrors Phase 1.3/1.4, which is the pattern that worked |
| **2.5** | **Communications Decision Class + deterministic strategy.** Register `communications_inbound_message_classification` with a level-0 deterministic strategy over `smsKeywords.ts`/`threadTopicPresentation.ts`, a dedicated privacy policy, and a closed-vocabulary validation policy. **Deterministic only** — `max_escalation_level: 0`. | **yes, deterministic** | no | proves the whole governed chain for Communications with no provider |
| **2.6** | **First live provider-backed decision.** Raise the class ceiling, add the provider-backed strategy at its escalation level, route the existing egress through Trust, and **retire the ungoverned branch at `route.ts:130`.** | **yes** | no | the actual milestone |
| **2.7** | **Failure, fallback, cost and operator certification.** Timeout/retry/cancellation, partial-cost-on-failure, budget ceilings, refusal surfacing, operator review + correction through Phase 1.6 lineage, browser QA. | yes | possibly | the debt Phase 1 was allowed to defer; Phase 2 may not |
| **Closeout** | Certification evidence, privacy audit, egress audit, known debt, Phase 3 entry conditions. | — | no | |

Slices 2.1–2.4 land **no user-visible behaviour**. That is intentional and is what made Phase 1 safe.

---

## 9. Architecture decisions requiring Director approval

**D-1 — How does a provider-reaching strategy enter a frozen, statically-composed registry?**
`lib/trust` may contain no `fetch(`/`openai` (two independent controls), yet
`TRUST_CONTRIBUTION_MANIFEST` is static imports composed once and frozen, with no post-startup
registration API. Options: **(a)** a composition-time injection parameter, breaking "composition happens
once, here"; **(b)** import a provider-backed strategy from `lib/ai` into a `lib/trust` contribution —
passes the current controls textually while weakening what they actually prove; **(c)** move the
capability contribution outside `lib/trust`, changing the extension-point model. *Recommendation:* (a),
with the boundary control strengthened from a textual scan to a transitive-import assertion so it keeps
meaning what it says. **This decision gates slice 2.4 and cannot be deferred past it.**

**D-2 — Does `TrustReasoningMode` gain a third value?**
Today `deterministic_local | provider_backed` cannot express local inference, which is both. Either add
`local_provider_backed` or make locality an orthogonal axis. Affects the authorization seam, the org
policy vocabulary and OI's stated blindness. *Recommendation:* orthogonal axis — locality is a property
of the execution, not of the permission.

**D-3 — Reversible tokenization is scoped OUT of the first provider use case, and IN at draft generation.**
Formally taking the Phase 1 closeout §13.4 deferred decision (Q4). Requires explicit acceptance that a
one-way minimizer is sufficient for classification, and that **no model-authored text may be handed to
an operator containing real names until a vault exists.**

**D-4 — Making transformations real is not behaviour-neutral.**
`draft_body` and `channel` are `communications` ⇒ `summarize`, live today as pass-through (§2). Approve
either pinning current behaviour for registered classes, or accepting a deliberate change to the live
attention-enrichment surface.

**D-5 — Retiring the ungoverned egress branch.**
Slice 2.6 removes `route.ts:130`. That is a behaviour change to a live operator surface and the point at
which "capabilities never call providers outside the governed path" becomes structurally true rather
than aspirational. It deserves an explicit yes.

**D-6 — `escalation_level` semantics for a local model.**
`REASONING_STRATEGY_KINDS` orders by *capability* (`small_reasoning` < `large_reasoning`), not by cost or
privacy. A large local model and a small external one invert on cost and on privacy simultaneously.
Approve whether escalation level remains capability-ordered with locality separate (recommended), or
becomes a composite.

---

## 10. Exact data-egress contract for the first live call

Normative for slice 2.6. Anything not listed is prohibited.

```text
SENT (after transformation, and only this):
  message_text        minimized inbound body — identity spans replaced, one-way, no vault
  channel             "sms" | "email" | "in_app"
  direction           always "inbound"
  label_vocabulary    the closed candidate list the model must choose from
  contract_id         Trust contract uuid (opaque; not an operational identifier)

NEVER SENT:
  org id, org name, tenant identifiers
  thread id, message id, entity ids of any kind
  from_address, to_address, recipient_key, provider_message_id
  any person, child, guardian or staff name in structured form
  message history, prior turns, thread context
  operator free text, internal notes
  financial values of any kind (refused outright by prohibited_classes)

RETURNED (validated before it becomes a recommendation):
  label               MUST be a member of label_vocabulary; anything else is refused
  confidence_band     ordered category — never a fabricated probability
  (nothing else — unknown keys are refused by the closed schema)

RECORDED:
  trust_reasoning_usage   provider_key, model_key, execution_locality, input/output units,
                          provider_latency_ms, cost_units, routing_reason
  Decision Package        recommendation, evidence, privacy_report, economics.cost_units
                          — and NO provider identity, NO model id, NO prompt
```

Two properties make this contract auditable rather than aspirational: the output vocabulary is closed,
so validation is total; and the input is a single element, so the egress audit is a one-line assertion
rather than a survey.

---

## 11. Migration expectations

- **Phase 1 introduced no migration across eight slices.** Phase 2 cannot maintain that: provider and
  model identity are new facts about a governed execution, and `trust_reasoning_usage` has no column
  that can honestly carry them.
- **Expect exactly one migration, in slice 2.3**, additive-only: 7 nullable columns on
  `trust_reasoning_usage`. No new table, no new idempotency mechanism, no backfill — existing rows are
  truthfully `NULL` because no provider participated in them.
- **`ai_policy` needs no migration** — it is `org_settings.metadata` JSON by design.
- **Communications needs no migration** for classification: `communication_messages.metadata jsonb`
  already exists, and the governed judgment lives in `trust_decision_packages` regardless.
- The append-only trigger `refuse_trust_reasoning_usage_mutation()` must survive the change and be
  re-certified against it.

---

## 12. Future control-plane requirements (documented, not built)

Discovered from implementation, for a later provider-management surface. Each is listed with the runtime
foundation that must exist before the UI could be **truthful** — a control plane that reports what it
cannot measure is worse than none.

| Control-plane need | Runtime foundation required first |
|---|---|
| Provider connection state | a health-check path — none exists |
| Model enablement | an `allowed_models` policy field + enforcement |
| Local vs external policy | `execution_locality` (2.3) + D-2 |
| Provider health | health checking + circuit state (2.7) |
| Usage | `provider_key` / `model_key` / units on usage rows (2.3) |
| Cost | units are recorded but **there is deliberately no pricing table** (`providerCostUnits.ts`: *"A COUNT OF UNITS, not money"*). A currency figure needs a pricing authority that does not exist and should be a conscious decision, not a UI feature |
| Escalation | `routing_reason` + `escalation_source` (2.3) |
| Privacy egress | a per-egress audit record linking a Decision Package to what left the boundary — does not exist |
| Budgets / limits | per-org budget enforcement (2.7); nothing enforces a ceiling today |

**Nothing in this list may be built before 2.7.**

---

## 13. Certification plan

| Gate | What it proves |
|---|---|
| Transformation dispatch tests | every declared transformation either transforms or refuses; none silently passes through |
| Behaviour-pinning tests (2.1) | the three registered classes produce byte-identical contexts before and after dispatch |
| Adversarial minimization corpus (2.2) | names, emails, phones, addresses, DOBs embedded in free text are minimized; classification signal survives |
| Egress contract control (2.6) | the provider payload contains **only** the §10 allow-list; an unlisted key fails **before** transport |
| Boundary control, strengthened (2.4) | `lib/trust` reaches no provider transitively, not merely textually (D-1) |
| Package purity control | provider/model identity is absent from every Decision Package — extends `phase1CloseoutCertification.test.ts:337` |
| Validation totality (2.5) | a label outside the vocabulary is refused, not repaired |
| Failure semantics (2.7) | timeout, refusal and partial-cost-on-failure each produce a Decision Package, never an exception |
| DB certification | the 7 new columns; append-only trigger still refuses UPDATE/DELETE |
| Both typecheck graphs | **CI only.** `npm run typecheck` exits 144 (SIGTERM) on this host under every mode; narrow scopes run. A job with `steps=0` never executed regardless of conclusion |
| Browser QA | **required for 2.6** — unlike Phase 1, this phase has a live operator surface and may not defer it |

---

## 14. Operator-QA expectations

Phase 1 shipped with **no browser QA** (closeout §10), which was defensible because no operator-visible
behaviour changed. That defence is unavailable from slice 2.5 onward.

- **2.1–2.4:** no operator-visible change; no QA expected. If an operator notices anything, that is a
  defect.
- **2.5:** an inbound message shows a deterministic classification with a governed provenance. QA is
  *"the label is right and the operator can correct it."*
- **2.6:** first observable difference. QA must cover: provider succeeds; provider times out (operator
  keeps the deterministic label, loses nothing); provider returns an out-of-vocabulary label (refused,
  operator sees a refusal not a bad label); operator corrects a provider-backed label and the Phase 1.6
  supersession lineage records it.
- **2.7:** budget exhaustion, provider unavailable, and refusal surfacing all read as **honest states**
  in the operator surface, never as silent absence.

---

## 15. Explicit non-goals

Not in Phase 2, by decision rather than omission:

1. Auto-send of any communication. Every provider-backed output stays advisory and operator-gated.
2. Suggested reply and draft generation (deferred to Phase 3 with the vault — D-3).
3. Reversible tokenization, the vault, and rehydration.
4. Thread-level summarization.
5. Any provider-management, usage or cost UI (§12).
6. Per-org AI credentials; env-only for the whole phase, with `secret_ref` as the documented future path.
7. `anthropic` and `azure_openai` adapters.
8. Streaming — `providerAdapterDesign.ts` declares `streaming: false` and structured JSON is the contract.
9. A pricing table or any currency figure.
10. BOS, Search, Configuration, Participant Runtime and Operational Intelligence adoption.
11. Any change to Communications send, eligibility, consent or preference authority.
12. Modifying Trust or Communications doctrine.

---

## 16. Phase 2 completion definition

Phase 2 is complete when **all** of the following hold:

1. Every declared privacy transformation either performs a real transformation or refuses explicitly;
   none silently passes through.
2. Free-text minimization is implemented, certified against an adversarial corpus, and used live.
3. `trust_reasoning_usage` records provider identity, model identity, execution locality, input/output
   units, provider latency and routing reason — and Operational Intelligence's documented blindness
   about local-vs-deterministic is retired in the registry text.
4. A Communications Decision Class is registered with a deterministic strategy and a
   closed-vocabulary validation policy.
5. One live provider-backed decision runs end to end through the Trust Runtime, with an operator
   reviewing and correcting it.
6. **`app/api/admin/ai/enrich-attention-suggestion/route.ts` has no ungoverned provider branch**, and a
   structural control asserts that no capability reaches a provider outside the governed path.
7. Failure semantics — timeout, retry, cancellation, partial cost, budget ceiling — are implemented and
   certified.
8. No Decision Package carries provider or model identity, proven by control.
9. Both typecheck graphs execute in CI with nonzero steps and pass.
10. Browser QA is performed and recorded.
11. A closeout document records architecture, authority boundaries, certification evidence, known debt
    and Phase 3 entry conditions.

**Phase 2 does not close on a working provider call. It closes when the ungoverned path is gone.**

---

## 17. Answers to the operational timing questions

- **When do provider credentials actually get connected?** They already are, for the ungoverned branch.
  For the *governed* path: slice 2.6. No new credential is needed at any point — `OPENAI_API_KEY` and
  `OPENAI_MODEL` cover the whole phase.
- **When does local/open-source inference first become usable?** Mechanically it is usable **today** by
  pointing `OPENAI_BASE_URL` at an OpenAI-compatible local server. It becomes *governed and truthfully
  reported* at slice 2.4 (registered provider identity) and *routable local-first* only after 2.3
  (`execution_locality`). Before 2.3, "we run locally" is an unverifiable claim.
- **When does Kelly first have something meaningful to test manually?** Slice **2.5** — a governed
  deterministic classification on a real inbound message, correctable in the operator surface. Slices
  2.1–2.4 are deliberately invisible. Slice 2.6 is the first time a provider is visibly involved.
- **What remains before a provider-management / usage-cost UI can be built truthfully?** Slice 2.3 for
  every usage and cost figure; 2.4 for provider identity; 2.7 for health, budgets and escalation; and a
  deliberate decision about whether Alloy owns a pricing authority at all (§12).
