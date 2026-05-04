# CRM system

## Purpose

Cover **opportunities**, pipeline status, CRM-adjacent admin behavior, **communications** in the lead/inquiry operational loop, and **scheduling** as it shows up today (tours, enrollment lanes, and `schedules` tied to CRM/booking)—with correct identity anchors (**persons** / **customer_persons**).

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

### Purpose

Outbound/inbound messaging threads tied to **entities** and **workflows** — without duplicating send logic in UI.

### Current state (Communications V1 — as implemented in `web/`)

- **Canonical store:** **`communication_threads`** (per org + primary entity + channel + `recipient_key`) and **`communication_messages`** (outbound rows with `status`, `workflow_run_id`, optional **`communication_provider_binding_id`**, body/subject, `metadata`).
- **Canonical enqueue:** **`enqueueCanonicalOutboundMessage`** (`web/lib/communications/canonicalOutboundEnqueue.ts`) upserts the thread, inserts **`communication_messages`** with `status: queued`, then **`emitEvent`** with **`event_type: message_queued`** and fans out to enabled workflows on that event (same file).
- **Admin composer:** **`POST /api/admin/communications/send`** documents a guarded path through canonical enqueue + `message_queued` (see route header).
- **Threads / reads:** APIs under **`web/app/api/admin/communications/`** (threads, thread messages, unread counts on **`communication_messages`**, etc.).
- **Legacy parallel:** Workflow **`send_message`** / **`create_message`** paths may still write **`public.messages`** and **`messages_outbox`** (`web/lib/workflowRun.ts`, admin **`/admin/messaging`**, **`/admin/messages-outbox`**). Delivery often expects **`INTERNAL_MESSAGES_PROCESS_URL`** / cron — **no `web/app/api/internal/**` route** found in this repo; treat worker deployment as **Needs verification** per environment.
- **Opt-in dual-write mirror:** **`COMMUNICATION_DUAL_WRITE`** env + **`isCommunicationCanonicalDualWriteEnabled()`** (`web/lib/communications/communicationsEnabled.ts`) — **Partially implemented** (off unless env enables).
- **Inbound:** **`communication_messages`** with inbound direction / read tracking (e.g. unread route) — **Partially implemented**; full provider inbound matrix **Needs verification** per org.

### How it works

1. UI loads threads for an entity via admin API with org context (and **CRM scope** dimensions where the route applies **`getAdminAccessContextCached`**).
2. Send requests reference entity type/id; server validates membership and org.
3. Workflow and drawer sends should converge on **canonical enqueue** where wired; legacy SMS/email rows may still bypass until all workflows migrate.

### Source of truth / key files

| Concern | Location |
|---------|-----------|
| Thread listing | `web/app/api/admin/communications/threads/route.ts` |
| Send | `web/app/api/admin/communications/send/route.ts` |
| Canonical enqueue + `message_queued` | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| Dual-write flag | `web/lib/communications/communicationsEnabled.ts`, `web/lib/communications/mirrorQueuedMessage.ts` |
| Workflow send / legacy queue | `web/lib/workflowRun.ts` (search `send_message`, `messages_outbox`) |
| Drawer integration | `web/components/admin/AdminEntityDrawer.tsx` (communications UI sections) |

### Guardrails

- **Do not** bypass org checks or send from the client with secrets.
- **Do not** fork template composition in the drawer when a workflow/helper already defines canonical content.
- Map entity types using shared normalization — avoid ad hoc string switches in new code.
- **Identity:** Outbound pipelines that resolve **`contact_id`** / **`to_contact_id`** are **compatibility exceptions** — do not assume contacts are canonical people; align new work with **person-backed** drawer recipients where implemented (`drawer-recipients`).

### Known gaps / risks

- **Needs verification:** Production provider bindings matrix and which channels are enabled per org.
- **Needs verification:** Where **`INTERNAL_MESSAGES_PROCESS_URL`** is hosted for a given deployment (may be outside this Next app).

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

Pipeline or CRM table changes; opportunity status/role semantics; communications channels, enqueue model, or attachment types; schedule states, workforce features, or calendar integration changes.
