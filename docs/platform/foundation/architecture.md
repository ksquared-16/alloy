# Architecture

**Status:** Canonical (July 2026 stabilization). Describes **current** platform architecture — not sprint history.

> **Platform stabilization (July 2026).** Alloy's operator plane consists of **nine foundational runtimes** — Presentation Runtime, Surface Host, Focus Panel Runtime, VM Runtime, Business Process Runtime, Processing Runtime, Communications Runtime, Configuration Runtime, and Current Work Runtime. There is **no legacy entity drawer runtime**. The composed drawer payload stack is **reveal/payload infrastructure behind the Focus Panel** — not a competing product surface. Canonical: [`../milestones/stabilization-july-2026.md`](../milestones/stabilization-july-2026.md), [`../experience/presentation-runtime-v2.md`](../experience/presentation-runtime-v2.md), [`../experience/surface-host-architecture.md`](../experience/surface-host-architecture.md), [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md).

---

## System context

```
┌─────────────────────────────────────────────────────────────┐
│                     Operator (browser)                       │
│  AdminV2Shell · Workspace · Drawers · BOS bar              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│              Next.js App Router (web/)                       │
│  Route handlers · Server components · Admin APIs             │
│  getAdminContextCached · getAdminAccessContextCached         │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐   ┌────────────────────────────┐
│ Supabase (Postgres+RLS)  │   │ External providers          │
│ org-scoped tables        │   │ SMS/email · Stripe · etc.   │
└──────────────────────────┘   └────────────────────────────┘
```

---

## Foundational runtimes (July 2026)

| Runtime | Responsibility | Canonical reference |
|---------|----------------|---------------------|
| **Presentation Runtime** | One presentation tree for Workspace, Work Unit, Queue, Focus Panel, Right Rail | [`../experience/presentation-runtime-v2.md`](../experience/presentation-runtime-v2.md) |
| **Surface Host** | Client-held surfaces; focus exchange without route teardown | [`../experience/surface-host-architecture.md`](../experience/surface-host-architecture.md) |
| **Focus Panel Runtime** | Canonical record execution surface (cards, Current Work, embeds) | [`../operator/focus-panel-architecture-vocabulary.md`](../operator/focus-panel-architecture-vocabulary.md) |
| **VM Runtime** | Entity compose, cache, reveal for Opportunity / Person / Child | [`../operator/drawer-system.md`](../operator/drawer-system.md) |
| **Business Process Runtime** | Landing catalog → stage queues → record focus | [`../core/business-process-system.md`](../core/business-process-system.md) |
| **Processing Runtime** | Digital Mailroom operational workspace | [`../modules/documents-and-forms.md`](../modules/documents-and-forms.md) |
| **Communications Runtime** | Command Center + Activity embed | [`../modules/communications-platform.md`](../modules/communications-platform.md) |
| **Configuration Runtime** | Settings control plane (`/settings/*`) | [`../modules/configuration-platform.md`](../modules/configuration-platform.md) |
| **Current Work Runtime** | Stage work completion inside Focus Panel | [`../../sprints/archive/07_2026/alloy-operator-workspace/implementation-closeout.md`](../../sprints/archive/07_2026/alloy-operator-workspace/implementation-closeout.md) |

Unsupported historical entities **fail closed** — `AdminEntityDrawer` returns `null`. Rollback is deployment/Git-based only.

---

## Operator plane

| Layer | Route pattern | Responsibility |
|-------|---------------|----------------|
| Landing | `/workspace` | Business process tiles, KPI strip |
| Stage execution | `/workspace/work-unit/:slug` | Queues, filters, actions rail |
| Record detail | `…/:recordId` | Drawer VM on same route |

**Shell:** `AdminV2Shell` — persistent sidebar, BOS bar, site filter context.

**Reveal:** Atomic above-fold reveal (Pass 3) — locked in `adminv2-runtime-performance-doctrine.md`.

---

## Configuration plane

| Layer | Route | Responsibility |
|-------|-------|----------------|
| Admin home | `/admin` | Settings hub |
| Business processes | `/admin/settings/lifecycle` | Stage builder, operating plans |
| Control plane | `/admin/settings/*` | Fields, layouts, actions, statuses |
| Authoring | `/admin/forms`, `/admin/workflows` | Forms and workflow definitions |

Four-plane settings model: Fields · Field grouping · Layouts · Actions — see `../modules/configuration-platform.md`.

---

## Data plane

- **Tenancy:** `org_id` on tenant tables; RLS policies per table (see `docs/schema/schema-policies-and-security.md`)
- **CRM scope:** Department + site visibility via `user_access_profiles`
- **Writes:** Privileged mutations through server routes with service role where required
- **Events:** Append-oriented `workflow_events` → `workflowRun.ts`

---

## Record composition stack

```
Queue row (preview)
    → select entity
    → GET /api/admin/entity/[type]/[id]
    → composed drawer payload (evaluateComposedDrawerPayload)
    → drawer VM render  →  buildOperationalContext() → Focus Panel cards
```

Opportunity, Person, and Child VM runtimes are **canonical**. The composed payload + drawer VM is **reveal/payload infrastructure**; the operator-facing surface is the **Focus Panel** (one runtime, one operational subject) composed via `buildOperationalContext()`. Locations operate through **Settings** (`/settings/locations`), not a drawer. See [`../operator/operational-context-boundary.md`](../operator/operational-context-boundary.md). Do not add new drawer-product surfaces or new queue-row renderers outside the condensed path.

---

## Embedded workspace pattern (Preview VM)

Record-scoped embedded workspaces inside the Focus Panel (Communications Activity, and future Processing/Documents/Scheduling embeds) use a **Preview VM → immediate render → background hydrate → full VM** load path. This avoids a second loading shell when the operator switches tabs inside an already-selected record.

```
Selected record
  → Preview VM on selection payload (first paint)
  → Embedded workspace renders immediately
  → Background prefetch → full workspace VM
  → Warm cache on revisit
```

**Canonical reference:** Communications Activity (`surfaceVariant="activity_embed"`) — see [`../../sprints/2026-07/communications-preview-vm-doctrine.md`](../../sprints/2026-07/communications-preview-vm-doctrine.md) and [`../modules/communications-platform.md`](../modules/communications-platform.md) § Focus Panel Activity embed.

**Reuse intent:** Processing, Documents, Scheduling, Billing, Attendance, and future embedded workspaces should adopt the same pattern — not fork parallel load paths.

---

## Business process runtime mapping

| Operator concept | Runtime construct |
|------------------|-------------------|
| Business Process | `lifecycles` + landing catalog |
| Stage | Queue lane + stage metadata + membership rules |
| Record | Entity row + drawer payload |
| *(internal)* Work Unit | `work_units` + `queue_definition` + slug bootstrap |

---

## Compatibility infrastructure (not product runtime)

| Item | Status |
|------|--------|
| `/legacy-admin` route tree | **Archived** — landing redirects to `/workspace`; shared client modules remain as import-path debt |
| Dept UUID routes | Compat/tests only — not operator product path |
| `contacts` table | Compatibility reads/writes — `persons` + `customer_persons` canonical |
| `messages` / `messages_outbox` | Legacy parallel to `communication_*` — retirement documented |

**Deleted (July 2026):** `AdminEntityDrawerLegacy` — no supported legacy entity drawer runtime.

Inventory: `../../system/legacy-architecture-inventory.md` (historical reference)

---

## Deployment

- **Hosting:** Vercel (typical) for `web/`
- **Database:** Supabase project per environment
- **Env contract:** Server-only secrets; no service role in client

See `../governance/deployment-and-environments.md`.

---

## Related docs

- `os-runtime-map.md` (**OS Runtime Map** — the nine runtime layers, the three flows, the client/server seam, the Effects/Integration service, and the Architecture Evolution & Known Gaps appendix)
- `system-overview.md`
- `../core/business-process-system.md`
- `../../api/api-architecture.md` (API platform doctrine — the API layer is the platform boundary)
- `../../api/api-platform-completion.md` (internal API Platform foundation complete; future API work is expansion)
- `../platform-capabilities.md` (capability model — new operational modules are designed API-first)
- `platform-manifesto.md` (constitutional doctrine)
- `milestones/certification-july-2026.md` (July 2026 certification)
- `../milestones/stabilization-july-2026.md` (July 2026 stabilization milestone)
- `../../system/repository-state-2026-06.md` (point-in-time snapshot)
- `docs/schema/` (generated schema reference)
