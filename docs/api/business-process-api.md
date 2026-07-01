# Business Process / Status / Lifecycle API

**Domain size:** ~45 route handlers. Full list: [`api-index.md` → Business Process / Status / Lifecycle](api-index.md#business-process--status--lifecycle).

The operator model is **Business Process → Stage → Record**. These routes author and operate that model: the lifecycle builder/catalog, stage work and outcomes, status definitions and transition rules, pipelines, and the department surfaces that host business processes at runtime.

> Doctrine: `docs/platform/core/business-process-system.md`, `docs/platform/core/status-and-state-system.md`. The enrollment lifecycle is a reference implementation, not platform identity.

---

## Auth & org scoping

- **Auth:** `getAdminContextCached`; department-scoped routes add `getAdminAccessContextCached` (access-scope). Lifecycle authoring is org-admin gated.
- **Scope:** Department routes (`/api/admin/departments/[departmentId]/*`) resolve effective department scope and deny out-of-scope callers. Status/lifecycle catalogs are org-scoped.

---

## Route groups

### Lifecycle builder & catalog

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/lifecycle-builder/stage-bootstrap` | GET | Stage builder bootstrap |
| `/api/admin/lifecycle-builder/process-work-views` | GET POST | Work views for a process |
| `/api/admin/lifecycle-builder/stage-work-outcomes` | GET PATCH | Stage work outcomes |
| `/api/admin/lifecycle-builder/complete-stage-work` | POST | Complete stage work |
| `/api/admin/lifecycle-builder/queue-membership-status-options` | GET | Membership status options |
| `/api/admin/lifecycle-catalog` (+ `attach-records`, `repair`, `repair-work-units`, `delete`, `cleanup-test`) | GET POST | Catalog management + repair/cleanup utilities |
| `/api/admin/lifecycle/action-intake-spec` | GET | Action intake spec for lifecycle |
| `/api/admin/business-process-layout-assignments` | GET POST | Map BP stages → layouts |

`lifecycle-catalog/{repair,repair-work-units,cleanup-test}` are operational maintenance utilities — treat as internal (the `cleanup-test` route is clearly test-only; flagged in the [audit](api-documentation-audit.md)).

### Enrollment process (reference vertical)

`/api/admin/enrollment-process/{status-stages,stage-actions,stage-runtime-config,stage-work-unit,form-coverage}` and `/api/admin/enrollment-status-transition/{context,preflight,execute}`. These implement the enrollment business process on top of the generic model. `enrollment-status-transition/execute` is an operational state-change write (preflight → execute pattern); it routes through the transition pipeline, not direct status edits.

### Status & transitions

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/status-definitions` , `/[id]` , `/inventory` | GET POST PATCH DELETE | Status definition CRUD + inventory |
| `/api/admin/status-options` | GET | Effective status options per entity |
| `/api/admin/status-transition-rules` | GET POST | Allowed transitions |

### Pipelines

`/api/admin/pipelines` , `/[id]` , `/api/admin/pipeline-stages` , `/[id]` — pipeline + stage CRUD.

### Departments (business-process hosts)

`/api/admin/departments` , `/[departmentId]` and sub-routes: `lifecycle-actions-matrix`, `lifecycle-activation(+/validate)`, `lifecycle-builder`, `lifecycle-requirements`, `lifecycle-queue-filter-audit`, `operational-bootstrap`, `opportunity-attention-preview`, `opportunity-lifecycle-kpis`, `pipeline-exact-count`, `persistence-audit`, `work-unit-queue-summaries`. These are department-scoped (access-scope gate). `persistence-audit` and `lifecycle-queue-filter-audit` are diagnostics.

---

## Validation, envelopes & side effects

- **Validation:** Manual; transition routes validate against `status-transition-rules` and use a **preflight** step before `execute`. The `lifecycle-activation/validate` route is a dedicated validation surface.
- **Envelopes:** Mixed — lists `{ <name>: [...] }`, single objects, `{ ok }` on actions.
- **Side effects:** Status execution and stage-work completion write status/state and may emit workflow events. Lifecycle activation mutates business-process configuration durably. Status changes must go through the transition pipeline (no bypassing state machines — project guardrail).

Source root: `web/app/api/admin/{lifecycle-builder,lifecycle-catalog,lifecycle,enrollment-process,enrollment-status-transition,status-*,pipelines,pipeline-stages,departments,business-process-layout-assignments}`.
