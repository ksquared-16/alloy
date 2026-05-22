# BOS Operational Recommendation Intelligence — Phase 1 Execution Pack

**Path:** `docs/sprints/05_2026/bos_operational_recommendation_phase1_execution.md`  
**Status:** Implementation-grade spec — **execute only after this pack is reviewed**  
**Date:** 2026-05-21

**Binding inputs:**

| Doc | Role |
|-----|------|
| [`bos_operational_recommendation_intelligence_sprint.md`](./bos_operational_recommendation_intelligence_sprint.md) | Audit, framework, phase map |
| [`bos_operational_recommendation_intelligence_gate0.md`](./bos_operational_recommendation_intelligence_gate0.md) | GATE 0 doctrine (**approved**) |

**Phase:** 1 — Deterministic recommendation foundation  
**GATE 1 blocks:** Phase 2 UX polish, Phase 4 AI enrich

---

## SECTION 1 — Phase 1 objective

### 1.1 Precise goal

Deliver **operational recommendation infrastructure**: a single server-owned pipeline that turns existing platform signals into `OperationalRecommendationV1`, with fingerprints, stale semantics, render projections, and legacy adapters — **without** new AI routes or execution behavior.

Phase 1 optimizes for **correctness, ownership, and reproducibility** of the recommendation object. Copy sophistication improves via **catalog templates**, not models.

### 1.2 In scope (Phase 1 only)

| Deliverable | Description |
|-------------|-------------|
| Deterministic contract | `OperationalRecommendationV1` types + validators |
| Grounding signals | Normalized `grounding_signals[]` from resolver + activity (+ optional task/send counts) |
| Deterministic builder pipeline | collect → assemble → fingerprint → validate |
| Fingerprint + stale validation | `stale_state_check`, `validateRecommendationFreshness` |
| Invalidation semantics | Fresh / stale / absent; no persistence |
| Render projections | Queue, drawer strip, handoff, detail DTOs (server-built) |
| Catalog | Action, rationale, urgency, outcome templates per reason code |
| Legacy adapter | `OperationalRecommendationV1` → `AttentionSuggestionV1` |
| Entity attach | `_operational_recommendation` on opportunity entity GET |
| Queue enrich path | Shared builder; preview projection on row |
| UX scaffolding | Components read canonical field order; **minimal** visual change acceptable if projections are wired |
| Tests | Snapshot + per-reason-code contract tests |

### 1.3 Out of scope (hard prohibition in Phase 1 PRs)

| Forbidden | Defer to |
|-----------|----------|
| AI enrich / LLM calls | Phase 4 |
| Autonomous reasoning or planning | — |
| **Communication body generation** (`suggested_content`, draft SMS/email text) | Phase 3 |
| Workflow mutation / `executeWorkflowRun` from recommendation | — |
| Proposal auto-generation (Task Assist propose from recommendation) | Phase 3 prefill |
| Recommendation DB tables / history / inbox | — |
| `available_actions` → placement resolution UI | Phase 3 |
| Full drawer L2/L3 polish | Phase 2 |
| Comms thread timing in signals (unless explicit stretch card) | Phase 3 |

### 1.4 Clarification

| Phase 1 **is** | Phase 1 **is not** |
|----------------|-------------------|
| Operational recommendation **infrastructure** | Recommendation **intelligence sophistication** (LLM judgment) |
| Deterministic, explainable, reproducible evaluations | Persisted operational truth |
| Ephemeral payloads on GET / queue enrich | A new “recommendation agent” platform |

**One-line Phase 1 test:** Same inputs → same `OperationalRecommendationV1` JSON (modulo `generated_at_iso` if fixed in tests).

---

## SECTION 2 — File + module structure

### 2.1 Directory layout (canonical)

```
web/lib/adminV2/bos/recommendations/
├── index.ts                          # Public exports (barrel — thin)
├── types.ts                          # All V1 contracts + enums
├── builders/
│   ├── buildOperationalRecommendationV1.ts   # Orchestrator: stages 1–9
│   ├── resolveRecommendationCategory.ts      # recommendation_type + class rules
│   ├── resolveUrgencyBand.ts                 # P0–P3 from severity + SLA
│   ├── resolveConfidence.ts                  # confidence_level + confidence_reason
│   ├── assembleRationale.ts                # why + action_rationale from catalog + signals
│   └── buildRecommendationId.ts            # deterministic id (day bucket)
├── catalog/
│   ├── recommendationActionCatalog.ts        # action keys, labels, action_family
│   ├── rationaleTemplates.ts                 # why_it_matters / action_rationale patterns
│   ├── urgencyTemplates.ts                   # urgency_reason clauses
│   ├── outcomeTemplates.ts                   # likely_outcome / likely_risk
│   └── catalogTypes.ts                       # template context shape
├── signals/
│   ├── collectRecommendationSignals.ts       # Single entry: loads bundle
│   ├── normalizeGroundingSignals.ts          # signal[] from resolver + activity + extras
│   └── signalPriority.ts                     # sort, dedupe, cap
├── fingerprints/
│   ├── recommendationFingerprint.ts          # inputs_fingerprint hash v1
│   └── fingerprintInputs.ts                  # canonical input object builder
├── validation/
│   ├── validateOperationalRecommendationV1.ts  # DTO shape + required fields
│   ├── validateRecommendationFreshness.ts      # compare fingerprint vs live
│   └── recommendationInvalidation.ts         # stale_reason, is_stale helper
├── projection/
│   ├── projectQueuePreview.ts                # OperationalRecommendationQueuePreviewV1
│   ├── projectDrawerStrip.ts                 # OperationalRecommendationDrawerStripV1
│   ├── projectOrchestratorHandoff.ts         # OperationalRecommendationHandoffV1
│   └── projectDetailPanel.ts                 # L2 factors (optional Phase 1)
├── rendering/
│   └── renderingFieldMap.ts                  # Constants: max lengths, field order (no React)
└── adapters/
    ├── operationalRecommendationToAttentionSuggestionV1.ts
    └── attachOperationalRecommendationBundle.ts   # entity + queue shared attach
```

### 2.2 Module responsibilities

| Module | Owns | Must NOT |
|--------|------|----------|
| `types.ts` | Contracts, enums, type guards | Business rules |
| `signals/*` | Read-only assembly from existing libs | Resolver reimplementation; DB writes |
| `catalog/*` | Copy templates + interpolation | UI formatting; LLM |
| `builders/*` | Deterministic assembly logic | React; HTTP |
| `fingerprints/*` | Hash algorithm + version | Stale UI copy |
| `validation/*` | DTO + freshness rules | Building recommendations |
| `projection/*` | Truncation + surface-specific DTOs | New reasoning |
| `rendering/*` | Shared caps documented for UI | JSX |
| `adapters/*` | Legacy mapping + attach orchestration | Parallel `buildNeedsAttentionSuggestion` logic |

### 2.3 Integration touchpoints (callers only)

| Caller | Phase 1 change |
|--------|----------------|
| `web/lib/admin/opportunityAttentionSuggestionAttachment.ts` | Call `attachOperationalRecommendationBundle`; set `_operational_recommendation`; derive `_attention_suggestion` via adapter |
| `web/lib/queues/QueueService.ts` | Replace inline `buildNeedsAttentionSuggestion` with shared `buildOperationalRecommendationV1` + `projectQueuePreview` |
| `web/lib/adminV2/bos/operationalRecommendationHandoff.ts` | Read `projectOrchestratorHandoff` output (no local why-strings) |
| `OperationalAttentionHeaderStrip.tsx` | Read `_operational_recommendation` first; fallback `_attention_suggestion` |
| `web/lib/bos/adapters/needsAttentionToBosProposalEnvelope.ts` | Accept recommendation adapter output (optional Phase 1 card) |

### 2.4 Anti-drift rules

- **No business logic in UI** — strip only maps projection DTO to DOM.
- **No rendering logic in builders** — builders output full contract; projection truncates.
- **No enrich imports** in `builders/` or `catalog/`.
- **No queue-only builder fork** — `QueueService` calls same `buildOperationalRecommendationV1` as entity attach.
- **No second recommendation builder** outside `builders/buildOperationalRecommendationV1.ts`.

### 2.5 Tests location

```
web/tests/adminV2/bos/recommendations/
├── buildOperationalRecommendationV1.test.ts
├── recommendationFingerprint.test.ts
├── validateRecommendationFreshness.test.ts
├── normalizeGroundingSignals.test.ts
├── projectQueuePreview.test.ts
├── operationalRecommendationToAttentionSuggestionV1.test.ts
├── rationaleQuality.contract.test.ts      # per reason code
└── __fixtures__/                           # frozen signal bundles
```

---

## SECTION 3 — `OperationalRecommendationV1` contract

### 3.1 Version and identity

```ts
const OPERATIONAL_RECOMMENDATION_VERSION = 1 as const;

type OperationalRecommendationV1 = {
  version: typeof OPERATIONAL_RECOMMENDATION_VERSION;
  recommendation_id: string;           // deterministic; see buildRecommendationId
  generated_at_iso: string;              // ISO-8601 UTC

  // Classification
  recommendation_type: RecommendationTypeV1;
  trust_boundary: TrustBoundaryV1;       // default "insight_only"
  deterministic_vs_ai_assisted: "deterministic";  // Phase 1 only

  // Target
  operational_context: OperationalContextV1;

  // Evidence
  source_signal: GroundingSignalV1[];     // canonical list (sorted, deduped)
  grounding_signals: GroundingSignalV1[]; // Phase 1: identical to source_signal

  // Narrative (deterministic)
  title: string;
  current_state_summary: string;
  why_it_matters: string;
  recommended_action: RecommendedActionV1;
  action_rationale: string;
  likely_outcome: string | null;
  likely_risk: string | null;

  // Priority / trust
  urgency: UrgencyBandV1;
  urgency_reason: string;
  confidence_level: ConfidenceLevelV1;
  confidence_reason: string;

  // Multi-reason (deterministic)
  secondary_factors: RecommendationFactorV1[];

  // Freshness
  stale_state_check: StaleStateCheckV1;

  // Phase 1 null / Phase 3+
  available_actions: AvailableActionV1[];
  workflow_reference: WorkflowReferenceV1 | null;
  communication_reference: CommunicationReferenceV1 | null;  // metadata only Phase 1 — no body
  escalation_reference: EscalationReferenceV1 | null;

  // Render payloads (server-computed, safe to cache on object)
  render: OperationalRecommendationRenderBundleV1;
};
```

### 3.2 Enums (locked)

**`RecommendationTypeV1`**

| Value | Resolution rule (deterministic) |
|-------|--------------------------------|
| `informational` | `!needs_attention` && activity_stale only |
| `operational` | default when `needs_attention` |
| `escalation` | SLA `breached` && severity ≥ high |
| `communication` | reason ∈ {stale_quote_followup, waiting_on_family, tour_date_passed, follow_up_date_passed, stale_new_inquiry} |
| `conversion` | reason ∈ {high_value_stale, stale_qualified, missing_quote_after_execution} |
| `risk` | reason ∈ {missing_identity, blocked_internal, blocked_external} |
| `workflow` | **not emitted Phase 1** (reserved; null workflow_reference) |

**`UrgencyBandV1`:** `p0_urgent` | `p1_today` | `p2_soon` | `p3_fyi`

| Band | Rule |
|------|------|
| `p0_urgent` | severity `critical` OR worst SLA `breached` |
| `p1_today` | severity `high` OR SLA `approaching` |
| `p2_soon` | severity `medium` |
| `p3_fyi` | severity `low` or informational-only |

**`ConfidenceLevelV1`:** `high` | `medium` | `low` (see `resolveConfidence.ts` — GATE 0 §4.5)

**`TrustBoundaryV1`:** `insight_only` | `governed_proposal` | `routing_only` — Phase 1 always `insight_only`

**`StaleReasonV1`:** `status_changed` | `reason_changed` | `wait_bucket_changed` | `wait_since_changed` | `activity_changed` | `resolver_recomputed` | `entity_mismatch`

### 3.3 Nested types

```ts
type OperationalContextV1 = {
  entity_type: "opportunities";
  entity_id: string;
  org_id: string;
  status_key: string | null;
  status_label: string | null;
  work_unit_id: string | null;
  primary_display_name: string | null;
  source_surface: "entity_get" | "queue_enrich";
};

type RecommendedActionV1 = {
  key: string;              // catalog key e.g. complete_follow_up
  label: string;            // operator CTA text
  action_family: AttentionSuggestionActionFamily; // legacy compat
};

type RecommendationFactorV1 = {
  code: string;
  label: string;
  severity: string;
  sla_tier: string;
};

type StaleStateCheckV1 = {
  fingerprint_version: 1;
  inputs_fingerprint: string;
  fingerprint_inputs: FingerprintInputsV1;  // debug/support only; may strip in API later
  evaluated_at_iso: string;
  is_stale: boolean;                        // false at build; true after validate mismatch
  stale_reason: StaleReasonV1 | null;
};

type FingerprintInputsV1 = {
  entity_id: string;
  status_key: string | null;
  primary_reason_code: string | null;
  reason_codes_sorted: string[];
  waiting_bucket: string;
  waiting_since_iso: string | null;
  resolver_version: number;
  attention_computed_at_iso: string;
  activity_signal_key: string | null;
};

type AvailableActionV1 = {
  key: string;
  label: string;
  kind: "task_assist_intent" | "admin_action" | "drawer_tab";
  intent?: string;           // Phase 3
  action_definition_id?: string;
};

type CommunicationReferenceV1 = {
  channel_hint: "sms" | "email" | "call_task" | null;
  timing_hint: string | null;   // e.g. "within 24 hours"
  template_key: string | null;  // Phase 3 — Phase 1: null
  prefill_instruction: string | null; // Phase 3
};

type EscalationReferenceV1 = {
  policy_basis: string;         // human-readable threshold citation
  sla_tier: string;
  reason_code: string;
};

type OperationalRecommendationRenderBundleV1 = {
  queue: OperationalRecommendationQueuePreviewV1;
  drawer_strip: OperationalRecommendationDrawerStripV1;
  handoff: OperationalRecommendationHandoffV1;
  detail: OperationalRecommendationDetailV1 | null;
};
```

### 3.4 Required vs optional at build time

| Field | Required when | Nullable |
|-------|---------------|----------|
| All core narrative fields | `needs_attention` OR informational activity | `likely_*` optional for informational |
| `likely_outcome` | conversion + communication types for attention records | yes for pure operational |
| `likely_risk` | escalation or conversion when outcome present | yes |
| `escalation_reference` | `recommendation_type === escalation` | else null |
| `communication_reference` | `recommendation_type === communication` | timing_hint required; no body Phase 1 |
| `render.*` | always when recommendation non-null | — |

**Return null:** When `!needs_attention && !activity_stale` — attach sets `_operational_recommendation: null`.

### 3.5 Field ownership matrix

| Field | Immutable at build | Recomputed on validate | Render-only | Future AI extension |
|-------|---------------------|------------------------|-------------|---------------------|
| `version`, `recommendation_id` | ✓ | id stable per day bucket | — | — |
| `source_signal` / `grounding_signals` | ✓ | — | — | AI may not add codes |
| `urgency`, `urgency_reason` | ✓ | — | — | **never AI** |
| `confidence_level` | ✓ | — | — | **never AI** |
| `confidence_reason` | ✓ | — | — | polish only Phase 4 |
| `why_it_matters`, `action_rationale` | ✓ | — | truncated in projection | polish Phase 4 |
| `likely_outcome`, `likely_risk` | ✓ | — | strip line | polish Phase 4 |
| `stale_state_check.is_stale` | false at build | ✓ on compare | badge | — |
| `render.*` | ✓ at build | rebuild on regen | ✓ | — |

### 3.6 Invalidation rules (contract-level)

- Changing any `FingerprintInputsV1` field ⇒ new fingerprint ⇒ prior payload **stale** if client holds old JSON.
- Changing `generated_at_iso` alone without input change ⇒ **not** stale (same fingerprint).
- UTC day change ⇒ new `recommendation_id` ⇒ treat as **new** recommendation, not stale invalidation of old id.

### 3.7 JSON validation

`validateOperationalRecommendationV1(obj): { ok: true, value } | { ok: false, errors[] }`

- Max lengths enforced at validation (see §7.4).
- Reject unknown `version`.
- Reject `deterministic_vs_ai_assisted !== "deterministic"` in Phase 1.

---

## SECTION 4 — Grounding signal contract

### 4.1 Signal shape

```ts
type GroundingSignalSourceTypeV1 =
  | "attention_resolver"
  | "activity_signal"
  | "enrollment_operational"
  | "entity_field"
  | "operational_task"      // Phase 1 optional: counts only
  | "scheduled_send"        // Phase 1 optional: counts only
  | "communication_thread"; // Phase 3 — not collected Phase 1

type GroundingSignalV1 = {
  code: string;              // stable machine key (snake_case)
  label: string;             // operator-facing short label
  source_type: GroundingSignalSourceTypeV1;
  provenance: string;        // e.g. "opportunity_attention_resolver.v2"
  severity?: "critical" | "high" | "medium" | "low";
  sla_tier?: "ok" | "approaching" | "breached";
  value_hint?: string;      // e.g. "~5 days", "tour_date_passed"
  priority: number;         // lower = more important in UI lists
  reason_code?: string;     // when derived from attention reason
};
```

### 4.2 Canonical signal codes (Phase 1 minimum set)

| `code` | Source | When present |
|--------|--------|--------------|
| `primary_attention_reason` | resolver | `primary_reason` set |
| `attention_reason_{code}` | resolver | each entry in `reasons[]` |
| `sla_{tier}` | resolver | primary reason SLA |
| `wait_bucket_{bucket}` | resolver | `waiting.bucket !== none` |
| `wait_duration` | resolver + explain | `waiting.since_iso` → days phrase |
| `activity_stale_{key}` | activity | `stale_signal.key` |
| `status_{status_key}` | entity | always |
| `severity_{level}` | resolver | primary severity |

**Phase 3 examples (documented, not built Phase 1):** `days_since_last_inbound`, `unanswered_thread`, `quote_sent`, `tour_scheduled`.

### 4.3 Deterministic evidence requirements

- Every sentence in `why_it_matters` and `action_rationale` must be justifiable by ≥1 `grounding_signals[].code` listed in `catalog` template metadata (`template_id → required_signals[]`).
- Templates **fail closed**: if required signal missing, use shorter fallback template tier (never invent days).

### 4.4 Normalization (`normalizeGroundingSignals.ts`)

1. Collect raw signals from collectors.
2. Assign `priority` from `signalPriority.ts` (primary reason = 0, secondary reasons = 10+, activity = 50, status = 90).
3. Dedupe by `code` (first wins).
4. Sort by `priority` asc, then `code` asc.
5. Cap at **12** signals stored; UI L2 shows max **6**.

### 4.5 UI-safe projection rules

- Queue preview: **0** grounding signals (why_line only).
- Drawer L1: **0–2** signal labels optional in strip projection.
- Drawer L2: up to **6** `label` fields.
- Never expose `provenance` at L1.

---

## SECTION 5 — Fingerprint + invalidation

### 5.1 Ephemeral evaluation doctrine

Recommendations are **ephemeral operational evaluations**:

- Produced on **read paths** (entity GET, queue enrich).
- **Not** stored in Supabase.
- **Not** used for analytics truth in Phase 1 (telemetry Phase 5 only).

### 5.2 Fingerprint algorithm (v1)

```
inputs = FingerprintInputsV1 (canonical JSON, keys sorted)
inputs_fingerprint = sha256(stableStringify(inputs)).slice(0, 32)
```

**`stableStringify`:** recursive key sort; null preserved; arrays sorted when order not semantic (`reason_codes_sorted` pre-sorted).

### 5.3 Hash inputs (required)

| Input | Source |
|-------|--------|
| `entity_id` | opportunity id |
| `status_key` | row |
| `primary_reason_code` | attention.primary_reason?.code |
| `reason_codes_sorted` | attention.reasons[].code sorted |
| `waiting_bucket` | attention.waiting.bucket |
| `waiting_since_iso` | attention.waiting.since_iso |
| `resolver_version` | attention.resolver_version |
| `attention_computed_at_iso` | attention.computed_at_iso |
| `activity_signal_key` | activity.stale_signal?.key |

**Explicitly excluded from fingerprint (Phase 1):** display names, priority_score, draft bodies, org metadata version.

### 5.4 Recompute triggers

| Event | Action |
|-------|--------|
| Entity GET / queue enrich | Full pipeline rebuild |
| Client refetch after PATCH | New evaluation server-side |
| `validateRecommendationFreshness(liveInputs, stored)` | Sets `is_stale` + `stale_reason` on **copy** for client |

### 5.5 Mutation triggers (operator)

| Operator action | Expected stale_reason |
|-----------------|----------------------|
| Status PATCH | `status_changed` |
| Metadata wait bucket change | `wait_bucket_changed` |
| New activity (signal key change) | `activity_changed` |
| Resolver output change (reason set) | `reason_changed` or `resolver_recomputed` |

### 5.6 Stale detection API

```ts
validateRecommendationFreshness(args: {
  recommendation: OperationalRecommendationV1;
  live: FingerprintInputsV1;
}): OperationalRecommendationV1; // returns shallow copy with updated stale_state_check
```

Client helper (optional Phase 1):

```ts
// web/lib/adminV2/bos/recommendations/client/isRecommendationStale.ts
// compares overview fingerprint vs live inputs from fresh _operational_attention only — no re-resolve client-side
```

### 5.7 Render invalidation behavior

When `is_stale === true`:

- Projections prepend `stale_banner: "Record changed — refresh for updated guidance."`
- Strip uses `OperationalProposalFrameVariant` `stale` styling (reuse token).
- Queue preview: show `next_label` from stale payload but `why_line` = stale banner only (Phase 1 conservative).

### 5.8 No DB persistence (Phase 1)

| Forbidden | Allowed |
|-----------|---------|
| `operational_recommendations` table | In-memory object on API response |
| Caching recommendations across requests in Redis | Per-request build |
| Writing recommendation to `opportunities.metadata` | — |

---

## SECTION 6 — Deterministic builder pipeline

### 6.1 Entry point

```ts
buildOperationalRecommendationV1(input: BuildOperationalRecommendationInput): OperationalRecommendationV1 | null
```

```ts
type BuildOperationalRecommendationInput = {
  orgId: string;
  opportunity: { id; status_key; metadata; primary_display_name; work_unit_id? };
  attention: OpportunityAttentionResult;
  activity: ActivitySignalResult;
  defs: StatusDefinitionRow[];  // for labels only
  source_surface: "entity_get" | "queue_enrich";
  nowMs?: number;
  // Phase 1 optional:
  openTaskCount?: number;
  pendingSendCount?: number;
};
```

### 6.2 Stages (ordered, single orchestrator)

| Step | Function | Output |
|------|----------|--------|
| 1 | `collectRecommendationSignals` | `RecommendationSignalBundle` |
| 2 | `normalizeGroundingSignals` | `GroundingSignalV1[]` |
| 3 | `resolveRecommendationCategory` | `recommendation_type` |
| 4 | `resolveUrgencyBand` | `urgency`, `urgency_reason` |
| 5 | `assembleRationale` | title, summaries, why, rationale, outcome, risk |
| 6 | `recommendationActionCatalog.resolve` | `recommended_action` |
| 7 | `resolveConfidence` | confidence fields |
| 8 | `buildRecommendationId` + timestamps | identity |
| 9 | `recommendationFingerprint` | `stale_state_check` base |
| 10 | `projection/*` | `render` bundle |
| 11 | `validateOperationalRecommendationV1` | throw/result in dev |

### 6.3 Category resolution (deterministic precedence)

```
if (!attention.needs_attention && activity.stale_signal) → informational
else if (!attention.needs_attention) → null (no recommendation)
else if sla breached && severity >= high → escalation (also sets escalation_reference)
else if reason in COMMUNICATION_REASONS → communication
else if reason in CONVERSION_REASONS → conversion
else if reason in RISK_REASONS → risk
else → operational
```

`COMMUNICATION_REASONS`, `CONVERSION_REASONS`, `RISK_REASONS` — constants in `resolveRecommendationCategory.ts` mirroring sprint §4.1.

### 6.4 Multi-reason merging

- **Primary narrative** always from `attention.primary_reason`.
- `secondary_factors` = other `attention.reasons` (max 4), excluding primary.
- Do **not** merge into a second recommendation object.
- Catalog may reference secondary count in `why_it_matters` when `reasons.length > 1` (template tier).

### 6.5 Rationale assembly rules

- `current_state_summary`: `{primary.label}` + timing phrase from `operationalAttentionExplain.timingPhraseForReason` + optional wait line.
- `why_it_matters`: catalog template interpolating `value_hint` from signals (days, bucket).
- `action_rationale`: links action to reason + urgency band.
- **Anti-generic guard:** `recommended_action.label` must differ from `primary.label` unless catalog explicitly marks `label_may_equal_reason`.

### 6.6 Reproducibility

- Fixed `nowMs` in tests.
- No `Math.random`, no locale-dependent dates in hashes (UTC only).
- Catalog strings static in repo.

---

## SECTION 7 — Recommendation catalog strategy

### 7.1 Ownership

All operator-facing strings for Phase 1 narrative fields live in `catalog/` — **only** importers are `builders/assembleRationale.ts` and `catalog/recommendationActionCatalog.ts`.

### 7.2 Template structure

```ts
type CatalogTemplateTier = "full" | "compact" | "fallback";

type RationaleTemplateDef = {
  template_id: string;
  tier: CatalogTemplateTier;
  required_signals: string[];
  why_it_matters: string;       // {{placeholders}}
  action_rationale: string;
  likely_outcome?: string;
  likely_risk?: string;
};
```

**Placeholder allowlist:** `{{primary_label}}`, `{{days}}`, `{{wait_bucket_label}}`, `{{timing_phrase}}`, `{{status_label}}`, `{{secondary_count}}`

### 7.3 Action catalog (replaces `suggestionActionMap` logic)

- Move keys from `web/lib/agent/needsAttentionSuggestion/suggestionActionMap.ts` into `recommendationActionCatalog.ts`.
- **Phase 1 quality bar:** each `OpportunityAttentionReasonCode` has `full` tier template OR documented exception in tests.

**Example transformation (stale_new_inquiry):**

| Before | After (deterministic) |
|--------|----------------------|
| Label: “Respond to new request” | Label: “Send first response to new inquiry” |
| Summary: “Operational attention: New inquiry stale.” | why: “New inquiry has had no staff response within your response window ({{days}} days). Families often choose the first center that replies.” |
| — | outcome: “A timely first reply keeps this inquiry in your active pipeline.” |
| — | urgency_reason: “Response window passed · {{severity}} priority” |

### 7.4 Copy constraints

| Constraint | Limit |
|------------|-------|
| `title` | ≤ 80 chars |
| `why_it_matters` | ≤ 280 chars |
| `action_rationale` | ≤ 200 chars |
| `likely_outcome` | ≤ 160 chars |
| `urgency_reason` | ≤ 120 chars |
| Queue `why_line` | ≤ 140 chars (projection) |

### 7.5 Tone rules

- Operational, calm, second person plural optional (“your team”).
- **No** personality (“I think”, “Let me help”).
- **No** emotional inference.
- Vertical-neutral; childcare examples only in tests/fixtures.

### 7.6 Anti-generic rules (CI)

`rationaleQuality.contract.test.ts` asserts for each reason code:

- `why_it_matters` does not equal `primary.label` alone.
- `why_it_matters` does not start with `"Operational attention:"`.
- `recommended_action.label` not in `BANNED_GENERIC_LABELS` set (maintain in test).

---

## SECTION 8 — Render projection rules

### 8.1 Principle

**Projections are server-built views** of `OperationalRecommendationV1`, stored on `render` so UI does not truncate differently per surface.

### 8.2 Queue preview DTO

```ts
type OperationalRecommendationQueuePreviewV1 = {
  next_label: string;           // recommended_action.label (trunc 60)
  why_line: string;             // why_it_matters (trunc 140)
  urgency_band: UrgencyBandV1;
  recommendation_type: RecommendationTypeV1;
  is_stale: boolean;
};
```

**Wire:** `_operational_recommendation_preview` on row **and** legacy `_attention_suggestion_preview` mapped from same projection during migration.

**Hidden:** factors, signals, outcome, rationale, fingerprint inputs.

### 8.3 Drawer strip DTO

```ts
type OperationalRecommendationDrawerStripV1 = {
  title: string;
  why_line: string;             // concise why (trunc 220)
  urgency_label: string;        // maps band → "Urgent" | "Today" | ...
  urgency_reason: string;       // trunc 120
  outcome_line: string | null;  // trunc 160
  confidence_label: string | null; // only if low
  next_action_label: string;
  signal_labels: string[];      // max 2 for L1
  is_stale: boolean;
  stale_banner: string | null;
};
```

**UI:** `OperationalAttentionHeaderStrip` maps 1:1 — no field invention.

### 8.4 Orchestrator handoff DTO

```ts
type OperationalRecommendationHandoffV1 = {
  eyebrow: string;              // "Recommended next step"
  primary_recommendation: string; // title or action label
  operational_reason: string;     // why_it_matters trunc 240
  context_line: string;           // entity label (from context)
  cta_label: string;              // from action_family map (existing handoffCtaLabel)
};
```

`operationalRecommendationHandoff.ts` becomes thin wrapper over `projectOrchestratorHandoff`.

### 8.5 Detail panel DTO (L2 scaffolding)

```ts
type OperationalRecommendationDetailV1 = {
  factors: RecommendationFactorV1[];
  signal_labels: string[];       // up to 6
  action_rationale: string;
  likely_outcome: string | null;
  likely_risk: string | null;
};
```

Phase 2 enables expand UI; Phase 1 ships DTO for tests.

### 8.6 Task Assist prefill (Phase 1 scaffolding only)

`CommunicationReferenceV1.prefill_instruction` = **null** in Phase 1.  
Projection file `projectTaskAssistPrefill.ts` — **stub returning null** (Phase 3).

### 8.7 Prevent leakage

| Surface | May receive |
|---------|-------------|
| Queue row | `OperationalRecommendationQueuePreviewV1` only |
| Drawer | strip + optional detail; full contract via `overviewData._operational_recommendation` for advanced toggle |
| Orchestrator seed | handoff DTO only |

---

## SECTION 9 — Replacement strategy

### 9.1 Strategy: parallel attach, single builder (locked)

**Phase 1 uses parallel wire with adapter** — not big-bang delete of `_attention_suggestion`.

```
buildOperationalRecommendationV1()
    ├─► overview._operational_recommendation  (new canonical)
    └─► operationalRecommendationToAttentionSuggestionV1()
            └─► overview._attention_suggestion  (legacy compat)
```

### 9.2 Field replacement map

| Legacy | Phase 1 source |
|--------|----------------|
| `_attention_suggestion` | Adapter from `_operational_recommendation` |
| `buildNeedsAttentionSuggestion()` | **Deprecated** — thin wrapper calling new builder + adapter (one release) |
| `_attention_suggestion_preview` | `render.queue` / `projectQueuePreview` |
| `why_line` in queue | `projection.queue.why_line` |
| `reasoning.summary` | **Not used** for new copy — adapter sets from `why_it_matters` for compat |
| `buildOperationalRecommendationHandoffCopy` | `render.handoff` |
| `OperationalAttentionHeaderStrip` primary line | `render.drawer_strip` |

### 9.3 `buildNeedsAttentionSuggestion` deprecation

| Step | Action |
|------|--------|
| P1.0 | Implement new pipeline |
| P1.1 | Change `buildNeedsAttentionSuggestion` to call `buildOperationalRecommendationV1` + adapter internally |
| P1.2 | QueueService + attach use `attachOperationalRecommendationBundle` only |
| P1.3 | Mark `buildNeedsAttentionSuggestion` `@deprecated` JSDoc pointing to new builder |

**Do not** delete file until Phase 2+ tests migrated.

### 9.4 Fallback semantics

| Consumer reads | Order |
|--------------|-------|
| UI strip | `_operational_recommendation.render.drawer_strip` → else legacy `_attention_suggestion` parse |
| Handoff | `_operational_recommendation.render.handoff` → else `buildOperationalRecommendationHandoffCopy` legacy path |
| BOS envelope | adapter output from canonical if present |

If canonical null: strip hidden; queue preview absent; **no** synthetic fallback strings.

### 9.5 Migration sequencing (implementation cards)

| Card | Scope | GATE |
|------|-------|------|
| **1.1** | types + validators | — |
| **1.2** | catalog + assembleRationale | — |
| **1.3** | builder + signals + fingerprint | — |
| **1.4** | projections + rendering constants | — |
| **1.5** | adapter + attachOperationalRecommendationBundle | — |
| **1.6** | Wire entity GET (`opportunityAttentionSuggestionAttachment`) | GATE 1 |
| **1.7** | Wire QueueService enrich | GATE 1 |
| **1.8** | Strip/handoff read projections (scaffolding) | GATE 1 |
| **1.9** | Contract tests + deprecate wrapper | GATE 1 |

**Not in Phase 1:** Remove `_attention_suggestion` from API.

### 9.6 Dual-system prevention

- Grep CI rule (manual Phase 1): no new imports of `suggestionActionMap` outside adapter path.
- Single exported builder: `buildOperationalRecommendationV1`.

---

## SECTION 10 — Validation + test strategy

### 10.1 DTO validation tests

- Valid full fixture passes.
- Missing `urgency` fails.
- `why_it_matters` over max length fails (or builder clips before validate — document one approach: **clip in builder, validate never fails on length**).

### 10.2 Deterministic snapshot tests

- `buildOperationalRecommendationV1` with frozen `RecommendationSignalBundle` fixtures → snapshot JSON (strip `generated_at_iso` or freeze time).

### 10.3 Per-reason contract tests

`rationaleQuality.contract.test.ts`:

- For each `OpportunityAttentionReasonCode` in `attentionPlatformCatalog`:
  - recommendation non-null when `needs_attention` forced
  - `why_it_matters` contains ≥1 `value_hint` or known keyword from template
  - `urgency` assigned
  - conversion codes include `likely_outcome`

### 10.4 Fingerprint stability tests

- Same inputs → same fingerprint across Node versions (sha256).
- Change `status_key` → fingerprint changes.
- Change `generated_at_iso` only → fingerprint unchanged.

### 10.5 Stale-state tests

- `validateRecommendationFreshness` sets `is_stale: true` + correct `stale_reason`.

### 10.6 Queue projection tests

- `projectQueuePreview` truncates at 140.
- No signal leakage in preview object keys.

### 10.7 Adapter parity tests

- `operationalRecommendationToAttentionSuggestionV1` round-trip preserves `next_action.key`, `source.primary_reason_code`.
- Envelope adapter test still passes (`needsAttentionToBosProposalEnvelope`).

### 10.8 Test harness

```ts
// __fixtures__/attention/stale_new_inquiry.json
// __fixtures__/attention/waiting_on_family_breached.json
```

Use `createOpportunityAttentionResolverBatchContext` in fixture builders where needed.

---

## SECTION 11 — Phase 1 exit criteria (GATE 1)

Phase 1 is **complete** only when all are true:

### 11.1 Infrastructure

- [ ] `OperationalRecommendationV1` types exported from `web/lib/adminV2/bos/recommendations/`
- [ ] `buildOperationalRecommendationV1` implemented per §6
- [ ] `grounding_signals` populated and capped per §4
- [ ] Fingerprint v1 + `validateRecommendationFreshness` per §5
- [ ] No AI enrich routes modified or added
- [ ] No recommendation DB tables

### 11.2 Wire + ownership

- [ ] Entity GET attaches `_operational_recommendation`
- [ ] `_attention_suggestion` derived **only** via adapter (no independent reasoning path)
- [ ] Queue enrich uses shared builder + `_operational_recommendation_preview` (and legacy preview map)
- [ ] `buildNeedsAttentionSuggestion` deprecated wrapper or removed from direct QueueService use

### 11.3 Projections + scaffolding

- [ ] `render` bundle populated server-side
- [ ] Handoff uses `projectOrchestratorHandoff` (no local why strings)
- [ ] Strip reads canonical or render projection first

### 11.4 Quality bar

- [ ] Rationale contract tests pass for **all** platform reason codes
- [ ] No primary copy starts with `"Operational attention:"`
- [ ] `stale_new_inquiry` fixture demonstrates non-generic `why_it_matters` (per sprint example)

### 11.5 Process

- [ ] `bos-foundation.md` or sprint doc updated in same PR as wire (operating doctrine)
- [ ] Phase 2+ work not started in same PR

**GATE 1 failure modes:** Any PR introducing LLM calls, `suggested_content` generation, or second builder → reject against GATE 0.

---

## Implementation order (developer checklist)

Execute cards in order; do not parallelize 1.6/1.7 before 1.5 passes tests.

1. **1.1** `types.ts` + `validateOperationalRecommendationV1.ts`
2. **1.2** `catalog/*` + `rationaleQuality.contract.test.ts` (tests may fail until builder exists — use direct template tests first)
3. **1.3** `signals/*` + `fingerprints/*` + `builders/*`
4. **1.4** `projection/*` + `rendering/renderingFieldMap.ts`
5. **1.5** `adapters/*`
6. **1.6** Entity attach wire
7. **1.7** QueueService wire
8. **1.8** UI scaffolding read path
9. **1.9** Deprecate old builder + full GATE 1 checklist

---

## Appendix A — Public API surface (`index.ts`)

```ts
export type { OperationalRecommendationV1, ... } from "./types";
export { buildOperationalRecommendationV1 } from "./builders/buildOperationalRecommendationV1";
export { validateOperationalRecommendationV1 } from "./validation/validateOperationalRecommendationV1";
export { validateRecommendationFreshness } from "./validation/validateRecommendationFreshness";
export { attachOperationalRecommendationBundle } from "./adapters/attachOperationalRecommendationBundle";
export { operationalRecommendationToAttentionSuggestionV1 } from "./adapters/operationalRecommendationToAttentionSuggestionV1";
```

---

## Appendix B — Entity payload keys

| Key | Type | Authority |
|-----|------|-----------|
| `_operational_recommendation` | `OperationalRecommendationV1 \| null` | **Canonical** |
| `_operational_attention` | `OpportunityAttentionResult \| null` | Resolver truth (unchanged) |
| `_attention_suggestion` | `AttentionSuggestionV1 \| null` | **Compat** — adapter only |
| `_operational_summary` | `OperationalSummaryV1 \| null` | May later source headline from recommendation |

---

## Appendix C — Phase 2 handoff (do not implement in Phase 1)

- Full strip visual hierarchy (urgency chip, outcome line styling)
- L2 expand UI for `detail` projection
- Remove legacy `_attention_suggestion` from docs for operators
- Task Assist prefill from `communication_reference`

---

**Next step after pack approval:** Implement card **1.1** (`types.ts` + validators) in a single focused PR.
