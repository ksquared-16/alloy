# Drawer system

**Status:** Canonical infrastructure doc (July 2026 stabilization). **Product vocabulary:** operators work in the **Focus Panel** on an **operational subject** — see [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md). This file documents reveal/payload infrastructure that retains *drawer* in module names.

> **Platform stabilization (July 2026):** Alloy has **no supported legacy entity drawer runtime**. Canonical operator experiences use VM Runtime, Focus Panel, Settings, Processing, Communications, or explicit operating surfaces. Unsupported historical entities **fail closed** (`AdminEntityDrawer` returns `null`). Rollback is **deployment/Git-based**, not permanent dual-runtime code.
>
> The **Focus Panel is the canonical operator surface.** Drawer shell modules are **reveal / open-state infrastructure** only. See [`../milestones/platform-stabilization-july-2026.md`](../milestones/platform-stabilization-july-2026.md) and [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

Entity detail architecture, VM ownership, and navigation semantics.

---

## Purpose

Drawers are **operational workspaces** for record detail — opened from queue rows, search, linked navigation, or **Default Operational Subject resolution** on Work Unit entry. In Alloy OS, this experience is presented as the **Focus Panel** (docked split layout); *drawer* here refers to the underlying payload and reveal infrastructure.

> **Operational Mode:** On Work Unit open, the Focus Panel opens automatically on the strategy-resolved subject. See [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

> **One universal drawer, not per-entity products.** There is a single drawer shell across the platform. Opportunity, Person, Child, Billing Account, Attendance Event, and Location remain distinct **records/entities**, but operators do not experience separate "drawer products." Every open carries three concepts: **Record of Truth** (the authoritative entity), **Record of Attention** (what the operator is working on), and **Context Frame** (why it was opened right now). The runtime matrix below lists VM runtimes per entity; it does **not** imply separate drawer experiences. See [`./canonical-interaction-model.md`](./canonical-interaction-model.md).

---

## Runtime matrix

| Entity | Runtime | Maturity | Operator surface |
|--------|---------|----------|------------------|
| Opportunity | `OpportunityDrawerVmRuntime` | **Canonical** | Focus Panel on work-unit routes |
| Person / Child | `PersonsDrawerVmRuntime` | **Canonical** | Focus Panel on work-unit routes |
| Location (campus/site) | Settings Configuration Runtime | **Canonical** | `/settings/locations` — inline create; search deep links |
| Unsupported (job, legacy entities, …) | — | **Fail closed** | `AdminEntityDrawer` returns `null` — no legacy fallback |

Router shell: `AdminEntityDrawer.tsx` → VM subject surface runtimes only. **`AdminEntityDrawerLegacy` deleted** (July 2026). Ownership map: [`../governance/runtime-ownership-migration-map.md`](../governance/runtime-ownership-migration-map.md).

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

> **Authoring note:** New operational behavior is specified as **Focus Panel card behavior** — not drawer overview tabs. LayoutDoc drawer authoring is frozen; card editing substrate is the next experience investment. See [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

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
