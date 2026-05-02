# CRM system

## Purpose

Cover **opportunities**, pipeline status, and CRM-adjacent admin behavior with correct identity anchors (**persons** / **customer_persons**).

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

## When this doc must be updated

Pipeline entity changes, new CRM tables, or opportunity status/role semantics shifts.
