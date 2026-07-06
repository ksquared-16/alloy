# Platform Stability Sprint — Closeout

**Sprint:** Platform Stability (doctrine + typecheck + documentation)  
**Branch:** `feat/platform-stability-doctrine-typecheck`  
**Closeout commit:** docs-only stabilization commit `3d78bf3d5` (+ this closeout doc)  
**Status:** **COMPLETE** — merge before Perceived Performance Sprint

---

## Executive Summary

### Why the sprint existed

After Presentation Runtime V2 (PRV2) deleted the legacy work-unit page, `QueueBlock`, and related compat tree (`2cdd4a398`), validation gates drifted from production ownership. The protected doctrine suite had empty or stale tests, `npm run typecheck` reported dozens of errors, and active docs still pointed contributors at deleted paths. CI could not be trusted as a regression signal.

### What problems were solved

1. **Protected doctrine suite** — restored and retargeted to current owners (`QueueRegion`, `WorkUnitSurface`, `AdminEntityDrawerLegacy`, `useWorkUnitSurfaceRuntime`). All 8 locked suites green (120 tests).
2. **TypeScript gate** — `npm run typecheck` green on branch tip (tests, scripts, and production paths).
3. **Documentation** — doctrine, Cursor rules, testing-and-quality, migration map, and drawer-system router note synchronized with PRV2 ownership.
4. **CI alignment** — `.github/workflows/web-typecheck.yml` runs `npm run typecheck` (unchanged; not weakened to `typecheck:build`).

No runtime behavior was rewritten to satisfy stale tests. Assertions were updated to validate today's platform.

---

## Validation

Final gate status on **`feat/platform-stability-doctrine-typecheck` @ `3d78bf3d5`** (committed tree):

| Gate | Status | Notes |
|------|--------|-------|
| Protected doctrine suite | **GREEN** | 8 files, 120 tests passed |
| `npm run typecheck` | **GREEN** | Full platform gate (tests + scripts + app). Locally may require `NODE_OPTIONS=--max-old-space-size=8192` on large machines to avoid tsc OOM. |
| `npm run typecheck:build` | **GREEN** | Build subset; does not replace platform gate |
| `verify:module-imports` | **GREEN** on committed tree | Fails only when unrelated local WIP imports uncommitted files (observed during closeout with queue-row builder WIP) |
| `npm run lint` | **RED (report only)** | ~607 errors, ~928 warnings — **not in CI**; pre-existing baseline. Intentionally excluded from sprint scope. |
| CI (GitHub Actions) | **Not run on branch yet** | Workflow: `web-typecheck.yml` → `npm run typecheck`. Push branch + open PR to confirm. |

### Protected doctrine suite command

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

---

## Work Completed

### Doctrine stabilization

| File | Action |
|------|--------|
| `tests/admin/drawer/drawerDeterminism.test.ts` | Restored full suite; queue sections retargeted to `QueueRegion` / `useWorkUnitSurfaceRuntime` |
| `tests/adminV2/workUnitQueueLaneRevealState.test.ts` | Restored; removed obsolete `workUnitRevealRowsReady` assertion |
| `tests/adminV2/workUnitCoordinatedRevealRegression.test.ts` | Retargeted from compat page / `QueueBlock` → `WorkUnitSurface` / `QueueRegion` |
| `tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts` | Header wiring asserts on `AdminEntityDrawerLegacy.tsx` |
| `tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts` | Same + comms split layout attrs updated |
| `tests/admin/drawer/composedDrawerPayload.test.ts` | Header controls layout assertion updated (`gap-2.5`, attention row) |

**Removed:** No protected suite files deleted. Empty placeholder imports-only files were replaced with full restored suites.

**Land commit:** Doctrine test repairs landed on staging via `c8460fac3` (queue-row builder merge); not weakened.

### Typecheck stabilization

- Stale test fixtures, mocks, and script types repaired across `web/tests/**` and `web/scripts/**`.
- `npm run typecheck` green on branch tip.
- CI gate remains `npm run typecheck` — not switched to `typecheck:build`.

### Documentation synchronization

| Document | Change |
|----------|--------|
| `docs/system/adminv2-runtime-performance-doctrine.md` | Queue/drawer ownership → PRV2; runtime-sensitive file list updated |
| `docs/platform/governance/runtime-ownership-migration-map.md` | **Created** — canonical historical → current owner map |
| `docs/platform/governance/testing-and-quality.md` | `npm run typecheck` as platform gate; migration map link |
| `.cursor/rules/adminv2-runtime-performance.mdc` | Runtime-sensitive paths + migration map reference |
| `docs/platform/operator/drawer-system.md` | Router shell vs `AdminEntityDrawerLegacy` runtime owner |

### CI validation

- Workflow unchanged: `.github/workflows/web-typecheck.yml` runs full `typecheck`.
- Branch ready for PR; no CI weakening.

---

## Migration Map

| Historical owner | Current owner |
| ---------------- | ------------- |
| `QueueBlock.tsx` | `QueueRegion.tsx` + `queueRegionRenderState` |
| Compat work-unit page (`…/dept/…/work-unit/[workUnitId]/page.tsx`) | `WorkUnitSurface.tsx` |
| `useWorkUnitQueueRuntime.ts` | `useWorkUnitSurfaceRuntime.ts` |
| `shouldApplyWorkUnitQueueRowsResponse` | `queueRequestSeq` in `useWorkUnitSurfaceRuntime.ts` |
| `rowsHeld` / `rowsLoading` (page model) | `queueRegionRenderState` (`cold-loading` \| `empty` \| `rows` \| `error`) |
| Dept work-unit compat route | Workspace work-unit route (`/workspace/work-unit/:slug`) |
| Monolithic `AdminEntityDrawer.tsx` runtime | `AdminEntityDrawerLegacy.tsx` (shell router remains thin `AdminEntityDrawer.tsx`) |
| Legacy page-owned coordinated reveal | `workUnitPageRevealPolicy.ts` + `resolveWorkUnitSurfaceRenderMode` |
| Inline drawer-only record on WU host | `FocusPanelSurface` + Presentation Runtime V2 |
| `workUnitRevealRowsReady` export | `workUnitQueueLaneRevealSettled` + page reveal policy |

Canonical reference: [`docs/platform/governance/runtime-ownership-migration-map.md`](../../platform/governance/runtime-ownership-migration-map.md).

Supplemental hold tests (not in protected list): `queueRegionHold.test.ts`, `workUnitSurfaceHold.test.ts`.

---

## Remaining Technical Debt

| Item | Status | Notes |
|------|--------|-------|
| ESLint baseline | **Deferred** | ~607 errors; not in CI. Separate hygiene sprint if desired. |
| Historical docs under `docs/sprints/**`, `docs/system/**`, `docs/archive/**` | **Deferred** | May still mention `QueueBlock` as historical context. Active platform docs and migration map are authoritative. |
| `adminV2RuntimeContract.test.ts` | **Deferred** | Not in protected doctrine list; may still reference deleted paths. Fix when that module is next touched. |
| Local `tsc` OOM without heap flag | **Operational** | Use `NODE_OPTIONS=--max-old-space-size=8192` locally if typecheck OOMs. CI runners typically have sufficient memory. |
| Unrelated working-tree WIP | **Out of scope** | Queue-row builder local edits must not ship on stabilization branch. |

Nothing speculative. No open stabilization TODOs.

---

## Recommendations

### For future contributors

1. Read **`docs/platform/governance/runtime-ownership-migration-map.md`** before editing work-unit queue, reveal, or drawer tests.
2. Run the **protected doctrine suite** when touching runtime-sensitive files (listed in `.cursor/rules/adminv2-runtime-performance.mdc`).
3. Run **`npm run typecheck`** before merge — not `typecheck:build` alone.
4. Do not reintroduce source-string tests against deleted paths (`QueueBlock`, compat work-unit page, `useWorkUnitQueueRuntime`).

### What must never regress

- Treating unloaded queue state as empty (`null` / cold load ≠ "No records").
- Weakening composed payload readiness or stale-response apply guards.
- Partial above-fold reveal or section-owned above-fold skeletons.
- Changing CI to a narrower typecheck without platform approval.

### Merge recommendation

Merge **`feat/platform-stability-doctrine-typecheck`** into `staging` **before** starting the Perceived Performance Sprint. Stabilization branch contains one docs commit (`3d78bf3d5`) atop current staging; doctrine and typecheck fixes are already on staging tip via prior merges.

```bash
git push -u origin feat/platform-stability-doctrine-typecheck
gh pr create --base staging --title "Platform Stability Sprint — doctrine docs + closeout" ...
```

---

## Freeze

**Platform Stability Sprint: COMPLETE.**

Future work should build on these stabilized gates. No further stabilization work is required unless a future architecture change introduces new ownership migrations.

Perceived Performance Sprint may proceed after merge.
