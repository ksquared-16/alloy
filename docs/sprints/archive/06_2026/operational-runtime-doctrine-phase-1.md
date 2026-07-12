# Operational Runtime Doctrine — Phase 1 (Evidence Map)

**Date:** 2026-06-29
**Author:** Claude Code
**Branch:** `claude/operational-runtime-doctrine-phase1` (from `origin/staging` @ `fa83113a6`)
**Type:** **Doctrine + evidence map only. No code changes, no deletions, no optimization.**
**Doctrine:** [`../../platform/runtime/operational-runtime-doctrine.md`](../../platform/runtime/operational-runtime-doctrine.md)
**Validation:** `git status -sb` clean (docs only); `cd web && npm run typecheck:build` → **clean** at write time.

**Evidence confidence:** **[verified]** = confirmed by direct read/grep this session; **[traced]** = from a read-only sub-agent trace of the canonical files; **[candidate]** = a possible future fix listed for planning, **not** a decision.

---

## 0. Canonical route topology (corrects an earlier assumption)

| URL (browser) | `next.config.ts` rewrite → internal | Surface mount | Route-level `loading.tsx`? |
|---|---|---|---|
| `/workspace` | `/adminV2/workspace` | `app/adminV2/workspace/page.tsx` (client) → `WorkspaceRootShell` | **No** **[verified]** |
| `/workspace/work-unit/:slug` | `/adminV2/workspace/work-unit/:workUnitSlug` | `…/[workUnitSlug]/page.tsx` returns `null`; surface mounts from `…/[workUnitSlug]/layout.tsx` → `WorkUnitSlugRouteHost` | **No** **[verified]** |
| `/workspace/work-unit/:slug/:recordId` | same + `:recordId` child | same host; record opens Focus Panel | **No** **[verified]** |
| (compat) `…/dept/[departmentId]/work-unit/[workUnitId]` | internal only | `dept/.../work-unit/[workUnitId]/page.tsx` (7,780 LOC = `AdminV2OpportunityWorkUnitPage`) | **Yes** (`dept/[departmentId]/loading.tsx`, returns `null`) **[verified]** |

**Key structural fact:** the canonical work-unit host (`WorkUnitSlugRouteHost`) **reuses the 7,780-LOC compat page** as its body after resolving the slug. The top shell `AdminV2Shell` (`app/adminV2/layout.tsx`) wraps all adminV2 routes; for `/workspace*` it takes the **workspace-v2 branch** (`isWorkspaceV2Route` true) — the `SystemCanvas` branch is **not** reachable here. **[traced]**

---

## Part B — Runtime evidence map

### B.1 `/workspace`

| # | Item | Finding | File:line |
|---|------|---------|-----------|
| 1 | Route files | `page.tsx` (client, 746 LOC) | `app/adminV2/workspace/page.tsx` |
| 2 | Layout files | server, `force-dynamic`; parallel server bundle (org name, viewer tz, operational tz, access, entity labels) → `AdminV2WorkspaceClientProviders` | `app/adminV2/workspace/layout.tsx:47-113` |
| 3 | Loading files | **none for `/workspace`** | — |
| 4 | Suspense boundaries | outer shell `Suspense fallback="Loading…"`; `TopNavBar` `Suspense fallback="Loading…"` (dark bar). Workspace-v2 branch renders chrome synchronously | `AdminV2Shell.tsx:241-253, 318` |
| 5 | Skeleton components | **client gate** `WorkspacePageLoadingGate` ("Preparing departments, counts, and orientation…") shown while `!workspaceSurfaceReady` | `app/adminV2/workspace/page.tsx:710-712`; `WorkspacePageLoadingGate.tsx`; copy in `lib/adminV2/navigation/adminV2RouteLoadingVocabulary.ts` |
| 6 | Server data calls | org name, viewer/operational tz, access context, entity labels (`Promise.all`, block SSR) | `layout.tsx:73-79` |
| 7 | Client data calls | `/api/admin/departments` (**blocks reveal**), `/api/admin/work-units` (non-blocking, `.catch→null`), `/api/admin/workspace-kpi-placements` (8s TTL, non-blocking); deferred growth rollup (per-dept lifecycle-kpis + pipeline-exact-count, idle 2500ms); OIP warm metrics (after rollup) | `page.tsx:265-529, 398-494, 623-671`; `lib/adminV2/runtime/loadWorkspaceGrowthRollup.ts` |
| 8 | KPI/banner source | quick rollup = counts only → KPI strip `undefined` w/ `kpiPlacementPending`; growth rollup + placements → real strip; OIP patches further | `page.tsx:374-375, 464, 725` |
| 9 | Tile/section source | lifecycle landing cards: synchronous peek (memory/session) then async `loadOperatorLifecycleLandingCards()`; `WorkspaceRootShell` renders `WorkspaceRootLifecycleGrid` (dept grid passed but not rendered) | `page.tsx:158-205`; `WorkspaceRootShell.tsx:112` |
| 10 | Cache usage | `adminV2WorkspaceSessionCache` (sessionStorage, key `…:ws:root:{org}:{user}:{scopeFp}`): warm `useLayoutEffect` restore sets `loading=false` (no gate); cold writes quick rollup then SWR-refines | `page.tsx:237-263, 365-436`; `lib/workspace/adminV2WorkspaceSessionCache.ts` |
| 11 | Prefetch/warming | after reveal, idle prefetch of visible dept above-fold bundles; OIP warm cache (90s TTL, SWR) | `page.tsx:598-613`; `lib/adminV2/prefetchAdminV2AboveFold.ts`; `lib/metrics/oipWorkspaceWarmCache.ts` |
| 12 | Legacy still eligible | `SystemCanvas` shell branch **not** reachable for `/workspace` (workspace-v2 branch taken); `AdminEntityDrawer` mounted in providers (infra) | `AdminV2Shell.tsx:177-226`; `AdminV2WorkspaceClientProviders.tsx:102` |
| 13 | Why sections load at different times | reveal gate never blocks on KPI region (`kpi_region_ready` always true) → counts → growth → OIP patch sequentially; lifecycle cards async on cold | `lib/adminV2/workspaceRevealGate.ts:84-96,139-140` |
| 14 | Exact cause of visible skeleton/shell | **cold:** `/api/admin/departments` is a **client useEffect** fetch, so `WorkspacePageLoadingGate` shows ~400–600ms until it resolves and the gate commits | `page.tsx:265-371, 710` |
| 15 | Files that must change later | `page.tsx` (move dept/work-unit + lifecycle fetch server-side / seed cache; reserve KPI slot), `layout.tsx` (server bundle), `WorkspaceRootShell.tsx`, `workspaceRevealGate.ts` | — |

### B.2 `/workspace/work-unit/:slug`

| # | Item | Finding | File:line |
|---|------|---------|-----------|
| 1 | Route files | `[workUnitSlug]/page.tsx` returns `null` (anchor) | `…/[workUnitSlug]/page.tsx:2-4` |
| 2 | Layout files | server; awaits `params`, renders `WorkUnitSlugRouteHost` | `…/[workUnitSlug]/layout.tsx:9-11` |
| 3 | Loading files | **none** for canonical route (only compat `dept/.../loading.tsx`, returns `null`) | — |
| 4 | Suspense boundaries | same top-shell Suspense as workspace; surface gating is **client** | `AdminV2Shell.tsx` |
| 5 | Skeleton components | `WorkUnitWorkspaceColdShell` (title + KPI quiet reserve + `WorkUnitOperationalLaneLoader`; **no card/row skeletons**) shown while `phase==="loading"` | `WorkUnitSlugRouteHost.tsx:106-114`; `WorkUnitWorkspaceColdShell.tsx:28-61` |
| 6 | Server data calls | none beyond param extraction | `layout.tsx` |
| 7 | Client data calls | slug→metadata `GET /api/admin/work-units/by-slug/:slug` (**client useEffect waterfall**); then compat page: queue summaries `…/:id/queues`, primary-lane rows `/api/admin/queues/:wu/:queue`, operational bootstrap, OIP, right-rail (deferred) | `WorkUnitSlugRouteHost.tsx:55-77`; compat `page.tsx` (queues, rows, bootstrap, reveal gate ~6923-6933) |
| 8 | Context/banner source | `WorkUnitSlugRouteProvider` value (`workUnitId`, `departmentId`, `workUnitKey`, `workUnitName`, `initialQueueKey`) after slug resolve | `WorkUnitSlugRouteHost.tsx:130-133` |
| 9 | KPI source | snapshot baseline from work-unit def (`buildDefaultWorkUnitKpis`) at shell; live OIP patches after above-fold settle | compat `page.tsx` (~286, ~7025) |
| 10 | Queue source | summaries (pill counts/labels) + rows (content) fetched separately | compat `page.tsx` (~783, ~790) |
| 11 | Condensed queue owner | `CompressedQueueRow` canonical (sole owner under `ALLOY_OS_RUNTIME_ENABLED`) | `QueueBlock.tsx:1786-1788`; `CompressedQueueRow.tsx` |
| 12 | Legacy queue branches eligible | `LayoutRuntimeQueueRowView`/`Hold`, `CrmCompactQueuePreview` — only for rows lacking `semanticCrmCompact` (else-branch); layout-doc fetch **skipped** when all rows have it (Sprint 01 gate) | `QueueBlock.tsx:1814-1835, 2192-2253`; `lib/workspace/opportunityQueueLayoutRuntimeActivation.ts` |
| 13 | Cache usage | slug-route cache; `adminV2WorkspaceSessionCache` work-unit page cache (warm path skips cold shell → `seededFromCache`); `queueRowClientCache` (LRU 48, TTL) per lane; bootstrap session cache | `lib/admin/workUnitSlugRouteCache.ts`; `lib/workspace/queueRowClientCache.ts`; `lib/adminV2/workUnitBootstrapClientSession.ts` |
| 14 | Hover/click warming | lifecycle tile → `warmWorkUnitSlugRoute` + `warmWorkUnitBootstrapFromSlugEntry`; queue row hover → `prefetchOpportunityDrawerOnRowIntent` / `warmQueueRowOpportunityVm` | `lib/admin/operatorWorkUnitEntryWarm.ts`; `QueueBlock.tsx:~22, ~2146` |
| 15 | Why KPIs reshape/arrive separately | snapshot baseline first, OIP live values patch later; KPI region not in the blocking bundle | compat `page.tsx` (~286, ~7025) |
| 16 | Why queue/context arrive separately | context = slug resolve (first); summaries parallel; rows gated behind lane authority + operational surface; right-rail deferred | compat `page.tsx` (reveal policy) |
| 17 | Why leaving work-unit shows a skeleton | canonical work-unit and `/workspace` are **separate layouts with no shared persistent surface**; on exit the work-unit DOM unmounts and `/workspace` mounts fresh with `loading=true` → `WorkspacePageLoadingGate` until its client fetch resolves (unless workspace session cache is warm) | `page.tsx:140,710`; `WorkspacePageLoadingGate.tsx` |
| 18 | Files that must change later | `WorkUnitSlugRouteHost.tsx` + `[workUnitSlug]/layout.tsx` (resolve slug server-side, pass as props), `workUnitPageRevealPolicy.ts`, the compat `page.tsx`, and a shared persistent shell for nav continuity | — |

### B.3 Navigation

| # | Flow | Current behavior | File:line |
|---|------|------------------|-----------|
| 1 | click `/workspace` → work-unit | warm (tile prewarmed): slug+bootstrap cached → coordinated reveal, minimal/no cold shell. Cold: slug resolve waterfall → `WorkUnitWorkspaceColdShell` → commit | `operatorWorkUnitEntryWarm.ts`; `WorkUnitSlugRouteHost.tsx:55-114` |
| 2 | hover `/workspace` → work-unit | visible lifecycle tiles idle-prewarm slug route + bootstrap | `operatorWorkUnitEntryWarm.ts:~150-175` |
| 3 | click work-unit → `/workspace` | **fresh mount of `/workspace`**, `loading=true` → `WorkspacePageLoadingGate` until dept fetch resolves (warm session cache avoids it) | `page.tsx:140, 237-263, 710` |
| 4 | browser back/forward | same as (1)/(3) depending on direction; relies on session cache warmth, not BFCache state | — |
| 5 | route prefetch | hover/idle warming of payload caches; Next `<Link prefetch>` coverage **not audited** | `prefetchAdminV2AboveFold.ts`; `operatorWorkUnitEntryWarm.ts` |
| 6 | is current page cleared before next ready? | **Yes** — no cross-route surface retention; prior surface unmounts before next commits | `page.tsx:140` |
| 7 | is cache reused? | Partially — work-unit and workspace session caches are **decoupled**; round-trip work-unit→workspace→work-unit can lose warm rows/KPIs | `adminV2WorkspaceSessionCache.ts`; `queueRowClientCache.ts` |
| 8 | where intermediate loading UI appears | `WorkspacePageLoadingGate` (entering/returning to `/workspace` cold), `WorkUnitWorkspaceColdShell` (entering work-unit cold) | as above |
| 9 | what must change for continuity | resolve slug server-side; **shared persistent chrome/surface** across the two routes; initialize `/workspace` `loading` from warm cache; unify the two session caches | **[candidate]** |

---

## Part C — Runtime ownership table

| Region | Current owner | Canonical owner | Competing owner? | First-paint required? | Secondary/deferred allowed? | Current loading behavior | Target loading behavior | Change needed |
|---|---|---|---|---|---|---|---|---|
| Workspace shell | `AdminV2Shell` (workspace-v2 branch) | same | No (SystemCanvas branch unreachable) | Yes | No | renders chrome sync; outer Suspense "Loading…" | stable chrome, commit once | confirm no Suspense flash; keep |
| Workspace tiles | `WorkspaceRootLifecycleGrid` (lifecycle cards) | same | dept grid passed-but-unused | Yes | No | sync peek or async load (cold stagger) | present at first paint | seed cards server-side / guarantee warm |
| Workspace KPIs | `WorkspaceCommandHeader` strip (quick→growth→OIP) | `MetricPlacementRenderer` snapshot slot | OIP vs placement timing | Yes (slot) | values patch only | counts → growth → OIP patch after reveal | final slot at commit, values patch in place | reserve slot; stop count→growth→OIP reshape |
| Workspace BOS page visual | `WorkspaceRootShell` | same | No | Yes | No | gated behind `WorkspacePageLoadingGate` on cold | reveal once | move blocking fetch off client path |
| Work-unit shell | `WorkUnitSlugRouteHost` → compat page | same | compat page is the body | Yes | No | `WorkUnitWorkspaceColdShell` until slug+bundle | reveal once, no cold shell on warm | server slug resolve |
| Work-unit context/banner | `WorkUnitSlugRouteProvider` | same | No | Yes | No | after slug resolve | with first reveal | server slug resolve |
| Work-unit KPIs | snapshot `buildDefaultWorkUnitKpis` → OIP | snapshot slot + OIP patch | No | Yes (slot) | values patch only | baseline then OIP patch | final slot, patch values | keep snapshot; ensure no reshape |
| Queue frame | `QueueBlock` | same | No | Yes | No | committed with surface | same | keep |
| Queue rows | `CompressedQueueRow` | same | `LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview` (crm-less rows only) | Yes | No | committed; legacy quarantined | single owner | DELETE_AFTER_PARITY legacy branch |
| Lane metadata | queue summaries fetch | same | No | Yes | No | parallel to slug | in first bundle | fold into first-paint payload |
| Command/actions rail | right-rail (deferred) + `AICommandSurfaceShell` | platform command surface | No | No (deferred OK) | Yes | deferred after above-fold | keep deferred | none (acceptable) |
| Focus Panel frame | `AdminEntityDrawer` → VM runtime (`EntityDrawerOperatingShell`≡`FocusPanelShell`) | same | legacy drawer (flag-off) | Yes (when subject) | No | seed-first shell, cards patch | keep | none (canonical) |
| Focus Panel body | VM card runtime | same | `AdminEntityDrawerLegacy` (kill-switch / legacy entities) | No | Yes (deferred) | loads inside seeded shell | keep deferred | DELETE_AFTER_PARITY legacy |
| Settings shell (later) | `AdminV2SettingsClientProviders` | future `SettingsSurfaceViewModel` | separate shell + own `AdminEntityDrawer` | — | — | out of scope this phase | apply laws later | later extension |

---

## Part D — Paint/fetch timeline

### `/workspace`

```
User intent (click Workspace / load)
→ route transition            ACCEPTABLE
→ server fetches (tz/org/access/labels, force-dynamic, Promise.all)   ACCEPTABLE
→ client mount (page.tsx)      ACCEPTABLE
→ [warm] useLayoutEffect cache restore → loading=false → reveal once  CANONICALIZE (make this the default path)
→ [cold] first paint = WorkspacePageLoadingGate ("Preparing…")        REMOVE (caused by client-side dept fetch)
→ client effects: /api/admin/departments (blocks), /work-units, kpi-placements   CANONICALIZE (move dept fetch off the reveal-blocking client path)
→ first real paint = WorkspaceRootShell (quick rollup, counts only)   CANONICALIZE (reveal with final KPI slot, not counts-only)
→ secondary fetches: growth rollup, OIP warm                          DEFER (acceptable as value patch IF slot is reserved)
→ second paint: KPI counts→growth→OIP patched                         REMOVE (the reshape/late values; values must patch in a reserved slot, no layout move)
→ layout shifts: KPI strip placeholder→real                           REMOVE
→ idle: visible dept above-fold prefetch                              ACCEPTABLE
```

### `/workspace/work-unit/:slug`

```
User intent (click tile / load)
→ route transition            ACCEPTABLE
→ server layout (param extract only; no data)                         CANONICALIZE (resolve slug→metadata server-side here)
→ client mount (WorkUnitSlugRouteHost)                                ACCEPTABLE
→ [cold] slug→metadata fetch in useEffect                             REMOVE (client waterfall; move to server)
→ first paint = WorkUnitWorkspaceColdShell (title + KPI reserve + lane loader)   REMOVE on warm / CANONICALIZE on cold (should be the final structure, not a loader)
→ compat page mounts: queue summaries + rows + bootstrap + KPI snapshot   ACCEPTABLE (but must be in ONE first-paint bundle)
→ reveal gate: shell + critical bundle + coordinated + operational surface   CANONICALIZE (single coordinated commit — keep; bound the operational-surface wait)
→ coordinated reveal (one commit)                                     ACCEPTABLE (this is the good part)
→ secondary: OIP live KPIs, right-rail workflow KPIs                  DEFER (acceptable as value patch in reserved slot)
→ second paint: KPI baseline→OIP                                      REMOVE if it reshapes; ACCEPTABLE if pure value patch
→ operational-surface wait on slow subject                            UNKNOWN_NEEDS_TRACE (measure: does it stall the whole surface? bound it)
```

### Navigation `work-unit → /workspace`

```
User intent (back / Workspace link)
→ work-unit DOM unmounts BEFORE /workspace ready                      REMOVE (clears prior surface; violates Law 6)
→ /workspace mounts loading=true → WorkspacePageLoadingGate           REMOVE (intermediate skeleton)
→ [warm cache] gate skipped, reveal from session cache               CANONICALIZE (make warm the guaranteed path; persist chrome)
→ decoupled wu/ws session caches → possible refetch on round-trip     CANONICALIZE (unify caches)
```

---

## Part E — First implementation plan (NOT implemented this phase)

Priority order per the doctrine is **visible route experience first**, dead-code cleanup last.

### Recommended first slice
**Eliminate the cold client-fetch loading gate on `/workspace` by seeding the first-paint payload server-side (or from warm cache) so the surface reveals once.** This is the single most-visible violation (Law 1, 3, 5) and is self-contained to the workspace route.

1. **Smallest high-impact slice:** Remove the `WorkspacePageLoadingGate` cold path by making the workspace first-paint bundle (departments + tile counts + lifecycle cards) available at commit — either hoisted into the server `layout.tsx` bundle and passed as props, or guaranteed from a warm seed — and reserve the KPI slot so growth/OIP only patch values. **[candidate approach — design in Phase 2]**
2. **Exact files to change:** `app/adminV2/workspace/page.tsx` (consume seeded data; init `loading` from cache; reserve KPI slot), `app/adminV2/workspace/layout.tsx` (server bundle), `lib/adminV2/workspaceRevealGate.ts` (gate semantics if needed), `components/admin/workspace/WorkspaceRootShell.tsx` / KPI header (fixed-height slot). No queue/drawer files.
3. **Expected visual outcome:** entering or returning to `/workspace` shows the final structure once — no "Preparing…" gate, no counts→growth→OIP KPI reshuffle, no tile pop-in.
4. **Risk level:** **Medium.** Touches the workspace reveal path (runtime-sensitive) but not the protected queue/drawer gates. Server-side data hoist must preserve cache keys and known-empty semantics.
5. **Tests to add/update:** assert no loading-gate on warm navigation; assert KPI slot reserved (no layout shift / no axis change); assert reveal commits once with tiles+counts present; keep the locked reveal-gate determinism suite green.
6. **Validation commands:** `cd web && npm run typecheck:build` + scoped workspace/reveal tests (`tests/lib/workspace/*`, `tests/adminV2/workUnit*` for regressions) + the locked runtime suite from `adminv2-runtime-performance-doctrine.md`.
7. **Rollback plan:** the change is gated behind the existing `NEXT_PUBLIC_ALLOY_OS_RUNTIME` runtime flag path; keep the current client-fetch path reachable behind flag-off until the seeded path is proven, then remove. Single-route revert = revert the workspace `page.tsx`/`layout.tsx` commit.

### Subsequent slices (ordered, not yet designed)
1. **Work-unit cold shell removal:** resolve slug→metadata in `[workUnitSlug]/layout.tsx` (server) and pass as props so `WorkUnitWorkspaceColdShell` is not needed on warm/normal entry; bound the operational-surface wait.
2. **KPI/context/queue reveal-together:** ensure the work-unit first-paint bundle commits context + KPI slot + queue frame + rows together (Law 5).
3. **Continuous `work-unit ↔ /workspace` navigation:** shared persistent chrome + unified session cache so the prior surface is never cleared before the next is ready (Law 6).
4. **Remove legacy fallback branches** from the canonical condensed-queue path (crm-less `LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview`) once `CompressedQueueRow` parity is proven (DELETE_AFTER_PARITY).
5. **Continuous save** pass: convert non-drawer `router.refresh()` saves to optimistic + scoped invalidation (Law 8).
6. **Then** dead-code cleanup (Sprint 02 audit candidates).

---

## Top 5 runtime violations found (this phase)

1. **`work-unit → /workspace` clears the surface and shows a loading gate** — separate layouts, no persistent surface; prior DOM unmounts before `/workspace` commits, then `WorkspacePageLoadingGate` shows until a client fetch resolves. **(Laws 1, 6) — CRITICAL.**
2. **`/workspace` cold reveal is gated behind a client-side `/api/admin/departments` fetch** → visible "Preparing…" gate instead of a one-shot reveal. **(Laws 1, 3, 5) — HIGH.**
3. **Workspace KPIs reveal in stages (counts → growth → OIP) and patch a non-reserved slot** → late values / potential reshape after first paint. **(Laws 2, 3) — HIGH.**
4. **Work-unit slug→metadata resolves in a client `useEffect` waterfall**, forcing `WorkUnitWorkspaceColdShell` before anything else can fetch. **(Laws 1, 5) — HIGH.**
5. **Decoupled work-unit and workspace session caches** → round-trip navigation can refetch warm data, breaking continuity. **(Laws 6, 7) — MEDIUM.**

(Already-good, keep: the work-unit **coordinated single reveal** once gates pass; `CompressedQueueRow` single ownership; seed-first Focus Panel shell; Sprint 01's skipped layout-doc fetch.)

---

## Validation results (this phase)

- `git status -sb`: only the two new docs staged (build artifact `web/tsconfig.build.tsbuildinfo` left unstaged).
- `cd web && npm run typecheck:build`: **clean** (no code changed).
- No implementation tests required (docs-only).
