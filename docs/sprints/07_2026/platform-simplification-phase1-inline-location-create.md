# Platform Simplification Sprint — Phase 1

**Branch:** `refactor/platform-simplification-p1-location-create`  
**Objective:** Remove Dependency 1 — Settings Add Location → Legacy Drawer.

## Product authority (locked)

- VM / Focus Panel / Presentation Runtime / Surface Host are canonical.
- `AdminEntityDrawerLegacy` is not intentional product UX.
- Only two dependencies blocked deletion; Phase 1 removes the first.

## Pre-implementation verification

| Dependency | Code evidence | Canonical UI | Browser |
|------------|---------------|--------------|---------|
| Settings → Add Location → drawer | `LocationsConfigurationPage` `openDrawer({ type: "locations", id: "new" })` | `/settings/locations` in Configuration Mode nav | Playwright `configuration-runtime-locations` (auth required) |
| Search → Campus → drawer | Phase 2 | — | — |

`LocationsHierarchySettingsClient` drawer calls are **unmounted** (not current product).

## Phase 1 implementation

Replace drawer create with:

- `LocationSiteCreatePanel` — inline Configuration Mode workspace
- `createSiteLocation` in `useLocationsConfigurationSettings` — `POST /api/admin/locations` with `location_type: "site"`
- Remove `useAdminDrawer` / `openDrawer` from `LocationsConfigurationPage`

## Validation

```bash
cd web && npm run test -- tests/adminV2/platformSimplificationPhase1InlineLocationCreate.test.ts tests/adminV2/configurationRuntimeLocations.test.ts
cd web && npm run typecheck
cd web && npx playwright test playwright/tests/configuration-runtime-locations.spec.ts
```

## Remaining after Phase 1

- Phase 2: Global Search campus → location operating surface (not drawer)
- Phase 3–4: Reference inventory and delete `AdminEntityDrawerLegacy`
