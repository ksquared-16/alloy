---
owner: operator
status: canonical
last_reviewed: 2026-08-12
supersedes: []
---

# Drawer system

**Status:** Canonical infrastructure doc. **Product vocabulary:** operators work in the **Focus Panel** on an **operational subject** — see [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md). This file documents reveal/payload infrastructure that retains *drawer* in module names.

> ## The modal record product is DELETED (August 2026)
>
> `AdminEntityDrawer` — the router — and both runtimes it mounted (`OpportunityDrawerVmRuntime`,
> `PersonsDrawerVmRuntime`) no longer exist, along with 45 modules only they reached. **No operator
> path can produce the record overlay**, and there is no flag that brings it back.
>
> The person/child overlay is the one worth naming, because it had no suppression at all: the
> enrollment overlay already stood down on work-unit surfaces, but clicking a child or a parent put
> a modal *on top of* the Focus Panel the operator was working in, on every surface.
>
> **The replacement is not a different overlay.** Putting a record in front of an operator is an
> ATTENTION MOVEMENT onto the Work Unit that holds it, and "which card, which row" is the kernel's
> ASPECT scope. One adapter owns it: `lib/runtime/focus/useOperatorRecordFocus`.
>
> Inventory and classification: [`drawer-product-eradication-inventory.md`](./drawer-product-eradication-inventory.md).
> Browser proof: `certification/playwright/drawer-eradication.cert.spec.ts` (11/11).

---

## Platform rules this establishes

| # | Rule |
|---|---|
| 1 | **Active-runtime movement is an attention movement, not a route push.** `/workspace/work-unit/:slug` is seed-only; a push changes the address and composes nothing, with no error. A URL may establish attention exactly once, on cold load. |
| 2 | **A Business Process key is not a Work Unit key.** `enrollment` is a process; `enrollment_pipeline` is a unit. Resolve the host record's own `work_unit_id` — never infer from the process. |
| 3 | **ASPECT owns card and item focus.** Finer than the Operational Subject, so it inherits target/lens/subject and can never cancel their preparation. Encoded URL-safe, so a focused card is deep-linkable. |
| 4 | **Shared provisioning must be restamped for the consuming attention.** A deduplicated preparation carries the version of the movement consuming it, or K3 discards the only committing terminal. |
| 5 | **Work View config and residue must stay RSC-safe.** `row_grain_v1` may be owned state or enumerable residue, never both. |
| 6 | **External card focus outranks a card's own mount report.** A card handed an elevation must not cancel it with its base-state report. |
| 7 | **Platform-default cards must work without tenant customization.** Configuration customizes baseline behavior; it must never be the prerequisite for it. |
| 8 | **The generic modal record overlay is not an operator surface.** There is no destination that means "open the record overlay", and no fallback to one when a record resolves nowhere — "no queue holds this record" is the honest answer. |

---

## Purpose

The **Focus Panel** is the operational workspace for record detail — composed for the subject that a queue-row selection, a Search click, a linked navigation, or **Default Operational Subject resolution** on Work Unit entry put in front of the operator. *Drawer* in this file refers only to the payload, cache and reveal infrastructure underneath it, which kept its module names.

> **Operational Mode:** On Work Unit open, the Focus Panel opens automatically on the strategy-resolved subject. See [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

> **One panel, not per-entity products.** Opportunity, Person, Child, Billing Account, Attendance Event and Location remain distinct **records**, but an operator never meets a separate surface for each. A person and a child are a CARD and a ROW inside the family's panel, addressed as an ASPECT. Every movement still carries three concepts: **Record of Truth** (the authoritative entity), **Record of Attention** (what the operator is working on) and **Context Frame** (why now). See [`./canonical-interaction-model.md`](./canonical-interaction-model.md).

---

## Runtime matrix

| Entity | Operator surface | Runtime |
|--------|------------------|---------|
| Opportunity / case | Inline Focus Panel region on `/workspace/work-unit/:slug` | `components/presentation/workUnit/InlineOpportunityFocusPanel` |
| Person / Child | A **card + item ASPECT** inside that same panel — Household card for a person, Children card for a child. Not a surface of their own. | Focus Panel cards |
| Location (campus/site) | `/settings/locations` — inline create; search deep links | Settings Configuration Runtime |
| Everything else | No record surface | — |

There is no drawer router. `components/admin/Drawer.tsx` survives as chrome for **action modals**
(create work, schedule tour, send form) — transient action surfaces, not record surfaces.

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

The URL is a PROJECTION of committed attention (`urlFromAttention`), never its cause. The kernel
writes it with `replaceState`; `?subject_id=` carries the Operational Subject and `?aspect=` the
focused card + item. On cold load `attentionFromUrl` reads both back — the one moment a URL may
establish attention.

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

## BOS in the Focus Panel

Header slot for assist — proposals require human approve/apply. No autonomous side effects.

---

## Expanded contracts

- `../../system/drawer-doctrine.md`
- `../../system/drawer-operating-model-v1.md`
- `../../system/drawer-view-model-runtime-contract.md`

---

## Related

- `./drawer-product-eradication-inventory.md` — **the live caller inventory** and what each was classified as
- `./drawer-sunset-roadmap.md` — sunset status matrix (historical: the sunset is complete)
- `./focus-panel-architecture-vocabulary.md` — **Focus Panel lexical layers** (product terms vs drawer infrastructure)
- `./operational-mode-default-state-doctrine.md` — auto-open Focus Panel on Work Unit entry
- `./canonical-interaction-model.md` — universal drawer (Truth / Attention / Frame), Modes, Cards
- `./interaction-grammar.md` — the panel preserves context; Previous/Next follows current queue
- `./operator-story.md` — lived drawer flow
- `../core/record-system.md`
- `../core/navigation-and-workspace-doctrine.md`
