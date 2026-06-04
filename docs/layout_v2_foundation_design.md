# Layout V2 — Foundation Design

**Sprint:** Layout Configuration V2 Foundation
**Branch:** `layout-v2-foundation`
**Status:** Implemented (foundation). **No runtime adoption.** Production drawers and queues are unchanged.
**Companion audit:** [LAYOUT_CONFIG_V2_FOUNDATION_AUDIT.md](LAYOUT_CONFIG_V2_FOUNDATION_AUDIT.md)

---

## 0. Summary

This sprint moves presentation configuration from hardcoded TypeScript
([`web/lib/entityPresentation.ts`](../web/lib/entityPresentation.ts), "Layer 0")
into a configurable, versioned, database-backed layer — **without touching the
live runtime**. It delivers the schema, persistence, resolver, migration
utility, a preview renderer, and a config UI, all behind a flag and isolated
from the drawer/queue/workspace rendering paths and the parallel performance
rebuild.

The legacy registry remains intact as the permanent fallback. An org with zero
Layout V2 rows behaves exactly as today. Publishing a layout has **no runtime
effect** in this sprint; adoption is a later, separate sprint.

### What was built

| Deliverable | Files |
|---|---|
| **A. Schema + resolver** | `web/lib/layout/layoutV2.ts`, `layoutV2Schema.ts`, `layoutResolver.ts` |
| **B. Persistence + API** | `supabase/migrations/20260603120000_entity_layouts_v2.sql`, `web/lib/layout/entityLayoutsRepo.ts`, `web/app/api/admin/entity-layouts/{route.ts,[id]/route.ts,[id]/publish/route.ts}` |
| **C. Preview renderer** | `web/components/layout/LayoutPreviewRenderer.tsx` |
| **D. Config UI** | `web/app/admin/system/layouts/{page.tsx,LayoutsClient.tsx}` + nav entry in `AdminLayout.tsx` |
| **E. Migration utility** | `web/lib/layout/migrateFromRegistry.ts` |
| Feature flag | `web/lib/layout/featureFlag.ts` |
| Tests | `web/tests/layout/layoutV2.test.ts` (12 tests, passing) |

Only one pre-existing runtime file was edited: a single additive nav line in
`web/components/admin/AdminLayout.tsx`. No renderer, no `entityPresentation.ts`,
no bootstrap/loader, no workspace code was modified.

---

## 1. Schema (the layout document)

The document model is a fixed-depth hierarchy — **no arbitrary nesting**:

```
Layout (LayoutDoc)
└─ Section
   └─ Row
      └─ Column   (grid width 1..12)
         └─ Item  (field | field_group | related_list | widget_placeholder)
```

Defined in [`layoutV2.ts`](../web/lib/layout/layoutV2.ts). Key decisions:

- **Surfaces (Sprint 1):** `drawer | queue` only. Workspace / dashboard /
  record-workspace are out of scope and rejected by the validator and the DB
  `CHECK` constraint.
- **Item kinds (Sprint 1):** `field`, `field_group`, `related_list`,
  `widget_placeholder`. A `field_group` may hold a **single flat level** of
  `field` items (a labeled cluster) — nested groups are rejected. The
  `widget_placeholder` is a *contract only*: Layout V2 positions a widget by key
  (e.g. `jobs.pricing`); the widget owns its own data and behavior. We do not
  try to generalize every custom widget this sprint.
- **Render hints:** a closed, presentation-only enum aligned 1:1 with the
  existing renderer vocabulary (`text | status | date | datetime | money | link
  | badge | phone | primary_yes_no | custom`). A hint selects a renderer; it
  carries no styling.
- **No styling fields anywhere.** No className, style, color, or theme. Layout
  controls only structure, order, grouping, and the closed render-hint. Grid
  positioning is an integer `width` (1..12) and item order.
- **Presentation only.** No `required`, status logic, workflow, action,
  permission, or business-rule fields exist in the document. Lifecycle
  references layouts; layouts never own lifecycle.

### Validation & parsing

[`layoutV2Schema.ts`](../web/lib/layout/layoutV2Schema.ts) hand-rolls validation
(no new dependency — `zod` is not a direct dep of `web`). `parseLayoutDoc(input)`
returns `{ ok, doc, errors, warnings }` and enforces:

- exact hierarchy depth and shape;
- closed enums for surface / item-kind / render-hint;
- `field_group` may only contain flat `field` items;
- unique ids across the whole document;
- integer column widths clamped to `[1, 12]`; rows whose column widths exceed 12
  parse with a **warning** (they wrap) rather than an error.

Validation runs at the API/persistence boundary only; the renderer trusts
already-validated docs (see §6).

---

## 2. Resolver (fallback chain)

[`layoutResolver.ts`](../web/lib/layout/layoutResolver.ts) is a **pure function**.
Resolution order:

```
Org Layout (highest published version)
    ↓
Default Layout (org_id NULL / industry default, highest published version)
    ↓
entityPresentation.ts   ← Layer 0, converted on the fly
```

`resolveLayout({ entityType, surface, orgRecords, defaultRecords })` picks the
highest **published** org record, else the highest published default, else falls
back to converting the legacy registry via the migration utility. The registry
fallback is **total** — it always yields a document — so an org with no Layout V2
rows resolves to today's exact presentation. Callers fetch candidate records
however they like and pass them in; the resolver does no I/O.

This is the seam the future adoption sprint flips on. Today nothing calls the
resolver from a render path.

---

## 3. Storage

[`20260603120000_entity_layouts_v2.sql`](../supabase/migrations/20260603120000_entity_layouts_v2.sql)
creates one table, `entity_layouts`, following the existing config-table
conventions (`field_section_definitions` as the template): org-scoped, RLS,
service-role grants, idempotent DDL.

**One validated JSONB document per `(org_id, entity_type, surface, layout_key,
version)`** — not normalized into `layout_sections` / `layout_rows` /
`layout_columns` / `layout_items`. Rationale:

- a layout is read **whole** and published **whole** (atomic version), never
  partially queried;
- it matches the proven pattern already in this codebase (`workflows.payload`,
  `work_units.queue_definition`, `field_definitions.config`);
- trivial versioning, diff, and rollback; minimal migration churn;
- one-row reads instead of 5-table joins on the hot drawer-open path.

Columns of note:

- `org_id` **nullable** — `NULL` denotes a system/industry default (shared
  fallback). A partial unique index dedupes default rows (since SQL treats NULLs
  as distinct in multi-column `UNIQUE`).
- `surface` `CHECK (drawer | queue)`; `status` `CHECK (draft | published)`;
  `version >= 1`.
- `doc jsonb` — the validated `LayoutDoc`. `metadata jsonb` — presentation-only
  extras (e.g. queue default sort, source provenance).
- Indexes on `(org_id, entity_type, surface, status)` and a partial index for
  defaults — the two resolver read paths.

RLS mirrors `field_section_definitions` (select for owner/admin/ops/manager;
write for owner/admin). The app reads/writes via the service role
(`createAdminClient`), org-scoped in code, exactly like every other
`/api/admin/*` route; RLS is a backstop.

### API

All under `web/app/api/admin/entity-layouts`, guarded by `getAdminContext()`,
org-scoped, admin-only writes, `logAdminAudit()` on mutation, and gated by the
feature flag (404 when off):

| Method · Route | Purpose |
|---|---|
| `GET /entity-layouts` | List all rows visible to the org (its own + defaults) for the UI |
| `GET /entity-layouts?entity_type=&surface=` | Resolve a layout + return candidate org/default records |
| `POST /entity-layouts` | Create a **draft** (optionally seeded from the registry — Deliverable E) |
| `GET /entity-layouts/[id]` | Fetch one row (org-isolated) |
| `PATCH /entity-layouts/[id]` | Edit a draft's name/doc (published rows are immutable → 409) |
| `DELETE /entity-layouts/[id]` | Delete a row |
| `POST /entity-layouts/[id]/publish` | Re-validate + mark published, stamp `published_at` |

Versioning: `createDraft` inserts at the next version for its `layout_key`.
Publishing flips `status`; multiple published versions may coexist and the
resolver always picks the max. Rollback = publish an earlier/new draft version.

---

## 4. Migration utility (registry → Layout V2)

[`migrateFromRegistry.ts`](../web/lib/layout/migrateFromRegistry.ts) converts the
Layer-0 registry into Layout V2 documents so an org can be bootstrapped with
faithful starting layouts. It is the **only** coupling to the legacy registry
and is strictly read-only.

- `drawerLayoutFromRegistry(entityType)` — maps each overview section to a
  `Section`; greedily packs fields into rows of a 12-grid honoring `gridCols`
  (1/2) and per-field `span`; maps subsections to `field_group` items; maps
  empty (hardcoded-widget) sections to a `widget_placeholder`; appends a
  "Related" section of `related_list` items from `relatedModules`.
- `queueLayoutFromRegistry(entityType)` — one `table` section whose single
  column holds the ordered table columns as `field` items (with `sortable` in
  item metadata; default sort in doc metadata).
- **Deterministic ids** derived from `(entityType, surface, path)` — the same
  registry always yields the same JSON (golden-snapshot friendly).
- `ALL_ENTITY_PRESENTATION_TYPES` is built from a
  `Record<EntityPresentationType, true>` literal, so a compile error fires if the
  registry union gains a member — the list can never silently drift.

Bootstrapping uses the `POST /entity-layouts` route with `from_registry: true`
(the UI's "Create draft from default" button). This faithfully copies the
current built-in layout into an editable draft.

---

## 5. Preview architecture

[`LayoutPreviewRenderer.tsx`](../web/components/layout/LayoutPreviewRenderer.tsx)
renders a `LayoutDoc`'s structure with **placeholder values** — it is a preview,
not a production renderer:

- performs **no data fetching** and is not wired into any live drawer/queue;
- renders sections → rows → columns (CSS grid, `width/12` spans) → items, with a
  distinct visual per item kind (field, group, related-list, widget placeholder);
- queue surface renders the ordered column items as a table header + sample rows;
- reuses the existing admin visual language (borders, type colors, spacing) so
  previews look like the product — with no custom CSS/color/theme introduced.

The config UI ([`LayoutsClient.tsx`](../web/app/admin/system/layouts/LayoutsClient.tsx))
drives the full lifecycle: list, create-from-default, edit (section
rename/reorder/expand toggle, plus a schema-validated JSON editor for full
row/column/item control with live client-side validation), save draft, publish,
delete, and a live preview that reflects the working document. Admin-only
mutation via `useAdminAuth().canMutate`.

---

## 6. Performance implications

The sprint is built to satisfy "**no additional drawer-open / queue / bootstrap
fetches**" and to stay out of the parallel performance rebuild:

- **Zero live-runtime coupling.** No render path imports the resolver, the repo,
  or the new tables. Production drawers/queues open with the same fetches as
  before. The performance rebuild and Layout V2 do not intersect.
- **Read whole, validate at the boundary.** A layout is a single JSONB row;
  validation cost is paid on write/publish, never per render. The renderer
  trusts validated docs.
- **One-row reads, indexed.** The two resolver queries are covered by dedicated
  indexes; the JSONB-doc model avoids the 5-table join fan-out a normalized
  schema would impose on the (future) hot drawer-open path.
- **Registry fallback is free.** With no DB layout, resolution is an in-memory
  registry lookup + deterministic conversion — same order of cost as today.
- **No new dependencies.** Validation is hand-rolled; the preview uses no DnD or
  charting libs. Bundle impact is limited to small, lazy admin-only modules.
- **Adoption plan (future):** when wired, the resolved layout will be attached to
  the existing drawer payload (alongside `_field_definitions` / `_field_sections`
  via `entityFieldRegistryAttach.ts`) so drawer-open stays a single fetch, and
  resolved docs will be cached per `(org, entity, surface)` with invalidation on
  publish.

---

## 7. Constraint compliance

| Constraint | How honored |
|---|---|
| No interference with runtime/perf rebuild | No runtime render/bootstrap/loader file touched; only an additive nav line |
| No runtime cutover | Live drawers/queues/workspace unchanged; publishing is inert this sprint |
| Presentation only | Doc carries only sections/rows/columns/items + closed render hints; no lifecycle/required/status/workflow/action/permission/business fields |
| No page builder | Fixed 5-level hierarchy; no arbitrary nesting; no custom CSS/theme/color/user components |
| Registry as fallback | `entityPresentation.ts` untouched and is the permanent Layer-0 floor of the resolver |
| Surfaces = drawer + queue | Validator + DB `CHECK` reject anything else |
| Item types | Exactly `field`, `field_group`, `related_list`, `widget_placeholder`; widget is a placeholder contract |
| No extra runtime fetches | Foundation modules are isolated; preview fetches independently in the admin UI only |

---

## 8. Verification

- `web/tests/layout/layoutV2.test.ts` — 12 tests, **all passing**:
  valid drawer+queue doc for every registry entity type; deterministic
  conversion; unique ids; queue shape; resolver fallback precedence (org >
  default > registry, highest published version); validator rejects bad surface,
  bad item kind, nested `field_group`, duplicate ids; warns on >12 width.
- `tsc --noEmit` — **clean** for all new files (the single remaining error is a
  pre-existing, unrelated `services/cleaning` image-import quirk).
- `eslint` — clean for all new files.

---

## 9. Remaining rollout phases (future sprints — not in this one)

1. **Adoption behind a flag.** Branch the live `EntityDrawerOverview` /
   `buildEntityTableColumns` to consume a resolved `LayoutDoc` when a published
   org layout exists and the flag is on; else render exactly as today. Seed each
   org's default by serializing the registry (or fall through lazily). Verify
   byte-identical output via a golden snapshot before enabling for anyone.
2. **Pilot opt-in.** Enable for one org on one surface (e.g.
   `customers/drawer`). First render is identical (seeded from registry); admins
   then tweak order/visibility.
3. **Richer editor + broaden surfaces.** Field picker from `field_definitions`,
   reorder-based row/column editing UI, expand to all entities and the queue
   surface. Keep hardcoded-heavy drawers (Jobs/Vendors/Documents/Workflows) as
   `widget_placeholder` items — placement configurable, behavior intact.
4. **Workspace / record-workspace surfaces.** Introduce new surfaces and wire to
   the adminV2 block/shell renderer (requires the adminV2 DB wiring first).
5. **Industry defaults & governance.** Populate `org_id = NULL` default layouts
   per `industry_key`; add diff/rollback UI; extend audit coverage.

---
*End of Layout V2 — Foundation Design.*
