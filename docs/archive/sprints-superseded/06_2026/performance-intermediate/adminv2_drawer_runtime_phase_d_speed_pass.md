# AdminV2 Drawer Runtime — Phase D Speed Pass

**Path:** `docs/sprints/archive/06_2026/adminv2_drawer_runtime_phase_d_speed_pass.md`  
**Status:** Active (June 2026)  
**Scope:** Shell-pinned VM model swap + post-first-paint critical path audit  
**Supplements:** `docs/system/adminv2-runtime-performance-doctrine.md`

---

## Phase D outcome

Shell-pinned model swap is the canonical drawer-to-drawer navigation runtime for VM-backed entities (`opportunities`, `persons` including child lifecycle).

### Implemented (this sprint)

| Area | Change |
|------|--------|
| **Sync VM cache apply** | `peekDrawerViewModelPreloadSync` applies cached VM in the same frame as drawer id change — no async gap before paint. |
| **Swap generation** | `drawerModelSwapGeneration` bumps on every model swap; layout effects re-apply preload. |
| **Gate suppression** | `drawerGateLoading` / `personDrawerShowLoadingShell` suppress skeleton during VM entity transitions when preload is present or swap is in flight. |
| **Opportunity reset scope** | Opportunity hydrate/tab reset effect runs only while `drawer.type === "opportunities"` — leaving opp for person no longer clears opp pin state needed for swap-back. |
| **Context preservation** | `resolveModelSwapOpportunityContext` keeps work-unit / queue navigator when returning to opportunity without explicit params. |
| **Related-record warm** | `warmRelatedDrawerViewModels` prefetches parent/child/opportunity VM targets after first paint apply. |
| **Diagnostics** | `drawer_vm_model_swap_apply` event logs swap apply + preload readiness. |

### Code anchors

- `web/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap.ts`
- `web/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation.ts` (`warmRelatedDrawerViewModels`)
- `web/contexts/AdminDrawerContext.tsx` (`drawerModelSwapGeneration`, sync cache path)
- `web/components/admin/AdminEntityDrawer.tsx` (gate suppression, preload apply, warm)

---

## Critical path audit (post VM first-paint)

Baseline (pre-Phase D): cold open ≈ **800–1000 ms** compose; warm reopen often repeated full compose.

### P0 — blocks instant swap / reopen (~200–400 ms recoverable each)

| Item | What still runs | Est. cost | Fix direction |
|------|-----------------|-----------|---------------|
| **Async swap without cache** | `openDrawerModelSwap` awaits network compose when VM not warmed | **300–800 ms** | Hover/mousedown prefetch (queue row, inquiry icons) + `warmRelatedDrawerViewModels` after every open |
| **Entity fetch effect `setLoading(true)`** | Legacy fetch path arms before VM preload consumed on cache miss | **50–150 ms flash** | ✅ Mitigated: sync cache peek + gate suppression + person VM ref short-circuit |
| **Person composed-payload refetch** | `personDrawerComposedPreparing` blocks body after VM first paint | **150–350 ms** | Move composed readiness into VM composition (P1) |
| **Opportunity below-fold coord timeout** | Reveal coord + secondary window gates | **100–200 ms** | VM `first_paint.settled` already owns above-fold; defer coord for swap path |

### P1 — warm reopen still recomposes (~100–250 ms each)

| Item | What still runs | Est. cost | Fix direction |
|------|-----------------|-----------|---------------|
| **Session cache VM-only** | Header/tabs/shell re-derived from VM each open | **80–150 ms** | Extend cache with `DrawerShellPinSnapshot` (header actions, tab defs, lifecycle rail section models) |
| **Status defs fetch** | Occasional `/status-definitions` after VM pin | **50–120 ms** | VM status control is authoritative under hard cutover — block fetch entirely when pin complete |
| **Entity snapshot stale clear** | `clearDrawerEntitySnapshot` on seed transition | **30–80 ms** | Seed → full promotion without clear when generation matches |
| **Tab reset to overview** | Every entity key change resets tab | **20–40 ms perceived** | Preserve tab per `(type:id:surface)` in session pin for swap-back |

### P2 — polish / future surfaces (~50–150 ms each)

| Item | Est. cost | Notes |
|------|-----------|-------|
| Adjacent opportunity queue prefetch overlap | 50–100 ms | Already exists for queue nav; extend to related-record graph |
| Communications tab prefetch invalidation | 30–60 ms | Runs on every opp id change — scope to tab visit |
| Person member-graph overlay | 80–150 ms | Background only; ensure swap never waits |
| KPI pill / dept record switching | n/a yet | Reuse `prepareDrawerViewModel` + `drawerShellPinnedModelSwap` — **do not hardcode drawer pairings** |

---

## Session cache expansion evaluation

Current: `drawerViewModelSessionCache` stores full VM preload (5 min TTL, keyed by entity + surface + org/dept/wu).

**Recommended next cache layers (P1):**

1. **`first_paint` shell snapshot** — compiled header, tabs, lifecycle rail visibility flags (skip re-compile on reopen).
2. **`header_actions` resolved slot** — already partially cached per-opportunity; unify under VM cache key.
3. **`rendered_section_models`** — immutable section VM slices for above-fold (inquiry children rows, contact card).

**Target reopen path:**

```
cache hit → apply shell pin snapshot → paint
         → background VM generation check → silent refresh if generation advanced
```

Not:

```
cache miss → network compose → reset body state → paint
```

---

## Runtime targets

| Scenario | Current (est.) | Target | Phase D progress |
|----------|----------------|--------|------------------|
| Cold open | 800–1000 ms | <500 ms perceived | VM first-paint established; prefetch + warm related |
| Warm reopen | 200–400 ms | Instant (<50 ms) | Sync cache peek ✅; shell snapshot cache pending |
| Model swap (cached) | 100–300 ms flash | Instant | Sync apply + gate suppress ✅ |
| Model swap (cold) | 400–900 ms | <200 ms perceived | Prefetch on hover ✅; needs related warm coverage |
| Drawer reopen (same record) | 200–400 ms | Instant | VM session cache ✅; shell pin pending |

---

## Next 3 highest-ROI optimizations

1. **Person/child composed-payload into VM** (~150–350 ms)  
   Eliminate post-first-paint composed fetch for child/parent surfaces; VM `first_paint.settled` must include composed readiness.

2. **DrawerShellPinSnapshot in session cache** (~80–150 ms warm reopen)  
   Cache compiled shell + header actions under same key as VM preload; render from pin before any React state reset.

3. **Aggressive related-record prefetch graph** (~200–500 ms cold swap)  
   On opportunity VM apply: warm all inquiry child + primary person VMs. On person VM apply: warm linked opportunity. On drawer hover over related icons: sync peek must hit before click.

---

## Verification

```bash
cd web && npm run test -- \
  tests/adminV2/viewModel/drawerShellPinnedModelSwap.test.ts \
  tests/adminV2/viewModel/drawerModelSwapNavigation.test.ts

cd web && npx tsc --noEmit
```

Manual: Opportunity → Person → Child → Opportunity with VM flags enabled; shell must not unmount; no skeleton flash on cached swap.

---

## Out of scope (this sprint)

- Work Unit runtime reuse (future — consume same `drawerShellPinnedModelSwap` module)
- Dept / KPI pill navigation wiring (design only — use `prepareDrawerViewModel`, not drawer pair hardcoding)
- Lifecycle/configuration product work
