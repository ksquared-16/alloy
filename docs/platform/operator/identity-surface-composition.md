# Identity surface composition

**Status:** Active — July 2026  
**Scope:** Focus Panel nested identity cards (Household, Children, Person, Employee, contacts)

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

Each identity section (nested evidence group) supports:

- **Summary fields** — always visible in collapsed card scan
- **Expanded fields** — behind `View details` (keyboard accessible; closes on Escape and outside click)
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

Builder and runtime consume the same published config shape and the same adapters:

- `reconcileIdentityNestedConfig`
- `identitySurfaceFromNestedConfig`
- `buildIdentityCardVM` family
- shared renderer components under `web/components/admin/focusPanel/identity/`

Builder may use representative preview data; runtime uses `OperationalContext.truth`.

## Deprecations

- `child_surface` — compatibility-only; prefer `children_surface`
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
| Tests | `web/tests/adminV2/runtime/identitySurfaceComposition.test.ts` |
