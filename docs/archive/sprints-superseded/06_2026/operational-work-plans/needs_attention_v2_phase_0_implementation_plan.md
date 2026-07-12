# Needs Attention V2 — Phase 0 Implementation Plan

**Path:** `docs/sprints/archive/06_2026/needs_attention_v2_phase_0_implementation_plan.md`  
**Date:** 2026-06-03  
**Status:** **Planning complete — architecture frozen for Phase 1 bridge** (no implementation in this sprint)  
**Scope:** Implementation-planning audit for **Readiness → Needs Attention projection** only.

**Canonical inputs (frozen):**

- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- [`readiness_engine_architecture_and_runtime_contract.md`](./readiness_engine_architecture_and_runtime_contract.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md)

**Authority:** Phase 1 coding must follow §3–§7 unless product records an exception in §10.

---

## Executive summary

Phase 0 defines the **Readiness → Attention bridge** — the foundation for all future Needs Attention work — without UI, migrations, APIs, or new attention categories beyond the readiness projection.

| Question | Answer |
|----------|--------|
| **Where does projection happen?** | Pure function `projectReadinessToAttentionReasons()` — merged inside `resolveOpportunityAttention` (or thin compositor it calls) |
| **Who owns projection?** | Platform lib — `web/lib/opportunities/readinessAttentionProjection.ts` (proposed) |
| **Who evaluates readiness?** | **Only** `evaluateOperationalReadiness` / memoized wrapper — never the attention resolver |
| **Who consumes projection?** | Existing attention call sites unchanged in shape — they receive merged `OpportunityAttentionResult` |
| **How does attention resolve?** | Re-fetch / re-eval — readiness state change → projection drops reasons automatically |
| **Duplication risk today?** | `missing_identity` in resolver vs future readiness gaps — Phase 1 must not double-flag |

**Phase 1 lock:** Headless bridge only — one new reason code (`missing_required_info`), projection function, compositor wiring, tests. No UI, profiles, tasks, SLA, or BOS.

---

## Canonical doctrine (locked)

```
Readiness evaluates.
Needs Attention surfaces.
Tasks track.
Actions resolve.
Workflows automate.
BOS explains.
```

Needs Attention **must never** own readiness evaluation logic or recalculate required information independently. Readiness remains the source of truth.

---

## Phase 0 goal

Design the bridge:

```
ReadinessResult  →  Attention reasons (projection)
```

Before any UI work, this sprint establishes:

1. Where readiness exists at runtime today  
2. Where attention is calculated today  
3. How readiness projects into attention  
4. How resolution behaves  
5. How runtime consumers should consume the projection  

---

## 1. Current-state audit — attention generation

### 1.1 Canonical evaluator

**Single implementation:** `resolveOpportunityAttention` (`web/lib/opportunities/opportunityAttentionResolver.ts`, resolver v2).

**Collectors (platform-owned trigger math):**

| Collector | Emits |
|-----------|--------|
| `collectQueueLaneCodes` | `follow_up_date_passed`, `tour_date_passed`, `overdue_commitment`, `high_value_stale`, `mid_funnel_stale`, `missing_identity` |
| `collectLifecycleCode` → `computeOpportunityAttentionReason` | `stale_new_inquiry`, `stale_qualified`, `missing_quote_after_execution`, `stale_quote_followup` |
| `collectWaitingCodesFromEo` | `waiting_on_*`, `blocked_*` from `metadata.enrollment_operational` |

**Post-processing:** Policy filter → sort by `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER` → SLA slices → priority score.

**Output:** `OpportunityAttentionResult` — `needs_attention`, `reasons[]`, `primary_reason`, `waiting`, `priority_score`, `resolver_version: 2`.

### 1.2 All locations where attention is calculated

| # | Call site | Module | Trigger | Notes |
|---|-----------|--------|---------|-------|
| 1 | Queue row enrichment | `QueueService.enrichOpportunityRows` | Every opportunity queue list when `opportunityAttentionResolution` set | Attaches `_needs_attention`, reason label/code, BOS recommendation preview |
| 2 | Needs-attention queue lane | `QueueService` (`q.key === "needs_attention"`) | Capped fetch + in-memory filter | Same resolver; semantics object on response |
| 3 | Standalone NA API | `buildOpportunityAttentionQueueItems` | Org-scoped 500-row window | Used by WU route + dept preview fallback |
| 4 | Entity GET (full surface) | `computeOperationalAttentionAttachment` → `recomputeOpportunityDrawerOperationalAttention` | Drawer open / refresh | `_operational_attention` on opportunity record |
| 5 | Tests / diff tooling | `opportunityAttentionResolver.test.ts`, `attentionResolverDiff.test.ts` | — | Contract parity |

**Not canonical (legacy / parallel — out of Phase 1 scope but documented):**

| Location | Module | Status |
|----------|--------|--------|
| `opportunityNeedsAttention`, `opportunityNeedsAttentionReasonLabel` | `QueueService.ts` | Legacy heuristics; superseded by resolver in enrichment path — **remove when parity proven** |
| `NEEDS_ATTENTION_EXCEPTIONS` | `exceptionTypes.ts` | Job-grain home services — **separate subsystem** |
| `packetNeedsAttentionItems` | forms review | Form packet review UX — **not** opportunity resolver |

**Dept bootstrap:** `loadDeptAttentionPreviewServer`, `buildWorkUnitScopedNeedsAttentionLaneBuckets` — **consume** resolver output on pre-fetched rows; they do not implement separate trigger math.

### 1.3 Resolver V2 architecture

```
metadata.opportunity_attention_rules  →  resolveOpportunityAttentionConfigFromMetadata
status_definitions                    →  terminal keys, lifecycle stage
opportunity row + optional activity   →  collectors
                                              ↓
                                    merge + policy + sort
                                              ↓
                              OpportunityAttentionResult
```

**Config surfaces:** `thresholdsHours`, `stale_*_days`, wait-bucket SLA, per-reason `policies[code].enabled`, priority weights, auxiliary activity signals.

**Batch optimization:** `createOpportunityAttentionResolverBatchContext` — shared thresholds for row batches (QueueService NA lane).

### 1.4 Existing reason codes (platform)

Full catalog: `attentionPlatformCatalog.ts` — 16 codes in `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER`.

**Readiness overlap risk (Phase 1):**

| Existing code | Overlap with readiness |
|---------------|------------------------|
| `missing_identity` | Partial — checks person/contact/customer presence **in resolver**, not lifecycle field rules | **Must not** duplicate enforced field gaps; Phase 1 plan: keep `missing_identity` for identity linkage only; **`missing_required_info` covers field-rule gaps** |

No `missing_required_info` code exists today.

### 1.5 Severity handling

| Layer | Mechanism |
|-------|-----------|
| **Defaults** | `DEFAULT_SEVERITY_BY_REASON` in `attentionPlatformCatalog.ts` |
| **Override** | `config.policies[code].severity` via metadata |
| **Resolved output** | `severityForReasonCode(code, config)` on each `ResolvedOpportunityAttentionReason` |
| **Priority score** | `computeAttentionPriorityScore` — severities + SLA tiers + monetary value + reason count |

Readiness-projected reasons inherit severity from **gap level mapping** (§4), then respect policy overrides like any platform code.

### 1.6 Queue integration

| Path | Resolver usage |
|------|----------------|
| Pipeline queue lists | `enrichOpportunityRows` — resolver on every row |
| `needs_attention` queue | Fetch cap → resolver filter → enrich survivors |
| Bucket counts (dept lane) | `buildWorkUnitScopedNeedsAttentionLaneBuckets` — resolver on WU-scoped cohort |
| Row fields | `_needs_attention`, `_attention_reason`, `_attention_reason_code`, `_attention_severity` |

Queue rows remain **preview** — attention fields are overlay labels, not execution authority.

### 1.7 Drawer integration

| Attach | When | Module |
|--------|------|--------|
| `_operational_attention` | Entity GET `surface=full` (deferred from fast shell) | `recomputeOpportunityDrawerOperationalAttention` |
| `_operational_attention_error` | Resolver failure | Same |
| `_operational_recommendation` | Derived from attention + activity | Separate BOS path — **Phase 0 non-goal** |
| `readiness` | Drawer **bootstrap** only (`loadOpportunityDrawerOperationalBootstrap`) | `tryEvaluateDrawerRecordReadiness` |

**Critical gap today:** Readiness and attention are evaluated on **different loader paths** and **never merged**. Bootstrap carries `readiness`; entity GET carries `_operational_attention` without readiness input.

---

## 2. Readiness runtime audit

### 2.1 ReadinessResult contract

**Version:** `contract_version: "1.0"` (`web/lib/completion/readinessTypes.ts`)

| Field | Role |
|-------|------|
| `primary_state` | `ready` \| `needs_information` \| `blocked` \| `warning` \| `expired` |
| `trigger` | Evaluation context (`record_view` for NA bridge) |
| `gaps[]` | `requirement_id`, `level`, `label`, `blocking`, `failure_kind`, optional `resolution` |
| `counts.by_level` | recommended / required / enforced counts |
| `ok` | No blocking gaps for trigger |
| `legacy.effective_requirements` | Shim — optional |

Phase 1 scope: **record scope** only (`scope_type: "record"`).

### 2.2 Evaluation pipeline

```
ReadinessEvalInput
        ↓
evaluateOperationalReadiness()          ← canonical entry
        ↓
evaluateEffectiveRequirements()         ← legacy spine (unchanged)
        ↓
lifecycleFieldRuleEvaluator + sources   ← field rules when triggered
        ↓
mapEffectiveRequirementsToReadinessResult()
        ↓
ReadinessResult
```

**Memoization:** `evaluateOperationalReadinessMemoized` + `createReadinessMemoScope` — request-scoped only, no durable cache.

### 2.3 Current consumers

| Consumer | Trigger | Module | Gate vs display |
|----------|---------|--------|-----------------|
| **Drawer bootstrap** | `record_view` | `readinessDrawerBootstrap.ts` | Display-only; try/catch → undefined |
| **Action preflight** | `action_execute` | `actionPreflightPresentation.ts`, `executeAdminAction.ts` | **Gate** on enforced |
| **BOS preflight enrich** | mapped from effective | `enrichOperationalRecommendationPreflight.ts` | Assistive |
| **Forms coverage** | `form_coverage` | `readinessFromFormsCoverage.ts` | Display |
| **Forms public submit** | `form_submit` | `validatePublicSubmissionLifecycleRequirements.ts` | **Gate** on enforced |
| **Drawer Required Information panel** | bootstrap `readiness` | `OpportunityDrawerRequiredInformationPanel.tsx` | Display-only |

**Needs Attention:** **Not a consumer today.**

### 2.4 Persistence model

| Store | Contents |
|-------|----------|
| `departments.metadata` | `rule_levels_v1`, `required_rule_ids`, `recommended_rule_ids` — **config only** |
| Runtime | **No** durable `ReadinessResult` snapshots |
| Events | **None** (Phase 3+ in readiness roadmap) |

Attention projection **must not** introduce readiness or attention persistence in Phase 1.

### 2.5 API surfaces

| Surface | Readiness today |
|---------|-----------------|
| Drawer operational bootstrap | Optional `readiness` on response |
| Action preflight API | `readiness` on blocked/guidance payload |
| Forms lifecycle coverage API | Readiness on coverage payload |
| Entity GET | **No** readiness on full record today (bootstrap only) |
| Queue / NA APIs | **No** readiness |

Phase 1 bridge: readiness computed **in-process** at attention call sites — **no new HTTP fields required** for headless merge (optional `readiness_snapshot` on attention attach is Phase 2).

### 2.6 Hydration patterns — where readiness is available

| Runtime moment | Readiness available? | How |
|----------------|---------------------|-----|
| Drawer bootstrap | Yes | `tryEvaluateDrawerRecordReadiness` — memo scope per bootstrap request |
| Drawer entity GET (full) | **No** (today) | Must compute or pass from bootstrap client cache — **Phase 1 decision: compute in `computeOperationalAttentionAttachment` path with shared memo** |
| Queue enrich (single row) | **No** (today) | Phase 1: optional readiness eval per row **or** batch Phase 1b — see §3.4 perf |
| NA queue builder (500 rows) | **No** (today) | Phase 1 default: **defer** readiness projection on standalone 500-cap route; enable on drawer + capped WU enrich first |
| Action preflight | Yes | Already evaluated — **do not** merge into NA on preflight path |

**Recommended Phase 1 availability target:**

1. **Drawer entity attach** — readiness + attention same request, shared memo scope  
2. **Queue enrich** — behind feature flag / org metadata `readiness_attention_bridge_v1` when batch perf validated  
3. **NA list builder** — Phase 1b after drawer parity tests green  

---

## 3. Projection architecture

### 3.1 Design

```
┌─────────────────────────────────────────────────────────────┐
│ READINESS ENGINE (owner: completion/)                        │
│  evaluateOperationalReadiness(input) → ReadinessResult       │
└────────────────────────────┬────────────────────────────────┘
                             │ ReadinessResult (read-only)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ ATTENTION PROJECTION (owner: opportunities/ — pure, no I/O)  │
│  projectReadinessToAttentionReasons(result, profile)        │
│    → ProjectedAttentionReason[]                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ ATTENTION RESOLVER (owner: opportunities/)                   │
│  resolveOpportunityAttention({ ..., readiness?, profile? })│
│    platform collectors → merge → sort → OpportunityAttentionResult
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    Existing consumers (unchanged contract)
```

### 3.2 Where projection occurs

**Inside the attention resolution boundary** — immediately before reason merge/sort in `resolveOpportunityAttention`.

Alternative rejected: post-processing at each call site — duplicates merge logic and risks drift.

### 3.3 When projection occurs

| Rule | Detail |
|------|--------|
| **Trigger alignment** | Projection uses `ReadinessResult` evaluated with `trigger: "record_view"` — same as drawer display |
| **Freshness** | Live evaluation per request — no stale readiness snapshots |
| **Optional input** | If `readiness` omitted, resolver behaves exactly as today |
| **Profile gate** | If `profile.flag_missing_required === false`, projection returns `[]` |
| **Blocked state** | If `primary_state === "blocked"`, projection returns `[]` — preflight owns block UX |

### 3.4 What owns projection

| Component | Owner | Responsibility |
|-----------|-------|----------------|
| `evaluateOperationalReadiness` | `web/lib/completion/` | **Only** readiness truth |
| `projectReadinessToAttentionReasons` | `web/lib/opportunities/readinessAttentionProjection.ts` (proposed) | Pure map ReadinessResult → projected reasons |
| `ReadinessAttentionProjectionProfile` | Type co-located with projection | Policy flags (no Builder UI Phase 1) |
| `resolveOpportunityAttention` | `opportunityAttentionResolver.ts` | Merge platform + projected reasons |
| Readiness **evaluation** at call sites | Attention attachment / enrich helpers | Build `ReadinessEvalInput`, call memoized evaluator, pass snapshot to resolver |

**Forbidden:** `readinessAttentionProjection.ts` must **not** import `lifecycleFieldRuleEvaluator`, `evaluateEffectiveRequirements`, or field-rule catalogs.

### 3.5 What consumes projection

Consumers remain **`OpportunityAttentionResult`** — they do not import projection directly.

| Consumer | Change in Phase 1 |
|----------|-------------------|
| QueueService enrich | Pass optional readiness into resolver input |
| `computeOperationalAttentionAttachment` | Evaluate readiness once, pass to resolver |
| `buildOpportunityAttentionQueueItems` | Phase 1b — batch readiness |
| Bucket count builders | Inherit via resolver output |
| Drawer strip UI | Reads merged `reasons[]` — no UI Phase 1 |
| BOS grounding | Unchanged Phase 1 — non-goal |

### 3.6 Projection contract (proposed types)

```typescript
/** Phase 1 policy — JSON metadata only, no Builder UI */
export type ReadinessAttentionProjectionProfileV1 = {
  version: 1;
  flag_missing_required: boolean;       // default true
  include_required_gaps: boolean;       // default false — enforced only
  include_recommended_gaps: boolean;    // default false
};

export type ProjectedAttentionReason = {
  code: "missing_required_info";        // Phase 1 — single code
  label: string;                        // operator-facing aggregate or primary gap label
  severity: OpportunityAttentionSeverity;
  intent_category: "risk";              // Human Awareness Doctrine
  source: "readiness";
  provenance: "readiness.record_view.v1";
  readiness_gap_ids: string[];          // requirement_id refs
  resolution_hints: AttentionResolutionHint[];  // from gaps[].resolution
  sla_tier?: AttentionSlaTier;          // optional — readiness reasons use static "breached" for enforced?
};

export function projectReadinessToAttentionReasons(
  readiness: ReadinessResult | null | undefined,
  profile: ReadinessAttentionProjectionProfileV1 | null | undefined,
  nowMs: number,
): ProjectedAttentionReason[];
```

**Merge rule:** Projected reasons append to platform collector output before `applyPolicies` / `sortReasonCodes`.

**Priority:** Insert `missing_required_info` into `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER` — recommended position: after `missing_identity`, before `overdue_commitment` (product sign-off §10).

### 3.7 Performance doctrine

Per AdminV2 runtime performance doctrine:

| Rule | Phase 1 approach |
|------|------------------|
| No new drawer reveal gates | Readiness eval in attention attach uses same try/catch + optional pattern as bootstrap |
| No double evaluation | Shared `ReadinessMemoScope` per drawer GET request |
| NA queue 5000 cap | Batch readiness deferred to Phase 1b — document perf budget before enable |
| Failure isolation | Readiness eval failure → projection `[]`; platform attention unchanged |

---

## 4. Reason mapping model

### 4.1 `projectReadinessToAttentionReasons()` — mapping rules

**Phase 1:** One attention reason code aggregates readiness gaps.

| Readiness input | Projection |
|-----------------|------------|
| `primary_state === "ready"` | `[]` |
| `primary_state === "blocked"` | `[]` — not an attention reason |
| `primary_state === "warning"` | `[]` unless `include_recommended_gaps` |
| `primary_state === "expired"` | `[]` Phase 1 — `required_info_stale` is Phase 5+ |
| `primary_state === "needs_information"` + enforced gaps | `missing_required_info` |
| `needs_information` + required-only gaps | `missing_required_info` if `include_required_gaps` |
| `needs_information` + recommended-only | `[]` unless `include_recommended_gaps` |

### 4.2 Level → severity

| Gap `level` | Projected `severity` |
|-------------|----------------------|
| `enforced` | `high` |
| `required` | `medium` |
| `recommended` | `low` (only when policy includes recommended) |

When multiple gaps present, reason severity = **max** gap severity.

### 4.3 Level / state → intent category

| Projected reason | Human Awareness intent (doctrine) |
|------------------|-----------------------------------|
| `missing_required_info` | **Risk** |

Future codes (`required_info_stale`, packet incomplete) map to **Risk**; opportunity/awareness codes remain platform-collector owned in later phases.

### 4.4 Gap → resolution hints

Map each included gap's `ReadinessGap.resolution` to `AttentionResolutionHint`:

| `resolution.type` | Hint `kind` |
|-------------------|-------------|
| `field` | `drawer_field` + `field_key` |
| `action` | `admin_action` + `action_key` |
| `form` | `form` + `form_id` |

Aggregate on the single `missing_required_info` reason — `resolution_hints[]` carries all gap hints; UI may truncate display.

### 4.5 Example mappings

**Example A — enforced gap blocks preflight but surfaces in NA:**

```typescript
// ReadinessResult (record_view)
{
  primary_state: "needs_information",
  gaps: [{
    requirement_id: "child:program_interest",
    level: "enforced",
    label: "Child · Program Interest",
    blocking: false,  // record_view trigger — not action_execute
    failure_kind: "missing",
    resolution: { type: "field", field_key: "program_interest" }
  }],
  counts: { by_level: { enforced: 1, required: 0, recommended: 0 } }
}

// Projected (default profile)
{
  code: "missing_required_info",
  label: "Required information missing",  // or "Child · Program Interest" when single gap
  severity: "high",
  readiness_gap_ids: ["child:program_interest"],
  ...
}
```

**Example B — required-only gap, default profile (enforced only):**

```typescript
// gaps: [{ level: "required", ... }]
// profile.include_required_gaps === false
→ []
```

**Example C — same record, action_execute trigger (preflight):**

```typescript
// primary_state: "blocked", enforced gaps, blocking: true
→ projectReadinessToAttentionReasons returns []
→ ActionPreflightBlockedPanel shows block — NA strip does not duplicate
```

**Example D — future packet scope (not Phase 1):**

```typescript
// gap: { scope_type: "packet", failure_kind: "incomplete", ... }
→ Phase 5: code "enrollment_packet_incomplete" — same projection function extended, not new evaluator
```

### 4.6 `missing_identity` coexistence

| Signal | Owner | Phase 1 behavior |
|--------|-------|------------------|
| Missing person/customer linkage | Platform collector `missing_identity` | **Keep** — not a field-rule gap |
| Missing configured field values | Readiness projection `missing_required_info` | **New** |

If both fire, multi-reason payload is valid — primary reason determined by priority order. Document in operator copy that linkage vs field gaps differ.

---

## 5. Resolution model

### 5.1 Principle

**Readiness state change drives resolution.** Needs Attention **consumes** resolution; it does not own dismiss logic or persistence.

```
Operator / workflow / form  →  field populated
        ↓
evaluateOperationalReadiness  →  primary_state: ready | gaps cleared
        ↓
projectReadinessToAttentionReasons  →  []
        ↓
resolveOpportunityAttention  →  needs_attention may still true from other platform reasons
```

### 5.2 Readiness-generated resolution paths

| Scenario | Resolution kind | Clears when |
|----------|-----------------|-------------|
| **Missing required information** | Automatic (field PATCH / form intake) | Gap absent on next `record_view` eval |
| **Missing enrollment packet** (future) | Manual + workflow-assisted | Packet scope satisfied — evaluator re-run |
| **Expired document** (future) | Manual | Freshness scope renewed |

### 5.3 What NA must not do

- Store `attention_cleared_at` or operator dismiss flags (Phase 1)  
- Clear readiness gaps  
- Bypass preflight when `blocked`  
- Treat task completion as gap satisfaction unless task workflow PATCHes fields  

### 5.4 Composite resolution

A record may lose `missing_required_info` while retaining `stale_new_inquiry` — `needs_attention` remains true. Resolution is **per reason**, not per record boolean.

---

## 6. Runtime consumption model (architecture only)

### 6.1 Department workspace

| Element | Consumption |
|---------|-------------|
| Right lane bucket chips | Count rows where `reasons[]` intersects bucket `reason_codes` — add `missing_required_info` to relevant bucket seed/profile |
| Count semantics | Unique inquiries per bucket — unchanged |
| Bootstrap | No readiness on dept bootstrap today — bucket counts use resolver-only until Phase 1b batch readiness |

**Config Phase 1:** Add `missing_required_info` to bucket `reason_codes` in metadata manually or via seed update — **not** Builder profile UI.

### 6.2 Work unit

| Element | Consumption |
|---------|-------------|
| NA queue list | Filter `needs_attention` after merged resolver |
| Pipeline row badges | `_needs_attention` true when readiness reason present |
| Bucket sub-tabs | Filter `attention_bucket` including readiness reason code |

### 6.3 Drawer

| Surface | Source | Phase 1 |
|---------|--------|---------|
| Operational attention strip | `_operational_attention.reasons[]` includes projected reason | Headless merge on entity attach |
| Required Information panel | `bootstrap.readiness.gaps[]` | Unchanged — **must list same gaps** as projection |
| Review Assist | BOS — non-goal Phase 1 | — |

**Coherence rule:** Gap ids on projected reason must match panel gap `requirement_id`s.

### 6.4 Queue overlays

| Field | Consumption |
|-------|-------------|
| `_needs_attention` | Boolean OR of all reasons |
| `_attention_reason_code` | `primary_reason.code` — may become `missing_required_info` |
| Row styling | Existing `workUnitQueueRowAttention` — no change |

### 6.5 Future dashboards

| Metric | Source |
|--------|--------|
| Records with enforced gaps in NA | Count `missing_required_info` in resolver histograms |
| Time-to-clear readiness attention | Delta on `evaluated_at` snapshots — **requires Phase 3+ event log**, not Phase 1 |
| Readiness vs attention parity | Audit job comparing gap ids to projected reason — test/ops tooling |

Reporting **reads evaluator + resolver outputs** — not NA alone.

---

## 7. Testing strategy

Architecture must make **parallel readiness calculation in attention impossible**.

### 7.1 Unit tests — projection purity

**File:** `web/tests/opportunities/readinessAttentionProjection.test.ts` (proposed)

| Test | Proves |
|------|--------|
| Enforced gaps → `missing_required_info` | Mapping correctness |
| `blocked` → `[]` | Preflight / NA separation |
| `ready` → `[]` | No false positives |
| Profile flags (`include_required_gaps`, etc.) | Policy gates |
| Severity aggregation | Level → severity |
| Resolution hint mapping | Gap resolution → hints |
| **Import guard** | Projection module does not import field-rule evaluator paths |

### 7.2 Integration tests — resolver merge

**File:** extend `opportunityAttentionResolver.test.ts`

| Test | Proves |
|------|--------|
| Resolver + mocked `ReadinessResult` | Merge without calling `evaluateOperationalReadiness` inside resolver |
| Priority order with readiness reason | Deterministic `primary_reason` |
| Platform + readiness reasons coexist | Multi-reason payload |
| Omit readiness input | Backward identical to today |

### 7.3 Wiring tests — single evaluation

**File:** `web/tests/opportunities/readinessAttentionWiring.test.ts` (proposed)

| Test | Proves |
|------|--------|
| Mock `evaluateOperationalReadiness` — attach path calls **once** per request scope | No double eval |
| Memo scope shared between readiness panel path and attention attach (when both run) | Dedup |
| Readiness eval throws → attention attach still returns platform reasons | Failure isolation |

### 7.4 Forbidden pattern tests (static / grep)

| Assertion | Enforcement |
|-----------|-------------|
| `readinessAttentionProjection.ts` has no imports from `lifecycleFieldRuleEvaluator` | ESLint boundary or test |
| `opportunityAttentionResolver.ts` does not import field-rule evaluator | Existing — must remain |
| No new `missing_required_info` trigger math outside projection | Code review + grep for field-rule strings in opportunities/ |

### 7.5 Parity tests

| Test | Proves |
|------|--------|
| Same `ReadinessResult` fixture → identical projected output across runs | Determinism |
| Drawer bootstrap gaps ⊆ `_operational_attention.readiness_gap_ids` | UI coherence Phase 2 |
| `missing_identity` + readiness gap — both present, no duplicate gap for identity fields | Coexistence |

### 7.6 Regression gates (Phase 1 PR)

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- \
  tests/opportunities/readinessAttentionProjection.test.ts \
  tests/opportunities/opportunityAttentionResolver.test.ts \
  tests/opportunities/readinessAttentionWiring.test.ts \
  tests/completion/readinessConsumerWiring.test.ts
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts
```

---

## 8. Explicit non-goals (Phase 0 / Phase 1 lock)

| Non-goal | Notes |
|----------|-------|
| UI implementation | Phase 2 |
| Migrations / new tables | Metadata JSON only |
| New HTTP APIs | In-process merge |
| Lifecycle attention profiles (Builder) | Phase 3 |
| Task attention (`operational_task_overdue`) | Phase 4 |
| SLA attention changes | Maintain existing |
| BOS integration changes | Phase 2+ |
| Opportunity / Awareness intent categories | Future phases |
| `attention_entered` events | Phase 3+ |
| NA queue batch readiness (500–5000 rows) | Phase 1b after perf sign-off |

---

## 9. Recommended Phase 1 implementation slices

Sequential PRs — **headless only**:

| PR | Deliverable |
|----|-------------|
| **1** | Types + `projectReadinessToAttentionReasons` + unit tests + `missing_required_info` in catalog |
| **2** | Extend `resolveOpportunityAttention` input + merge + resolver tests |
| **3** | `computeOperationalAttentionAttachment` — readiness eval + memo + profile from metadata |
| **4** | Metadata profile parser `readiness_attention_projection_v1` + default enforced-only |
| **5** | QueueService enrich behind flag (optional) + wiring tests |
| **6** | Bucket seed/doc update for `missing_required_info`; remove legacy `opportunityNeedsAttention` if safe |

---

## 10. Open decisions (product sign-off before Phase 1 coding)

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Default profile: enforced-only vs include Required | **Enforced only** |
| 2 | Priority order for `missing_required_info` | After `missing_identity`, before `overdue_commitment` |
| 3 | Metadata key | `opportunity_attention_rules.readiness_projection_v1` nested under existing rules object |
| 4 | Phase 1 queue enrich | **Drawer attach only** first PR merge; queue flag second |
| 5 | Single vs per-gap readiness reasons | **Single aggregate code** Phase 1 — multi-code later if needed |
| 6 | Label copy | "Required information missing" aggregate; single-gap uses field label |
| 7 | Deprecate `missing_identity` when readiness covers identity fields | **No** Phase 1 — coexist |

---

## 11. Success criteria (Phase 0 complete)

At sprint completion we know exactly:

| Criterion | Status |
|-----------|--------|
| Where projection happens | `projectReadinessToAttentionReasons` merged in `resolveOpportunityAttention` |
| Who owns projection | `web/lib/opportunities/readinessAttentionProjection.ts` (pure) |
| Who evaluates readiness | `evaluateOperationalReadiness` only |
| Who consumes projection | Existing `OpportunityAttentionResult` consumers |
| How attention resolves | Readiness re-eval → projection empty → reason drops |
| Future categories coexist | Platform collectors + readiness projection merge — no second evaluator |
| Duplication prevented | Import guards + single eval wiring tests + blocked→[] rule |
| Doctrine preserved | Readiness evaluates; Needs Attention surfaces |

---

## Appendix A — Key files reference

| Area | Path |
|------|------|
| Attention resolver | `web/lib/opportunities/opportunityAttentionResolver.ts` |
| Attention attach | `web/lib/admin/operationalAttentionEntityAttachment.ts` |
| Drawer attention recompute | `web/lib/admin/recomputeOpportunityDrawerOperationalAttention.ts` |
| NA queue builder | `web/lib/workspace/buildOpportunityAttentionQueueItems.ts` |
| Queue enrich | `web/lib/queues/QueueService.ts` |
| Reason catalog | `web/lib/opportunities/attentionPlatformCatalog.ts` |
| Readiness entry | `web/lib/completion/evaluateOperationalReadiness.ts` |
| Readiness types | `web/lib/completion/readinessTypes.ts` |
| Readiness memo | `web/lib/completion/readinessEvaluationMemo.ts` |
| Drawer readiness | `web/lib/completion/readinessDrawerBootstrap.ts` |
| Drawer bootstrap | `web/lib/admin/loadOpportunityDrawerOperationalBootstrap.ts` |
| Operating model | `docs/sprints/archive/06_2026/needs_attention_v2_operating_model.md` |

---

*End of Phase 0 implementation plan — Phase 1 coding may begin after §10 sign-off.*
