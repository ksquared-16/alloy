# Workspace / Queue / Focus Panel API

**Domain size:** ~48 route handlers. Full list: [`api-index.md` → Workspace / Queue / Focus Panel](api-index.md#workspace--queue--focus-panel).

Routes that power the operator runtime surface: work-unit bootstrap and queues, focus-panel/drawer **view models**, layout runtime bodies, KPI/metrics strips, analytics platform, and global search.

> Runtime reveal/performance behavior for these surfaces is **protected infrastructure** — see `.cursor/rules/adminv2-runtime-performance.mdc` and `docs/system/adminv2-runtime-performance-doctrine.md`. This doc describes the API contract only; it does not change reveal gates.

---

## Auth & org scoping

- **Auth:** `loadAdminRouteGate` (single-pass org + scope) is common in the newer workspace routes; older ones use `getAdminContextCached` + `getAdminAccessContextCached`. Analytics uses `requireAnalyticsV2AdminContext` / `…Mutate`.
- **Scope:** Department/site scope is enforced — work-unit and department routes resolve effective scope dimensions and deny out-of-scope access; queue/KPI reads return empty rather than foreign data. **Queue rows are previews only**; authoritative detail comes from the entity/record routes.

---

## Route groups

### Work units & queues

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/work-units` , `/api/admin/work-units/[id]` | Work unit metadata/bootstrap |
| GET | `/api/admin/work-units/by-slug/[workUnitSlug]` | Slug → work unit resolution for `/workspace/work-unit/:slug` |
| GET | `/api/admin/work-units/[id]/queues` , `/opportunity-queue` , `/opportunity-attention-queue` , `/lane-previews` | Queue/lane previews |
| GET | `/api/admin/work-units/[id]/operational-bootstrap` | Above-fold surface bootstrap |
| GET | `/api/admin/queues/[workUnitId]/[queueKey]` | Generic queue read by key |
| GET | `/api/admin/departments/[departmentId]/work-unit-queue-summaries` | Department roll-up of queue counts |
| GET | `/api/admin/workspace/site-filter` | Site-filter context for the shell |
| GET/POST | `/api/admin/workspace-kpi-placements` | KPI strip placements |

### Focus-panel / drawer view models

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/view-models/drawer/opportunity/[id]` | Opportunity drawer/focus-panel VM (canonical) |
| GET | `/api/admin/view-models/drawer/person/[id]` | Person VM |
| GET | `/api/admin/view-models/drawer/child/[id]` | Child VM |
| GET | `/api/admin/v2/view-models/drawer/{opportunity,person,child}/[id]` | **Re-export aliases** of the non-`v2` routes (compatibility) |

The `v2/view-models/*` handlers are one-line `export { GET } from "…"` re-exports — they inherit auth and behavior from the non-`v2` route. Tracked as an alias in the [audit](api-documentation-audit.md).

### Layout runtime & proof (internal-leaning)

`/api/admin/layout-runtime/{opportunity-drawer-body,child-drawer-body,person-drawer-body,opportunity-queue-layout,opportunity-queue-row-shadow,opportunity-drawer-shadow}` and `/api/admin/layout-proof/*` build/verify runtime layout bodies. The `*-shadow` and `layout-proof/*` routes are diagnostics/verification surfaces (stability `internal`).

### Metrics, KPIs & analytics

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/api/admin/metrics/resolve` , `/trends` , `/kpi-targets` | Operator KPI strips | admin-context |
| POST | `/api/admin/metrics/snapshots/write` | Persist metric snapshots | admin-context |
| GET/POST | `/api/admin/analytics/metrics` , `/[id]` (+ `copy`/`preview`/`trend`/`snapshot`) | Analytics V2 metric definitions — **GET Phase 2 migrated:** `{ ok, data: { items, adapters }, correlation_id }` (POST/PATCH deferred) | `requireAnalyticsV2Admin*` |
| GET/POST | `/api/admin/analytics/{placements,rollups,visualizations,surfaces}` | Analytics placements & rollups | `requireAnalyticsV2Admin*` |
| POST | `/api/admin/analytics/render` , `/snapshots/run` | Render / batch snapshot | `requireAnalyticsV2Admin*` |

The analytics platform is the **best-validated** corner of the API: it uses schema validators (`validateMetricDefinitionCreate`, `validateSource*`) and `zodErrorResponse`. **Phase 2:** `GET /api/admin/analytics/metrics` now returns the standard `{ ok, data: { items, adapters }, correlation_id }` envelope (its sole consumer, `fetchMetricDefinitions`, unwraps `data`); POST/PATCH stay on the legacy `{ item }` / `{ error }` shape pending a coordinated builder-panel migration. See [`api-response-contract.md`](api-response-contract.md).

### Global search

`GET /api/admin/global-search?q=&limit=` — cross-entity search (children, parents/guardians, leads, campuses) scoped by org + department + site. Auth via access-scope context.

### Operational enrollment

`GET /api/admin/operational-enrollment/summary` — enrollment summary surface (vertical-specific).

---

## Validation, envelopes & side effects

- **Validation:** Query-param driven (`department_id`, `work_unit_id`, `surface`, `q`, `limit`) with `400` on missing required params. Analytics uses schema validators.
- **Envelopes:** Lists return `{ <name>: [...] }` (e.g. `{ actions }`); view models return their VM object. `analytics/metrics` GET is migrated to the standard `{ ok, data, correlation_id }` contract.
- **Side effects:** Mostly reads. `metrics/snapshots/write`, `analytics/snapshots/run`, and KPI placement writes persist data; action/queue reads call `revalidateTag` indirectly via the actions domain.

Source root: `web/app/api/admin/{work-units,queues,workspace,view-models,v2/view-models,layout-runtime,layout-proof,metrics,analytics,global-search,operational-enrollment}`.
