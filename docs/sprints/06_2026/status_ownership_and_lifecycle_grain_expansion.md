# Status Ownership & Lifecycle Grain Expansion — Discovery Sprint

**Path:** `docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md`  
**Date:** 2026-06-06  
**Status:** **Discovery complete — architecture frozen before Automation and BOS expansion**  
**Scope:** Define Alloy's long-term **status ownership model** and **lifecycle grain** doctrine. No migrations, no implementation, no workflow changes, no lifecycle rewrites.

**Canonical inputs (frozen):**

- [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md)
- [`completed/readiness_phase_1_closeout.md`](./completed/readiness_phase_1_closeout.md)
- [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md)
- [`completed/operational_work_and_action_execution_closeout.md`](./completed/operational_work_and_action_execution_closeout.md)

**Related planning baselines (informative, not superseding this doc):**

- [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md) §7–§8
- [`../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`](../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md)
- [`lifecycle_runtime_alignment_matrix_v1.md`](./lifecycle_runtime_alignment_matrix_v1.md)

**Authority:** This document is the canonical reference for **status ownership** and **lifecycle grain** before Automations expansion and BOS operational depth. Product copy, queue filters, resolver extensions, and workflow trigger design should align with §2–§7 unless an explicit exception is recorded in §8.

---

## Executive summary

Alloy operates enrollment and future verticals with **multiple status-bearing grains** on one household record. Today the platform is **mid-convergence**: child lifecycle truth exists on `opportunity_customer_members.outcome_status_key`, case coordination still uses pipeline `opportunities.status_key`, and queue v2 already mixes **case**, **child**, and **candidate** grains in one pipeline work unit.

This sprint resolves four architectural questions that block safe Automation and BOS expansion:

| Question | Locked answer |
|----------|---------------|
| **Who owns status?** | **Entity-scoped authoritative fields** — case status on opportunity, child enrollment disposition on OCM, waitlist position on placement candidate. No single household status column. |
| **What is "lifecycle"?** | **Configured visibility lenses** (Lifecycle Builder stages / queue views) over authoritative status fields — not exclusive record ownership. |
| **How do mixed households work?** | **Per-child truth + read-only household summary + domain-specific queue grain.** One opportunity may appear in multiple stage lanes when different children match different child-grain filters. Case status does not auto-encode mixed outcomes. |
| **How do downstream systems consume status?** | **Read authoritative fields; never infer household truth from queue membership.** Readiness, Attention, Operational Work, and Automations each consume status at declared grain — they do not own it. |

**Target ownership spine (frozen):**

```
status_definitions (vocabulary, per entity_type)
        ↓
Authoritative status fields (case / child / candidate / roster)
        ↓
Events (opportunity_status_changed, child_lifecycle_status_changed)
        ↓
Lifecycle Builder stage lenses (status key sets + queue grain)
        ↓
Consumers (queues, readiness, attention, work, automations, BOS)
```

**Explicit non-goals for this sprint:** schema migrations, rollup policy implementation, Builder UI for child-grain stage filters, new workflow actions, or redesign of Operational Work / Needs Attention.

---

## 1. Current-state audit

### 1.1 Opportunity (case) status model

| Aspect | Current state |
|--------|---------------|
| **Authoritative field** | `opportunities.status_key` |
| **Vocabulary** | `status_definitions` where `entity_type = 'opportunities'` |
| **Metadata** | `status_definitions.metadata.lifecycle_stage` — universal stages (`intake`, `qualification`, `execution`, `decision`, `success`, `failure`, `case`) |
| **Assignment home** | `opportunities.work_unit_id` — execution routing; **separate** from lifecycle visibility in builder-owned mode |
| **Canonical pipeline keys (legacy active)** | `new_inquiry`, `contact_attempted`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`, `enrolling`, `waitlisted`, `enrolled`, `lost` (`CANONICAL_ENROLLMENT_PIPELINE_STATUS_KEYS`) |
| **Case convergence keys (seeded, partial adoption)** | `open`, `closed`, `inactive`, `archived` — broad case/container states (`20260601110000_opportunity_case_status_definitions_v2.sql`) |
| **Events** | `opportunity_status_changed` via `emitStatusChangedEvent` / `updateOpportunityStatusWithEvent` |
| **Mutation grain** | Default `row_grain: case` in `resolveStatusMutationGrain` |

**Role today:** Case status is the **primary filter** for case-grain queue lanes (lead, qualification, tour, lost) and the **primary input** to `resolveOpportunityAttention`. It still encodes **per-child outcomes** in transitional tenants where operators have not split case vs child updates — this is the main ownership tension.

**Doctrine (locked, from vocabulary):** Opportunity status and child status are **separate concepts**. Lead status vs Child status must be qualified in operator copy.

### 1.2 Child (inquiry / enrollment) status model

| Aspect | Current state |
|--------|---------------|
| **Authoritative field** | `opportunity_customer_members.outcome_status_key` (nullable) |
| **Vocabulary** | `status_definitions` where `entity_type = 'opportunity_customer_members'` |
| **Original seed keys** | `interested`, `waitlisted`, `enrolling`, `enrolled`, `not_enrolling`, `deferred` |
| **V2 additive keys** | `new_inquiry`, `tour_requested`, `tour_scheduled`, `tour_completed`, `offer_pending`, `withdrawn` (`20260601100000_child_lifecycle_status_definitions_v2.sql`) |
| **Alias** | `interested` → deprecated, `metadata.alias_of = new_inquiry` |
| **Events** | `child_lifecycle_status_changed` via `emitChildLifecycleStatusChangedEvent` |
| **Mutation grain** | `row_grain: child` or `candidate` — requires explicit `opportunity_customer_member_id`; **cannot** patch `outcome_status_key` on `opportunities` entity (`assertWorkflowStatusMutationGrain`) |
| **Waitlist orchestration** | `placement_candidates` — ordering grain (`active`, `paused`, `withdrawn`, `placed`); not a lifecycle status column |

**Separate from inquiry lifecycle:** `customer_members.status_key` (roster membership) and `persons` child profile statuses (`active`, `future_start`, `withdrawn`, `graduated`, etc.) model **enrolled-child operations** — not inquiry pipeline disposition.

**Role today:** OCM `outcome_status_key` is **source of truth for per-child enrollment lifecycle**. Child-grain queues (`enrollment_offers`, `enrollment_completed`) and candidate-grain waitlist queue filter on this field (directly or via join).

### 1.3 Stage membership logic

Lifecycle Builder stages map **opportunity status keys** to stage queue views. Stage membership is **not** a persisted column — it is evaluated at query time.

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| **Builder save** | `saveLifecycleStageRuntimeConfig.ts` | Persists selected opportunity `status_keys` on stage metadata + `work_units.lifecycle_wu_{stageKey}` |
| **Visibility predicate** | `lifecycleVisibilityEvaluator.ts` | Builder-owned WUs: `query_mode: lifecycle_visibility` — `opportunities.status_key ∈ stage status set`; **no** `work_unit_id` gate |
| **Legacy pipeline** | `ENROLLMENT_PIPELINE_WORK_UNIT_KEY` | `query_mode: legacy_pipeline` — still gates on `work_unit_id` |
| **Classic WU** | Non-builder WUs | `query_mode: assignment_home` — `opportunities.work_unit_id = work_unit_id` |
| **Status key resolution** | `resolveLifecycleVisibilityStatusKeys` | Merges explicit param → `work_units.metadata.status_keys` → `queue_definition` filters |

**Builder-owned doctrine:** Stage configures a **visibility lens**. Publishing a stage saves the queue view (`lifecycle_wu_{stageKey}`) — work unit is a **runtime host**, not a peer config object.

**Gap:** Builder stage status assignment is **opportunity-key-only** today. Child disposition keys are **not** configurable stage filter inputs in Lifecycle Builder — child/candidate grain is encoded in `queue_definition` v2 domain queues, not builder stage checkboxes.

### 1.4 Work unit filtering logic

Two runtime patterns coexist:

#### A. Legacy / transitional — `enrollment_pipeline` (v1 + v2)

`enrollmentPipelineQueueDefinitionV2.ts` defines **domain queues with explicit grain**:

| Queue key | Domain | Grain | Filter source |
|-----------|--------|-------|---------------|
| `new_leads`, `communications_followup`, `tours`, `tours_follow_up`, `case_closed` | Lead / tour / archive | **case** | `case_status` → `opportunities.status_key` |
| `waitlist` | Waitlist | **candidate** | `placement_candidates` + `child_lifecycle_status` on OCM |
| `enrollment_offers`, `enrollment_completed` | Enrollment | **child** | `child_lifecycle_status` → OCM `outcome_status_key` |
| `needs_attention` | Overlay | **case** | Resolver filter (`exception exists`) — not status membership |

`filters_compat_v1` preserves v1 behavior (case `status` filter) for rollback — transitional bridge.

#### B. Builder-owned — `lifecycle_wu_{stageKey}`

Per-stage work units use `lifecycle_visibility` mode: opportunity rows appear when `status_key` matches stage-configured set, regardless of `work_unit_id` assignment (assignment home remains on opportunity for routing).

**Child-grain execution modules (shipped):**

- `childGrainEnrollmentQueue.ts` — queries `opportunity_customer_members` directly; row id `ocmrow:{opportunityId}:{ocmId}`
- `candidateGrainWaitlistQueue.ts` — candidate rows with OCM join

**Invariant:** Queue rows are **previews**. Grain determines which entity id opens on selection — case drawer vs child-scoped actions.

### 1.5 Lifecycle visibility behavior

| Concept | Definition | Code / config |
|---------|------------|---------------|
| **Visibility lens** | Which records appear in a stage queue view | `lifecycleVisibilityEvaluator`, stage `status_keys` |
| **Assignment home** | Where opportunity is routed for execution ownership | `opportunities.work_unit_id` |
| **Overlay** | Attention lane — orthogonal to stage membership | `needs_attention` queue, `resolveOpportunityAttention` |

**Locked rule:** Visibility lenses do not require `opportunities.work_unit_id = lifecycle_wu_*` in builder-owned mode. Collapsing visibility and assignment recreates pre-hardening queue bugs.

**Ready check** (`validateLifecycleActivationRuntime`) validates structural wiring — status sets match queue filters, records query, actions placed — not business rollup correctness.

### 1.6 Existing child enrollment outcome fields

Beyond `outcome_status_key`, inquiry children carry enrollment context used by readiness, queues, and placement:

| Field / area | Table | Role |
|--------------|-------|------|
| `outcome_status_key` | `opportunity_customer_members` | Child enrollment lifecycle disposition |
| `desired_start_date`, `desired_program_type`, `desired_schedule_type` | OCM | Readiness / queue preview |
| `location_id`, `program_room_cohort_key` | OCM | Site/cohort scoping |
| `notes` | OCM | Operator context |
| Placement linkage | `placement_candidates` | Waitlist rank, pin overrides, cohort |
| Child profile dates | `person` fields `enrollment_date`, `start_date` | Post-enrollment operations |

**Status definitions** for OCM are org-scoped and editable in Settings → Statuses. No CHECK constraint enforces allowed keys — platform validates at action/workflow boundaries.

### 1.7 Existing mixed-household behavior

| Surface | Behavior today |
|---------|----------------|
| **Derived summary** | `buildOpportunityChildLifecycleSummary` — read-only; `is_mixed`, count fragments, `case_status_secondary_note`; **does not mutate** `opportunities.status_key` |
| **Drawer** | Inquiry children list per-child `outcome_status_key`; summary attached via `attachOpportunityChildLifecycleSummary` |
| **Queue membership** | Mixed household can appear in **multiple lanes**: case-grain lane from `opportunities.status_key` **and** child/candidate lanes per matching children |
| **Attention** | Opportunity-primary resolver — **no** `mixed_child_disposition` reason yet (planned in NA V2) |
| **Readiness** | Phase 1 **record scope** — evaluates opportunity + person + child snapshots; does not resolve household rollup |
| **Operational Work** | Subject link `entity_type: opportunities` — household-level obligations; no per-child work grain in V1 catalog |
| **Strict-mode diagnostics** | `ocmLifecycleStrictModeReadiness.ts` reports `opportunities_with_mixed_children` for migration readiness |

**Example (Child A enrolled, Child B waitlisted, Child C touring):**

| Dimension | Current behavior |
|-----------|------------------|
| OCM truth | Three distinct `outcome_status_key` values |
| Case status | Single `opportunities.status_key` — operator-maintained or legacy pipeline key; **not auto-derived** |
| Stage / queue visibility | Case may appear in tour lane (case status) **and** waitlist lane (Child B candidate row) **and** enrolled lane (Child A child row) simultaneously |
| Attention | Case-level stale/SLA reasons from opportunity status — mixed signal gap |
| Work | Case-scoped instances (e.g. `record_tour_outcome`) — no automatic per-child work split |

---

## 2. Status ownership framework

### 2.1 Evaluation dimensions

| Model | Definition | Verdict |
|-------|------------|---------|
| **1. Opportunity status** | Single `opportunities.status_key` owns all household progression | **Reject** as enrollment truth — contradicts child lifecycle convergence |
| **2. Child status** | OCM `outcome_status_key` owns all progression | **Reject** as sole model — case coordination (tours, threads, household comms) needs case grain |
| **3. Derived status** | Computed household status from child rollups | **Display / policy only** — never authoritative storage in Lifecycle Builder |
| **4. Explicit lifecycle membership** | Persisted stage membership column | **Reject** — membership is lens evaluation over authoritative status fields |

### 2.2 Recommended ownership model (frozen)

| Grain | Authoritative field | Owns | Does not own |
|-------|---------------------|------|--------------|
| **Case (opportunity)** | `opportunities.status_key` | Family coordination, case-grain queues, tour scheduling context, case-scoped attention, comms/forms case binding | Per-child waitlist rank, per-child enrolled truth |
| **Child inquiry (OCM)** | `opportunity_customer_members.outcome_status_key` | Per-child enrollment lifecycle, child-grain queues, child lifecycle events | Case-wide tour schedule alone, household thread ownership |
| **Waitlist candidate** | `placement_candidates.status` + ordering metadata | Waitlist position, candidate-grain queue rows | Case status, global lifecycle stage labels |
| **Roster child** | `customer_members.status_key`, person profile fields | Active care operations post-enrollment | Inquiry pipeline while still opportunity-bound |
| **Lifecycle Builder** | Stage `status_keys` config (opportunity keys today) | Visibility lens for case-grain stages | Status values, rollup policies, child filter sets (until explicitly extended) |
| **Derived rollup** | `buildOpportunityChildLifecycleSummary`, future policy functions | Operator headline, BOS context, reporting hints | Queue membership, attention membership, workflow triggers |

### 2.3 Status change authority

| Actor | May change case status | May change child disposition | Notes |
|-------|------------------------|------------------------------|-------|
| **Operator actions** | Yes (`row_grain: case`) | Yes (`row_grain: child`) | Grain explicit in action payload |
| **Workflows** | Yes — `update_entity` on opportunities | Yes — `update_entity` on `opportunity_customer_members` | `assertWorkflowStatusMutationGrain` blocks ambiguous patches |
| **Lifecycle Builder** | No | No | Configures lenses only |
| **Readiness engine** | No | No | Evaluates only |
| **Needs Attention** | No | No | Surfaces only |
| **Operational Work** | No | No | Completion does not imply status change |
| **BOS** | No | No | Proposals route through governed apply paths |
| **Derived summary** | No | No | Read-only |

### 2.4 Transitional state (enrollment)

Until case status migration completes, **pipeline keys on opportunity remain in active use** alongside OCM child keys. Operators and legacy workflows may still write `enrolled` / `waitlisted` to case status while children have distinct OCM dispositions.

**Migration direction (documented, not this sprint):** Case trends toward `open` / `closed` / `inactive` / `archived`; child disposition carries enrollment truth. Queue v2 child/candidate grains already assume this split.

### 2.5 Explicit lifecycle membership — when to use

**Do not introduce** `lifecycle_stage_membership` columns or builder-persisted "current stage" on opportunities.

**Instead:**

- **Stage membership** = predicate: `status_key ∈ stage.status_keys` (case) or `outcome_status_key ∈ queue.child_lifecycle_statuses` (child) or candidate filters (waitlist)
- **Explicit membership** is appropriate only for **non-status domains** (e.g. placement candidate active/paused) — not a substitute for enrollment disposition

---

## 3. Lifecycle grain model

### 3.1 Grain taxonomy (frozen)

| Grain | Row identity | Primary status source | Typical stages / domains |
|-------|--------------|----------------------|---------------------------|
| **case** | `opportunities.id` | `opportunities.status_key` | Lead, Qualification, Tour, Lost |
| **child** | `opportunity_customer_members.id` (queue row `ocmrow:*`) | `outcome_status_key` | Enrolling, Enrolled |
| **candidate** | `placement_candidates.id` | candidate status + OCM disposition filters | Waitlist |
| **household** | *Not a queue grain* | Derived summary only | Drawer headline, future reporting |
| **future entity** | Entity-specific | Entity `status_key` or domain equivalent | Jobs, service requests, compliance cases |

### 3.2 Lifecycle planes

| Plane | What it is | Authoritative for |
|-------|------------|-------------------|
| **Opportunity lifecycle** | Case coordination pipeline | Tours, intake, household comms, case attention |
| **Child lifecycle** | Per-inquiry-child enrollment disposition | Waitlist, offer, enrolling, enrolled per child |
| **Household lifecycle** | Derived composite | Display, conflict detection, optional rollup **policy output** |
| **Future entity lifecycle** | Vertical-specific | Same pattern: entity-owned status + builder lens |

### 3.3 Authoritative sources by question

| Operator question | Authoritative source | Never use |
|-------------------|---------------------|-----------|
| "What stage is this **family** in for tours?" | `opportunities.status_key` + case-grain queue | Child OCM rollup |
| "Is **this child** waitlisted?" | OCM `outcome_status_key` + placement candidate | Case status alone |
| "Where is this child on the **waitlist**?" | `placement_candidates` ordering | Opportunity status |
| "Are **children mixed**?" | `buildOpportunityChildLifecycleSummary` | Case status label |
| "What **lane** should they appear in?" | Queue `grain` + filters in `queue_definition` | Attention overlay |
| "Is required info missing?" | `ReadinessResult` | Status key |

### 3.4 Builder vs runtime grain configuration

| Config surface | Today | Recommended expansion |
|----------------|-------|----------------------|
| **Lifecycle Builder stage status step** | Opportunity keys → stage | Add optional **filter grain** per stage: `case` (default) \| `child` \| `candidate` |
| **Queue view publish** | Writes `queue_definition` + `status_keys` metadata | Child-grain stages publish `child_lifecycle_status` filters, not opportunity keys |
| **Ready check** | Validates case-grain wiring | Extend to validate grain-appropriate filter non-empty |

**Principle:** Builder stage is the operator mental model; **grain** is the machine contract for which status field powers visibility.

### 3.5 Multi-work-unit visibility

An opportunity **may appear in multiple stage work units simultaneously** when:

1. Case status matches a case-grain stage lens, **and**
2. One or more children match child/candidate-grain stage lenses

This is **expected** for mixed households. Assignment home (`work_unit_id`) remains **singular** — default routing, not exclusive visibility.

---

## 4. Mixed-household model

### 4.1 Reference scenario

**Household X — one opportunity, three inquiry children:**

| Child | OCM `outcome_status_key` | Placement |
|-------|--------------------------|-----------|
| Child A | `enrolled` | — |
| Child B | `waitlisted` | `placement_candidates` active |
| Child C | `tour_scheduled` (or case via tour pipeline) | — |

Assume case status `tour_scheduled` or `open` (coordination still active).

### 4.2 Stage membership (recommended)

| Lane / stage | Grain | Appears? | Row shape |
|--------------|-------|----------|-----------|
| Tour (case) | case | **Yes** if `opportunities.status_key` ∈ tour set | One row — household |
| Waitlist | candidate | **Yes** — Child B candidate row | One row per waitlisted child |
| Enrolled | child | **Yes** — Child A | One row per enrolled child |
| Enrolling | child | **No** (unless Child A still `enrolling`) | — |
| Needs Attention | overlay | **Maybe** — case resolver + future conflict reasons | Case row |

**Case status recommendation:** Keep case status at **coordination phase** (`open`, `tour_scheduled`, or post-tour case state) — **do not** force `enrolled` on case when only one child enrolled.

### 4.3 Queue visibility

| Rule | Detail |
|------|--------|
| **Independent lenses** | Each queue evaluates its grain filter independently |
| **No dedupe across grains** | Same opportunity id may surface multiple rows in different domains (different `ocmrow:*` ids for child grain) |
| **Preview semantics** | Queue row opens correct scope — child row opens drawer with child context |
| **Count units** | Child/candidate queues use `count_unit: children` in v2 definition |

### 4.4 Attention behavior

| Signal | Grain | Recommended |
|--------|-------|-------------|
| Stale tour / follow-up | case | Existing resolver — opportunity status + metadata |
| Missing required info | case (record scope) | Readiness projection — `missing_required_info` |
| **Mixed child disposition** | household | **New reason** `mixed_child_disposition` — `buildOpportunityChildLifecycleSummary.is_mixed` + policy (Conflict category) |
| Per-child waitlist SLA | child/candidate | Future candidate-grain resolver entry — **do not** overload opportunity resolver |

**Severity:** Mixed disposition = **high** (Conflict) — operator should reconcile case vs children, not auto-dismiss.

### 4.5 Work generation

| Principle | Detail |
|-----------|--------|
| **Default subject** | Operational Work V1 remains **opportunity-scoped** for household obligations (tour outcome, contact family) |
| **Child-scoped work** | Future — work definition `allowed_subjects` may add `opportunity_customer_members` when templates require per-child obligations |
| **No auto-fan-out** | Mixed household does **not** automatically create N work instances per child |
| **Automation** | Workflows may instantiate work on `child_lifecycle_status_changed` with explicit OCM id in provenance — policy-driven, not resolver-driven |

### 4.6 Optional case rollup policy (automations only)

When org policy wants case status to reflect household milestones:

| Policy example | Trigger | Action |
|----------------|---------|--------|
| All children terminal | `child_lifecycle_status_changed` | Workflow sets case → `closed` |
| Any child waitlisted | same | Set case → `open` (no change) or metadata flag only |
| All children enrolled | same | Set case → `closed` or `inactive` |

**Locked:** Rollup is **Automation configuration**, not Lifecycle Builder save, not derived field write from summary function.

---

## 5. Operational Work integration

Operational Work is the **execution home** for human obligations. It **does not own status** and **does not determine readiness**.

### 5.1 How work consumes status today

| Mechanism | Consumption |
|-----------|-------------|
| **Work instance subject** | `entity_type: opportunities` — household case link |
| **Context snapshot** | `metadata.work.context_snapshot.lifecycle_stage_key` at creation — **point-in-time**, not live membership |
| **Stage bindings** | `PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS` — catalog defaults by builder stage key (`intake`, `tour`, etc.) |
| **Workflow instantiate** | Tour outcome seed binds `lifecycle_stage_key: "tour"` + `opportunity_status_changed` trigger |
| **Dedupe** | Per definition + subject — status change does not auto-close work |

### 5.2 Recommended consumption model (frozen)

| Rule | Detail |
|------|--------|
| **Read status for routing hints only** | Suggested definitions may filter by `lifecycle_stage_key` from **snapshot at creation** — not live re-evaluation on every status change |
| **Do not gate completion on status** | Completing work does not require status transition; actions may optionally mutate status separately |
| **Grain in provenance** | When work relates to a child, future: `context_snapshot.row_grain: child` + `opportunity_customer_member_id` |
| **No status ownership** | `instantiateWork` must not write `status_key` or `outcome_status_key` |
| **Mixed household** | Prefer **one case-scoped obligation** (e.g. "Contact family about enrollment split") unless template explicitly per-child |

### 5.3 Automation → work patterns (design only)

| Event | Work instantiation |
|-------|-------------------|
| `opportunity_status_changed` → `tour_scheduled` | `record_tour_outcome` (shipped seed) |
| `child_lifecycle_status_changed` → `waitlisted` | Future: `collect_missing_information` or waitlist packet work — **explicit workflow** |
| Readiness gap | **No** direct work — optional automation if org enables |
| Attention reason | **No** direct work — optional automation if org enables |

Aligns with [`operational_work_creation_model_discovery.md`](./operational_work_creation_model_discovery.md): Readiness and Attention **signal only** by default.

---

## 6. Attention integration

Needs Attention is a **consumer** — surfaces operational awareness, does not evaluate readiness or create work.

### 6.1 How attention consumes status today

| Input | Source | Notes |
|-------|--------|-------|
| Primary entity | `opportunities` row | Resolver v2 opportunity-primary |
| Status predicates | `opportunity.status_key` | Stale rules, queue lane exclusions, lifecycle stage mapping |
| Lifecycle stage | `resolveEffectiveOpportunityLifecycleStage` | Drives `stale_new_inquiry`, quote-era codes |
| Child disposition | **Not consumed** | Gap — no `mixed_child_disposition` |
| Readiness | `ReadinessResult` via `projectReadinessToAttentionReasons` | Phase 0/1 bridge — `missing_required_info` when profile active |
| Wait buckets | `metadata.enrollment_operational.wait_bucket` | Case metadata — not OCM |

### 6.2 Recommended consumption model (frozen)

| Status concept | Attention use |
|----------------|---------------|
| **Case status** | Activity/SLA collectors, terminal exclusion, stage-aware stale thresholds |
| **Child disposition** | Conflict category only — mixed summary, candidate/case divergence |
| **Derived summary** | Input to `mixed_child_disposition` — **not** stored on record |
| **Stage membership** | **No** — attention is overlay, not lens |
| **Readiness gaps** | Projected reasons — evaluator stays in Readiness engine |

### 6.3 Grain expansion for attention

| Grain | Resolver | Status inputs |
|-------|----------|---------------|
| **case** | `resolveOpportunityAttention` (existing) | `opportunities.status_key`, metadata |
| **child / candidate** | **Future** `resolveCandidateAttention` or row plugin | OCM `outcome_status_key`, candidate age, pin state |
| **household** | Conflict reasons on case resolver | `is_mixed` + optional policy |

**Locked:** Needs Attention **must not** evaluate required information independently — readiness projection only.

---

## 7. Automation integration

Automations (workflows) are the **execution authority** for standardized mutations. Status ownership doctrine defines **what workflows may write**, not how builder configures stages.

### 7.1 How workflows consume status today

| Event | Emitted when | Typical workflow use |
|-------|--------------|---------------------|
| `opportunity_status_changed` | Case `status_key` changes | Messages, work instantiation, entity updates |
| `child_lifecycle_status_changed` | OCM `outcome_status_key` changes | Placement hooks, future rollup policies |
| `form_submitted` | Forms pipeline | Field patches — may indirectly affect readiness |
| Action execute | `executeAdminAction` | May change status at declared grain |

**Grain guards:** `assertWorkflowStatusMutationGrain`, `resolveStatusMutationGrain`, `assertChildLifecycleMutationTarget` — prevent ambiguous status patches.

### 7.2 Recommended consumption model (frozen)

| Pattern | Recommendation |
|---------|----------------|
| **Trigger on authoritative change** | Subscribe to grain-specific events — do not trigger on derived summary |
| **Update case from children** | Explicit org **rollup workflow** — never implicit in builder save |
| **Update children from case** | Discouraged — case status should not bulk-overwrite OCM dispositions |
| **Stage entry** | **No** `stage_entered` event today — use status-changed with stage profile mapping or future event |
| **Readiness / attention** | Workflows may **react** to projected signals via future events — not inline evaluator calls |
| **BOS** | May recommend status-changing actions — execution through `executeAdminAction` / workflow apply only |

### 7.3 Pre-expansion checklist for automation authors

Before adding enrollment automations:

1. Declare **target grain** (`case` | `child` | `candidate`) in workflow payload
2. Use correct **entity type** for `update_entity` (`opportunities` vs `opportunity_customer_members`)
3. Do not infer OCM id from case id alone
4. Do not patch `outcome_status_key` on opportunities row
5. Treat queue membership as **downstream effect** — not workflow precondition for truth

### 7.4 BOS expansion boundary

BOS may **read** status ownership model for recommendations:

| BOS capability | Status consumption |
|----------------|-------------------|
| **Insight** | Explain case vs child summary |
| **Recommendation** | Suggest next action keyed to correct grain |
| **Proposal** | Task Assist drafts — case-scoped default |
| **Execution** | Never writes status without governed apply |

BOS must not invent household rollup or collapse child/case labels in operator copy.

---

## 8. Risks and architectural traps

| Trap | Why dangerous | Mitigation |
|------|---------------|------------|
| **Collapsing case + child status** | Mixed households become unrepresentable; queue grain breaks | Frozen vocabulary; separate fields; qualified copy |
| **Derived status as SoT** | Race conditions, audit failure, automation loops | Summary read-only; rollups via explicit workflow policy |
| **Stage membership column** | Duplicates status truth; drifts from CRM | Lens predicates only |
| **Attention creates status** | Shadow pipeline | Resolver surfaces only |
| **Work completion implies status** | Operators think obligation = progression | Separate completion from `executeAdminAction` |
| **Builder child filters without grain** | Operators configure OCM keys on case stage — silent empty queues | Explicit filter grain in builder |
| **Single resolver for all grains** | Waitlist candidate rows forced into opportunity heuristics | Separate resolver entry points |
| **`work_unit_id` as visibility gate** | Builder-owned lenses break | `lifecycle_visibility` mode |
| **Pipeline keys forever** | Case status carries child semantics | Migration to case keys + OCM truth |
| **Auto work fan-out on mixed** | Task storms per child | Case-scoped default; explicit per-child templates |
| **Readiness re-evaluation in attention** | Duplicate rule engines | Projection bridge only |
| **BOS "household status"** | Operators trust AI over CRM | Recommendations cite authoritative fields |

---

## 9. Phased roadmap

### Phase 0 — Discovery (this document) ✅

Freeze status ownership, grain taxonomy, mixed-household rules, consumer boundaries.

### Phase 1 — Vocabulary & operator clarity (low risk)

- Consistent **Lead status** / **Child status** copy in drawer, queues, actions
- Surface `case_status_secondary_note` everywhere case + children shown together
- Document grain in queue row preview (`count_unit: children` already in v2)
- No schema changes

### Phase 2 — Builder filter grain (config)

- Lifecycle Builder stage save: `filter_grain: case | child | candidate`
- Child-grain stages configure OCM status sets, not opportunity keys
- Ready check validates grain-appropriate filters
- Depends on: builder hardening stable

### Phase 3 — Case status migration (data + workflows)

- Move active enrollment orgs toward case keys (`open` / `closed` / …)
- Redirect legacy pipeline writes to OCM where appropriate
- Update workflow triggers to grain-specific events
- Queue `filters_compat_v1` removal after cutover

### Phase 4 — Attention grain expansion

- Ship `mixed_child_disposition` on case resolver
- Readiness projection GA per dept profile
- Candidate-grain attention plugin for waitlist SLA
- Per [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md) — no redesign

### Phase 5 — Operational Work grain context

- Optional `opportunity_customer_member_id` subject for per-child work definitions
- Context snapshot includes `row_grain`
- No automatic instantiation from attention

### Phase 6 — Automation & BOS expansion

- Rollup policy templates (org opt-in workflows)
- Stage orchestration links in builder (read-only + deep link)
- BOS recommendations grain-aware
- **Gate:** Phases 0–3 complete so automations target stable ownership

### Explicitly deferred

| Item | Reason |
|------|--------|
| Household `status_key` column | Derived display sufficient |
| Lifecycle-owned task table | Operational Work is execution home |
| Builder-embedded workflow editor | Automations settings remain execution plane |
| Person pipeline status | Identity layer separate from inquiry |

---

## 10. Success criteria

| Criterion | Status |
|-----------|--------|
| Current-state audit documented | **Yes** — §1 |
| Status ownership framework with recommendations | **Yes** — §2 |
| Lifecycle grain model with authoritative sources | **Yes** — §3 |
| Mixed-household model (membership, visibility, attention, work) | **Yes** — §4 |
| Operational Work integration (no redesign) | **Yes** — §5 |
| Attention integration (no redesign) | **Yes** — §6 |
| Automation integration (no implementation) | **Yes** — §7 |
| Risks and architectural traps | **Yes** — §8 |
| Phased roadmap | **Yes** — §9 |
| Safe to freeze before Automation and BOS expansion | **Yes** |

---

## 11. Document maintenance

Update this file when:

- Case status migration completes (§1.1 transitional note)
- Builder filter grain ships (§3.4)
- `mixed_child_disposition` or candidate attention resolver ships (§4.4, §6)
- Operational Work adds child subject grain (§5)
- A recorded exception to frozen doctrine is approved

**Do not** update for routine status label or seed changes without ownership impact.

---

## Related documents

| Doc | Role |
|-----|------|
| [`completed/lifecycle_canonical_vocabulary.md`](./completed/lifecycle_canonical_vocabulary.md) | Operator + internal vocabulary |
| [`lifecycle_v2_discovery_and_operating_model.md`](./lifecycle_v2_discovery_and_operating_model.md) | V2 sections baseline |
| [`needs_attention_v2_operating_model.md`](./needs_attention_v2_operating_model.md) | Attention consumer doctrine |
| [`completed/operational_work_and_action_execution_closeout.md`](./completed/operational_work_and_action_execution_closeout.md) | Work execution spine |
| [`operational_work_creation_model_discovery.md`](./operational_work_creation_model_discovery.md) | Work instantiation doctrine |
| [`../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`](../05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md) | Child lifecycle convergence shipped |
