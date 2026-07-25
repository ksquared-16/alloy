# Identity / Milestones / Card Links (Phases 8–13)

**Sprint:** operational-surface-realization  
**Status:** Implemented in worktree — **HOLD** before push. Authenticated browser QA still owed.

## Phase 8 — Identity Collection Card archetype
- Shared projector: `web/lib/adminV2/runtime/focusPanel/identity/identityCollectionCardArchetype.ts`
- Runtime layout interpreter remains `build*Identity*VM` → `IdentityFieldGrid` (Summary + Context + Details)
- Entity adapters supply records/fields only; Children/Household/Employee share the same packing rules

## Phase 9 — Field layout runtime parity
**Root causes fixed:**
1. `seedPlacement` preferred stale `row`/`column` when width unchanged → reorder ignored
2. Placement packer used half=2 in a 3-unit row → two halves could never share a row
3. Editor drops updated keys/widths without rewriting `fieldPlacements`
4. Runtime VM sometimes trusted stale stored placements

**Fixes:**
- Always re-pack from key order + `fieldLayoutWidths` via `chunkNestedSurfaceFieldsForHalfRowLayout`
- `resyncIdentityFieldPlacementsInGroup` after width/reorder/drop mutations
- `placementsForIdentityGroupPurpose` always regenerates (preserves policy/label/icon only)
- Gender + Age Band resolvers + evidence fields for display

## Phase 10 — Edit capability contract
- `identityFieldEditContract.ts` — Editable only with complete write binding
- Builder select hides unsupported Editable options
- Publish validation: `validateNestedSurfacesForPublish` + `saveNestedSurfaceConfig` gate
- Computed / relationship fields stay read-only

## Phase 11 — Responsive card composition
- `focusPanelCardGridFlow.ts` — ordered grid-flow planner; row stretch; narrow stack
- Preview density hints explicitly do not claim exact runtime height

## Phase 12 — Milestones card
- Platform blueprint: `milestones/milestonesCardBlueprint.ts`
- Enrollment reference composition only (not hardcoded into the blueprint)
- Card key `milestones` registered; catalog entry added

## Phase 13 — Card Link navigation
- `focusPanelCardLinkNavigation.ts` — back/forward stacks, identity-item link resolve
- `navigateFocusPanelCardLink` separates destination vs source focus restore ids

## Browser QA still owed (re-auth slot4)
- Gender + Age Band same row → swap → Program above; 1-child and 4-child
- Editable only on write-contract fields; unsupported Editable blocked at publish
- Card path: Children → Scheduling → Back → Children (Placement when that card/link exists)
- Grid-flow with 1/2/4/overflow repeated records
