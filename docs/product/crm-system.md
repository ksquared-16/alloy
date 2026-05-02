# CRM system

## Purpose

Cover **opportunities**, pipeline status, CRM-adjacent admin behavior, **communications** in the lead/inquiry operational loop, and **scheduling** as it shows up today (tours, enrollment lanes, and `schedules` tied to CRM/booking)—with correct identity anchors (**persons** / **customer_persons**).

## Current state

- **Table:** `opportunities` with org scoping, `customer_id`, `work_unit_id`, status keys, person/contact fields depending on migration age.
- **Admin:** `GET/PATCH /api/admin/opportunities/[id]`, entity drawer type `opportunities`, status definitions include **`opportunities`** and related types (`web/lib/admin/statusDefinitionsAdminEntityTypes.ts`).
- **Queues:** `QueueService` supports opportunity preview lists with field/sort allowlists and work-unit scoping tests (`web/tests/queues/QueueServiceOpportunityScoping.test.ts`).
- **Inbound leads:** Example vertical route `web/app/api/leads/gutters/route.ts` creates opportunities and emits events — still logs `contact_id` path; verify alignment with person model when extending.

## How it works

- Operators work opportunities inside **workspace queues** and open **AdminEntityDrawer** for full detail (entity GET with optional `surface`).
- Lifecycle presentation helpers: **`web/lib/admin/opportunityLifecyclePresentation.ts`**.
- KPI / department endpoints (e.g. opportunity lifecycle KPIs) read work unit `queue_definition`.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Admin opportunity API | `web/app/api/admin/opportunities/[id]/route.ts` |
| Queue opportunity handling | `web/lib/queues/QueueService.ts` |
| Status definitions | `web/lib/admin/statusDefinitionsResolve.ts` |
| Lead creation example | `web/app/api/leads/gutters/route.ts` |

## Guardrails

- Prefer linking people via **`persons` + `customer_persons`**; do not add new **contact-only** assumptions for CRM without an explicit migration plan.
- **Queue previews** are not authoritative for opportunity financials or document state — use entity GET.

## Known gaps / risks

- **Needs verification:** Opportunity **`surface`** behavior parity with jobs RRS.
- **Needs verification:** KPI definitions vs what operators see in lanes.

---

## Communications (operational loop)

### Purpose

Outbound/inbound messaging threads tied to **entities** and **workflows** — without duplicating send logic in UI.

### Current state

- Admin APIs under **`web/app/api/admin/communications/`** (threads, send, related helpers).
- Entity type normalization maps short names to tables (e.g. opportunity → `opportunities`, schedule → `schedules`) in thread routes.
- **Canonical outbound path:** `web/lib/communications/canonicalOutboundEnqueue.ts` (used to centralize enqueue behavior — verify call graph when changing send pipeline).
- Provider binding, RLS, and runbooks lived in archived docs; current code is source of truth.

### How it works

1. UI loads threads for an entity via admin API with org context.
2. Send requests reference entity type/id; server validates membership and org.
3. Complex lifecycle sends should originate from **workflows** or shared server helpers so templates stay consistent.

### Source of truth / key files

| Concern | Location |
|---------|-----------|
| Thread listing | `web/app/api/admin/communications/threads/route.ts` |
| Send | `web/app/api/admin/communications/send/route.ts` |
| Canonical enqueue | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| Drawer integration | `web/components/admin/AdminEntityDrawer.tsx` (communications UI sections) |

### Guardrails

- **Do not** bypass org checks or send from the client with secrets.
- **Do not** fork template composition in the drawer when a workflow/helper already defines canonical content.
- Map entity types using shared normalization — avoid ad hoc string switches in new code.

### Known gaps / risks

- **Needs verification:** Full provider matrix (email/SMS/push) and which are production-enabled per org.

---

## Scheduling (CRM/tour focus; jobs/attendance/staff later)

### Purpose

**Today:** `schedules` lifecycle for CRM/tour/booking-adjacent flows (admin, action links, workspace “today” lanes). **Later scope:** richer jobs/attendance/staff scheduling if/when product expands beyond current coverage.

### Current state

- **`schedules`** table with org scope; status definitions treat `schedules` as an admin entity type.
- Admin routes include **`web/app/api/admin/schedules/[id]/assign/route.ts`**, **`cancel/route.ts`**, **`reschedule/route.ts`** — typically check allowed status keys via **`assertAllowedStatusKey`** patterns.
- **Action links:** `consume-reschedule` and related routes update schedule rows consistent with workflow expectations (see comments in `web/app/api/action-links/consume-reschedule/route.ts`).
- **Workspace:** Department hooks fetch “today” schedules via **`/api/admin/schedules`** (`useDepartmentQueueData.ts`).
- **Needs verification:** Dedicated attendance, punch clock, or staffing models beyond schedule rows — grep showed thin coverage; may be vertical-specific or not yet implemented.

### How it works

1. Schedule created/updated through booking or admin flows.
2. Status transitions validated against org definitions.
3. Customer/vendor interactions may consume **action links** → **events** → **workflow** updates.

### Source of truth / key files

| Concern | Location |
|---------|-----------|
| Schedule admin APIs | `web/app/api/admin/schedules/**` |
| Schedule overview labels | `web/lib/admin/scheduleOverviewLabels.ts`, `web/lib/admin/scheduleRecordSnapshot.ts` |
| Status rules | `web/lib/admin/statusTransitionRules.ts` |
| Department data hook | `web/hooks/useDepartmentQueueData.ts` |

### Guardrails

- **Do not** change schedule times without working through validated APIs (timezone + org local day bounds matter — see `web/lib/admin/orgLocalDayBounds.ts`, `timezoneContract`).
- **Do not** bypass workflows where reschedule reasons or notifications are workflow-owned.

### Known gaps / risks

- **Needs verification:** Complete cross-vertical scheduling UX (field services vs childcare).
- **Needs verification:** Labor compliance / attendance feature depth.

---

## When this doc must be updated

Pipeline or CRM table changes; opportunity status/role semantics; communications channels, enqueue model, or attachment types; schedule states, workforce features, or calendar integration changes.
