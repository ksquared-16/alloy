---
owner: engineering
status: checkpoint-c5-implementation
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
base_sha: 1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0
predecessor: organization-runtime-checkpoint-c-2026-07.md
---

# Configuration Object Runtime — Checkpoint C.5

**Status:** Implemented locally (Checkpoint C.5).  
**Frozen predecessors:** Configuration Continuity (A), Locations inheritance (B), nested Location concerns (C).

## 1. Executive summary

Checkpoint C.5 delivers the reusable **Configuration Object Runtime**: typed contracts and composition primitives for Organization-authored objects with durable identity, collection/detail structure, read-first Overview, intentional editing, and optional lifecycle slots.

Programs is **not** completed here. A compilation-safe adoption seam maps Program sections onto the object descriptor for Checkpoint D. A fixture harness proves the model without mounting on production Organization nav.

## 2. Prior runtime foundations

| Checkpoint | Authority |
|------------|-----------|
| A | Continuity soft-nav, retention, prefetch, invalidation |
| B | Locations collection cache, selection, schedule batch |
| C | Nested Location concern continuity |

These are **not** reopened. Object Runtime **composes on** Continuity; it does not replace it.

## 3. Organization domain classification

Source: `web/lib/configRuntime/configurationObject/eligibility.ts` (`ORGANIZATION_SURFACE_CLASSIFICATION`).

| Surface | Kind | Object-runtime eligible |
|---------|------|-------------------------|
| Organization landing | landing | no |
| Locations | hierarchical_workspace | no (reference laws; own workspace) |
| Location nested concerns | nested_concern | no |
| Programs | configuration_object | **yes** (Checkpoint D; Continuity retention exists, restore not wired) |
| Commercial compat home | utility | no |
| Tuition / Policies / Catalog | nested_concern (Commercial/Program) | yes later (extract) |
| Funding | utility (placeholder) | no |
| Accounting / Simulator | utility / simulation | no |
| Financials | operational (mixed) | no |
| Statuses / Surfaces | configuration_object | yes (post-Programs Detail Runtime convergence) |
| Processes | operational | no |
| Entities / Communications | singleton | no |
| Access / Fields | utility | no |

## 4. Configuration Object eligibility

A Configuration Object has durable Organization-scoped identity, collection membership, selected-object detail, authored edit state, relationships, and optional publication/activation/distribution/history.

**Not** Configuration Objects: landings, utilities, operational workspaces, simulators, singleton settings, nested Location concerns, Business Processes / operational records.

## 5. Current duplicated product patterns

| Pattern | Locations | Programs | Runtime response |
|---------|-----------|----------|------------------|
| Collection rail + detail | Custom Locations selector | `ConfigCollectionRail` | Object workspace composes `ConfigCollectionRail` |
| Object header | `ConfigObjectHeader` | same | Reused |
| Concern tabs | `ConfigDetailRuntime` | same | Reused |
| Overview | Locations overview surface | `ProgramOverviewSurface` / publication overview | New region contract + `ConfigurationObjectOverview` |
| Selection precedence | Locations adapter | ad hoc programId | Shared `resolveConfigurationObjectSelection` |
| Edit lifecycle | concern-local | draft forms in workspace | Shared editing session helpers + `ConfigurationObjectEditGate` |

## 6. Runtime ownership boundaries

```text
Configuration Continuity
  shell · soft-nav · retention · prefetch · invalidation

Configuration Object Runtime
  identity/collection/selection contracts
  concern registry helpers
  overview region order
  editing session lifecycle
  ConfigurationObjectWorkspace composition

Domain (Programs, Tuition, …)
  schema · APIs · mutations · permissions
  publication / distribution / assignment semantics
  concern content
```

## 7. Typed object contract

Package: `web/lib/configRuntime/configurationObject/`

| Module | Role |
|--------|------|
| `types.ts` | Identity, collection item, concern, overview regions, edit session, actions, lifecycle slots, workspace descriptor |
| `selection.ts` | Route → retained → none; concern Back/Forward; stale-response gate |
| `concernRegistry.ts` | Visibility/permission filter, active concern resolve, href builder |
| `editingLifecycle.ts` | begin/patch/cancel/save/fail; navigation block when dirty |
| `overview.ts` | Region order + purpose questions |
| `eligibility.ts` | Surface classification |
| `programsAdoptionSeam.ts` | Programs descriptor + sibling chapters |
| `harnessFixture.ts` | Non-production fixtures |

## 8. Collection/detail composition

`ConfigurationObjectWorkspace` (`…/object/ConfigurationObjectWorkspace.tsx`):

- Stable `xl:grid-cols-[20.5rem_minmax(0,1fr)]` when selected
- `ConfigCollectionRail` + `ConfigDetailRuntime` + `ConfigObjectHeader`
- `data-configuration-object-runtime="true"`
- Concern intent hook passthrough (`onSectionIntent`)

Does **not** copy Locations hierarchical rail/product.

## 9. Overview composition

`ConfigurationObjectOverview` projects only present regions in platform order:

identity_and_state → summary → attention → key_relationships → usage → lifecycle → recent_changes → primary_action

Answers the seven operator questions without defaulting to a form.

## 10. Editing lifecycle

`ConfigurationObjectEditGate` + `editingLifecycle.ts`:

- Read mode default; explicit Edit
- Dirty draft retained on failed save
- Save/Cancel
- Field-attached validation list
- `configurationObjectEditBlocksNavigation` for object/concern/route changes

Reuses Configuration Mode buttons — no second form framework.

## 11. Action placement

Typed `ConfigurationObjectActionPlacement`:

`collection_create` | `header_primary` | `header_overflow` | `concern` | `row_secondary`

Actions require a `mutationKey` (bounded path) — not unbound handlers. Domains bind to existing APIs / Continuity invalidation.

## 12. Optional lifecycle interfaces

Descriptor `lifecycleSlots`: assignment, publication, distribution, activation, history.

Runtime **composes** slots; domains remain source of truth. Programs seam enables assignment/publication/distribution/history without altering Program contracts.

## 13. Reference harness evidence

`ConfigurationObjectRuntimeHarness` + `harnessFixture.ts`:

- Two fixture objects, collection selection
- Overview + Relationships (edit) + History + Publication slot
- Permission-hidden `secrets` concern filtered from tabs
- Unsaved-change confirm on object/concern change
- **Not** registered in `configurationModeNav` (composition test asserts)

## 14. Programs adoption map (Checkpoint D)

Descriptor: `buildProgramsConfigurationObjectDescriptor()`.

| Object Runtime concern label | Program section key (unchanged) |
|------------------------------|---------------------------------|
| Overview | `overview` |
| Definition | `definition` |
| Delivery Options | `offerings` |
| Tuition | `pricing` |
| Locations | `availability` |
| Policies | `policies` |
| Relationships | `relationships` |
| Publication | `publication` |
| Distribution | `assignment` |
| History | `history` |

**Outside selected Program (sibling chapters):** Tuition, Catalog, Policies, Accounting, Simulator, Funding — `PROGRAMS_WORKSPACE_SIBLING_CHAPTERS` (Funding not object-eligible until authored).

**D sequence (recommended):**

1. Wire Continuity restore for `programId`/`section` (retention keys already exist; workspace does not consume them yet — inventory gap).  
2. Wrap layout with `ConfigurationObjectWorkspace` while keeping Program loaders/mutations.  
3. Map Overview to `ConfigurationObjectOverview` regions without renaming Program APIs.  
4. Gate definition editing through `ConfigurationObjectEditGate`.  
5. Keep publication/assignment/distribution panels as domain slot content.  
6. Document Commercial chapter sunset (Tuition/Policies/Catalog as nested concerns → Program ownership).  
7. Later: Statuses/Surfaces Detail Runtime convergence (eligible, not D-blocking).

**Do not** alter assignment, publication, distribution, or Program identity contracts during D.

## 15. Tests and browser evidence

```text
vitest: configurationObjectRuntime.test.ts + configurationObjectComposition.test.ts — 9 passed
typecheck: PASS
verify:module-imports: PASS after commit

Live browser filmstrip: deferred (capacity/auth) — harness is fixture/unit certified.
```

## 16. Files changed

**Added**

- `web/lib/configRuntime/configurationObject/**`
- `web/components/adminV2/settings/configurationRuntime/object/**`
- `web/tests/configRuntime/configurationObjectRuntime.test.ts`
- `web/tests/configRuntime/configurationObjectComposition.test.ts`
- `docs/audits/active/configuration-object-runtime-checkpoint-c5-2026-07.md`

**Updated**

- `docs/platform/modules/configuration-platform.md` — Object Runtime ownership pointer; Locations path status

**Not changed:** Programs workspace implementation, Locations contracts, Commercial migration, publication/distribution services.

## 17. Risks and exclusions

1. Programs still uses `ProgramsPublicationWorkspace` until Checkpoint D.  
2. Harness is not a Storybook route — intentional to avoid production dead paths.  
3. Tuition/Funding/Policies eligible but not adopted.  
4. Live filmstrip deferred.  
5. Action `mutationKey` registry is typed guidance; domains still wire handlers explicitly.

## 18. Recommended Checkpoint D sequence

1. Adopt Continuity + object selection for `/organization/programs`.  
2. Mount `ConfigurationObjectWorkspace` with Programs descriptor.  
3. Overview region migration.  
4. Intentional edit gate for definition.  
5. Certify publication/distribution slots unchanged semantically.  
6. Document Commercial compatibility sunset plan (no migration sprint in D unless authorized).
