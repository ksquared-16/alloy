# Record system (RRS & entity API)

## Purpose

Clarify where **authoritative record payloads** come from for admin UI and why **queue list rows** are not equivalent.

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

Workspace navigation context for queues: **`docs/system/workspace-system.md`**.

## Current state

- **`GET /api/admin/entity/[type]/[id]`** is the generic drawer loader for many entity types.
- **Jobs** use the **record resolution system (RRS)** via `resolveJobRecord` (`web/lib/rrs/entities/job.ts`) with **`surface`** query param (`resolveRecordSurfaceParam`).
- **Opportunities** have specialized **surface** behavior today (drawer/entity route), but **full RRS parity with jobs** still **needs verification** — see `docs/product/crm-system.md` and `docs/execution/roadmap-and-gaps.md`.
- For **jobs** (RRS), responses may include **`_rrs`** metadata and a **flat** shape suitable for the drawer and overview layout.
- Other types may still be “select * + hydration” in the same route; check the branch for the type.

## How it works

1. **Drawer URL construction:** `buildAdminEntityFetchUrl` in `AdminEntityDrawer.tsx` uses `/api/admin/entity/jobs/:id?surface=...` and opportunities with `surface` when applicable; other types use the generic pattern.
2. **Resolver:** RRS composes pricing, payments, relationships, and presentation helpers depending on surface; errors return 404/500 with structured messages.
3. **Queue lists:** `QueueService` builds **preview** projections (allowlisted columns, sorting, filters) for jobs/opportunities/etc. — optimized for lane triage, not full record authority.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Entity GET route | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Job resolution | `web/lib/rrs/entities/job.ts`, `web/lib/rrs/resolveRecord.ts` |
| Surfaces | `web/lib/rrs/surfaces.ts` |
| Drawer fetch wiring | `web/components/admin/AdminEntityDrawer.tsx` |
| Queue previews | `web/lib/queues/QueueService.ts` |

## Guardrails

- **Queue vs authority:** Obey **[Queue truth boundary (critical rule)](#queue-truth-boundary-critical-rule)** above — drawer and record summaries must hydrate from entity GET / RRS, not from queue list payloads.
- **Do not** duplicate pricing, allocation, or lifecycle rules in drawer-only code — align with resolver and server helpers.
- **Do** use entity GET / resolver outputs when building summaries that must match the drawer.

## Known gaps / risks

- **Needs verification:** Which entity types beyond jobs have full RRS coverage vs flat Supabase selects.
- **Needs verification:** Long-term consolidation path for “flat” entity branches to resolver pattern.

## When this doc must be updated

When a new entity gains RRS, surfaces change, or queue preview fields gain/lose parity with resolver output.
