---
owner: runtime
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Operational Runtime Doctrine

> **Implemented — Runtime Simplification sprint CLOSED (June 2026).** These laws are now realized in code for `/workspace` and `/workspace/work-unit/*`: reveal owned by the server Route VM, switching as navigation, context/perspective/queue ownership in canonical runtime modules. The canonical sprint record (completed/remaining domains, runtime score, lessons, **runtime principles**) is `work-unit-runtime-simplification-closeout.md` (historical: `../../sprints/completed/work-unit-runtime-simplification-closeout.md`). Future runtime work is ownership-driven and incremental — treat the runtime as infrastructure, not an area to rediscover.

**Status:** Canonical doctrine (Track 2, Phase 1 — June 2026). **Doctrine lock only; no runtime code changes in this phase.**
**Scope:** Primary operational routes — `/workspace`, `/workspace/work-unit/:slug` (+ `:recordId`), and the navigations between them.
**Companion evidence:** `../../sprints/archive/06_2026/operational-runtime-doctrine-phase-1.md` (historical: `../../sprints/archive/06_2026/operational-runtime-doctrine-phase-1.md`) (current-behavior map + first implementation plan).
**Builds on (does not replace):** `docs/system/adminv2-runtime-performance-doctrine.md` (locked reveal/queue/drawer gates), `docs/platform/operator/surface-view-model-composition.md` (Surface VM law).

> **North star.** Alloy is an **operating system**, not a web app assembling pages. The operator must **never visibly watch Alloy build itself**. The only acceptable transition for a primary operational route is: **BOS transition / intentional OS reveal → the complete final surface appears once.** The bar is not "data eventually loads" — it is "the operator never notices loading."

---

## The ten immutable runtime laws

### 1. One Reveal
A primary operational surface is revealed **exactly once, in its final structure**. There is no first paint that is later restructured. Either the surface is committed (final shape, real or snapshot/default values) or it is not yet shown — never a half-built intermediate.

### 2. Stable Chrome
Orientation chrome **never moves or reshapes after reveal**. Once committed, these regions hold their geometry and only patch values in place: **nav · header · context/banner · KPIs · actions · queue frame · Focus Panel frame**. No region appears late, resizes, re-owns itself, or changes axis (e.g. vertical→horizontal KPI).

### 3. No Visible Construction
Operators never see Alloy assemble itself. Forbidden on primary routes:
- skeletons that stand in for structure,
- partial shells / shell-first-then-body,
- staggered section reveal,
- placeholder-to-real morph,
- vertical-to-horizontal (or any) KPI reshaping.

A fixed-dimension **snapshot/default slot** that patches values in place is **not** construction; a structure that changes shape **is**.

### 4. One Runtime Owner
Every visible region has **exactly one canonical owner**. No competing: legacy fallback UI · duplicate drawer owner · duplicate queue owner · duplicate KPI owner · duplicate route shell. Legacy/fallback owners are quarantined behind flag-off or deleted — never reachable on the canonical path.

### 5. One First-Paint Payload
Everything required for the first reveal must be **ready together** before commit: workspace context · work-unit context · KPIs · queue rows · lane/section metadata · banner/context data · command/action frame. Secondary fetches are allowed **only** for non-primary / deferred panels (e.g. Focus Panel card body, below-fold rails, right-rail workflow KPIs).

### 6. Continuous Navigation
Navigation is **continuity, not page replacement**. `/workspace → work-unit` and `work-unit → /workspace` must **not** reveal an intermediate skeleton or loading shell, and must **not** clear the current surface before the next surface is ready. Warm caches and stable chrome carry the operator across the boundary.

### 7. Predictive Runtime
Hover/click intent **warms the likely next surface** before it is needed: work-unit route · queue payload · Focus Panel target · adjacent/return route · command/action surface when predictable. Prefetch is mandatory infrastructure on primary paths, not an optimization afterthought. (Prefetch may warm; it must never weaken a reveal gate — see the locked performance doctrine.)

### 8. Continuous Save
Saving **never full-refreshes the page or rebuilds the surface**. Canonical pattern: **save intent → optimistic/stable VM update → background persistence → explicit saved/failed state.** `router.refresh()` / full reload / shell remount as a save mechanism is forbidden on operational surfaces.

### 9. Legacy Sunset Bias
If a legacy path is **not required** for the canonical route, it is marked for **quarantine or deletion**. The canonical path does not branch into legacy UI; legacy exists only as an explicit, flag-off rollback lever or is removed.

### 10. Product Feel Over Technical Convenience
The acceptance bar is **perceptual**: the operator never notices loading, construction, or navigation seams. "It works / data loads eventually" does not satisfy any law above.

---

## How the laws bind implementation

- These laws **extend** the locked `adminv2-runtime-performance-doctrine.md`; where that doctrine specifies reveal gates, cache keys, request-ownership, and known-empty semantics, those remain the protected mechanism. This doctrine adds the **product-feel acceptance bar** the gates must satisfy on the four primary flows.
- A change is **doctrine-conformant** only if, on both cold and warm paths, the surface reveals once (Law 1), chrome is stable (Law 2), no construction is visible (Law 3), each region has one owner (Law 4), the first-paint bundle is complete (Law 5), navigation is seamless (Law 6), intent is warmed (Law 7), and saves are continuous (Law 8).
- **Settings surfaces are a later extension**, not in this phase's scope; the same laws will apply when a `SettingsSurfaceViewModel` is adopted.

---

## Acceptance checklist (per primary route)

A primary operational route passes when **all** are true:

- [ ] No route-level or client loading gate is visible on warm navigation.
- [ ] Cold reveal shows the final structure once (snapshot/default slots, never skeleton-to-structure morph).
- [ ] KPIs occupy their final slot at commit and only patch values (no count→growth→OIP reshaping that moves layout; no axis change).
- [ ] Queue frame + rows + lane metadata + context/banner commit together.
- [ ] Exactly one owner renders each region; no legacy branch is reachable with the runtime flag on.
- [ ] `work-unit ↔ /workspace` shows no intermediate skeleton and does not clear the prior surface before the next is ready.
- [ ] Hover/click warms the next surface.
- [ ] Saves update optimistically with explicit saved/failed state and no full refresh.
