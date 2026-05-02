# Record system (RRS & entity API)

## Purpose

Clarify where **authoritative record payloads** come from for admin UI and why **queue list rows** are not equivalent.

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

- **Never** treat queue preview rows as the full truth for financials, legal text, or lifecycle.
- **Queue rows are preview projections only.** Any business logic, workflow execution, lifecycle transition, financial calculation, identity resolution, or drawer authority must refetch via resolver / entity GET — never hydrate authoritative sections from queue list payloads or infer outcomes from preview fields alone.
- **Do not** duplicate pricing, allocation, or lifecycle rules in drawer-only code — align with resolver and server helpers.
- **Do** use entity GET / resolver outputs when building summaries that must match the drawer.

## Known gaps / risks

- **Needs verification:** Which entity types beyond jobs have full RRS coverage vs flat Supabase selects.
- **Needs verification:** Long-term consolidation path for “flat” entity branches to resolver pattern.

## When this doc must be updated

When a new entity gains RRS, surfaces change, or queue preview fields gain/lose parity with resolver output.
