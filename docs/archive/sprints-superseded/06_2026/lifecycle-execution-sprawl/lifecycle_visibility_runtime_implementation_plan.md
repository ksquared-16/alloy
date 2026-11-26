# Lifecycle visibility — runtime implementation plan

**Path:** `docs/sprints/archive/06_2026/lifecycle_visibility_runtime_implementation_plan.md`  
**Status:** **Planning only** — no code, migrations, queue fixes, or repairs in this document  
**Date:** 2026-06-02  

**Approved architecture:**

- [lifecycle_visibility_vs_ownership_architecture.md](./lifecycle_visibility_vs_ownership_architecture.md) — Lifecycle Builder defines **operational visibility lenses**; **assignment** (`work_unit_id`) is separate.
- [lifecycle_greenfield_vs_cutover_decision.md](./lifecycle_greenfield_vs_cutover_decision.md) — **Greenfield** default; **no** automatic migration; **no** automatic reassignment on navigation.

**Purpose:** Update runtime planning so all surfaces converge on a single **visibility contract** while preserving **assignment_home** for execution, workflows, BOS routing, and ownership reporting.

**Out of scope for this plan:** SQL migrations, attach/repair automation, queue hotfixes, Enrollment cutover implementation.

---

## Planning principles

| Principle | Implication for runtime work |
|-----------|------------------------------|
| **One visibility evaluator** | All lifecycle opportunity surfaces call the same predicate builder; no ad hoc `work_unit_id` gates in QueueService branches. |
| **Assignment unchanged in Phase 1 semantics** | `work_unit_id` continues to mean execution home; Create Lead and governed transitions still write it. |
| **Greenfield is a lens policy flag** | Default lifecycle hides cross-lifecycle cohort until explicit cutover/import — not by re-tightening to strict FK. |
| **AdminV2 performance guardrails** | No page-load repair, no full-org scans on navigation; dept bootstrap may preload lens config + bounded id lists only. |
| **Queues remain preview** | Visibility changes what rows appear in previews; authoritative detail stays on entity GET. |

---

## 1. Runtime surfaces — ownership semantics today

The table below maps **requested surfaces** to code paths and documents **current** vs **target** predicates. “Ownership semantics” means treating `work_unit_id` (or department WU membership) as the primary gate for **which opportunities appear**, as opposed to Builder-driven **status + lens rules**.

### Summary matrix

| Surface | Entry / authority | Current gate (ownership-flavored) | Target gate (visibility lens) | Phase |
|---------|-------------------|----------------------------------|----------------------------------|-------|
| `/workspace/dept` | `loadDeptOperationalBootstrap` → `getDepartmentWorkUnitQueueSummaries` | Hybrid: `lifecycle_status` + **dept WU id list** (`work_unit_id IN dept OR NULL`) ∩ lane status filters | `visible(o, lens)` per stage WU; greenfield policy optional | 1 |
| `/work-unit` | `loadWorkUnitOperationalBootstrap` → `getWorkUnitQueueSummaries` / items APIs | **Strict** `work_unit_id = :wu` when no dept preload | Same evaluator as dept path; **must** pass lifecycle lens context | 1 |
| `QueueService` | `getWorkUnitQueueSummaries`, `getWorkUnitQueueItems`, lane counts | Mode split: `lifecycle_status` vs `work_unit_id`; dept boundary via `applyLifecycleDepartmentOpportunityScopeToQuery` | Central `evaluateLifecycleLensVisibility` + lane filters | 1 |
| Queue summaries | Same as QueueService (dept rollup + WU bootstrap + `GET …/work-units/:id/queues`) | Inconsistent strict vs dept-scoped | Unified lens evaluation per `lifecycle_wu_*` | 1 |
| Drawer counts | `work_unit_scope_total` on WU bootstrap; entity GET `work_unit_id` display | Scope total follows QueueService mode; drawer shows **assignment** | Scope total = visibility count; drawer shows **assignment + visible_in** metadata | 1 (counts), 2 (chrome) |
| KPIs | `GET …/opportunity-lifecycle-kpis`, workspace KPI placements | `pipeline_overview` queue filters or org-wide; **not** lifecycle lens | Explicit metric dimension: `lens_backlog` vs `assignment_home` | 2 |
| Runtime validation | `validateLifecycleActivationRuntime` | Builder: status + dept WU scope counts; legacy activation: **strict** `work_unit_id` | Visibility counts + assignment mismatch diagnostics | 1 |

### Adjacent surfaces (same Phase 1 blast radius)

| Surface | Notes |
|---------|--------|
| `GET /api/admin/work-units/[id]/queues` | Standalone summaries; today often **strict** without `departmentWorkUnitIdsForLifecycleScope`. |
| `GET …/pipeline-exact-count` | Delegates to `getWorkUnitQueueSummaries` without dept preload — strict for builder WUs. |
| `loadDeptAttentionPreviewServer` | Needs-attention cohort: org + access scope for dept preview; WU lane uses `work_unit_id` list cap in QueueService — **overlay lens**, not lifecycle stage lens. |
| Create Lead / `lifecycleRuntimeBinding` | **Writes** `assignment_home` + `status_key` — stays assignment path. |
| `attachLifecycleWorkUnitRecords` | **Writes** `work_unit_id` — cutover/attach only; not visibility. |
| Actions inventory / execute / preflight | Placement match on `work_unit_id` + `department_id` — **execution scope**, not queue visibility. |
| Workflow scope metadata | `workflowScopeMetadata` matches actions to dept/WU context — assignment-aligned. |

---

### 1.1 `/workspace/dept`

**Routes:** `web/app/adminV2/workspace/dept/[departmentId]/page.tsx`  
**Server:** `web/lib/workspace/loadDeptOperationalBootstrap.ts`  
**API:** `web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts`

#### Current ownership predicate

For each summary work unit (`lifecycle_wu_*`):

1. `resolveLifecycleOpportunityQueueScope` → `mode: "lifecycle_status"` when builder-owned stage WU metadata/key matches.
2. `departmentWorkUnitIdsForLifecycleScope` = **all** work unit ids on department row fetch (includes **inactive** `enrollment_pipeline` if still present).
3. `applyOpportunityQueueWorkUnitScope` → `work_unit_id IS NULL OR work_unit_id IN (departmentWorkUnitIds)`.
4. Lane filters from `queue_definition` (status ops) applied in QueueService.

Effective visibility:

```text
visible_dept_hybrid(o, stageLane) :=
  o.org_id = org
  AND (o.work_unit_id IS NULL OR o.work_unit_id ∈ all_dept_work_unit_ids)
  AND lane_status_filter(o.status_key)
```

This is **not** pure ownership (`work_unit_id = lensWu`), but it is **department-container** semantics: cross-department assignment (e.g. Enrollment pipeline id not in Lead Management dept list) **excludes** rows even when status matches.

#### Target visibility predicate

```text
visible(o, lens(stageWu)) :=
  o.org_id = org
  AND access_allowed(operator, o)
  AND o.status_key ∈ expectedStatusKeysForStage(lifecycle_builder, stageKey)
  AND lifecycle_lens_active(lifecycle_department_id)
  AND site_predicate(o.location_id, lens)
  AND greenfield_policy(o, lifecycle)   -- default: hide external assignment cohort
```

**Remove** `work_unit_id IN dept` as the default visibility gate. **Retain** optional `assignment_aligned_lens` mode for diagnostics and ownership reports only.

#### Performance implications

| Topic | Today | Target |
|-------|-------|--------|
| Dept bootstrap queries | One dept + one WU list query; summaries N× per stage WU | Same fetch pattern; add **compiled lens snapshot** on bootstrap (status allowlists per stage, no per-navigation Builder parse storm) |
| Summary fan-out | `getDepartmentWorkUnitQueueSummaries` with concurrency cap | Bounded parallel counts; prefer `count: exact, head` per lane with shared lens snapshot |
| Inactive WU ids in scope list | Inflates `IN (...)` clause; confusing counts | Scope list = **active lifecycle WUs only** for lens compilation; legacy pipeline excluded from visibility denominator |

#### Required indexes

- `(org_id, status_key)` — primary visibility filter (see §3).
- Existing `(org_id, work_unit_id, updated_at DESC)` — assignment-aligned previews and needs-attention caps.

#### Migration strategy

| Step | Action |
|------|--------|
| M1 | Introduce lens evaluator behind flag; dept bootstrap passes **lifecycle lens bundle** (not raw dept WU id list as visibility). |
| M2 | Align validation copy with visibility counts (already partially status-based). |
| M3 | Greenfield default via lens policy metadata — **no** row moves. |
| M4 | Remove dept-boundary hybrid as default; keep as **legacy_compat** flag until Enrollment sunset complete. |

---

### 1.2 `/work-unit`

**Routes:** `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`  
**Server:** `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`  
**Client queue loads:** queue items API, lane reveal, `work_unit_scope_total` chrome

#### Current ownership predicate

`getWorkUnitQueueSummaries` / items called **without** `departmentWorkUnitIdsForLifecycleScope` preload:

```text
visible_strict(o) := o.work_unit_id = :workUnitId ∧ lane_status_filter(o.status_key)
```

For `lifecycle_wu_*`, `resolveLifecycleOpportunityQueueScope` selects `lifecycle_status` but empty dept id list → **fallback** `eq("work_unit_id", lifecycleWorkUnitId)` (`lifecycle_status_strict_wu` in trace/debug).

This is the dominant **false empty** path when status matches but assignment points at legacy pipeline.

#### Target visibility predicate

Same as dept path for the stage lens anchored at `workUnitId`:

```text
visible(o, lens(workUnitId)) := evaluateLifecycleLensVisibility(o, lensBundle, workUnitId)
```

Dept preload optional on WU route: single **department operational-bootstrap cache** or lightweight `lifecycleLensBundleForDepartment(deptId)` (read-only, TTL), never strict FK fallback for builder WUs.

#### Performance implications

| Topic | Today | Target |
|-------|-------|--------|
| WU bootstrap | Loads single WU row + summaries | Add lens bundle reuse from session cache or dept bootstrap prefetch |
| Primary lane rows | May defer row fetch | Unchanged; row fetch uses same visibility predicate as count |
| Strict fallback | Hides misassigned-but-visible rows | Eliminate for `lifecycle_wu_*`; dev-only trace when assignment ≠ lens |

#### Required indexes

Same as §3 — status-first queries on WU page.

#### Migration strategy

| Step | Action |
|------|--------|
| M1 | **Mandatory:** WU bootstrap and `GET …/work-units/:id/queues` pass lens bundle (parity with dept). |
| M2 | UI copy: “Visible here · Assigned to {home}” when mismatch (entity GET fields). |
| M3 | No automatic reassignment on navigation (approved). |

---

### 1.3 `QueueService`

**Authority:** `web/lib/queues/QueueService.ts`  
**Scope helpers:** `web/lib/lifecycle/lifecycleOpportunityQueueScope.ts`

#### Current ownership predicate

Dual mode via `LifecycleOpportunityQueueScope`:

| Mode | SQL shape |
|------|-----------|
| `work_unit_id` | `work_unit_id = :id` |
| `lifecycle_status` + dept ids | `(work_unit_id IS NULL OR work_unit_id IN (:deptIds))` then lane status ops |
| `lifecycle_status` + empty dept ids | `work_unit_id = :lifecycleWuId` (strict) |

Jobs queues unchanged (`work_unit_id` appropriate for jobs entity).

#### Target visibility predicate

Replace `applyOpportunityQueueWorkUnitScope` ownership branch with:

```text
applyLifecycleLensToOpportunityQuery(q, lensContext) :=
  q.filter(visibilitySqlFromLens(lensContext))   -- status + site + access + greenfield
```

Keep `applyAssignmentHomeFilter(q, workUnitId)` only for:

- Assignment-aligned reporting endpoints (explicit param).
- Legacy `enrollment_pipeline` until Phase 4 retirement flag.

Lane `queue_definition` filters remain **intersection** (status ops, child grain, etc.).

#### Performance implications

| Topic | Today | Target |
|-------|-------|--------|
| `IN (deptWorkUnitIds)` | Large lists when inactive WUs included | Drop from default path; status-key predicate uses smaller index range |
| Count + preview | Parallel head + limit queries | Same pattern; ensure count/preview share identical visibility SQL |
| Debug | `lifecycleQueueEmptyDebug` | Extend with `visibility_mode`, `assignment_mismatch_count` |
| Caching | WU queue def TTL 90s | Add lens bundle version keyed by `departments.metadata` revision |

#### Required indexes

§3 — plus verify `queue_definition` lane filters do not force sequential scans on unindexed JSON paths (unchanged).

#### Migration strategy

| Step | Action |
|------|--------|
| M1 | Introduce evaluator module; QueueService calls it for `entity_type === "opportunity"` on builder lifecycles. |
| M2 | Deprecate `lifecycle_status` mode name → `lifecycle_lens` in types/logs. |
| M3 | Feature flag `lifecycle_visibility_lens_v1` per org or dept metadata. |
| M4 | Remove strict fallback for builder WUs after parity tests. |

---

### 1.4 Queue summaries

**Consumers:**

- Dept page tile counts — `loadDeptOperationalBootstrap` → `summaries.work_units[]`
- WU page lane pills — `loadWorkUnitOperationalBootstrap` → `queue.summaries`
- `GET /api/admin/work-units/[id]/queues`
- `getDepartmentWorkUnitQueueSummaries` batch path
- `work_unit_scope_total` / `work_unit_scope_queue_key` rollup in QueueService

#### Current ownership predicate

Identical to QueueService branch used for each request (see §1.3). Dept batch may pass preload; standalone API may not.

#### Target visibility predicate

Per-lane: `count({ o | visible(o, lens(stageWu, laneKey)) })`  
`work_unit_scope_total` = sum or primary-lane policy per existing `workUnitScopeTotalFromSummaries` — but counts reflect **visibility**, not assignment.

#### Performance implications

Dept bootstrap is the **critical path** (N work units × M lanes). Mitigations:

- Shared lens bundle across all stage WUs in dept.
- `summary_mode: priority` / partial counts unchanged; exact counts only for focused WU.
- Do not add per-lane Builder metadata fetch.

#### Required indexes

§3.

#### Migration strategy

Unify with QueueService Phase 1; add contract test: dept summary count = WU page count for same lens + site filter.

---

### 1.5 Drawer counts

**Not a single “lifecycle queue count” in drawer today.** Relevant pieces:

| Count / chrome | Source | Current semantics |
|----------------|--------|-------------------|
| `work_unit_scope_total` | WU operational bootstrap / queue API | QueueService scope (strict or hybrid) |
| Inquiry children row count | `inquiryChildrenRowCountFromEntity` | Entity composition, not lifecycle visibility |
| Opportunity drawer `work_unit_id` field | `opportunityEntityRecord` GET | **Assignment home** display |
| Operational attention badges | `recomputeOpportunityDrawerOperationalAttention` | Resolver on entity context, not queue scope |

#### Current ownership predicate

Indirect: operator infers cohort from WU scope total (ownership-flavored on strict WU routes).

#### Target visibility predicate

| UI element | Target |
|------------|--------|
| WU shell total | Visibility count for primary lens |
| Drawer header | Show `assignment_home` + optional `visible_in_lifecycle_departments[]` (read-only, from evaluator on GET enrichment) |
| Inquiry children | Unchanged (child grain) |

#### Performance implications

Entity GET enrichment must stay **O(1)** per opportunity — precompute visible lifecycle labels via small join or cached dept/lens map, not queue scan.

#### Required indexes

None beyond §3 for optional batch “visible in” lookup by `opportunity_id` if membership table added later (Phase 2+ optional).

#### Migration strategy

Phase 1: fix WU scope total source. Phase 2: drawer chrome fields (presentation only).

---

### 1.6 KPIs

**Routes:**

- `web/app/api/admin/departments/[departmentId]/opportunity-lifecycle-kpis/route.ts`
- Workspace KPI placements — `web/lib/kpi/*`, dept/WU surfaces

#### Current ownership predicate

Department lifecycle KPIs:

- Resolve `pipeline_overview` work unit → `applyGrowthOpportunityFiltersToQuery` on **org opportunities** (comment: legacy org-wide scope — **no `work_unit_id`**).
- Fallback: org-wide opportunities with access scope only.

KPI **placements** are config surfaces (`surface=department|work_unit`); resolver tests in `web/tests/kpi/kpiResolver.test.ts` — metrics keyed by placement, not lifecycle lens evaluator.

#### Target visibility predicate

| Metric class | Predicate |
|--------------|-----------|
| **Lens backlog KPI** | `visible(o, lens(deptLifecycle))` with status/site filters from Builder |
| **Assignment / execution KPI** | `o.work_unit_id = :home` or grouped by assignment |
| **Org funnel KPI** | `status_key` only (existing), labeled org-wide |

#### Performance implications

Today caps at 5000 rows for KPI route — visibility-first queries must use **SQL aggregation** (`count` by status bucket) not row pull when possible.

#### Required indexes

`(org_id, status_key)`, `(org_id, location_id, status_key)` for regional KPIs.

#### Migration strategy

Phase 2 only. Add `metric_dimension` to placement metadata or metric registry. Do not change placement mutation validation in Phase 1.

---

### 1.7 Runtime validation

**Authority:** `web/lib/lifecycle/validateLifecycleActivationRuntime.ts`  
**Counts:** `countLifecycleOpportunityRecordsForWorkUnit` in `lifecycleOpportunityQueueScope.ts`

#### Current ownership predicate

Builder-owned multi-WU:

```text
matching_by_status := count(o | status ∈ stageKeys ∧ (wu null ∨ wu ∈ deptWuIds))
assigned_to_lifecycle_work_unit := count(o | wu = lifecycleWuId ∧ status ∈ stageKeys)
matching_elsewhere_in_department := matching_by_status - assigned
```

Legacy single activation path:

```text
count(o | work_unit_id = activationWu ∧ status ∈ keys)
```

#### Target visibility predicate

```text
visible_count(lens) := count(o | visible(o, lens))
assignment_on_lens_count := count(o | visible(o, lens) ∧ assignment_home(o) = lensWuId)
assignment_elsewhere_count := count(o | visible(o, lens) ∧ assignment_home(o) ≠ lensWuId)
```

Validation messages:

- Greenfield + `visible_count = 0` → approved copy (no failure).
- `assignment_elsewhere_count > 0` → informational “visible but assigned elsewhere” (not queue broken).

#### Performance implications

Settings validation is **on-demand** (acceptable full counts); reuse same evaluator as runtime, no second predicate definition.

#### Required indexes

§3.

#### Migration strategy

Phase 1 with QueueService evaluator extraction. Remove misleading “misassigned” wording when visibility intentionally includes cross-assignment rows.

---

## 2. Canonical lifecycle visibility contract

### 2.1 Definitions

| Term | Definition |
|------|------------|
| **Lifecycle** | Builder-activated `departments` row with `lifecycle_builder_v1` + `lifecycle_wu_*` stage work units. |
| **Lens** | Operational view anchored at a stage work unit + lane (`queue_key`) + optional site filter. |
| **Visibility** | Boolean `visible(opportunity, lens, operatorContext)`. |
| **Assignment home** | `opportunities.work_unit_id` (nullable FK) — single execution home. |
| **Lane filter** | `queue_definition` status/child-grain ops — applied as **AND** with visibility. |
| **Greenfield policy** | Lifecycle metadata flag: default suppresses rows whose assignment home belongs to **another lifecycle department** until cutover/import. |

### 2.2 Visibility function (normative)

```text
visible(o, L, ctx) :=
  o.org_id = L.org_id
  AND record_scope_allows(ctx.access, o)
  AND o.status_key ∈ L.status_allowlist
  AND L.lifecycle_department_active
  AND site_allows(o.location_id, L.site_filter, ctx.view_site)
  AND NOT terminal_excluded(o, L)
  AND (
    L.explicit_membership_only = false
    OR exists_membership(o.id, L.lifecycle_id)
  )
  AND greenfield_allows(o, L, ctx)
```

```text
greenfield_allows(o, L, ctx) :=
  NOT L.greenfield_default
  OR assignment_home(o) IS NULL
  OR assignment_department(o) = L.lifecycle_department_id
  OR L.import_visibility_override = true
```

**Explicit non-requirement:**

```text
o.work_unit_id = L.work_unit_id   -- NOT required for visibility
```

### 2.3 Assignment function (normative)

```text
assignment_home(o) := o.work_unit_id

assigned_to_stage(o, stageWu) :=
  assignment_home(o) = stageWu.id
```

**Writes assignment home (unchanged policy):**

- Create Lead (entry stage WU from `lifecycleCreateLeadEntryBinding`)
- Governed lifecycle actions / status transitions when catalog says home follows stage
- Approved cutover import (manual)
- Explicit attach tool (manual)

**Never writes assignment home:**

- Navigation between dept / work-unit routes
- Queue refresh / bootstrap
- Visibility evaluator changes

### 2.4 Lane composition

```text
queue_row_visible(o, L, lane) :=
  visible(o, L, ctx) AND lane_filter_ops(o, lane.queue_definition)
```

### 2.5 API contract fields (runtime payloads)

Planned stable semantics for clients (names illustrative):

| Field | Meaning |
|-------|---------|
| `visibility_count` | Rows matching §2.2 + lane |
| `assignment_home_id` | From opportunity row |
| `assignment_mismatch` | `visible && assignment_home_id ≠ lens.work_unit_id` |
| `visibility_mode` | `lifecycle_lens` \| `legacy_assignment_container` |

### 2.6 Compatibility modes (transition)

| Mode | When | Visibility |
|------|------|------------|
| `legacy_assignment_container` | `enrollment_pipeline`, non-builder depts | `work_unit_id = pipelineWu` ∩ lane filters |
| `lifecycle_lens` | Builder-owned lifecycle departments | §2.2 |
| `dept_container_hybrid` | **Deprecated** after Phase 1 | Current `work_unit_id IN dept` — remove |

---

## 3. Assignment home — continued use

### 3.1 Actions

| Concern | Rule |
|---------|------|
| Action inventory resolution | Match placements by `department_id` + `work_unit_id` on **assignment home** or explicit invocation context from queue row (`ContextualActionInvocation.work_unit_id`). |
| Execute / preflight | Context `work_unit_id` is **execution target hint**; must not auto-reassign opportunity when opening from a visibility-only lens. |
| Create Lead | Sets assignment to entry stage `lifecycle_wu_*`. |
| Cross-lifecycle action | If visible in lens B but assigned in dept A, action catalog must declare whether reassignment is required — **governed**, never navigation side-effect. |

**Files (reference):** `web/lib/admin/actions/contextualActionInvocation.ts`, `web/app/api/admin/actions/*`, `web/lib/lifecycle/loadLifecycleBuilderConfiguredActions.ts`.

### 3.2 Workflow execution

| Concern | Rule |
|---------|------|
| Scope metadata | `workflowScopeMetadata` continues to use `department_id` / `work_unit_id` for **where automation is registered**, not for opportunity visibility. |
| Workflow cards on workspace | Filter automations by page context WU — unchanged. |
| Opportunity lifecycle side effects | Status transitions via registered events; assignment changes only through workflow effects explicitly configured. |

**Files (reference):** `web/lib/workflows/workflowScopeMetadata.ts`, `web/lib/workspace/fetchWorkflowAutomationWorkspacePanels.ts`.

### 3.3 BOS routing

| Concern | Rule |
|---------|------|
| Eligibility | Derived from **visibility** into assist lens + attention signals (`buildOpportunityAttentionQueueItems` cohort rules). |
| Default execution anchor | **Assignment home** on recommendation payload (`work_unit_id` on `OperationalRecommendationV1`). |
| Handoff | Queue row handoff carries `work_unit_id` from row context; recommend “reassign” as explicit action, not implicit on open. |

**Phase 3** aligns recommendation builders with §2.2; no change to assignment writes in Phase 1.

**Files (reference):** `web/lib/adminV2/bos/recommendations/*`, `web/lib/workspace/buildOpportunityAttentionQueueItems.ts`.

### 3.4 Ownership reporting

| Report / metric | Dimension |
|-----------------|-----------|
| “Executed on work unit X” | `assignment_home(o) = X` |
| “Backlog visible in lifecycle L” | `visible(o, L)` |
| “Stuck in legacy pipeline” | `assignment_home → enrollment_pipeline` + status |
| Cross-lifecycle duplicate | Count distinct `opportunity_id`; never sum lens and home counts without labeling |

**Phase 2** introduces explicit `metric_dimension` in KPI registry.

---

## 4. Indexes and query performance

### 4.1 Existing (relevant)

| Index | Migration | Use |
|-------|-----------|-----|
| `idx_opportunities_org_id` | `20260329165048_remote_schema.sql` | Org scoping |
| `idx_opportunities_work_unit_id` | `20260427173000_opportunities_work_unit_id.sql` | Assignment home lookups |
| `idx_opportunities_org_work_unit_updated` | `20260605100000_waitlist_queue_lane_query_indexes.sql` | Assignment-aligned lane previews, needs-attention caps |

### 4.2 Required for visibility-first runtime (planning — implement in dedicated migration sprint)

| Index | Columns | Rationale |
|-------|---------|-----------|
| `idx_opportunities_org_status_key` | `(org_id, status_key)` | Primary lens filter |
| `idx_opportunities_org_location_status` (optional) | `(org_id, location_id, status_key)` | Regional/site sticky filter |
| `idx_opportunities_org_status_updated` (optional) | `(org_id, status_key, updated_at DESC)` | Attention-style windows on visible cohort |

**Avoid** relying on `work_unit_id IN (large dept list)` for builder lifecycles after Phase 1.

### 4.3 Query patterns

| Pattern | Allowed | Disallowed on navigation |
|---------|---------|---------------------------|
| `eq org_id` + `in status_key` (small allowlist) | Yes | — |
| `count exact head` per lane | Yes | Full table scan repair |
| Preload lens bundle on dept bootstrap | Yes | Per-lane Builder DB fetch |
| `OR work_unit_id IN (20+ ids)` as visibility | Phase-out | Post Phase 1 default |

---

## 5. Phased implementation plan

### Phase 1 — Lifecycle runtime (visibility unification)

**Goal:** All builder-owned lifecycle **operational surfaces** use §2 visibility; eliminate strict-WU and dept-container gates for `lifecycle_wu_*`.

| Workstream | Deliverables (planning level) |
|------------|-------------------------------|
| **Evaluator module** | Single `evaluateLifecycleLensVisibility` + SQL builder from Builder config snapshot (status allowlists per stage, greenfield flag). |
| **QueueService** | Replace `applyOpportunityQueueWorkUnitScope` default path; deprecate `lifecycle_status_strict_wu` fallback. |
| **Dept bootstrap** | Pass lens bundle; filter `departmentWorkUnitIdsForLifecycleScope` to **active lifecycle WUs only** for any remaining assignment diagnostics. |
| **WU bootstrap + APIs** | `loadWorkUnitOperationalBootstrap`, `GET …/work-units/:id/queues`, queue items routes — mandatory lens bundle parity with dept. |
| **Validation** | `validateLifecycleActivationRuntime` counts use visibility + assignment mismatch breakdown. |
| **Trace / debug** | Update `lifecycleQueueTrace` / empty debug to report visibility vs assignment (no auto-repair). |
| **Tests** | Contract tests: same opp, status in two lifecycles → visible in both when greenfield allows; greenfield hides cross-dept assignment by default. |
| **Docs** | Mark `lifecycle_runtime_visibility_architecture_decision.md` superseded clauses; link this plan. |

**Exit criteria:**

- Lead Management `lifecycle_wu_lead` shows status-matching rows **within greenfield policy** without moving `work_unit_id`.
- WU direct navigation count = dept tile count for same lens.
- No navigation-time assignment writes.
- `npx tsc --noEmit` + targeted lifecycle/queue tests green.

**Explicitly not in Phase 1:** Enrollment pipeline removal, KPI dimension split, BOS catalog changes, membership table schema.

---

### Phase 2 — Reporting

**Goal:** Reporting and KPI surfaces declare **lens vs assignment** dimension; stop conflating org-wide growth filters with lifecycle backlog.

| Workstream | Deliverables |
|------------|----------------|
| **Lifecycle KPI route** | `opportunity-lifecycle-kpis` uses lens evaluator + SQL aggregates; label outputs `dimension: lens_backlog`. |
| **KPI placements / resolver** | Metric registry keys for assignment vs visibility; settings UX labels. |
| **Drawer / entity enrichment** | `visible_in_lifecycles`, `assignment_home_label` on opportunity GET (presentation). |
| **Operator exports** | Document double-count rules for multi-lifecycle. |

**Exit criteria:** Dashboard metric names explicitly state lens or home; no metric silently switches predicate when lifecycle activated.

---

### Phase 3 — BOS

**Goal:** BOS eligibility follows visibility; execution recommendations anchor on assignment unless action specifies target.

| Workstream | Deliverables |
|------------|----------------|
| **Recommendation signals** | Grounding uses `visible(o, assistLens)` not strict WU cohort. |
| **Catalog** | Actions that require reassignment expose explicit preflight. |
| **Dedup** | One recommendation per `opportunity_id` across lenses. |
| **Handoff** | Queue → Assist carries both `lens_work_unit_id` and `assignment_home_id`. |

**Exit criteria:** Opening record from Lifecycle B lens does not imply `work_unit_id` for execute unless operator confirms reassignment.

---

### Phase 4 — Legacy retirement

**Goal:** `enrollment_pipeline` inactive; orgs run **explicit cutover**; runtime defaults to `lifecycle_lens` only.

| Workstream | Deliverables |
|------------|----------------|
| **Deactivate legacy WU** | `is_active = false` on `enrollment_pipeline`; remove from dept display lists (already partially done). |
| **Cutover wizard** | Manual import per greenfield doc; moves `assignment_home` only on approval. |
| **Remove `legacy_assignment_container` mode** | QueueService drops strict pipeline path for opportunities. |
| **Archive Enrollment dept** | Config read-only; visibility rules frozen. |

**Exit criteria:** No active runtime path uses `enrollment_pipeline` as visibility authority; 17-row cohort only in Enrollment until operator imports.

---

## 6. Risk register

| Risk | Mitigation |
|------|------------|
| Phase 1 exposes cross-dept rows operators expected hidden (greenfield) | Default `greenfield_allows` strict; opt-in import only |
| Performance regression on status-wide counts | New indexes; aggregate counts; keep summary_mode partial on dept load |
| Action misfire when visible ≠ assigned | Phase 1 preflight messaging; Phase 3 catalog |
| Double-count in exec dashboards | Phase 2 metric labeling |
| Two predicate definitions drift | Single evaluator module imported by QueueService + validation |

---

## 7. Verification checklist (per phase)

| Check | Phase |
|-------|-------|
| `cd web && npx tsc --noEmit` | 1–3 |
| `cd web && npm run test -- tests/lifecycle/` | 1 |
| `cd web && npm run test -- tests/queues/` | 1 |
| Trace script parity dept vs WU (`traceLifecycleQueueRecords.ts`) | 1 |
| Manual: same `new_inquiry` visible in two lifecycles when policy allows, assignment unchanged | 1 |
| KPI route dimension labels | 2 |
| BOS execute preflight with mismatched home | 3 |

---

## 8. Related documents

| Document | Role |
|----------|------|
| [lifecycle_visibility_vs_ownership_architecture.md](./lifecycle_visibility_vs_ownership_architecture.md) | Approved architecture |
| [lifecycle_greenfield_vs_cutover_decision.md](./lifecycle_greenfield_vs_cutover_decision.md) | Greenfield / cutover policy |
| [lifecycle_runtime_visibility_architecture_decision.md](./lifecycle_runtime_visibility_architecture_decision.md) | Model C north star |
| [lifecycle_runtime_performance_guardrails.md](./lifecycle_runtime_performance_guardrails.md) | No bootstrap repair / scans |

---

## Sign-off

- [x] Runtime surfaces inventoried with current vs target predicates
- [x] Canonical visibility + assignment contract defined
- [x] Phased plan (runtime → reporting → BOS → legacy)
- [ ] Engineering sign-off on Phase 1 scope and index migration timing
- [ ] Product sign-off on greenfield default in `greenfield_allows` predicate

**No code changes in this document.**
