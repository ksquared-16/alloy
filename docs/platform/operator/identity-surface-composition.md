# Identity surface composition

**Status:** Active — July 2026  
**Scope:** Focus Panel nested identity cards (Household, Children, Person, Employee, contacts)

> **Canonical disclosure model:** [Identity Surface Doctrine V2](./identity-surface-composition-v2.md) — four-layer progressive disclosure (Summary → Context → Details → Evidence). Builder and runtime share one interaction grammar. V1 sections below remain the technical baseline for persistence, parity, and compatibility.

## Summary

Identity cards on the Focus Panel share **one composition grammar** implemented on top of the existing nested-surface model (`NestedSurfaceConfig` / `NestedSurfaceGroupConfig`). `/surfaces` owns identity presentation; entity and relationship truth owns the records displayed.

There is **no parallel persistence format**. Work Template action configuration (Current Work Phase 3) is separate and unchanged.

## Canonical sources

| Surface | Canonical config | Compatibility input |
| --- | --- | --- |
| Household | `household_surface` | — |
| Children | `children_surface` | `child_surface` (adapted at read time) |
| Contact edit | `household_surface.contact_edit` | `household_contact_surface` + `fieldModes` |
| Child edit | `children_surface.child_edit` | legacy `fieldModes` on child groups |

**Policy:** `fieldPolicies` is canonical (`editable` / `read-only` / `hidden`). `fieldModes` reconciles to `fieldPolicies` at load — never the other way around.

## Shared composition model

Each identity section configures **three field purposes** plus evidence collections:

- **Summary Fields** — recognition (`selectedFieldKeys`)
- **Context Facts** — incremental operational facts (`contextFieldKeys`); **Context runtime = Summary + Context Facts**
- **Detail Fields** — inspect one identity after selection (`expandedFieldKeys`; tier `details`)
- **Evidence Collections** — proof-oriented regions (`evidenceCollections`)
- **Row layout** — `full` or paired `half` columns via one shared `resolveIdentityFieldRows` resolver
- **Avatar** — configured per section (`displayOptions.showAvatar`); photo → initials fallback
- **Badge** — relationship label, role, or configured field
- **Icons** — explicit placement override → catalog icon → none
- **Editability** — configured policy **and** runtime capability (`canMutate` + save-supported path)

### Add Field behavior

Adding a field through the nested-surface composer seeds:

- `selectedFieldKeys` (summary tier) or `expandedFieldKeys` (expanded tier)
- `fieldPolicies`, `fieldLayoutWidths`, and `fieldPlacements` (row/column/tier)
- optional `fieldIcons`

Fields must appear immediately in Builder, survive publish/reload, and render at `/work-unit` with the same layout semantics.

### Builder / runtime parity

Builder and runtime normalize identity configuration through **one canonical adapter**:

- `reconcileIdentityNestedConfig` — object form with `surfaceKey`, `currentConfig`, `legacyConfigs`
- `reconcileIdentityNestedConfigFromDocMetadata` — runtime doc read boundary
- `reconcileIdentityNestedConfigsFromMetadata` — Composer draft initialization and published-doc reload
- `legacyIdentityConfigsFromMetadata` — extracts `child_surface` and `household_contact_surface` from metadata

All household/children reads route through this path:

- Runtime: `readHouseholdNestedConfigFromDoc`, `readChildrenNestedConfigFromDoc`
- Composer: `FocusPanelComposerProvider.configFor`, `FocusPanelSummarySurfaceEditor.readNestedSurfacesFromDoc`

VM projection and rendering share:

- `identitySurfaceFromNestedConfig`
- `buildIdentityCardVM` family (`buildHouseholdContactEditFieldRows`, `buildChildIdentityRecordVM`, …)
- shared renderer components under `web/components/admin/focusPanel/identity/`

Builder may use representative preview data; runtime uses `OperationalContext.truth`. **Layout, field order, widths, icons, labels, and policies must match** after reconciliation.

### Contact edit and expanded evidence

- **Household contact edit** (`HouseholdContactEdit`) derives field rows from `buildHouseholdContactEditFieldRows` — same placement resolver, metadata, and policies as runtime summary/details. Form inputs are edit-depth controls only; save continues through `householdContactPatch` + `savePersonContact`.
- **Child expanded evidence** (`ChildExpandedEvidence`) routes configured archive fields through `buildChildIdentityRecordVM` + `IdentityFieldGrid`. Domain section chrome (`EvidenceGroup`) remains; field grammar is shared.

### Edit completion semantics

Edit completion is defined as **save success plus authoritative truth refresh → VM recompose**, not callback dispatch alone. Failed saves must not retain optimistic values in the VM.

Tests: `identitySurfaceSaveRefresh.test.ts` (household contact, child focus, expanded tier, failure semantics).

## Intentional domain adapters

These remain domain-specific by design — not accidental drift:

| Adapter | Role |
| --- | --- |
| `ChildFocusEdit` | Dedicated child edit form + `saveInquiryChild` command path |
| `ChildScheduleBlock` | Structured schedule chips in focus tier |
| `NestedSurfaceFieldLayoutSurface` | Composer builder drag layout (builder-only) |
| `InlineRuntimeFieldList` | Composer contact-edit preview chrome |
| `EvidenceGroup` | Domain section wrapper around shared `IdentityFieldGrid` in child evidence archive |
| `CONTACT_EDIT_FIELD_MAP` | Maps canonical `contact.*` field refs to `PersonContactValues` keys for save |
| `childNestedSurfaceRuntime.ts` | Compatibility authoring seed for `child_surface` (not runtime presentation) |
| `householdNestedSurfaceRuntime.ts` | Legacy `fieldModes` authoring seed helpers (reconciled at read) |

Direct `child_surface`, `household_contact_surface`, and `fieldModes` reads outside `identitySurfaceCompat.ts` and settings model seeds are not permitted for presentation.

## Deprecations

- `child_surface` — compatibility-only; prefer `children_surface`
- `household_contact_surface` — compatibility-only; prefer `household_surface.contact_edit`
- `fieldModes` — legacy; reconciled to `fieldPolicies` on load
- `selectedFieldKeys` without placements — stable default placements generated at reconcile

## Code map

| Layer | Path |
| --- | --- |
| Types | `web/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes.ts` |
| Compatibility | `web/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat.ts` |
| Row layout | `web/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows.ts` |
| Field compose | `web/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose.ts` |
| VM projection | `web/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM.ts` |
| Renderer | `web/components/admin/focusPanel/identity/*` |
| Tests | `web/tests/adminV2/runtime/identitySurfaceComposition.test.ts`, `identitySurfaceSaveRefresh.test.ts` |
