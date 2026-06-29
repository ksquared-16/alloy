# Runtime Topology — Phase 1 Report (Complexity, Violations, Simplification Order)

**Date:** 2026-06-29 · **Author:** Claude Code · **Type:** Analysis/blueprint only — **no code, no optimization, no deletion.**
**Canonical map:** [`../../platform/runtime/operational-runtime-topology.md`](../../platform/runtime/operational-runtime-topology.md) (how Alloy works today, literally).
**Governs against:** [`../../platform/runtime/operational-runtime-doctrine.md`](../../platform/runtime/operational-runtime-doctrine.md).
**Goal restatement:** the objective is **reduce runtime complexity until the platform behaves like one continuous OS** — not "make a page faster." Simpler, not just faster.

**Measurement provenance.** All raw counts below are **measured** by `grep`/`wc` at `origin/staging fa83113a6` + Phase 2 Slice 1. Paint *sequences* are **modeled** from state-commit points + the reveal gate (flagged where so). Exact wall-clock paint/CLS counts require capturing existing perf marks (`perfWorkspaceLoad`, `[workspace-reveal-gate]`, `[wu-reveal-gate]`, `[drawer-primary-perf]`) in a browser — flagged `NEEDS_RUM`.

---

## 1. Runtime Topology — see canonical doc
The literal layer stack (L0–L7), 8 transition flows, ownership/fetch/cache/reveal maps live in [`operational-runtime-topology.md`](../../platform/runtime/operational-runtime-topology.md). This report is the **measurement + decision** layer over it.

## 2. Runtime Complexity Report

**Complexity Index (transparent, reproducible):** `useState + 2·useEffect + fetchSites + 3·routerRefresh + 5·loadingGates`. Raw drivers are measured; the index is a ranking aid, not a physical unit.

| Route / surface | LOC | useState | useEffect(+layout) | useMemo | fetch sites | router.refresh | loading gates | **Index** | Band |
|---|---|---|---|---|---|---|---|---|---|
| **Focus Panel — `AdminEntityDrawerLegacy`** | 19,581 | 212 | 129 | — | 172 | 30 | (legacy bodies) | **~603** | 🔴 CRITICAL |
| **Work Unit** (compat page + host) | 7,915 | 63 | 57 | 45 | ~10 | 0 (page) | 1 (cold shell) | **~135** | 🟠 HIGH |
| **Workspace** (page + shell) | ~1,070 | 23 | 12 | 5 | ~6 | 0 (page) | 1 (gate) | **~46** | 🟡 MED |
| **Top chrome** `AdminV2Shell` | 322 | 5 | 1 | — | 0 | 0 | 5 Suspense | **~12** | 🟢 LOW |
| **Settings** (per-hub legacy clients) | varies | varies | varies | — | per-hub | 1 (UsersRoles) | per-hub self-skeleton | — (later) | 🟠 HIGH (uncontained) |
| **Analytics** (OIP renderers) | varies | — | — | — | per-renderer | 0 | per-renderer | — (later) | 🟡 MED |

**Platform-wide measured:** 60 cache modules · 31 prefetch/warm utils · 36 `router.refresh` (adminV2+admin) · 3 route `loading.tsx` · 16 skeleton/hold/loading/gate components · `/api/admin/departments` fetched from 7 sites, `/work-units` from 6.

**Largest contributors (ranked):**
1. **`AdminEntityDrawerLegacy.tsx`** — 19.5k LOC / 212 state / 129 effects / 172 fetch / 30 refresh. Single biggest runtime-complexity object in the platform by an order of magnitude.
2. **Work-unit compat page** — 7,780 LOC, 61 state + 52 effects + 45 memo in one client component (data-loading + rendering fused).
3. **Cache sprawl** — 60 cache modules with documented overlaps (lifecycle ×2, KPI ×2, OIP/metricRenderBundle partial, summaries duplicated).
4. **`router.refresh` save pattern** — 36 sites (30 in the drawer monolith) = full-remount saves.
5. **Fan-out fetching** — same endpoints fetched from 6–7 independent owners; dedupe adoption uneven.

## 3–6. Ownership / Fetch / Cache / Reveal Maps — see canonical doc §3–§6
Full tables (every region × Render/Fetch/Cache/Update/Destroy owner; 10-endpoint fetch inventory with move-server/merge/delete columns; 9-cache map with invalidate/restore/duplicate columns; per-surface reveal map) are in the topology doc. Headlines:
- **Ownership:** every region has a clear canonical owner; the only live competing owners are crm-less legacy queue rows and `AdminEntityDrawerLegacy` bodies (kill-switch/legacy entities).
- **Fetch:** 4 of 10 primary fetches are **client-side but server-seedable** (`departments`, `lifecycle-catalog`, `by-slug/:slug`, KPI placements).
- **Cache:** 4 documented duplication pairs.
- **Reveal:** 2 cold reveals gated on **client** waterfalls (workspace departments; work-unit slug resolve).

## 7. Runtime Paint Analysis (measured drivers + modeled sequences)

| Metric | `/workspace` cold | `/workspace` warm | work-unit cold | work-unit warm | Focus Panel open |
|---|---|---|---|---|---|
| Server fetches (block SSR) | 5 (layout Promise.all) | 5 | 0 (param only)¹ | 0¹ | 0 |
| Client fetches (first-paint path) | ~6 (lifecycle×3 + dept + work-units + placements) | revalidate only | slug + summaries + rows + bootstrap | cache-served | bootstrap + drawer_primary |
| Effects (route component) | 12 | 12 | 57 | 57 | 129 (drawer legacy) |
| Suspense boundaries (shared shell) | 5 | 5 | 5 | 5 | 5 |
| Loading gates | 1 (`WorkspacePageLoadingGate`) | 0 | 1 (`WorkUnitWorkspaceColdShell`) | 0 | 0 (seed-first) |
| Skeletons | grid pending + KPI placeholder | 0 | lane loader | 0 | 0 |
| Cache restores | 2 paths (module → session → root) | 2 | 3 (slug/page/rows) | 3 | VM warm |
| `router.refresh` | 0 (page) | 0 | 0 (page) | 0 | up to 30 (legacy save) |
| Invalidations (custom events) | 1 (`departments-changed`) | 1 | `opportunity-updated` (scoped) | scoped | task/layout events |
| **Modeled paints to Ready** | **3+** (gate → shell → KPI patches) | **1** | **2** (cold shell → coordinated) | **1** | **1** (seed) + card hydrate |
| **Modeled layout shifts** | KPI count→growth→OIP (slot-reserved? `NEEDS_RUM`) | minimal | KPI baseline→OIP | minimal | card body fill |

¹ The work-unit canonical layout extracts params only; its server data bundle is the shared workspace `layout.tsx` (L2). Slug→metadata resolves **client-side** in `WorkUnitSlugRouteHost` — the cold waterfall.

**Key paint findings:**
- **Warm paths already approach "reveal once"** (1 paint) — the platform's good case. The violations are concentrated on **cold** and **return** paths and in **save**.
- The **drawer legacy** open path carries 129 effects / 30 refresh — the heaviest per-interaction runtime.
- Exact paint/CLS counts and reveal-wait ms are **`NEEDS_RUM`** (instrumentation exists; capture in a browser to confirm modeled sequences).

## 8. Top 25 Runtime Violations (classified)

| # | Violation | Class | Where |
|---|---|---|---|
| 1 | `AdminEntityDrawerLegacy` 19.5k-LOC monolith (212 state/129 effects) | UNNECESSARY_COMPONENT | drawer |
| 2 | 30 `router.refresh()` saves in the drawer monolith | UNNECESSARY_REFRESH | drawer |
| 3 | 6 non-drawer `router.refresh()` saves (UsersRoles, dept, ProfileMenu, ActionsRail, JobDrawerV2, AdminLayout) | UNNECESSARY_REFRESH | various |
| 4 | `/workspace` cold reveal gated on **client** `/api/admin/departments` fetch | UNNECESSARY_FETCH | workspace page |
| 5 | Work-unit slug→metadata resolved in **client** `useEffect` (cold shell waterfall) | UNNECESSARY_FETCH | WorkUnitSlugRouteHost |
| 6 | `WorkspacePageLoadingGate` "Preparing…" on cold + residual return race | UNNECESSARY_SKELETON | workspace |
| 7 | `WorkUnitWorkspaceColdShell` on cold entry | UNNECESSARY_SHELL | work-unit host |
| 8 | KPI counts→growth→OIP staged value reveal | UNNECESSARY_PAINT | workspace KPI |
| 9 | Lifecycle cards cached in 2 places (module + session) | UNNECESSARY_CACHE | continuity |
| 10 | KPI rows cached in 2 places (dept session + page state) | UNNECESSARY_CACHE | dept/workspace |
| 11 | OIP warm vs `metricRenderBundleCache` partial overlap | UNNECESSARY_CACHE | metrics |
| 12 | dept/work-unit summaries fetched by 2 owners, no shared key | UNNECESSARY_FETCH | dept + work-unit |
| 13 | `/api/admin/departments` fetched from 7 sites (some bypass dedupe) | UNNECESSARY_FETCH | platform |
| 14 | `/api/admin/work-units` fetched from 6 sites | UNNECESSARY_FETCH | platform |
| 15 | layout-runtime endpoints undeduped/uncached | UNNECESSARY_FETCH | queue/drawer |
| 16 | Work-unit compat page fuses data-loading + rendering (61 state/52 effects) | UNNECESSARY_STATE | work-unit |
| 17 | Operational-surface coherence can stall whole work-unit reveal (`NEEDS_RUM`) | UNNECESSARY_TRANSITION | work-unit reveal |
| 18 | Separate workspace/work-unit layouts → no shared persistent surface on nav | UNNECESSARY_TRANSITION | navigation |
| 19 | Settings subpages delegate to shared `legacy-admin/system/*` self-skeletons | UNNECESSARY_SKELETON | settings |
| 20 | Settings shell mounts `<AdminEntityDrawer/>` (provider-less, inert) | UNNECESSARY_PROVIDER | settings |
| 21 | crm-less legacy queue-row branch (`LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview`) | UNNECESSARY_COMPONENT | queue |
| 22 | 16 skeleton/hold/loading/gate components (several zero-importer) | UNNECESSARY_SKELETON | platform |
| 23 | `(proof)/adminV2/layout-proof/*` gallery + preview flag | UNNECESSARY_ROUTE | proof |
| 24 | ~10 verified zero-importer components (Sprint 02) | UNNECESSARY_COMPONENT | platform |
| 25 | Tracked build artifacts (`*.tsbuildinfo`, `test-results/`) | UNNECESSARY_STATE (repo) | repo |

## 9. Top 25 Runtime Simplification Opportunities ("would we build this today?")

| # | Opportunity | Verdict | Unlocks |
|---|---|---|---|
| 1 | Server-seed `/workspace` first-paint (departments + lifecycle tiles) | SERVER_SIDE | removes gate + client waterfall (violations 4,6) |
| 2 | Resolve work-unit slug→metadata in `[slug]/layout.tsx` (server) | SERVER_SIDE | removes cold shell (5,7) |
| 3 | Collapse lifecycle card caches to one source | MERGE | (9) |
| 4 | Collapse KPI/OIP/metricRenderBundle caches | MERGE | (10,11) |
| 5 | One shared dept+work-units fetch owner (server bundle) | MERGE/SERVER_SIDE | (12,13,14) |
| 6 | Reserve KPI slot; one value-patch (no staged reveal) | SIMPLIFY | (8) |
| 7 | Shared persistent shell across workspace↔work-unit | SIMPLIFY | (18) continuity |
| 8 | Replace `router.refresh()` saves with optimistic + scoped invalidation | SIMPLIFY | (2,3) |
| 9 | Decompose work-unit compat page into VM + presentational sections | SIMPLIFY | (16) |
| 10 | Extract drawer monolith per-entity bodies behind VM runtimes | VM | (1) |
| 11 | Delete drawer legacy bodies after parity (opp/person/child) | DELETE (after parity) | (1,2) |
| 12 | Delete crm-less legacy queue-row path after parity | DELETE (after parity) | (21) |
| 13 | Universal dedupe wrapper for all `/api/admin/*` GETs | SIMPLIFY | (13,14,15) |
| 14 | Bound operational-surface wait with timeout | SIMPLIFY | (17) |
| 15 | Settings Surface VM over a hub readiness adapter | LATER | (19) |
| 16 | Remove inert settings `<AdminEntityDrawer/>` | DELETE | (20) |
| 17 | Quarantine proof gallery + preview flag | QUARANTINE | (23) |
| 18 | Delete ~10 verified zero-importer components | DELETE | (24) |
| 19 | Untrack build artifacts | DELETE | (25) |
| 20 | Consolidate 16 skeleton components → 1 chrome-stable reserve | MERGE | (22) |
| 21 | Eliminate fast-bounce continuity race (eager seed on shell-ready) | SIMPLIFY | (6 residual) |
| 22 | Collapse 31 prefetch utils → a small predictive-warm API | MERGE | predictive runtime |
| 23 | Move OIP/placement KPI fetches to prewarm-at-bootstrap | SERVER_SIDE | (8) |
| 24 | Audit/normalize Next `<Link prefetch>` across nav | SIMPLIFY | route transitions |
| 25 | Retire effectively-dead flags after parity (Phase3A, FORCE_LEGACY_*) | DELETE (after parity) | flag clarity |

## 10. Recommended implementation order

Ranked by **UX impact (U) / complexity reduction (C) / engineering risk (R, lower=safer) / code deletion unlocked (D) / future platform leverage (L)**, each 1–5.

| Order | Slice | U | C | R | D | L | Rationale |
|---|---|---|---|---|---|---|---|
| **1** | **Server-seed workspace first-paint** (#1) | 5 | 4 | 3 | 2 | 5 | Establishes the "one first-paint payload" pattern every module inherits; removes the most-seen gate. Highest leverage. |
| **2** | **Server-resolve work-unit slug** (#2) | 5 | 3 | 2 | 2 | 5 | Removes the cold shell + a client waterfall; small, self-contained; same server-seed pattern. |
| **3** | **Shared persistent shell across workspace↔work-unit** (#7) | 5 | 4 | 4 | 1 | 5 | Kills the #1 felt violation (return gate) structurally; higher risk (cross-route), do after 1–2 prove the pattern. |
| **4** | **Cache consolidation** (lifecycle/KPI/summaries) (#3,4,5) | 3 | 5 | 3 | 3 | 4 | Biggest pure complexity reduction; removes duplicate fetches/caches; moderate risk (cache keys/known-empty). |
| **5** | **`router.refresh` → optimistic save** (non-drawer first) (#8) | 4 | 3 | 3 | 2 | 4 | Continuous-save law; start non-drawer (lower risk), then drawer after parity. |
| **6** | **Decompose work-unit compat page** (#9) | 2 | 5 | 4 | 4 | 5 | Largest single-file complexity drop after the drawer; high risk, needs the runtime suite; sequence after reveal patterns are locked. |
| **7** | **Drawer monolith → VM bodies, then delete legacy** (#10,11) | 4 | 5 | 5 | 5 | 5 | Largest deletion + complexity win overall, but parity-gated (Household/Children editing substrate) and highest risk. The end-state, not the start. |
| **8** | **Subtractive cleanup** (zero-importer comps, artifacts, proof gallery, dead flags, skeleton merge) (#16–20,25) | 1 | 3 | 1 | 5 | 2 | Safe pure deletion; can run in parallel anytime; unblocks clarity. |

**Why this order reduces ~80% of complexity, not 1 issue at a time:** slices 1–2 establish the *server-seed + one-reveal* pattern; slice 3 makes navigation structurally continuous; slice 4 collapses the 60-cache sprawl; slices 6–7 dissolve the two largest objects (work-unit page + drawer monolith = ~27k LOC / 273 state / 181 effects combined). Done in this order, each slice removes a *class* of violations platform-wide rather than one route's symptom.

---

## Validation (docs-only this phase)
- `git status -sb` clean except the two new docs (+ untracked build artifact left unstaged).
- `cd web && npm run typecheck:build` → **clean** (no code changed).

## Most important rule (honored)
No code, no optimization, no deletion, no refactor in this phase. **The map is the deliverable.** Implementation order above is a recommendation for review — do not proceed until reviewed.
