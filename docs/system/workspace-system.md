# Workspace system

> **Canonical (June 2026 rebaseline):** Operator model → [`docs/platform/core/business-process-system.md`](../platform/core/business-process-system.md)  
> Queues → [`docs/platform/operator/queue-system.md`](../platform/operator/queue-system.md)  
> This file retains expanded enrollment/runtime detail as transitional reference.

## Purpose

Document the **operator workspace**: business-process-first navigation, stage queues, and how operators execute work — without confusing queue UI data for canonical records. **Canonical:** **`docs/platform/core/business-process-system.md`**, **`docs/platform/operator/queue-system.md`**.

**Canonical hierarchy (June 2026):** Organization → **Business Process** → **Stage** → **Record**.  
Work units are runtime constructs — see **`docs/platform/core/business-process-system.md`**.  
**Not** department-first daily navigation. See **`navigation-doctrine.md`**, **`routing-doctrine.md`**.

## Ownership (June 2026 freeze)

| Concern | Owner |
|---------|--------|
| **Lifecycle catalog** | Lifecycle Hub config + `loadOperatorLifecycleLandingCards` |
| **Work unit execution** | `work_units.queue_definition`, operational bootstrap, slug routes |
| **Queue lanes** | `QueueService` + route-owned selection (`workUnitQueueSelection.ts`) |
| **Record detail** | Drawer VM + entity GET (not queue rows) |
| **Status (case)** | `opportunities.status_key` + platform header controls |
| **Status (child enrollment)** | `opportunity_customer_members.outcome_status_key` |
| **Department scope** | ACL / metadata only — `user_access_profiles`, dept metadata |

## Workspace view site (operator context)

Under **`/workspace/**`** (rewrites to `app/adminV2/workspace/**`), operators may narrow lists and queue/bootstrap fetches to one **allowed site** (`locations.location_type = site`). This is **session view context**, not configuration and not a permission elevation.

| Mechanism | Role |
|-----------|------|
| Header dropdown (`WorkspaceSiteFilterProvider`) | Live selection; `null` = all sites allowed by access scope |
| URL `workspace_site_id` | Survives `adminV2CommitNavigation` full reloads; merged on workspace path links |
| `sessionStorage` | Reload continuity when URL omits param (keyed by org + principal + access fingerprint) |
| API query `workspace_site_id` | Same param on queue/bootstrap routes → **`resolveQueueRecordScopeConstraints`** |

Helpers: `web/lib/adminV2/workspaceSiteFilterClient.ts`. Sprint: **`docs/sprints/05_2026/sticky_location_filter_hotfix.md`**.

## Queue truth boundary (critical rule)

Queue rows are **selection and preview surfaces only**.

They may be used for:

- Rendering labels, badges, timestamps, and preview fields
- Sorting and filtering rows
- Selecting an entity (`entity_type`, `entity_id`)
- Navigating to a record (e.g. opening the drawer)

Queue rows must **never** be used for:

- Business logic or lifecycle decisions
- Workflow condition evaluation
- Action payload construction
- Financial calculations (e.g. quote totals, balances)
- Identity resolution (person/contact/customer)
- Drawer or record authority
- Aggregates or KPI computation

All authoritative reads must come from:

- Entity GET endpoints (`GET /api/admin/entity/[type]/[id]`)
- Resolver-based record system (RRS)
- Server-side summary endpoints

**Rule:** Queue → select entity → refetch authoritative data → execute logic.

**Never:** Queue → execute logic directly.

## Enrollment execution vs Needs Attention overlay

- **Enrollment Pipeline (`work_unit.key === enrollment_pipeline`):** The canonical **execution** surface for childcare enrollment CRM — **one work unit per enrollment department**, not one WU per lifecycle status. **Domains** (New Leads, Tours, Waitlist, …) are **`queue_definition.ui.sections`** and header pills; each queue declares **`grain`**: **`case`** (opportunity-primary row) or **`candidate`** / child-primary (waitlist, enrolling, enrolled lanes). **Do not** model lifecycle stages as separate work units or treat **`opportunities.status_key`** as every child’s enrollment state — see **`docs/product/crm-system.md`** (case vs child lifecycle). Config templates: **`enrollmentPipelineQueueDefinitionV2.ts`** (v2 domains + grains); v1 remains in migrations/scripts for compat reads. Legacy keys (`pipeline_overview`, `early_inquiries`, status-slice WUs) are **not** canonical — URL aliases may redirect into `enrollment_pipeline`.

- **Work-unit record filters (client-side):** On `/work-unit/:id`, operators may filter/sort the **loaded preview page** via URL-synced params (`q`, `rf_*`) — **membership unchanged**; server queue GET is unchanged. Compact toolbar: capped search + collapsible filters (`WorkUnitQueueRecordFilterBar`).

- **Needs Attention:** A **resolver-backed operational overlay** (`needs_attention` **queue** + configurable **`metadata.opportunity_attention_rules.needs_attention_buckets`**). It **does not** replace pipeline stages; lenses may overlap **any** lifecycle stage. **Reason codes** are platform-owned; **visible bucket lenses** are metadata-owned (no global enrollment fallback — see **`docs/product/crm-system.md`**). On enrollment depts the queue usually lives **inside** `enrollment_pipeline`’s `queue_definition`, not on a separate work unit — see **`resolveDeptNeedsAttentionWorkUnit`** (`web/lib/workspace/resolveDeptNeedsAttentionWorkUnit.ts`).

**Operator entry (canonical):** `/workspace` lifecycle landing → `/workspace/work-unit/:slug`. Slug host: `WorkUnitSlugRouteHost`. Internal dept UUID routes remain for compat/tests — not product nav.

**Performance (June 2026):** Atomic above-fold reveal (Pass 3) — **`platform-performance-doctrine.md`**. Locked runtime rules: **`adminv2-runtime-performance-doctrine.md`**.

**Work unit page layout (June 2026 — frozen V3):** Primary column is **Header → Queue only** (no telemetry below queue). Command rail: **Actions → Workflow Telemetry → BOS** (sticky). Compact queue density, neutral icon doctrine, and width reclaim are locked — **`work-unit-layout-doctrine.md`** § Approved Layout Baseline.

**AdminV2 runtime contract (2026-05):** Composer-owned reveal for drawers and work-unit lanes — no section-local skeleton/pop-in. Code: `web/lib/adminV2/runtime/contract/`. **Locked performance doctrine (June 2026):** **`docs/system/adminv2-runtime-performance-doctrine.md`** (supersedes sprint-only **`docs/sprints/05_2026/completed/adminv2-runtime-contract.md`** for reveal/loading rules).

**AdminV2 performance closeout (May 2026 — shipped):** Reveal doctrine (`adminv2_reveal_doctrine.md`), route shell pipeline gates, WU operational bootstrap + session cache, sticky workspace site filter, generic drawer pipeline, drawer queue prev/next with adjacent prefetch, **route-owned WU queue selection** (`workUnitQueueSelection.ts` — URL `?queue=` beats bootstrap default lane; bootstrap accepts `focus_queue`). Closeout UX fixes and regression tests: **`docs/sprints/05_2026/completed/adminv2_performance_closeout.md`**. **June 2026 runtime consistency closeout:** **`docs/sprints/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`**. Backend optimization backlog: **`docs/sprints/06_2026/adminv2_backend_query_payload_optimization_phase.md`**. Broad speed sprint **closed** for runtime architecture; remaining latency is scoped backend work only.

**Child lifecycle + work-unit convergence (May 2026 — closed):** **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`** — grain-aware queues, v2 `queue_definition`, candidate-grain waitlist + child-grain enrollment runtime, read-only case rollups, strict-mode readiness tooling (activation deferred), filter/search UX. **Future:** Settings Config Management for domain/NA presentation (no full CRUD in closeout).

**Work unit runtime consolidation (May 2026 — audit only):** **`docs/sprints/05_2026/work_unit_runtime_consolidation_audit.md`** documents legacy multi-WU status cohorts vs canonical **`enrollment_pipeline`** single-WU multi-queue model — **superseded for implementation** by child-lifecycle closeout; retain for historical audit context.

## Operational attention (Needs attention) — filtered lens

**Operational attention** is not a separate workspace subsystem: it is a **resolver-backed filter and explainability overlay** on the same opportunity queues and entity payloads.

- **Department page (internal/compat — `/adminV2/workspace/dept/:id`):** The **left** paired lane is the **execution pipeline surface**: when a department work unit’s **`queue_definition`** uses **`pipeline_with_attention`** and defines a **`pipeline` UI section**, the UI renders **one row per pipeline `queue_key`** (order/labels/icons from the definition — see **`extractPipelineExecutionLanes`**). Otherwise it falls back to **one row per work unit** with summaries from the batch route. The **right** **Needs Attention** lane lists **configured buckets** from `metadata.opportunity_attention_rules.needs_attention_buckets` (with **work unit → department** precedence when the key exists on that layer; omitted key ⇒ empty lane / copy-only empty state), sorted by **`priority`** (then **`order`**). **Trust rule:** dept preview/bootstrap resolves the **execution work unit** via **`resolveDeptNeedsAttentionWorkUnit`**: standalone `work_units.key === needs_attention` **or** (enrollment canonical) **`enrollment_pipeline`** whose `queue_definition` defines a **`needs_attention`** queue. Lane counts then use **`buildWorkUnitScopedNeedsAttentionLaneBuckets`** on that work unit id (same resolver + **`NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP`** as `GET …/queues/{workUnitId}/needs_attention`). Response field **`bucket_count_scope`** tells clients whether numbers are execution-aligned (`work_unit_needs_attention_list_cap`) or org-preview fallback (`org_preview_cap_500`). Tiles use the same compact card grammar on both sides (neutral pipeline tone vs subtle attention accent).
- **Work unit (`…/work-unit/:workUnitId`):** Needs Attention lists rows from `GET /api/admin/queues/.../needs_attention` with optional **`attention_bucket`** matching a configured bucket **`key`**. Chips/sub-tabs reflect enabled buckets from metadata (same precedence as lanes). **`QueueService.enrichOpportunityRows`** runs resolver attention for **every** opportunity queue list so rows carry **`_needs_attention`** / attention labels — **any** pipeline lane may show the subtle warning styling when the resolver marks the record. Queue rows remain preview-only (see **[Queue truth boundary](#queue-truth-boundary-critical-rule)**).
- **Drawer:** Explainability lives on **`_operational_attention`** from entity GET — surfaced as a **compact header strip** (`OperationalAttentionHeaderStrip`), not a large Overview card.

Org/work-unit tuning for visible buckets: `metadata.opportunity_attention_rules.needs_attention_buckets`. **Count semantics** (below) explain when totals differ across surfaces.

## Needs attention count semantics

**Membership** uses `resolveOpportunityAttention` (resolver v2) with config from `resolveOpportunityAttentionConfigFromMetadata` and optional **`metadata.enrollment_operational`** (admin PATCH field `enrollment_operational`).

**Histograms (`attention_reason_counts`):** Each reason on an opportunity can increment its own bucket — one inquiry with three reasons contributes three counts. Sum of bins ≠ unique inquiries unless each row has one reason. Use **primary-only** summarization when copy must match “inquiries” (`summarizeAttentionReasonCountsPrimaryOnly`).

**Department lane buckets:**

- **Work-unit aligned (`bucket_count_scope: work_unit_needs_attention_list_cap`):** Pass `work_unit_id` on preview API. Counts are **unique inquiries** whose `reasons[]` intersects bucket `reason_codes` — same cap as `loadOpportunityNeedsAttentionRows` (`NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP`, default **5000**). If `candidate_window_saturated`, true matches may exceed reported totals.
- **Org preview fallback (`org_preview_cap_500`):** `source: department_attention_preview` — histogram sums over **500**-row org window when **no** execution work unit with a `needs_attention` queue exists. **Explicit fallback only**; not the enrollment happy path.

**Deep links:** Prefer `attention_reason_code`; legacy `attention_reason` (label) supported. Combine with `queue=needs_attention` for work-unit URLs.

| Surface | Cap / cohort | `total` meaning |
|---------|--------------|-----------------|
| Standalone attention API | **500** org rows | Matches in first window |
| Dept preview (scoped WU) | **5000** WU-scoped | Unique inquiries per bucket |
| Dept preview (legacy org) | **500** org | Histogram-based; not WU-aligned |
| QueueService WU summaries | **800** or **5000** | Per work-unit cohort |
| Workspace enrollment signal | **500** | Not comparable to WU tab |

**Parity rule:** Align cohort + cap before QA comparisons. Job needs-attention summaries are separate (`getNeedsAttentionSummary`).

## Queue record doctrine (operational row — locked)

Work-unit **layout-runtime operational rows** (`metadata.queue_record_layout` v3) are governed by **`docs/system/queue-record-doctrine.md`**.

**Summary:** `/settings/layouts` owns columns, fields, widgets, display modes, and link targets; the renderer owns spacing, typography, hover, and display treatment only. One linked-field path for all entities; non-linked row space opens the opportunity drawer; widgets are compact summaries; all dates **`MM-DD-YYYY`**. Queue rows remain **preview-only** — see **[Queue truth boundary](#queue-truth-boundary-critical-rule)**.

**Implementation:** `OperationalQueueRecordRow` + `QueueRecordFieldRenderer` + `QueueRecordScopedColumn`; do not reintroduce parallel person/child link or chip render paths.

---

## Opportunity CRM compact previews — child vs program (doctrine)

Work-unit **CRM compact** queue rows show **Child** and **Program** columns using enriched preview fields, not raw opportunity rows alone.

- **Opportunity** = lifecycle / sales process (status, work unit, inquiry timing).
- **Customer** = household / account (`customers`).
- **Child roster** = **`customer_members`** for the same **`customer_id`**, filtered **`relationship = 'child'`** and **`is_active = true`**.
- **Tour / pipeline dates in previews:** CRM lanes may show **tour** or follow-up timing from **`opportunities.metadata`** (mirror of confirmed **`tour_bookings`**) and/or **enriched** fields populated from **`tour_bookings`** in **`QueueService`** — convenient for sorting and cards, **not** a second source of truth. Opening the drawer should still rely on **entity GET** for the final wall time and actions.
- **Do not** treat **`opportunities.metadata`** as the source of truth for child names or DOB; it may hold **inquiry-only** attributes (e.g. program interest, tour dates, desired start). Duplicating household child identity into metadata is discouraged.
- Preview rows remain **non-authoritative** (see **[Queue truth boundary](#queue-truth-boundary-critical-rule)**): enrichment may **read** canonical tables to render lanes, but the queue list is still not the system of record.

**UI path:** Work-unit pages consume **`_crm_compact_children`** via **`buildWorkUnitQueueCrmCompactRowSlice`** (`web/lib/ui-v2/crmQueueRowPreviewPresentation.ts`) and `QueueBlock` fact columns.

**Typography (platform expectation):** CRM compact **fact values** (contact name, phone, email, child/program/timing cells) use shared workspace token **`--ws-type-fact-value-weight: 400`** (regular) on v2 surfaces so dense queue rows stay scannable; column heads and group labels stay heavier via **`--ws-type-fact-group-label-weight`**. Implementation: `web/app/adminV2/components/workspace/workspace.css` (`.adminv2-ws-queue-fact-value` / `.adminv2-ws-queue-fact-line` under `.adminv2-ws-crm-queue-preview`).

## Current state

- Routes under **`web/app/adminV2/`** compose the shell (`AdminV2Shell.tsx`) with workspace navigation and embedded perf overlay.
- **Departments** and **work units** model organizational scope; work units may carry **`queue_definition`** (validated v1 JSON) driving lane behavior. Per-user **department/site visibility** is enforced on workspace lists, queues/KPIs, entity drawers, and scoped mutators via **`user_access_profiles`** (see **`docs/system/configuration-system.md`**).
- **`QueueService`** (`web/lib/queues/QueueService.ts`) interprets queue definitions, applies org timezone bounds, status definitions, filters/sorts allowlists, and returns summaries + item lists for opportunities/jobs/etc. For **opportunities**, preview enrichment may **read** active **`tour_bookings`** (alongside mirrored **`metadata.tour_date`**) to improve tour labels — still **preview-only**; authoritative scheduling state is on the opportunity entity GET + **`tour_bookings`** tables, not the queue row JSON.
- **Waitlist placement priority (opt-in):** When **`placement_priority_v1`** is enabled on a work unit, opportunity queue rows may include **`_placement_priority`** and optional reorder within cap — **preview/triage only**; do not use for promotion decisions without entity GET. Settings: **`/adminV2/settings/placement-priority`** (**Waitlist Ranking Policy**). See **`docs/product/crm-system.md`**, **`docs/sprints/05_2026/waitlist_ranking_policy_settings_v2.md`**, and **`docs/sprints/05_2026/priority_placement_orchestration_may_2026.md`**.
- **Waitlist orchestration Phase 2 (Cards 0–7, pilot-ready):** **`QueueService` V2** expands waitlist lanes to **candidate rows** (`_placement_waitlist_row`; grouped by **`program_room_cohort_key`**). Manual order + activity events (Card 5). Forecast hooks (Card 6): optional metadata → hint chip only — **no capacity engine**. Configure at **`/adminV2/settings/placement-priority`** (ranking mode / **`shadow_mode`**, engine + profile in Advanced). V1 fallback when v2 off. Rank runtime-derived only. **Pilot playbook:** **`docs/sprints/05_2026/waitlist_orchestration_phase2_pilot_playbook.md`**. **Position display + ranking QA (May 2026):** **`docs/sprints/05_2026/waitlist_ranking_validation_position_controls.md`**.
- **`AdminV2PerfOverlay`** (`web/components/admin/AdminV2PerfOverlay.tsx`) exposes client perf markers (`window.__alloyPerf` per `web/lib/perf/alloyPerfGlobal.ts`).
- **WU queue selection authority:** `web/lib/adminV2/workUnitQueueSelection.ts` resolves authoritative lane from route query → bootstrap `focus_queue` → primary lane; drawer prev/next scoped via `opportunityDrawerQueueNavigator.ts` + `opportunityDrawerNavigatorMatchesWorkUnitSelection`. Dept → WU navigation must preserve intended pipeline lane (not default first queue).
- **Orchestrator workspace scope:** Department and work-unit pages publish **`GlobalAssistantContext.workspaceScope`** (`department_id`, optional `work_unit_id`, display names) so Workflow Assist **create** proposals inherit route context; cleared on page unmount. **`setWorkspaceScope`** is idempotent (shallow compare) — route effects must not depend on the full context object reference. See **`docs/sprints/05_2026/workflow_assist_v1.md`** and **`docs/product/bos-foundation.md`** (session state).
- Hooks such as **`useDepartmentQueueData`** fetch schedules and related lists for department views.

## How it works

- Workspace registry / links: **`web/lib/workspace/registry.ts`** (e.g. schedule metrics, paths).
- Work unit types and queue derivation helpers: **`web/lib/workspace/types.ts`**, **`web/lib/workspace/workUnitQueueDerived.ts`**.
- Queue UI config: **`web/lib/ui-v2/queueUiConfig.ts`**.
- API routes for workspace/department KPIs and queue operations are spread across **`web/app/api/admin/...`** (e.g. departments, schedules).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Admin V2 shell | `web/app/adminV2/components/AdminV2Shell.tsx` |
| Perf overlay | `web/components/admin/AdminV2PerfOverlay.tsx`, `web/lib/perf/alloyPerfGlobal.ts` |
| Queue service | `web/lib/queues/QueueService.ts` |
| Queue definition schema | `web/lib/config/queueDefinitionSchema.ts` |
| Workspace types | `web/lib/workspace/types.ts` |
| Work-unit slug route (canonical) | `web/app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx` |
| Dept WU route (compat) | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |
| WU queue selection | `web/lib/adminV2/workUnitQueueSelection.ts`, `web/lib/adminV2/workUnitQueuePillPrefetch.ts` |
| Drawer queue navigator | `web/lib/admin/opportunityDrawerQueueNavigator.ts`, `web/lib/admin/opportunityDrawerAdjacentPrefetch.ts` |

## Guardrails

- **Queues = preview:** Follow **[Queue truth boundary (critical rule)](#queue-truth-boundary-critical-rule)** above. Sorting/filtering is allowlisted in `QueueService`; fields not in previews may still exist on the entity — load entity GET when needed.
- From queue gestures, pass **`entityType` + `entityId` (+ action/work-unit keys)** only — never attach full row snapshots for mutations or workflows.
- **Do not** bypass org scope when listing work units or queue items (service uses admin client — callers must enforce org context).

## Known gaps / risks

- **Queue ordering:** Needs-attention list order and **placement priority** (when enabled) are **deterministic** in server code — **not** LLM-driven; see **`docs/product/bos-foundation.md`** (BOS capability expansion **paused**).
- **Needs verification:** Full map of all workspace API routes vs UI entry points for each vertical.
- **Needs verification:** Attendance/staffing depth (may be thin or vertical-specific — see **Scheduling** in `product/crm-system.md`).

## When this doc must be updated

When `queue_definition` schema version changes, department routing changes, perf overlay contract changes, or **CRM compact child/program enrichment** rules change.

**Inquiry children + waitlist facts (May 2026):** Opportunity drawer edits per-child **Site** and **Room / cohort** on OCM. **`persons.is_employee`** on **Person drawer → Employee status** (generic person profile — not parent-only). Public **lead_capture** intake can map child site/cohort via `intake_field_paths`. Demo batch: **`npm run dev:seed:waitlist-demo`** / **`npm run qa:waitlist:demo`**. V2 ranking stays **`shadow_mode: true`** by default. Sprint: **`docs/sprints/05_2026/waitlist_demo_readiness_final_pass.md`**.
