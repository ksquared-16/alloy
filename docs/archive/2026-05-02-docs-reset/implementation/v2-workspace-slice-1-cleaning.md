# V2 workspace — slice 1 (cleaning org, proving chain)

**Status:** Implementation spec (staging-first). **Doctrine:** [`docs/architecture/README.md`](../architecture/README.md). **Foundation already shipped:** Track A Batch 1 — RRS v0, `record_overview_layouts`, cleaning job overview config (org `7803388d-cdee-4afb-89cf-23a137f39423`), `queue_definition` v1 types/parser, [`web/lib/rrs/`](../../web/lib/rrs/).

**Purpose:** Define the **first end-to-end workspace chain** — **department → work unit → queue → record** — for the **current Alloy cleaning (staging) org**, without building the full multi-level platform, bespoke industry pages, or mature KPI/signal engines.

**Non-goals (this slice):** Full org-level workspace, work-unit membership (`work_unit_members`), full action registry, AI layout, multi-industry config, production rollout, replacing Admin V1 wholesale.

---

## 1. Slice summary

| Choice | Decision |
|--------|----------|
| **Org** | Cleaning / Alloy Bend staging org (same UUID as public booking + overview seeds; verify in staging `orgs`). |
| **Department** | **Operations** — single real department surface for cleaning operations coordination. |
| **Work unit (first)** | **Unassigned jobs** — primary proving ground (see §3.2). |
| **Record** | **Job** — existing resolver (`resolveJobRecord`), surfaces `drawer` / `overview` / `full`, cleaning overview layout row. |
| **Chain to prove** | User lands on **Operations** → opens **Unassigned jobs** work unit → **queue** lists triage rows → opens **job** in **drawer** (resolver-backed) → optional drill to **full** record. |

---

## 2. Department level — Operations

### 2.1 Responsibility

- **Coordination / throughput** (per [workspace doctrine](../architecture/workspace-work-unit-scope-doctrine.md)): orient the operator to **where work lives** (work units under Operations) and **what needs attention first** (light signals), without becoming a second jobs table.

### 2.2 What the department surface shows first

1. **Header / identity** — Department name (“Operations”), org context (implicit via admin session).
2. **Dominant block: Queues (rollup)** — Not one mega-queue: a **short list of work units** in this department (name, optional count badge from API). Each row navigates to the **work unit workspace** route.
3. **Secondary: Signals (stub)** — 1–3 **placeholder or count-only** items (e.g. “Jobs with no work unit” count if derivable from existing jobs list API with `unassigned_work_unit=true`). **No** SLA engine, **no** new signal tables in this slice.
4. **Tertiary: KPIs (stub)** — **Single strip** of 1–2 **static or manually seeded** metrics **or** “—” placeholders labeled for future (e.g. “Active jobs (dept)” if cheaply computed from existing list endpoints). **No** analytics pipeline.

### 2.3 What is NOT on this surface yet

- Full org dashboard, billing, scheduling Gantt, vendor management, deep record editing.
- **Per-user scope** beyond current admin org (defer [deferred decisions](../architecture/deferred-decisions.md)).
- **Custom page builder** or drag-and-drop layout.

### 2.4 Block matrix (department)

| Block | Present? | Dominance | Data source (slice 1) |
|-------|----------|-----------|------------------------|
| **Signals** | Yes (minimal) | Low | Counts from existing **`GET /api/admin/jobs`** queries (e.g. unassigned) or stub text |
| **KPIs** | Yes (stub) | Low | Placeholder UI or one derived count from jobs API |
| **Queues** | Yes | **High** | **Navigation list** of work units → links to work unit route; backed by **`GET /api/admin/work-units?department_id=`** + **`GET /api/admin/departments`** |
| **Work** | No | — | Deferred (no checklist engine) |
| **Context** | Optional | Low | Short help text / doctrine copy only |
| **Actions** | Optional | Low | “Manage work units” link to existing **Admin → System → Work units** (reuse, don’t rebuild) |

---

## 3. Work unit level — Unassigned jobs (recommended first)

### 3.1 Why Unassigned jobs (vs “Today’s jobs”)

| Criterion | Unassigned jobs | Today’s jobs |
|-----------|-----------------|--------------|
| **API readiness** | **`GET /api/admin/jobs?unassigned_work_unit=true`** already exists ([`web/app/api/admin/jobs/route.ts`](../../web/app/api/admin/jobs/route.ts)) | Requires **date window** on `scheduled_at` / schedule joins — not yet first-class in `queue_definition` v1 |
| **Clarity** | Single crisp predicate (`work_unit_id` IS NULL) | “Today” semantics (timezone, canceled schedules) need product rules |
| **Doctrine fit** | Triage **before** execution routing — natural entry to assign into a work unit | Strong execution view **after** routing |

**Recommendation:** Implement **Unassigned jobs** as the **first** work unit workspace. Add **“Today’s jobs”** (or a dated queue) as **slice 2** once queue API + `queue_definition` interpreter are aligned on date filters.

### 3.2 Work unit record in DB

- Staging should have (or create) a **`work_units`** row under **Operations** with **key/name** like `unassigned` / “Unassigned jobs” **or** use a **virtual** work unit in the UI only (route by slug `unassigned`) that **does not** require `jobs.work_unit_id` to point to it — **prefer a real row** for consistency with hierarchy admin and future `queue_definition` storage.
- **`queue_definition` v1:** Set JSON to match parser ([`web/lib/rrs/queue/queueDefinitionV1.ts`](../../web/lib/rrs/queue/queueDefinitionV1.ts)) **or** leave `{}` for slice 1 and drive the list **only** via the dedicated **`unassigned_work_unit`** query param (explicitly documented as **bridge** until interpreter powers the same shape).

### 3.3 What this work unit surface shows

1. **Header** — Work unit name + department breadcrumb back to Operations.
2. **Dominant: Queue** — Table or list of jobs (reuse column patterns from existing **Admin jobs** list where practical): title, customer label if join available, status, scheduled hint, work unit (empty), actions column stub.
3. **Context (light)** — Short rail or inline strip: “These jobs are not assigned to a work unit yet.”
4. **Signals** — Optional single line if unassigned count > 0 (redundant with queue; keep minimal).

### 3.4 Actions (slice 1)

- **Row click / “Open”** → open job **drawer** (resolver-backed `GET .../entity/jobs/:id?surface=drawer` or reuse existing drawer loader with surface param).
- **Assign work unit** (if already in drawer/detail) — **reuse** existing admin job edit paths; **not** required to complete in drawer for slice 1 **if** full job page already assigns — document gap if missing.
- **No** new workflow engine.

### 3.5 Stub vs real

| Area | Real | Stub |
|------|------|------|
| Queue rows | **Yes** — via existing jobs API | — |
| Queue from `queue_definition` alone | **Partial** — v1 parser exists; **interpreter endpoint** may still be missing — use **explicit unassigned filter** for this work unit | Full generic “queue from JSON only” |
| work_unit_members | — | **Stub** — org-wide admin only |
| Actions manifest | — | **Stub** — 1–2 hardcoded actions |

### 3.6 Block matrix (work unit)

| Block | Present? | Dominance | Data source |
|-------|----------|-----------|-------------|
| **Signals** | Optional | Low | Count / banner |
| **KPIs** | Optional stub | Low | Same as dept or omit |
| **Queues** | Yes | **High** | **`GET /api/admin/jobs?unassigned_work_unit=true`** (+ enrich if existing route already returns display fields) |
| **Work** | No | — | Deferred |
| **Context** | Yes | Medium | Static + optional dept/work unit labels from **`/api/admin/work-units`**, **`/api/admin/departments`** |
| **Actions** | Minimal | Low | Open record; link back to department |

---

## 4. Record level — Job (resolver-backed)

### 4.1 Drawer vs full record

| Moment | Surface | Behavior |
|--------|---------|----------|
| **First open from queue** | **`drawer`** | Fast inspect: subset of `_rrs.fields`, compact relationship group; existing **`AdminEntityDrawer`** patterns where possible |
| **Drill-in** | **`full`** | Full job detail (existing **job detail page** or expanded panel) using **`surface=full`** for resolver payload |
| **Overview-focused pass** | **`overview`** | Use when rendering **summary band** inside drawer tab or dedicated “Summary” sub-view — payload driven by **`record_overview_layouts`** for cleaning org ([migration `20260408170000_*`](../../supabase/migrations/20260408170000_record_overview_layouts_cleaning_org_jobs.sql)) |

### 4.2 What to show first in V2 for cleaning jobs

- **Drawer:** Title, status display, customer + primary person, location line, next schedule, work unit, assign vendor CTA or link, financial one-liner if already in flat payload.
- **Overview (when invoked):** Exactly what cleaning config encodes — header strip, summary grid, service/property, operational, financial bands; **relationship groups** `primary_customer_person`, `customer_account` ([`web/lib/rrs/entities/job.ts`](../../web/lib/rrs/entities/job.ts)).
- **Full:** All fields admin already expects; **no** removal of legacy behavior in this slice.

### 4.3 Deferred at record layer

- Unified **queue row payload** === **record payload** (still [deferred](../architecture/deferred-decisions.md)).
- **Field-level ABAC**, **action manifest** from DB for all surfaces.
- **Inline editing** of every `_rrs` field without existing PATCH routes.

### 4.4 Block matrix (record)

| Block | Drawer | Full | Overview surface |
|-------|--------|------|------------------|
| **Signals** | Stub / empty | Stub | Stub |
| **KPIs** | No | No | No |
| **Queues** | No | No | No |
| **Work** | No | Optional link to future checklist | No |
| **Context** | **Yes** (embedded in fields/groups) | **Yes** | **Yes** (bands) |
| **Actions** | 1–2 hardcoded | Reuse existing admin actions | Minimal |

---

## 5. First useful user journey (cleaning, staging)

1. Operator opens **V2 workspace** entry point (new shell route under admin, feature-flagged if desired).
2. Sees **Operations** department — short **signal** count (e.g. unassigned) and **list of work units** including **Unassigned jobs**.
3. Clicks **Unassigned jobs** → **work unit** view loads **queue** from **`unassigned_work_unit=true`**.
4. Clicks a **job row** → **drawer** opens with **`surface=drawer`** resolver payload (existing entity API + `_rrs`).
5. Operator switches to **Summary / Overview** tab (if present) → UI requests **`surface=overview`** (or uses embedded overview fields from `_rrs` already loaded).
6. Operator clicks **Open full record** → navigates to existing **job detail** with **`surface=full`** or legacy page that still receives enriched payload.
7. Operator assigns **work unit** (existing form) → job disappears from unassigned queue on refresh.

**Success:** One **coherent** path with **no duplicate business rules** in the client beyond composition of existing APIs + resolver.

---

## 6. Tie-in to current repo reality

### 6.1 Already exists (reuse)

- **Hierarchy APIs:** [`GET /api/admin/departments`](../../web/app/api/admin/departments/route.ts), [`GET /api/admin/work-units`](../../web/app/api/admin/work-units/route.ts) (optional `department_id`).
- **Jobs list:** [`GET /api/admin/jobs`](../../web/app/api/admin/jobs/route.ts) with **`unassigned_work_unit`**, **`work_unit_id`**, **`department_id`**.
- **Job record:** [`GET /api/admin/entity/jobs/:id`](../../web/app/api/admin/entity/[type]/[id]/route.ts) with **`?surface=`** and **`_rrs`**.
- **RRS + overview:** [`web/lib/rrs/`](../../web/lib/rrs/), cleaning **`record_overview_layouts`** seed.
- **Work unit admin:** [`web/app/admin/system/work-units/`](../../web/app/admin/system/work-units/WorkUnitsClient.tsx) for `queue_definition` JSON editing (validate with existing `parseQueueDefinition` on PATCH).
- **Drawer shell:** [`AdminEntityDrawer`](../../web/components/admin/AdminEntityDrawer.tsx) (incremental wiring to `_rrs` / surfaces).

### 6.2 New backend work (likely)

- **Optional:** `GET /api/admin/workspace/departments/:id` **or** `.../summary` that returns `{ work_units[], unassigned_count?, ... }` to avoid N+1 from the client — **not strictly required** if client composes 2–3 calls for slice 1.
- **Queue interpreter API (thin):** e.g. `GET /api/admin/work-units/:id/queue` that reads **`queue_definition`**, applies **`parseQueueDefinitionV1`** + **`buildJobQueueIntent`**, returns job ids or rows — **defer** if Unassigned uses **`unassigned_work_unit`** only; **required** for “real” queue-from-JSON story on other work units.
- **Feature flag** (optional): env or org allowlist for V2 routes.

### 6.3 New frontend work (likely)

- **V2 workspace shell** — **one** composable layout (department + work unit views) under e.g. `web/app/admin/workspace/...` with **block slots** (not six one-off pages).
- **Queue table component** shared between work unit view and (later) department rollup deep links.
- **Drawer integration** — pass **`surface`**, render **`_rrs.fields`** / overview band **progressively** (start with hybrid: existing drawer fields + `_rrs` panel).
- **Breadcrumbs:** Department → work unit → record.

### 6.4 Remain stubbed

- **Signals** beyond simple counts.
- **KPIs** beyond placeholders.
- **Work** block / checklists.
- **work_unit_members**, scoped queues per user.
- **Full action manifest** from DB.

---

## 7. Definition of done (acceptance criteria)

The slice is **done** when, on **staging**, for the **cleaning org**:

1. **Department (Operations)** — Authenticated admin can open a **V2 department view** that lists **work units** under Operations (from API) and navigate into at least **one** work unit (Unassigned jobs).
2. **Work unit (Unassigned jobs)** — Queue shows **real jobs** with `work_unit_id` null, loaded via **`GET /api/admin/jobs?unassigned_work_unit=true`** (or equivalent server filter), with stable sorting documented (e.g. `created_at` desc).
3. **Record** — Opening a job from that queue uses **resolver-backed** payload with **`surface=drawer`** (and full/overview available as above); **`_rrs.overview_layout`** is **non-null** for cleaning org when **`surface=overview`** per existing seed.
4. **No doctrine violations** — Queue row remains **preview**; authoritative edits/decisions use **record** path ([RRS](../architecture/record-rendering-system-spec.md)).
5. **Documentation** — This file updated with **actual routes** and any **intentional shortcuts** (e.g. unassigned bridge vs `queue_definition`).

**Explicitly not required for “done”:** Production deploy, all work units, KPI truth, signal engine, mobile layout polish.

---

## 8. Recommended implementation order & risks

### 8.1 Backend (before or parallel to UI)

1. Confirm **Operations** department + **Unassigned** work unit row exist on staging (seed script or manual via admin UI).
2. Verify **`GET /api/admin/jobs?unassigned_work_unit=true`** returns enough columns for queue UI; add **minimal** enrich fields to this endpoint **only if** needed (avoid duplicating resolver).
3. **Optional:** small **summary** endpoint for department view to reduce chatter.
4. **Later:** `work-units/:id/queue` using **`queue_definition` v1** for non-unassigned work units.

### 8.2 Frontend

1. **Routes + empty shell** for department and work unit (feature-flagged).
2. **Work unit queue** wired to jobs API (unassigned).
3. **Drawer** — open job with **`surface=drawer`**; show **`_rrs`** section or hybrid.
4. **Overview tab** — call **`surface=overview`** or render from cached `_rrs`.
5. **Link to full** job page + breadcrumb chain.

### 8.3 Biggest risks if built sloppily

| Risk | Consequence |
|------|-------------|
| **Second source of truth** for job rows (parallel Supabase queries in client) | Drift from server list + resolver; bugs on staging |
| **Ignoring `surface`** on entity GET | Overview layout never exercised; false “V2 done” |
| **Hardcoding org UUID** in frontend | Fails outside cleaning org — use session org |
| **Pretending `queue_definition` drives unassigned** without interpreter | Confusion; document bridge explicitly |

---

## 9. Related docs

- [`UI_V2_Workspace_System_Spec.md`](./UI_V2_Workspace_System_Spec.md) — block vocabulary (prefer architecture folder on conflicts).
- [`track-a-batch-1.md`](./track-a-batch-1.md), [`track-a-execution-plan.md`](./track-a-execution-plan.md).
- [`deferred-decisions.md`](../architecture/deferred-decisions.md).

---

## 10. Change log

| Date | Notes |
|------|--------|
| 2026-04-08 | Initial slice 1 spec (cleaning org, department → work unit → queue → record). |
