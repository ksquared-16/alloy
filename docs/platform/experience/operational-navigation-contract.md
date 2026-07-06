# Operational Navigation Contract

**Path:** `docs/platform/experience/operational-navigation-contract.md`
**Status:** Canonical (July 2026). Defines the ownership, timing, and visual contract for every
navigation within the Alloy OS operational surface.
**Companion docs:**
- [`operational-motion-doctrine.md`](./operational-motion-doctrine.md) — how surfaces move when they transition
- [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) — what surfaces must feel like

---

## Core law

> Operational surfaces are one continuous environment.
> Workspace → Work Unit → Focus Panel is moving **deeper into the same surface**, not loading separate pages.
> The only place Alloy feels like navigating between pages is **Settings**.

---

## Navigation ownership table

| Transition | Nav mechanism | Old surface stable? | New surface prepared before reveal? | Visual transition owner |
|---|---|---|---|---|
| **Workspace tile → Work Unit** | `router.push()` (soft nav) | ✅ workspace stays mounted until RSC resolves | ✅ bootstrap prefetch starts on pointer-down; page joins inflight on mount | `loading.tsx = null` (workspace is the loading state); 140ms page fade-in on mount |
| **Work Unit tab / lane change** | In-page state | ✅ Work Unit never reloads | ✅ row buffer held, summaries swap | `.motion-swap`, `motion.micro` |
| **Queue row → Focus Panel** | In-page (`openDrawer`) | ✅ queue stays mounted, compresses | ✅ VM prewarm on pointer intent; seed header is synchronous | CSS `data-alloy-os-runtime-split` attribute → 220ms queue compress + panel slide |
| **Focus Panel → linked record** | In-panel (`openDrawerModelSwap`) | ✅ shell stays mounted | ✅ `applyDrawerTargetNavigation` sync; body swaps async | Seed header switch (instant); body crossfade when VM ready |
| **Focus Panel back** | In-panel (`goBack` / stack pop) | ✅ queue never remounts | ✅ VM stack cache; prior state held | Focus Panel `recede` → queue expands |
| **Focus Panel close** | In-page (drawer state clear) | ✅ Work Unit intact | N/A | Focus Panel `recede`, 220ms |
| **Work Unit → Workspace (browser back)** | Browser back / `router.back()` | ✅ workspace was never unmounted (soft nav session) | ✅ bfcache or layout context preserved | Workspace fades in from previous scroll position |
| **Settings routes** | Hard nav (`window.location.assign`) | ❌ intentional page feel | N/A | Full page reload — Settings is excluded from the OS contract |

> **Surface Host + reload floor (2026-07).** The Workspace tile → Work Unit soft nav is guarded by a watchdog **reload floor**: `commitAdminV2NavLinkNavigation` arms `armSoftNavReloadFloor`, which fires `window.location.assign` (a guaranteed cold rebuild) only if the soft nav has not reached the target within the budget and has not been superseded by a newer navigation. Separately, the **work-unit surface is now rendered by the Surface Host**, not the route: `WorkUnitSlugRouteHost` is seed-only and the Host mounts the surface via `useWorkUnitSurfaceController`. Neither change alters this contract's timing/visual columns — they are the resilience and ownership substrate beneath it. See [`surface-host-architecture.md`](./surface-host-architecture.md).

---

## Workspace → Work Unit transition contract

### Owner: `DeptOperConsoleQueueRow` + `router.push` + `loading.tsx = null`

```
Pointer down
  ↓  bootstrap prefetch starts (warmWorkUnitBootstrapFromDeptOperHref)
  ↓  [user still holding, ~100-300ms]
Click
  ↓  tile press-ack: aria-busy="true", data-adminv2-nav-pending="true" → accent ring + opacity 0.92
  ↓  adminV2BeforeRouteNavigation() → markWorkUnitNavigationStart(), close drawer
  ↓  router.push(prepared href)
  ↓  [React transition starts — workspace page stays mounted]
  ↓  Next.js RSC loads work-unit page segment (loading.tsx = null → workspace is the loading state)
  ↓  Work-unit page component mounts → calls fetchWorkUnitOperationalBootstrapSession("page")
  ↓  Session joins inflight bootstrap (already ~200ms in flight from pointer-down)
  ↓  Bootstrap response arrives → work-unit above-fold reveals
  ↓  140ms page fade-in (adminv2-ws-page-fade-in, ease-out)
  ↓  Workspace page unmounts; tile ack cleared on unmount
```

**Guarantees:**
- Workspace surface is **never torn down before work-unit is ready to reveal**.
- Bootstrap is **always in-flight before navigation commits** (pointer-down fires prewarm first).
- For repeat visits in the same session, `readWorkUnitPageCache` provides an immediate cache hit → `workUnitPageSeededFromCache = true` from first render → no cold shell.
- First-ever visit: brief cold shell (≤200ms) while bootstrap joins; this is the only acceptable skeleton window.

### Settings exclusion
Workspace tiles that navigate to Settings use the existing hard nav path (`adminV2CommitNavigation`). The dept-oper tile only navigates to work-unit routes, which are unconditionally soft-nav eligible.

---

## Work Unit → Focus Panel transition contract

### Owner: `openWorkUnitQueueRecord` + `AdminDrawerContext` + CSS `data-alloy-os-runtime-split`

```
Pointer down (optional VM prewarm via background scheduler)
Click queue row
  ↓  cancelBackgroundDrawerVmPrewarm("manual_selection")
  ↓  warmQueueRowOpportunityVm(id, ...) — clicked row VM warms immediately
  ↓  prefetchOpportunityDrawerOnRowIntent(id, ...) — bootstrap + drawer_primary fetch
  ↓  openDrawer({ type: "opportunities", id, opportunityQueuePreviewSeed, ... })
  ↓  drawer.id and opportunityQueuePreviewSeed update synchronously (same React commit)
  ↓  focusPanelSplitIntent = true → html[data-alloy-os-runtime-split="true"] set in layout effect
  ↓  CSS: queue width → 440px (220ms ease), Focus Panel slides in from right (220ms ease)
  ↓  Seed header renders from opportunityQueuePreviewSeed — instant, no network wait
  ↓  VM payload resolves → full header and body replace seed (atomic commit)
```

**Guarantees:**
- Queue stays mounted throughout — never reloads on Focus Panel open/close.
- Subject identity is always synchronous (seed header = same-frame as click).
- Work Unit never shows cold shell during Focus Panel operations.
- VM prewarm for visible rows runs one-at-a-time after primary reveal; clicked row always preempts.

---

## Reduced-motion contract

When `prefers-reduced-motion: reduce` is set:
- All translate/scale/spring animations collapse to opacity crossfades at 1ms (imperceptible).
- Soft nav: workspace and work-unit swap at opacity only (no lift, no slide).
- Focus Panel: no slide animation; appears/disappears via opacity crossfade.
- Tile press acknowledgement: no scale transform; accent ring only.
- Cold shell, if it appears, still pulses via skeleton-pulse (ambient, not interactional — kept).

This is enforced at token level in `globals.css` lines 94–107 and `alloyOsRuntime.css`, not per-component.

---

## Known motion debt

| Debt | Location | Severity |
|---|---|---|
| **First cold visit cold shell** | Work Unit mount | Low — only on first-ever session visit; subsequent navigations use page cache |
| **No Focus Panel recede animation** | `AdminDrawerContext.closeDrawer` | Medium — panel closes with CSS transition but no explicit `recede` choreography applied |
| **No workspace page exit choreography** | Soft nav, workspace unmount | Low — workspace simply unmounts; no outbound `recede`; acceptable per doctrine (no outbound loading state) |
| **Bootstrap joins inflight but cold shell can still flash** | Work Unit page, first visit | Low — window is ≤200ms with pointer-down prewarm |
| **Settings still hard-navs** | All Settings routes | By design — Settings is excluded from the OS contract |
