# Readiness Engine — Architecture & Runtime Contract

**Path:** `docs/sprints/06_2026/readiness_engine_architecture_and_runtime_contract.md`  
**Date:** 2026-06-02  
**Status:** **Architecture frozen** — operating model for Phase 1 implementation planning  
**Scope:** Runtime contracts, evaluation architecture, storage, events, consumers, performance, Phase 1 blueprint. **No implementation.**

**Canonical inputs (frozen — do not redesign):**

- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md)
- [`lifecycle_builder_hardening_and_v2_canonical_model.md`](./lifecycle_builder_hardening_and_v2_canonical_model.md)
- [`completed/lifecycle_builder_hardening_closeout.md`](./completed/lifecycle_builder_hardening_closeout.md)

**Authority:** This document defines the **Readiness Engine** implementation contract. It extends — does not replace — the Operational Readiness Framework. On conflict, align code to both; escalate true conflicts to product.

---

## Executive summary

The **Readiness Engine** is Alloy's platform-owned, deterministic evaluation service. It extends the existing `evaluateEffectiveRequirements` spine — it is **not** a parallel product module or operator-facing name.

```
Lifecycle → Required Information (config)
                  ↓
           Readiness Engine
                  ↓
         ReadinessResult (contract)
                  ↓
    Forms · Actions · BOS · Reporting · (future: NA · Tasks · Automations)
                  ↓
              Progression
```

| Decision | Recommendation |
|----------|----------------|
| **Output contract** | Structured `ReadinessResult` with `primary_state` + `gaps[]` — not score-first |
| **Evaluation** | **Hybrid live** — always live on gates; request-scoped memoization elsewhere |
| **Storage** | **Hybrid** — Phase 1: no durable snapshots; Phase 3+: event log + reporting projections |
| **Events** | Phase 1: none; Phase 3: per-requirement `requirement_violated` / `requirement_satisfied` |
| **Consumers** | **Request** on gates; **subscribe** to events later; **never** store alternate truth |
| **Phase 1 scope** | Record scope · enforcement levels · readiness states · lifecycle stage requirements |

**Implementation readiness:** **Yes** — Phase 1 can begin after §12 open questions are signed off.

---

## 1. Readiness Engine architecture

### 1.1 Role

| | |
|---|---|
| **Internal name** | Readiness Engine |
| **Implementation home** | `web/lib/completion/` — extend `evaluateEffectiveRequirements` → `evaluateOperationalReadiness` |
| **Operator name** | None — operators see **Required information**, preflight copy, progression checklist |
| **Responsibility** | Given config + record snapshot + trigger → return authoritative `ReadinessResult` |
| **Not responsible for** | Config save, task creation, NA writes, BOS inference, workflow execution |

### 1.2 Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ CONFIG PLANE (Lifecycle Builder)                             │
│  departments.metadata — Required information levels per stage │
└────────────────────────────┬────────────────────────────────┘
                             │ effectiveRulesForContext()
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ READINESS ENGINE (platform, server-only)                     │
│  1. Resolve effective requirements for trigger + context       │
│  2. Load record snapshot (person, OCM, opportunity)          │
│  3. Evaluate record-scope rules (Phase 1)                      │
│  4. Merge legacy sources (layout, transition) when triggered   │
│  5. Derive primary_state + gaps[]                              │
└────────────────────────────┬────────────────────────────────┘
                             │ ReadinessResult
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ CONSUMERS (read-only)                                        │
│  Gates: Actions, Forms submit, Transitions (live eval)         │
│  Display: Drawer, progression, preflight UI                    │
│  Assist: BOS (snapshot attach)                                 │
│  Future: NA projection, reporting aggregates, automation react │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Relationship to existing code

| Today | Phase 1 evolution |
|-------|-------------------|
| `evaluateEffectiveRequirements` | Becomes orchestration entry; adds `lifecycle_stage` source |
| `lifecycleFieldRuleEvaluator` | Record-scope evaluator plugin |
| `EffectiveRequirementsResult` | Maps to / wraps `ReadinessResult` for backward compatibility |
| `lifecycleActionRequirementCatalog` | Action-requirement plugin |
| Forms coverage evaluator | Form-trigger adapter calling same effective-rules contract |
| `validateLifecycleActivationRuntime` | **Separate** — config readiness (`lifecycle_validate` trigger); not record engine |

### 1.4 Extensibility strategy

Requirements arrive via **plugins** registered on a single orchestrator:

| Plugin | Scope (Phase) | Trigger(s) |
|--------|---------------|------------|
| `lifecycleStageRecordRules` | Record · stage | `record_view`, `action_execute`, `status_transition` |
| `lifecycleActionRules` | Action | `action_execute` |
| `formsContractRules` | Form | `form_submit`, `form_coverage` |
| `layoutFieldRules` | Layout | `layout_save` |
| `transitionRules` | Transition | `status_transition`, `action_execute` |
| `relationshipRules` | Relationship | Phase 4 |
| `packetRules` | Packet | Phase 5 |
| `freshnessRules` | Freshness | Phase 5 |

New scopes add plugins — **not** new engines.

---

## 2. ReadinessResult contract

### 2.1 Design principles

1. **Fact-first, not score-first** — Consumers need *what* is missing and *whether* it blocks, not an opaque number.
2. **Trigger-scoped** — Same record may yield different `primary_state` per trigger (view vs action).
3. **Versioned** — `contract_version` enables additive evolution.
4. **Partitioned gaps** — One `gaps[]` array with discriminated fields beats parallel `missing[]` / `warnings[]` / `expired[]` arrays that drift out of sync.
5. **Optional derived metrics** — Score/completion ratio for reporting only; never gates.

### 2.2 Rejected alternative: score-primary shape

```typescript
// ❌ Not recommended as primary contract
{ state: "blocked", score: 65, missing: [], warnings: [], expired: [], satisfied: [] }
```

| Problem | Why |
|---------|-----|
| Score semantics undefined | 65 of what? Enforced only? All levels? Per stage? |
| Parallel arrays | Duplicate requirement ids across arrays; hard to extend with packet/relationship scope |
| State without trigger | "Blocked" for which action? |
| Satisfied list unbounded | Large stages → payload bloat on every queue row |

**Optional:** `completion_summary.ratio` (0–1) derived from configured rule counts — reporting/dashboards only.

### 2.3 Canonical contract (v1)

```typescript
/** Frozen additive versioning — bump minor for new optional fields only */
type ReadinessResultContractVersion = "1.0";

type ReadinessPrimaryState =
  | "ready"
  | "needs_information"
  | "blocked"
  | "warning"
  | "expired";

type ReadinessTrigger =
  | "record_view"           // drawer, progression, queue hint
  | "action_execute"        // preflight gate
  | "status_transition"     // target status gate
  | "form_submit"           // public/admin submit gate
  | "form_coverage"         // form settings coverage (no record)
  | "lifecycle_validate";   // builder Ready check / config coherence

type ReadinessScopeType = "record" | "relationship" | "packet" | "freshness";

type RequirementLevel = "recommended" | "required" | "enforced";

type ReadinessGap = {
  /** Stable requirement id — internal, never operator-primary */
  requirement_id: string;
  scope_type: ReadinessScopeType;
  level: RequirementLevel;
  /** Operator-facing — e.g. "Child · Program Interest" */
  label: string;
  missing_reason: string;
  failure_kind: "missing" | "expired" | "incomplete";
  /** Whether this gap blocks the current trigger */
  blocking: boolean;
  /** Resolution hints for UI / BOS — optional */
  entity_type?: string;
  entity_id?: string;
  field_key?: string;
  resolution?: {
    type: "field" | "action" | "form";
    action_key?: string;
    form_id?: string;
  };
};

type ReadinessResult = {
  contract_version: ReadinessResultContractVersion;

  // ─── Required: identity ───
  primary_state: ReadinessPrimaryState;
  trigger: ReadinessTrigger;
  subject: {
    entity_type: string;
    entity_id: string;
  };
  context: {
    org_id: string;
    department_id?: string;
    builder_stage_key?: string;
    operator_stage?: string;
    action_key?: string;
    status_from?: string;
    status_to?: string;
    form_id?: string;
  };

  // ─── Required: evaluation body ───
  gaps: ReadinessGap[];
  counts: {
    gaps_total: number;
    by_level: { recommended: number; required: number; enforced: number };
    blocking: number;
    satisfied: number;       // configured rules evaluated as present
    configured: number;      // rules in scope for this trigger
  };

  // ─── Required: gate semantics ───
  ok: boolean;               // true iff no blocking gaps for this trigger

  // ─── Optional: provenance ───
  evaluated_at?: string;     // ISO — when computed
  evaluation_id?: string;    // uuid — correlates cache + events
  config_fingerprint?: string; // hash(stage rules + bindings version)

  // ─── Optional: backward compatibility ───
  legacy?: {
    effective_requirements?: EffectiveRequirementsResult;
  };

  // ─── Optional: reporting / BOS (derived, not authoritative) ───
  completion_summary?: {
    ratio: number;           // satisfied / configured
    label: string;           // e.g. "3 of 5 required fields complete"
  };

  // ─── Optional: BOS attach ───
  bos?: {
    suggested_action_keys?: string[];
    covering_form_ids?: string[];
  };
};
```

### 2.4 Required vs optional properties

| Property | Required | Consumer |
|----------|----------|----------|
| `contract_version` | Yes | All — forward compatibility |
| `primary_state` | Yes | UI summary, BOS, reporting aggregates |
| `trigger` | Yes | All — disambiguates state |
| `subject` | Yes | All |
| `context` | Yes | Stage/action/form scoping |
| `gaps` | Yes | Drawer, preflight, BOS (may be empty) |
| `counts` | Yes | Summary chips, progression, dashboards |
| `ok` | Yes | Gates (actions, forms, transitions) |
| `evaluated_at` | Optional Phase 1; Required Phase 3+ with cache | Cache/debug |
| `evaluation_id` | Optional | Event correlation |
| `config_fingerprint` | Optional | Cache invalidation |
| `completion_summary` | Optional | Progression bar, BOS summary |
| `bos` | Optional | Precomputed hints — BOS may ignore |
| `legacy` | Optional Phase 1 | Migration shim |

### 2.5 Operator-facing requirements

Operators **never** receive raw `ReadinessResult` JSON. Surfaces map:

| Field | Operator exposure |
|-------|-------------------|
| `primary_state` | Mapped to frozen copy (§6 framework): "Required information missing", preflight block, "Recommended" |
| `gaps[].label` | Yes — entity · field labels |
| `gaps[].missing_reason` | Yes — human-readable |
| `requirement_id`, `scope_type`, `evaluation_id` | **Never** |
| `completion_summary.label` | Yes — checklist summaries |
| `ok` | Implicit in preflight / disabled action |

### 2.6 BOS-facing requirements

BOS receives a **snapshot** attached to record context:

| Must include | Purpose |
|--------------|---------|
| `primary_state`, `trigger` | Narration tone |
| `gaps[]` (blocking first) | Insight content |
| `context.builder_stage_key` | Stage-aware copy |
| `completion_summary` | "3 of 5 complete" |
| `bos.suggested_action_keys` | Recommendation routing |

BOS **must not** require score. BOS **must not** mutate gaps.

### 2.7 Reporting requirements

| Need | Source |
|------|--------|
| Count by state / stage | Aggregate `primary_state` + `context.operator_stage` |
| Time-to-ready | Event log (`requirement_satisfied` timestamps) — Phase 3+ |
| Completion ratio trends | `completion_summary.ratio` or `counts.satisfied / counts.configured` |
| Drill-down | `gaps[].requirement_id` in warehouse — internal analytics only |

Reporting uses **projections** (events or batch snapshots) — not live re-eval of entire org on every dashboard load.

### 2.8 Gap partitioning (derived views)

Consumers derive views from `gaps[]` — do not duplicate in contract:

```typescript
const missing = gaps.filter(g => g.failure_kind === "missing");
const expired = gaps.filter(g => g.failure_kind === "expired");
const warnings = gaps.filter(g => g.level === "recommended");
const blocking = gaps.filter(g => g.blocking);
```

**Satisfied rules:** Include in `counts.satisfied` only. Optionally add `satisfied[]: { requirement_id, label }[]` in v1.1 if checklist UI needs explicit list — Phase 2.

### 2.9 Contract evolution rules

| Change type | Action |
|-------------|--------|
| New optional field | Minor version bump; consumers ignore |
| New `scope_type` | Add plugin; extend `ReadinessGap` |
| New `primary_state` | Major version — requires consumer audit |
| Rename field | **Forbidden** — additive only |

---

## 3. Evaluation model

### 3.1 What gets evaluated

Evaluation is always **`(effective_requirements, record_snapshot, trigger, context)`**.

| Requirement source | Config origin | Phase 1 |
|--------------------|---------------|---------|
| **Stage record rules** | Required Information · stage | **Yes** |
| **Action rules** | Action intake spec + preflight catalog | Partial — existing four actions |
| **Form contract rules** | Form lifecycle usage + stage rules | **Yes** — submit + coverage triggers |
| **Layout rules** | `field_placements_v1` | Pass-through — existing path |
| **Transition rules** | Automations / status_transition_rules | Pass-through — existing async path |
| **Lifecycle config** | Builder metadata coherence | Ready check only |
| Relationship / packet / freshness | — | **Excluded** |

### 3.2 Evaluation pipeline

```
1. resolveContext(trigger, input)
     → department_id, builder_stage_key, effective rule set

2. loadSnapshot(subject)
     → opportunity + primary_person + inquiry_children (+ metadata)

3. for each registered plugin matching trigger:
     → plugin.evaluate(snapshot, rules, context) → Gap[]

4. mergeGaps(plugins)
     → dedupe by requirement_id; strongest level wins

5. assignBlocking(gaps, trigger)
     → per framework §6.3 state derivation

6. derivePrimaryState(gaps, trigger)
     → severity order: blocked > expired > needs_information > warning > ready

7. buildCounts + ok + optional completion_summary

8. return ReadinessResult
```

**Ownership:** Steps 1–8 owned by Readiness Engine orchestrator. Plugins own rule semantics only.

### 3.3 Evaluation modes

| Mode | When | Authority |
|------|------|-----------|
| **Live evaluation** | Gates (`action_execute`, `form_submit`, `status_transition`) | **Authoritative** — always fresh snapshot |
| **Live + request cache** | `record_view`, drawer load, single-record APIs | Authoritative within request; memoize by `(subject, trigger, config_fingerprint)` |
| **Batch summary** | Queue row hints (Phase 2+) | `primary_state` + `counts` only — full gaps on drill-down |
| **Config evaluation** | `lifecycle_validate` | Separate code path — no record snapshot |

### 3.4 Architecture verdict: **Hybrid live**

| Option | Verdict |
|--------|---------|
| Always live, no cache | Correct but costly at scale — use request memoization |
| Event-driven only | **Rejected** — stale gates unacceptable for actions/forms |
| Precomputed snapshots as truth | **Rejected** — invalidation complexity; drift on gates |
| **Hybrid live** | **Approved** — live on gates; request cache for reads; events for *changes* (Phase 3); reporting projections async |

### 3.5 Triggers (canonical)

| Trigger | Subject | Evaluates | Gate? |
|---------|---------|-----------|-------|
| `record_view` | Opportunity | Current stage record rules | No |
| `action_execute` | Opportunity | Stage + action rules | **Yes** |
| `status_transition` | Opportunity | Target stage enforced + transition | **Yes** |
| `form_submit` | Form submission | Form contract enforced rules | **Yes** |
| `form_coverage` | Form definition | Coverage vs contract | No |
| `lifecycle_validate` | Department config | Config coherence | No (Ready check) |

### 3.6 Config resolution

Single function — all consumers use it:

```
effectiveRequirementsForReadiness({
  org_id,
  department_id,
  builder_stage_key,
  trigger,
  action_key?,
  form_intent?,
}) → { rules: StageRequirementRule[], fingerprint: string }
```

Wraps existing `effectiveFieldRulesForBuilderStage` + level metadata (Phase 1).

---

## 4. Storage strategy

### 4.1 Options evaluated

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — Always calculate** | No durable readiness storage | **Phase 1 default** |
| **B — Store snapshots** | Persist `ReadinessResult` on opportunity/metadata | **Rejected as truth** |
| **C — Hybrid** | Live gates + event log + reporting projections | **Long-term approved** |

### 4.2 Recommended direction: **Hybrid (phased)**

#### Phase 1 — Always calculate + request cache

| Store | Content | TTL |
|-------|---------|-----|
| None durable | — | — |
| Request memo | `Map<cacheKey, ReadinessResult>` | Single HTTP request / server action |
| Optional module cache | Same key | Short (e.g. 30s) for drawer burst reads — **must** invalidate on PATCH |

**Runtime:** Gates always miss cache (force fresh).  
**Reporting:** Not supported org-wide in Phase 1.  
**Performance:** Acceptable for single-record paths; queue batch deferred.

#### Phase 2 — Denormalized hints (optional, non-authoritative)

| Store | Content | Notes |
|-------|---------|-------|
| `opportunities.metadata.readiness_hint_v1` | `{ primary_state, ratio, fingerprint, at }` | **Display only** — re-eval on gate; never trust hint for execute |

#### Phase 3 — Event log (append-only)

| Store | Content |
|-------|---------|
| `workflow_events` or dedicated `readiness_events` | Per-requirement transitions |

Events drive automations and reporting — not live gates.

#### Phase 4+ — Reporting warehouse / aggregates

| Store | Content |
|-------|---------|
| Nightly or stream aggregate | Counts by stage × state × requirement_id |

### 4.3 Implications matrix

| Dimension | Always calculate (P1) | Hybrid (long-term) |
|-----------|-------------------------|---------------------|
| **Runtime truth** | Always fresh on gates | Gates always fresh; hints/projections labeled non-authoritative |
| **Reporting** | Limited to live samples | Event log + aggregates |
| **Performance** | Request-bound | Batch hints reduce repeat full eval |
| **Scalability** | Queue full eval expensive — defer | Hints + summary state for queues |
| **Invalidation** | N/A | `config_fingerprint` + record PATCH clears hint |

### 4.4 Anti-patterns

| Anti-pattern | Why forbidden |
|--------------|---------------|
| Store readiness as only copy on record | Drift after PATCH / config save |
| Queue row stores full `gaps[]` in DB | Write amplification; stale UI |
| Client computes readiness | Violates server authority |
| NA persists readiness snapshot as truth | NA projects — doesn't own |

---

## 5. Event model

### 5.1 Phase strategy

| Phase | Events |
|-------|--------|
| **Phase 1** | **None** — live eval only |
| **Phase 2** | Internal telemetry optional (non-workflow) |
| **Phase 3** | Canonical workflow events for automations |
| **Phase 4+** | Aggregate state change events if needed |

### 5.2 Canonical events (Phase 3+)

**Primary events — per requirement, automations consumable:**

| Event key | Emitted when | Payload (minimal) |
|-----------|--------------|---------------------|
| `requirement_violated` | Rule transitions satisfied → not satisfied (enforced or required per policy) | `org_id`, `opportunity_id`, `requirement_id`, `level`, `scope_type`, `builder_stage_key`, `trigger_context` |
| `requirement_satisfied` | Rule transitions not satisfied → satisfied | Same |

**Secondary events — aggregate, optional:**

| Event key | Emitted when | Consumable by |
|-----------|--------------|---------------|
| `readiness_state_changed` | `primary_state` changes for `(subject, trigger=record_view)` | Reporting, dashboards |
| `readiness_warning_active` | Recommended gaps appear/disappear | Soft analytics only |

**Not recommended as canonical:**

| Event | Why |
|-------|-----|
| `readiness_became_ready` | Redundant with `requirement_satisfied` batch; ambiguous trigger |
| `readiness_became_blocked` | Blocked is trigger-specific — use preflight path + `requirement_violated` |
| `readiness_requirement_missing` | Duplicate of `requirement_violated` |

### 5.3 Internal-only events

| Event | Purpose |
|-------|---------|
| `readiness_evaluated` (telemetry) | Latency, cache hit rate — not workflow-exposed |
| `readiness_cache_invalidated` | Debug |

### 5.4 Emission rules

1. Emit **only on transition** — not on every eval.
2. Emit **after** successful record PATCH / form submit that changes field values — compare before/after eval.
3. Emission owned by **mutation paths** (action execute, PATCH hooks) — not by display reads.
4. Phase 1: design hooks; **do not emit**.

### 5.5 Event vs evaluation ownership

```
Record PATCH / action execute
    → Readiness Engine (after mutation, before response)
    → compare previous vs current gap states
    → emitEvent(requirement_violated | requirement_satisfied)
    → workflow_events spine
```

Automations **react** — they do not re-evaluate unless conditions require fresh proof.

---

## 6. Consumer contract

### 6.1 Interaction modes

| Mode | Description | When |
|------|-------------|------|
| **Request** | Synchronous call to Readiness Engine | Gates, drawer, BOS snapshot, form coverage |
| **Subscribe** | Listen to readiness events | Phase 3 automations, reporting pipelines |
| **React** | Side effect after event | Workflows, reminders — not evaluation |
| **Store (projection)** | Denormalized hint or aggregate | Phase 2 hints, Phase 4 reporting — **non-authoritative** |

**Preferred architecture:** **Request for truth on gates; subscribe for reactions; never store as sole truth.**

### 6.2 Consumer matrix

| Consumer | Phase 1 mode | Trigger(s) | May store? |
|----------|--------------|------------|------------|
| **Lifecycle / progression** | Request | `record_view` | No |
| **Forms** | Request | `form_coverage`, `form_submit` | No |
| **Actions / preflight** | Request (live, no cache) | `action_execute` | No |
| **Ready check** | Request | `lifecycle_validate` | No |
| **BOS** | Request (snapshot attach) | `record_view`, `action_execute` | No |
| **Drawer / queue UI** | Request (+ request cache) | `record_view` | Hint only P2+ |
| **Needs Attention** | Request (Phase 3) | `record_view` → project reasons | No |
| **Tasks** | Subscribe (Phase 3+) | `requirement_violated` | Tasks table only |
| **Automations** | Subscribe (Phase 3+) | `requirement_*` | Workflow state only |
| **Reporting** | Subscribe + batch | events / aggregates | Warehouse only |

### 6.3 API shape (conceptual — Phase 1)

```typescript
// Server-only entry points
evaluateOperationalReadiness(input: ReadinessEvalInput): ReadinessResult

evaluateOpportunityReadinessForView(supabase, { orgId, opportunityId, departmentId? }): ReadinessResult

evaluateOpportunityActionReadiness(supabase, { orgId, opportunityId, actionKey, payload? }): ReadinessResult

evaluateFormSubmissionReadiness(supabase, { orgId, formId, submittedValues, ... }): ReadinessResult

// No public REST "readiness" route in Phase 1 — consumed via existing action preflight, drawer bootstrap, forms submit
```

### 6.4 Consumer obligations

| Rule | Detail |
|------|--------|
| **Do not re-derive** | Consumers must not implement parallel field-rule checks |
| **Pass trigger** | Same record, different triggers → different results |
| **Gates call live** | `action_execute` / `form_submit` bypass cache |
| **Do not mutate result** | BOS enrich copy only — not gaps |
| **Label from result** | Operator copy from `gaps[].label`, not `requirement_id` |

---

## 7. UI surface strategy

*No screen design — consistency requirements only.*

### 7.1 Where readiness surfaces (phased)

| Surface | Phase | What operator sees | Trigger |
|---------|-------|-------------------|---------|
| **Record drawer** — Required information section | 1–2 | Gaps by level; completion summary | `record_view` |
| **Action preflight panel** | 1 | Blocked state; enforced gaps only | `action_execute` |
| **Progression / stage checklist** | 1 | Satisfied vs configured counts | `record_view` |
| **Form Detail** — lifecycle coverage | 1–2 | Form readiness vs contract | `form_coverage` |
| **Queue row hint** (optional) | 2 | Icon/chip — not full gap list | `record_view` summary |
| **Work unit / queue view** | 2 | Aggregate "N records missing information" — dept metric | Batch aggregate |
| **Stage summary** (builder) | 2 | Config completeness — not record eval | `lifecycle_validate` |
| **BOS insight band** | 2–3 | Explains `primary_state` + top gaps | Snapshot |
| **Needs Attention lane** | 3 | Projects `missing_required_info` | NA resolver |
| **Ready check** | 1 | Config only — **not** Readiness Engine record eval | `lifecycle_validate` |

### 7.2 Operator expectations

| Expectation | Platform rule |
|-------------|---------------|
| Same gaps everywhere for same record | Single engine, same trigger |
| Action block matches drawer | `action_execute` may show more blocking gaps than `record_view` |
| Recommended ≠ blocking | Warning state never disables actions |
| Ready check ≠ record readiness | Builder go-live vs operational record state |
| Missing ≠ expired (future) | Separate copy paths |

### 7.3 Consistency requirements

1. **One gap list source** — drawer and preflight derive from same engine, different triggers.
2. **Enforced gaps block** — only on gate surfaces.
3. **No readiness score in operator UI** — use counts / checklist labels.
4. **Entity labels from org config** — Lead, Guardian, Child — not internal ids.
5. **Queue previews stay previews** — readiness does not change queue membership.

---

## 8. Performance strategy

### 8.1 Principles

1. **Gate accuracy over cache** — Never cache through `action_execute` or `form_submit`.
2. **Batch snapshot loading** — One opportunity load per eval; plugins share snapshot.
3. **Summary before detail** — Queue rows: `primary_state` + ratio only; full gaps on drawer open.
4. **Config fingerprint** — Skip re-eval when record unchanged + fingerprint match (request scope).
5. **No N+1 plugins** — Single orchestrator pass.
6. **Defer org-wide eval** — Dashboards use events/aggregates (Phase 3+), not live scan.

### 8.2 Scale scenarios

| Scenario | Phase 1 approach | Future |
|----------|------------------|--------|
| Single drawer open | 1 eval, request cached | Same |
| Action preflight | 1 live eval | Same |
| Queue 50 rows | **No full eval** — optional stale hint P2 | Batch summary eval service |
| Dashboard 10k records | Out of scope P1 | Event aggregates |
| Config save | No invalidation needed (record eval) | Fingerprint change invalidates hints |

### 8.3 Anti-patterns

| Anti-pattern | Impact |
|--------------|--------|
| Full `gaps[]` for every queue row | O(rows × rules × children) — prohibitive |
| Eval on every keystroke in drawer | Debounce; re-eval on save/PATCH only |
| Background eval job as gate truth | Race with operator action |
| BOS triggers full re-eval per token | Attach snapshot at request start |
| Cross-org scan in request path | Reporting job only |

### 8.4 Architectural constraints

- Readiness Engine runs **server-side only**.
- Phase 1 queue surfaces **must not** block queue reveal on readiness eval (AdminV2 performance doctrine).
- Readiness eval **must not** add sequential DB round-trips beyond existing drawer bootstrap budget — extend snapshot loader, don't duplicate fetches.

---

## 9. Phase 1 implementation blueprint

### 9.1 Scope lock

| In scope | Out of scope |
|----------|--------------|
| Record scope | Packet, relationship, freshness |
| Enforcement levels (Recommended / Required / Enforced) | Tasks, NA, automations |
| Readiness states | Readiness events |
| Stage Required Information rules | Durable snapshots |
| Triggers: `record_view`, `action_execute`, `form_submit`, `form_coverage` | Queue batch readiness |
| Lifecycle progression display | BOS readiness_explain capability |

### 9.2 Backend changes (high level)

| Area | Change |
|------|--------|
| **Types** | Add `ReadinessResult`, `ReadinessGap`, `ReadinessEvalInput` in `web/lib/completion/readinessTypes.ts` |
| **Orchestrator** | `evaluateOperationalReadiness()` wrapping `evaluateEffectiveRequirements` |
| **Mapper** | `EffectiveRequirementsResult` → `ReadinessResult` for backward compatibility |
| **Plugin** | Refactor `lifecycleFieldRuleEvaluator` to level-aware; enforceable flag unified |
| **Config** | Persist `{ rule_id, level }` per stage in metadata (JSON only — no migration) |
| **Resolver** | `effectiveRequirementsForReadiness()` with `config_fingerprint` |
| **Preflight** | Route through orchestrator; return `ReadinessResult` in action preflight payload |
| **Forms** | Align submit validator output to `ReadinessResult` shape |
| **Tests** | Contract tests: level → state → blocking; trigger matrix; parity preflight/forms/drawer |

### 9.3 Lifecycle Builder changes (high level)

| Area | Change |
|------|--------|
| **Required Information UI** | Three-level control (Recommended / Required / Enforced) where enforceable |
| **Save stage** | Persist level map via existing unified save |
| **Palette** | Show enforceable badge — no `(config only)` |
| **Ready check** | Optional informational: "N rules configured as enforced" — config only |

**No new builder sections.** No NA/Tasks/Orchestration.

### 9.4 Runtime changes (high level)

| Area | Change |
|------|--------|
| **Drawer bootstrap** | Attach `readiness: ReadinessResult` for `record_view` |
| **Progression checklist** | Derive from `counts` + `gaps` — deprecate object-label-only path |
| **Action preflight** | Surface `primary_state: blocked` + blocking gaps |
| **Queue rows** | **No change Phase 1** — avoid performance regression |

### 9.5 Forms changes (high level)

| Area | Change |
|------|--------|
| **Coverage evaluator** | Map to shared `ReadinessResult` for `form_coverage` |
| **Submit gate** | Block on Enforced gaps only; return `ReadinessResult` internally |
| **Form Detail UI** | Level-aware coverage labels (Enforced vs Required) |

### 9.6 Phase 1 exit criteria

- [ ] Single orchestrator returns `ReadinessResult` for record_view + action_execute + form_submit
- [ ] Enforced level blocks preflight and form submit consistently
- [ ] Required level shows in drawer but does not block actions
- [ ] Recommended level shows as Warning state only
- [ ] Builder saves levels; runtime matches config
- [ ] No new tables; metadata JSON only
- [ ] No readiness events emitted
- [ ] Tests: contract version, trigger matrix, level semantics
- [ ] `npx tsc --noEmit` clean; focused test suite green

### 9.7 Suggested implementation sequence

1. Types + mapper + level metadata persistence
2. Level-aware field rule evaluator plugin
3. Orchestrator + preflight integration
4. Forms adapter alignment
5. Builder UI levels
6. Drawer progression attachment
7. Tests + documentation update

---

## 10. Key decisions

| # | Decision |
|---|----------|
| 1 | Readiness Engine extends `evaluateEffectiveRequirements` — no parallel engine |
| 2 | `ReadinessResult` is gap-first with `primary_state` — score optional derived metric only |
| 3 | Evaluation is **hybrid live** — always fresh on gates; request cache on reads |
| 4 | Storage Phase 1: **no durable snapshots**; events Phase 3; hints Phase 2 optional |
| 5 | Events are **per-requirement transitions** — not aggregate "became ready" |
| 6 | Consumers **request** on gates; **subscribe** later; **never** own truth |
| 7 | Queue full eval deferred Phase 2 — performance doctrine |
| 8 | Ready check stays config path — separate from record Readiness Engine |
| 9 | Phase 1 scope: record + levels + states + lifecycle stage rules only |

---

## 11. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration shim complexity (`EffectiveRequirementsResult` + `ReadinessResult`) | Medium | `legacy` field; single mapper; deprecate on consumer migration |
| Level metadata migration for existing depts | Medium | Derive from current required/recommended + binding enforceable |
| Performance regression on drawer bootstrap | Medium | Request cache; share snapshot loader |
| Queue eval scope creep in Phase 1 | High | Explicitly defer; code review gate |
| Event duplication on bulk PATCH | Medium | Phase 3 — compare before/after; debounce |
| Custom org fields still non-enforceable | Low | Document; Phase 4 binding work |
| AdminV2 reveal if readiness blocks drawer | High | Readiness must not gate drawer reveal — display only |

---

## 12. Open questions (sign-off before Phase 1 coding)

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Persist `{ rule_id, level }[]` vs keep dual arrays + infer enforced | **Persist level map** — explicit config |
| 2 | Expose `ReadinessResult` on drawer bootstrap vs separate fetch | **Bootstrap attach** — one round trip |
| 3 | Module-level 30s cache for drawer | **Request cache only Phase 1** — add module cache if needed |
| 4 | `ok` vs `primary_state !== 'blocked'` for action gate | **`ok`** = no blocking gaps for trigger |
| 5 | Include `satisfied[]` in v1 contract | **Defer** — counts sufficient Phase 1 |
| 6 | Rename `evaluateOperationalReadiness` vs keep `evaluateEffectiveRequirements` export | **New name internally**; re-export alias for compatibility |

---

## 13. Implementation readiness verdict

| Criterion | Ready? |
|-----------|--------|
| Framework approved | Yes |
| Runtime contract defined | Yes |
| Evaluation architecture chosen | Yes |
| Storage/events phased | Yes |
| Consumer doctrine clear | Yes |
| Phase 1 scope bounded | Yes |
| Performance constraints documented | Yes |
| No terminology redesign | Yes |
| Open questions limited and actionable | Yes — §12 |

**Recommendation:** **Alloy is ready to implement Readiness Phase 1** after §12 sign-off (estimated: single review session). Begin with types + level persistence + evaluator plugin; ship behind no feature flag (behavior alignment with enforcement levels).

---

## Appendix A — Document map

| Topic | Primary doc |
|-------|-------------|
| Vocabulary, states, consumption doctrine | `required_information_v2_operational_readiness_framework.md` |
| Runtime contract, engine architecture | **This document** |
| Builder UX, Save stage | `lifecycle_builder_hardening_closeout.md` |
| Forms coverage | `completed/forms_lifecycle_requirement_coverage.md` |

## Appendix B — Phase roadmap cross-reference

| Phase | Engine capability | This doc section |
|-------|-------------------|------------------|
| 1 | Record scope, levels, states, live eval | §9 |
| 2 | UI surfaces, hints, satisfied list | §7, §4.2 |
| 3 | Events, NA consumption | §5, §6 |
| 4 | Relationship, transitions | §3.1, §1.4 |
| 5 | Packet, freshness | §1.4, §4 |

---

*End of Readiness Engine architecture — Phase 1 implementation may proceed after §12 sign-off.*
