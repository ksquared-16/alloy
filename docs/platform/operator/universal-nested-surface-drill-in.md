---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Universal Nested-Surface Drill-In Editing

**Status:** Landed (July 2026)  
**Scope:** `/settings/surfaces` Focus Panel builder + Presentation Runtime consumption seam

## Summary

Nested surfaces are **not a second editor system**. A card's Expanded or Workspace depth opens another registered `SurfaceSpec` (`openSurfaceId`). Operators drill into that nested surface from the **Surface Builder canvas**, configure evidence groups and fields, and publish into the existing Focus Panel summary doc metadata. Runtime cards consume the same persisted shape.

**One registry, one editor, one persistence path.**

## Source of truth

| Concern | Authority |
|--------|-----------|
| Nested surface identity + evidence groups | `SurfaceSpec` in `surfaceRegistry` (`recursiveSurfaceProofs.ts`, future surfaces) |
| Editable group defs | `groupDefsFor(surfaceId)` → `getSurface` + `surfaceComponents` |
| Depth navigation / launchers | `nestedLaunchersForSurface(surface)` → `resolveOpenSurface` |
| Field availability | Namespace-driven via `compositionFieldAdapter` (unchanged) |
| Persistence | `metadata.nestedSurfaces[surfaceId]` on Focus Panel summary `entity_layouts` doc |

There is **no** `NESTED_SURFACE_DEFS` parallel map. Register a surface with evidence groups → it becomes editable without a second definition.

## Operator UX (`/settings/surfaces`)

1. Open a Focus Panel surface in the builder.
2. On the canvas, cards with a depth-bound nested surface show **Configure expansion →** on the card.
3. Click drills into `NestedSurfaceEditor` for that nested surface (same path as breadcrumb chips).
4. Add / remove / reorder fields per evidence group; **Save & Publish** writes through `nestedSurfaceConfigService`.

Breadcrumb trail: `Surfaces / Focus Panel / {Card} / {Nested Surface}`.

Chip launchers above the canvas remain as a fallback; **canvas affordance is primary**.

## Persistence shape

```json
{
  "metadata": {
    "nestedSurfaces": {
      "children_surface": {
        "surfaceId": "children_surface",
        "groups": [
          { "key": "placement", "selectedFieldKeys": ["child.room", "inquiry_child.program"] }
        ]
      },
      "financial_configuration_surface": { "...": "..." }
    }
  }
}
```

- `groups[].key` must match evidence group keys on the registered `SurfaceSpec`.
- `selectedFieldKeys` are real refKeys only (platform + tenant custom, namespace-validated at publish).
- `reconcileNestedSurfaceConfig` merges loaded config with the current registry (adds new groups, drops stale keys).

## Runtime consumption pattern

Shared reader: `lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader.ts`

```text
readNestedSurfaceConfigFromDoc(doc, surfaceId)
  → reconcileNestedSurfaceConfig
nestedSurfaceFieldKeysFromConfig(config)  // flat ordered keys
```

Card-specific adapters project configured keys into rendered evidence:

| Card | Surface id | Adapter |
|------|------------|---------|
| Children | `children_surface` | `childrenNestedSurfaceConfig` → `buildChildrenCardEvidence({ childDetailFieldKeys })` |
| Billing Preview | `financial_configuration_surface` | `financialNestedSurfaceRuntime` → expanded group sections |

**Principle:** runtime reads published metadata; it does not re-derive composition or invent fields.

## Registry utilities

- `ensureRuntimeSurfacesRegistered()` — must run before `getSurface` / `resolveOpenSurface`.
- `nestedLaunchersForSurface(surfaceSpec)` — generic launcher derivation (any parent surface).
- `focusPanelNestedSurfaceByCardKey()` — canvas card key → nested surface id (Focus Panel seam).
- `FOCUS_PANEL_CARD_COMPONENT_IDS` — maps runtime card keys to registry component ids.

## Deferred: deeper recursion

This sprint proves **one drill level** (Focus Panel card → nested surface). The same primitives support nested-of-nested later:

- `walkSurfaceGraph` / `componentOpenSurfaceIds` already follow depth + handoff links.
- `nestedLaunchersForSurface` on a nested parent surface yields deeper launchers without new storage.
- Expanded surfaces inside nested surfaces are **not** wired in runtime yet — do not fork persistence when adding them; reuse `metadata.nestedSurfaces[surfaceId]`.

## Key files

| File | Role |
|------|------|
| `lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs.ts` | Proof surfaces + evidence groups |
| `lib/platform/surfaceComposition/registerRuntimeSurfaces.ts` | Registration + launcher derivation |
| `lib/adminV2/settings/surfaces/nestedSurfaceEditorModel.ts` | Registry-driven editor model |
| `lib/adminV2/settings/surfaces/nestedSurfaceConfigService.ts` | Draft/publish persistence |
| `components/admin/focusPanel/FocusPanelGridCanvasBuilder.tsx` | Canvas drill-in affordance |
| `components/adminV2/settings/surfaces/NestedSurfaceEditor.tsx` | Group/field editor UI |

## Related doctrine

- [`experience-builder-v3-universal-surface-composition.md`](./experience-builder-v3-universal-surface-composition.md) — Expanded = Open Surface
- [`focus-panel-composition-v2-and-editing.md`](./focus-panel-composition-v2-and-editing.md) — Focus Panel editing shell
- [`presentation-runtime-carry-forward.md`](./presentation-runtime-carry-forward.md) — runtime adoption boundary
