# Platform Simplification — Legacy Drawer Elimination (Complete)

**Branches / PRs**

| Phase | Branch | PR | Commit |
|-------|--------|-----|--------|
| 1 — Inline location create | `refactor/platform-simplification-p1-location-create` | [#144](https://github.com/ksquared-16/alloy/pull/144) | `e555c8d52` |
| 2 — Search → location surface | `refactor/platform-simplification-p2-location-search` | [#145](https://github.com/ksquared-16/alloy/pull/145) | `8e2e5db70` |
| 3/4 — Legacy drawer deletion | `refactor/platform-simplification-p3-legacy-drawer-elimination` | [#148](https://github.com/ksquared-16/alloy/pull/148) | `e94811914` |

**Staging certification:** `6daf032ce5d4d9b3f64fef0ad2a49e6443a8af3d` (floor `e94811914`)

## Doctrine (final)

> Alloy has no supported legacy entity drawer runtime.
> Canonical operator experiences route through VM, Focus Panel, Settings, Processing, Communications, or explicit operating surfaces.

## Phase 1

- Settings `/settings/locations` — inline `LocationSiteCreatePanel` (no `openDrawer`, no `id: "new"`).

## Phase 2

- Global Search campus → `/settings/locations?locationId=<id>`
- `GlobalRecordSearchOpenListener` navigates locations; does not open drawer.

## Phase 3/4

- **Deleted:** `web/components/admin/AdminEntityDrawerLegacy.tsx` (~19,713 lines / ~1.3 MB)
- **Router:** `AdminEntityDrawer.tsx` — VM entities only; `return null` for unsupported types (no legacy fallback)
- **Kill switches:** permanent VM cutover; env kill switches retired in gate modules
- **Routes:** non-canonical `/admin/*` bookmarks → `/workspace`; `/legacy-admin` root → `/workspace`
- **Tests:** retargeted from legacy monolith to VM runtimes + elimination contract tests

## Remaining `/legacy-admin`

- Route tree still exists for shared **client modules** imported by canonical AdminV2 settings/forms (not supported product navigation).
- `next.config.ts` continues redirecting `/legacy-admin/system/*` bookmarks to `/settings/*`.
- `/legacy-admin` landing redirects to `/workspace`.

## Validation

```bash
cd web
npm run test -- tests/adminV2/platformSimplification*.test.ts tests/admin/globalSearch/globalRecordSearch.test.ts
npm run typecheck
npm run typecheck:tests
npm run verify:module-imports
```

Playwright location/search specs authored; Chromium install blocked in CI agent environment.

## Intentionally deferred

- Relocating `app/legacy-admin/**` client modules still imported by canonical settings (file-path debt only; routes archived).
- Full deletion of `app/legacy-admin/` route files beyond landing redirect (requires migrating imported clients).
