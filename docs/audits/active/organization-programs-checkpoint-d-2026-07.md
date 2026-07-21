---
owner: engineering
status: checkpoint-d-implementation
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
predecessor: configuration-object-runtime-checkpoint-c5-2026-07.md
---

# Organization Programs — Checkpoint D

**Status:** Implemented locally pending operator QA certification.  
**Frozen predecessors:** Configuration Continuity (A), Locations inheritance (B/C), Configuration Object Runtime (C.5).

## 1. Executive summary

Checkpoint D makes **Programs** the first production Configuration Object consumer. `/organization/programs` inherits Continuity, mounts `ConfigurationObjectWorkspace`, uses a Programs collection cache, restores retained Program/concern without inventing a first-item default, and keeps publication / assignment / distribution / local-availability contracts unchanged.

## 2. Runtime foundations inherited

| Checkpoint | Role |
|------------|------|
| A | Soft-nav Continuity, retention, prefetch, invalidation |
| B/C | Locations quality reference (selection, cache, concern continuity) |
| C.5 | `ConfigurationObjectWorkspace`, edit gate, Programs descriptor seam |

## 3. Programs authority map

| Concern | Authority | Citation |
|---------|-----------|----------|
| Identity | `programs`, `program_drafts`, `program_revisions` | publication migration + `programPublicationService.ts` |
| List/detail | `GET /api/admin/configuration/programs` | `web/app/api/admin/configuration/programs/route.ts` |
| Mutations | POST actions create/update/validate/publish/assign/preview/retry | same route |
| Assignment | `configuration_consumptions` via assign/preview | service assign paths |
| Local availability | `location_program_categories.is_active` (+ evidence) | Location-owned |
| Publication | immutable `program_revisions` + `configuration_publications` | publish action |
| Distribution | runs / targets / delivery_attempts + retry | ConfigDistributionRuntime |
| History | `buildConfigurationHistory` from publications/runs/attempts | `runtimeModel.ts` |

## 4. Route and compatibility

| Entry | Behavior |
|-------|----------|
| `/organization/programs` | Canonical Programs collection / object workspace |
| `/organization/programs?chapter=tuition\|catalog\|policies\|accounting\|simulator\|funding` | Programs workspace chapters (former Commercial tools) |
| `/settings/commercial` (+ tuition / chapter query) | Compatibility redirect → Organization Programs |
| `/settings/commercial/programs` (+ admin variants) | Redirect → canonical Programs |
| Config-mode Programs active | `/organization/programs` only |

## 5. Collection contract

- Cache: `web/lib/programs/programsCollectionCache.ts` (`programs-collection:v1:{orgId}`, TTL 60s, inflight reuse)
- Warm: ContinuityProvider loads Programs collection with Locations
- Landing: no auto-select first Program
- Signals: existing collection item projection (`buildProgramCollectionItem`)

## 6. Selection and Continuity

- Adapter: `web/lib/programs/programsSelectionAdapter.ts` → object selection laws
- Precedence: route → retained → none
- Explicit select: `router.push`
- Retained restore: `router.replace`
- Invalid retained/route: fail closed

## 7. Program header

`ConfigurationObjectWorkspace` + `ConfigObjectHeader` — identity, lifecycle, publication fact, Edit Program.

## 8. Overview

Existing `ProgramOverviewSurface` (read-first) remains the Overview body; opened via object workspace.

## 9. Editing lifecycle

Definition uses `ConfigurationObjectEditGate` + editing lifecycle helpers. Unsaved dirty state blocks Program/concern navigation (confirm) and `beforeunload`.

## 10–14. Concerns

| Tab label | Section key | Notes |
|-----------|-------------|-------|
| Delivery Options | offerings | Existing ProgramOfferingsSection |
| Tuition | pricing | Sibling commercial chapter still reachable |
| Locations | availability | Assignment vs local offered clarified |
| Publication | publication | Immutable revisions only (no distribution list) |
| Distribution | assignment | Assign workflow + ConfigDistributionRuntime / retry |
| History | history | ConfigHistoryTimeline |

## 15. Commercial sibling compatibility

`PROGRAMS_WORKSPACE_SIBLING_CHAPTERS` rendered as links to `/settings/commercial`. No Tuition/Catalog/Policies migration.

## 16. Cache / invalidation

| Event | Effect |
|-------|--------|
| Continuity invalidation `programs` / `locations` / `all` | Force Programs collection reload |
| Draft save / publish / assign | `invalidateProgramsCollection` (+ locations bus on assign) |

## 17. Permissions

Unchanged: `settings.read` / `settings.manage` (+ role fallbacks) on configuration programs API. UI `canManage` from snapshot capabilities.

## 18. Performance evidence

- Collection warm on settings shell mount
- Peek before cold loading gate
- Object workspace reuses Locations-grade composition
- Operator QA checklist: `organization-runtime-qa-certification-2026-07.md` (+ Programs section below)

## Checkpoint D1 — Programs Landing Page

**Status:** Implemented locally pending operator QA.  
**Scope:** Landing only — selected Program concerns unchanged.

### Landing ownership

| Concern | Owner |
|---------|--------|
| Route | `/organization/programs` (no `programId`) |
| Composition | `ProgramsLanding.tsx` via `ProgramsPublicationWorkspace` landing branch |
| View model | `buildProgramsLandingViewModel` in `programsLandingModel.ts` |
| Collection cache | `programsCollectionCache.ts` (unchanged owner) |
| Continuity | Retained selection restore preserved; no first-Program auto-select |

### View-model contract

`ProgramsLandingViewModel` provides `summary`, `programs[]`, `attention[]`, and `permissions`.

### Readiness definition (deterministic)

A Program is **ready for Location use** iff:

1. Identity present (`key` + draft label)
2. Published revision exists (`latestPublication != null`)
3. Assigned to ≥1 Location (`assignment.assignedCount > 0`)

Average readiness % continues to use known setup areas from `deriveConfigurationRuntimeModel` (unknown areas excluded).

### Attention definition

Uses existing `ConfigurationRuntimeAttentionItem` grades (`fix` / `improve`) from `buildProgramPublicationViewModel` — publication missing, unpublished changes, distribution failure, assignment drift, setup gaps. Reason codes are stable keys; panel entries open the Program + mapped concern.

### Collection composition

Locations-grammar landing: readiness / attention / inventory cards + searchable list + Needs attention panel. Rows show name, audience/description, lifecycle, publication, assignment, delivery options, readiness %.

### Loading / error / empty

| State | UI |
|-------|-----|
| Loading | Bounded “Loading Programs…” |
| Unavailable (`not_initialized` / migration) | Compact unavailable card + Retry + engineering reference |
| Valid empty | First-use empty with Add Program |
| Request failed with prior peek | Retains warm snapshot; loadIssue set |
| Permission | `canManage` gates Add Program |

Related workspace chapters remain under a quiet “Related” strip — not Commercial shell ownership.

### Operator QA checklist (D1)

- [ ] Landing clarity vs Locations rhythm  
- [ ] Readiness / attention usefulness  
- [ ] Collection readability + Add Program  
- [ ] Empty / unavailable / error distinct  
- [ ] Programs ↔ Locations continuity  
- [ ] Perceived speed / no Commercial bounce  
- [ ] Console / network cleanliness  

---

## 19. Operator QA results

_Pending live operator pass on http://localhost:3014/organization/programs (Checkpoint D1 landing)._

## 20. Tests

- `tests/programs/programsSelectionAdapter.test.ts`
- `tests/programs/programsCollectionCache.test.ts`
- `tests/configPublication/programsPublicationUi.test.tsx` (landing + object concerns)
- `tests/configRuntime/configurationObjectComposition.test.ts` (Programs mounts object workspace)

## 21. Files changed (primary)

- `ProgramsPublicationWorkspace.tsx`
- `programsCollectionCache.ts`, `programsSelectionAdapter.ts`
- `programsAdoptionSeam.ts`, ContinuityProvider warm
- `ProgramDomainSections.tsx` (Locations wording + deep links)
- Checkpoint D audit + tests

## 22. Remaining risks

- Commercial chapter tabs are not URL-addressable; sibling links land on Commercial home
- Definition edit save failure path relies on shared `run()` error banner (edit session remains dirty)
- Publication migration columns vs staging assignment columns remain environment-sensitive for Location programs (prior QA fix)

## 23. Recommended Checkpoint E

1. Retire Commercial as Programs peer IA  
2. Extract Tuition/Catalog/Policies object or Program concerns honestly  
3. Statuses/Surfaces Detail Runtime convergence  
4. Coalesce Continuity invalidation refresh storms  

---

## Programs operator QA checklist (localhost:3014)

- [ ] Organization → Programs feels continuous  
- [ ] Collection landing (no forced first Program)  
- [ ] Select Program → Overview read-first  
- [ ] Edit / Save / Cancel definition  
- [ ] Delivery Options / Locations / Publication / Distribution / History  
- [ ] Assignment ≠ local availability language clear  
- [ ] Back / Forward / hard refresh / retained restore  
- [ ] Locations continuity still intact  
