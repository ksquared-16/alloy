---
owner: operator
status: canonical
last_reviewed: 2026-07-24
supersedes: []
---

# Data Model product UI

UI-only product realization for **Data Model** (`/organization/data-model`). **Product realization is complete** for this sprint — see [`../milestones/organization-configuration-product-realization-closeout.md`](../milestones/organization-configuration-product-realization-closeout.md). Operational Calculations remains deferred (compat pane only).

Data Model is **Entity-centric**. The operator picks an Entity and everything about that
Entity — vocabulary, fields, relationships, statuses, usage, history — resolves inside the
selected Entity workspace. There is no Data Model category rail, and Fields, Statuses,
Option Sets, and Relationships are not destinations of their own.

Two earlier passes are **rejected** as target state and must not be reintroduced:

1. A category rail wrapping legacy clients (`EntitiesWorkspaceClient`, `DataModelWorkspaceClient`,
   `StatusesConfigurationPage`, `OptionSetsClient`, `RelationshipsSettingsClient`) unchanged.
2. A six-category rail (Entities · Fields · Statuses · Option Sets · Relationships ·
   Operational Calculations) with an Entity workspace that deep-linked *out* to those categories
   to open a field, relationship, or status.

This doc does **not** redefine canonical entity, field, status, option-set, relationship, or
calculation doctrine. Those remain owned by existing platform docs and APIs.

Discovery evidence: `.alloy-agent-evidence/data-model-ui-discovery/DATA-MODEL-UI-DISCOVERY.md`

## Critical product rules

- Selecting or editing a Data Model object **stays inside the selected Entity**. No tab may
  navigate to a Fields, Statuses, Option Sets, or Relationships destination.
- There is **no generic Status**. Statuses are organized by explicit Status Domain, and an
  Entity's domain owner is read from `statusCategoryRegistry.ts` — the Entity does not invent a
  second status system.
- Stage is never presented as Status.
- Configuration steers vocabulary and presentation; platform code owns invariants.
- Platform-owned objects (platform fields, computed fields, platform relationship edges, system
  statuses) render as **protected** — never with a fake edit affordance.
- Operational Calculations is a **deferred compat pane**, reachable by deep link only. It is
  **not** promoted anywhere on an Entity page — no header action, no rail entry.
- No parallel metadata system, no invented metadata, no speculative entity extensibility.
- **Operators read labels, not keys.** `status_key`, `field_key`, `section_key`, `set_key`, and
  storage locations like `persons.status_key` never appear in Overview, Definition, Values, or
  Usage. Where a key is genuinely useful (support, debugging) it sits behind the shared
  `ConfigurationAdvancedToggle` disclosure labeled *Internal reference* / *Storage location*.
- **Industry is not an Entity control.** Industry selection is an organization-profile concern
  that happens to seed vocabulary defaults. It is not exposed in Entity → Vocabulary, and the
  Entity workspace loader does not read it. Entity vocabulary talks about the *Alloy default*.

## Information architecture

```
Data Model
  Entity selector (collection rail): Person · Family · Child · Lead / Enrollment · Location / Site
  Selected Entity
    Overview (default) | Vocabulary | Fields | Relationships | Status | History
```

Canonical route: `/organization/data-model?entity=<hubKey>&tab=<tabKey>[&field=<refKey>]`
(default entity `person`, default tab `overview`).

### Legacy route compatibility

`dataModelSectionHref` and the `?section=` vocabulary survive as an **inbound compatibility
surface only** — existing links (`/settings/{entities,fields,statuses,option-sets,relationships,calculations}`
redirects, configuration mode nav, organization domain landing tiles) keep resolving.
`resolveDataModelEntityRoute` maps them onto the Entity workspace:

| Inbound `?section=` | Resolves to |
|---|---|
| `entities` | Entity → Overview |
| `fields` | Entity → Fields |
| `statuses` | Entity → Status |
| `option-sets` | Entity → Fields (an option set is reached through the field that consumes it) |
| `relationships` | Entity → Relationships |
| `calculations` | Operational Calculations compat pane |

An explicit `?tab=` always wins over `?section=`, so an Entity deep-link is never overridden by
a stale category link. `?tab=usage` resolves to Overview — there is **no top-level Entity Usage
tab**. Usage for child objects (fields, option sets, statuses, relationships) lives on each
object's **Definition · Usage · History** workspace; field and option-set Usage links into
**Surfaces** (Focus Panels, Queue Rows) via `EntitySurfacesUsageCard`, not a detached category.

## Runtime composition

`app/adminV2/settings/organization/data-model/page.tsx` calls `loadDataModelEntitiesWorkspaceVm()`
on **every** Entity request (not gated on a section) and hands a fully-built
`DataModelEntitiesWorkspaceVm` to `DataModelWorkspaceSurface`. One server pass loads:

- entity labels (platform defaults + org overrides) and org config-lock state,
- custom `field_definitions`, **including organization-deactivated ones** so the Fields tab can
  offer a real Inactive filter instead of pretending switched-off fields do not exist
  (lifecycle state is interpreted client-side through `readFieldLifecycleState`),
- org `field_section_definitions` (the real configured categories),
- effective `status_definitions` for each Entity's status domain,
- the `option_sets` / `option_set_items` referenced by option-backed field configs.

There is no category-rail fetch waterfall and no client fetch before the operator can read the
selected Entity, its fields, its categories, or its statuses.

**One resolver, three surfaces**: `web/lib/dataModel/dataModelWorkspaceVm.ts` owns
`resolveEntityFieldCatalog` / `resolveEntityStructureCounts`, the single source that produces
`EntityStructureCountsVm`. The collection row (`EntitiesCollectionRail`), the selected-entity
header (`ConfigObjectHeader` facts), and Overview (`ConfigGlanceMetrics`) all read
`entity.structure` from the same built `EntityWorkspaceVm` — counts cannot drift.

## Entity tabs

- **Overview** — read-only Snapshot, Structure counts, Vocabulary summary, Used across Alloy.
  Every drill-in calls `onOpenTab(...)` on a sibling tab; nothing links out, and there is no
  "Open … category" affordance. The field metric reports platform / organization / computed, plus
  an inactive count only when inactive fields actually exist.
- **Vocabulary** — the editing surface for entity labels, and nothing else. Mutation path is
  unchanged (`PUT`/`DELETE /api/admin/entity-labels`). A successful save rebuilds vocabulary for
  every entity via `rebuildEntitiesWorkspaceVocabulary`; structure counts are untouched because
  label edits never change field or relationship counts. Reset restores the **Alloy default**.
- **Fields** — a real in-entity Fields experience. Three filters compose, so an operator can
  isolate (say) the inactive organization fields in one category without scrolling:
  - **Search** over field label and category label.
  - **Ownership / lifecycle**: All · Platform · Organization · Computed · Inactive
    (`ENTITY_FIELD_OWNERSHIP_FILTERS`; every option maps onto truth already on the field summary —
    `organization` is the operator name for `custom` ownership, `inactive` is `isActive === false`).
  - **Category**: Show All plus the entity's real configured categories with honest counts.

  The collection groups by category under Show All and goes flat when filtered. **New Field**
  opens a create form in the detail pane (`POST /api/admin/field-definitions`, entity type resolved
  by `entityDefinitionApiType` so child fields write to `customer_member`). The selected-field
  workspace is **Definition | Usage | History**; editing rehosts
  `PATCH /api/admin/field-definitions/:id` for tenant-configured fields (label, description,
  category, and active state for fully-owned rows) behind a **Save Field** action. Platform and
  computed fields render protected. Successful saves patch the local VM through
  `withFieldSummaryPatch` / `withFieldSummaryAdded`, which recompute category and ownership counts.
- **Field categories** — authored in place from inside the Fields tab. *Manage categories* opens
  `EntityFieldCategoriesPanel`, a thin surface over `/api/admin/field-sections`: **Add Category**
  (POST), **Rename** and **Archive** (PATCH `label` / `is_archived`), and **reorder** by writing
  explicit `sort_order`. One wrinkle is worth knowing: a category can exist for an entity with no
  org row behind it, because the platform ships seed categories. There is nothing to PATCH in that
  case, so the first rename / reorder / archive materializes an org row first (`ensureCategoryRow`)
  and then edits it. Archiving refuses while fields still live in the category. Nothing navigates
  away, and the reload rebuilds the list the same way the server does so the panel and the field
  list cannot disagree.
- **Relationships** — collection → selected relationship, **Definition | Usage | History**. Two
  kinds of row live here with genuinely different authority, and the UI does not blur them:
  - **Platform connections** are compiled edges from `entityRelationshipCatalog`. Cardinality and
    storage are Alloy's, so Definition renders protected.
  - **Your relationship terms** are tenant rows behind the role-type APIs
    (`customer-person-role-types` for family roles, `person-relationship-type-settings` for person
    connections). These support **New Relationship** and **Save Relationship** in place.

  Terms are org-wide rather than per-entity, so they are fetched client-side on mount and held in
  a separate `entity.relationshipVocabulary` slice — that keeps `structure.relationshipsTotal`
  meaning exactly one thing: the number of platform edges on this entity. Creation is offered only
  where the vocabulary is real (`entitySupportsRelationshipVocabulary`: Person → person
  connections, Family → family roles).
- **Status** — the Entity's status domain hosted in place: collection of status values → selected
  status with **Definition | Usage | History**, plus **New Status**
  (`POST /api/admin/status-definitions`). Domain ownership comes from `statusCategoryRegistry.ts`
  via `dataModelEntityStatusDomain.ts`. Editing respects two real authority levels:
  - An **organization** status is a tenant row, so `PATCH /api/admin/status-definitions/:id` owns
    name, order, and active state directly.
  - An **Alloy default** is inherited (`org_id` null). The PATCH route scopes to the caller's org,
    so editing one means *creating* an organization row that overrides it. That is offered
    explicitly ("Save as organization status") rather than pretending the inherited row is editable.

  System statuses stay protected because platform behavior depends on them.
- **History** — planned empty state; no entity audit trail exists yet, so none is fabricated.

### Option Sets

Option Sets are **not** a top-level Entity tab and there is no journey from an Entity to a detached
`/settings/option-sets/[setKey]` page. An option-backed field's Definition tab shows its shared
list; expanding it opens `EntityOptionSetPanel` (**Values | Usage | History**) inline, with
**New Option Set** (`POST /api/admin/option-sets`, for a key a field config already references but
that has no org row yet), **Add Value** (`POST …/:setKey/items`), and **Edit Value**
(`PATCH …/:setKey/items/:itemId`). Value editing needs the row identity, so
`EntityOptionSetValueVm` carries `option_set_items.id` from the loader. Keys are discovered from
field configs via `getOptionSetKeyFromConfig`, and only referenced sets are composed into the VM. A
referenced key with no matching org `option_sets` row renders as unresolved rather than showing
invented values. Mutations patch the VM through `withOptionSetReplaced`.

## Operational Calculations

Reachable by explicit deep link only (`?section=calculations`, which
`normalizeDataModelWorkspaceSection` also accepts as `analytics`). It renders the existing
`AnalyticsSettingsClient` embed with a "Back to entities" link. It is **not** in the Entity
selector and **not** in the Entity workspace header — an operator configuring an Entity is never
steered into it. Formula and registry semantics are unchanged.

## Known gaps

- **Field usage depth**: per-field usage for platform-catalog and computed fields is not tracked,
  so Usage reports visibility flags for configured fields and says so plainly otherwise.
- **History**: no audit trail exists for entity labels, field definitions, option sets, status
  definitions, or relationship terms, so those History tabs are planned empty states.
- **Category reorder cost**: because seed categories carry only an implicit platform order, a
  reorder writes `sort_order` for every position rather than swapping two rows. That is what makes
  the new order stick, but it is N requests per move.
- **Field type is immutable after creation**: the Definition editor exposes label, description,
  category, and active state. Changing a field's type would be a data migration, not a config edit.
- **Archived vs inactive fields**: the Inactive filter surfaces organization-deactivated (hidden)
  fields. Archived fields remain excluded from the Entity workspace — archival is a stronger
  retirement state than "inactive" and is not an Entity-workspace concern.
- **Relationship term deletion**: terms can be created, renamed, and deactivated, but not deleted
  from the Entity workspace.

## What this sprint does not change

- Native vs configured field storage semantics
- Status domain isolation or protected status keys
- Relationship cardinality / storage ownership
- Operational Calculation formula/registry runtime
- Any mutation API contract

## Presentation contracts

- `web/lib/dataModel/dataModelChapterRoutes.ts` — `dataModelEntityHref` (canonical),
  `resolveDataModelEntityRoute` + `DATA_MODEL_SECTION_ENTITY_TAB` (legacy inbound mapping),
  `dataModelSectionHref` (compat URL builder).
- `web/lib/dataModel/dataModelWorkspaceVm.ts` — VM types + builders
  (`buildDataModelEntitiesWorkspaceVm`, `resolveEntityStructureCounts`, `resolveEntityFieldCatalog`,
  `buildEntityFieldCategories`, `groupFieldsByCategory`), selection/tab parsing
  (`parseEntitySelection`, `parseEntityWorkspaceTab`, `parseFieldSelection`,
  `ENTITY_WORKSPACE_TABS`, `ENTITY_FIELD_DETAIL_TABS`, `ENTITY_CHILD_DETAIL_TABS`), the Fields
  filter contract (`ENTITY_FIELD_OWNERSHIP_FILTERS`, `matchesEntityFieldOwnershipFilter`,
  `entityFieldOwnershipFilterCount`), the mutation-target helpers (`entityDefinitionApiType`,
  `entitySupportsRelationshipVocabulary`, `relationshipVocabularyEndpoint`), and the client-side
  overlays (`rebuildEntitiesWorkspaceVocabulary`, `withFieldSummaryPatch`, `withFieldSummaryAdded`,
  `withFieldCategoriesReplaced`, `withStatusDomainStatuses`, `withOptionSetReplaced`,
  `withRelationshipVocabulary`, `withEntityReplaced`).
- `web/lib/dataModel/dataModelEntityStatusDomain.ts` — hub entity → status domain owner.
- `web/lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts` — server-only loader composed by the page.
- `web/components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx` — shell (no category rail).
- `web/components/adminV2/settings/dataModel/entities/` — `EntitiesWorkspaceSurface`,
  `EntitiesCollectionRail`, `EntitySelectedWorkspace`, one component per tab
  (`Entity{Overview,Vocabulary,Fields,Relationships,Status,History}Tab`), plus `EntityFieldDetail`,
  `EntityFieldCreatePanel`, `EntityFieldCategoriesPanel`, `EntityOptionSetPanel`, and
  `EntitySurfacesUsageCard` (Usage → Surfaces: Focus Panels, Queue Rows).
- `web/components/adminV2/configuration/ConfigurationAdvancedToggle.tsx` — the one disclosure that
  may reveal an internal reference or storage location.

Authorities consumed (no invented metadata): `configurationEntityCatalog.ts` (hub identity),
`fieldCatalogForSettings.ts` (platform + custom + computed catalog and edit capability),
`configurationCategoryCatalog.ts` (entity category seeds + registry labels/order),
`entityRelationshipCatalog.ts` (relationships, usage surfaces, builder availability),
`statusCategoryRegistry.ts` (status domain ownership), `statusDefinitionsResolve.ts` (effective
status rows), `dataModelWorkspaceModel.ts` (usage-surface count hints), and the `entity-labels`
API / `resolveEntityLabelsForOrg` (vocabulary).
