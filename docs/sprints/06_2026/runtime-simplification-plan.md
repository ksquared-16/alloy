# Alloy Runtime Simplification Plan

**Date:** 2026-06-29 · **Author:** Claude Code · **Type:** Plan only — **no code until reviewed.**
**Premise:** Not "optimize the current runtime." Instead: **if Alloy were built cleanly today, which runtime layers would not exist?** Then sequence their removal.
**Grounded in:** [`../../platform/runtime/operational-runtime-topology.md`](../../platform/runtime/operational-runtime-topology.md) (measured L0–L7 stack), [`../../platform/runtime/operational-runtime-doctrine.md`](../../platform/runtime/operational-runtime-doctrine.md) (the 10 laws), [`runtime-topology-phase1.md`](./runtime-topology-phase1.md) (complexity scores).
**Already in flight (not re-proposed here):** Phase 2 Slice 1 (continuity seed), Slice 2 (server-seed `/workspace`), Slice 3 (server-resolve work-unit slug) — PR #9. These are the *first steps* of the target model below.

> Measurement provenance: counts are measured at `origin/staging`. The "would we build this?" verdicts are design judgments, flagged as such.

---

## 1. Current runtime stack (what actually runs today)

```
[L0] Next route + rewrite                       /workspace, /workspace/work-unit/:slug
[L1] AdminV2Shell  ............................. 5 Suspense boundaries; workspace-v2 vs SystemCanvas branches
[L2] workspace/layout.tsx (force-dynamic) ...... server Promise.all: org/tz×2/access/labels(+seed)
[L3] AdminV2WorkspaceClientProviders ........... 8 NESTED providers (see below) + <AdminEntityDrawer/>
[L4] route surface
       /workspace       → page.tsx (client, 23 useState / 12 effects) → WorkspaceRootShell
       work-unit/:slug  → WorkUnitSlugRouteHost → AdminV2OpportunityWorkUnitPage (compat, 7,780 LOC / 61 state / 52 effects)
[L5] Surface VM + reveal gate .................. reveal.canCommit (workspace) / resolveWorkUnitPageContentReady (work-unit)
[L6] section owners ............................ KPI strip, lifecycle grid, QueueBlock, Focus Panel (AdminEntityDrawer→VM / Legacy 19.5k LOC)
[L7] cross-cutting ............................. 60 cache modules · 31 prefetch utils · 36 router.refresh · custom-event invalidation
```

**L3 provider stack (measured, nested):** `AdminAuthProvider` › `AdminVerticalProvider` › `EntityLabelsProvider` › `AdminOrgOperationalTimezoneProvider` › `AdminViewerTimezoneProvider` › `WorkspaceOrgProvider` › `OperationalModeEntryProvider` › `WorkspaceFirstPaintSeedProvider` (+ `AdminDrawerProvider` for the drawer). Eight context providers wrap every workspace route, all hydrated from server props.

**The shape of the problem (not speed — structure):** identity/first-paint data is resolved by **client effects** (L4) that the **reveal gate** (L5) then waits on; orientation is split across **8 providers** (L3); the same data is **fetched from 6–7 owners** and **cached in 60 modules** (L7); and mutations **rebuild the surface** via **36 `router.refresh`** calls. The warm path already approaches one paint — the complexity is in the *number of moving layers*, not their tuning.

---

## 2. Target runtime stack (clean-slate model)

```
[T0] Next route + rewrite                       (unchanged)
[T1] One Operational Shell ..................... single chrome owner; persists across workspace↔work-unit (no remount)
[T2] One server route-VM composer .............. layout/route resolves the COMPLETE first-paint VM payload server-side
                                                 (identity + context + KPIs + tiles/queue + reveal flags) → streamed
[T3] One Runtime Provider ...................... a single context carrying the server VM + session identity
                                                 (collapses the 8 providers into 1 composed value)
[T4] Surface renders the VM once ............... reveal = "VM present"; components are pure section renderers
[T5] One cache namespace ....................... keyed by (org, scope, route, entity); session+memory unified, SWR
[T6] One save coordinator ...................... optimistic VM patch → background persist → saved/failed; never router.refresh
[T7] Predictive warm = hydrate next route-VM ... hover/intent warms the next route-VM into [T5]
```

**Simplest runtime model for the core loop:**
```
/workspace        → server composes workspaceVM (tiles+KPIs+context) → reveal once
   ↓ click (warm)   route-VM for the work-unit already hydrated on hover
work-unit         → server composes workUnitVM (identity+context+KPIs+queue+focus-panel frame) → reveal once
   ↓ row click      Focus Panel subject = seed (synchronous) → cards hydrate in the seeded shell
Focus Panel       → one subject, one frame, cards patch in place
   ↓ save           optimistic VM patch → background persist → saved/failed (no refresh, no remount)
   ↓ back           shell persists; prior route-VM restored from [T5] → reveal once (no gate, no teardown)
```
One shell, one VM per route, one provider, one cache namespace, one save path. Everything else is a pure renderer over the VM.

---

## 3. Layers / pieces to remove (or collapse)

### Providers that can disappear (collapse into one Runtime Provider — [T3])
- **`AdminViewerTimezoneProvider` + `AdminOrgOperationalTimezoneProvider`** → one `timezone` field on the VM (both are server-resolved scalars). **MERGE.**
- **`WorkspaceFirstPaintSeedProvider`** (added in Slice 2) → folds into the route-VM as `firstPaint.tiles`. **MERGE** (it was a stepping stone).
- **`WorkspaceOrgProvider`** → `vm.org` identity field. **MERGE.**
- **`AdminVerticalProvider`, `EntityLabelsProvider`, `AdminAuthProvider`** → server-resolved once; expose as VM/runtime fields rather than 3 separate contexts. **MERGE** (keep auth boundary if middleware needs it).
- **`OperationalModeEntryProvider`** → keep as behavior, but its seed becomes a VM field. **SIMPLIFY.**
- Net: **8 providers → 1** `WorkspaceRuntimeProvider` carrying a server-composed value (+ the drawer/focus-panel open-state provider, which stays as interaction infra).

### Contexts that can collapse
- timezone ×2 → 1; org + first-paint-seed + vertical/labels → the single runtime context. `WorkUnitSlugRouteContext` stays (it's route identity) but is **populated by the server VM**, not a client effect.

### Caches that can merge (60 modules → a small keyed set — [T5])
- **lifecycle cards: module `cachedCards` + session `lifecycleCards`** → one entry. **MERGE.**
- **KPI rows: dept session cache + page state** → one. **MERGE.**
- **OIP warm cache + `metricRenderBundleCache`** (partial overlap) → one metric cache. **MERGE.**
- **`workUnitBootstrapClientSession` summaries vs page summaries** → one keyed entry. **MERGE.**
- Unify the `adminV2WorkspaceSessionCache` (root/dept/wu) + `queueRowClientCache` + slug cache under one `(org, scope, route, entity)` namespace with SWR. **SIMPLIFY.**

### Client effects that move server-side ([T2]) — already started
- `/api/admin/departments` + lifecycle-catalog build (Slice 2 done) · work-unit slug resolve (Slice 3 done) · KPI placements · queue summaries → **composed into the route-VM server-side**. **SERVER_SIDE.**

### Route shells that are unnecessary
- **`WorkspacePageLoadingGate`** (removed when seeded — Slice 2). **DELETE_AFTER_PARITY.**
- **`WorkUnitWorkspaceColdShell`** (skipped when seeded — Slice 3); becomes dead once server-VM is universal. **DELETE_AFTER_PARITY.**
- **Cold shells** `DepartmentWorkspaceColdShell` / `WorkspaceRootColdShell` (already zero-importer per Sprint 02). **DELETE_NOW** (verified unused).
- **Separate settings shell** (`AdminV2SettingsClientProviders`) → converge onto the one Operational Shell later. **LATER.**
- **`AdminV2Shell` SystemCanvas branch** (unreachable for operational routes) → **QUARANTINE/DELETE_AFTER_PARITY.**

### Compatibility paths to quarantine
- **`dept/[departmentId]/work-unit/[workUnitId]` compat route** (the 7,780-LOC page is reached via the canonical host today; the compat *route* itself) → **QUARANTINE** once the canonical host owns composition.
- **Legacy queue-row path** (`LayoutRuntimeQueueRowView` / `CrmCompactQueuePreview`, crm-less only) → **DELETE_AFTER_PARITY.**
- **`AdminEntityDrawerLegacy` bodies** (19.5k LOC) → **DELETE_AFTER_PARITY** (Household/Children editing substrate gate).
- **`(proof)/adminV2/layout-proof/*`** → **QUARANTINE.**

### Fetches that should become one VM payload ([T2])
- workspace: departments + work-units + lifecycle-catalog + KPI placements → **one `workspaceVM`**.
- work-unit: slug→identity + bootstrap + queue summaries + primary-lane rows + KPI snapshot → **one `workUnitVM`** (rows may stream as a VM sub-section but under one composition).

### Save paths that must stop using `router.refresh` ([T6]) — 36 sites measured
- **30 in `AdminEntityDrawerLegacy`** (mark_completed/archive/contact/schedule) → optimistic via `drawerOperatingSaveCoordinator`. **DELETE_AFTER_PARITY.**
- **6 non-drawer**: `UsersRolesSettingsClient`, dept page update, `AdminV2ProfileMenu`, `WorkspaceRootActionsRail`, `JobDrawerV2`, `AdminLayout` → scoped event invalidation + optimistic VM patch. **SIMPLIFY (start here — lowest risk).**

---

## 4. First 5 simplification slices (ranked)

Ranked by **leverage** = UX continuity × complexity removed ÷ risk. (Slices 2–3 already prove the server-VM seam; these continue it.)

| # | Slice | What disappears | Risk | Why now |
|---|-------|-----------------|------|---------|
| **1** | **Compose `workspaceVM` server-side** (extend Slice 2 from tiles → full first-paint: tiles + KPIs + context) | client departments/placements effects; `WorkspacePageLoadingGate`; staged KPI reveal | **Med** (reveal-gate touch) | Slice 2 already seeds tiles; finishing the VM removes the remaining client first-paint effects + the gate, and locks the pattern every route inherits. |
| **2** | **Collapse the 8 providers → 1 `WorkspaceRuntimeProvider`** (timezones, org, labels, vertical, first-paint seed as VM fields) | 7 context providers / nested tree | **Med** (touch every consumer; do via codemod + keep hook names as thin shims) | Biggest structural simplification of L3; pure composition, no data-path change. Shims keep consumers stable. |
| **3** | **Unify caches into one `(org,scope,route,entity)` namespace + SWR** (merge lifecycle ×2, KPI ×2, OIP/metricRenderBundle, summaries) | ~dozen redundant cache modules + dual read paths | **Med-High** (cache keys / known-empty doctrine — runtime suite required) | Collapses the 60-module sprawl and the duplicate fetches; foundation for warm continuity. |
| **4** | **Shared persistent Operational Shell across `workspace↔work-unit`** (one shell, no remount; prior route-VM restored from cache) | per-route teardown; the residual return-gate; separate layouts' duplicate chrome | **High** (cross-route; behind flag) | Delivers the felt "OS continuity"; depends on #1/#3 (VM + unified cache) being in place. |
| **5** | **Non-drawer saves → optimistic + scoped invalidation** (6 `router.refresh` sites) | 6 full-remount save paths | **Low-Med** (scoped, non-drawer) | Continuous-save law; low risk; immediate OS-feel win; template for the later drawer-save migration. |

(Then, parity-gated: legacy queue-row deletion, work-unit compat page decomposition, `AdminEntityDrawerLegacy` → VM bodies + its 30 `router.refresh`.)

---

## 5. Risk / rollback plan

**Cross-cutting principles**
- **Additive-first / flag-gated:** every slice keeps the existing path reachable. Server-VM composition falls back to the client path on empty/error (as Slices 2–3 already do); provider collapse keeps the old hook names as shims; cache unification keeps old keys readable during transition. Rollback = revert one commit or flip `NEXT_PUBLIC_ALLOY_OS_RUNTIME` / the relevant flag.
- **Reveal/cache-key doctrine is protected:** any slice touching `*RevealGate`, cache keys, or known-empty predicates runs the locked runtime suite (`tests/admin/drawer/*`, `tests/adminV2/workUnit*`, `routeSessionCacheAndReveal`) and is gated on `typecheck:build`.
- **Baseline discipline:** the repo carries a large pre-existing red baseline (~298 files) + ~486 fragile evidence tests. Every slice verifies "no new failures" by stash-and-rerun of touched-area files (the method used in Slices 1–3), and documents the pre-existing set.
- **No partial UI to remove a gate:** removing a shell requires the first-paint payload to be complete (server-VM), never showing a partial surface early (Doctrine Law 1/3).

**Per-slice rollback**
| Slice | Rollback |
|-------|----------|
| 1 workspaceVM | revert composer commit → client effects resume (already the fallback) |
| 2 provider collapse | shims delegate to the unified provider; revert restores nested providers (consumers unchanged) |
| 3 cache unify | keep legacy cache modules until parity; feature-flag the unified namespace; revert flag |
| 4 persistent shell | behind a runtime flag; flag-off = today's per-route layouts |
| 5 non-drawer saves | per-call revert to `router.refresh`; each site independent |

**Highest-risk areas to defer** (not in the first 5): `AdminEntityDrawerLegacy` decomposition + its 30 `router.refresh` (parity-gated on the Household/Children editing substrate), legacy queue-row deletion, settings-shell convergence. These wait until the VM + shell + cache foundation (slices 1–4) is proven.

---

## Scope
**No code in this sprint.** This is the simplification map + sequencing for review. On approval, Slice 1 (compose `workspaceVM`) is the entry point — it directly continues the server-VM seam started by PR #9.
