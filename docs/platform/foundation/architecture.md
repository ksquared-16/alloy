# Architecture

**Status:** Canonical (June 2026 rebaseline). Describes **current** platform architecture — not sprint history.

> **Runtime convergence note (June 2026).** The operator runtime has converged on a **View Model–first** ownership model: each route composes one above-fold **Surface ViewModel** that owns reveal (`reveal.canCommit`), and the operator works a **condensed queue → Focus Panel** surface. The "drawer VM / composed drawer payload" stack referenced below is the **protected reveal/payload infrastructure that sits *behind* the Focus Panel** — not a competing product surface, and not a path to expand. Canonical source: [`../operator/surface-view-model-composition.md`](../operator/surface-view-model-composition.md), [`../operator/alloy-runtime-specification.md`](../operator/alloy-runtime-specification.md) (Part 16), [`../operator/focus-panel-runtime-cutover-report.md`](../operator/focus-panel-runtime-cutover-report.md), and the locked [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md). **Legacy loading paths must not be expanded.**

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

Opportunity VM is canonical; Person/Child VM cutover in progress. The composed payload + drawer VM is **reveal/payload infrastructure**; the operator-facing surface is the **Focus Panel** (one runtime, one operational subject) composed via `buildOperationalContext()`. See [`../operator/focus-panel-runtime-cutover-report.md`](../operator/focus-panel-runtime-cutover-report.md) and [`../operator/operational-context-boundary.md`](../operator/operational-context-boundary.md). Do not add new drawer-product surfaces or new queue-row renderers outside the condensed path.

---

## Business process runtime mapping

| Operator concept | Runtime construct |
|------------------|-------------------|
| Business Process | `lifecycles` + landing catalog |
| Stage | Queue lane + stage metadata + membership rules |
| Record | Entity row + drawer payload |
| *(internal)* Work Unit | `work_units` + `queue_definition` + slug bootstrap |

---

## Legacy & transitional

| Item | Status |
|------|--------|
| `/legacy-admin` | Unmigrated modules |
| Dept UUID routes | Compat/tests only |
| `AdminEntityDrawerLegacy` | Shrinking per entity |
| `contacts` table | Compatibility reads/writes |
| `messages` / `messages_outbox` | Legacy parallel to `communication_*` |

Inventory: `../../system/legacy-architecture-inventory.md`

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
- `../../system/repository-state-2026-06.md` (point-in-time snapshot)
- `docs/schema/` (generated schema reference)
