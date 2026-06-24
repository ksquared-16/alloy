# Drawer system

**Status:** Canonical (June 2026 freeze).

Entity drawer architecture, VM ownership, and navigation semantics.

---

## Purpose

Drawers are **operational workspaces** for record detail — opened from queue rows, search, or linked navigation.

> **One universal drawer, not per-entity products.** There is a single drawer shell across the platform. Opportunity, Person, Child, Billing Account, Attendance Event, and Location remain distinct **records/entities**, but operators do not experience separate "drawer products." Every open carries three concepts: **Record of Truth** (the authoritative entity), **Record of Attention** (what the operator is working on), and **Context Frame** (why it was opened right now). The runtime matrix below lists VM runtimes per entity; it does **not** imply separate drawer experiences. See [`./canonical-interaction-model.md`](./canonical-interaction-model.md).

---

## Runtime matrix

| Entity | Runtime | Maturity |
|--------|---------|----------|
| Opportunity | `OpportunityDrawerVmRuntime` | **Canonical** |
| Person / Child | `PersonsDrawerVmRuntime` | **Transitional** (VM flag default OFF) |
| Other | `AdminEntityDrawerLegacy` | **Legacy** — shrinking |

Router: `AdminEntityDrawer.tsx`.

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

- `./canonical-interaction-model.md` — universal drawer (Truth / Attention / Frame), Modes, Cards
- `./interaction-grammar.md` — drawer preserves context; Previous/Next follows current queue
- `./operator-story.md` — lived drawer flow
- `../core/record-system.md`
- `../core/navigation-and-workspace-doctrine.md`
