---
owner: operator
status: active
last_reviewed: 2026-07-24
supersedes: []
---

# Data Model product UI

UI-only product realization for **Data Model** (`/organization/data-model`).

This document freezes the operator experience so Data Model matches the configuration
workspace pattern already shipped for Financials, Access, Business Processes, and Surfaces:

1. **Category rail** — Entities · Fields · Statuses · Option Sets · Relationships · Operational Calculations
2. **Collection → Selected object → Focused workspace** inside each category
3. **Embedded editors** — no detached legacy editor as the primary journey

It does **not** redefine canonical entity, field, status, option-set, relationship, or
calculation doctrine. Those remain owned by existing platform docs and APIs.

Discovery evidence: `.alloy-agent-evidence/data-model-ui-discovery/DATA-MODEL-UI-DISCOVERY.md`

## Critical product rules

- There is **no generic Status**. Statuses are organized by explicit Status Domain.
- Stage is never presented as Status.
- Configuration steers vocabulary and presentation; platform code owns invariants.
- Selecting or editing a Data Model object stays inside the Data Model shell.
- Operational Calculations in this sprint is a **consistent shell only** — deep product is the next sprint.
- No parallel metadata system, no Location-specific Data Model vocabulary, no speculative entity extensibility.

## Information architecture

```
Data Model
  Category rail: Entities · Fields · Statuses · Option Sets · Relationships · Operational Calculations
  Selected category
    Collection
    Selected object
      Overview / Definition / Usage / History (where backed)
```

Canonical route: `/organization/data-model?section=<category>` (default `entities`).

Legacy `/settings/entities|fields|statuses|option-sets|relationships|calculations` redirect into the shell.
Option Set detail `/settings/option-sets/[setKey]` remains as compatibility until fully embedded.

## Category → authority (summary)

| Category | Primary editor embedded | Mutation authority |
|---|---|---|
| Entities | `EntitiesWorkspaceClient` | `entity_labels` APIs |
| Fields | `DataModelWorkspaceClient` | `field-definitions` APIs |
| Statuses | `StatusesConfigurationPage` | `status-definitions` APIs (domain-isolated) |
| Option Sets | `OptionSetsClient` | `option-sets` APIs |
| Relationships | `RelationshipsSettingsClient` | role/type APIs |
| Operational Calculations | `AnalyticsSettingsClient` | existing metrics APIs; code OC registry not UI-authored |

## What this sprint does not change

- Native vs configured field storage semantics
- Status domain isolation or protected status keys
- Relationship cardinality / storage ownership
- Operational Calculation formula/registry runtime
- History fabrication (Planned / empty when audit is unavailable)

## Deferred to Operational Calculations sprint

- Full calculation product anatomy (inputs, health, usage depth)
- Governed registry authoring UI (if ever)
- Formula expression redesign

## Presentation contracts (shell)

- `DataModelWorkspaceSection` — category keys
- `dataModelSectionHref` — canonical deep-links
- Category rail + embedded panes in `DataModelWorkspaceSurface`
