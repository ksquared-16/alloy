# Alloy OS — Perceived Performance Sprint Closeout

**Worktree:** `/Users/Kelly/Alloy/.worktrees/perceived-performance-sprint`
**Final staging SHA:** `e52e5fa2c` (`fix(focus-panel): establish seeded identity before payload resolution`, PR #160)
**Closeout branch:** `feat/perceived-performance-closeout`
**Status:** **Complete** — control plane → queue plane → Focus Panel identity plane certified on staging.

---

## Completed slices

| Slice | PR | Merge SHA | Owner extended |
|-------|-----|-----------|----------------|
| Phase 1 — instrumentation + queue-row prefetch | (prior) | `b8560c7ac` | `perceivedPerf.ts`, Surface Hold, Queue Hold, row prefetch |
| Phase 1.5 — branded boot shell | (prior) | — | `AlloyOperationalBootShell`, `app/adminV2/loading.tsx` |
| Step B — canonical Work View count correctness | #157 | `c6e1adec8` | Work View population + catch-all binding |
| Step C — stable pill counts and geometry | #157 | `c6e1adec8` | Pill count retention during same-population refresh |
| Step D — queue continuity | #159 | `faa129ac9` | `queueRowsRetention`, `queueRegionRenderState` hold semantics |
| E1-a/b — seeded Focus Panel identity/context | #160 | `e52e5fa2c` | `opportunityQueuePreviewSeedFromRowContext`, seed header chips/summary |

**Chain delivered:** Work View control plane → queue content plane → Focus Panel identity plane.

---

## Final measured outcomes (post-merge staging @ `e52e5fa2c`)

Certified 2026-07-11 on `http://127.0.0.1:3001`, path `/workspace/work-unit/new-leads`, 3× browser passes per slice.

### Work View pills (Step C)

Artifact: `work-view-continuity-step-c-report.json`

| Metric | Result |
|--------|--------|
| settled pill-count disappearance frames | **0** |
| incorrect zero frames | **0** |
| pill reorder / remount / meaningful width shift | **0** |

### Queue continuity (Step D)

Artifact: `work-view-continuity-step-d-report.json`

| Metric | Result |
|--------|--------|
| blank queue frames | **0** |
| false-empty frames | **0** |
| post-settle queue skeleton frames | **0** |
| queue region remounts | **0** |

### Focus Panel seed continuity (E1-a/b)

Artifact: `focus-panel-seed-continuity-step-e1-report.json` (post-merge closeout run)

| Metric | Median | Result |
|--------|--------|--------|
| blank Focus Panel frames | — | **0** |
| generic Focus Panel Loading frames | — | **0** |
| click → seed title | **82 ms** | seed title before resolved payload |
| click → seed chips | **82 ms** | seed chips before resolved payload |
| seed → resolved payload | **2497 ms** | cold dev; network-bound |
| row-to-row header swap | **157 ms** | seeded identity on switch |

**Prior branch comparison (E1 branch, pre-closeout):** medians 143 / 143 / 2269 / 188 ms — same zero-frame contract; timing variance within cold-dev noise.

**Behavioral contracts confirmed:**

- Seed title/chips appear before resolved payload on cold queue-row open.
- Prior-body hold (`holdPriorPayload`) unchanged — body holds prior grid during row→row switch.
- Queue continuity intact across Work View pill switches.
- Work View pill counts stable after settle.

---

## Post-merge certification (2026-07-11)

### Static checks

```bash
cd web
npm run typecheck          # pass
npm run typecheck:tests    # pass
npm run verify:module-imports  # pass (7302 files)
npm run build              # pass
```

### Focused test suites

| Area | Test file | Result |
|------|-----------|--------|
| Queue preview seed mapping | `presentationRuntimeModels.test.ts` | pass |
| Focus Panel display labels | `focusPanelPolish.test.ts` | **2 pre-existing failures** (see test hardening) |
| Focus Panel subject reveal | `focusPanelSubjectReveal.test.ts` | pass |
| Inline/modal pending-header parity | `focusPanelPolish.test.ts` (seed wiring guards) | pass |
| Payload hold | `workUnitSurfaceHold.test.ts` | pass |
| Drawer determinism | `drawerDeterminism.test.ts` | pass |
| Coordinated reveal | `drawerAboveFoldCoordinatedReveal.test.ts`, `workUnitCoordinatedRevealRegression.test.ts` | pass |
| Step D queue continuity | `queueRowsRetention.test.ts`, `workUnitQueueLaneRevealState.test.ts` | pass |
| Work View count retention | `workUnitPillSwitching.test.ts`, `workViewParticipantProjection.test.ts` | pass |
| Composed payload | `composedDrawerPayload.test.ts` | pass |
| Route session cache | `routeSessionCacheAndReveal.test.ts` | pass |
| VM status first paint | `opportunityDrawerVmStatusFirstPaint.test.ts` | **1 pre-existing failure** (see test hardening) |

**Summary:** 197 / 200 tests pass. Three failures are **pre-existing test drift** on staging without E1 changes — not regressions.

---

## Deployment incident (PR #160 preview)

| Field | Value |
|-------|-------|
| Failed preview commit | `e32c6c3` |
| Failure | ESM circular import / TDZ at `CHILD_SURFACE_COMPAT_ID` during `/dev/children-card-verify` prerender |
| Root cause | Pre-existing identity-surface import cycle (`nestedSurfaceEditorModel` → `childNestedSurfaceRuntime` → `childIdentityFieldRuntime` → `identitySurfaceCompat`) |
| Fix | `291660a4b` — break cycle; inline compat constants |
| Merged staging | `e52e5fa2c` |
| Post-fix status | local build, GitHub CI (Production + Full graph), both Vercel deployments green |
| Classification | **Not an E1-a/b regression** — preview built before circular-import fix landed |

---

## Stash audit

**Stash:** `stash@{0}` — `e1-a/b WIP before continuity slice sync` (dropped 2026-07-11)

| File | vs staging |
|------|------------|
| `FocusPanelCompactHeader.tsx` | identical |
| `opportunityDrawerQueuePreviewSeed.ts` | identical |
| `focusPanelDisplayLabels.ts` | identical |
| `types.ts` (seed mapping) | identical |
| `OpportunityDrawerVmRuntime.tsx` | superseded — staging has seed chips + timing/prefetch owners |
| `InlineOpportunityFocusPanel.tsx` | superseded — staging has seed chips + prior-body hold |
| `focusPanelPolish.test.ts` | staging superset (composer chrome tests not in stash) |
| `presentationRuntimeModels.test.ts` | staging superset |

**Conclusion:** All intended E1-a/b changes present through PR #160. Remaining stash hunks were experimental prefetch/timing or older test shapes — intentionally superseded.

**Safety patch:** `/tmp/e1-ab-wip-before-continuity-slice-sync.patch` (365 lines, outside repo)

**Action:** `stash@{0}` dropped. Other stashes untouched.

---

## Test-hardening recommendation (separate follow-up)

Do **not** weaken assertions. Retarget to current canonical behavior on a dedicated branch.

### `tests/adminV2/runtime/focusPanelPolish.test.ts` (2 failures)

1. **Canvas builder ownership** — `FocusPanelSummarySurfaceEditor` no longer mounts `FocusPanelGridCanvasBuilder` directly. Assert current Experience Builder canvas ownership (likely `FocusPanelRuntimeComposerCanvas` or the active grid/composer entry the editor mounts today).
2. **Household edit affordance** — `data-household-edit-contact` selector drift; align with current per-row edit affordance markers in `HouseholdCard.tsx`.

E1 seed wiring guards in this file **pass** and should be preserved.

### `tests/adminV2/viewModel/opportunityDrawerVmStatusFirstPaint.test.ts` (1 failure)

- **`holdPriorPayload`** is now an **intentional continuity contract** in `InlineOpportunityFocusPanel` and modal runtime paths. Update the guard to assert hold semantics (e.g. hold only during subject switch, not on first paint) rather than expecting absence from source.

---

## Deferred (not blockers for E1-a/b certification)

Ranked by operator impact / implementation risk:

| Rank | Candidate | Impact | Risk | Notes |
|------|-----------|--------|------|-------|
| 1 | **E1-c body placeholders** | High — removes last cold-open body gap | Medium — must not weaken payload hold | Seed cards/skeletons while VM resolves |
| 2 | **Surface Host Phase 2 exchange orchestration** | High — cross-surface continuity | High — runtime contract surface | Depends on Surface Host ownership map |
| 3 | **Further predictive preparation** | Medium — latency reduction | Medium — prefetch discipline | Row/pill/family-workspace prewarm extensions |
| 4 | **Motion polish** | Low–medium — feel | Low — UI-only if scoped | Settle/swap tuning without reveal gate changes |
| 5 | **Deeper back/forward retained-context** | Medium — navigation continuity | High — session/cache semantics | Soft navigation + reload floor interaction |

**Not started:** E1-c, new Focus Panel runtime/cache, or additional runtime work in this closeout.

---

## Validation commands (reference)

```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint/web
npm run typecheck && npm run typecheck:tests && npm run verify:module-imports && npm run build

npm run test -- \
  tests/presentation/runtime/presentationRuntimeModels.test.ts \
  tests/admin/drawer/focusPanelSubjectReveal.test.ts \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/presentation/runtime/queueRowsRetention.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/presentation/runtime/workUnitPillSwitching.test.ts \
  tests/presentation/workUnit/workUnitSurfaceHold.test.ts

npx tsx scripts/runFocusPanelSeedContinuityStepE1.mjs   # requires dev server :3001
```

---

## Related artifacts

- `perceived-performance-sprint-audit.md` — Phase 1 / 1.5 historical audit
- `perceived-performance-boot-shell-validation.json` — Phase 1.5 browser results
- `work-view-continuity-step-{b,c,d}-report.json` — Steps B/C/D browser results
- `focus-panel-seed-continuity-step-e1-report.json` — E1-a/b browser results
