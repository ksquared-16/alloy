---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Business Process Layout Assignment Layer

**Status:** Implemented (June 2026). Assignment routing sits above `entity_layouts` resolution without changing LayoutDoc shape or Experience Builder surfaces.

## Problem

Layouts were resolved only by `(entity_type, surface, layout_key)` or queue `queue_context` variants. Operators need different layouts for the same surface depending on **Business Process** and **stage/status** — e.g. Enrollment Lead vs Waitlist vs Enrolled.

## Model

Table: `business_process_layout_assignments`

| Column | Purpose |
|--------|---------|
| `org_id` | Tenant scope |
| `business_process_key` | e.g. `enrollment` |
| `stage_key` | Builder stage slug (nullable = BP surface default) |
| `status_key` | Optional finer discriminator |
| `surface_key` | Registry surface: `opportunity_drawer`, `person_drawer`, `child_drawer`, `queue_record`, `waitlist_queue_record` |
| `entity_type`, `surface`, `layout_key` | Denormalized identity for validation |
| `entity_layout_id` | Optional pin to published `entity_layouts` row |
| `priority`, `is_active`, `version` | Ordering and soft-delete |

**Queue v3:** Assignment selects which `entity_layouts` queue doc applies. Operational row columns remain in `doc.metadata.queue_record_layout` — not drawer sections.

## Operator slots (BP settings)

Per stage in **Settings → Business processes**, operators assign published layouts to friendly slots:

| Stage type | Slots |
|------------|-------|
| Pipeline stages (Lead, Tour, …) | Queue layout, Drawer layout, optional Person drawer |
| Waitlist | Waitlist queue layout, Drawer layout, optional Person drawer |
| Enrolled | Queue layout, Child drawer layout, optional Person drawer |

Slot definitions: `web/lib/layout/layoutAssignmentSlots.ts`

## Resolution order

1. Exact BP + stage (+ status when set) + surface
2. BP + stage + surface
3. BP + status + surface
4. BP + surface default (no stage/status)
5. Existing surface resolution (`resolveLayout` org → default → builtin → registry)

Implementation: `web/lib/layout/resolveBusinessProcessLayoutAssignment.ts` → hooked in `resolveLayoutForOrg`.

## Runtime wiring

| Path | Context source |
|------|----------------|
| Opportunity drawer | Department active process + `lifecycle_rail.current_stage_key` + `status_key` |
| Person drawer | Department active process from linked opportunity (when `opportunityId` provided) |
| Child drawer | Same — BP/stage from opportunity context |
| Queue row | Lane `businessProcessKey` + `stage_key` or derived from `drillWorkUnitKey` |

No hardcoded enrollment defaults in person/child resolvers.

## Settings UX

**Business process settings** (`/admin/settings/business-processes`) → stage wizard → **Layout assignments**

- Per-stage slot dropdowns (published layouts only)
- Link to layout library for create/edit/publish

**Layout library** (`/admin/settings/layouts`) — surface gallery and editors only; no assignment matrix.

API: `GET/PUT/POST /api/admin/business-process-layout-assignments`

## Migration / seed

- Migration: `supabase/migrations/20260622180000_business_process_layout_assignments.sql`
- Seed helper: `seedEnrollmentBusinessProcessLayoutAssignments()` — uses operator slot model; does not delete existing layouts

## Constraints (unchanged)

- Do not redesign LayoutDoc
- Do not fork Experience Builder
- Do not create a second queue editor
- Do not move operational truth into config
