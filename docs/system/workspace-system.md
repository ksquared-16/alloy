# Workspace system

## Purpose

Document **Admin V2 workspace**: departments, work units, queues, and how operators navigate work — without confusing queue UI data for canonical records.

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

## Operational attention (Needs attention) — filtered lens

**Operational attention** is not a separate workspace subsystem: it is a **resolver-backed filter and explainability overlay** on the same opportunity queues and entity payloads.

- **Department (`/adminV2/workspace/dept/:id`):** The **Needs Attention** paired lane lists **configured buckets** from `metadata.opportunity_attention_rules.needs_attention_buckets` (with **work unit → department → platform default** precedence — `web/lib/opportunities/needsAttentionBuckets.ts`). **Trust rule:** when a **`needs_attention`** work unit exists, lane counts use **`buildWorkUnitScopedNeedsAttentionLaneBuckets`** so bucket totals align with the **same work-unit Needs attention queue** (same `work_unit_id`, resolver, and **`NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP`** window as `getWorkUnitQueueItems`). Response field **`bucket_count_scope`** tells clients whether numbers are execution-aligned (`work_unit_needs_attention_list_cap`) or org-preview fallback (`org_preview_cap_500`). Tiles mirror **work-unit compact cards**.
- **Work unit (`…/work-unit/:workUnitId`):** Needs Attention lists rows from `GET /api/admin/queues/.../needs_attention` with optional **`attention_bucket`** matching a configured bucket **`key`**. Chips/sub-tabs reflect enabled buckets from metadata (same precedence as lanes). **`QueueService.enrichOpportunityRows`** runs resolver attention for **every** opportunity queue list so rows carry **`_needs_attention`** / attention labels — **any** pipeline lane may show the subtle warning styling when the resolver marks the record. Queue rows remain preview-only (see **[Queue truth boundary](#queue-truth-boundary-critical-rule)**).
- **Drawer:** Explainability lives on **`_operational_attention`** from entity GET — surfaced as a **compact header strip** (`OperationalAttentionHeaderStrip`), not a large Overview card.

Org/work-unit tuning for visible buckets: `metadata.opportunity_attention_rules.needs_attention_buckets`. See **`docs/execution/crm-opportunity-needs-attention-count-semantics.md`** for histogram vs unique-inquiry bucket counting and saturation notes.

## Opportunity CRM compact previews — child vs program (doctrine)

Work-unit **CRM compact** queue rows show **Child** and **Program** columns using enriched preview fields, not raw opportunity rows alone.

- **Opportunity** = lifecycle / sales process (status, work unit, inquiry timing).
- **Customer** = household / account (`customers`).
- **Child roster** = **`customer_members`** for the same **`customer_id`**, filtered **`relationship = 'child'`** and **`is_active = true`**.
- **`QueueService.enrichOpportunityRows`** (`web/lib/queues/QueueService.ts`) loads those members, builds **`_crm_compact_children`** (one line per child: display name or first+last, age from DOB, optional `persons.date_of_birth` when linked), and repeats **`metadata.program_label`** on each line for the Program column until child-specific programs exist elsewhere.
- **Do not** treat **`opportunities.metadata`** as the source of truth for child names or DOB; it may hold **inquiry-only** attributes (e.g. program interest, tour dates, desired start). Duplicating household child identity into metadata is discouraged.
- Preview rows remain **non-authoritative** (see **[Queue truth boundary](#queue-truth-boundary-critical-rule)**): enrichment may **read** canonical tables to render lanes, but the queue list is still not the system of record.

**UI path:** Work-unit pages consume **`_crm_compact_children`** via **`buildWorkUnitQueueCrmCompactRowSlice`** (`web/lib/ui-v2/crmQueueRowPreviewPresentation.ts`) and `QueueBlock` fact columns.

**Typography (platform expectation):** CRM compact **fact values** (contact name, phone, email, child/program/timing cells) use shared workspace token **`--ws-type-fact-value-weight: 400`** (regular) on v2 surfaces so dense queue rows stay scannable; column heads and group labels stay heavier via **`--ws-type-fact-group-label-weight`**. Implementation: `web/app/adminV2/components/workspace/workspace.css` (`.adminv2-ws-queue-fact-value` / `.adminv2-ws-queue-fact-line` under `.adminv2-ws-crm-queue-preview`).

## Current state

- Routes under **`web/app/adminV2/`** compose the shell (`AdminV2Shell.tsx`) with workspace navigation and embedded perf overlay.
- **Departments** and **work units** model organizational scope; work units may carry **`queue_definition`** (validated v1 JSON) driving lane behavior. Per-user **department/site visibility** is enforced on workspace lists, queues/KPIs, entity drawers, and scoped mutators via **`user_access_profiles`** (see **`docs/system/configuration-system.md`**).
- **`QueueService`** (`web/lib/queues/QueueService.ts`) interprets queue definitions, applies org timezone bounds, status definitions, filters/sorts allowlists, and returns summaries + item lists for opportunities/jobs/etc.
- **`AdminV2PerfOverlay`** (`web/components/admin/AdminV2PerfOverlay.tsx`) exposes client perf markers (`window.__alloyPerf` per `web/lib/perf/alloyPerfGlobal.ts`).
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
| Department page example | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |

## Guardrails

- **Queues = preview:** Follow **[Queue truth boundary (critical rule)](#queue-truth-boundary-critical-rule)** above. Sorting/filtering is allowlisted in `QueueService`; fields not in previews may still exist on the entity — load entity GET when needed.
- From queue gestures, pass **`entityType` + `entityId` (+ action/work-unit keys)** only — never attach full row snapshots for mutations or workflows.
- **Do not** bypass org scope when listing work units or queue items (service uses admin client — callers must enforce org context).

## Known gaps / risks

- **Needs verification:** Full map of all workspace API routes vs UI entry points for each vertical.
- **Needs verification:** Attendance/staffing depth (may be thin or vertical-specific — see **Scheduling** in `product/crm-system.md`).

## When this doc must be updated

When `queue_definition` schema version changes, department routing changes, perf overlay contract changes, or **CRM compact child/program enrichment** rules change.
