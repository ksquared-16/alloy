# Drawer system

**Status:** Canonical infrastructure doc (June 2026). **Product vocabulary:** operators work in the **Focus Panel** on an **operational subject** — see [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md). This file documents payload/VM infrastructure that still uses *drawer* in module names during migration.


> **Platform Simplification (July 2026):** Alloy has **no supported legacy entity drawer runtime**. Canonical operator experiences use VM, Focus Panel, Settings, Processing, Communications, or explicit operating surfaces. Unsupported historical entities **fail closed** (`AdminEntityDrawer` returns `null`). Rollback is **deployment/Git-based**, not permanent dual-runtime code.

> **Convergence position (locked):** The **Focus Panel is the canonical operator surface.** The drawer shell remains only as **reveal / open-state infrastructure**. Drawer/tab overview and LayoutDoc drawer authoring are **legacy/transitional** and must not receive new product investment. Universal Cards absorb drawer sections over time. See the **freeze rule** and **sunset status matrix** in [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

Entity detail architecture, VM ownership, and navigation semantics.

---

## Purpose

Drawers are **operational workspaces** for record detail — opened from queue rows, search, linked navigation, or **Default Operational Subject resolution** on Work Unit entry. In Alloy OS, this experience is presented as the **Focus Panel** (docked split layout); *drawer* here refers to the underlying payload and reveal infrastructure.

> **Operational Mode:** On Work Unit open, the Focus Panel opens automatically on the strategy-resolved subject. See [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

> **One universal drawer, not per-entity products.** There is a single drawer shell across the platform. Opportunity, Person, Child, Billing Account, Attendance Event, and Location remain distinct **records/entities**, but operators do not experience separate "drawer products." Every open carries three concepts: **Record of Truth** (the authoritative entity), **Record of Attention** (what the operator is working on), and **Context Frame** (why it was opened right now). The runtime matrix below lists VM runtimes per entity; it does **not** imply separate drawer experiences. See [`./canonical-interaction-model.md`](./canonical-interaction-model.md).

---

## Runtime matrix

| Entity | Runtime | Maturity | Focus Panel body |
|--------|---------|----------|------------------|
| Opportunity | `OpportunityDrawerVmRuntime` | **Canonical** | **Yes** (when split active) |
| Person / Child | `PersonsDrawerVmRuntime` | **Canonical** (permanent VM cutover) | **Yes** (modal path; inline on work-unit surfaces) |
| Location | Settings Configuration Runtime (`/settings/locations`) | **Canonical** | **No** — inline create + deep-link selection |
| Unsupported historical entities (job, vendor, …) | — | **Removed** | **No** — `AdminEntityDrawer` fails closed (`return null`) |

Router shell: `AdminEntityDrawer.tsx` → VM subject surface runtimes only. **`AdminEntityDrawerLegacy` deleted** (July 2026 Platform Simplification). Ownership map: [`../governance/runtime-ownership-migration-map.md`](../governance/runtime-ownership-migration-map.md). Sunset status per area: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

---

## Ownership

| Concern | Owner |
|---------|--------|
| VM compose / cache | Entity VM runtime |
| Layout body | Layout runtime (`LayoutRuntimePlanView`) |
| Header chrome | Platform — identity, tabs, status, BOS, actions |
| URL sync | Platform — shallow replaceState, no route remount |
| Reveal | Composed payload readiness — no partial above-fold sections |

Locked: `../../system/adminv2-runtime-performance-doctrine.md`.

---

## URL synchronization

On work-unit routes: append/strip `:recordId` without remounting queue page.

Linked navigation (person ↔ opportunity): hold prior payload until swap ready.

---

## Warm navigation

- Row intent prefetch
- Queue adjacent prefetch for prev/next
- Session dedupe for VM fetches

---

## Field policy & layout

Settings layouts drive drawer composition. Effective policy on GET; PATCH enforcement on opportunity (layout-aware).

> **Transitional:** LayoutDoc **drawer** authoring (drawer overview sections, inline edit on the tab body) is legacy compatibility. The non-Focus-Panel overview body is a fallback only. New operational behavior is specified as **Focus Panel card behavior** — see [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md). Note: when `focusPanelActive` is on, the LayoutDoc operational edit stack is **not mounted** (Focus Panel is currently read-only for most operational data).

**Experience Builder** (visual layout authoring) is documented in:

- `experience-builder-doctrine.md` — builder + runtime contracts (inline edit, contacts, related lists)
- `experience-builder-surface-cloning-plan.md` — Person / Child / Queue migration plan

Detail: `../core/record-system.md`.

---

## BOS in drawer

Header slot for assist — proposals require human approve/apply. No autonomous side effects.

---

## Expanded contracts

- `../../system/drawer-doctrine.md`
- `../../system/drawer-operating-model-v1.md`
- `../../system/drawer-view-model-runtime-contract.md`

---

## Related

- `./drawer-sunset-roadmap.md` — **sunset status matrix + freeze rule + editing gap** (convergence lock)
- `./focus-panel-architecture-vocabulary.md` — **Focus Panel lexical layers** (product terms vs drawer infrastructure)
- `./operational-mode-default-state-doctrine.md` — auto-open Focus Panel on Work Unit entry
- `./canonical-interaction-model.md` — universal drawer (Truth / Attention / Frame), Modes, Cards
- `./interaction-grammar.md` — drawer preserves context; Previous/Next follows current queue
- `./operator-story.md` — lived drawer flow
- `../core/record-system.md`
- `../core/navigation-and-workspace-doctrine.md`
