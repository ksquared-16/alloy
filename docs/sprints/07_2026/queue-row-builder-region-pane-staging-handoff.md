# Queue Row Builder + Queue Region Pane Staging Handoff

**Date:** 2026-07-06  
**Merged branch:** `feat/reconcile-queue-row-builder-region-pane`  
**Staging tip after reconcile:** `ac5f9d546`  
**Base:** `origin/staging` at `ebb969684`

This handoff covers the clean staging promote that reconciled:

- PR #88: Queue Row Surface Builder + Variants V1
- PR #89: Queue Region as one bordered pane, with corrected width and title wiring

## What Landed

The staging promote was a fast-forward from `ebb969684` to `ac5f9d546`.

Included commits:

1. `adadd3c1d` — Queue Row Surface Builder + Variants V1
2. `9bb4bc7e0` — Import `queueRowSurfaceId` in queue-row-layout route
3. `e80892af5` — Unify Queue Region as one pane aligned with Focus Panel
4. `ac5f9d546` — Restore Queue Region fixed width and title from selected pill

The missing border work lived in PR #89 commits `a0710109b` and `20a26d5f2`; it is now present on `staging`.

## Validation Completed

Queue Row builder / variants tests:

```bash
cd web && npm run test -- \
  tests/adminV2/queueRowSurfaceBuilderV1.test.ts \
  tests/presentation/runtime/resolveQueueRowVariant.test.ts \
  tests/presentation/runtime/queueRowVariantResolve.test.ts \
  tests/adminV2/queueRowBuilderV2.test.ts \
  tests/platform/surfaceLibrary.test.ts \
  tests/adminV2/surfacesNavigationModel.test.ts
```

Result: 6 files, 77 tests passed.

Queue Region / Work Unit runtime tests:

```bash
cd web && npm run test -- \
  tests/presentation/workUnit/queueRegionShell.test.tsx \
  tests/presentation/workUnit/queueRegionWiring.test.ts \
  tests/presentation/workUnit/workUnitSurfaceHold.test.ts \
  tests/presentation/runtime/useWorkUnitSurfaceRuntimePillSwitching.test.ts \
  tests/presentation/runtime/workUnitPillSwitching.test.ts
```

Result: 5 files, 22 tests passed.

Browser validation passed locally against an authenticated dev server for:

- `/workspace/work-unit/active-pipeline`
- `/adminV2/settings/surfaces` → Queue Rows

Local screenshots were captured under `web/test-results/reconcile-pr88-pr89/`:

- `01-work-unit-queue-pane.png`
- `02-settings-queue-rows-builder.png`

## Caveats

The protected AdminV2 doctrine suite is currently red on latest staging for unrelated stale tests, stale paths, and drawer assertions. These failures were not introduced by this reconciliation.

Observed categories:

- Some doctrine-listed files contain no runnable test suite.
- Some source-string tests still reference legacy paths such as `app/adminV2/workspace/dept/.../page.tsx` and `QueueBlock.tsx`.
- Drawer header / BOS layout assertions fail in files outside this merge.

`npx tsc --noEmit` also has existing repo-wide issues:

- Default heap can OOM.
- With a larger heap, TypeScript reports pre-existing errors in unrelated `scripts/` and `tests/**`.
- None of the reported errors matched the reconciled Queue Row / Queue Region files.

Browser proof was local-only. Staging should still be smoke-tested after deployment.

## Plan To Handle Caveats

1. Repair the protected AdminV2 doctrine suite:
   - Restore or remove empty doctrine-listed tests.
   - Retarget stale source-string tests to current PRV2 files such as `WorkUnitSurface`, `QueueRegion`, and current queue hold helpers.
   - Move unrelated drawer header assertions into their own cleanup PR.

2. Stabilize typecheck:
   - Raise typecheck heap with `NODE_OPTIONS=--max-old-space-size=8192`.
   - Decide whether CI should typecheck deploy-critical source separately from historical scripts/tests.
   - Fix or quarantine stale test fixtures that no longer match current types.

3. Smoke-test staging deploy:
   - `/workspace/work-unit/active-pipeline`: one bordered Queue Region, narrow queue pane, wider Focus Panel, title follows selected pill, count reflects selected view.
   - `/settings/surfaces` → Queue Rows: process-backed Queue Row surface opens the full-bleed builder with variants.

4. Close or mark PR #88 and PR #89 as superseded once staging deploy is confirmed. Do not merge them separately after this promote.

## Recommendations

- Treat `staging` at `ac5f9d546` as the source of truth for the combined PR #88 + PR #89 work.
- Keep Queue Rows catalog-backed through `useQueueRowProcessCatalog`; do not restore hardcoded Pipeline / Waitlist surface entries.
- Keep the queue column fixed at `xl:w-[24rem] xl:flex-none xl:shrink-0` unless intentionally changing to the 440px runtime rail constant.
- Do not alter queue reveal gates, stale-response guards, or known-empty semantics as part of future visual layout work.
- Use the focused test suites above as the required gate for Queue Row / Queue Region changes until the broader doctrine suite is repaired.
