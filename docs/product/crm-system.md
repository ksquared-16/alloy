# CRM system

## Purpose

Cover **opportunities**, pipeline status, CRM-adjacent admin behavior, and **scheduling** as it shows up today (tours, enrollment lanes, and `schedules` tied to CRM/booking)—with correct identity anchors (**persons** / **customer_persons**). **Communications** in the lead loop are documented in **`docs/product/communications.md`**.

## Current state

- **Table:** `opportunities` with org scoping, `customer_id`, `work_unit_id`, status keys, person/contact fields depending on migration age.
- **Admin:** `GET/PATCH /api/admin/opportunities/[id]`, entity drawer type `opportunities`, status definitions include **`opportunities`** and related types (`web/lib/admin/statusDefinitionsAdminEntityTypes.ts`).
- **Queues:** `QueueService` supports opportunity preview lists with field/sort allowlists and work-unit scoping tests (`web/tests/queues/QueueServiceOpportunityScoping.test.ts`).
- **Opportunity identity (writes):** All server paths that `insert` / `update` `opportunities` must run **`normalizeOpportunityWritePayload`** (`web/lib/opportunityIdentity.ts`) on the payload when identity keys may appear; metadata-only patches no-op. **`primary_person_id`** is canonical when present; **`primary_contact_id`** is legacy fallback only — resolution fills `primary_person_id` from `contacts.person_id` when possible. Python/sync use **`enrich_opportunity_payload_person_first`** before PostgREST writes.
- **Child facts vs metadata:** Enrollment opportunities do **not** rely on **`metadata`** for child names or DOB. **Household children** live in **`customer_members`** (`relationship = 'child'`, `is_active = true`), joined **`opportunities.customer_id` → `customer_members.customer_id`**. Queue **CRM compact** lanes use **`QueueService`** to emit **`_crm_compact_children`** and **`metadata.program_label`** for the Program column per child. See **`docs/system/workspace-system.md`** (CRM compact doctrine) and **`docs/system/entity-model.md`**.

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
| Opportunity identity normalization | `web/lib/opportunityIdentity.ts` (`normalizeOpportunityWritePayload`, `insertOpportunityWithPersonFirst`) |

## Guardrails

- Prefer linking people via **`persons` + `customer_persons`**; **`contacts`** are **legacy/compatibility only** (drawer, messaging, workflows, documents, vendor/GHL paths).
- When an opportunity or job row has both identity FKs, **`primary_person_id` wins** for new CRM logic **when populated**; keep **`primary_contact_id`** for compatibility until messaging/workflows no longer require it.
- **Queue previews** are not authoritative for opportunity financials or document state — use entity GET.
- **CRM compact child column:** Preview child lines come from **`customer_members`** enrichment; do not reintroduce **`metadata.child_name`** (or similar) as the primary source for new work.

## Known gaps / risks

- **Needs verification:** KPI definitions vs what operators see in lanes (queue summaries vs department KPI routes).

---

## Communications (operational loop)

Canonical documentation: **`docs/product/communications.md`** (threads, enqueue, worker delivery, webhooks, bindings, legacy parallel paths).

---

## Scheduling (CRM/tour focus; jobs/attendance/staff later)

### Purpose

**Today:** `schedules` lifecycle for CRM/tour/booking-adjacent flows (admin, action links, workspace “today” lanes). **Later scope:** richer jobs/attendance/staff scheduling if/when product expands beyond current coverage.

### Current state

- **`schedules`** table with org scope; status definitions treat `schedules` as an admin entity type.
- Admin routes include **`web/app/api/admin/schedules/[id]/assign/route.ts`**, **`cancel/route.ts`**, **`reschedule/route.ts`** — typically check allowed status keys via **`assertAllowedStatusKey`** patterns.
- **Action links:** `consume-reschedule` and related routes update schedule rows consistent with workflow expectations (see comments in `web/app/api/action-links/consume-reschedule/route.ts`).
- **Workspace:** Department hooks fetch “today” schedules via **`/api/admin/schedules`** (`useDepartmentQueueData.ts`).
- **Not implemented (beyond `schedules` + booking/admin flows):** Dedicated attendance, punch clock, or multi-team **staff scheduling platform** — **Needs verification** for vertical-specific extensions.

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

Pipeline or CRM table changes; opportunity status/role semantics; schedule states, workforce features, or calendar integration changes. Communications channels/enqueue — **`docs/product/communications.md`**.
