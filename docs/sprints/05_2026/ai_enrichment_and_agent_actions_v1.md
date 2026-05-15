# Sprint plan: AI Enrichment, Operational Summaries, Proposal / Apply (post–AI Agents V1)

**Path:** `docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md`  
**Status:** Phase 1 **Cards 0–6** + Phase 2 **Cards 7–11** + Phase 2.5 **Cards 11.5–11.8** implemented: permission-aware AI route gate, org policy pre-check, adapter design placeholders, **RBAC seed migration** for **`ai.enrichment.use`** (+ optional catalog keys). No live HTTP providers / SDKs / secrets. Live provider remains behind pilot approval.  
**Prerequisite:** AI Agents V1 complete (`docs/sprints/05_2026/ai_agents_v1.md`) — deterministic needs-attention suggestion, `_attention_suggestion`, drawer header UX, queue preview, and **documentation templates** for **Agent 2 — Task Assist V1** (transactional / schedule; approval before send-schedule) and **Agent 3 — Workflow Assist** (reusable workflow config; drafts disabled-by-default; approval before save-apply) as **separate** agents.

---

## 1. Overview

This document sequences **three phases** after AI Agents V1:

1. **AI Enrichment + Privacy Boundary V1** — org-scoped enablement, provider abstraction (design + later implementation), redaction/minimization, structured enrichment contracts, optional model-assisted layers **behind** deterministic fallbacks, and usage/audit **design**.
2. **Operational Summaries V1** — short, operator-facing summaries of activity / entity context (drawer + optional queue preview), with an explicit decision on **derived vs cached vs persisted**.
3. **Proposal / Apply System V1** — durable proposals for suggestions (and related actions), accept/dismiss/apply APIs, alignment with existing **proposal + apply audit + DEFINER RPC** patterns, permissions, and integration with workflows/comms/record updates **only after explicit human approval**.

Each phase follows: **audit → design → sprint cards → implementation only when approved**.

---

## 2. Why this follows AI Agents V1

V1 established:

- A **versioned structured contract** (`AttentionSuggestionV1`) and deterministic builder.
- **Server-derived** attachments on authoritative reads; queue remains **preview-only**.
- **No LLM**, **no persistence** of suggestions, **no autonomous actions**.

The next phases add **optional** intelligence and **optional** durability while preserving:

- Structured JSON as the interchange format.
- Deterministic baseline when AI is off or fails.
- Human review before send/apply.
- Existing **workflows** and **`workflow_events`** / **`emitEvent`** as the operational spine where appropriate.

---

## 3. Current audit findings

### 3.1 AI / provider readiness

| # | Question | Finding |
|---|-----------|---------|
| 1 | AI provider abstraction? | **No** shared first-class abstraction (e.g. no unified `AiProvider` module) for LLM calls in `web/`. Agent work is route-scoped + lib modules (`web/lib/agent/**`). |
| 2 | OpenAI / LLM utilities? | **`web/package.json`** has **no** `openai`, `@anthropic-ai/*`, or Vercel AI SDK dependencies at audit time. Docs and archived specs discuss future LLM bridges; production agent routes are **structured / deterministic**. |
| 3 | Env vars for AI providers? | **No** `OPENAI_*` / `ANTHROPIC_*` style vars found in active `web` agent paths. **Existing gates:** `AGENT_V0_ENABLED`, `AGENT_V1_RECORD_LAYOUT_ENABLED`, `AGENT_V2_FIELD_VISIBILITY_ENABLED` (per-route `FEATURE_DISABLED` pattern). See `docs/product/ai-system.md`. |
| 4 | Server-only AI routes? | **Yes — admin agent family:** `web/app/api/admin/agent/v0/queue-definition`, `v1/record-overview-layout`, `v1/activity`, `v2/field-visibility`. All gated; use `getAdminContextCached` / admin auth as implemented. **No** generic “chat completion” route. |
| 5 | Privacy / redaction utilities? | **Partial:** e.g. `web/lib/bookingResolver.ts` (`redactEmailForLog`), `web/lib/workflowRun.ts` log redaction patterns, `docs/product/ai-system.md` and `docs/forms/future_ai_hooks_v1.md` guardrails. **No** dedicated “prompt redaction pipeline” module for LLM-bound payloads. |

### 3.2 Config / policy readiness

| # | Question | Finding |
|---|-----------|---------|
| 6 | Org-level AI enablement — where? | **Strong precedent:** JSON **metadata** on org-scoped entities — e.g. `resolveOpportunityAttentionConfigFromMetadata` (`web/lib/opportunities/opportunityAttentionConfig.ts`) reading `metadata.opportunity_attention_rules`. **`org_settings.metadata`** used for timezone (`web/lib/admin/timezoneContract.ts`). **Proposal:** introduce `metadata.ai_policy` (name TBD) with versioned subtree, or `orgs.metadata` depending on where org-level settings already live for the product. |
| 7 | Org metadata vs dedicated table? | **Metadata is enough for V1 policy flags** (booleans, provider mode, allowed features). **Dedicated table** becomes **recommended** when you need: audit columns, history, cross-org reporting, or strict RLS without loading full metadata blobs. |
| 8 | Provider flags pattern? | **Env-based global kill switches** for agent routes today. **Org metadata** is the natural complement for tenant opt-in. Avoid duplicating secrets in metadata — **platform keys in env**, org flags only enable/disable and select **mode**. |
| 9 | Feature flags? | **Per-route env checks** returning `FEATURE_DISABLED` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`). No unified LaunchDarkly-style layer found in audit slice; product may add later. |

### 3.3 Audit / compliance readiness

| # | Question | Finding |
|---|-----------|---------|
| 10 | Audit / event tables for AI logs? | **`workflow_events`** — generic insert via `web/lib/emitEvent.ts` (`event_type`, `entity_*`, `payload` jsonb). **Agent apply audit:** `agent_v0_proposals` / `agent_v0_apply_audit`, `agent_v1_record_layout_proposals` / `agent_v1_record_layout_apply_audit`, `agent_v2_field_visibility_proposals` / `agent_v2_field_visibility_apply_audit` (see `supabase/migrations/20260412100000_agent_v0_audit.sql`, `20260413100000_agent_v1_record_overview_layout_audit.sql`, `20260414100000_agent_v2_field_visibility_audit.sql`). |
| 11 | Can `workflow_events` record AI enrichment usage? | **Yes, cautiously:** emit dedicated `event_type` values with **minimized** payloads (hashes, counts, template keys — not raw prompts). Risk: `payload` jsonb growth and accidental PII if not schema-controlled. |
| 12 | New `ai_usage_events` / `agent_events` table? | **Not required** for first telemetry if `workflow_events` + structured payload contract suffice. **Recommended later** if query volume, retention, or compliance requires a dedicated index-friendly table separate from business workflow noise. |
| 13 | Sensitive data standards? | `docs/product/ai-system.md`, `docs/execution/operating-doctrine.md` (logging), `docs/forms/future_ai_hooks_v1.md`, archived `ai-agent-system-contract.md` (hashed/redacted references). **Needs formalization** for LLM-bound payloads in this sprint’s design phase. |

### 3.4 Operational summaries readiness

| # | Question | Finding |
|---|-----------|---------|
| 14 | What can be summarized? | **Rich inputs exist:** `workflow_events` streams, opportunity activity loaders (`web/lib/admin/loadOpportunityActivitySignal.ts` and related), enrollment packet / tour / status context already surfaced in drawers and queues. **Summaries = derived projections** over existing data, not new truth. |
| 15 | First surfaces? | **Natural fit:** opportunity **drawer** (header or overview tab), then **work-unit queue** compact line (same doctrine as `_attention_suggestion_preview`: preview-only). |
| 16 | Derived vs cached vs persisted? | **Today everything analogous is derived** (attention, suggestion preview). **Caching** (ephemeral server cache or short TTL KV) is optional for cost/latency. **Persistence** introduces compliance/retention questions — defer unless product requires “last seen summary” across sessions. |

### 3.5 Proposal / apply readiness

| # | Question | Finding |
|---|-----------|---------|
| 17 | Existing proposal/apply patterns? | **Yes — mature:** proposal row + apply audit + **SECURITY DEFINER** RPC with stale checks for agent v0/v1/v2. This is the **template** for durable needs-attention proposals. |
| 18 | Approval / audit flows? | Same RPC pattern encodes **human-initiated apply** with trace ids (`proposal_id`, `request_id`, `correlation_id`, `result_id`). |
| 19 | Tables for accept/dismiss/apply suggestion? | **New** tables (or new agent version namespace) **recommended** for suggestion proposals — do **not** overload field-visibility or queue-definition proposal tables. Mirror **shape**: proposals + apply_audit + optional dismiss table or status column. |
| 20 | Connection to workflows / comms / records? | **Apply** should call **existing** mutations (`executeWorkflowRun` where appropriate, comms APIs, status actions) **only** after validated proposal + permission check — same doctrine as `docs/sprints/05_2026/ai_agents_v1.md` **Agent 3** §9.6 “future apply path” for workflow config, and **Agent 2** §8.2 for transactional send/schedule (separate contracts and surfaces). |

---

## 4. Phase 1 — AI Enrichment + Privacy Boundary V1

**Goal:** Introduce a **safe boundary** for optional model enrichment: org policy, provider indirection, redaction/minimization, structured outputs, deterministic fallback, usage logging **design**.

**Non-goals (Phase 1):** Default-on LLM; client-side API keys; autonomous writes; storing raw prompts in `workflow_events` without policy.

### Design anchors

- **Provider abstraction:** Interface + factory in `web/lib/ai/` (path TBD) — **single server-side entry** for “completion” / “structured output” calls; implementation swaps (OpenAI, Anthropic, Azure, stub).
- **Secrets:** Only **server** env (e.g. proposed `ALLOY_AI_PROVIDER`, `ALLOY_AI_API_KEY` — **document only until approved**).
- **Org gate:** `ai_policy.enabled` + feature allowlist (`draft_enrichment`, `summary`, etc.).
- **Privacy:** Redaction pipeline + max token / max field rules; **no** full note bodies without explicit policy.

---

## 5. Phase 2 — Operational Summaries V1

**Goal:** Short, trustworthy **operational summaries** (last N days, “what changed”, “who owes next step”) built from existing activity/entity data.

**Non-goals:** LLM rewriting resolver outcomes; queue as SOT.

### Outputs

- **Contract:** e.g. `OperationalSummaryV1` (versioned JSON) — separate from `AttentionSuggestionV1` or optional extension — decided in Card 8.
- **Surfaces:** Drawer first (Card 9), optional queue strip (Card 10), aligned with Admin V2 density rules.

### Caching / persistence (Card 11)

| Option | When |
|--------|------|
| **Derived-only** | Default — simplest compliance story. |
| **Ephemeral cache** (server memory / short TTL) | When LLM or aggregation cost is measurable. |
| **Persisted summary rows** | Only if product requires history; triggers migration + retention policy. |

---

## 6. Phase 3 — Proposal / Apply System V1

**Goal:** **Durable** proposals for needs-attention, and optionally **Agent 2 (Task Assist)** and/or **Agent 3 (Workflow Assist)** — each with its own proposal store shape — explicit **accept / dismiss / apply**, audit trail, RPC or service-layer apply consistent with agent v0–v2.

**Non-goals:** Auto-apply on drawer open; applying without user id + org scope + permission matrix.

### Integration

- **Apply** routes call existing commit paths (status change, note append, workflow start) with **idempotent** proposal consumption.
- **`workflow_events`:** emit business events through existing **`emitEvent`** where today’s product already does for those mutations.

---

## 7. Supabase migration assessment

**Legend:** *Required now* | *Recommended later* | *Not needed*

| Migration / artifact | Phase | Classification | Notes |
|----------------------|-------|------------------|--------|
| **`orgs` / `org_settings` / `departments.metadata` — `ai_policy` subtree** | 1 | **Not needed** (schema) | JSON metadata keys only — **no migration** if policy fits existing jsonb. **Migration recommended later** if you want CHECK constraints or normalized columns. |
| **`permission_keys` — `ai.enrichment.use` (+ optional AI keys)** | 2.5 | **Shipped** | Seed migration `20260520100000_ai_enrichment_permission_keys_seed.sql` — catalog + default **admin** grant for `ai.enrichment.use` only; no AI data tables. |
| **Platform provider secrets** | 1 | **Not needed** | Env-only at first; **Recommended later**: vault / Supabase secrets pattern for rotation. |
| **`ai_usage_events` or `agent_enrichment_audit`** | 1–3 | **Recommended later** | Prefer **`workflow_events`** with strict schema first; add table if volume/analytics requires. |
| **`agent_needs_attention_suggestion_proposals` + `_apply_audit`** (names TBD) | 3 | **Required** (when shipping durable proposals) | Mirror `agent_v1_record_layout_*` pattern: proposal_id, org_id, user_id, intent jsonb, RLS, DEFINER RPC. **Not required** until Phase 3 implementation approved. |
| **Dismissed proposals / status** | 3 | **Recommended later** | Could be column on proposals table (`status`) vs separate dismiss audit — design in Card 12–13. |
| **`operational_summaries` materialized table** | 2 | **Recommended later** | Only if caching strategy (Card 11) chooses persistence. |
| **RLS policies for new tables** | 3 | **Required** (with new tables) | Follow agent_v* policy style (org-scoped roles). |

**Summary:** Phase 1–2 can proceed as **design + optional code** using **metadata + env** without new tables. **Phase 3 requires migrations** when durable proposals/apply ship — reuse established proposal/audit/RPC patterns.

---

## 8. Privacy / data handling rules (design targets)

1. **Data minimization** — send only fields required for the task; truncate long text; prefer stable codes over prose.
2. **Redaction** — emails/phones/names per policy tier; never log raw prompts in production info logs.
3. **Org boundary** — all enrichment requests scoped by `org_id` from `getAdminContextCached` (or equivalent); no cross-org batching.
4. **Structured responses** — validate with Zod/schema; reject freeform that does not parse.
5. **Deterministic fallback** — if provider errors or policy denies: return V1 deterministic suggestion unchanged.
6. **Human review** — any text shown to customers or written to DB goes through explicit UI confirm (Phase 3 apply).
7. **Queue** — previews only; no new SOT.

---

## 9. Provider abstraction design (target architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  Route / service (org-scoped, admin auth)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ load ai_policy from metadata + env
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  AiEnrichmentRequest { kind, input_ref, redacted_payload }   │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  AiProvider (interface)                                     │
│   - completeStructured<T>(schema, promptCtx) → Result<T>   │
│   - capabilities / model id opaque to callers               │
└─────────────────────────┬───────────────────────────────────┘
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     StubProvider    OpenAIProvider   …future
```

- **StubProvider** for CI and local dev without keys.
- **No provider imports** in client bundles — only server modules.

---

## 10. Structured output contracts (cross-phase)

| Contract | Owner phase | Notes |
|----------|-------------|--------|
| `AttentionSuggestionV1` | V1 (existing) | Baseline; enrichment adds optional parallel fields or `version: 2` — **design decision in Card 4**. |
| `AiEnrichmentEnvelopeV1` (name TBD) | 1 | Wrapper: `{ deterministic, model?, policy, redaction_tier }`. |
| `OperationalSummaryV1` | 2 | **Implemented** in `enrichmentContracts.ts` + `buildOperationalSummary.ts` — derived digest; optional stub overlay; no mutation. |
| `NeedsAttentionProposalV1` / DB row shape | 3 | Align columns with `agent_v1_record_layout_proposals` lessons learned. |

---

## 11. UI surface plan

| Surface | Phase | Behavior |
|---------|-------|----------|
| Drawer header (existing) | 1 | Optional “AI-enriched” subcopy or expandable when `model` block present; **always** show deterministic core. |
| Agent Lab / internal | 1 | Safe place for prototype toggles (similar to `AgentConfigLabClient` disclaimers). |
| Drawer summary block | 2 | New compact summary zone; optional refresh control. |
| Queue CRM compact | 2 | One-line summary **preview**; entity GET authoritative when opened. |
| Proposal rail / modal | 3 | Accept / dismiss / apply; mirror severity of existing apply rails. |

---

## 12. Card breakdown (implementation only when approved)

### Phase 1 — AI Enrichment + Privacy Boundary

| Card | Name | Deliverable |
|------|------|----------------|
| **0** | Audit AI/provider/privacy readiness | **Done (2026-05-13):** Inventory in §3; `docs/product/ai-system.md` updated with `web/lib/ai` pointer. |
| **1** | AI provider abstraction design | **Done:** `web/lib/ai/providerTypes.ts`, `disabledProvider.ts` — interface + disabled implementation; **no** vendor SDK. |
| **2** | Privacy / redaction boundary | **Done (first pass):** `web/lib/ai/redaction.ts` — deterministic redaction + step metadata; expandable. |
| **3** | Org AI policy / config design | **Done:** `web/lib/ai/aiPolicy.ts` — `metadata.ai_policy` parser; **disabled by default**; no migration. |
| **4** | Structured enrichment contracts | **Done:** `web/lib/ai/enrichmentContracts.ts`, `aiUsageTelemetrySchema.ts` (Zod for telemetry payload). |
| **5** | AI draft enrichment prototype | **Done (stub):** `createStubAiProvider`, `resolveStructuredAiProviderForPolicy`, `enrichAttentionSuggestionStubEnvelope`, `redactObjectForAi` before provider; **`POST /api/admin/ai/enrich-attention-suggestion`** (admin + `AI_ENRICHMENT_STUB_ENABLED` + org `metadata.ai_policy`). |
| **6** | Usage / audit logging design | **Done:** `maybeEmitAiEnrichmentTelemetryEvent` → `workflow_events` **`ai_enrichment_usage_v1`** with **`AiUsageTelemetryPayloadV1`** (counts, latency, ids — **no** prompt/draft/raw/redacted bodies); gates **`AI_ENRICHMENT_TELEMETRY_ENABLED`** + org **`logging_mode === "verbose"`**. |

### Phase 2 — Operational Summaries

| Card | Name | Deliverable |
|------|------|----------------|
| **7** | Summary input audit | **Done:** §17.1 input matrix — safe inputs are resolver outputs (`_operational_attention`), suggestion (`_attention_suggestion`), activity signal (already loaded in attach), `workflow_events`-backed stale labels; **avoid** per-row heavy activity fetches in queues; queue uses existing enrichment map only. |
| **8** | Summary contract design | **Done:** expanded `OperationalSummaryV1` in `web/lib/ai/enrichmentContracts.ts` + `safeParseOperationalSummaryV1` (`operationalSummarySchema.ts`). |
| **9** | Drawer summary surface | **Done:** `OperationalAttentionHeaderStrip` — primary **“Recommended by Alloy”** surface (headline, next step, concise why, collapsed draft, linked-actions placeholder). **`_operational_summary`** still attached on opportunity GET (`attachOpportunityAttentionSuggestionBundle`) for payload / queue previews; duplicate “Operational read” narrative removed from drawer chrome. |
| **10** | Queue / work-unit summary preview | **Done:** `_operational_summary_preview` on queue rows (`QueueService`) → `semanticCrmCompact.operationalSummaryPreview` → `QueueBlock` slot `operational_summary` (preview-only). |
| **11** | Caching / persistence decision | **Done:** §17.4 — **derived-only** for V1; **no** `operational_summaries` table; optional ephemeral cache only if latency forces later revisit. |

### Phase 3 — Proposal / Apply System

| Card | Name | Deliverable |
|------|------|----------------|
| **12** | Proposal lifecycle design | States: proposed → accepted | dismissed | expired; idempotency keys. |
| **13** | Supabase proposal / audit migration design | SQL draft **in doc only** — tables, RLS, RPC signature mirroring agent_v1. |
| **14** | Accept / dismiss / apply API design | REST shape, auth, error codes, mapping to RPC. |
| **15** | Workflow / communication integration plan | Which existing actions are in scope v1; `emitEvent` points. |
| **16** | Permission / audit rules | Role matrix; org owner toggle; what ops can see. |
| **17** | Testing and rollout plan | Staged enablement, kill switch, monitoring. |

---

## 13. Sequencing recommendation

1. **Phase 1 Cards 0–4** (audit + abstractions + policy + contracts) — **no DB migration**.  
2. **Phase 1 Cards 5–6** (prototype + logging design) — still **no migration** if logging uses `workflow_events` + minimal payload.  
3. **Phase 2 Cards 7–11** — **shipped derived-only** summaries (drawer + queue preview) — **no migration**; stub overlay gated like Phase 1.  
4. **Phase 3 Cards 12–17** — **migration required** before production apply of durable suggestions; align engineering with security review of RLS + DEFINER.

**Hard rule:** Do not add **LLM calls** or **migrations** until explicit approval per card.

---

## 14. Open questions

1. **Single global provider vs org BYOK** — commercial + security implications.
2. **Retention** for any logged prompt/response fragments — GDPR / customer contracts.
3. **Whether enrichment ever sees full child names** — vertical-specific sensitivity.
4. **Version bump** for `AttentionSuggestionV1` vs nested `enrichment` object — backward compatibility for clients.
5. **Should dismiss be silent** or always emit `workflow_events` for compliance dashboards?
6. **Pricing / token budgets** per org — who enforces caps (middleware vs provider wrapper)?
7. **Relationship to Cursor / external agents** — out of scope unless product wants unified “agent registry” per archived contract docs.

---

## 15. References (repo)

- `docs/product/ai-system.md` — agent routes, DEFINER RPC pattern, env gates.  
- `web/app/api/admin/agent/**` — v0/v1/v2 routes.  
- `web/lib/emitEvent.ts` — `workflow_events` insert.  
- `supabase/migrations/20260412100000_agent_v0_audit.sql`, `20260413100000_agent_v1_record_overview_layout_audit.sql`, `20260414100000_agent_v2_field_visibility_audit.sql` — proposal/apply audit precedent.  
- `web/lib/opportunities/opportunityAttentionConfig.ts` — metadata-driven config pattern.  
- `docs/sprints/05_2026/ai_agents_v1.md` — V1 agent contracts and non-goals.  
- `docs/forms/future_ai_hooks_v1.md` — telemetry / RBAC hooks for future AI.  
- **`web/lib/ai/**`** — Phase 1 foundation: policy parser, redaction, provider types, disabled provider, enrichment + telemetry contracts (`@/lib/ai` barrel).

---

## 16. Phase 1–2 implementation notes (Cards 0–11)

**Shipped in repo (server-only):**

| Module | Role |
|--------|------|
| `web/lib/ai/providerTypes.ts` | `AiStructuredProvider`, request/response envelopes, outcomes — **no I/O**. |
| `web/lib/ai/disabledProvider.ts` | `createDisabledAiProvider`, `createAiProviderForPolicy` (stub / OpenAI-compatible / disabled per policy + env + RBAC). |
| `web/lib/ai/aiPolicy.ts` | `parseAiPolicyFromMetadata` reads **`metadata.ai_policy`** only; default **off**. |
| `web/lib/ai/redaction.ts` | `redactObjectForAi` — deep clone + redaction + `{ steps }` metadata. |
| `web/lib/ai/enrichmentContracts.ts` | `AttentionSuggestionAiEnrichmentV1`, `OperationalSummaryV1`, `AiEnrichmentEnvelopeV1`, `AiUsageTelemetryPayloadV1`. |
| `web/lib/ai/aiUsageTelemetrySchema.ts` | Zod `safeParseAiUsageTelemetryPayloadV1` for schema-bound telemetry. |
| `web/lib/ai/aiEnrichmentEnv.ts` | `AI_ENRICHMENT_STUB_ENABLED`, `AI_ENRICHMENT_TELEMETRY_ENABLED` helpers. |
| `web/lib/ai/stubProvider.ts` | `createStubAiProvider` — synthetic overlay only; **no** network. |
| `web/lib/ai/resolveStructuredAiProvider.ts` | Resolves stub vs OpenAI-compatible vs disabled from policy + env + strict live flag. |
| `web/lib/ai/enrichAttentionSuggestionStub.ts` | `enrichAttentionSuggestionStubEnvelope` — redaction **before** provider; returns `AiEnrichmentEnvelopeV1`. |
| `web/lib/ai/enrichmentTelemetry.ts` | `maybeEmitAiEnrichmentTelemetryEvent` — gated `emitEvent` / `workflow_events`. |
| `web/lib/ai/liveProviderAdapterPlaceholder.ts` | Phase 2.5: scaffold `AiStructuredProvider` returning `disabled` (no I/O). |
| `web/lib/ai/providerAdapterDesign.ts` | Phase 2.5: live adapter **types** only (timeout/retry/capability contracts). |
| `web/lib/ai/aiEnrichmentPermissions.ts` | `AI_ENRICHMENT_USE_PERMISSION_KEY`, `resolveAiEnrichmentPortalAccess`, strict env. |
| `web/lib/ai/aiEnrichmentRouteGuards.ts` | Org policy pre-checks for stub and OpenAI draft enrichment routes. |
| `web/app/api/admin/ai/enrich-attention-suggestion/route.ts` | POST structured enrichment — access + policy + env gates (stub vs OpenAI branches). |
| `web/lib/ai/enrichAttentionSuggestionRouteValidation.ts` | Parse-only POST body validation for enrich route (unit-tested). |
| `supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql` | **`ai.enrichment.use`** (+ optional AI keys); default **admin** grant only. |
| `web/lib/ai/index.ts` | Public barrel for server imports. |
| `web/lib/ai/buildOperationalSummary.ts` | Phase 2: `buildOperationalSummaryDeterministic`, `applyStubOperationalSummaryOverlay`, queue preview helper. |
| `web/lib/ai/operationalSummarySchema.ts` | Zod `safeParseOperationalSummaryV1`. |
| `web/lib/admin/opportunityAttentionSuggestionAttachment.ts` | Attaches `_operational_summary` (+ optional stub overlay + `org_settings` read **only** when stub env on). |

**Still true (explicit):**

- **OpenAI-compatible** HTTP is **gated** (strict **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** + **`ai.enrichment.use`**, org **`provider: openai`**, **`OPENAI_API_KEY`** / **`OPENAI_MODEL`**, redaction before provider). **Stub** path remains **`AI_ENRICHMENT_STUB_ENABLED`** + **`provider: stub`**.  
- **No** new Supabase migrations for **AI policy** — policy remains **jsonb metadata** (`ai_policy` subtree). **Permission keys** for AI enrichment are seeded by **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** (RBAC catalog + default admin grant for `ai.enrichment.use` only).  
- **No** persistence of model outputs.  
- **No** autonomous actions — enrichment is an **overlay**; `AttentionSuggestionV1` / resolver outputs remain authoritative for operational recommendations.

**Card 5 (stub) — behavior**

- **Env:** `AI_ENRICHMENT_STUB_ENABLED=true|1|yes` required **in addition to** org `ai_policy.enabled`, `provider: "stub"`, and `allowed_features` containing `draft_enrichment`.
- **Redaction:** Internal fields (`reasoning_summary`, `draft_body`, etc.) are passed through **`redactObjectForAi`** before **`completeStructured`** (stub or disabled).
- **Route:** `POST /api/admin/ai/enrich-attention-suggestion` — **`getAdminContextCached`** + **`getAdminAccessContextCached`** (org scope), **`resolveAiEnrichmentPortalAccess`** (legacy admin **or** `ai.enrichment.use` when `AI_ENRICHMENT_USE_PERMISSION_REQUIRED`), **`evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute`**, then stub env + `enrichAttentionSuggestionStubEnvelope` (redaction before provider unchanged).

**Card 6 (telemetry) — behavior**

- **Never** log prompt text, raw record dumps, redacted payload blobs, or generated draft bodies — only **`AiUsageTelemetryPayloadV1`** fields (including **`redaction.steps_total`** / **`kinds`**, **`latency_ms`**, **`entity_type` / `entity_id`**).
- **Emit** only when **`AI_ENRICHMENT_TELEMETRY_ENABLED`** and org **`logging_mode === "verbose"`** (default remains **`minimal`** → no DB writes).

**Live providers (OpenAI, Anthropic, etc.)** still require **explicit future approval** and must not ship without SDK review, secret handling, and contract hardening.

---

## 17. Phase 2 — Operational summaries (Cards 7–11)

### 17.1 Card 7 — Summary input audit (safe vs avoid)

| Input | Availability today | Use in V1 summary | Notes |
|-------|----------------------|-------------------|--------|
| Opportunity row fields (`status_key`, `metadata`, names on row) | Drawer / queue enrichment | **Indirect only** | Prefer resolver **codes/labels** over freeform metadata in narrative; avoid duplicating CRM identity lines already in queue cards. |
| `_operational_attention` | Entity attach + queue resolution pass | **Primary** | Severity, primary reason, waiting bucket, SLA tier — safe structured signals. |
| `_attention_suggestion` | Entity attach; queue `_attention_suggestion_preview` | **Primary (drawer)** / **truncated (queue)** | Drawer may reference next-action label + reasoning summary (same as existing chrome); **never** treat summary as SOT. |
| Activity signal (`loadOpportunityActivitySignal`) | Entity attach path only | **Yes (drawer)** | Wired in `attachOpportunityAttentionSuggestionBundle`; queue list path intentionally skips heavy activity per row. |
| `workflow_events` / stale signal | Via activity loader | **Labels only** | Use existing stale **labels** surfaced through attention auxiliary — **no** raw `workflow_events` payload mining in V1. |
| Recent workflow runs | Partially on rows (`last_activity_*`) | **Optional one-liner** | Queue preview may already show `last_activity_*` footer; summary headline does **not** add another per-row fetch. |
| Communication snippets | Not in summary builder | **Out of scope V1** | Do not pull message bodies into `OperationalSummaryV1` without a dedicated minimization pass + policy. |

**Performance:** Queue rows use **only** fields already on enriched opportunity rows (`QueueService` map). No new N+1 activity queries per row.

### 17.2 Card 8 — `OperationalSummaryV1` (contract)

- **Headline** + **≤3 bullets**, **`risk_urgency_hint`**, **`generated_at_iso`**, **`generation_mode`** (`deterministic` | `deterministic_plus_stub_overlay`), **`source`** (resolver version, primary code, suggestion flag, `kind`), optional **`redaction`** when stub overlay runs template through `redactObjectForAi`.
- **Deterministic** path requires **no** provider. **Stub overlay** requires `AI_ENRICHMENT_STUB_ENABLED` + org `ai_policy` (`enabled`, `provider: "stub"`, `allowed_features` includes `operational_summary`) + single `org_settings.metadata` read in attach when stub env is on.

### 17.3 Cards 9–10 — Surfaces

- **Drawer:** Primary narrative is **“Recommended by Alloy”** in `OperationalAttentionHeaderStrip` when a deterministic suggestion exists; **`_operational_summary`** remains on the overview payload (and queue preview uses **`_operational_summary_preview`**) — no duplicate operational-read block in the drawer header.
- **Queue:** `_operational_summary_preview` { `headline`, `risk_urgency_hint` } — **preview-only**; `data-queue-preview-slot="operational_summary"`.

### 17.4 Card 11 — Caching / persistence decision

- **Shipped:** **Derived-only** summaries on each opportunity GET / queue enrichment; **no** new Supabase tables; **no** persistence of summary text as an AI artifact.
- **Revisit:** Short-lived server cache **only** if repeated generation becomes hot; **persistence** (materialized summaries) requires product + compliance sign-off and **would** imply a new migration — **not** selected for V1.

---

## Phase 2.5 — Real provider adapter + permission hardening (Cards 11.5–11.8)

**Purpose:** Permission hardening, provider isolation contracts, rollout governance, and pilot readiness. **OpenAI-compatible** enrichment HTTP is **opt-in** behind org policy + env + RBAC + redaction; no persisted model output and no apply/send automation in this slice.

### Card 11.5 — AI permission model audit (**Done**)

| Topic | Finding |
|-------|---------|
| **Prior route guard** | `POST …/enrich-attention-suggestion` used `getAdminContextCached` + **`ctx.role === "admin"`** only — no `permissionKeys`, no explicit org-policy pre-check at route boundary. |
| **Canonical access stack** | `resolveAdminAccessCore` → `permissionKeys` union from **`role_permission_grants`** (`web/lib/admin/resolveAdminAccessCore.ts`). Portal shell uses **`admin` / `ops`** role_keys for **`portalEligible`** only — not per-feature RBAC (`docs/system/roles-and-permissions.md`). |
| **Feature-flag pattern** | Env truthy gates (e.g. `AI_ENRICHMENT_STUB_ENABLED`) match agent v2 style; complement with org **`metadata.ai_policy`**. |
| **Recommended capability key** | **`ai.enrichment.use`** — single gate for “invoke server-side AI enrichment” (stub or future live). Split later if needed: **`ai.provider.config.manage`** (org policy / model allowlist admin), **`ai.telemetry.review`** (internal dashboards), **`agent.suggestion.apply`** (Phase 3 proposal/apply) — **not** implemented as keys in this slice. |
| **Least privilege** | Prefer **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`** + DB grants for any human who should call enrichment routes; avoid widening to all portal admins for live traffic. |
| **Migration requirement** | **None in this PR.** Adding **`ai.enrichment.use`** to **`permission_keys`** + **`permission_definitions`** + default **`role_permission_grants`** requires a **Supabase seed migration** (FK on `role_permission_grants.permission_key`) — **prerequisite** before forcing strict mode org-wide. Until then, **default** `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` is **off** (legacy admin gate preserved). |

### Card 11.6 — Route permission hardening (**Done**)

- **`getAdminAccessContextCached`** on every request (org + `permissionKeys` + scope dimensions) — same pattern as entity/queue routes.
- **`resolveAiEnrichmentPortalAccess`** — `ctx.orgId === access.orgId`; if **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** then require **`ai.enrichment.use`** in `permissionKeys`; else legacy **`ctx.role === "admin"`** (ops may enable strict mode + grant).
- **`evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute`** — `enabled`, `provider === "stub"`, **`draft_enrichment`** in `allowed_features` before calling **`enrichAttentionSuggestionStubEnvelope`** (403 with stable error codes).
- **`AI_ENRICHMENT_STUB_ENABLED`** unchanged; **redaction-before-provider** and **telemetry** unchanged inside `enrichAttentionSuggestionStubEnvelope` / `maybeEmitAiEnrichmentTelemetryEvent`.

**Env:** `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` — `true`/`1`/`yes` enables strict permission mode.

### Card 11.7 — Real provider adapter design (**Done — types + placeholder**)

| Artifact | Role |
|----------|------|
| `web/lib/ai/providerAdapterDesign.ts` | `AlloyLiveStructuredProviderAdapter`, timeout/retry/capability **types**; endpoint config shape **without** secrets. |
| `web/lib/ai/liveProviderAdapterPlaceholder.ts` | `createLiveProviderAdapterPlaceholder()` — implements **`AiStructuredProvider`** but always returns **`outcome: "disabled"`** (`LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED`). **No** `fetch`, no SDK. |
| **Agent proposal/audit** | Reference only: live path should mirror **proposal row + apply audit + DEFINER RPC** before any durable apply (Phase 3) — not wired here. |

### Card 11.8 — Real provider pilot checklist (**Done — governance**)

Use this list before enabling **any** live HTTP provider:

1. **Privacy / PII** — data minimization; which fields may enter a model context; vertical-specific child/family rules.  
2. **Redaction validation** — `redactObjectForAi` coverage tests on real-shaped payloads; spot-check production-like fixtures.  
3. **Org opt-in** — `metadata.ai_policy.enabled`; explicit **`allowed_features`**; kill switch envs documented and default-off.  
4. **Telemetry** — only `AiUsageTelemetryPayloadV1`-style metadata; **no** prompt bodies, draft text, raw rows, redacted blob dumps; validate with integration tests.  
5. **Rate limiting** — per-org and global caps; queue vs interactive routes.  
6. **Timeouts / cancellation** — `AbortSignal`, structured timeout budget (`AlloyProviderTimeoutPolicyV1`).  
7. **Fallback** — deterministic suggestion/summary remains SOT when provider fails or denies.  
8. **Outage handling** — circuit breaker / degrade to stub-disabled path; operator-visible errors without leaking internals.  
9. **Provider disable** — env + org policy off; remove API keys from env in incident.  
10. **Incident rollback** — revert feature flags; purge bad cache if any; postmortem template.  
11. **Prompt / template review** — static system prompts reviewed by security + product.  
12. **Model selection** — approved model IDs; no “latest” unreviewed aliases in prod.  
13. **Cost controls** — token budgets, alerts, per-org billing visibility.  
14. **Logging review** — no secrets in app logs; log redaction spot-check.  
15. **Retention / legal** — data processing agreements; customer contract alignment; DPIA if required.  

**Cards (implementation status)**

| Card | Name | Deliverable |
|------|------|----------------|
| **11.5** | AI permission model audit | **Done:** audit table + **`ai.enrichment.use`** + seed migration `20260520100000_ai_enrichment_permission_keys_seed.sql` + optional keys catalog-only. |
| **11.6** | AI enrichment route permission hardening | **Done:** `aiEnrichmentPermissions.ts`, `aiEnrichmentRouteGuards.ts`, route refactor. |
| **11.7** | Real provider adapter design | **Done:** `providerAdapterDesign.ts` + `liveProviderAdapterPlaceholder.ts`. |
| **11.8** | Real provider pilot gate checklist | **Done:** checklist above. |

**Migrations (AI permissions):** **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** seeds **`ai.enrichment.use`** (required) plus optional catalog keys **`ai.provider.config.manage`**, **`ai.telemetry.review`** — **`permissions`**, **`permission_keys`**, **`permission_definitions`**, and default **`role_permission_grants`** for org **`admin`** → **`ai.enrichment.use`** only. No AI / proposal / telemetry / provider tables.

**Staging — recommended default grants (beyond migration)**

- **Shipped in migration:** every org’s **`admin`** role gets **`ai.enrichment.use`** (idempotent).  
- **Optional for staging convenience:** grant the same key to **`ops`** so strict mode works for ops pilots without ad-hoc SQL each deploy:

```sql
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'ops', 'ai.enrichment.use', true
FROM public.orgs AS o
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;
```

- **Optional keys** (`ai.provider.config.manage`, `ai.telemetry.review`): remain **ungranted** until product defines UI and enforcement; assign manually in staging when testing those surfaces.

**Strict-mode rollout steps (`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`)**

1. Apply migration to **staging** → confirm `admin` users receive **`ai.enrichment.use`** in `permissionKeys` (reload session / re-login).  
2. (Optional) Run the **`ops`** grant SQL above if ops must call enrichment in staging.  
3. Enable **`AI_ENRICHMENT_STUB_ENABLED`** + org **`metadata.ai_policy`** as today; verify stub route **200** for allowed users.  
4. Set **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`** on staging → confirm **403** without grant and **200** with grant (no code deploy change).  
5. Repeat in **production** only after RBAC review; production default can keep strict **off** until change window.  
6. **Do not** enable live HTTP provider until Phase 2.5 pilot checklist (Card 11.8) is signed off — migration does **not** wire providers.

---

## AI operational experience V1.1 (2026-05-13)

**Goal:** Ship operator-safe **Enhance draft** in the drawer, **deterministic** needs-attention list ordering + compact **“why this row”** copy on CRM queue rows — without AI-driven reorder, persistence, or send/apply.

### Queue ordering audit (Card 2)

| Question | Answer |
|----------|--------|
| Where does sorting happen today? | **PostgREST:** `loadOpportunityNeedsAttentionRows` applies the queue definition’s **`sort`** array via **`.order(column, { ascending })`** on the capped candidate query (same as other opportunity queues). **In-memory:** after the resolver **`needs_attention`** membership filter, rows were previously re-sorted with **`sortOpportunityRowsByPlan`** (lexicographic compare on plan columns — default often **`updated_at`**). |
| Is **`priority_score`** on rows? | **Yes, after list enrichment:** **`_attention_priority_score`** is attached in **`QueueService`** opportunity row shaping when **`opportunityAttentionResolution`** runs (along with **`_attention_reason_label`**, **`_attention_waiting_bucket`**, etc.). It is **not** a PostgREST column. |
| Do needs-attention queues already sort by resolver score? | **Not before V1.1:** list order followed **DB sort plan** then **plan-only** in-memory sort; **`priority_score`** was available on enriched rows for display/diagnostics but **did not** drive default ordering. |
| How do work-unit queues differ from “needs-attention” semantics? | **`needs_attention`** is an **opportunity** queue key using a **candidate OR** prefilter + **resolver membership** in **`loadOpportunityNeedsAttentionRows`**. Other work-unit queues use their **`queue_definition`** filters without that resolver gate. **Department “attention” lanes** are rollups keyed off the same resolver signals but are **not** this list loader. |
| Safest place for default priority ordering | **After** the resolver membership filter **inside `loadOpportunityNeedsAttentionRows`** (same cap / same candidate set): reorder the filtered slice with a **deterministic comparator** (`web/lib/queues/needsAttentionQueuePrioritySort.ts`), then **tie-break** with the existing **`sortOpportunityRowsByPlan`** order so manually configured **`sort`** in the queue definition is preserved as a **secondary** key. **Does not** change PostgREST `.order` (keeps candidate fetch stable and avoids breaking other queues). |

### Ordering policy (Card 3)

- **Deterministic only** — descending **`priority_score`**, then worst **SLA tier** among reasons, then primary **severity**, then primary reason **SLA tier**, then **waiting.active**, then **`updated_at`** (newer first), then **queue-definition sort** as final tie-breaker.
- **AI does not control ordering** — no model calls in the list path; optional enrichment remains drawer-local.

### Drawer “Enhance draft” (Card 1)

- **`OperationalAttentionEnhanceDraft`** — shown only when **`suggested_content.body`** is non-empty; **POST `/api/admin/ai/enrich-attention-suggestion`**; surfaces **`envelope.enrichment.suggested_draft_body_overlay`** when present; **copy-only**; deterministic draft stays in **Draft · not sent**.

### Queue row priority line (Card 4)

- **`buildQueueRowPriorityExplanationLine`** — needs-attention lane only; **`semanticCrmCompact.queuePriorityExplanation`**; rendered in **`CrmCompactQueuePreview`** with **`data-queue-preview-slot="queue_priority_explanation"`**.

---

**Document history**

- **2026-05-13** — Initial plan from repo audit (no implementation).
- **2026-05-13** — Phase 1 Cards 0–4: `web/lib/ai` server foundation + `web/tests/ai/aiFoundationPhase1.test.ts`; no live provider, no migrations.
- **2026-05-13** — Cards 5–6: stub provider + `enrichAttentionSuggestionStubEnvelope` + admin POST route + gated `emitEvent` telemetry + `web/tests/ai/enrichAttentionSuggestionStub.test.ts`.
- **2026-05-13** — Phase 2 Cards 7–11: `OperationalSummaryV1`, `buildOperationalSummary.ts`, drawer + queue preview, `_operational_summary` attach + `web/tests/ai/operationalSummary.test.ts`.
- **2026-05-13** — Phase 2.5 Cards 11.5–11.8: permission + policy route gates, adapter design types, placeholder provider, pilot checklist, `web/tests/ai/aiEnrichmentRouteAccess.test.ts`, `liveProviderAdapterPlaceholder.test.ts`.
- **2026-05-13** — AI operational experience **V1.1**: drawer **Enhance draft** (`OperationalAttentionEnhanceDraft`), deterministic needs-attention ordering (`needsAttentionQueuePrioritySort.ts` + `loadOpportunityNeedsAttentionRows`), queue row priority line (`queueRowPriorityExplanation.ts`, `CrmCompactQueuePreview`), removed temporary staging test UI/docs.
