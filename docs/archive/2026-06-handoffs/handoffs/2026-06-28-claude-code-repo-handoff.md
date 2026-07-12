# Claude Code Repo Handoff — Alloy

**Date:** 2026-06-28
**Author:** Cursor (closing out) → Claude Code (incoming primary executor)
**Branch of record:** `staging` (canonical source of truth)
**Purpose:** Close the Cursor working session cleanly, account for current docs, and make Claude Code's first sprint obvious. This is a **closure + handoff + audit** document — not a build kickoff.

> Read this with: `.cursor/rules/alloy-project-context.mdc`, `.cursor/rules/alloy-development-guardrails.mdc`, `docs/platform/governance/agent-repo-boundaries.md`, and the locked runtime doctrine `docs/system/adminv2-runtime-performance-doctrine.md`.

---

## 1. Current repo status

- **Branch:** `staging`, up to date with `origin/staging` (no ahead/behind at handoff time, before the handoff commit).
- **Latest commit (pre-handoff):** `1a32c185 feat(focus-panel): compose Summary surface from card semantics (Composition Engine V1)`.
- **This handoff commit:** adds this document, the runtime convergence doc notes, the new `docs/sprints/archive/06_2026/*` documentation, and two passing evidence-test updates. (See §Files in the closing chat summary / final commit.)
- **Pushed to `origin/staging`:** yes — the handoff commit is pushed (see final commit hash in the closing summary).
- **Validation run at handoff:**
  - `cd web && npm run typecheck:build` → **fails with 13 errors**, **all** isolated to **uncommitted WIP** under `web/components/adminV2/settings/actions/*` (`ActionConfigurationDetailPanel.tsx`, `ActionsConfigurationPage.tsx`, `useActionsConfigurationSettings.ts`). The **committed tree is clean** for `typecheck:build` — these files are intentionally **not committed** (see §Known WIP).
  - `cd web && npm run test -- --run` → **626 tests failed / 10,982 passed / 18 skipped** (299 of 1,733 test files failed) at handoff. These are a **pre-existing red baseline**, **not** introduced by this doc pass (this pass changed only docs + two evidence tests that pass in isolation). Spot-checked root causes: genuine assertion drift (e.g. `tests/lib/admin/operatorNavRouteAudit.test.ts` expects `/admin/settings/lifecycle` but the committed constant is `/settings/processes`) **plus** test-environment issues (e.g. `ERR_INVALID_URL` on relative-URL fetches in node/jsdom). Treat as a baseline to triage, not a green gate.
- **Known baseline failures:** full `npm run typecheck` (whole-project, not `typecheck:build`) may have pre-existing errors, and the vitest suite has a **large red baseline (~626 tests)**. Use `typecheck:build` + **scoped** runtime tests as the working contract (see §8); the whole suite is advisory until triaged.

### Known WIP deliberately left uncommitted (for Claude to finish or discard)

An in-progress **configuration-runtime settings rollout** feature build is present in the working tree but **not committed**, because it has known TypeScript errors and is **not wired into routes** (the tracked settings pages still render `ConfigurationPatternPlaceholder`). Do not blind-commit it; finish it deliberately or discard.

| Path (untracked) | Nature |
|------------------|--------|
| `web/components/adminV2/settings/{actions,communications,fields,usersRoles}/` | WIP feature components; `actions/*` has 13 TS errors (missing exports in `web/lib/admin/actions/actionPlacementEditorUi`, implicit `any`s) |
| `web/tests/adminV2/configurationRuntimeSettingsRollout*.test.ts`, `configurationRuntimeActionsQa.test.ts`, `experienceBuilderLayoutsArchitecture.test.ts` | Evidence tests coupled to the above components (read component files as text) |
| `web/tests/admin/actions/actionDefinitionGrouping.test.ts` | WIP test |
| `web/playwright/tests/configuration-runtime-*.spec.ts`, `core-four-coherence-pass.spec.ts` | WIP Playwright specs |

### Artifacts intentionally not committed (already gitignored / scratch)

`web/tsconfig.build.tsbuildinfo`, `web/tsconfig.tsbuildinfo`, `web/test-results/*` (gitignored but tracked-legacy — recommend `git rm --cached` cleanup later), root `test-results/`, and `web/tmp/` (scratch: `tsc_v3*.txt` TS logs, `person-drawer-dom-proof.html`).

---

## 2. Current canonical architecture

The operator runtime has converged on a **View Model–first** model. The canonical cluster of docs is internally consistent on this; the foundation/governance docs were updated in this pass to point at it.

- **View Model first.** Each route composes **one** above-fold **Surface ViewModel** (`shell_nav` / `workspace` / `work_unit`) that **owns reveal**. `reveal.canCommit` is the single commit decision per route. Components render sections; they never decide readiness. Code: `web/lib/adminV2/runtime/surface/*`. Doc: `docs/platform/operator/surface-view-model-composition.md`.
- **Client adapters, not a new runtime.** Surface VMs are pure functions composed over the **existing** loader / session cache / operational bootstrap / reveal gate — **no new fetch, no new skeleton layer, no new reveal primitive**.
- **Stable page chrome.** `AdminV2Shell` (sidebar/BOS) mounts above the route and **commits once, never remounts** across `/workspace ↔ /workspace/work-unit/:slug`. The shell-nav Surface VM patches counts in place.
- **Stable drawer/Focus Panel shell.** There is **one Focus Panel runtime** on a single **operational subject** — Opportunity/Person/Child/Customer/Household drawers no longer exist as *product* architecture. Cards depend on the **Operational Context** contract from `buildOperationalContext()` (the only sanctioned adapter). The "drawer VM / composed payload" layer is **protected reveal/open-state infrastructure behind** the Focus Panel — not a product surface. Doc: `docs/platform/operator/focus-panel-runtime-cutover-report.md`, `docs/platform/operator/operational-context-boundary.md`.
- **Condensed queue path.** Default Work Unit state = **Operational Mode**: condensed queue rail beside an open Focus Panel. `CompressedQueueRow` is the sole runtime queue-row owner; full-width legacy rows (`LayoutRuntimeQueueRowView`, `CrmCompactQueuePreview`) are quarantined behind flag-off. Doc: `docs/platform/operator/queue-system.md`, `operational-mode-default-state-doctrine.md`.
- **Settings/configuration → same structure (target).** The same Surface VM pattern is designed to extend to a `SettingsSurfaceViewModel`; adopt it when a settings surface shows staggered loading (do not pre-build speculatively). Settings is currently the **least converged** family and is the best proof-of-convergence candidate (see §5/§7).
- **Command/actions runtime should be platform-owned.** Actions execute through the Command Surface host / `actions/execute` envelope — not per-surface inline `fetch`. Doc: `docs/platform/governance/implementation-patterns.md` (Command Surface), `docs/api/actions-execute-envelope-audit.md`.
- **Deterministic + documented runtime.** Reveal gates, cache keys, request-ownership/stale guards, and known-empty predicates are **protected infrastructure** with a required test suite (§8). Locked baseline: `docs/system/adminv2-runtime-performance-doctrine.md`.

---

## 3. What must not happen

Explicit guardrails for the incoming executor:

- **Do not revive or expand legacy loading paths.** Legacy queue-row renderers and per-entity drawer products are quarantined/retired; do not re-enable, extend, or branch into them.
- **Do not create new one-off page shells.** Compose a Surface VM over the existing shell; do not add a parallel chrome/shell owner.
- **Do not add new queue variants** unless they are part of the canonical **condensed** path (`CompressedQueueRow`).
- **Do not add skeletons that morph page structure.** Above-fold sections are present in final placement (snapshot/default) or hidden behind the one surface gate — never popped in late, never re-owned, never section-owned skeletons that reshape the layout.
- **Do not couple save state to full page refreshes.** Saving must not remount the shell, re-stage the surface, or trigger a cold reload.
- **Do not create competing drawer/Focus-Panel owners.** Exactly **one** authoritative renderer per above-fold region. Cards consume Operational Context; they do not each open their own drawer/payload path.
- **Do not treat `null` as empty.** `queueItems === null` = not loaded, not "no records." Respect `rowsHeld` / `rowsLoading` and the known-empty doctrine.
- **Do not change cache keys** (org/department/work-unit/queue/view scope) without updating determinism tests.
- **Do not make full `npm run typecheck` (whole project) the merge blocker** while baseline errors exist, unless explicitly asked to fix global type health. Use `typecheck:build` + scoped tests.

---

## 4. Performance problem statement (current suspicion)

- **Legacy loading and current VM/runtime loading are intertwined.** Several foundation/governance docs (now annotated) still describe the drawer-first stack as "current," and the codebase retains quarantined legacy owners behind flag-off. The risk is that edge routes or settings pages still take legacy fetch/reveal branches.
- **Pages sometimes reload or flash instead of feeling like an OS.** Symptoms to hunt: shell remount on navigation, section-owned skeletons reshaping layout, value flips after first paint, false empty queue states, duplicate fetch waterfalls.
- **Drawer/queue/settings/workspace should converge onto canonical VM-based paths.** Workspace and Work Unit are the most converged; **settings/configuration is the least** and is where legacy-vs-VM intertwining is most likely.
- **Shared platform behavior, not page-specific hacks.** Preloading, hover-warming, click-intent seeding, route/session caching, stable shells, and optimistic save flows should be **shared platform primitives** — several already exist (`prefetchOpportunityDrawerOnRowIntent`, `prefetchPersonDrawerSnapshot`, `adminV2WorkspaceSessionCache`, `metricRenderBundleCache`, queue-click seed sync) but are unevenly applied.

> Saving target: realtime/OS-like — optimistic where safe, non-jarring, stable UI, explicit failure handling. This is **not yet uniformly documented**; treat it as **target state**, not current state.

---

## 5. Target state

Every page — **including settings** — should:

- use the canonical **shell/layout** structure (one shell, commit once, no remount);
- load via the current **Surface ViewModel / runtime** path (`reveal.canCommit` owns reveal);
- keep **chrome stable** (no flash, no morph, snapshot/default slots until values patch in place);
- **preload likely next interactions** (hover-warm hrefs, row-intent prefetch, idle hydrate);
- **cache warmed records/views** (session cache, bootstrap inflight reuse, render snapshot cache);
- **avoid duplicate fetch waterfalls** (one owner per region; reuse warm caches, no re-fetch on patch);
- **avoid legacy fallback branches** (quarantined owners stay flag-off; no new branches into them);
- **save smoothly** (optimistic where safe; no full-page reload; stable UI; explicit failure handling);
- **feel like an OS**: immediate, stable, continuous.

Separate the framing when documenting progress: **current state** vs **known issues** vs **target state** vs **migration plan**. Do not over-document target behavior as if it already ships.

---

## 6. Audit checklist for Claude

For **each** area below, identify: (a) canonical path, (b) legacy path, (c) duplicate/competing owners, (d) loading behavior, (e) caching/preloading behavior, (f) save behavior, (g) deletion/sunset candidates, (h) safest migration slice.

| Area | Primary code anchors |
|------|----------------------|
| Workspace landing | `web/app/adminV2/workspace/page.tsx`, `web/lib/adminV2/runtime/surface/workspaceSurfaceViewModel.ts`, `workspaceRevealGate.ts` |
| Work-unit pages | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`, `workUnitSurfaceViewModel.ts`, `workUnitRevealGate.ts` |
| Dept pages (compat) | `web/app/adminV2/workspace/dept/[departmentId]/*` — compat/tests only; confirm not in product nav |
| Queue rows & containers | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`, `web/lib/workspace/*Queue*`, `CompressedQueueRow` vs `LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview` |
| Drawer / Focus Panel | `web/components/admin/AdminEntityDrawer.tsx`, `web/components/admin/opportunity/*`, `web/lib/admin/drawer/composedDrawerPayload/*`, `buildOperationalContext()`, `web/lib/admin/drawer/*Reveal*` |
| Settings index | `web/app/adminV2/settings/SettingsConfigurationHub.tsx`, `layout.tsx` |
| Settings/configuration subpages | `web/app/adminV2/settings/{actions,fields,communications,users-roles,analytics,layouts,...}/*` + (uncommitted) `web/components/adminV2/settings/*` |
| Actions/commands surfaces | Command Surface host, `actions/execute` envelope, `web/lib/admin/actions/*` |
| Analytics pages | `web/app/adminV2/settings/analytics/*`, OIP renderers; see `docs/sprints/archive/06_2026/analytics-operational-intelligence-platform/04-runtime-convergence.md` |
| Shared preload/cache utils | `prefetchOpportunityDrawerOnRowIntent`, `prefetchPersonDrawerSnapshot`, `adminV2WorkspaceSessionCache`, `metricRenderBundleCache`, `loadWorkUnitOperationalBootstrap` |
| Save flows | entity GET → mutation → re-render path; find anywhere a save triggers reload/remount |

---

## 7. Recommended first Claude sprint — audit-first performance convergence (not a rewrite)

1. **Map canonical vs legacy runtime owners.** Produce an inventory: for every above-fold region and route family, the sole canonical owner + any legacy/competing owner + whether it's flag-off-only or still reachable. (Start from `surface-view-model-composition.md` §"Ownership consolidation" and extend.)
2. **Pick one page family as the proof.** Recommended: **settings/configuration** (least converged, and there is already in-flight settings work to fold in) — *or* workspace/work-unit/drawer if a tighter, lower-risk proof is preferred. Compose a `SettingsSurfaceViewModel` over the existing settings-hub readiness.
3. **Remove or quarantine legacy branches only after** the equivalent current path is proven for that family (tests green, no partial reveal).
4. **Extract shared loading/preload/cache/save patterns** into platform primitives (hover-warm, row-intent prefetch, session/render cache, optimistic save helper) — replace page-specific hacks.
5. **Add tests proving no legacy path is used** (e.g. assert the canonical renderer is the sole owner; assert flag-off quarantine; reveal/known-empty regression tests).
6. **Document the locked pattern** in the relevant `docs/platform/operator/*` doc + update `implementation-patterns.md`.

Do **not** attempt a broad multi-family rewrite in sprint one. One proven family, then generalize.

---

## 8. Validation contract

```bash
cd web
npm run typecheck:build      # fast build typecheck (tsconfig.build.json) — preferred gate
npm run test -- --run        # full vitest suite
```

Scoped tests for touched runtime-sensitive areas (from `.cursor/rules/adminv2-runtime-performance.mdc`):

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

**Known baseline:**
- Full `npm run typecheck` (whole project) may have pre-existing errors → use **`typecheck:build`** as the working gate unless explicitly changing global type health.
- At this handoff, `typecheck:build` errors come **only** from the uncommitted settings WIP (§1) — the committed tree is clean.
- The vitest suite has a **large pre-existing red baseline** (~626 failing tests / ~299 failing files as of 2026-06-28), spanning VM drawer, BOS recommendations, nav route audit, and others. Some are genuine assertion drift; some are environment issues (relative-URL `fetch` → `ERR_INVALID_URL`). **Establish/triage this baseline before attributing any failure to new work**, and prefer scoped runtime suites for gating.
- `npm run verify:module-imports` is required before staging deploy when adding `@/lib/**` imports (catches uncommitted new files → Vercel `Module not found`).

---

## 9. Open risks

- **Large repo / slow TS.** Whole-project typecheck is slow and has baseline noise — prefer `typecheck:build` + scoped tests.
- **Stale background processes.** Prior sessions left scratch (`web/tmp/`, `test-results/`) and tracked-legacy build artifacts (`*.tsbuildinfo`, `web/test-results/`). Kill stray dev servers/watchers before measuring performance.
- **Multiple agents can cross wires.** Honor `docs/platform/governance/agent-repo-boundaries.md` and `.cursor/rules/repo-boundry.mdc`: this repo is `/Users/Kelly/Alloy` only; Claude-owned work outside it must not leak in. `staging` is the shared canonical branch.
- **Baseline test/typecheck failures.** Confirm the pre-existing baseline before attributing any failure to new work.
- **Legacy branches may still be reachable by edge routes** (dept compat routes, flag-off paths). Do not assume "quarantined" means "dead" without verifying reachability.
- **Performance regressions from duplicate fetches.** Adding a VM without removing the legacy owner can double-fetch; prove single-owner before deleting fallbacks.
- **Uncommitted settings WIP** (§1) will keep `typecheck:build` red on this machine until finished or removed — do not let it mask new regressions.

---

## 10. Final handoff summary — Claude should start here

1. **Read** the locked runtime doctrine (`docs/system/adminv2-runtime-performance-doctrine.md`) and the canonical View Model cluster (`surface-view-model-composition.md`, `alloy-runtime-specification.md` Part 16, `focus-panel-runtime-cutover-report.md`, `queue-system.md`).
2. **Decide** the uncommitted settings WIP (§1): finish it onto the canonical Surface VM path, or discard it — but get `typecheck:build` green on a known baseline first.
3. **Run** the audit in §6 and produce the canonical-vs-legacy owner inventory (§7 step 1).
4. **Pick one proof family** (settings recommended) and converge it onto a Surface VM with single-owner regions, then extract shared preload/cache/save primitives.
5. **Prove** no legacy path is used (tests), then **document** the locked pattern.
6. **Gate** with `typecheck:build` + scoped runtime tests; treat whole-project `typecheck` as advisory until baseline is cleaned.

**One line:** The architecture is already View Model–first (Surface VM owns reveal; one Focus Panel; condensed queue). Claude's job is **convergence and proof**, not redesign — start by inventorying legacy-vs-canonical owners, then converge one page family (likely settings) with shared, OS-like loading and save primitives.
