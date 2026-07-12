# Layout Configuration V2 — Foundation Audit & Architecture Package

**Sprint:** Layout Configuration V2 Foundation Audit
**Type:** Audit + architecture (no implementation in this sprint)
**Date:** 2026-06-03
**Scope:** `web/` (Next.js admin), `supabase/migrations/` (schema), `docs/` (prior specs)
**Status of this document:** Recommendation package for Sprint 1 implementation planning.

---

## 0. TL;DR

Alloy **already has a layout system** — it is just **hardcoded in TypeScript instead of stored in the database**. The single source of truth is [`web/lib/entityPresentation.ts`](../web/lib/entityPresentation.ts) (1,569 lines), whose `EntityPresentationConfig` type already models tables, drawer tabs, sections, fields, related modules, and quick actions. The drawer and queue renderers already consume this config via shared, reusable components (`EntityDrawerOverview`, `EntityDrawerSection`, `EntityDrawerField`, `DataTable`, `buildEntityTableColumns`, `StatusBadge`, render-hint formatters).

There is a **DB-backed field metadata layer** (`field_definitions`, `field_section_definitions`, `option_sets`) that controls *which* fields exist and whether they are visible — but **section order, column order, drawer tabs, grids, and related modules are not in the database**; they live in the hardcoded registry.

**The author of `entityPresentation.ts` already wrote down the V2 storage model** in its file header (lines 5–13): `entity_field_registry`, `entity_layouts`, `entity_relationship_registry`. `CONFIGURATION_AUDIT_V1.md` independently proposes the same. This audit confirms that proposal, refines it into a Layout / Section / Row / Column / Item model, and gives a migration and rendering strategy that introduces **zero runtime impact until an org is explicitly migrated**.

**Strategic recommendation:** Build Layout V2 as a **database-backed override layer that resolves on top of the existing `entityPresentation.ts` registry as the default/fallback**. The registry becomes the seed for "system default" layouts. The existing renderers are extended (not replaced) to consume a resolved layout. The `adminV2` workspace system is a **separate, parallel prototype** — relevant as a long-term north star for record/queue composition, but not on the critical path for V2 and not yet wired to data.

---

## 1. Current Layout Architecture Audit

### 1.1 The two layers that exist today

| Layer | Where | Stored in DB? | Controls |
|---|---|---|---|
| **A. Field metadata layer** | `field_definitions`, `field_section_definitions`, `option_sets` tables + `/admin/system/*-fields` UI | **Yes** | Which fields exist per entity; per-context visibility (form/drawer/table/public); section grouping key; sort order; labels, help text, placeholder; select options |
| **B. Presentation/layout layer** | [`web/lib/entityPresentation.ts`](../web/lib/entityPresentation.ts) (`ENTITY_PRESENTATION_REGISTRY`) | **No (hardcoded TS)** | Table columns + order + render hints; drawer tabs; drawer header fields; overview sections + order + grid columns + collapse state; fields-per-section + spans; subsections; related modules; quick actions |

Layer A answers *"what data exists and may be shown."* Layer B answers *"how it is arranged."* **Layout V2 is fundamentally about moving Layer B into the database** and merging it with Layer A, while preserving the renderers.

### 1.2 The de-facto layout schema (already in code)

`EntityPresentationConfig` ([`entityPresentation.ts:223`](../web/lib/entityPresentation.ts)) is the existing layout contract:

```
EntityPresentationConfig {
  entityType
  table:  { columns: EntityTableColumnConfig[]; defaultSort }
  drawer: {
    tabs: DrawerTabKey[]                       // overview | related | financials | automation | activity | payments | documents | ledger
    headerFields?: EntityDrawerHeaderFieldConfig[]
    layoutMode?: 1 | 2                          // overview grid columns
    overviewSections?: EntityDrawerSectionConfig[]
    relatedModules?: RelatedModuleConfig[]
    quickActions?: EntityQuickActionConfig[]
  }
}

EntityDrawerSectionConfig { key, title, defaultExpanded, collapsible, gridCols(1|2), fields[], subsections?[], locked? }
EntityDrawerFieldConfig   { key, label, span(1|2), renderHint, editable?, locked?, linkTarget? }
EntityTableColumnConfig   { key, label, sortable?, renderHint, locked? }
RelatedModuleConfig       { key, label, entityType, filterKey?, locked? }
EntityQuickActionConfig   { key, label, variant, inHeader?, locked? }
```

Notable: every config object already has a **`locked?`** flag — the original author anticipated user-configurable layouts where some items cannot be removed. This is the seed of the V2 permission model.

**Render hints** (the vocabulary that maps a field/column to a renderer): `text | status | date | datetime | money | link | badge | phone | primary_yes_no | custom`. This is a closed, presentation-only vocabulary — exactly what a no-custom-CSS layout system needs.

### 1.3 Forms / field-configuration "builder" architecture

There is **no drag-and-drop forms builder** today. The closest thing is the field-admin CRUD UI:

- [`web/components/admin/EntityFieldsClient.tsx`](../web/components/admin/EntityFieldsClient.tsx) (~800 lines) — generic field-definition editor, used by `/admin/system/{customer,job,opportunity,vendor,schedule}-fields`.
- Entity-specific variants: `person-fields/PersonFieldsClient.tsx`, `location-fields/LocationFieldsClient.tsx`, `document-fields/DocumentFieldsClient.tsx`.
- These edit `field_definitions` rows: label, type, required, active, **visibility (form/drawer/table)**, filterable/sortable, **section_key**, **sort_order**, placeholder, help text.
- Section keys are presented from a **hardcoded list** (`SECTION_OPTIONS`: basic, contact, profile, system, custom) at `EntityFieldsClient.tsx:11`, even though `field_section_definitions` exists as the data-driven source.

So today the "builder" is a **form-based table editor**, not a visual layout designer. There is no reordering-by-drag, no section canvas, no column picker. (The only `dnd` usage in the repo is `app/adminV2/components/canvas/SystemCanvas.tsx`, unrelated to layouts.)

### 1.4 Drawer rendering architecture

Single orchestrator: [`web/components/admin/AdminEntityDrawer.tsx`](../web/components/admin/AdminEntityDrawer.tsx) (~2,000 lines, ~17 entity types). Flow:

1. Open with `{ type, id }`. Fetch entity via `/api/admin/{entity}/{id}`; the API attaches `_field_definitions` and `_field_sections` (see [`web/lib/admin/entityFieldRegistryAttach.ts`](../web/lib/admin/entityFieldRegistryAttach.ts)).
2. Look up `ENTITY_PRESENTATION_REGISTRY[type].drawer` for tabs, sections, related modules, quick actions.
3. Render shell via [`Drawer.tsx`](../web/components/admin/Drawer.tsx) (right slide-out, sticky header w/ 4px accent, scroll body).
4. Render the **Overview** tab either:
   - **Config-driven path:** [`EntityDrawerOverview.tsx`](../web/components/admin/entity/EntityDrawerOverview.tsx) → `EntityDrawerSection` → `EntityDrawerField`, formatting by `renderHint`; or
   - **Hardcoded path:** entity-specific JSX inside `AdminEntityDrawer` for complex entities (Jobs relationships/pricing/financials, Vendors payouts, Subscriptions generate-next, Documents preview, Workflows condition/action builders).
5. Render **Related** tab via [`RelatedRecordsTabs.tsx`](../web/components/admin/RelatedRecordsTabs.tsx) (+ `EntityDocumentsSection`).
6. Render special tabs (Financials/Payments/Ledger) via dedicated widgets.

**Verdict:** ~70% config-driven, ~30% hardcoded. Simple entities (customers, locations, opportunities, contacts, subscriptions overview) are fully config-driven. Jobs/Vendors/Documents/Workflows carry heavy custom JSX tied to business widgets.

### 1.5 Queue (list/table) rendering architecture

- [`DataTable.tsx`](../web/components/admin/DataTable.tsx) — generic table: client-side pagination (20/page), sort, filter, search, row click. Accepts `Column[]` with optional custom `render()`.
- [`buildEntityTableColumns.tsx`](../web/components/admin/entity/buildEntityTableColumns.tsx) — factory that turns `ENTITY_PRESENTATION_REGISTRY[type].table.columns` into `DataTable` columns, applying `renderHint` defaults (status→`StatusBadge`, money→`formatMoneyFromCents`, etc.), with per-page override hooks.
- [`AdminListPageHeader.tsx`](../web/components/admin/AdminListPageHeader.tsx) — title + KPI pills + toolbar.
- Each `/admin/{entity}/*Client.tsx` page composes header + DataTable + filters.

**Verdict:** ~60% config-driven across queues. Many pages call `buildEntityTableColumns("type", overrides)`; a minority hardcode columns entirely (subscriptions, workflows, verticals) or use bespoke tables (messages-outbox, users, workflow-runs, documents).

### 1.6 Existing field & layout configuration systems

- **Field configuration:** DB-backed and editable (Layer A above). ✅
- **Section metadata:** `field_section_definitions` exists (labels/descriptions/order per entity_type) but is **only partially used** — drawer section order still comes from the hardcoded registry.
- **Layout/presentation configuration:** **Does not exist in the database.** Confirmed: no `entity_layouts`, `view_config`, `drawer_config`, `queue_config`, or `column_config` tables. Section order, column order, tabs, grids, related modules, and quick actions are all in `entityPresentation.ts`.
- **Reserved slot:** `work_units.queue_definition` (JSONB) exists and is explicitly reserved for a future queue/filter DSL — currently `{}`.
- **Collapse state:** only persisted to browser `localStorage`, not the DB.

### 1.7 APIs & services involved

| Concern | File(s) |
|---|---|
| Field-definition CRUD | `web/app/api/admin/field-definitions/route.ts`, `…/[id]/route.ts` |
| Section CRUD | `web/app/api/admin/field-sections/route.ts` |
| Status definitions (org+industry merge) | `web/app/api/admin/status-definitions/route.ts`, `web/lib/admin/statusDefinitionsResolve.ts` |
| Option sets | tables exist (`option_sets`, `option_set_items`); admin API not yet exposed |
| Field registry attach (drawer hydration) | `web/lib/admin/entityFieldRegistryAttach.ts` |
| Field value read/write | `web/lib/admin/fieldValues.ts`, `web/lib/admin/typedFieldValues.ts` |
| Field config validation/normalization | `web/lib/fields/fieldDefinitionConfig.ts` |
| Auth + org scoping for all admin routes | `web/lib/admin/getAdminContext.ts` |
| Presentation registry (Layer B) | `web/lib/entityPresentation.ts` |
| Drawer/table renderers | `web/components/admin/entity/*`, `DataTable.tsx` |

**Reusable pattern for V2:** every config table follows the same shape — `(id, org_id, entity_type, key, …display…, sort_order, metadata jsonb, created_at, updated_at)`, with `/api/admin/*` routes guarded by `getAdminContext()` and `.eq("org_id", ctx.orgId)`. Layout V2 should reuse this pattern verbatim.

---

## 2. Current Drawer Inventory

Orchestrated by `AdminEntityDrawer.tsx`; shell from `Drawer.tsx`. "Config-driven" = renders from `entityPresentation.ts` overviewSections via `EntityDrawerOverview`. "Hardcoded" = entity-specific JSX in `AdminEntityDrawer`.

| Drawer (entity) | Overview sections | Related collections (tabs) | Special widgets | Hardcoded areas | Config-driven? |
|---|---|---|---|---|---|
| **Customers** | Account Info, Person Snapshot, Contact Snapshot, Payment Profile, Record Info, Debug | Contacts, People, Members, Opportunities, Jobs, Schedules, Locations, Subscriptions, Discounts, Documents | StatusBadge | minimal | ~95% |
| **Locations** | Overview, Property/custom fields, Customer, Relationships | Customer, Jobs, Schedules, Documents | StatusBadge | Customer + Relationships sections (custom JSX); custom property fields from `field_definitions` | ~60% |
| **Opportunities** | Details, Customer/Booking, Quote, Notes, Record Info | Jobs, Schedules, Documents | StatusBadge (custom label) | pipeline-stage select fetch; relationship-label fns | ~85% |
| **Subscriptions** | Overview, Customer, Location, Pricing, Schedules, Vendor, Documents | (via sections) | StatusBadge, `SubscriptionGenerateNextButton` | generate-next + vendor sections | ~70% |
| **Jobs** | Details, Property/Service, Customer/Location, Scheduling, **Billing summary**, **Pricing breakdown**, Notes, Record Info | Schedules, Payments, Documents | `JobPricingBreakdown`, `JobReceivableChargesPanel`, `AdminCollectPaymentModal`, `JobManualChargeForm`, StatusBadge | **Heavy:** relationships section (vendor assignment, customer/contact/location/opportunity/work-unit selects), set-location modal, reschedule modal, financial summary | ~55% |
| **Schedules** | Overview, Property/Service, Customer/Location/Job, Charges, Notes, Record Info | Documents | StatusBadge (canceled override), `JobReceivableChargesPanel` | reschedule action; post customer payment / vendor payout; canceled-state lock; relationship-label fns | ~60% |
| **Payments** | Details, Allocations, Linked Records, Notes, Record Info | Ledger | — | allocation rendering; ledger integration | ~70% |
| **Vendors** | Account Info, Payout/Capacity, Compliance, Availability/Service Area, Compliance quick links, Record Info | (financials/docs tabs) | StatusBadge | compliance quick-links (W9/ACH); payout override modal (flat/tiered); vendor jobs list w/ pricing | ~70% |
| **Contacts** | Basic Info, Association, Address, Notes, Record Info | Customer, Vendor, Opportunities, Jobs, Schedules, Documents | StatusBadge | vendor-contact indicator | ~90% |
| **Customer Members** | Basic Info, Contact Roles, External/Source, Record Info | Contacts | StatusBadge | contact-roles table (person-linked contacts) | ~80% |
| **Persons** | config sections + custom field_definitions | Contacts | StatusBadge | person-linked contacts/links section | ~70% |
| **Documents** | Overview, Preview/Metadata, Linked records, Extracted fields, Version/Audit | Linked records | — | **Heavy:** document preview, extracted fields, version audit (all custom) | ~30% |
| **Service Offerings** | Details, Record Info | — | — | none | ~95% |
| **Service Plan Templates** | Overview, Pricing, Included addons, Record Info | — | StatusBadge | pricing table; addons list | ~70% |
| **Addons** | Details, Record Info | — | — | none | ~95% |
| **Discount Redemptions** | Details, Record Info | — | — | none | ~95% |
| **Workflows** | header config | Workflow events | condition/action builders, run modal | **Heavy:** inline condition/action editors, JSON payload run | ~25% |

**Shared drawer building blocks (already reusable):** `Drawer`, `EntityDrawerOverview`, `EntityDrawerSection` (collapsible, 1–2 col grid), `EntityDrawerField` (label/value, span 1–2, edit node), `RelatedRecordsTabs`, `EntityDocumentsSection`, `SectionCard`, `StatusBadge`, render-hint formatters.

**Hardcoded widgets that must stay "escape hatches" in V2** (cannot be expressed as generic fields): `JobPricingBreakdown`, `JobReceivableChargesPanel`, `AdminCollectPaymentModal`, `JobManualChargeForm`, vendor payout override, subscription generate-next, document preview/extraction, workflow condition/action builders. V2 must support a **`custom`/`widget` item type** that references one of these by key (presentation-only placement, behavior owned by the widget).

---

## 3. Current Queue Inventory

Rendered by `DataTable` + `buildEntityTableColumns` + `AdminListPageHeader`, unless noted. "Config-driven" = columns from `entityPresentation.ts`.

| Queue (page) | Columns source | Layout / filters | Hardcoded presentation logic | Config-driven? |
|---|---|---|---|---|
| **Jobs** (`jobs/JobsClient.tsx`) | `buildEntityTableColumns("jobs", overrides)` | DataTable + header; filters: search, status, department, work-unit, include-archived | customer/vendor link cells, paid/outstanding money calc, archive toggle | ~60% |
| **Opportunities** (`OpportunitiesClient.tsx`) | `buildEntityTableColumns("opportunities")` | DataTable + status pills (KpiCard) | status-count rollup | ~95% |
| **Customers** (`CustomersClient.tsx`) | `buildEntityTableColumns("customers")` | DataTable; status filter (URL), vertical filter | status fetch, vertical filter | ~85% |
| **People** (`PeopleClient.tsx`) | `buildEntityTableColumns("persons", overrides)` | DataTable; client search (name/email/phone fuzzy) | phone-digit fuzzy search, count format | ~70% |
| **Vendors** (`VendorsClient.tsx`) | `buildEntityTableColumns("vendors", overrides)` | DataTable; status + multi-field search | payout-percent format, jobs-count default | ~70% |
| **Contacts** (`ContactsClient.tsx`) | `buildEntityTableColumns("contacts", {})` | DataTable; status + search + archived | minimal | ~85% |
| **Locations** (`LocationsClient.tsx`) | `buildEntityTableColumns("locations")` | DataTable; inactive toggle | minimal | ~90% |
| **Customer Members** (`CustomerMembersClient.tsx`) | `buildEntityTableColumns("customer_members")` | DataTable; status + customer_id (URL) | URL param | ~85% |
| **Discount Redemptions** (`DiscountRedemptionsClient.tsx`) | `buildEntityTableColumns("discount_redemptions")` | DataTable; limit | minimal | ~85% |
| **Schedules** (`SchedulesClient.tsx`) | custom (form-centric) | bespoke drawer/form; filters: date range, job, status, canceled | fully custom create/update/cancel | ~10% |
| **Subscriptions** (`SubscriptionsClient.tsx`) | **hardcoded column array** | DataTable | StatusBadge + frequency label cells | ~0% |
| **Workflows** (`WorkflowsClient.tsx`) | **hardcoded column array** | DataTable | enabled→Yes/No | ~0% |
| **Verticals** (`VerticalsClient.tsx`) | **hardcoded column array** | DataTable + inline edit drawer | is_active→Yes/No | ~0% |
| **Workflow Runs** (`WorkflowRunsClient.tsx`) | custom | bespoke list; status + date range | status mapping, duration calc, entity-route map, expandable action runs | ~20% |
| **Messages Outbox** (`MessagesOutboxClient.tsx`) | custom HTML table | bespoke | truncation, id-shortening | ~0% |
| **Documents** (`DocumentsClient.tsx`) | custom | bespoke; entity-type filter | entity-type label map | ~30% |
| **Users** (`UsersClient.tsx`) | custom | bespoke `SectionCard` table | role dropdown, reset-password, remove actions | ~0% |
| **adminV2 QueueBlock** (`adminV2/.../QueueBlock.tsx`) | view-model driven | 3 surfaces (department rollup / work-unit lanes / default) | tier styling; mock data only | n/a (prototype) |

**Reusable queue primitives:** `DataTable`, `buildEntityTableColumns`, `AdminListPageHeader`, `StatusBadge`/`getStatusVariant`, `KpiCard`, formatters in [`web/lib/adminFormatters.ts`](../web/lib/adminFormatters.ts) (`formatMoneyFromCents`, `formatDate`, `formatDateTime`, `formatPhoneUS`, `formatPayoutPercent`, `formatFrequencyLabel`).

---

## 4. Field System Audit

### 4.1 System fields vs custom fields

- **System fields** (`field_definitions.is_system = true`): map to native columns on the entity table (e.g. `persons.first_name`, `locations.beds`). Display metadata (label, section, visibility, order, help) is editable; identity (`field_key`, `field_type`, `is_system`) and deletion are locked.
- **Custom fields** (`is_system = false`): admin-created; values stored in the generic `field_values` table (typed columns: `value_text/number/boolean/date/json`), keyed by `(field_definition_id, entity_type, entity_id)`.
- **Allowed entity types** (`field-definitions/route.ts:7`): `person, customer, job, opportunity, vendor, schedule, location`.

### 4.2 Related collections

Not modeled as fields. Expressed today via `RelatedModuleConfig` in the registry (`{ key, label, entityType, filterKey }`) and rendered by `RelatedRecordsTabs`. The `entity_relationship_registry` proposal (registry header + CONFIGURATION_AUDIT_V1) is the intended DB home.

### 4.3 Field groups / sections

- `field_definitions.section_key` groups fields; `field_section_definitions (org_id, entity_type, section_key, label, description, sort_order)` provides section display metadata. Unique on `(org_id, entity_type, section_key)`.
- **Gap:** drawer section order/grid is still from `entityPresentation.ts`, not `field_section_definitions`. Layout V2 closes this gap.

### 4.4 Display metadata available **today**

Per field: `label`, `description`, `help_text`, `placeholder`, `field_type`, `section_key`, `sort_order`, `is_visible_in_form`, `is_visible_in_drawer`, `is_visible_in_table`, `is_visible_in_public_booking`, `is_filterable`, `is_sortable`, `is_required`, `is_active`, `config` (jsonb: select options / `option_set_key` / `catalog_key`).
Per section: `label`, `description`, `sort_order`.
In-registry only (not yet DB): `span` (1|2), `gridCols` (1|2), `renderHint`, `editable`, `locked`, `linkTarget`, tab membership, related modules, quick actions, default sort.

### 4.5 Display metadata **missing** for layout

Column width / span in DB; row grouping; render-hint/widget override in DB; per-field placement (which section/row/column/order) as data; collapse-state persistence; conditional visibility. These become first-class in the V2 storage model (§6).

### 4.6 Existing configuration models to reuse

`field_definitions`, `field_section_definitions`, `option_sets`/`option_set_items`, `status_definitions` (org + `industry_key` defaults merge), `entity_labels`, `departments`, `work_units` (`queue_definition` jsonb), `org_settings` (`metadata` jsonb + `config_locked`), `workflows`/`workflow_actions`/`workflow_conditions` (proof that complex jsonb config + builder UI + versioned save works). All org-scoped via RLS; all editable through `/api/admin/*` with `getAdminContext()`.

---

## 5. Reusable Component Inventory

### 5.1 From the current (V1) admin — ready to drive from V2 config

| Component | File | Role in V2 |
|---|---|---|
| `EntityDrawerOverview` | `components/admin/entity/EntityDrawerOverview.tsx` | Section/field renderer; the **Layout renderer** entry point for drawers |
| `EntityDrawerSection` | `components/admin/entity/EntityDrawerSection.tsx` | **Section** primitive (collapsible, 1–2 col grid) |
| `EntityDrawerField` | `components/admin/entity/EntityDrawerField.tsx` | **Item** primitive (label/value, span 1–2, edit node) |
| `RelatedRecordsTabs` | `components/admin/RelatedRecordsTabs.tsx` | Related-collection item type |
| `EntityDocumentsSection` | `components/admin/EntityDocumentsSection.tsx` | Documents item type |
| `DataTable` | `components/admin/DataTable.tsx` | **Queue** renderer |
| `buildEntityTableColumns` | `components/admin/entity/buildEntityTableColumns.tsx` | Column resolver (render-hint → renderer) |
| `AdminListPageHeader` | `components/admin/AdminListPageHeader.tsx` | Queue header/toolbar |
| `StatusBadge` / `getStatusVariant` | `components/admin/StatusBadge.tsx` | `status` render hint |
| `KpiCard` | `components/admin/KpiCard.tsx` | KPI item type |
| `SectionCard` | `components/admin/SectionCard.tsx` | Generic section chrome |
| `Drawer` | `components/admin/Drawer.tsx` | Drawer shell |
| Formatters | `lib/adminFormatters.ts` | money/date/phone/percent render hints |

### 5.2 From adminV2 (prototype — parallel/north-star)

Block/shell composition system: 8 blocks (`SignalBlock`, `KPIBlock`, `QueueBlock`, `WorkBlock`, `ContextBlock`, `ActionsBlock`, `RecordBodyBlock`, `RecordInteractionPanels`), 4 shells (Company/Department/WorkUnit/Record), view-model types in `web/lib/ui-v2/workspace-types.ts`, adapters in `web/lib/ui-v2/adapters/*` (stubbed), demo data in `web/lib/ui-v2/demo/*`. **All mock-data driven; no DB wiring.** CSS grid 75/25, token-based, responsive.

### 5.3 Drag/drop, section builders, column builders, field pickers

**None exist** for layouts. The only `dnd` usage is `adminV2/.../SystemCanvas.tsx` (org map viz). The field-admin pages (`EntityFieldsClient`) are the only "builder-like" UI and are form/table based. **V2 builder UI is greenfield** — recommend building it on top of the same primitives, reordering by integer `sort_order` (not free-form canvas), consistent with the no-arbitrary-nesting constraint.

---

## 6. Layout V2 Recommendations

### 6.1 Design principles (mapped to constraints)

| Constraint | How the design honors it |
|---|---|
| Layouts are presentation only | Layout rows carry **no business logic**; only references to fields/widgets + placement. Behavior stays in the entity APIs and widgets. |
| Lifecycle references layouts, does not own them | Workflows/statuses store no layout; they reference a `layout_key` at most. Layout tables have no FK into lifecycle tables. |
| No arbitrary nested containers | Fixed 5-level hierarchy: **Layout → Section → Row → Column → Item**. Rows/columns cannot nest within columns. Depth is constant. |
| No custom CSS | Items carry a closed `render_hint`/`widget_key` enum + integer `span`/`width`. No className/style fields anywhere. |
| No color/theme customization | No color/token fields in any layout table. Variants (e.g. status colors) remain derived by `getStatusVariant`. |
| Preserve current branding/visual design | Renderers are the **existing components**; V2 only feeds them resolved config. Pixels unchanged when an org uses the default layout. |
| No runtime impact until migrated | Resolver falls back to `entityPresentation.ts` whenever no published org layout exists. Feature-flagged per org. |

### 6.2 The Layout / Section / Row / Column / Item model

A normalized, fixed-depth hierarchy that supersets today's registry. **Rows are the V2 addition** — today the registry only has sections→fields with a section-level `gridCols`. Rows let an admin place items horizontally without arbitrary nesting.

```
Layout        (one per org × entity_type × surface, e.g. "jobs / drawer_overview", versioned)
└─ Section    (ordered; title, collapsible, default_expanded)
   └─ Row      (ordered; an implicit 12-col grid track)
      └─ Column (ordered; width = col-span 1..12)
         └─ Item (ordered; one of: field | related_module | widget | kpi | spacer | heading)
```

- **Surfaces:** `drawer_overview`, `drawer_tab:<key>`, `queue_table`, (future) `record_workspace`. One Layout row per (org, entity_type, surface).
- **No nesting beyond Item.** A Column holds Items only. A Row holds Columns only. Depth is always 5. This is enforceable in the renderer and the editor.
- **Queues** use the same model with a single implicit Section/Row; each Item is a column (Item.kind=`field`, plus `sortable`, `width`).

### 6.3 Storage model

Two viable encodings; recommendation is **(B) document-per-layout JSONB**, with reasoning below.

**Option A — fully normalized tables**
```
layouts(id, org_id, entity_type, surface, layout_key, version, status[draft|published],
        is_system_default, created_at, updated_at, published_at)
layout_sections(id, layout_id, section_key, title, collapsible, default_expanded, sort_order)
layout_rows(id, section_id, sort_order)
layout_columns(id, row_id, span, sort_order)
layout_items(id, column_id, kind, ref_key, render_hint, label_override, editable,
             locked, link_target jsonb, widget_key, sort_order)
```
Pros: queryable, diffable per node, FK integrity. Cons: 5-table joins per drawer; editor must orchestrate many rows; migration churn.

**Option B — one row per layout, body as validated JSONB (recommended)**
```
entity_layouts(
  id uuid pk,
  org_id uuid,               -- nullable ⇒ system/industry default
  industry_key text,         -- nullable ⇒ org-specific
  entity_type text,
  surface text,              -- drawer_overview | drawer_tab:<key> | queue_table | record_workspace
  layout_key text,           -- stable name
  version int,
  status text,               -- draft | published
  is_system_default boolean,
  doc jsonb,                 -- the Section→Row→Column→Item tree (validated by Zod/TS)
  created_by uuid, created_at timestamptz, updated_at timestamptz, published_at timestamptz
)
unique(org_id, entity_type, surface, layout_key, version)
```
`doc` shape mirrors §6.2 and reuses the existing TS interfaces (extended with `rows`). Validation lives in `web/lib/layout/layoutSchema.ts` (mirrors `fieldDefinitionConfig.ts` pattern).

**Why B:** A layout is read **whole** and written **whole** (publish a version atomically). It is never partially queried. JSONB matches how `workflows.payload`, `work_units.queue_definition`, and `field_definitions.config` already work in this codebase — proven, validated-at-the-boundary, low migration churn, trivially versionable, easy diff/rollback. It also keeps the editor simple (load doc → edit tree → publish). Use Option A only if per-node analytics or cross-layout queries become a real requirement.

**Resolution scope & precedence** (mirrors `status_definitions`): `org-specific published` → `industry default` → **`entityPresentation.ts` system default**. The registry is the permanent floor; nothing breaks if all layout tables are empty.

**Item kinds (closed enum):** `field` (ref_key = field_key), `related_module` (ref_key = module key), `widget` (widget_key from a registered allow-list — the escape hatch for `JobPricingBreakdown`, etc.), `kpi`, `heading`, `spacer`. **No `custom_html`/`custom_css` kind** — honors constraints.

### 6.4 Rendering model

1. **Resolver** (`web/lib/layout/resolveLayout.ts`): given `(orgId, entityType, surface)`, return a resolved `LayoutDoc`. Merge order = org → industry → registry default. If feature flag off or no published doc, **return the registry default unchanged** (zero behavior change).
2. **Adapter** (`registryToLayoutDoc.ts`): converts an `EntityPresentationConfig` into the same `LayoutDoc` shape (single Section→Row→Column for each existing section, span→column width). This makes the registry and DB layouts **interchangeable inputs** to one renderer, and seeds system defaults.
3. **`LayoutRenderer`** components, built by extending today's renderers:
   - `LayoutSectionRenderer` ⊃ `EntityDrawerSection`
   - `LayoutRowRenderer` (new, thin: a 12-col grid track)
   - `LayoutColumnRenderer` (new, thin: `span` → grid-column)
   - `LayoutItemRenderer` → dispatches by `kind`: `field`→`EntityDrawerField`, `widget`→registered widget by `widget_key`, `related_module`→`RelatedRecordsTabs`, etc.
   - Queue surface → feed resolved columns into `DataTable` via an extended `buildEntityTableColumns` that accepts a `LayoutDoc`.
4. **Item value resolution** stays exactly as today (render hints + `_display`/`_name` hydration + `field_values`). Layout V2 changes *placement*, not *value resolution*.
5. **Widgets** register in a `widgetRegistry.ts` allow-list `{ widget_key → component }`. A layout can only place widgets that exist in the allow-list (presentation placement only; the widget owns its own data/behavior).

### 6.5 Editor (Sprint N, not Sprint 1)

Reorder-based, not free-canvas: sections/rows/columns/items each carry integer `sort_order`; the editor mutates order and span via the same `/api/admin/entity-layouts` route used to publish. Field picker = the existing `field_definitions` list filtered by `is_visible_in_drawer`. No drag-to-arbitrary-position; only reorder within the fixed hierarchy and choose column span 1–12. This keeps the builder small and constraint-compliant.

### 6.6 APIs (reuse existing pattern)

```
GET    /api/admin/entity-layouts?entity_type=&surface=     → resolved + raw drafts
POST   /api/admin/entity-layouts                            → create draft (admin only)
PATCH  /api/admin/entity-layouts/[id]                       → edit draft doc
POST   /api/admin/entity-layouts/[id]/publish              → publish version (atomic)
POST   /api/admin/entity-layouts/[id]/revert               → roll back to prior version
```
Guarded by `getAdminContext()`, `.eq("org_id", ctx.orgId)`, `admin` role for writes, `logAdminAudit()` on publish. Read path cached (server `Cache-Control: s-maxage`, or in-memory per-request memo) since layouts change rarely.

### 6.7 Migration strategy (zero runtime impact until migrated)

**Phase 0 — Foundations (Sprint 1).** Create `entity_layouts` table + `LayoutDoc` TS/Zod schema + `resolveLayout` + `registryToLayoutDoc` adapter. **Wire nothing into renderers yet.** Add a unit test asserting `registryToLayoutDoc(registry[type])` renders byte-identical output to today for every entity (golden snapshot). This proves the model is a faithful superset.

**Phase 1 — Renderer behind a flag.** Add `LayoutRenderer`; in `EntityDrawerOverview`/`buildEntityTableColumns`, branch: `if (org has published layout && flag on) render(resolvedDoc) else renderToday()`. Default flag **off** → no org sees a change. Seed each org's "system default" by serializing the registry (optional; resolver can also fall through to the registry live).

**Phase 2 — Opt-in per org/surface.** Turn the flag on for a pilot org on one surface (e.g. `customers/drawer_overview`). Because the published doc is generated from the registry, the first render is identical; admins then tweak order/visibility.

**Phase 3 — Editor + broaden surfaces.** Ship the reorder editor; expand to queues and more entities. Hardcoded-heavy drawers (Jobs/Vendors/Documents/Workflows) keep their custom widgets as `widget` items — placement configurable, behavior intact.

**Phase 4 — Decommission (optional, much later).** Once all orgs are on DB layouts, the registry remains as the permanent system-default seed; it is never deleted (it is the floor of the resolution chain).

**Rollback:** flag off → instant return to registry rendering. Publish/revert gives per-version rollback within the DB path.

### 6.8 Performance considerations

- **Read whole, cache hard.** One `entity_layouts` row per (org, entity, surface). Cache resolved docs per (org, entity, surface) with short TTL or invalidate on publish. Layouts change rarely; reads are hot.
- **No extra round-trips on drawer open.** Attach the resolved layout in the same payload as `_field_definitions`/`_field_sections` (extend `entityFieldRegistryAttach.ts`), so opening a drawer stays one fetch.
- **JSONB avoids join fan-out.** Option B reads a single row vs. a 5-table join per drawer (Option A). This matters because drawers open constantly.
- **Validation at the boundary only.** Validate `doc` on write/publish (Zod), trust on read — no per-render validation cost.
- **Registry fallback is free.** When no DB layout exists, resolution is a synchronous in-memory lookup of `ENTITY_PRESENTATION_REGISTRY` — identical cost to today.
- **Bundle:** new renderer components are small; no new heavy deps (no dnd lib needed for reorder — use simple up/down + span controls).

---

## 7. Suggested Sprint 1 Scope (implementation planning)

1. `entity_layouts` migration (Option B schema, org/industry/default scoping, versioning).
2. `web/lib/layout/layoutSchema.ts` — `LayoutDoc` TS types + Zod validation (Section→Row→Column→Item; closed item-kind and render-hint enums).
3. `web/lib/layout/registryToLayoutDoc.ts` — adapter from `EntityPresentationConfig` → `LayoutDoc` (+ golden snapshot tests for all entity types).
4. `web/lib/layout/resolveLayout.ts` — org → industry → registry fallback; pure, cached.
5. `web/lib/layout/widgetRegistry.ts` — allow-list of placeable widgets (seed with existing job/vendor/document/workflow widgets).
6. `/api/admin/entity-layouts` GET/POST/PATCH/publish/revert (no UI yet) following the `field-definitions` route pattern.
7. **No renderer changes shipped to users** — keep everything behind a default-off flag; only the snapshot test exercises the new path. (Deliver Phase 0; gate Phase 1.)

**Explicitly out of scope for Sprint 1:** editor UI, drag/drop, adminV2 workspace wiring, queue-surface cutover, theming/colors (permanently excluded by constraints).

---

## 8. Risks & open questions

- **Org scoping on service-role reads.** `CONFIGURATION_AUDIT_V1.md` flags missing `.eq("org_id")` on some admin reads (workflows, pipelines). Layout reads must not repeat this — enforce org scope from day one.
- **Hardcoded-heavy drawers.** Jobs/Vendors/Documents/Workflows can only be *placed*, not *generalized*, in V2. Decision needed: are these in-scope for layout config at all in early phases, or "widget-only, fixed order"? (Recommended: widget-only, locked, until later.)
- **Registry as floor vs. mirror.** Decide whether to physically seed each org's default doc from the registry, or always fall through to the registry at resolve time. (Recommended: fall through; seed lazily on first edit.)
- **adminV2 relationship.** Confirm whether `record_workspace` is a V2 surface now or later. The adminV2 block/shell system is the natural long-term renderer for it, but it needs DB wiring first.
- **Industry defaults.** Reuse the `status_definitions` org+industry merge pattern; confirm `industry_key` is the right default scope for layouts.

---

## 9. Appendix — Key file map

**Layout layer (hardcoded today):** `web/lib/entityPresentation.ts`
**Drawer renderers:** `web/components/admin/AdminEntityDrawer.tsx`, `Drawer.tsx`, `entity/EntityDrawerOverview.tsx`, `entity/EntityDrawerSection.tsx`, `entity/EntityDrawerField.tsx`, `RelatedRecordsTabs.tsx`, `EntityDocumentsSection.tsx`, `SectionCard.tsx`
**Queue renderers:** `web/components/admin/DataTable.tsx`, `entity/buildEntityTableColumns.tsx`, `AdminListPageHeader.tsx`, `StatusBadge.tsx`, `KpiCard.tsx`, `lib/adminFormatters.ts`
**Field metadata layer:** `supabase/migrations/20260329165048_remote_schema.sql` (`field_definitions`, `field_values`, `document_field_definitions`, `status_definitions`, `work_units`), `…20260402140000_field_sections_public_visibility.sql` (`field_section_definitions`), `…20260404130000_option_sets_*.sql` (`option_sets`, `option_set_items`)
**Field services/APIs:** `web/lib/admin/entityFieldRegistryAttach.ts`, `fieldValues.ts`, `typedFieldValues.ts`, `web/lib/fields/fieldDefinitionConfig.ts`, `web/app/api/admin/field-definitions/*`, `field-sections/*`, `web/lib/admin/getAdminContext.ts`
**Field-admin UI:** `web/components/admin/EntityFieldsClient.tsx`, `web/app/admin/system/*-fields/*`
**adminV2 prototype:** `web/app/adminV2/components/workspace/{blocks,shells}/*`, `web/lib/ui-v2/{workspace-types.ts,adapters/*,demo/*}`
**Prior specs:** `docs/CONFIGURATION_AUDIT_V1.md`, `docs/UI_V2_Workspace_System_Spec.md`, `docs/WORKSPACE_SYSTEM_V1.md`, `docs/DEPARTMENT_UI_SYSTEM_V1.md`, `docs/ENTITY_MODEL.md`

---
*End of Layout Configuration V2 — Foundation Audit & Architecture Package.*
