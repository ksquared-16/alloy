---
owner: operator
status: active
last_reviewed: 2026-07-24
supersedes: []
---

# Data Model product UI

UI-only product realization for **Data Model** (`/organization/data-model`).

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
- Operational Calculations is a **deferred compat pane** — deep product is a later sprint.
- No parallel metadata system, no invented metadata, no speculative entity extensibility.

## Information architecture

```
Data Model
  Entity selector (collection rail): Person · Family · Child · Lead / Enrollment · Location / Site
  Selected Entity
    Overview (default) | Vocabulary | Fields | Relationships | Status | Usage | History
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
a stale category link.

## Runtime composition

`app/adminV2/settings/organization/data-model/page.tsx` calls `loadDataModelEntitiesWorkspaceVm()`
on **every** Entity request (not gated on a section) and hands a fully-built
`DataModelEntitiesWorkspaceVm` to `DataModelWorkspaceSurface`. One server pass loads:

- entity labels (industry defaults + org overrides) and org config-lock state,
- custom `field_definitions`,
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
  Every drill-in calls `onOpenTab(...)` on a sibling tab; nothing links out.
- **Vocabulary** — the editing surface for entity labels. Mutation paths are unchanged
  (`PUT`/`DELETE /api/admin/entity-labels`, `PATCH /api/admin/org/industry`). A successful save
  rebuilds vocabulary for every entity via `rebuildEntitiesWorkspaceVocabulary`; structure counts
  are untouched because label edits never change field or relationship counts.
- **Fields** — a real in-entity Fields experience: a category filter (Show All plus the entity's
  real configured categories with honest counts), a field collection (grouped by category under
  Show All, flat when filtered), and a selected-field workspace with
  **Overview | Definition | Validation | Usage | History**. Selection is local state seeded from
  `?field=`. Editing rehosts `PATCH /api/admin/field-definitions/:id` for tenant-configured fields
  (label, description, category); platform and computed fields render protected.
- **Relationships** — collection → selected relationship with
  **Overview | Definition | Usage | History**, read-only from `entityRelationshipCatalog` because
  platform edges are not per-entity mutable rows.
- **Status** — the Entity's status domain hosted in place: collection of status values → selected
  status with **Overview | Definition | Usage | History**, including the authoritative
  `table.column` the value is written to. Domain ownership comes from `statusCategoryRegistry.ts`
  via `dataModelEntityStatusDomain.ts`.
- **Usage** — surfaces this entity's data reaches, and builder availability.
- **History** — planned empty state; no entity audit trail exists yet, so none is fabricated.

### Option Sets

Option Sets are **not** a top-level Entity tab. An option-backed field's Definition tab shows its
Source; expanding it opens `EntityOptionSetPanel` (Overview / Values / Usage / History) inline,
without leaving the Entity. Keys are discovered from field configs via `getOptionSetKeyFromConfig`,
and only referenced sets are composed into the VM. A referenced key with no matching org
`option_sets` row renders as unresolved rather than showing invented values.

## Operational Calculations

Reachable as a quiet secondary entry in the Data Model context actions
(`?section=calculations`), which renders the existing `AnalyticsSettingsClient` embed with a
"Back to entities" link. It is not part of the Entity selector. Formula and registry semantics
are unchanged.

## Known gaps

- **Field usage depth**: per-field usage for platform-catalog and computed fields is not tracked,
  so the Usage tab reports visibility flags for configured fields and says so plainly otherwise.
- **History**: no audit trail exists for entity labels, field definitions, option sets, or status
  definitions, so those History tabs are planned empty states.
- **Category authoring**: the Fields tab reads the category registry but does not author it;
  creating or renaming a category still goes through the `field-sections` APIs.
- **Field creation / deletion**: the in-entity Fields tab edits existing fields only.

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
  `ENTITY_WORKSPACE_TABS`, `ENTITY_FIELD_DETAIL_TABS`, `ENTITY_CHILD_DETAIL_TABS`), and the
  client-side overlays (`rebuildEntitiesWorkspaceVocabulary`, `withFieldSummaryPatch`,
  `withEntityReplaced`).
- `web/lib/dataModel/dataModelEntityStatusDomain.ts` — hub entity → status domain owner.
- `web/lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts` — server-only loader composed by the page.
- `web/components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx` — shell (no category rail).
- `web/components/adminV2/settings/dataModel/entities/` — `EntitiesWorkspaceSurface`,
  `EntitiesCollectionRail`, `EntitySelectedWorkspace`, one component per tab
  (`Entity{Overview,Vocabulary,Fields,Relationships,Status,Usage,History}Tab`), plus
  `EntityFieldDetail` and `EntityOptionSetPanel`.

Authorities consumed (no invented metadata): `configurationEntityCatalog.ts` (hub identity),
`fieldCatalogForSettings.ts` (platform + custom + computed catalog and edit capability),
`configurationCategoryCatalog.ts` (entity category seeds + registry labels/order),
`entityRelationshipCatalog.ts` (relationships, usage surfaces, builder availability),
`statusCategoryRegistry.ts` (status domain ownership), `statusDefinitionsResolve.ts` (effective
status rows), `dataModelWorkspaceModel.ts` (usage-surface count hints), and the `entity-labels`
API / `resolveEntityLabelsForOrg` (vocabulary).
