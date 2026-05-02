# System overview

## Purpose

Orient engineers and AI agents to how Alloy is structured today: org-scoped multi-tenancy, canonical entities, the event → workflow → action path, and the rules that prevent identity and data-authority mistakes.

## Current state

- Primary app surface is **Next.js** under `web/` with **Supabase** (Postgres + RLS) as the backing store.
- Every tenant operation is scoped by **`org_id`** (directly on rows or verified through FKs in admin APIs).
- **Human identity** for customers and CRM-adjacent flows is moving on **`persons`** plus **`customer_persons`** (role links). **`contacts`** still exist for compatibility and legacy paths; they are not the forward-looking canonical person model.
- Side effects that matter for business state are intended to run through **events**, **workflows**, and **admin actions**, not ad hoc UI mutations.

## How it works

- **Spine:** Org → entities (customers, opportunities, jobs, schedules, persons, …) → **immutable-ish events** (`workflow_events`) → **workflow runs** → **actions** → DB and outbound **effects** (messages, links, updates).
- **Record truth:** Detailed entity payloads for admin/drawer often come from **resolver-backed** composition (e.g. jobs via RRS), not from raw queue list rows.
- **Workspace:** Operational UX is organized by **departments** and **work units**; **queues** on work units are configured (e.g. `queue_definition` JSON) and loaded through **`QueueService`**, which returns **preview-shaped** rows.
- **Config:** JSON/config tables (status definitions, queue definitions, record layouts, etc.) **steer** presentation and allowed keys within **platform guardrails**; they do not replace authorization, workflow effects, or hard business invariants enforced in code.

## Principles (doctrine)

Aligned with platform intent; if code disagrees, fix code **or** update docs in the same change.

1. **Multi-tenant by org:** All reads/writes assume org isolation; avoid cross-org assumptions in queries and caches.
2. **Persons are canonical for people:** Prefer `persons` + `customer_persons` for customer-linked people. Do not design new features around **`contacts`** as the primary identity.
3. **Config steers, code owns invariants:** Do not implement “business truth” only in JSON. Do not hardcode one-off behavior that should be workflow/action-driven without an explicit exception and follow-up.
4. **Use the event/workflow path:** User-visible mutations that change ledger, lifecycle, or communications should emit events and run workflows where the product already does so; avoid duplicating that logic in components.
5. **Queues are previews:** List rows from queue/workspace endpoints are for triage; **resolver-backed** entity GETs and DB rows are authoritative for detail.
6. **AI respects boundaries:** AI features should call validated APIs and server actions, not invent direct DB access or raw SQL from the client.

## Source of truth / key files

| Area | Location |
|------|----------|
| Canonical events | `web/lib/emitEvent.ts` → `workflow_events` |
| Workflow execution | `web/lib/workflowRun.ts` |
| Admin action router | `web/lib/admin/actions/executeAdminAction.ts` |
| Example event + workflow fan-out | `web/app/api/action/[token]/consume/route.ts` |
| Org-scoped admin context | `web/lib/admin/getAdminContext.ts` |
| Identity/linking helpers | `web/lib/bookingCustomerPersonLink.ts`, `web/lib/bookingPersonCustomerResolve.ts` |

## Guardrails

- Do not treat **`contacts`** as the future people model.
- Do not persist important business changes only in React state or “local-only” PATCHes that skip events/workflows when the domain already uses them.
- Do not trust **queue rows** as the full record; open entity drawer / resolver payload or query the entity table.
- Do not move authorization or financial invariants into “just config” without platform review.

## Known gaps / risks

- **Needs verification:** Full inventory of code paths still writing **`contacts`** vs **`persons`** for new features (grep is_source_of_truth; product-by-product).
- **Needs verification:** Every admin mutation path may not yet emit `workflow_events` uniformly; spot-check when touching a feature.
- Legacy **`primary_contact_id`** (and similar) may still appear on **`opportunities`** alongside **`primary_person_id`** — verify per migration state in `supabase/migrations/`.

## When this doc must be updated

When org/tenant assumptions change, the canonical identity model shifts, the event/workflow spine changes, or any principle above is revised.
