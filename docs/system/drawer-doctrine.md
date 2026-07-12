---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Drawer doctrine

**Path:** `docs/system/drawer-doctrine.md`  
**Status:** **Canonical index** (June 2026 freeze). Entry point for drawer architecture; detailed contracts live in linked docs below.  
**Do not duplicate:** Use this for ownership and navigation semantics; use child docs for VM compose and layout field rules.

---

## Purpose

Entity drawers are **operational workspaces** opened from queue rows or search. They share one platform shell; layout config owns **body content**; VM runtime owns **authoritative record state** for converged entities.

---

## Entity drawers (June 2026)

| Entity | Runtime | Status |
|--------|---------|--------|
| **Opportunity (Lead/Inquiry)** | `OpportunityDrawerVmRuntime` | **Canonical** — VM hard cutover default ON |
| **Person** | `PersonsDrawerVmRuntime` | **Transitional** — VM flag default OFF; layout runtime composition active |
| **Child** | `PersonsDrawerVmRuntime` (`isChildSurface`) | **Transitional** — same as person; child-specific composition |
| **Other entities** | `AdminEntityDrawerLegacy` | **Legacy** — ~19k LOC monolith; converge per entity |

**Router:** `AdminEntityDrawer.tsx` → VM vs legacy branch.  
**Shell:** `Drawer.tsx` (`variant="adminV2"`, `presentation="modal"`), `EntityDrawerOperatingShell.tsx`.

---

## Ownership matrix

| Concern | Owner | Notes |
|---------|--------|-------|
| **VM compose / preload / apply** | VM runtime | `fetchOpportunityDrawerViewModelClient`, `useOpportunityDrawerVmPayload`, session cache |
| **Layout runtime body** | Layout runtime | `LayoutRuntimePlanView`, composition modules per entity |
| **Header structure** | Platform | Identity, tabs, BOS slot, Actions, Status, Close |
| **Lifecycle rail** | Platform + VM | Process entities (Lead) — sole stage source |
| **Status dropdown** | Platform | Sole status control in header |
| **URL synchronization** | Platform | Shallow `replaceState` on operator WU routes — **no route remount** |
| **Linked drawer navigation** | Platform + VM | Person ↔ Opportunity; hold prior payload until swap ready |
| **Warm navigation** | Platform | Row intent prefetch, queue row VM warm, session dedupe |
| **Reveal policy** | Platform | Composed payload readiness; no partial above-fold sections |

---

## URL synchronization

On `/workspace/work-unit/:slug` and `…/:recordId`:

- Open: append record id via `operatorWorkUnitDrawerUrlSync.ts`
- Close: strip record id
- Refresh / deep link: full URL restores drawer
- **Forbidden:** Next.js navigation that remounts work-unit page on drawer toggle

See **`routing-doctrine.md`**.

---

## Warm navigation

| Mechanism | Module |
|-----------|--------|
| Row hover / intent prefetch | `prefetchOpportunityDrawerOnRowIntent`, `queueRowDrawerVmWarm.ts` |
| Deduped VM prepare | `prepareDrawerViewModelDeduped` |
| Linked person prefetch | `prefetchLinkedPersonsFromOpportunityRecord`, `warmPersonDrawerVmPrefetch.ts` |
| Atomic swap / hold | `vmDrawerTransitionCoordinator`, `vmDrawerAtomicSwap`, swap-hold CSS class |
| Restore peek | `peekOpportunityVmPreloadForRestore.ts` |

**Rule:** Open drawer frame immediately on click; body from warm VM when available; never clear valid displayed VM before replacement ready.

---

## Reveal policy

Drawers follow **composed reveal** — same platform doctrine as queues:

- No section-owned above-fold skeletons replacing composed content
- `evaluateComposedDrawerPayload` / composed person payload gates primary body
- Opportunity: VM hard cutover skips legacy composed payload path when ON
- Person/Child: composed payload + layout runtime when VM flag OFF

**Locked baseline:** **`adminv2-runtime-performance-doctrine.md`** § Drawer doctrine.

---

## Layout runtime vs VM

| Layer | Responsibility |
|-------|----------------|
| **VM** | Record fields, related graph, actions context, tab metadata, lifecycle stages |
| **Layout runtime** | Renders LayoutDoc sections/widgets from `/admin/settings/layouts` |
| **Composition** | Maps canonical section keys to dashboard slots (premium placement) |

Child/Person/Lead each have overview composition modules under `web/lib/layout/runtime/*OverviewComposition.ts`.

---

## What is canonical

- `OpportunityDrawerVmRuntime` on canonical operator paths
- `EntityDrawerOperatingShell` + layout runtime body for converged entities
- Drawer URL sync without work-unit remount
- VM session cache + row warm prefetch for opportunity
- Linked navigation with payload hold

---

## What is transitional

- Person/Child VM flags (`resolvePersonDrawerVmLoadOptions.ts`) — default legacy VM path OFF for person
- `PersonDrawerVmTabPanes` vs composed layout hybrid
- Dept/uuid drawer hosts (non-slug routes) — still mounted for compat
- `ChildDrawerVmRuntime.tsx` **deleted** — child routes through `PersonsDrawerVmRuntime`

---

## What is legacy

- `AdminEntityDrawerLegacy` for non-converged entity types
- Standalone `/legacy-admin` record pages without VM
- Hardcoded drawer sections not driven by LayoutDoc (being removed per entity)

---

## Detailed contracts (read before changing drawer code)

| Doc | Scope |
|-----|--------|
| **`drawer-operating-model-v1.md`** | Shell ownership, layout vs platform boundaries |
| **`drawer-view-model-runtime-contract.md`** | VM compose → preload → apply → pin |
| **`adminv2-runtime-performance-doctrine.md`** | Reveal gates, prefetch rules |
| **`platform-performance-doctrine.md`** | Pass 1–3, sidecar deferral |
| **`record-system.md`** | Record truth, queue preview vs drawer |

**Code map:** `web/components/admin/vmDrawer/*`, `web/lib/adminV2/viewModel/drawer/**`, `web/lib/layout/runtime/**`.

---

## Required tests (runtime-sensitive)

When touching drawer runtime files listed in `.cursor/rules/adminv2-runtime-performance.mdc`, run the drawer determinism and reveal regression suite (see that rule).

---

## When this doc must be updated

New entity VM cutover, drawer URL contract change, or ownership shift between platform and layout runtime.
