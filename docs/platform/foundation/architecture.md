# Architecture

**Status:** Canonical (June 2026 rebaseline). Describes **current** platform architecture — not sprint history.

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
    → drawer VM render
```

Opportunity VM is canonical; Person/Child VM cutover in progress.

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

- `system-overview.md`
- `../core/business-process-system.md`
- `../../api/api-architecture.md` (API platform doctrine — the API layer is the platform boundary)
- `../../api/api-platform-completion.md` (internal API Platform foundation complete; future API work is expansion)
- `../platform-capabilities.md` (capability model — new operational modules are designed API-first)
- `../../system/repository-state-2026-06.md` (point-in-time snapshot)
- `docs/schema/` (generated schema reference)
