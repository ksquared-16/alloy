# Needs Attention V2 — Operating Model

**Path:** `docs/sprints/archive/06_2026/needs_attention_v2_operating_model.md`  
**Date:** 2026-06-03  
**Status:** **Operating model frozen — discovery only** (architecture only; no implementation)  
**Scope:** Define Alloy's **operational awareness framework** (risk, opportunity, conflict, and change signals). Not a UI sprint, schema sprint, workflow sprint, or task sprint.

**Canonical inputs (frozen unless major architectural issue):**

- [`completed/lifecycle_builder_hardening_closeout.md`](./completed/lifecycle_builder_hardening_closeout.md)
- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md) (§4 Needs Attention architecture — planning baseline)

**Authority:** This document is the canonical reference for Needs Attention V2 implementation planning. Product copy, resolver extensions, and Lifecycle Builder attention profiles should align with **Human Awareness Doctrine**, **Canonical Responsibilities**, **Task Relationship Doctrine**, and §2–§10 unless an explicit exception is recorded in §11.

---

## Executive summary

**Needs Attention V2** reframes operational attention as Alloy's **human awareness overlay** — a composable framework for answering: *Which records require operator awareness, why, and with what urgency?*

Today, attention logic is **partially unified but fragmented by domain**:

- Opportunity resolver v2 (`resolveOpportunityAttention`) — canonical for CRM enrollment
- Legacy QueueService heuristics (`opportunityNeedsAttention`) — parity path, being superseded
- Configurable buckets (`needs_attention_buckets`) — presentation lenses only
- Job exception types (`NEEDS_ATTENTION_EXCEPTIONS`) — separate home-services grain
- Readiness Phase 1 — **shipped** but **not yet projected** into attention reasons
- BOS — consumes resolver output for explanation; must not define attention truth

V2 **does not invent a parallel exception engine**. It **unifies vocabulary, ownership, category taxonomy, resolution semantics, and consumption patterns** around one attention spine that existing resolver paths compose — with **readiness as a first-class signal source**, not a second evaluator.

| V2 delivers | V2 does not deliver (separate sprints) |
|-------------|----------------------------------------|
| Attention reason framework + categories | Attention tables / migrations |
| Readiness → attention projection doctrine | Task template CRUD |
| Resolution model (auto / manual / workflow-assisted) | Workflow logic implementation |
| Runtime appearance model (dept / WU / drawer) | Lifecycle Builder attention profile UI |
| BOS / task consumption boundaries | Event materialization (`attention_entered`) |
| Phased implementation roadmap | Queue row gate behavior |

**Target architecture (locked):**

```
Lifecycle Builder (future attention profile)
        ↓
Platform reason catalog + resolver (evaluate signals)
        ↑ consumes (does not re-derive)
Readiness Engine → ReadinessResult (gaps, primary_state)
        ↓
AttentionResult { reasons[], primary_reason, categories[], resolution_hints[] }
        ↓
┌───────────┬───────────┬───────────┬───────────┐
│ Workspace │  Drawer   │   BOS     │  Tasks    │
│  lanes    │  strip    │ explain   │ consume   │
└───────────┴───────────┴───────────┴───────────┘
```

**Locked principle:** Needs Attention **consumes** readiness. It **must not** evaluate required information independently.

---

## Human Awareness Doctrine

Needs Attention identifies records that require **human awareness**.

Attention is not limited to operational failures.

Attention exists whenever something important has occurred, failed to occur, or requires human review.

Attention may represent:

### Risk

Something expected did not happen.

Examples:

- Missing required information
- Readiness failures
- SLA breaches
- Overdue follow-ups
- Expired documents

### Opportunity

Something meaningful occurred that may require action.

Examples:

- Parent replied
- Tour completed
- Enrollment packet signed
- New inquiry received

### Conflict

The system has detected inconsistent operational state.

Examples:

- Conflicting statuses
- Sibling lifecycle conflicts
- Invalid record relationships
- Duplicate ownership scenarios

### Awareness

Something changed that operators should know about.

Examples:

- New payment received
- New document uploaded
- Record ownership changed
- Important lifecycle transition completed

**Severity** determines urgency.

**Category** determines intent.

Platform signal taxonomy (§3) and reason codes map onto these four intent categories. A single reason carries one primary intent category plus a severity rank — they are orthogonal dimensions.

---

## Canonical Responsibilities

Needs Attention **surfaces operational facts**.

Needs Attention does **not**:

- Evaluate readiness
- Create tasks
- Execute workflows
- Explain decisions
- Perform prioritization

Needs Attention is a **consumer**, not an owner.

The platform responsibilities are:

| System | Role |
|--------|------|
| **Readiness** | Evaluates |
| **Needs Attention** | Surfaces |
| **Tasks** | Track work |
| **Actions** | Resolve |
| **Workflows** | Automate |
| **BOS** | Explains, prioritizes, and recommends |

---

## Task Relationship Doctrine

Tasks may create attention.

Attention never creates tasks.

Examples:

| Layer | Example |
|-------|---------|
| **Task** | "Contact family" |
| **Attention** | "Contact family overdue" |

The overdue condition creates the attention.

Resolving the task removes the attention.

This prevents circular operational behavior and preserves a clean separation between work tracking and operational awareness.

*(Expanded patterns: §7.)*

---

## Future Direction

The long-term objective is not to identify records that are **broken**.

The objective is to identify records that require **human awareness**.

This allows Needs Attention to evolve into Alloy's operational intelligence layer while remaining separate from Readiness, BOS, Tasks, and Workflow orchestration.

**Today:** Resolver v2 emphasizes **Risk** signals (stale, SLA, missing identity). **Opportunity**, **Awareness**, and richer **Conflict** reasons are framework targets — see §10 Phase 4–6.

---

## 1. Current-state audit

### 1.1 QueueService attention logic

Two evaluation paths exist for opportunity attention. **Resolver v2 is canonical** for enriched queue rows and the `needs_attention` queue lane.

| Path | Location | Role today |
|------|----------|------------|
| **Resolver v2 (canonical)** | `resolveOpportunityAttention` in `web/lib/opportunities/opportunityAttentionResolver.ts` | Single implementation for QueueService enrichment, workspace APIs, entity attach |
| **Legacy in-memory heuristics** | `opportunityNeedsAttention`, `opportunityNeedsAttentionReasonLabel` in `web/lib/queues/QueueService.ts` | Older label strings; overlapping rules (follow-up, tour, stale, missing identity) — **parity target for removal**, not second truth |
| **Needs-attention queue fetch** | `QueueService` when `queue.key === "needs_attention"` | Capped candidate fetch + in-memory filter via resolver; avoids fragile PostgREST OR grammar |
| **Row enrichment** | `enrichOpportunityRows` | Attaches `_needs_attention`, `_attention_reason`, resolver payload fields on **every** opportunity queue list |

**Resolver input collectors (v2):**

| Collector | Source | Codes emitted |
|-----------|--------|---------------|
| `collectQueueLaneCodes` | Record fields + status + metadata | `follow_up_date_passed`, `tour_date_passed`, `overdue_commitment`, `high_value_stale`, `mid_funnel_stale`, `missing_identity` |
| `collectLifecycleCode` | `computeOpportunityAttentionReason` + lifecycle stage | `stale_new_inquiry`, `stale_qualified`, `missing_quote_after_execution`, `stale_quote_followup` |
| `collectWaitingCodesFromEo` | `metadata.enrollment_operational.wait_bucket` | `waiting_on_*`, `blocked_*` |

**Policy layer:** `resolveOpportunityAttentionConfigFromMetadata` merges dept/WU `metadata.opportunity_attention_rules` — thresholds, stale day windows, wait-bucket SLA hours, per-reason enable flags, priority score weights, auxiliary signals.

**Grain:** Opportunity-primary (`opportunities` row). Candidate-grain waitlist rows and job-grain exceptions use **separate** mechanisms (not unified NA v2 yet).

**Readiness integration today:** **None.** Readiness Phase 1 evaluates on drawer bootstrap and action preflight but does **not** feed `resolveOpportunityAttention`. Missing required information does **not** produce an attention reason code.

---

### 1.2 Existing needs-attention lanes

| Surface | Route / mechanism | Behavior |
|---------|-------------------|----------|
| **Department paired lane (right)** | `/adminV2/workspace/dept/:departmentId` | Bucket chips from `needs_attention_buckets`; counts via `buildWorkUnitScopedNeedsAttentionLaneBuckets` on execution WU |
| **Department deep link** | `/adminV2/workspace/dept/:id/needs-attention` | Legacy exception bridge for **jobs** (`AttentionBlock` + `NEEDS_ATTENTION_EXCEPTIONS`) — home-services grain |
| **Work unit NA queue** | `GET …/queues/{workUnitId}/needs_attention` or embedded in `enrollment_pipeline` `queue_definition` | Resolver-filtered opportunity rows; optional `attention_bucket` query param |
| **Work unit bucket chips** | Work-unit page above-fold pills | Enabled buckets from metadata; sub-filter on NA list |
| **Pipeline execution lanes (left)** | `extractPipelineExecutionLanes` | Stage/domain queues — **membership**, not attention; rows may still show attention styling when resolver fires |
| **Builder-owned lifecycle depts** | `lifecycleWorkUnitShellPills.ts` | Sibling stage WU pills + NA placeholder row (shell parity; NA queue may be unpublished on new builder stages) |

**Execution WU resolution:** `resolveDeptNeedsAttentionWorkUnit` — standalone `work_units.key === needs_attention` **or** `enrollment_pipeline` with `needs_attention` queue in `queue_definition`.

**Bucket config path:** `metadata.opportunity_attention_rules.needs_attention_buckets[]`  
**Precedence:** work unit metadata → department metadata when key **present** (including explicit `[]`). **No platform fallback** — omitted key ⇒ empty lane.

**Childcare demo seed:** `CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED` (`enrollmentNeedsAttentionBucketsSeed.ts`) — eight lenses mapping to platform reason codes; written by `ensureEnrollmentPipelineWorkUnitV1.ts` when key absent.

---

### 1.3 Existing attention reasons

**Platform catalog:** `web/lib/opportunities/attentionPlatformCatalog.ts`  
**Criteria copy (Settings):** `web/lib/opportunities/attentionReasonCriteriaCatalog.ts`  
**Lifecycle subset:** `web/lib/workspace/opportunityAttentionRules.ts`

| Code | Category (informal) | Trigger summary | Configurable? |
|------|---------------------|-----------------|-------------|
| `stale_new_inquiry` | Activity / SLA | Intake stage idle > N hours | `thresholdsHours` |
| `stale_qualified` | Activity / SLA | Qualification idle > N hours | `thresholdsHours` |
| `stale_quote_followup` | Activity / SLA | Decision stage idle after quote | `thresholdsHours` |
| `missing_quote_after_execution` | Activity | Execution stage, no pricing | `thresholdsHours` |
| `follow_up_date_passed` | Activity / Tasks | `metadata.next_follow_up_at` < now | Record field |
| `tour_date_passed` | Activity / Events | `tour_scheduled` + past `metadata.tour_date` | Record field |
| `overdue_commitment` | Activity / SLA | `metadata.commitment_due_at` < now | Record field |
| `high_value_stale` | Activity / SLA | Mid/late funnel `updated_at` > 2d (default) | `stale_high_value_days` |
| `mid_funnel_stale` | Activity / SLA | Mid-funnel statuses > 7d | `stale_mid_funnel_days` |
| `missing_identity` | Readiness-adjacent | Missing person/contact/customer | No |
| `waiting_on_family` | Activity | `enrollment_operational.wait_bucket` | Wait SLA hours |
| `waiting_on_staff` | Activity / Tasks | Same | Wait SLA hours |
| `waiting_on_documents` | Activity | Same | Wait SLA hours |
| `waiting_on_payment` | Activity | Same | Wait SLA hours |
| `blocked_internal` | Activity | Same | Wait SLA hours |
| `blocked_external` | Activity | Same | Wait SLA hours |

**Not implemented as attention reasons (gaps for V2):**

| Desired signal | Status |
|----------------|--------|
| `missing_required_info` | Readiness Phase 1 shipped evaluator; **no NA bridge** |
| `required_info_stale` | Freshness scope deferred in readiness framework |
| `operational_task_overdue` | Tasks exist; no resolver hook |
| `enrollment_packet_incomplete` | Forms/packet module; separate `packetNeedsAttentionItems` for review UX only |
| `mixed_child_disposition` | Relationship conflict; not in resolver |
| `status_unchanged_stale` | Partial overlap with `mid_funnel_stale` / `updated_at` proxy |

**Primary reason ordering:** `PLATFORM_PRIMARY_REASON_PRIORITY_ORDER` — deterministic tie-break when multiple reasons fire.

**Output shape (resolver v2):**

```typescript
OpportunityAttentionResult {
  needs_attention: boolean;
  reasons: ResolvedOpportunityAttentionReason[];  // code, label, severity, sla_tier, sla_clock_confidence
  primary_reason: ResolvedOpportunityAttentionReason | null;
  waiting: AttentionWaitingFacet;
  priority_score: number;
  priority_breakdown: PriorityDimensionContribution[];
  auxiliary: { activity_stale: ActivityStaleSignalVm | null };
  resolver_version: 2;
  computed_at_iso: string;
}
```

---

### 1.4 Existing workspace behavior

Documented in `docs/archive/2026-06-superseded-system/workspace-system.md` § Operational attention.

| Behavior | Detail |
|----------|--------|
| **Overlay, not membership** | NA does not replace pipeline stage queues; records stay in stage lanes while also appearing in NA when resolver fires |
| **Multi-reason** | One opportunity may carry multiple reasons; histogram counts are reason-level unless primary-only aggregation |
| **Count caps** | WU-scoped lane: `NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP` (5000); org preview fallback: 500 |
| **Queue row styling** | `workUnitQueueRowAttention.ts` — subtle warning when `_needs_attention`; labels from resolver |
| **Cross-lane visibility** | Any pipeline lane row may show attention styling — attention is record-scoped, not lane-scoped |
| **Filter bar** | Client-side record filters (`WorkUnitQueueRecordFilterBar`) — preview page only; does not change NA membership |
| **Reveal doctrine** | Attention counts and row badges must not block AdminV2 coordinated reveal — same as readiness Phase 1 |

**Legacy job exceptions:** `web/lib/workspace/exceptionTypes.ts` defines four job-grain exception types (`overdue_visit`, `payment_issue`, `high_value_unassigned`, `ready_for_assignment`) for home-services `AttentionBlock` — **parallel subsystem**, not opportunity resolver.

---

### 1.5 Existing lifecycle integrations

| Integration | Today | V2 direction |
|-------------|-------|--------------|
| **Lifecycle stage → stale reasons** | `resolveEffectiveOpportunityLifecycleStage` drives `stale_*` and quote-era codes | Keep; optionally filter by stage-scoped attention profile |
| **Builder "Needs Attention" section** | Read-only link to `/adminV2/settings/attention-sla-rules` | Stage-scoped **attention profile** (config) — future Builder section |
| **Settings stage mapping copy** | `lifecycleStageWorkspaceMapping.ts` → `STAGE_NEEDS_ATTENTION` hardcoded labels | Replace with profile-driven preview when Builder ships |
| **Queue view membership** | Status keys only — field rules do not affect queue membership | Unchanged — NA remains overlay |
| **Required Information panel (drawer)** | Readiness gaps — **separate** from attention strip | Complementary surfaces; V2 links via shared readiness projection |
| **Ready check** | Structural go-live — does not validate attention wiring | Optional informational row: "Attention profile configured" |

**Lifecycle Builder does not configure attention today.** Thresholds and buckets live under Settings → Attention & SLA Rules (department metadata).

---

### 1.6 Existing BOS integrations

| Capability | Module | Relationship to attention |
|------------|--------|---------------------------|
| **`needs_attention_suggestion`** | `buildNeedsAttentionSuggestion`, entity GET attach | Deterministic draft from resolver output — insight only |
| **`attention_enrich`** | `POST …/enrich-attention-suggestion` | Optional LLM polish — no truth mutation |
| **Operational Recommendation** | `buildOperationalRecommendationV1`, `extractGroundingSignalsFromAttention` | Maps `primary_reason.code` → catalog keys; urgency from SLA tier + severity |
| **Review Assist band** | `DrawerHeaderAttentionBlock`, `resolveDrawerReviewAssistViewModel` | Displays recommendation + readiness trust chrome — **separate** from `_operational_attention` strip |
| **Task Assist urgency** | `taskAssistOperationalUrgency.ts` | May read attention severity — assistive weighting only |

**BOS doctrine (locked):** Resolver + readiness evaluator produce **facts**. BOS produces **explanation, prioritization judgment, and draft proposals**. BOS must not create attention membership or reason codes.

**Drawer surfaces today:**

| Attach field | UI | Role |
|--------------|-----|------|
| `_operational_attention` | `OperationalAttentionHeaderStrip`, `OperationalAttentionDrawerPanel` | Resolver explainability (P1-C) |
| `_operational_recommendation` | Review Assist / header band | BOS suggested next step |
| `readiness` (bootstrap) | `OpportunityDrawerRequiredInformationPanel` | Readiness gaps — not yet linked to NA |

---

## 2. Attention framework

### 2.1 Definition

**Operational attention** is the deterministic answer to whether a **subject** at a **point in time** merits operator review, **why**, and with what **relative urgency** — layered on queue views and record surfaces, not substituting for queue membership or readiness gates.

```
Attention = resolve(signals, subject, config, optionalReadinessSnapshot) → { needs_attention, reasons[], primary_reason }
```

- **Deterministic first** — BOS may explain; BOS does not define attention truth.
- **Overlay** — parallel to lifecycle stage visibility; does not block actions (preflight blocks).
- **Multi-signal** — one subject may hold multiple concurrent reasons; `primary_reason` is deterministic tie-break.
- **Config-driven presentation** — buckets group reason codes; platform owns trigger math.

### 2.2 What is an Attention Reason?

An **attention reason** is the atomic unit of the attention framework.

| Field | Definition | Owner |
|-------|------------|-------|
| **`reason` (code)** | Stable platform identifier (`snake_case`), e.g. `tour_date_passed`, `missing_required_info` | Platform catalog |
| **`category`** | Framework grouping for taxonomy, filtering, and Builder profile defaults | Platform enum (§3) |
| **`severity`** | Operational urgency rank: `critical` \| `high` \| `medium` \| `low` | Platform default + metadata policy override |
| **`source`** | Which signal subsystem produced the reason | Platform registry (§2.3) |
| **`resolution`** | How the reason clears — auto, manual, or workflow-assisted (§4) | Platform metadata per code |

**Resolved reason (runtime output)** extends the atomic reason with evaluation context:

```typescript
type ResolvedAttentionReason = {
  code: AttentionReasonCode;
  label: string;                    // operator-facing
  category: AttentionCategory;
  severity: AttentionSeverity;
  source: AttentionSignalSource;
  sla_tier?: "ok" | "approaching" | "breached";
  sla_clock_confidence?: "high" | "medium" | "low";
  resolution: AttentionResolutionKind;
  resolution_hints?: AttentionResolutionHint[];  // deterministic CTAs — not BOS
  // Readiness bridge (when applicable):
  readiness_gap_ids?: string[];     // requirement_id refs — no re-evaluation
  provenance: string;               // e.g. "readiness.record_view.v1"
};
```

**Distinction from readiness gaps:**

| Concept | Plane | Question |
|---------|-------|----------|
| **Readiness gap** | Evaluation | Is required information missing for this trigger? |
| **Attention reason** | Overlay | Should this record appear in Needs Attention? |

V2 **projects** readiness gaps into attention reasons — it does not re-run field-rule math inside the resolver.

### 2.3 Attention signal sources

| Source key | Subsystem | Examples |
|------------|-----------|----------|
| `readiness` | `evaluateOperationalReadiness` | `missing_required_info`, `required_info_stale` (future) |
| `activity` | Timestamps, wait buckets, stale windows | `stale_new_inquiry`, `waiting_on_staff` |
| `sla` | SLA tier computation | Breached wait buckets, commitment overdue |
| `tasks` | `operational_tasks` + metadata sync | `follow_up_date_passed`, `operational_task_overdue` (future) |
| `events` | Scheduled dates, tour bookings mirror | `tour_date_passed` |
| `relationship` | Entity linkage conflicts | `mixed_child_disposition` (future) |

**Source registry rule:** Each reason code declares exactly one **primary source**. Composite triggers (e.g. follow-up from task → metadata) document the **authoritative write path**, not duplicate evaluators.

### 2.4 Ownership matrix

| Concern | Config owner | Evaluation owner | Display owner |
|---------|--------------|------------------|---------------|
| Reason catalog + trigger math | Platform | Platform resolver | — |
| Thresholds / SLA hours | Admin (Settings / metadata) | Platform resolver | Settings copy |
| Bucket lenses | Admin (metadata) | — (filter only) | Dept / WU lanes |
| Stage attention profile (V2) | Lifecycle Builder (future) | — (filters active codes) | Builder preview |
| Readiness gaps → NA | Lifecycle Builder (levels) | Readiness Engine | Drawer + NA projection |
| BOS explanation | — | — | BOS capabilities |
| Resolution (side effects) | — | Platform actions / workflows | Operator |

---

## 3. Attention categories

Six framework categories organize reason codes for Builder profiles, lane filters, BOS routing, and reporting. A reason belongs to **one primary category**; SLA-tier overlays may co-tag for urgency without changing category.

### 3.1 Readiness

| | |
|---|---|
| **Definition** | Record does not satisfy configured required information at guidance or enforced levels — **projected from Readiness Engine**, not independently computed. |
| **Codes (V2)** | `missing_required_info` (new), `required_info_stale` (future freshness), `missing_identity` (retain — identity is pre-readiness-adjacent; consider re-tagging source to `readiness` when relationship scope ships) |
| **Severity default** | `high` for enforced gaps; `medium` for required-only gaps if policy includes them |
| **Recommendation** | **First NA bridge after Readiness Phase 1.** Map `ReadinessResult.primary_state ∈ {needs_information}` + enforced/required gaps → `missing_required_info`. **Never** map `blocked` — preflight owns gates. Optional policy: include Required-level gaps only when `lifecycle_attention_profile_v1.include_required_gaps === true`. |

### 3.2 Activity

| | |
|---|---|
| **Definition** | Operational momentum stalled — time since meaningful activity, wait-state persistence, or funnel idle beyond configured windows. |
| **Codes** | `stale_new_inquiry`, `stale_qualified`, `stale_quote_followup`, `missing_quote_after_execution`, `high_value_stale`, `mid_funnel_stale`, `waiting_on_*`, `blocked_*` |
| **Severity default** | Tiered by SLA breach vs approaching |
| **Recommendation** | **Keep existing resolver collectors.** Future: replace `updated_at` proxy with canonical activity timestamps (`last_meaningful_contact_at`, etc.) per enrollment attention sprint watch list — reduces conflation with system churn. |

### 3.3 SLA

| | |
|---|---|
| **Definition** | Explicit time commitment or wait-bucket policy breached or approaching breach. |
| **Codes** | SLA overlay on wait buckets; `follow_up_date_passed`, `overdue_commitment`, `tour_date_passed` (commitment class) |
| **Severity default** | `critical`/`high` when `sla_tier === breached` |
| **Recommendation** | **Treat SLA as cross-cutting metadata** on resolved reasons (`sla_tier`, `sla_clock_confidence`) rather than duplicating codes. Settings already expose wait-bucket SLA hours. Surface confidence in operator copy — already designed in P1-B/P1-C. |

### 3.4 Tasks

| | |
|---|---|
| **Definition** | Human follow-up work overdue or implied by open task state. |
| **Codes** | `follow_up_date_passed` (today — via `metadata.next_follow_up_at` task sync), `operational_task_overdue` (future) |
| **Severity default** | `high` for overdue assigned tasks; `medium` for unassigned |
| **Recommendation** | **Do not duplicate task lists in NA.** Project **aggregate task signals** into reason codes only. Task rows remain authoritative in My Tasks / drawer task preview. Future `operational_task_overdue`: query open `operational_tasks` where `due_at < now` — single resolver plugin, not per-task NA rows. |

### 3.5 Events

| | |
|---|---|
| **Definition** | Scheduled operational event passed without recorded outcome. |
| **Codes** | `tour_date_passed` (primary); future: `scheduled_send_overdue`, `appointment_no_outcome` |
| **Severity default** | `high` when calendar date passed |
| **Recommendation** | **Prefer entity/event table reads** over metadata mirrors for V2+ tour reasons — metadata remains preview convenience today. Keep event-sourced reasons separate from activity stale codes to preserve operator clarity ("date passed" ≠ "idle 7 days"). |

### 3.6 Relationship conflicts

| | |
|---|---|
| **Definition** | Entity linkage or disposition inconsistent across grains — not missing field values (readiness) but **conflicting state**. |
| **Codes** | `mixed_child_disposition` (future), candidate vs case status divergence on waitlist |
| **Severity default** | `high` — blocks trustworthy progression |
| **Recommendation** | **Explicitly not Required Information.** Relationship **presence** requirements belong in readiness (relationship scope, Phase 4). Relationship **conflicts** belong here. Candidate-grain NA may require **separate resolver entry point** — do not force-fit opportunity resolver for waitlist candidate rows. |

### 3.7 Category summary

| Category | V2 priority | Readiness overlap | Primary consumer |
|----------|-------------|-------------------|------------------|
| **Readiness** | **P0 bridge** | Direct projection | NA lane, drawer strip |
| **Activity** | Maintain | None | NA lane, queue row badges |
| **SLA** | Maintain (metadata) | Orthogonal | Explainability, BOS urgency |
| **Tasks** | P1 extension | Task completion may clear readiness — independent | NA reason, not task UI |
| **Events** | Maintain | None | Tour / scheduling ops |
| **Relationship conflicts** | P2+ | Do not merge with gaps | NA + drawer conflict panel |

---

## 4. Resolution model

Attention reasons **highlight**; they do not **gate**. Resolution describes how a reason **clears** from the overlay.

### 4.1 Resolution kinds

| Kind | Definition | Examples |
|------|------------|----------|
| **Automatic** | Reason clears when underlying signal no longer evaluates true — no explicit operator "acknowledge" | Tour date updated; field populated; wait bucket cleared; task completed |
| **Manual** | Operator must take a defined platform action | Send form, edit field, record tour outcome, change wait bucket |
| **Workflow-assisted** | Automation or action execution produces state change that clears signal | Workflow PATCHes field; `executeAdminAction` records outcome; Task Assist apply creates follow-up that updates `next_follow_up_at` |

**Locked:** NA has **no dismiss / snooze** persistence in V2 Phase 1–2. If product needs suppressions, that is a **separate** audited mechanism (future `attention_suppression_v1`) — not silent resolver hacks.

### 4.2 Resolution hints (deterministic)

Each reason code may expose zero or more **resolution hints** — catalog action keys, form ids, drawer field keys — for row/deep-link CTAs. These are **not** BOS recommendations.

```typescript
type AttentionResolutionHint = {
  kind: "admin_action" | "drawer_field" | "form" | "settings";
  action_key?: string;
  field_key?: string;
  form_id?: string;
  label: string;
};
```

**Readiness-sourced reasons** inherit hints from `ReadinessGap.resolution` — single mapping path.

### 4.3 Resolution by category

| Category | Automatic | Manual | Workflow-assisted |
|----------|-----------|--------|-------------------|
| **Readiness** | Field populated → re-eval clears gap → reason drops | Edit field in drawer; send intake form | Form submit workflow PATCHes entity |
| **Activity** | Status change / wait bucket cleared | Staff outreach logged (future activity timestamps) | Status change action |
| **SLA** | Elapsed condition false after clock reset | Same as activity | Scheduled automation reminder (does not clear alone) |
| **Tasks** | Task marked complete | Complete task in My Tasks | Task Assist apply |
| **Events** | Outcome recorded | Record tour outcome action | Workflow on booking status |
| **Relationship conflicts** | Disposition aligned | Manual reconcile in drawer | Enrollment action resolving OCM |

### 4.4 Anti-patterns

| Anti-pattern | Why forbidden |
|--------------|---------------|
| "Dismiss attention" without state change | Creates shadow truth diverging from resolver |
| BOS apply clears attention | BOS does not mutate operational signals directly |
| Readiness panel clears NA independently | NA must re-resolve from readiness snapshot |
| Workflow sets `needs_attention: false` flag | No persistent attention boolean on records |

---

## 5. Runtime model

### 5.1 Department workspace

| Element | V2 behavior |
|---------|-------------|
| **Left lane** | Pipeline execution queues (stage/domain membership) — unchanged |
| **Right lane** | Needs Attention bucket chips — counts from resolver on execution WU cohort |
| **Bucket ordering** | `priority` then `order` from metadata |
| **Empty state** | Explicit copy when no buckets configured — not platform seed fallback |
| **Readiness bridge** | Bucket may include `missing_required_info` when profile enables — counts follow same unique-inquiry semantics |
| **Reveal** | Lane counts load with operational bootstrap — must not block shell reveal |

**Cross-stage visibility:** Department lane is **lifecycle-agnostic** by design — any record in the execution WU cohort may appear regardless of which stage queue it also belongs to.

### 5.2 Work units

| Model | Appearance |
|-------|------------|
| **`enrollment_pipeline`** | NA queue embedded in `queue_definition`; bucket chips filter `attention_bucket` param |
| **Builder-owned `lifecycle_wu_{stage}`** | Stage queue shows membership; NA overlay row/chip at dept level or shared NA WU when published |
| **Standalone `needs_attention` WU** | Legacy pattern — resolver-backed list; converging toward embedded NA queue |

**Queue row attention:**

- Subtle styling when `_needs_attention` — any pipeline lane
- Primary reason label on row (optional progressive disclosure)
- **Do not** show full gap list on row — drawer/strip owns depth

**Builder-owned lifecycle shell:** Sibling WU pills navigate stage queues; NA remains **dept-scoped overlay**, not a fake lifecycle stage.

### 5.3 Drawers

| Surface | Content | Authority |
|---------|---------|-----------|
| **Operational attention strip** | `_operational_attention` — primary reason, multi-reason chips, waiting facet, SLA/confidence | Resolver |
| **Required Information panel** | `readiness` gaps by level | Readiness Engine |
| **Review Assist band** | BOS recommendation — suggested next step | BOS |
| **Task preview** | Open tasks — task subsystem | `operational_tasks` |

**V2 coherence rule:** When `missing_required_info` projects from readiness, **drawer strip and Required Information panel must agree** on gap set — strip summarizes ("Required information missing — 3 fields"); panel lists gaps. BOS narrates; neither invents gaps.

**Reveal doctrine:** Attention strip uses existing attach on entity GET — must not become a new reveal gate.

### 5.4 Cross-stage visibility

Attention is **record-scoped**, not **stage-scoped**:

| Scenario | Behavior |
|----------|----------|
| Record in Tour queue with `stale_new_inquiry` | Appears in NA bucket for stale intake — **valid**; signals cross-stage risk |
| Stage attention profile (future) | Filters which reason codes **activate** per builder stage — does not hide record from dept NA if another active code fires |
| Operator confusion mitigation | Bucket labels + reason labels carry stage context in copy; BOS explains cross-stage signals |
| Readiness gaps | Evaluated for **current** stage from `status_key` — gap reason may fire while record visible in different stage queue (status vs visibility lens divergence) — document in operator training |

**Locked:** Lifecycle stage queue membership uses **status visibility lens**. Readiness uses **status → stage** resolution. Attention uses **both** platform signals and readiness projection — operators may see apparent mismatches; copy must clarify "why flagged" without implying wrong queue placement.

---

## 6. BOS integration

### 6.1 Responsibility split (locked)

```
┌─────────────────────────────────────────────────────────┐
│  Needs Attention (platform)                              │
│  Provides FACTS: reasons[], severity, SLA, waiting      │
└───────────────────────────┬─────────────────────────────┘
                            │ read-only snapshot
                            ▼
┌─────────────────────────────────────────────────────────┐
│  BOS                                                     │
│  Provides: EXPLANATION · PRIORITIZATION · RECOMMENDATIONS│
└─────────────────────────────────────────────────────────┘
```

| Needs Attention provides | BOS provides |
|--------------------------|--------------|
| `needs_attention` boolean | Natural language explanation |
| `reasons[]` with codes/labels | "Suggested next step" judgment |
| `primary_reason` | Task Assist / action routing |
| `priority_score` + breakdown | Urgency framing (non-authoritative) |
| `waiting` facet | Waiting-state narrative |
| Readiness gap ids (when bridged) | Gap collection guidance |
| SLA tier + confidence | Trust copy |

| BOS must not | Because |
|--------------|---------|
| Add/remove reason codes | Attention truth is resolver-owned |
| Override `primary_reason` | Deterministic tie-break must hold |
| Conflate recommendation with NA membership | Recommendation is per-record judgment |
| Auto-clear attention | No mutating apply path for insight capabilities |
| Re-evaluate readiness | Single evaluator doctrine |

### 6.2 Capability mapping (V2)

| Capability | Input | Output |
|------------|-------|--------|
| **`needs_attention_suggestion`** | `OpportunityAttentionResult` + optional `ReadinessResult` | Deterministic insight draft |
| **`attention_enrich`** | Same + operator prompt | Polished copy only |
| **`operational_recommendation`** | Attention + activity + readiness snapshot | `OperationalRecommendationV1` |
| **`readiness_explain`** (future) | `ReadinessResult` | Gap list narrative — **orthogonal** to attention explain |
| **`task_assist`** | Top gap or primary reason | Proposal — human apply |
| **`orchestrator`** | "Why flagged?" | Route to readiness_explain or attention insight |

### 6.3 Combined drawer narrative (target UX)

1. **Strip (facts):** "Needs review — Required information missing · Tour date passed"
2. **Required Information panel (readiness facts):** Enforced / Required gaps listed
3. **Review Assist (BOS judgment):** "Suggested next step: record tour outcome, then collect Child · Program Interest"

BOS prioritizes **which** issue to tackle first; NA lists **that** issues exist.

---

## 7. Task integration

### 7.1 Current coupling

| Mechanism | Direction |
|-----------|-----------|
| `operational_tasks` → `metadata.next_follow_up_at` | Task sync feeds `follow_up_date_passed` |
| Resolver → tasks | **No** reverse query today |
| Task Assist | Proposes tasks from BOS context — may reference attention severity |
| Lifecycle task templates | **Not implemented** |

### 7.2 V2 doctrine

| Question | Answer |
|----------|--------|
| Should attention **create** tasks? | **No** — same as readiness (§9.1 readiness framework) |
| Should tasks **generate** attention reasons? | **Yes** — via resolver plugins (`operational_task_overdue`) |
| Should attention **replace** My Tasks? | **No** — tasks are execution home |
| Should completing a task clear readiness? | **Only if** task completion PATCHes satisfied fields — otherwise independent |

### 7.3 Integration patterns

| Pattern | Owner | Mechanism |
|---------|-------|-----------|
| Overdue task → NA reason | Platform resolver | Query open tasks with `due_at < now` |
| Follow-up date → NA reason | Existing | `next_follow_up_at` metadata (task sync) |
| NA reason → task creation | Automation (future) | Workflow on `attention_entered` or persistent reason — **not** resolver |
| Task Assist from NA context | BOS | Proposal from primary reason + readiness gaps |
| Stage-entry task template | Lifecycle config (future sprint) | Fires on stage entry — independent of NA |

**Duplicate avoidance:** Task **lists** live in task UI. NA carries **signals** about task state — never mirror full task rows in NA queue.

---

## 8. Readiness integration

### 8.1 Locked doctrine (from Readiness Phase 1)

Per [`required_information_v2_operational_readiness_framework.md`](./required_information_v2_operational_readiness_framework.md) §9.2:

- Readiness Engine is **single source of operational readiness truth**
- NA reasons are **projections** of readiness evaluation — **no parallel missing-field math**
- NA **does not block** actions — preflight blocks on `blocked` state
- Evaluator is **read-only** — NA overlay has **no write path** from evaluation

### 8.2 Projection mapping

| Readiness signal | Attention reason | Policy |
|------------------|------------------|--------|
| `primary_state = needs_information` + enforced gaps | `missing_required_info` | Default on when stage has enforced rules |
| Same + required-only gaps | `missing_required_info` (severity `medium`) | Opt-in: `include_required_gaps` |
| `primary_state = warning` (recommended only) | None by default | Opt-in: `include_recommended_gaps` |
| `primary_state = blocked` | **Not an NA reason** | Preflight panel only |
| `primary_state = expired` | `required_info_stale` | Freshness scope — Phase 5+ |
| `primary_state = ready` | No readiness-derived reason | — |

### 8.3 Integration architecture

```
Save stage → rule_levels_v1 (config)
        ↓
evaluateOperationalReadiness(record_view)
        ↓
ReadinessResult { primary_state, gaps[] }
        ↓
projectReadinessToAttentionReasons(result, profile)
        ↓
merge into resolveOpportunityAttention output
```

**Implementation shape (conceptual):**

```typescript
function projectReadinessToAttentionReasons(
  readiness: ReadinessResult | undefined,
  profile: LifecycleAttentionProfileV1 | undefined,
): ResolvedAttentionReason[] {
  if (!readiness || !profile?.flag_missing_required) return [];
  if (readiness.primary_state === "blocked") return [];
  // Map gaps → missing_required_info with readiness_gap_ids
}
```

**Call site:** Inside `resolveOpportunityAttention` **or** compositor wrapping resolver — readiness snapshot passed in from request-scoped memo (`readinessEvaluationMemo.ts`) to avoid double evaluation.

**Performance:** Readiness evaluation on NA queue fetch must respect caps — batch readiness for visible row ids or accept Phase 2 lazy enrichment on drawer open first.

### 8.4 Lifecycle Builder profile (future config)

```typescript
lifecycle_attention_profile_v1: {
  version: 1;
  enabled: boolean;
  flag_missing_required: boolean;       // default true when stage has enforced rules
  include_required_gaps: boolean;       // default false (enforced only)
  include_recommended_gaps: boolean;    // default false
  buckets: NeedsAttentionBucketConfig[]; // may relocate from opportunity_attention_rules
  stage_rules?: Record<builderStageKey, {
    active_reason_codes: AttentionReasonCode[];
    threshold_overrides?: Partial<ThresholdHours>;
  }>;
}
```

**Migration:** Existing `metadata.opportunity_attention_rules.needs_attention_buckets` remains valid — profile composes/overrides incrementally.

### 8.5 Operator copy alignment

| Readiness state | Required Information panel | NA reason label |
|-----------------|----------------------------|-----------------|
| Enforced gap | "Enforced — blocks actions" | "Required information missing" |
| Required gap | "Expected before moving forward" | Same headline; lower severity if included |
| Recommended | "Recommended" chip | Only if policy enabled — soft signal |

Use frozen vocabulary — not "violations," not "config only."

---

## 9. Risks and architectural traps

| Risk | Trap | Mitigation |
|------|------|------------|
| **Parallel missing-field math** | Resolver re-implements field rules | Readiness projection only (§8) |
| **NA as gate** | Attention blocks actions | Preflight/readiness `blocked` owns gates |
| **BOS as attention authority** | LLM decides flagged state | Resolver + readiness deterministic |
| **Dismiss/snooze without state** | Shadow truth | Defer suppressions to audited future mechanism |
| **Reason code proliferation** | Tenant-defined arbitrary expressions | Platform catalog; tenants tune thresholds/policies only |
| **Histogram vs inquiry counts** | Misleading bucket totals | Document multi-reason semantics (existing) |
| **`updated_at` stale proxy** | System churn triggers false stale | Canonical activity timestamps roadmap |
| **Queue row authority** | NA labels used for action payloads | Queue truth boundary — entity GET for execute |
| **Candidate vs opportunity grain** | Forcing single resolver | Separate entry points for candidate-grain |
| **Readiness/NA duplicate UI** | Two panels saying different things | Shared gap ids; strip summarizes, panel lists |
| **Lifecycle stage = NA stage** | Operators think NA is a stage | Vocabulary + shell design — overlay not stage |
| **Task duplication** | NA queue shows task rows | Signal codes only |
| **Legacy QueueService heuristics** | Two truths | Remove parity path after resolver coverage |
| **Job exceptions vs opportunity NA** | Conflated product concept | Document parallel grains; converge naming later |
| **Reveal regression** | NA/readiness block drawer | Optional attach; try/catch; no new gates |
| **Cross-stage confusion** | Record flagged "wrong" for stage | Explainability copy + BOS |
| **Packet review NA** | Forms module separate items | Unified reason codes in Phase 5 — until then document boundary |

---

## 10. Phased implementation roadmap

### Phase 0 — Discovery (this document)

- [x] Current-state audit
- [x] Attention framework + reason model
- [x] Six category taxonomy + recommendations
- [x] Resolution model
- [x] Runtime model (dept / WU / drawer / cross-stage)
- [x] BOS integration boundaries
- [x] Task integration doctrine
- [x] Readiness integration doctrine
- [x] Risks + roadmap
- [ ] Product sign-off on §11 open decisions before Phase 1 coding

### Phase 1 — Readiness bridge (headless)

**Goal:** NA consumes readiness without new UI or tables.

| Work | Type |
|------|------|
| Platform reason code `missing_required_info` | Catalog |
| `projectReadinessToAttentionReasons` compositor | Resolver lib |
| Pass readiness snapshot into resolver batch path | Runtime |
| `lifecycle_attention_profile_v1.flag_missing_required` metadata (JSON only) | Config |
| Enforced-only default projection | Policy |
| Tests: readiness gap → reason parity | QA |
| Remove legacy `opportunityNeedsAttention` duplication where safe | Cleanup |

**Exit:** Resolver returns `missing_required_info` when enforced gaps exist; no independent field math in resolver.

**Depends on:** Readiness Phase 1 (shipped).

### Phase 2 — Runtime surfaces

**Goal:** Operators see coherent attention + readiness story.

| Work | Type |
|------|------|
| Drawer strip ↔ Required Information panel coherence | UI |
| NA bucket includes readiness reason in counts | Workspace |
| Optional queue row chip for readiness reason | UI (non-blocking reveal) |
| Resolution hints on readiness-sourced reasons | UI |
| Settings profile toggle: enforced vs required gaps | Settings |
| BOS insight merges readiness gap ids into grounding | BOS |

**Exit:** Staff see missing info in NA lane and drawer strip aligned with Required Information panel.

### Phase 3 — Lifecycle Builder attention profile

**Goal:** Stage-scoped attention configuration in Builder shell.

| Work | Type |
|------|------|
| Lifecycle Builder Needs Attention section (replace link-out card) | Builder UI |
| Stage rules: active reason codes + threshold overrides | Metadata |
| Bucket authoring with reason code picker | Builder UI |
| Ready check optional row: attention profile configured | Builder |
| Migrate `needs_attention_buckets` under profile | Metadata compat |

**Exit:** Operators configure attention per lifecycle without raw JSON editing.

### Phase 4 — Task + event extensions

**Goal:** Task overdue and richer event reasons.

| Work | Type |
|------|------|
| `operational_task_overdue` resolver plugin | Resolver |
| Task ↔ follow-up sync audit | Tasks |
| Event-sourced tour reason (booking table) | Resolver |
| `attention_entered` / `attention_cleared` events (flagged) | Events |

**Exit:** Task state and scheduled events surface as first-class attention reasons.

### Phase 5 — Relationship conflicts + packet + freshness

**Goal:** Non-field scopes enter attention framework.

| Work | Type |
|------|------|
| `mixed_child_disposition` reason | Resolver |
| Candidate-grain attention entry point | Resolver |
| `required_info_stale` ← readiness `expired` | Bridge |
| `enrollment_packet_incomplete` ← packet scope | Bridge |
| Cross-grain reporting aggregates | Reporting sprint |

**Exit:** Operational attention covers conflicts, documents, and expiry — not only CRM stale rules.

### Phase 6 — Operational intelligence

**Goal:** Analytics and automation react to attention — not define it.

| Work | Type |
|------|------|
| Bottleneck dashboards from reason codes | Reporting |
| Workflow triggers on persistent reasons | Automations |
| BOS bounded enrich for attention narrative | BOS |
| Suppression/snooze with audit (if product approved) | Platform |

---

## 11. Open decisions (require product sign-off before Phase 1)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Required gaps in NA | Enforced only vs Required + Enforced | **Enforced only** initially; opt-in Required |
| 2 | Readiness eval on NA queue fetch | Batch all rows vs drawer-only Phase 2 | **Drawer-first** if perf risk; batch with memo + cap |
| 3 | Profile metadata location | `lifecycle_attention_profile_v1` vs extend `opportunity_attention_rules` | **Extend** `opportunity_attention_rules` with version bump for compat |
| 4 | `missing_identity` category | Activity vs Readiness | **Readiness-adjacent** long-term; no move in Phase 1 |
| 5 | Legacy job exceptions | Converge with opportunity NA vs parallel | **Parallel** until home-services resolver sprint |
| 6 | Primary reason when readiness + SLA fire | Readiness vs SLA priority | **SLA breached > readiness enforced > other** — update priority order table |
| 7 | Builder bucket ownership | Dept-wide vs per-lifecycle profile | **Per department profile** under lifecycle builder v1 process |

---

## Appendix A — Key files (current implementation)

| Area | Paths |
|------|-------|
| Resolver v2 | `web/lib/opportunities/opportunityAttentionResolver.ts` |
| Platform catalog | `web/lib/opportunities/attentionPlatformCatalog.ts` |
| Lifecycle stale reasons | `web/lib/workspace/opportunityAttentionRules.ts` |
| Config merge | `web/lib/opportunities/opportunityAttentionConfig.ts` |
| Criteria copy | `web/lib/opportunities/attentionReasonCriteriaCatalog.ts` |
| Buckets | `web/lib/opportunities/needsAttentionBuckets.ts` |
| Demo seed | `web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts` |
| Queue enrichment | `web/lib/queues/QueueService.ts` (`enrichOpportunityRows`) |
| Explainability | `web/lib/opportunities/operationalAttentionExplain.ts` |
| Drawer strip | `web/components/admin/drawer/OperationalAttentionHeaderStrip.tsx` |
| BOS grounding | `web/lib/adminV2/bos/recommendations/adapters/extractGroundingSignalsFromAttention.ts` |
| Readiness engine | `web/lib/completion/evaluateOperationalReadiness.ts` |
| Readiness types | `web/lib/completion/readinessTypes.ts` |
| Workspace doctrine | `docs/archive/2026-06-superseded-system/workspace-system.md` |
| CRM NA model | `docs/product/crm-system.md` § Enrollment operational attention |

---

## Appendix B — Vocabulary alignment

Per [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md):

| Use | Avoid |
|-----|-------|
| Needs attention | Alert engine, BOS queue |
| Attention reason / signal | Violation, flag (operator) |
| Bucket / lens | Arbitrary filter |
| Overlay | Stage, queue membership |
| Required information missing | Config only gap |
| Suggested next step (BOS) | AI decided |
| Readiness gap | Parallel NA evaluation |

---

## Appendix C — Success criteria (framework freeze)

| Criterion | Status |
|-----------|--------|
| Human Awareness Doctrine (Risk / Opportunity / Conflict / Awareness) | Yes — post–Executive summary |
| Canonical Responsibilities + Task Relationship Doctrine | Yes — post–Executive summary |
| Future Direction stated | Yes — post–Executive summary |
| Current state documented | Yes — §1 |
| Attention reason model defined | Yes — §2 |
| Six categories evaluated | Yes — §3 |
| Resolution model defined | Yes — §4 |
| Runtime model (dept / WU / drawer / cross-stage) | Yes — §5 |
| BOS integration boundaries | Yes — §6 |
| Task integration doctrine | Yes — §7 |
| Readiness consumption (not re-evaluation) | Yes — §8 |
| Risks enumerated | Yes — §9 |
| Phased roadmap | Yes — §10 |
| Aligned with canonical vocabulary | Yes — Appendix B |
| No implementation in discovery sprint | Yes — constraints honored |

---

*End of operating model — implementation planning may begin after §11 sign-off.*
