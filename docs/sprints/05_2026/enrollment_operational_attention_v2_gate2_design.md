# GATE 2 — Enrollment operational attention V2 (design package)

**Companion to:** [`enrollment_operational_attention_v2_sprint.md`](./enrollment_operational_attention_v2_sprint.md)  
**Status:** Draft for human approval — **no implementation** until sign-off.  
**Checklist:** Cards **D1–D9** mapped to sections below.

---

## Table of contents

1. [Canonical Attention V2 architecture](#1-canonical-attention-v2-architecture)  
2. [Reason taxonomy V2](#2-reason-taxonomy-v2)  
3. [Waiting-state model](#3-waiting-state-model)  
4. [SLA semantics](#4-sla-semantics)  
5. [Severity / priority scoring model](#5-severity--priority-scoring-model)  
6. [Multi-reason payload contract](#6-multi-reason-payload-contract)  
7. [Explainability contract](#7-explainability-contract)  
8. [Cohort / surface contract](#8-cohort--surface-contract)  
9. [Config governance model](#9-config-governance-model)  
10. [Event-readiness model](#10-event-readiness-model)  
11. [Operator cognitive load / signal management](#11-operator-cognitive-load--signal-management)  
12. [UI/UX queue and drawer examples](#12-uiux-queue-and-drawer-behavior-examples)  
13. [AI overlay boundaries](#13-ai-overlay-boundaries)  
14. [Example resolver payloads](#14-example-resolver-payloads)  
15. [Example operator workflows](#15-example-operator-workflows)  
16. [Proposed GATE 3 implementation sequencing](#16-proposed-gate-3-implementation-sequencing)  
17. [Risks, tradeoffs, migration, performance](#17-risks-tradeoffs-migration-performance)

---

## Hard constraints (design invariants)

| Constraint | Design implication |
|------------|-------------------|
| **Single attention engine** | One resolver entry point (`resolveOpportunityAttention` family); **resolver_version** increments; QueueService, standalone APIs, workspace builders **call** it — no parallel evaluator in UI. |
| **Resolver-first** | All membership, reasons, waiting facets, and scores are **computed inside** the resolver (or pure functions it calls in the same module graph). |
| **Queue truth boundary** | **Declarative queues** (`queue_definition`) answer “which bucket is this row in?” **Attention** answers “what operational signals apply?” The **`needs_attention`** pseudo-queue membership remains **resolver-driven**, not reimplemented with ad hoc filters. |
| **QueueService / resolver parity** | Same resolver inputs (row snapshot + defs + config + `nowMs` + optional signals) produce the same outputs for the same opportunity — **caps affect cohort listing only**, not per-row truth. |
| **Attention ≠ tasks** | No task CRUD inside resolver; optional future **inputs** may reference due dates / commitments already on the row or metadata. |
| **AI non-authoritative** | AI may not add/remove attention reasons or change membership; it may only **annotate** an overlay channel (see §13). |
| **Deterministic** | Same inputs → same outputs; no randomness; stable ordering. |

---

## 1. Canonical Attention V2 architecture

### 1.1 Layered pipeline (conceptual)

All stages are **pure** (no I/O) inside the resolver except where the caller passes pre-fetched rows (QueueService already does this).

```
Inputs (normalized snapshot + context)
    → Fact extraction (timestamps, money, status, metadata keys, optional signals)
    → Trigger evaluation (platform-owned rules; emits candidate “triggers”)
    → Waiting / blocked facet resolution (orthogonal; may suppress or modulate triggers per policy)
    → Reason consolidation (dedupe, dependency rules)
    → Severity assignment (per reason; platform defaults + config overrides)
    → Priority score composition (deterministic; explainable breakdown)
    → Primary selection (stable tie-break)
    → Explainability bundle assembly
    → Output DTO (needs_attention, reasons[], primary_reason, waiting, scoring, explainability, resolver_version, semantics_refs)
```

### 1.2 Components (ownership)

| Component | Owner | Notes |
|-----------|--------|------|
| **Trigger catalog** | Platform | Codes, default severity bands, SLA families, templates — versioned with `resolver_version`. |
| **Rule bodies** | Platform | What constitutes each trigger — **not** user-scriptable. |
| **Tuning parameters** | Org / work unit / department (governed config) | Thresholds, weights caps, enable/disable per **known** codes, escalation windows. |
| **Cohort / caps** | Call site (QueueService, APIs) | **Not** inside resolver — resolver is per-row. Callers attach `AttentionSurfaceSemantics` separately (see §8). |
| **AI overlay** | Separate channel | Post-resolver attachment only (§13). |

### 1.3 Versioning

- **`resolver_version`**: integer bump when taxonomy or composition semantics change materially.
- **`attention_config_version`**: optional hash or semver in config payload for audit (“evaluated with policy X”).
- **Backward compatibility:** v1 reason codes remain valid **aliases** mapped into v2 taxonomy for one migration period (see §17).

### 1.4 Demo / seed isolation

- **Remove** `demo_seed_package === enrollment_pipeline_demo_v2` branching from **canonical** identity triggers.
- **Identity:** deterministic rule — e.g. require `customer_id` and (`primary_person_id` **or** `primary_contact_id` for legacy rows). Seeds must populate fixtures accordingly.
- Demo-only behaviors live in **seed scripts**, **test adapters**, or **row fixtures**, not in production resolver branches.

---

## 2. Reason taxonomy V2

### 2.1 Design goals

- Stable **`reason_code`** strings (snake_case, namespaced where needed).
- **Families** group UX and SLA policy without exposing families as user-editable logic.
- **Continuity** with v1: existing codes remain valid; new codes extend waiting/blocked and richer explainability.

### 2.2 Families (platform-owned)

| Family | Operator intent | Examples (non-exhaustive) |
|--------|------------------|---------------------------|
| `commitment` | A date or promise was missed | Follow-up datetime passed; tour date passed |
| `funnel_stale` | Funnel position is aging vs expectation | High-value stale; mid-funnel stale |
| `lifecycle_stale` | Lifecycle stage vs touch recency | New inquiry stale; qualified stale; quote follow-up stale; missing quote after execution |
| `data_gap` | Required enrollment identity/commercial data missing | Missing customer/contact identity |
| `waiting` | Pipeline paused pending a **specific party** or artifact | Family, staff, documents, payment |
| `blocked` | Progress cannot continue without resolution | Internal process; external dependency |
| `opportunity` (Tier 2/3) | Positive motion / upside (optional later) | High conversion likelihood signals — **off by default** until data exists |

### 2.3 Code table (V2 canonical)

**Carried forward from v1 (codes unchanged for continuity):**

| `reason_code` | Family | Notes |
|---------------|--------|------|
| `follow_up_date_passed` | commitment | `metadata.next_follow_up_at` vs now |
| `tour_date_passed` | commitment | Tour date in metadata vs calendar policy |
| `high_value_stale` | funnel_stale | Status set + recency |
| `mid_funnel_stale` | funnel_stale | Mid-funnel status set + recency |
| `missing_identity` | data_gap | Customer / person / legacy contact rule (no demo branching) |
| `stale_new_inquiry` | lifecycle_stale | Stage + hours |
| `stale_qualified` | lifecycle_stale | Stage + hours |
| `missing_quote_after_execution` | lifecycle_stale | Stage + hours |
| `stale_quote_followup` | lifecycle_stale | Stage + hours |

**New V2 codes (waiting / blocked — minimum set):**

| `reason_code` | Family | Intended meaning |
|---------------|--------|------------------|
| `waiting_on_family` | waiting | Next action is on the family (response, decision, attendance) |
| `waiting_on_staff` | waiting | Staff owes an action (call, tour confirmation, follow-up) |
| `waiting_on_documents` | waiting | Enrollment packet / verification docs outstanding |
| `waiting_on_payment` | waiting | Deposit/tuition payment outstanding |
| `blocked_internal` | blocked | Internal blocker (policy, capacity, manual hold) |
| `blocked_external` | blocked | External dependency (vendor, agency, landlord, etc.) |

**Reserved (future; not required for GATE 3 MVP):**

- `activity_stale_communication`, `activity_stale_meaningful_engagement` — only after signal pipeline exists (GATE 1 direction).

### 2.4 Primary reason selection (deterministic)

Given consolidated reasons `R` after policies applied:

1. **Sort key** = `(family_priority, reason_priority, severity_rank, code)`  
   - Platform defines fixed **`family_priority`** (e.g. `blocked` > `commitment` > `data_gap` > `waiting` > `lifecycle_stale` > `funnel_stale` — exact order is a **product decision** to finalize at build; document default below).  
   - **`reason_priority`** = integer in catalog (lower = higher precedence).  
   - **`severity_rank`** = critical > high > medium > low (numeric mapping).  
   - **`code`** = lexicographic tie-break.

2. **`primary_reason`** = first element after sort.

**Default `family_priority` (proposal — approve or reorder):**  
`blocked` → `commitment` → `data_gap` → `lifecycle_stale` → `funnel_stale` → `waiting` → `opportunity`

*Rationale:* blockers and missed commitments usually beat “waiting” for “what do I fix first”; waiting is still visible in full list.

### 2.5 Interaction: waiting vs stale

- **Both may fire.** Explainability must show **both**.  
- **Optional composition rule (configurable, bounded):** When `waiting_on_family` is active, **suppress** or **downgrade** selected stale triggers **only if** policy says “family wait pauses stale clock” — default **do not suppress** in V2.1 to avoid hiding risk; prefer **SLA differentiation** (§4) over hiding stale.

---

## 3. Waiting-state model

### 3.1 Definition

**Waiting** is an operational facet: “progress is intentionally paused pending X.” It is **not** another pipeline stage and **not** a queue replacement.

### 3.2 Canonical `wait_bucket` (enum)

Aligns with reason codes but stored as structured facet for SLA and UI:

```text
none | waiting_on_family | waiting_on_staff | waiting_on_documents | waiting_on_payment | blocked_internal | blocked_external
```

### 3.3 Inputs (GATE 3 implementation options — design choice)

**Phase A (recommended for GATE 3):** Normalized read from **validated metadata** subtree, e.g. `metadata.enrollment_operational` (name TBD), schema:

```json
{
  "wait_bucket": "waiting_on_family",
  "wait_since": "2026-05-01T12:00:00.000Z",
  "blocked_code": null,
  "notes": "optional operator note id ref — not parsed by resolver"
}
```

- **`wait_since`:** optional; if absent, resolver falls back to **`updated_at`** or status-change timestamp **if available in snapshot** (future: pass `last_status_changed_at` when materialized).  
- Invalid shapes → **ignored** (`wait_bucket` treated as `none`); do not throw at runtime.

**Phase B (later):** First-class columns or event-sourced “entered wait” for authoritative clocks — **not** required for GATE 3 if metadata contract is validated at write time by APIs.

### 3.4 Mapping bucket → reasons

| `wait_bucket` | Emits `reason_code` |
|---------------|---------------------|
| `waiting_on_family` | `waiting_on_family` |
| `waiting_on_staff` | `waiting_on_staff` |
| `waiting_on_documents` | `waiting_on_documents` |
| `waiting_on_payment` | `waiting_on_payment` |
| `blocked_internal` | `blocked_internal` |
| `blocked_external` | `blocked_external` |
| `none` | (none from waiting family) |

### 3.5 Consistency with `status_key`

- **No automatic inference** from status alone in V2.1 (too many tenant variants).  
- **Optional later:** platform **hints** table mapping `(status_key → suggested default wait_bucket)` as **UI defaults only**, not resolver overrides — unless product explicitly approves inference.

### 3.6 State transitions (operational narrative)

- Operator or workflow sets/clears `wait_bucket` when reality changes.  
- Leaving wait (`none`) **does not** clear stale/commitment reasons — those re-evaluate independently.  
- **Attention cleared** only when **no reasons** remain after policies (same as today conceptually).

---

## 4. SLA semantics

### 4.1 SLA is not membership

- **SLA** informs **severity**, **priority score**, **escalation flags**, and **explainability**.  
- **Membership** (`needs_attention`): row has **≥1** enabled reason after policies (unchanged concept).  
- **Exception:** optional future **`visibility_floor`** (config) could hide low-priority signals in **command center** only — **not** in execution queue without explicit approval (risk: hidden risk).

### 4.2 Clock types (platform)

| Clock id | Source | Used for |
|----------|--------|----------|
| `now_vs_commitment` | `next_follow_up_at`, tour date | commitment reasons |
| `age_since_last_touch` | `updated_at` / `created_at` fallback | stale families |
| `age_in_stage` | Same touch proxy + lifecycle stage | lifecycle stale |
| `wait_duration` | `wait_since` or fallback | waiting/blocked families |

### 4.3 SLA tiers per family / bucket (configurable bands)

Org config supplies **hours/days thresholds** per `{reason_code or wait_bucket} × tier`:

| Tier | Operator meaning |
|------|------------------|
| `ok` | Within expected window |
| `approaching` | Inside warning window |
| `breached` | Past due |
| `escalated` | Past escalation threshold |

**Example policy table (illustrative defaults — tune via config):**

| Context | approaching | breached | escalated |
|---------|-------------|----------|-----------|
| `waiting_on_family` | 48h | 96h | 168h |
| `waiting_on_staff` | 24h | 48h | 72h |
| `waiting_on_documents` | 72h | 168h | 336h |
| `waiting_on_payment` | 24h | 72h | 168h |
| `blocked_internal` | 24h | 72h | 168h |
| `blocked_external` | 72h | 168h | 336h |
| `follow_up_date_passed` | immediate breach | — | configurable escalation from first observation |
| Generic funnel stale | N/A (reason itself is stale) | — | tie to existing stale days |

### 4.4 Differentiation example (product requirement)

> Waiting on family for 2 days ≠ waiting on staff for 2 days.

- Same elapsed time maps to **`ok`** for family vs **`approaching`** for staff using **bucket-specific bands**.  
- Explainability string surfaces: “Staff wait: approaching SLA (48h policy)” vs “Family wait: within policy.”

### 4.5 Escalation (design-level)

- **`escalation_rungs`** in config: optional labels only in V2 (e.g. “Director notify”).  
- **Events** (`escalation_triggered`) fire when crossing **escalated** boundary **once per crossing** — implementation uses dedupe keys (§10).

---

## 5. Severity / priority scoring model

### 5.1 Severity (per reason)

- Enum: `critical | high | medium | low`.  
- **Defaults** per `reason_code` in platform catalog.  
- **Org overrides** via governed config (`severity` patch per code) — same shape as today’s `reason_overrides`, extended to new codes.

### 5.2 Priority score (deterministic composite)

**Range:** integer **0–100** (clamped), higher = more urgent.

**Dimensions (each 0–100 after normalization):**

| Dimension | Weight (default sum = 100) | Notes |
|-----------|---------------------------|------|
| `severity_component` | 35 | Map severity → base score |
| `sla_component` | 30 | From tier: ok < approaching < breached < escalated |
| `value_component` | 15 | Enrollment monetary signals if present (cap influence) |
| `multi_reason_boost` | 10 | +bonus for independent families present (capped) |
| `commitment_immediacy` | 10 | Missed calendar commitments boost |

**Weights** are **org-tunable within caps** (e.g. ±10 points per dimension max deviation from default) to avoid config explosion.

### 5.3 Explainability for score

Always emit **`priority_breakdown`** array: `{ dimension, points_contributed, inputs_snapshot }` (see §6–7).

### 5.4 Queue ordering

- Default list sort for attention queue: **`priority_score` DESC**, then **`primary_reason` sort key**, then **`updated_at`**.  
- Call sites may pass alternate sort **only if** they preserve **resolver outputs** attached to row (no re-sort that hides score).

---

## 6. Multi-reason payload contract

### 6.1 Top-level result shape (typescript sketch)

```ts
type AttentionResolverResultV2 = {
  needs_attention: boolean;
  reasons: AttentionReasonInstance[];
  primary_reason: AttentionReasonInstance | null;
  waiting: WaitingFacetV2;
  priority_score: number; // 0-100
  priority_breakdown: PriorityDimensionContribution[];
  explainability: ExplainabilityBundleV2;
  auxiliary: { activity_stale: ... | null }; // preserved; semantics unchanged until signals land
  resolver_version: number;
  computed_at_iso: string;
  config_digest?: string; // optional short hash of effective policy
};
```

### 6.2 `AttentionReasonInstance`

```ts
type AttentionReasonInstance = {
  reason_code: string;           // stable
  family: AttentionFamilyV2;
  severity: "critical" | "high" | "medium" | "low";
  sla: {
    clock: ClockId;
    tier: "ok" | "approaching" | "breached" | "escalated";
    due_at_iso?: string | null;
    elapsed_ms?: number | null;
  };
  facts: Record<string, string | number | boolean | null>; // structured evidence
  template_key: string;        // maps to copy template
  label: string;               // resolved display label (config override allowed)
};
```

### 6.3 `WaitingFacetV2`

```ts
type WaitingFacetV2 = {
  bucket: WaitBucketV2; // includes `none`
  since_iso?: string | null;
  active: boolean; // true iff bucket !== none
};
```

### 6.4 Policy application

- Config may **disable** specific `reason_code`s (`enabled: false`).  
- Disabled reasons **omit** from `reasons` entirely (not hidden-but-present) for clarity.

---

## 7. Explainability contract

### 7.1 Principles

Every **`AttentionReasonInstance`** must answer:

- **Why triggered:** `facts` + `template_key`  
- **Why this severity:** catalog default + override pointer  
- **Why this SLA tier:** thresholds effective + clock used  
- **What changed:** deferred to **events** + drawer timeline (not resolver-only); resolver may include `snapshot_refs` (ids only)

### 7.2 `ExplainabilityBundleV2`

```ts
type ExplainabilityBundleV2 = {
  summary_lines: string[];          // 1–3 short lines for cards
  detail_markdown?: string | null; // optional longer; server-built from templates only
  next_actions: NextActionHint[];   // deterministic hints
};

type NextActionHint = {
  hint_key: string;                 // e.g. "call_family", "collect_documents"
  label: string;
  priority: number;
};
```

### 7.3 Template safety

- Templates are **platform-owned** string patterns with **parameter substitution** from `facts` only — **no** arbitrary HTML from config.

### 7.4 Primary vs full list

- **Cards / strips:** `summary_lines` + `primary_reason`.  
- **Drawer / inspector:** full `reasons[]` + `priority_breakdown` + waiting facet.

---

## 8. Cohort / surface contract

### 8.1 Surfaces (preserved, clarified)

| Surface id | Cohort | Typical cap | Intent |
|------------|--------|-------------|--------|
| `wu_execution_queue` | `work_unit_id = W` | 800 / 5000 modes | Operator’s **execution** inbox |
| `org_command_center` | org (+ access scope), not WU-filtered | 500 window today | **Roll-up** / preview |
| `dept_preview` | same as command center | 500 | Department landing |
| `dept_kpi_sum` | sum over WU summaries | per-WU cap | Trend/breadcrumb — **not** execution |

### 8.2 Payload: `AttentionSurfaceSemantics` (caller-attached)

Callers **must** include:

```ts
type AttentionSurfaceSemantics = {
  surface_id: string;
  cohort: "work_unit" | "org" | "dept_preview" | "other";
  cohort_filters_summary: string; // human-readable for UI subtitle
  fetch_cap: number;
  raw_candidates_fetched: number;
  saturated: boolean;
};
```

### 8.3 UX copy rules

- Never label two surfaces with the same metric name without **cohort qualifier**.  
- Recommended labels: **“Needs attention (this site queue)”** vs **“Needs attention (org snapshot)”**.

### 8.4 Deep links

- Query params use **`attention_reason_code`** (stable), not label.  
- Legacy **`attention_reason=` label** → supported via redirect map **one release** then deprecate.

---

## 9. Config governance model

### 9.1 Layers

| Layer | Content | Editing |
|-------|---------|---------|
| **Platform catalog** | Codes, families, default severities, template keys, SLA family assignment | Code release |
| **Org policy** | Thresholds, weights (capped), per-code enables, label overrides | Admin UI or RPC (future) |
| **Scoped policy** | Department / work unit overrides | Same mechanism, precedence: WU > dept > org |

### 9.2 Short-term (GATE 3)

- Continue **metadata** embedding **`opportunity_attention_rules`** but add **strict JSON schema validation** on write paths that touch metadata (admin APIs or migration script).  
- **Preview endpoint** (design): `POST …/attention-policy/preview` with sample opportunity ids → returns resolver output diff vs current — **GATE 3 or early post**.

### 9.3 Medium-term

- Dedicated table **`attention_policies`** (org_id, scope_type, scope_id, version, json, updated_at) with **optimistic locking** — mirrors agent RPC patterns conceptually (`docs/product/bos-foundation.md`).  
- AI/agent applies policy **only** through validated apply RPC — **no** raw table patches.

### 9.4 Resolver-only evaluation

- **Forbidden:** duplicating trigger logic in React components or QueueService beyond OR-based **candidate prefilter** for performance (existing pattern).  
- Prefilter **must** be a conservative superset; row-level truth is resolver.

---

## 10. Event-readiness model

### 10.1 Philosophy

**Design now, emit incrementally.** Avoid full materialization until load warrants it.

### 10.2 Event types

| Event type | When (conceptual) | Dedupe key suggestion |
|------------|-------------------|----------------------|
| `attention_entered` | `needs_attention` false→true | `(org_id, opportunity_id, resolver_version, day_bucket)` + hash(reason_codes) |
| `attention_cleared` | true→false | same |
| `attention_reason_added` | new code appears | `(org_id, opportunity_id, reason_code)` |
| `attention_reason_removed` | code disappears | same |
| `attention_severity_changed` | any reason’s severity changes | `(org_id, opportunity_id, reason_code, new_severity)` |
| `attention_sla_breached` | tier crosses to breached | `(org_id, opportunity_id, reason_code, tier_transition)` |
| `attention_escalation_triggered` | tier crosses to escalated | `(org_id, opportunity_id, reason_code)` |

*Naming:* align with existing `workflow_events` conventions (`snake_case` payload keys).

### 10.3 Payload sketch

```json
{
  "event_type": "attention_sla_breached",
  "entity_type": "opportunities",
  "entity_id": "…",
  "occurred_at": "…",
  "payload": {
    "resolver_version": 2,
    "reason_code": "waiting_on_staff",
    "previous_tier": "approaching",
    "new_tier": "breached",
    "priority_score": 82,
    "snapshot": { "wait_bucket": "waiting_on_staff", "status_key": "contacted" }
  }
}
```

### 10.4 Who computes transitions?

- **Phase 1:** Async worker or **post-write hook** compares **previous cached snapshot** vs new resolver output (requires lightweight storage — see §17).  
- **Phase 2:** Infrequent batch reconciliation job.  
- **Not Phase 1:** synchronous DB triggers inside hot read path.

### 10.5 Idempotency

- Emitters **must** consult dedupe store or **compare tier** before insert.  
- Workflow runners follow existing `executeWorkflowRun` patterns (`emitStatusChangedEvent` style).

---

## 11. Operator cognitive load / signal management

### 11.1 Progressive disclosure

| Level | UI | Signals shown |
|-------|-----|----------------|
| L0 | List row chrome | Primary badge + score dot / urgency icon |
| L1 | Row expanded / tooltip | Top 2 reasons + SLA worst tier |
| L2 | Drawer attention panel | Full reasons, breakdown, waiting facet, next actions |
| L3 | Power mode / export | Full JSON for admins |

### 11.2 Caps on noise

- **Max badges visible on row:** 2 (primary + one icon for “+N”).  
- **Suppress duplicate copy** when `summary_lines` overlap.

### 11.3 Color / severity grammar

- Reuse visual context system where possible (`needs_attention` lane — strong amber per existing doctrine).  
- **Do not** map `critical` to alarm red everywhere — reserve for true compliance/risk if product dictates.

### 11.4 “Signal debt” management

- Operators should trust that **command center** numbers are **explicitly** snapshots, not incomplete promises (saturation chip).

---

## 12. UI/UX queue and drawer behavior examples

### 12.1 Work-unit execution queue tab

- **Header:** “Needs attention — this enrollment queue” + saturation chip if applicable.  
- **Sort:** default priority score.  
- **Row:** family name, stage, **primary badge**, “+2 more” link.  
- **Filter chips:** `reason_code` multi-select + `wait_bucket` quick filters.  
- **Empty state:** differentiate “no attention” vs “snapshot empty due to cap” (if saturated).

### 12.2 Enrollment department landing (command center)

- **Subtitle:** “Org-wide snapshot (first 500 updated)” — non-comparable disclaimer.  
- **Grouped lane:** group headers by **primary_reason**; secondary reasons in tooltip.

### 12.3 Opportunity drawer

- **Attention panel** at top (collapsible):  
  - Primary summary line  
  - Waiting facet chip (“Waiting on family · 3d · within policy”)  
  - Expand: full table of reasons (code, label, SLA tier, severity)  
  - **Next actions** bullets (deterministic)  
  - Future: AI suggestion block **below** with labeled boundary

### 12.4 Deep link

- `...?attention_reason_code=waiting_on_staff` opens drawer scrolled to attention panel with filter applied.

---

## 13. AI overlay boundaries

| Allowed | Forbidden |
|---------|-----------|
| Suggest **next action** copy using resolver JSON as **input context** | Change `needs_attention` or alter `reasons[]` |
| Rank **which record** user should open first **inside a client-only sort** (explicit “AI sort”) | Mutate `priority_score` from server canonical payload |
| Detect **anomalies** for analytics | Introduce new `reason_code` without platform release |
| Summarize multi-reason for readability | Imply SLA tier without citing deterministic tier |

**Contract:** Server returns `ai_hint_eligible: true` + redacted bundle when org opts in; AI responses **must** display **“Advisory — does not change CRM logic”** disclaimer.

---

## 14. Example resolver payloads

### 14.1 Multi-reason + waiting (staff SLA approaching)

```json
{
  "needs_attention": true,
  "resolver_version": 2,
  "computed_at_iso": "2026-05-06T18:00:00.000Z",
  "waiting": {
    "bucket": "waiting_on_staff",
    "since_iso": "2026-05-04T10:00:00.000Z",
    "active": true
  },
  "reasons": [
    {
      "reason_code": "waiting_on_staff",
      "family": "waiting",
      "severity": "high",
      "sla": {
        "clock": "wait_duration",
        "tier": "approaching",
        "elapsed_ms": 176400000,
        "due_at_iso": null
      },
      "facts": {
        "wait_bucket": "waiting_on_staff",
        "hours_elapsed": 49
      },
      "template_key": "waiting.staff.approaching",
      "label": "Waiting on staff follow-up"
    },
    {
      "reason_code": "mid_funnel_stale",
      "family": "funnel_stale",
      "severity": "medium",
      "sla": {
        "clock": "age_since_last_touch",
        "tier": "breached",
        "elapsed_ms": 691200000,
        "due_at_iso": null
      },
      "facts": {
        "status_key": "contacted",
        "stale_days_threshold": 7
      },
      "template_key": "funnel_stale.mid.contact",
      "label": "Stale > 7 days in mid-funnel"
    }
  ],
  "primary_reason": {
    "reason_code": "waiting_on_staff",
    "family": "waiting",
    "severity": "high",
    "sla": { "clock": "wait_duration", "tier": "approaching", "elapsed_ms": 176400000, "due_at_iso": null },
    "facts": { "wait_bucket": "waiting_on_staff", "hours_elapsed": 49 },
    "template_key": "waiting.staff.approaching",
    "label": "Waiting on staff follow-up"
  },
  "priority_score": 84,
  "priority_breakdown": [
    { "dimension": "severity_component", "points_contributed": 28, "inputs_snapshot": { "severity": "high" } },
    { "dimension": "sla_component", "points_contributed": 27, "inputs_snapshot": { "tier": "approaching", "bucket": "waiting_on_staff" } },
    { "dimension": "value_component", "points_contributed": 10, "inputs_snapshot": { "monetary_value_cents": 420000 } },
    { "dimension": "multi_reason_boost", "points_contributed": 10, "inputs_snapshot": { "distinct_families": 2 } },
    { "dimension": "commitment_immediacy", "points_contributed": 9, "inputs_snapshot": { "missed_commitment": false } }
  ],
  "explainability": {
    "summary_lines": [
      "Staff owes a follow-up — SLA warning window (49h).",
      "Mid-funnel touch is older than 7 days."
    ],
    "detail_markdown": null,
    "next_actions": [
      { "hint_key": "staff_call_family", "label": "Complete scheduled outreach to family", "priority": 1 },
      { "hint_key": "log_touchpoint", "label": "Log outcome or reschedule follow-up", "priority": 2 }
    ]
  },
  "auxiliary": { "activity_stale": null }
}
```

### 14.2 Commitment + family wait (policy contrast)

```json
{
  "needs_attention": true,
  "resolver_version": 2,
  "waiting": { "bucket": "waiting_on_family", "since_iso": "2026-05-04T18:00:00.000Z", "active": true },
  "reasons": [
    {
      "reason_code": "follow_up_date_passed",
      "family": "commitment",
      "severity": "high",
      "sla": {
        "clock": "now_vs_commitment",
        "tier": "breached",
        "elapsed_ms": null,
        "due_at_iso": null
      },
      "facts": { "next_follow_up_at": "2026-05-03T15:00:00.000Z" },
      "template_key": "commitment.follow_up_missed",
      "label": "Follow-up date passed"
    },
    {
      "reason_code": "waiting_on_family",
      "family": "waiting",
      "severity": "medium",
      "sla": { "clock": "wait_duration", "tier": "ok", "elapsed_ms": 172800000 },
      "facts": { "hours_elapsed": 48 },
      "template_key": "waiting.family.ok",
      "label": "Waiting on family"
    }
  ],
  "primary_reason": {
    "reason_code": "follow_up_date_passed",
    "family": "commitment",
    "severity": "high",
    "sla": { "clock": "now_vs_commitment", "tier": "breached", "elapsed_ms": null, "due_at_iso": null },
    "facts": { "next_follow_up_at": "2026-05-03T15:00:00.000Z" },
    "template_key": "commitment.follow_up_missed",
    "label": "Follow-up date passed"
  },
  "priority_score": 79,
  "explainability": {
    "summary_lines": [
      "Follow-up date passed — commitment breached.",
      "Family wait is within policy — SLA clock uses longer windows."
    ],
    "next_actions": [
      { "hint_key": "reschedule_follow_up", "label": "Set a new follow-up time", "priority": 1 }
    ]
  }
}
```

*(Illustrative — exact points depend on configured weights.)*

---

## 15. Example operator workflows

### 15.1 Morning triage (director)

1. Open **department command center** — reads org snapshot disclaimer.  
2. Sort by priority score; open top record.  
3. Drawer shows **waiting_on_staff** + **mid_funnel_stale** — completes call, clears wait bucket, logs note.  
4. Resolver re-run shows stale possibly clearing after meaningful touch policy (future) or remains until `updated_at`/rules satisfied.

### 15.2 Enrollment specialist (execution queue)

1. Opens **site work unit** attention tab — saturated chip shows.  
2. Filters `reason_code=missing_identity`.  
3. Fixes person link — identity reason clears on next fetch.

### 15.3 Documents chase

1. Sets `wait_bucket=waiting_on_documents` after sending packet.  
2. SLA approaches — **approaching** tier visible; after breach, **escalation** event fires for automation email to director.

---

## 16. Proposed GATE 3 implementation sequencing

Ordered for dependencies and safe rollback.

| Seq | Card | Deliverable |
|-----|------|-------------|
| G3-1 | **Types & catalog** | Shared TS types for V2 result; platform catalog constants (codes, families, default severities, templates). |
| G3-2 | **Metadata schema** | Validated `enrollment_operational` / wait facet writes on opportunity PATCH (optional field); migration guide. |
| G3-3 | **Resolver v2 core** | Extend resolver: waiting reasons, SLA tier computation, multi-reason list, primary selection, **remove demo branching**. |
| G3-4 | **Scoring engine** | Pure function `computeAttentionPriorityScore` + breakdown; config wiring with caps. |
| G3-5 | **Payload parity** | QueueService + `buildOpportunityAttentionQueueItems` return full `reasons[]` + waiting + score (backward-compatible additive fields). |
| G3-6 | **Deep links** | `attention_reason_code` query param + deprecation shim for label-based param. |
| G3-7 | **Tests** | Fixture matrix: multi-reason, waiting buckets, SLA tier edges, primary ordering, parity tests QueueService vs standalone for same row. |
| G3-8 | **Event stubs / comparison helper** | Internal helper comparing two resolver outputs + tier transitions; optional feature-flagged emit behind env. |
| G3-9 | **Docs** | Update `workspace-system.md` (count semantics) + `configuration-system.md` with V2 fields. |

**Deferred (post–GATE 3):** materialized snapshot store, admin policy editor UI, AI overlay endpoint.

---

## 17. Risks, tradeoffs, migration, performance

### 17.1 Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| Metadata wait facet stale / lying | Validate on write; future columns; reconciliation job |
| Too many signals → overwhelm | Progressive disclosure + score ordering |
| Dual SLA stories (commitment vs wait) | Explainability always shows both clocks |
| Config tuning breaks trust | Caps + preview endpoint + versioned policies |

### 17.2 Migration

1. Ship resolver v2 with **additive** JSON fields; clients ignore unknowns.  
2. Map legacy API consumers from `primary_reason` only → gradually adopt `reasons[]`.  
3. Replace label query params with **reason_code** (shim one release).  
4. Remove demo branching immediately in same foundation PR (fixtures updated).  
5. **Taxonomy:** no renames for v1 codes; only additions.

### 17.3 Performance

- Resolver stays **O(1)** per row; scoring is fixed small constant.  
- **Hot path:** avoid extra DB fetches — all inputs on opportunity snapshot or caller-provided defs.  
- **Candidate prefilter:** extend OR expression conservatively for new reasons **only if** cheap predicates exist (e.g. metadata JSON filters may be expensive in Postgres — prefer **`wait_bucket` duplicated into indexed column** if previews lag — **Phase B index decision** after profiling).  
- **Events:** async only; never block read APIs.

---

## GATE 2 checklist (D1–D9)

| Card | Section(s) |
|------|------------|
| **D1** Canonical model & taxonomy | §1, §2, demo isolation §1.4 |
| **D2** Waiting & SLA | §3, §4 |
| **D3** Scoring | §5 |
| **D4** Cohort / surface | §8 |
| **D5** Config governance | §9 |
| **D6** Events | §10 |
| **D7** UI/UX | §11, §12 |
| **D8** AI boundaries | §13 |
| **D9** Exit package | §14–17 + full architecture §1 |

---

## Approval block

- [ ] **Family priority order** for `primary_reason` (§2.4)  
- [ ] **Default SLA band tables** per bucket (§4.3)  
- [ ] **Wait facet source** for GATE 3: metadata-only vs partial column duplication for index  
- [ ] **Suppression rules** between waiting and stale (default: none)  
- [ ] **Visibility floor** for command center (ship or defer)

**Do not implement until sign-off.**
