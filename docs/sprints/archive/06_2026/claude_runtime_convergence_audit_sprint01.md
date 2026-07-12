# Claude Runtime Convergence — Sprint 01 (Audit-First)

**Date:** 2026-06-28
**Author:** Claude Code (incoming primary executor)
**Branch of record:** `staging` (canonical) — audited at handoff commit `f1e1c883d` (= `origin/staging` HEAD).
**Inputs:** `docs/archive/2026-06-handoffs/handoffs/2026-06-28-claude-code-repo-handoff.md`, `docs/system/adminv2-runtime-performance-doctrine.md` (locked), `docs/platform/operator/surface-view-model-composition.md`, `docs/platform/operator/drawer-sunset-roadmap.md`.
**Type:** Audit + plan + first-slice selection. **Not** a rewrite.

> Framing discipline (per operational-ux-doctrine): each finding is tagged **[current]** (what ships), **[issue]** (observed problem), **[target]** (desired end state), or **[plan]** (migration step). Target behavior is **not** documented as if it already ships.

---

## 0. Handoff reconciliation (important corrections)

- **[current]** The audited worktree was **1528 commits behind** `origin/staging`. The handoff commit `f1e1c883d` **is** the current `origin/staging` HEAD. Audit was performed against that commit (detached checkout; no destructive reset).
- **[current] The "uncommitted settings WIP" described in handoff §1 is absent.** Those files (`web/components/adminV2/settings/{actions,communications,fields,usersRoles}/*` and coupled evidence tests) were **never committed** and do not exist in a clean checkout of staging. Consequence: there is **no local WIP to stash, finish, or discard** (handoff §10.2 is effectively resolved — discarded by never being committed), and the committed tree should be **clean for `typecheck:build`** (the 13 reported errors were WIP-only).
- **[current]** `web/node_modules` is **absent** after the checkout; `npm ci` is required before `typecheck:build` or vitest can run.

---

## 1. Canonical vs legacy runtime owner inventory (Deliverable 1)

Legend: **Canonical** = the sole sanctioned runtime owner under `NEXT_PUBLIC_ALLOY_OS_RUNTIME`. **Legacy** = quarantined/flag-off/compat. **Reachable?** = whether legacy can still paint with the runtime flag on.

| Area | Canonical owner | Legacy / competing owner | Reachable w/ flag on? | Loading behavior | Notes |
|------|-----------------|--------------------------|-----------------------|------------------|-------|
| **Workspace landing** | `composeWorkspaceSurfaceViewModel()` → `workspace/page.tsx` gates on `workspaceSurfaceVm.reveal.canCommit` (= `workspaceRevealGate.above_fold_ready`) | none (no flag-off body path) | No | **[issue]** warm-return refetches `/api/admin/departments` unconditionally; read-then-write session-cache churn; OIP KPI fetch fires even when scope has no placements | Single VM owner is clean; inefficiency is in **cache reuse**, not ownership |
| **Work-unit page** | `workUnitSurfaceViewModel` → page gates on `reveal.canCommit` (= `resolveWorkUnitPageContentReady`) | — | — | composed reveal correct on the queue path | Gate correct; the flash is below (queue rows) |
| **Queue rows** | `CompressedQueueRow` (sole owner when `ALLOY_OS_RUNTIME_ENABLED`) | `LayoutRuntimeQueueRowView`, `CrmCompactQueuePreview` (full-width) | `CrmCompactQueuePreview` full-width: **No** (unreachable, `compressedRowPresentation` always true). `LayoutRuntimeQueueRowView`: **YES** when layout runtime enabled + layout doc pinned | **[issue] THE WORK-UNIT FLASH** — `useOpportunityQueueLayoutRuntime()` fetches the layout doc on an **independent loading state, decoupled from the reveal gate**: skeleton (`LayoutRuntimeQueueRowHold`) → `LayoutRuntimeQueueRowView` → `CrmCompactQueuePreview` fallback = up to 3 morphs after the surface has already committed | `QueueBlock.tsx` is **runtime-protected** (doctrine §Runtime-sensitive files) |
| **Queue prepare panel** | `OperationalModeQueuePreparePanel` → compressed rows | — | — | **[issue]** secondary morph: prepare panel collapses into compressed rows when a subject opens | Mitigated but still a transition |
| **Drawer / Focus Panel** | Focus Panel = VM drawer runtime: `OpportunityDrawerVmRuntime` / `PersonsDrawerVmRuntime` (via `AdminEntityDrawer` router + `EntityDrawerOperatingShell`) | `AdminEntityDrawerLegacy.tsx` (~19.5k lines, single monolith) | Opportunity: **No** unless `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH`. Person/Child: **No** (VM mandatory, no kill switch). Job/schedule/contacts/location/etc.: **legacy only** (no VM path) | composed reveal | **Drawer shell stays as infrastructure** per sunset roadmap — see §3 |
| **Settings index** | `SettingsConfigurationHub` (static tiles from `CONFIGURATION_MODE_NAV_GROUPS`) | — | — | **[current]** static, no async, no VM needed | Not a loading problem |
| **Settings subpages** | none — `page.tsx` (RSC, `force-dynamic`) → header + `ConfigurationPatternPlaceholder` + **client hub that delegates to shared legacy clients** | `@/app/legacy-admin/system/*` (`PersonFieldsClient`, `LocationFieldsClient`, …), `@/components/admin/EntityFieldsClient` | **YES** (these legacy clients ARE the current product UI) | **[issue]** no Surface VM, no coordinated reveal; each legacy client self-fetches + self-skeletons → staggered loading; plus the shared `settings/loading.tsx` morph (see §2) | **Least converged family.** Data readiness lives in **shared** legacy clients also used by `/legacy-admin/*` → full VM convergence is **not** low-risk |
| **Settings shell chrome** | `AdminV2SettingsClientProviders` (own providers; separate from `AdminV2Shell`) | mounts `<AdminEntityDrawer />` | — | breadcrumb + scroll container | Drawer mount here is infra (no `AdminDrawerProvider` wrapping it); not a product surface |
| **Actions / commands** | Command Surface host / `actions/execute` envelope | per-surface inline `fetch` (uneven) | — | — | Not audited in depth this pass — see remaining work |
| **Shared preload/cache** | `prefetchOpportunityDrawerOnRowIntent`, `prefetchPersonDrawerSnapshot`, `adminV2WorkspaceSessionCache`, `metricRenderBundleCache`, `loadWorkUnitOperationalBootstrap`, queue row intent warm | — | — | **[issue]** unevenly applied: queue layout doc not prefetched; workspace warm-return doesn't short-circuit refetch | Primitives exist; application is the gap |
| **Save flows** | event-driven invalidation (`alloy:workspace-departments-changed` → cache bust + nonce re-fetch, no remount) | — | — | **[current]** workspace save does **not** full-reload/remount | Settings/drawer save flows not yet audited end-to-end |

---

## 2. Concrete issue: settings skeleton-morph (contained, in-scope)

**[issue]** There is exactly one `web/app/adminV2/settings/loading.tsx`. It is **index-hub-shaped** (a title bar + a 6-tile grid). In the Next.js App Router, a segment `loading.tsx` is the streaming fallback for that segment **and all child routes that lack their own**. None of the 29 settings subpages has its own `loading.tsx`. Therefore **every** navigation into a settings subpage (e.g. `/settings/fields`, `/settings/statuses`) first paints the 6-tile index skeleton, then **morphs** into the subpage's actual structure (hero header + hub). This violates the locked doctrine ("Do not add skeletons that morph page structure") on every subpage entry.

For comparison, `/workspace` correctly has **per-segment** loading files (`dept/[departmentId]/loading.tsx`, `…/work-unit/[workUnitId]/loading.tsx`).

This is the cleanest **safe** convergence win in settings: it touches no shared legacy client, no runtime-protected file, and no data-loading path.

---

## 3. Drawer end-goal status (why drawer removal is NOT a first slice)

Per `docs/platform/operator/drawer-sunset-roadmap.md` (a **documentation-only lock**, June 2026):
- **[current]** The Focus Panel is the canonical operator surface; the **drawer shell remains temporarily** as reveal/open-state infrastructure (one `openDrawer()` primitive, one shell).
- **[current]** The Focus Panel is **read-only for most operational data** today — when `focusPanelActive`, the `LayoutRuntime*` edit stack is not mounted ("editing gap note", highest-risk blocker).
- **[plan]** The next real implementation target is the **editing substrate** (card expansion → focused-item state → card-level actions → inline edit → save/dirty → collection editing), starting with the **Household card**, then **Children card**. The roadmap's 12-step sequencing archives drawer code only **after** parity. Legacy-entity drawers (location, job) have **no** Focus Panel path yet and gate the final archive (location = **Unresolved**).

**Conclusion:** removing drawers is a multi-sprint, parity-gated effort — explicitly out of scope for sprint one. The safe near-term drawer work is the doctrine's "allowed" set: reveal/performance integrity and parity scaffolding only.

---

## 4. Implementation plan (Deliverable 2)

**Canonical path (the target everything converges to):** one Surface ViewModel per route, composed over existing loader/cache/bootstrap, `reveal.canCommit` is the single commit decision; stable chrome (commit once, no remount); snapshot/default slots that patch values in place; one authoritative renderer per above-fold region; warm caches reused; saves event-driven (no reload).

**Legacy / competing paths to retire (only after canonical proven per family):**
1. `LayoutRuntimeQueueRowView` / `CrmCompactQueuePreview` full-width queue rows (quarantine → delete after layout-doc reveal is coordinated).
2. `AdminEntityDrawerLegacy` per-entity bodies (gated on Focus Panel editing parity — §3).
3. Settings subpage delegation to shared `legacy-admin/system/*` field clients (needs a readiness adapter before a `SettingsSurfaceViewModel` can own reveal).
4. Vestigial `ConfigurationPatternPlaceholder` dev scaffold (remove once each settings surface adopts the real pattern).

**Safest proof page family:** **Settings** — least converged, **not** runtime-protected. But full VM convergence is blocked by shared legacy field clients, so the *first* safe slice within settings is the **chrome-stability fix** (§2), with the `SettingsSurfaceViewModel` build as the **next** slice once a hub readiness adapter exists.

**Tests needed:** (a) settings loading shell is chrome-stable / does not render the index tile-grid for subpages; (b) when the `SettingsSurfaceViewModel` lands, assert it is the sole reveal owner and legacy clients render inside the committed shell; (c) work-unit: assert layout-doc fetch is gated by the reveal gate (no post-commit row morph).

---

## 5. First-slice candidates (Deliverable 3) — recommendation

| Slice | Scope | Risk | Proof value | Addresses user complaint |
|-------|-------|------|-------------|--------------------------|
| **A. Settings chrome-stable loading** (recommended) | `settings/loading.tsx` → neutral chrome-stable shell + per-route/index handling; remove subpage skeleton morph | **Low** — no shared/legacy/runtime-protected files; no data path | Kills skeleton-morph across all 29 settings subpages; demonstrates "stable chrome" direction | "no VM work in /settings" (first concrete settings win) |
| **B. Work-unit flash fix** | Coordinate `useOpportunityQueueLayoutRuntime()` fetch with the work-unit reveal gate (no independent skeleton after commit) | **Medium-High** — `QueueBlock.tsx` is runtime-protected; requires full runtime test suite | Directly removes the reported `/work-units` flash | "items flash during loading of /work-units" |
| **C. SettingsSurfaceViewModel primitive** | Build `settingsSurfaceViewModel.ts` + readiness adapter for one hub | **Medium** — needs a hub readiness signal that today lives in legacy clients | Establishes canonical settings VM | "no VM work in /settings" (deeper) |

**Recommendation: Slice A** as the genuinely-safest first implementation slice (audit-first sprint → smallest provable win, no runtime-protected surface). Slice B is the highest-impact for the user's most visible complaint but carries runtime-protected risk; sequence it second with the full runtime suite. Slice C follows once a hub readiness adapter exists.

---

## 6. Remaining work (next slices, in order)

1. **Residual work-unit queue morph for crm-less rows** — the legacy layout-runtime row path (`LayoutRuntimeQueueRowHold → LayoutRuntimeQueueRowView → CrmCompactQueuePreview`) still renders (and morphs) for rows lacking `semanticCrmCompact`. This belongs with the **legacy queue-row quarantine → deletion** track, not a fetch tweak — delete the legacy row path once `CompressedQueueRow` is proven to cover those rows. (Slice B already removed the *unused* fetch on the common all-crm lane; see §8.)
2. **Slice C — `SettingsSurfaceViewModel`** over a hub readiness adapter; converge one settings family; prove single-owner. Blocked by shared `legacy-admin/system/*` field clients owning data readiness — needs a readiness adapter first.
3. **Workspace warm-return efficiency**: short-circuit `/api/admin/departments` refetch on warm session-cache hit; gate OIP KPI fetch on `workspaceScopeHasPlacements`; stop read-then-write cache churn. (Runtime-protected — runtime suite required.)
4. **Actions/commands surface audit** (not done this pass) — confirm `actions/execute` envelope vs inline fetch.
5. **Drawer editing substrate** (Household card → Children card) per sunset roadmap — long track, parity-gated.
6. Remove vestigial `ConfigurationPatternPlaceholder` once settings surfaces adopt the real pattern.

---

## 8. Implemented this sprint (results)

Two safe slices landed on `claude/runtime-convergence-sprint01` (PR target: `staging`).

### Slice A — settings chrome-stable loading
- **Change:** `web/app/adminV2/settings/loading.tsx` no longer paints the index hub's 6-tile grid; it renders a structure-neutral, chrome-stable reserve at the stable settings page width. This stops the skeleton-morph on every one of the 29 settings subpages (the shared segment `loading.tsx` was index-shaped but applied to all children).
- **Test:** `web/tests/adminV2/settingsRouteLoadingChromeStable.test.tsx` (3) — asserts the fallback is chrome-stable and does **not** mirror the index tile grid; asymmetry guard that the index hub itself is grid-shaped.

### Slice B — work-unit queue: skip unused layout-doc fetch
- **Finding:** in default runtime mode (`isLayoutRuntimeOpportunityQueueBodyEnabledClient()` is on by default), `useOpportunityQueueLayoutRuntime` fetched the per-lane layout doc unconditionally, but the canonical `CompressedQueueRow` owns every row with `semanticCrmCompact` and never consumes that doc — all doc consumers (`queueRecordConfig`, `LayoutRuntimeQueueRowView`) live in the `else` branch reachable only for crm-less rows. So the fetch was a decoupled, unused waterfall on the common all-crm lane.
- **Change:** added `opportunityQueueLayoutRuntimeRowsPossible()` (`web/lib/workspace/opportunityQueueLayoutRuntimeActivation.ts`) and an `active` gate on the hook (`web/lib/layout/runtime/useOpportunityQueueLayoutRuntime.ts`); `QueueBlock` only activates the fetch when a row could render through the legacy path (or flag-off). No change to reveal gates, queue empty-state semantics, or the visible compressed-row path.
- **Test:** `web/tests/workspace/opportunityQueueLayoutRuntimeActivation.test.ts` (4) — flag-off always-possible; runtime mode all-crm skips; runtime mode crm-less activates; empty lane skips.

### Validation
- `cd web && npm ci` (node_modules was absent) → `npm run typecheck:build` → **clean** (confirms committed tree has no errors; the handoff's 13 errors were WIP-only and that WIP is absent).
- New tests: 7 passing across the two slices.
- Doctrine runtime suite (8 files): work-unit queue + reveal + session-cache files **pass**. 7 failing tests in 3 **drawer/comms evidence** files (BOS-band, comms split layout, header-action cache) are the **pre-existing baseline** — verified identical with the Slice B diff stashed; unrelated to these changes.
- Whole-project `npm run typecheck` and the full vitest suite remain advisory (large pre-existing red baseline per handoff §8).

### Intentionally not touched
- Runtime-protected reveal gates, cache keys, known-empty predicates, and the visible compressed-row/Focus-Panel render paths.
- Legacy `AdminEntityDrawerLegacy` / drawer sunset (gated on Focus Panel editing parity — §3).
- Shared `legacy-admin/system/*` field clients (settings data readiness) — deferred to Slice C.
- The tracked-legacy build artifact `web/tsconfig.build.tsbuildinfo` (regenerated by tsc; left uncommitted).

---

## 7. Validation contract (this sprint)

```bash
cd web
npm ci                     # required — node_modules absent after the staging jump
npm run typecheck:build    # working gate (whole-project typecheck is advisory; baseline noisy)
# scoped tests for touched area (settings loading) + runtime suite if touching protected files
```

**Known baseline (do not attribute to new work):** whole-project `npm run typecheck` may be red; vitest full suite ~626 failing tests / ~299 files as of 2026-06-28 (assertion drift + jsdom relative-URL `fetch` `ERR_INVALID_URL`). Gate on `typecheck:build` + scoped runtime suites.
