# Surface Composer

**Status:** Canonical (July 2026)  
**Scope:** All configurable runtime surfaces in Alloy — Queue Row, Focus Panel, nested expansion surfaces, and future surfaces.

## Doctrine

**There is only one editing interaction in Alloy.**

Every configurable runtime surface consumes the same **Surface Composer**. Nested surfaces are not a separate editing system. Operators never enter a "different builder" when drilling into depth.

```
click surface → open library → place → select → inspector → publish → runtime
```

The Composer owns:

- selection and editing state
- library interaction
- placement (where the surface supports it)
- ordering
- contextual inspector
- publishing
- runtime-shaped preview
- shared editing vocabulary

Individual surfaces contribute only:

- surface definition (sections, evidence groups, capabilities)
- supported components / field catalog
- runtime renderer
- default layout
- placement constraints

## Reference implementations

| Surface | Status | Notes |
|---------|--------|-------|
| **Queue Row** | Frozen canonical reference | `QueueRowBuilderV2.tsx` — do not modify except production bugs |
| **Focus Panel** | Second consumer | Header Surface + card field composition |
| **Nested surfaces** | Third consumer | Children Surface, Financial Configuration Surface — same library + inspector |

## Shared platform modules

| Module | Role |
|--------|------|
| `lib/adminV2/settings/surfaces/surfaceComposer.ts` | Platform entry, constants, exports |
| `lib/adminV2/settings/surfaces/surfaceComposerPlacementModel.ts` | Section / line / inline placement |
| `lib/adminV2/settings/surfaces/surfaceComposerLibraryModel.ts` | Library search and grouping |
| `lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel.ts` | Generic Header Surface config |
| `components/.../composer/SurfaceItemLibraryPanel.tsx` | Shared library UI |
| `components/.../composer/SurfaceFieldInspector.tsx` | Shared field inspector (`full` or `nested` variant) |
| `components/.../composer/SurfaceHeaderSummaryEditor.tsx` | Header summary composition |
| `lib/adminV2/settings/surfaces/surfaceFieldComposer.ts` | Shared Section / Placement vocabulary |

## Surface Definition pattern

Each surface provides a **Surface Definition** module:

- `focusPanelComposerModel.ts` + `focusPanelBuilderLibrary.ts` — Focus Panel cards
- `nestedSurfaceComposerModel.ts` + `nestedSurfaceBuilderLibrary.ts` — nested evidence groups
- `queueRowComposerModel.ts` — Queue Row zones (frozen)

Surface Definitions must not implement their own library, inspector, or selection store when shared primitives exist.

## Nested surfaces

Nested surfaces drill from a parent surface (e.g. Focus Panel card → Children Surface). They use:

- the same `SurfaceItemLibraryPanel`
- the same `SurfaceFieldInspector` (`variant="nested"` — order only, no section/placement)
- the same publish → runtime pipeline via `metadata.nestedSurfaces[surfaceId]`

Breadcrumb: `Surfaces / {Parent Surface} / {Card} / {Nested Surface}`.

Persistence shape is unchanged — convergence is UI and interaction only.

## Runtime consumption

Configuration is incomplete until runtime consumes it:

```
Composer → Published Layout → Runtime Resolver → Presentation Runtime → Rendered Surface
```

| Surface | Runtime reader |
|---------|----------------|
| Queue Row | `queueRowSurfaceConfig.ts` |
| Focus Panel header | `resolveSurfaceHeaderSummary.ts` |
| Focus Panel cards | `composeEffectiveCardModel` + card config |
| Nested (Children roster) | `childrenNestedSurfaceConfig.ts` → `buildChildrenCardEvidence` |
| Nested (Child drill-in) | `childNestedSurfaceRuntime.ts` + `childFocusFieldPolicy.ts` → `ChildrenCard` / `ChildFocusEdit` |
| Nested (Household detail) | `householdNestedSurfaceRuntime.ts` → `HouseholdCard` |
| Nested (Contact edit) | `householdContactFieldPolicy.ts` → `HouseholdContactEdit` |
| Nested (Financial) | `financialNestedSurfaceRuntime.ts` |

## Domain-locked sections (V1 boundary)

Some expanded evidence groups remain **domain-locked** — owned by vertical/domain modules, not configurable in the Surface Composer yet. They are marked explicitly in runtime (`data-domain-locked="true"`) and listed in `CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS`.

| Section | Surface | Status |
|---------|---------|--------|
| Medical, Documents, Pickup instructions, Notes | Child expanded evidence | Domain-locked |
| Child focus/edit fields (program, schedule, start, DOB) | `child_surface` | Configurable display + editable; save via `saveInquiryChild` → inquiry-child / participation paths |
| Contact edit fields | `household_contact_surface` | Configurable (display + editable + save policy) |

## Builder / runtime parity

The composer canvas must render the **same runtime-shaped surface** the operator sees in production. No preview-only state. No builder-only fields that runtime ignores.

## Related docs

- [`presentation-runtime-v2.md`](./presentation-runtime-v2.md) — runtime tree and surfaces
- [`../operator/universal-nested-surface-drill-in.md`](../operator/universal-nested-surface-drill-in.md) — nested drill-in persistence and runtime
- [`../../sprints/07_2026/queue-row-builder-runtime-vocabulary-handoff.md`](../../sprints/07_2026/queue-row-builder-runtime-vocabulary-handoff.md) — Queue Row freeze
- [`../../sprints/07_2026/focus-panel-composer-handoff.md`](../../sprints/07_2026/focus-panel-composer-handoff.md) — Focus Panel composer sprint
