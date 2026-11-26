# Data Model Product UI — Discovery & Authority Map

UI-only productization of Data Model onto Category → Collection → Selected object →
Focused workspace. No parallel metadata system, no schema changes, no generic Status,
no Operational Calculations runtime redesign.

Product owner doc: `docs/platform/operator/data-model-product-ui.md`

## Critical product rule

Selecting or editing a Data Model object must not navigate operators into a detached
legacy editor as the primary journey. Editors render inside the selected-object workspace.
Compatibility routes may remain as deep-links that resolve into the Data Model shell.

## Authority matrix

| Operator concept | Canonical source | Read path | Write path | Current editor | Embedded presentation | Protected | Classification |
|---|---|---|---|---|---|---|---|
| **Entities** | Hub catalog + `entity_labels` | `GET /api/admin/entity-labels` | `PUT/DELETE /api/admin/entity-labels` | `EntitiesWorkspaceClient` | Entities category → collection of hub entities → vocabulary edit in workspace | Hub keys, native identity, config lock | Existing — presentation adapter |
| **Entity registry** | Code catalogs | In-process | **No create-entity API** | Read-only via Entities/Fields | Overview only | Primary hub set | Wired; creating entity types = Unsupported |
| **Fields** | Platform catalog + `field_definitions` + computed | `GET /api/admin/field-definitions` | Field-definitions CRUD | `DataModelWorkspaceClient` | Fields category embeds entity rail + Overview/Fields/Relationships/Categories | Platform/native, reserved keys, `is_system` | Wired — shell embed |
| **Statuses** | `status_definitions` by domain | `GET /api/admin/status-definitions` | POST/PATCH/DELETE + audit | `StatusesConfigurationPage` | Statuses category — domain groups → values → detail (already Collection → Selected) | `status_key`, `is_system`, domain isolation | Wired — shell embed |
| **Option Sets** | `option_sets` + items | option-sets APIs | CRUD + audit | Legacy `OptionSetsClient` | Option Sets category → list → detail (adapter) | `set_key`, field references | Needs presentation adapter |
| **Relationships** | Role types + person relationship settings + catalog | role/type APIs | Role/type CRUD | `RelationshipsSettingsClient` | Relationships category → tabs/collection → detail | System roles, cardinality | Needs presentation adapter |
| **Operational Calculations** | Metrics UI + code OC registry | metrics APIs; registry = code | Metrics CRUD; registry not UI-authored | `AnalyticsSettingsClient` | Calculations category — existing builder embedded; registry read-only / deferred | Registered calculation keys | Shell only; deep product = next sprint |

## History

`ConfigHistoryTimeline` is used by Programs, **not** Data Model categories today.
History tabs render Planned / empty contracts — no fabricated events.

## Shared shells reused

- `ConfigurationContext`, `ConfigurationShell`, `ConfigurationQueue`, `ConfigurationQueueItem`
- `CompactGroupedLandingShell` / `CompactConfigurationLauncher` (org domain tile consumers only)
- Pattern refs: Surfaces category rail, Statuses domain→value queues, Fields `DataModelWorkspaceClient`

## Phase 2 shell decision

Immediate Data Model workspace (no conceptual landing cards). Left category rail for the six
categories. Each category embeds existing editors. Canonical route:
`/organization/data-model?section=<category>` (default `entities`). Legacy `/settings/*`
routes redirect into the shell.
