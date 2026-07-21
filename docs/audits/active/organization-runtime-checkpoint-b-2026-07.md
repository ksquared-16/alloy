---
owner: engineering
status: checkpoint-b-implementation
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
base_sha: 1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0
predecessor: organization-runtime-checkpoint-a-2026-07.md
---

# Organization Runtime Checkpoint B — Locations Runtime Inheritance

**Status:** Implemented locally (Checkpoint B).  
**Predecessor:** `organization-runtime-checkpoint-a-2026-07.md` (accepted / frozen).  
**Plan:** `organization-runtime-product-realization-plan-2026-07.md`.

## 1. Executive summary

Locations now consumes the Checkpoint A **Configuration Continuity** layer as its runtime authority. Collection loading has one org-scoped cache owner; selected Location identity has one deterministic projection contract; nested concern navigation uses push history with URL props as Back/Forward authority; schedule patterns load in **one org-scoped request** instead of per-site N+1; mutations publish into the Continuity invalidation bus.

No Locations product redesign. No Work Unit kernel. No second Continuity provider. No Programs/Commercial migration.

Canonical browser path is **`/organization/locations`** (Settings `/settings/locations` remains compatible via rewrite).

## 2. Checkpoint A foundation verified

Verified against local code (not redesigned):

| Concern | Owner | Evidence |
|---------|-------|----------|
| Continuity Provider ownership | `ConfigurationContinuityProvider.tsx` | Mounted under settings providers; owns retention + warm + invalidation surface |
| Soft-nav entry | `shellNavigation.ts` + `configurationContinuity.ts` | `isConfigurationSoftNavEligibleHref` covers `/organization*` and `/settings/*` |
| Navigation acknowledgment | Soft-nav commit-first for config hrefs | Checkpoint A tests |
| Prefetch registration | `CONFIGURATION_CONTINUITY_WARM_HREFS` | Now warms `/organization/locations` (was Settings path) |
| Retained selection | `configurationSelectionRetention.ts` | sessionStorage; URL authoritative when present |
| Invalidation bus | `configurationInvalidation.ts` | Scope `locations` / `all` |
| Hard-nav kill switch | `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=0` | Unchanged |
| Recovery floor | `adminV2SoftNavReloadFloor.ts` | Settings rewrite normalization unchanged |
| Shell / provider lifetime | Soft nav keeps AdminV2 + Continuity mounted | Unchanged |
| Locations integration (A) | Retention hooks on Locations page | Extended in B with cache + selection adapter |

**Defects corrected only as inheritance blockers:** warm href + Continuity path sync now include `/organization/locations`; Locations mutations publish Continuity invalidation.

## 3. Locations runtime ownership map

| Concern | Canonical route | Compatibility | Loader / owner | Cache | Selected-location dependency | Mutations |
|---------|-----------------|---------------|----------------|-------|------------------------------|-----------|
| Collection rail / landing | `/organization/locations` | `/settings/locations` | `loadLocationsCollection` via hook | `locationsCollectionCache` | none (landing) | site create → invalidate |
| Overview | `?locationId&tab=overview` | same | client from collection snapshot | collection | required | site patch → invalidate |
| Programs | `?tab=programs&itemId=` | same | collection programCategories | collection | required | category create/patch → invalidate |
| Rooms | `?tab=rooms&itemId=` | same | collection room rows | collection | required | room create / location patch → invalidate |
| Schedule | `?tab=schedule&itemId=` | same | collection schedulePatterns (**org batch**) | collection | required | pattern create/update → invalidate |
| Tours | `?tab=tours` | same | concern fetch `tours/availability-rules` | not collection | required | tours panels → existing confirm paths |
| Placement | `?tab=placement` | same | placement panel | not collection | required | waitlist ranking confirm |
| Access | `?tab=access` | same | members fetch (scoped) | not collection | required | access save confirm |

**Server page:** `web/app/adminV2/settings/locations/page.tsx` parses `locationId` / `tab` / `itemId`.  
**Rewrite:** `web/next.config.ts` maps `/organization/locations` → `/adminV2/settings/locations`.  
**Href builders:** `locationWorkspaceModel.ts` → `/organization/locations…`.

## 4. Collection-cache contract

| Field | Value |
|-------|-------|
| Key | `locations-collection:v1:{orgId}` (`locationsCollectionCache.ts`) |
| Owner | `loadLocationsCollection` / `invalidateLocationsCollection` |
| Payload | hierarchy rows + program categories + schedule patterns |
| Lifetime | soft TTL **60s**; force refresh always allowed |
| Inflight | one Promise per org key; joiners share |
| Stale behavior | prior `peek()` retained while force refresh awaits; UI uses `refreshing` vs cold `loading` |
| Invalidation | delete key; optional Continuity bus publish (`scope: locations`) |
| Error | cold failure clears local state; warm failure keeps prior rows |
| Isolation | orgId in key — no cross-org leakage |
| Authority | **not** business truth — server APIs remain write/read authority |

## 5. Selected-location precedence contract

Implemented in `resolveLocationsSelection` (`locationsSelectionAdapter.ts`):

1. **Valid route/query `locationId`** → source `route`, no URL sync  
2. **Valid retained Continuity selection** (route omitted) → source `retained`, `shouldSyncRoute: true` (replace)  
3. **No selection** (landing) — **never invent first list item**  
4. Invalid route id → landing + error `"Location not found or unavailable."`  
5. Invalid retained id → ignored (landing)

**History:**

- Automatic retained restore → `router.replace`  
- Explicit Location / concern changes → `router.push`  
- URL props (`initialTab` / `initialItemId` / `initialLocationId`) re-project on Back/Forward  

One adapter between Locations and Continuity; page passes `retainedLocationId` from Continuity selection.

## 6. Nested concern continuity architecture

```text
ConfigurationContinuityProvider (shell lifetime)
  └─ LocationsConfigurationPage (one mounted workspace)
        · collection rail stable when location selected
        · selected Location header via ConfigObjectHeader
        · ConfigDetailRuntime tabs: overview|programs|rooms|schedule|tours|placement|access
        · tours/placement keep-alive once visited
        · collection from Continuity-aware cache (no remount fetch storm)
```

Deep links to each concern remain URL-correct. Soft-nav from Organization keeps shell + Continuity mounted.

## 7. Schedule N+1 — root cause and resolution

### Before

`useLocationsConfigurationSettings` after hierarchy load:

```text
sites.map(site => fetchSchedulePatternsForSite(site.id))  // N GETs
```

Call graph: `1× locations` + `1× program-categories` + **N× schedule-patterns?site_location_id=…**

### After

`fetchSchedulePatternsForOrg()` → single `GET /api/admin/schedule-patterns` (server already supports org scope when `site_location_id` omitted).

Collection network:

```text
Promise.all([
  GET /api/admin/locations?hierarchy=1,
  GET /api/admin/location-program-categories?include_inactive=true,
  GET /api/admin/schedule-patterns,   // 1 request
])
```

| Metric | Before | After |
|--------|--------|-------|
| Schedule requests (M sites) | M | **1** |
| Payload ownership | per-site arrays flattened client-side | org list; client filters by `site_location_id` for UI |
| Cache interaction | none (re-fan-out on every refresh) | org collection cache |
| Invalidation | full hook refresh | collection invalidate + Continuity bus |

Regression: `tests/locations/locationsScheduleBatch.test.ts`.

## 8. Mutation invalidation matrix

| Mutation | Authoritative write | Cache key | Continuity event | UI stale behavior |
|----------|---------------------|-----------|------------------|-------------------|
| Create site | `POST /api/admin/locations` | org collection | `location-site-created` (+ `admin-entity-saved`) | optimistic row + force refresh |
| Create room | `POST /api/admin/locations` | org collection | `location-room-created` | optimistic + refresh |
| Patch location | `PATCH /api/admin/locations/:id` | org collection | `location-patched` | optimistic row; cache cleared |
| Create program category | `POST …/location-program-categories` | org collection | `location-program-created` | optimistic + invalidate |
| Patch program category | `PATCH …/location-program-categories` | org collection | `location-program-patched` | optimistic + invalidate |
| Create schedule pattern | schedule API | org collection | `schedule-pattern-created` | optimistic list append + invalidate |
| Update schedule pattern | schedule API | org collection | `schedule-pattern-updated` | optimistic row + invalidate |
| Tours / Placement / Access | concern APIs | not collection (concern-local) | existing panel confirm; may later publish `locations` | held prior concern UI |

Broad “invalidate everything” avoided for concern-local mutations.

## 9. Before/after request and lifecycle evidence

### Code-evident / test-evident

| Behavior | Evidence |
|----------|----------|
| Inflight reuse | `locationsCollectionCache.test.ts` — one schedule GET for parallel loads |
| Org isolation | same — invalidate A leaves B |
| TTL cache hit | second load `cacheHit: true`, one locations GET |
| Stale peek during force | peek retained until force resolves |
| Selection precedence | `locationsSelectionAdapter.test.ts` |
| No per-site schedule fan-out in hook | `locationsScheduleBatch.test.ts` + source assert |
| Canonical hrefs | `locationWorkspaceModel.test.ts`, phase-2 search tests |
| Continuity inheritance wiring | `configurationRuntimeLocations.test.ts` Checkpoint B case |

### Request count (collection cold load)

| | Before | After |
|--|--------|-------|
| Hierarchy | 1 | 1 |
| Programs | 1 | 1 |
| Schedules | N sites | **1** |
| Nested concern tab switch | re-triggered schedule N+1 risk | **0** (cache / snapshot) |

## 10. Browser-performance evidence

### Live authenticated timings

**Deferred** — same capacity/auth gate as Checkpoint A. Exact blocker: shared-machine runtime admission / authenticated session not established for filmstrip capture in this slot session.

### Executable protocol (when capacity allows)

1. `alloy-dev-start wt4-org-runtime-realization` (port **3014**) + `alloy-agent-login 4`.  
2. Capture Performance + Network for: Organization → Locations ack; shell visible; collection usable; select Location; concern switches; Location switch; Back; Forward; return from Programs; warm revisit.  
3. Assert schedule-patterns request count = **1** on cold Locations load (regardless of site count).  
4. Assert no full remount of Continuity root across Locations concern hops (`data-configuration-continuity`).  
5. Assert no blank collection rail while `refreshing` with prior data.  
6. Record marks under `[perf:settings] continuity:*` / `config_continuity_*`.

### Certified without live ms

Lifecycle, selection, cache, schedule batch, and mutation bus contracts are certified by Vitest + typecheck. Live ms remain **uncertified**.

## 11. Test results

```text
vitest (focused): 7 files, 57 passed
  locationsCollectionCache, locationsSelectionAdapter, locationsScheduleBatch,
  locationWorkspaceModel, configurationContinuity, configurationRuntimeLocations,
  platformSimplificationPhase2LocationSearch

npm run typecheck: PASS (tsconfig.build.json)
npm run verify:module-imports: PASS after new modules are committed
```

## 12. Files changed

**Added**

- `web/lib/locations/locationsCollectionCache.ts`
- `web/lib/locations/locationsSelectionAdapter.ts`
- `web/tests/locations/locationsCollectionCache.test.ts`
- `web/tests/locations/locationsSelectionAdapter.test.ts`
- `web/tests/locations/locationsScheduleBatch.test.ts`
- `docs/audits/active/organization-runtime-checkpoint-b-2026-07.md` (this file)

**Changed (runtime)**

- `web/components/adminV2/settings/locations/useLocationsConfigurationSettings.ts`
- `web/components/adminV2/settings/locations/LocationsConfigurationPage.tsx`
- `web/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider.tsx`
- `web/lib/childcareOperational/fetchOperationalEnrollment.ts` (`fetchSchedulePatternsForOrg`)
- `web/lib/admin/canonicalLocationSettingsRoutes.ts`
- `web/lib/locations/locationWorkspaceModel.ts`
- `web/lib/configRuntime/configurationContinuity.ts` / `organizationRuntime.ts`
- `web/lib/adminV2/configurationModeNav.ts` / `configurationWorkspaceDomains.ts`
- `web/next.config.ts`

**Changed (tests)**

- Continuity + Locations + workspace model + campus search expectations

## 13. Remaining risks

1. Live filmstrip timings still deferred (capacity/auth).  
2. Tours/Placement/Access still use concern-local fetches (not collection cache) — intentional; may want Continuity-scoped concern caches in Checkpoint C.  
3. Mutation → bus → force refresh can double-fetch with `admin-entity-saved`; correctness preferred over coalescing this sprint.  
4. Retained restore uses replace; operators who cleared URL intentionally while Continuity still holds an id will be restored until they clear selection via landing.  
5. Production build not run this session (capacity); typecheck + focused Vitest are the certified bar.

## 14. Recommended Checkpoint C scope

1. Programs Continuity inheritance (selection + collection cache pattern), **without** product redesign.  
2. Concern-scoped cache for Tours availability / Access membership under Continuity invalidation.  
3. Coalesce mutation invalidation (single refresh flight).  
4. Attach live browser baseline numbers to Checkpoint A+B audits.  
5. Optional: hover prefetch of owned-concern setup for selected Location.

**Out of scope for C (still):** Work Unit kernel on Organization, Configuration Object Runtime redesign, Commercial migration, Operational Planning, Assignment/Publication/Distribution contract changes.
