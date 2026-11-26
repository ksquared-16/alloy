---
owner: engineering
status: checkpoint-c-implementation
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
base_sha: 1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0
predecessor: organization-runtime-checkpoint-b-2026-07.md
---

# Organization Runtime Checkpoint C — Nested Location Concerns

**Status:** Implemented locally (Checkpoint C).  
**Predecessors:** Checkpoint A (Configuration Continuity), Checkpoint B (Locations inheritance) — **frozen**.

## 1. Executive summary

Every live nested Location concern now operates as part of **one continuous Location workspace**: shared Continuity shell, shared collection, deterministic selection, canonical concern URLs, keep-alive for heavy concerns, concern-scoped caches with stale-response protection, intent prefetch, and deliberate Continuity-bus invalidation.

No Locations redesign. No Programs product workspace. No Operational Planning / Scheduling architecture. No assignment/publication/distribution changes.

## 2. Checkpoint A and B foundations relied upon

| Foundation | Status |
|------------|--------|
| Configuration Continuity provider + soft-nav | Frozen — not reopened |
| Org-scoped collection cache + schedule batch | Frozen — not replaced |
| Selection precedence (route → retained → none) | Frozen — not changed |
| Canonical `/organization/locations` | Frozen |
| Continuity invalidation bus (`scope: locations`) | Extended with concern reasons only |

## 3. Complete concern inventory

| Concern | Canonical URL | Compatibility | Layout owner | Loader / API | Cache owner | Selection dep | Mutations | Empty semantics |
|---------|---------------|---------------|--------------|--------------|-------------|---------------|-----------|-----------------|
| Overview | `?locationId` (`tab` omitted) | `/settings/locations?…` | `LocationsConfigurationPage` + `LocationOverviewSurface` | Derived from collection | collection | required | via site edit | derived readiness |
| Programs | `?tab=programs&itemId=` | same | `ConfigChildObjectMasterDetail` | collection `programCategories` | collection | required | category patch/create | no programs for site |
| Rooms | `?tab=rooms&itemId=` | same | master-detail | collection room units | collection | required | room create / location patch | no rooms |
| Schedule | `?tab=schedule&itemId=` | same | schedule panels | collection `schedulePatterns` (org batch) | collection | required | pattern create/update | no patterns |
| Tours | `?tab=tours` | same | keepalive + `LocationToursPanel` | `TourAvailabilitySettingsClient` + owned-setup | `loc-owned-setup` | required | tour windows | no rules |
| Placement | `?tab=placement` | same | keepalive + `LocationPlacementPanel` | work-units + lifecycle-catalog | `loc-placement` (org) | rooms from collection | ranking PATCH | no waitlist WU |
| Access | `?tab=access` | same | keepalive + `LocationAccessPanel` | members + access-scope | `loc-access` | required | access-scope PATCH | forbidden vs empty team |

No additional live concerns beyond these seven.

**Citations**

- Registry: `web/lib/locations/locationConcernContract.ts` (`LOCATION_CONCERN_REGISTRY`)
- Page composition: `web/components/adminV2/settings/locations/LocationsConfigurationPage.tsx`
- Route entry: `web/app/adminV2/settings/locations/page.tsx` → `resolveActiveLocationConcern`

## 4. Runtime ownership model

```text
Configuration Continuity
  · shell, soft-nav, retention, prefetch bus, invalidation bus

Locations workspace
  · collection rail, Location identity/header, concern registry, navigate/push

Individual concerns
  · domain loaders, mutations, presentation, empty/error meaning, concern cache keys
```

No new parallel Continuity provider. No Work Unit kernel.

## 5. Canonical routing contract

| Rule | Behavior |
|------|----------|
| Path | `/organization/locations` (Settings path compatible) |
| Location | `locationId` query |
| Concern | `tab` query; omitted ⇒ overview |
| Nested item | `itemId` when supported (programs/rooms/schedule) |
| Invalid tab | normalize to overview (`normalized: true`) + `replace` when Location selected |
| Explicit concern change | `router.push` |
| Retained Location restore | `router.replace` (Checkpoint B) |
| Active concern | derived from route props → local state; Back/Forward re-project |

Href helpers: `locationConcernHref` / `locationConcernCompatibilityHref`.

## 6. Stable workspace composition

Across concern transitions:

- Continuity provider + AdminV2 shell remain mounted (soft-nav)
- Collection rail + Location header + tab bar stay mounted
- Collection is **not** refetched solely for concern navigation (TTL / cache hit)
- Tours / Placement / Access use **keep-alive** (`hidden` when inactive) after first visit
- Tours/Access remount on Location switch via `key={selectedSite.id}` while keepalive shell persists for the selected Location

## 7. Concern-by-concern findings and changes

### Overview
- Remains derived from collection + owned-setup badges
- Owned-setup now loads via `loadLocationOwnedSetup` (peek → refresh) with request seq

### Programs / Rooms / Schedule
- Still collection-backed (Checkpoint B)
- Schedule continues to use org-batch patterns only
- No product redesign; Programs deep-link to `/organization/programs` for org catalog remains

### Tours
- Embedded `TourAvailabilitySettingsClient` unchanged product-wise
- Mutations invalidate `tours` / owned-setup via Continuity bus
- Keepalive preserved; Location key remount on switch

### Placement
- Policy load moved to `loadLocationPlacementPolicy` (org-scoped cache)
- Cold vs refreshing vs empty projected via `projectLocationConcernTransition`
- Stale-response gate on request seq
- Ranking still saved on Business Process (not Location) — doctrine preserved

### Access
- Members load via `loadLocationAccessMembers` with peek/stale retention
- Forbidden vs empty vs refreshing distinguished
- Keepalive added (was remounting every tab visit)
- Permission still server-enforced (`response.ok`); cache not treated as auth

## 8. Data and cache strategy by concern

| Concern | Strategy | Key | TTL | Invalidation |
|---------|----------|-----|-----|--------------|
| Overview / Programs / Rooms / Schedule | collection | `locations-collection:v1:{orgId}` | 60s | Checkpoint B reasons |
| Owned setup (Overview badges) | concern-cache | `loc-owned-setup:v1:{orgId}:{locationId}` | 60s | tours/access mutations |
| Tours content | embedded client (+ owned-setup) | owned-setup + client | — | `tours-mutated` |
| Placement | concern-cache | `loc-placement:v1:{orgId}` | 60s | `placement-policy-saved` |
| Access | concern-cache | `loc-access:v1:{orgId}:{locationId}` | 60s | `location-access-saved` |

## 9. Mutation invalidation matrix

| Source | Write | Collection | Header | Sibling concerns | Continuity reason |
|--------|-------|------------|--------|------------------|-------------------|
| Site create/patch | locations API | invalidate | yes | overview | Checkpoint B |
| Room create | locations API | invalidate | capacity | rooms, placement rooms count | Checkpoint B |
| Program category | LPC API | invalidate | overview counts | programs | Checkpoint B |
| Schedule pattern | schedule API | invalidate | schedule summary | schedule | Checkpoint B |
| Tours windows | tours API | owned-setup | overview tours badge | tours | `tours-mutated` |
| Placement ranking | work-unit PATCH | placement cache | — | placement | `placement-policy-saved` |
| Access scope | access-scope PATCH | access + owned-setup | overview access | access | `location-access-saved` |

## 10. Prefetch policy

| Concern | Policy | Behavior |
|---------|--------|----------|
| overview | none | — |
| programs/rooms/schedule | adjacent | registry adjacency available; route prefetch on intent |
| tours/placement/access | intent | tab hover/focus → `router.prefetch` + advisory concern cache warm |

Prefetch is **advisory** (`onSectionIntent` on `ConfigWorkspaceTabBar`). No permission bypass; no authoritative apply of prefetched payloads without stale gates.

## 11. Before-and-after request evidence

| Transition | Before | After |
|------------|--------|-------|
| Concern tab switch (collection concerns) | 0 collection (B) | 0 collection (unchanged) |
| First visit Access | members GET | members GET → cached |
| Return to Access (warm) | remount + GET | keepalive + cache hit |
| Placement revisit | GET work-units + catalog | org cache hit |
| Location switch on Tours | possible stale UI | remount via `key` + owned-setup seq |
| Owned-setup Overview badges | always dual GET | peek + optional force |

## 12. Browser-history evidence

Code-certified:

- Explicit concern nav → `push` (`navigate` / `openLocation`)
- Invalid tab → `replace` normalization
- Retained Location → `replace` (B)
- Route props re-project tab/item on Back/Forward

Live filmstrip: **deferred** (same capacity/auth gate as A/B).

## 13. Performance and remount evidence

| Signal | Evidence |
|--------|----------|
| Access keepalive | `data-testid="locations-access-keepalive"` |
| Tours/Placement keepalive | existing testids retained |
| Stale-response helper | `shouldApplyLocationConcernResponse` unit tests |
| Transition kinds | `projectLocationConcernTransition` unit tests |
| Remount Location identity | `key={selectedSite.id}` on Tours/Access |

## 14. Test results

```text
vitest focused: 7 files, 52 passed
  locationConcernContract, locationConcernCache,
  configurationRuntimeLocations (+ Checkpoint C wiring),
  prior A/B suites

npm run typecheck: PASS
npm run verify:module-imports: PASS after commit of new modules
```

## 15. Files changed

**Added**

- `web/lib/locations/locationConcernContract.ts`
- `web/lib/locations/locationConcernCache.ts`
- `web/tests/locations/locationConcernContract.test.ts`
- `web/tests/locations/locationConcernCache.test.ts`
- `docs/audits/active/organization-runtime-checkpoint-c-2026-07.md`

**Changed**

- `LocationsConfigurationPage.tsx`, `LocationOwnedConcernPanels.tsx`
- `ConfigWorkspaceTabBar.tsx`, `ConfigDetailRuntime.tsx` (`onSectionIntent`)
- `app/adminV2/settings/locations/page.tsx`
- `configurationRuntimeLocations.test.ts`

16. Remaining risks

1. Live authenticated filmstrip still deferred.  
2. Tours embedded client now syncs `locFilter` on `locationId` change and retains rules during refresh; deeper Continuity marks inside Tours still optional.  
3. Placement policy is org-scoped — intentional; Location switch does not clear ranking UI (rooms strip updates).  
4. Intent prefetch may warm caches the operator never opens (bounded to intent concerns only).  
5. Mutation double-refresh (bus + local force) still possible; coalescing deferred to C.5.
6. Inventory follow-up applied: Continuity retained tab/item restore; `resolveLocationsConcernState` wired for Back/Forward projection.

## 17. Product issues intentionally deferred

- Closures / schedule exceptions provider (already disabled UI)
- Responsive redesign of concern navigation
- Programs Organization product workspace
- Commercial migration
- Operational Planning / Scheduling architecture
- Configuration Object Runtime

## 18. Recommendation for Checkpoint C.5

1. Coalesce Continuity invalidation → single in-flight concern refresh.  
2. Attach live browser filmstrip numbers for concern-to-concern and Back/Forward.  
3. Optional Tours concern-cache for availability rules list (if embedded client exposes a seam).  
4. Programs Continuity inheritance (selection + collection) **without** product redesign.  
5. Document operator-visible responsive follow-ups separately from runtime certification.
