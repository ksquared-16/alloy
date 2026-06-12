# System overview

> **Canonical location (June 2026 rebaseline):** [`docs/platform/foundation/system-overview.md`](../platform/foundation/system-overview.md)  
> This file remains as a transitional pointer for existing links and cursor rules.

## Operator hierarchy (updated)

Organization → **Business Process** → **Stage** → **Record**

Work units are runtime constructs — see [`docs/platform/core/business-process-system.md`](../platform/core/business-process-system.md).

---

## Purpose

Orient engineers and AI agents to how Alloy is structured today: org-scoped multi-tenancy, canonical entities, the event → workflow → action path, and the rules that prevent identity and data-authority mistakes.

## Current state

- Primary app surface is **Next.js** under `web/` with **Supabase** (Postgres + RLS) as the backing store.
- Every tenant operation is scoped by **`org_id`** (directly on rows or verified through FKs in admin APIs). **CRM admin** routes additionally enforce **department** and **site** visibility via **`getAdminAccessContextCached`** (`user_access_profiles`, `user_department_access`, `user_site_access`) — see **`docs/system/roles-and-permissions.md`**, **`docs/system/configuration-system.md`**, and **`web/lib/admin/accessScope.ts`**.
- **Communications V1** (canonical threads/messages, entity-scoped UI, provider webhooks, backend dispatcher): **`docs/product/communications.md`**.
- **Forms engine foundation** (definitions, versions, public links, submissions, admin + public APIs): **`docs/product/documents-and-forms.md`** — **Forms MVP productization shipped ~2026-05-28**; **Enrollment Packet Phase 1 + Phase 2 review MVP** shipped; DCP/UX hardening in **`docs/sprints/05_2026/later-phase/`**.
- **Enrollment workspace (May 2026):** **`enrollment_pipeline` v2** — case vs child/candidate grain, OCM lifecycle SoT — **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`**, **`docs/system/workspace-system.md`**.
- **AdminV2 workspace runtime (June 2026):** Reveal gates, atomic work-unit reveal (Pass 3), WU operational bootstrap, route-owned queue selection, drawer VM pipeline — **locked baseline** in **`docs/system/platform-performance-doctrine.md`** and **`docs/system/adminv2-runtime-performance-doctrine.md`**. Platform snapshot: **`docs/system/repository-state-2026-06.md`**.
- **BOS assistive groundwork (narrow, paused for expansion):** Orchestrator, Task Assist, Workflow Assist, needs-attention enrich — **human-in-the-loop**; see **`docs/product/bos-foundation.md`**. **Not** autonomous agents; **not** the primary execution roadmap right now.
- **Human identity:** **`persons`** + **`customer_persons`** are the canonical model in code for CRM/booking writes; **`contacts`** remain for compatibility (messaging, documents, workflows, aged rows). Opportunity identity normalization is centralized in **`web/lib/opportunityIdentity.ts`**.
- Side effects that matter for business state are **intended** to run through **events**, **workflows**, and **admin actions**; high-risk gaps and exceptions are tracked in **`docs/audits/event-integrity-audit.md`** (not assumed fully closed until that audit says so).

## How it works

- **Spine:** Org → entities (customers, opportunities, jobs, schedules, persons, …) → **immutable-ish events** (`workflow_events`) → **workflow runs** → **actions** → DB and outbound **effects** (messages, links, updates).
- **Record truth:** Detailed entity payloads for admin/drawer often come from **resolver-backed** composition (e.g. jobs via RRS), not from raw queue list rows.
- **Workspace (June 2026 — lifecycle-first):** Operator UX is **Organization → Lifecycle → Work Unit → Record**. **`/workspace`** landing shows lifecycle command tiles; execution is **`/workspace/work-unit/:slug`** with configured **queues** (`queue_definition` JSON) loaded through **`QueueService`** as **preview-shaped** rows. **Departments** remain for ACL, metadata, and KPI rollup — not primary daily navigation. See **`docs/system/navigation-doctrine.md`**, **`docs/system/routing-doctrine.md`**, **`docs/system/workspace-system.md`**.
- **Config:** JSON/config tables (status definitions, queue definitions, record layouts, etc.) **steer** presentation and allowed keys within **platform guardrails**; they do not replace authorization, workflow effects, or hard business invariants enforced in code.

## Principles (doctrine)

Aligned with platform intent; if code disagrees, fix code **or** update docs in the same change.

1. **Multi-tenant by org:** All reads/writes assume org isolation; avoid cross-org assumptions in queries and caches.
2. **Persons are canonical for people:** Prefer `persons` + `customer_persons` for customer-linked people. Do not design new features around **`contacts`** as the primary identity.
3. **Config steers, code owns invariants:** Do not implement “business truth” only in JSON. Do not hardcode one-off behavior that should be workflow/action-driven without an explicit exception and follow-up.
4. **Use the event/workflow path:** User-visible mutations that change ledger, lifecycle, or communications should emit events and run workflows where the product already does so; avoid duplicating that logic in components.
5. **Queues are previews:** List rows from queue/workspace endpoints are for triage; **authoritative** detail comes from **entity GET** / record responders (e.g. jobs via RRS, opportunities via **`respondOpportunityEntityGet`**) and underlying tables — not from queue payloads.
6. **AI respects boundaries:** AI features should call validated APIs and server actions, not invent direct DB access or raw SQL from the client.

## Source of truth / key files

| Area | Location |
|------|----------|
| Canonical events | `web/lib/emitEvent.ts` → `workflow_events` |
| Workflow execution | `web/lib/workflowRun.ts` |
| Admin action router | `web/lib/admin/actions/executeAdminAction.ts` |
| Example event + workflow fan-out | `web/app/api/action/[token]/consume/route.ts` |
| Org-scoped admin context | `web/lib/admin/getAdminContext.ts` |
| CRM scope + capabilities | `docs/system/roles-and-permissions.md`; `web/lib/admin/getAdminAccessContext.ts`, `web/lib/admin/resolveAdminAccessCore.ts`, `web/lib/admin/accessScope.ts` |
| Identity/linking helpers | `web/lib/bookingCustomerPersonLink.ts`, `web/lib/bookingPersonCustomerResolve.ts`, `web/lib/opportunityIdentity.ts` |
| Routing / navigation doctrine | `docs/system/routing-doctrine.md`, `docs/system/navigation-doctrine.md` |
| Drawer doctrine | `docs/system/drawer-doctrine.md` |
| Performance doctrine | `docs/system/platform-performance-doctrine.md`, `docs/system/adminv2-runtime-performance-doctrine.md` |
| Legacy inventory | `docs/system/legacy-architecture-inventory.md` |
| Repository snapshot (June 2026) | `docs/system/repository-state-2026-06.md` |

## Guardrails

- Do not treat **`contacts`** as the future people model.
- Do not persist important business changes only in React state or “local-only” PATCHes that skip events/workflows when the domain already uses them.
- Do not trust **queue rows** as the full record; open entity drawer / resolver payload or query the entity table.
- Do not move authorization or financial invariants into “just config” without platform review.

## Product maturity (May 31 2026 — month-end closeout)

Alloy is **past proving foundational architecture viability**. May closed with **substantial operational productization**: enrollment **case vs child lifecycle** model, **`enrollment_pipeline` v2** work-unit domains, waitlist **pilot-ready** ranking, tour **Band A comms**, forms **MVP productization**, **Global Search V1**, person/location **drawer convergence**, and **partial lifecycle action alignment** — enough for **focused pilots and internal ops**, not yet **general customer readiness**.

**Current program theme:** **Operational completion + product hardening** on stable primitives. **AI groundwork is present** but **deeper agent work is paused**. **June active execution:** lifecycle runtime/configuration alignment, waitlist mutator activation, enrollment Phase 2 remainder, tour Band B+, messaging, reporting. See **`docs/execution/roadmap-and-gaps.md`** and **`docs/sprints/06_2026/`**.

## Known gaps / risks

- **Needs verification:** Residual admin reads/mutations without `getAdminAccessContextCached` / scope asserts (use grep when touching a route).
- **Needs verification:** Full inventory of inbound APIs still creating **`contacts`** without threading **`persons`** / **`customer_persons`** where applicable.
- Legacy **`primary_contact_id`** on **`opportunities`** (and similar) coexists with **`primary_person_id`** until backfill completes — see **`docs/execution/roadmap-and-gaps.md`**.

## When this doc must be updated

When org/tenant assumptions change, the canonical identity model shifts, the event/workflow spine changes, or any principle above is revised.
