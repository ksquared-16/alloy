---
owner: experience
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Operational Experience Doctrine

**Path:** `docs/platform/experience/operational-experience-doctrine.md`
**Status:** **Canonical** (June 2026). The Human Interface Guidelines for Alloy. Every future feature conforms.
**Companion:** [`operational-motion-doctrine.md`](./operational-motion-doctrine.md) — how Alloy *moves*. This doctrine governs how Alloy *behaves*; that one governs *how it moves when it behaves*.
**Generalizes:** [`../../system/platform-performance-doctrine.md`](../../system/platform-performance-doctrine.md) and [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md) — the AdminV2 reveal gates are this doctrine's first implementation. This doc lifts their law from "AdminV2 routes" to "the entire platform."
**Practitioner guide:** [`premium-interaction-principles.md`](./premium-interaction-principles.md) — the do/don't field manual derived from this doctrine.

---

## Why this exists

Alloy's platform architecture — Cards, Surfaces, Work Units, Drawers, Actions, Runtime, Navigation, Operational Context — is foundational and stable. This doctrine is not about redesigning it. It is about making it **disappear**.

Operators should never think about software. They should never perceive routes, fetches, loading, hydration, rendering, transitions, cache, or asynchronous work. They should experience **continuity, momentum, confidence, awareness, and operational flow.**

The platform already proves it can do this — *inside* a surface. The AdminV2 reveal gates already deliver atomic reveal, held payloads, and warm navigation. The work of this doctrine is to make that experience **universal and unbroken**: true at every surface, every transition, every edit — with no seam where the illusion lapses.

---

## The Prime Directive

> **Nothing should unexpectedly appear, disappear, shift, or hesitate.**
>
> Every interaction preserves the operator's mental model. The operator's perception of "where I am, what is true, and what I just did" must never be contradicted by the software's internal mechanics.

Two states are permitted for any surface, region, or record:

1. **Not yet here** — under a single, coherent, branded preparation state.
2. **Fully here** — complete, stable, interactive.

There is no third state the operator is allowed to *watch*: no assembling, no streaming-in, no settling that catches the eye. Construction is private.

---

## The Five Laws

This doctrine reduces to five laws. Every audit finding, every roadmap item, and every future feature review maps to one of them.

### Law 1 — The Reveal Law (atomicity)

**A surface is either not-yet-here or fully-here. Never half-here.**

- One loading shell, then the entire above-fold surface reveals as **one coordinated frame** — header, KPI, queue/lane, actions, health, all together. (This is the existing "single reveal / atomic reveal" contract, now universal.)
- **No region is exempt.** Every above-fold region feeds one readiness object. The gate reveals only when the object is complete. *(Closes WS-1, WS-2: the KPI region must not bypass the gate.)*
- **Refinement after reveal is permitted only if imperceptible.** A genuinely-slow value may arrive after reveal **only** into reserved geometry and **only** under the Motion Doctrine's *settle* choreography (sub-threshold, no flash). If it would be caught by the eye, it belongs in the gate. *(Replaces the "quiet reserve" loophole with a motion contract.)*
- **If a region cannot render coherently, the gate stays up.** A slightly longer unified wait always beats a visible assembly sequence.

Forbidden everywhere: chips → actions → queues → KPI → cards appearing in waves; section skeletons replacing shells after reveal; stagger animations on above-fold regions; spinner-then-panel swaps.

### Law 2 — The Continuity Law (the operator never leaves)

**Navigation changes context, not location. The operator never perceives a "leave" event.**

- The app shell, sidebar, and any surface the operator is conceptually "still in" **remain mounted** across navigation. Switching work units is a foreground change, not a document swap.
- **No full-page reloads for operator navigation.** Transitions are soft: the current surface freezes, the destination prepares invisibly, then an atomic swap. *(Closes NAV-1, NAV-3/WU-3.)*
- **One physics for all navigation.** Record, work unit, department, workspace — every "go somewhere" obeys the same freeze → prepare → atomic-swap contract. The operator forms one stable mental model. *(Closes WU-3.)*
- **Loading belongs to arrival, never departure.** A skeleton on the way *out* is forbidden. *(Closes WU-1.)*
- Drawer open/close and record switching sync the URL via `replaceState` — **URL sync without route remount** (existing contract, preserved).

### Law 3 — The Memory Law (state is durable and warm)

**The product remembers the recent past. Returning is free.**

- Recently-touched surfaces and records are **warm**: re-entry skips the cold path. *(Closes NAV-2, DRW-5.)*
- State survives navigation and reasonable interruption (refresh): the current record, and the trail that led to it, are restorable. *(Closes DRW-4.)*
- **Hold prior payload**: during any transition, the last good content is shown until the next is ready — never a blank, never a skeleton mid-transition. (Existing contract, preserved and universalized.)
- Warmth is earned by prefetch on intent (hover, pointer-down, visible-row) and kept by a navigation-surviving cache tier. Caches must not be silently discarded by a navigation the operator considers continuous.

### Law 4 — The Truth Law (one record, one truth, everywhere)

**A change made anywhere is true everywhere it is visible, immediately.**

- Edits apply **optimistically** (<50ms, no spinner) and are **acknowledged identically** wherever they occur.
- An optimistic change **propagates to every surface holding the same record** — edit a record in a drawer and the queue row behind it is already correct on return. *(Closes WU-2, CARD-2.)*
- **Continuity must never cost truth.** Held payloads (Law 3) provide zero-flicker; but any value the operator just changed is shown correct at the first frame, and the rest revalidates silently. A held payload that contradicts the operator's last action is a trust failure, not a continuity win. *(Closes WU-2.)*
- Failures roll back **legibly and consistently** — never silently, never to an ambiguous state.

### Law 5 — The Editing Law (editing is a single, safe verb)

**Editing anything in Alloy feels the same and feels safe.** *(Answers the sprint's open question — editable cards require their own interaction doctrine. This is it.)*

- **Inline edit is the default.** No mode-toggle ceremony; fields are directly editable in place where editing is permitted.
- **Optimistic by default, coordinated save.** All editable surfaces register with the save coordinator (`registerDrawerOperatingEditSection`-style) rather than self-managing. The legacy self-managed, pessimistic pattern is deprecated. *(Resolves CARD-1's two-pattern fork onto one.)*
- **One save-acknowledgement primitive**, identical everywhere — a single Motion-token'd *settle/confirm*, not a per-component flash-or-nothing.
- **The dirty-guard is a platform invariant, not a per-drawer feature.** Any surface with unsaved edits blocks close/back/navigation with the **same** Save / Discard / Keep-editing affordance, everywhere. Silent discard of typed work is forbidden. *(Closes DRW-3.)*
- **Rollback is legible**: a failed save returns the field to its prior value with a consistent, visible error and a retry path.

---

## Ownership model (exactly one owner per behavior)

The platform requires that every behavior have exactly one owner with no overlap. The resolving rule:

> **The surface owner decides *when* a change is permitted. The Motion System decides *how* it moves when permitted.**

This cleanly separates concerns that otherwise fight: a drawer owns "close is now allowed"; Motion owns "close is a 180ms recede." Neither overrides the other.

| Subsystem | Owns (the *when* / the *what*) |
|-----------|-------------------------------|
| **Runtime** | Data readiness, reveal gates, caches, hydration, state persistence/warmth |
| **Navigation** | Transitions between surfaces, shell persistence, URL, the soft-nav contract |
| **Workspace** | Workspace-root surface composition and its readiness object |
| **Work Unit** | Work-unit surface + queue lane mount lifecycle |
| **Queue** | Queue row validity, cache invalidation, optimistic row carry-through |
| **Drawer** | Drawer lifecycle, stack durability, dirty-guard, save orchestration |
| **Card Runtime** | Card render + the editable-card interaction model |
| **KPI System** | KPI value sourcing and refinement (defers to Runtime for *when* it reveals) |
| **Focus System** | Selection and focus acknowledgement |
| **Motion System** | The *how* of every movement — all durations, easings, choreography (see Motion Doctrine) |

---

## Conformance — the review gate for every feature

Before any operator-facing feature ships, it must pass this checklist. A "no" is a doctrine violation and blocks merge unless explicitly waived in the roadmap.

**Reveal (Law 1)**
- [ ] Above-fold reveals atomically; no region reveals independently after the gate.
- [ ] Any post-reveal refinement is in reserved geometry under the *settle* choreography.

**Continuity (Law 2)**
- [ ] No full-page reload for operator navigation; the shell persists.
- [ ] No loading state on the *outbound* path of any transition.

**Memory (Law 3)**
- [ ] Recently-seen state is warm on return; nothing the operator considers continuous discards its cache.
- [ ] Prior payload is held through transitions; no blank or mid-transition skeleton.

**Truth (Law 4)**
- [ ] Edits are optimistic and propagate to every surface showing the record.
- [ ] No held payload contradicts the operator's last action.

**Editing (Law 5)**
- [ ] Inline, optimistic, coordinated save; one acknowledgement; universal dirty-guard; legible rollback.

**Motion (companion doctrine)**
- [ ] Every movement uses motion tokens; no new durations/easings invented.

---

## Relationship to existing locked doctrine

This doctrine **does not weaken** the locked performance/reveal infrastructure — it is their generalization and their reason-for-being made explicit.

- The AdminV2 reveal gates (`workspaceRevealGate`, `workUnitRevealGate`, `deptRevealGate`) are **Law 1's** concrete implementation. This doctrine adds: *no region is exempt* (closes the KPI bypass) and *refinement must be imperceptible* (replaces "quiet reserve" with a motion contract).
- "Queue/sidebar remains mounted," "warm navigation," "hold prior payload," "URL sync without remount" from `platform-performance-doctrine.md` are **Laws 2 and 3**.
- The optimistic save coordinator is **Laws 4 and 5's** foundation.

Where this doctrine asks for *more* than the locked docs currently enforce (universal soft navigation, KPI in-gate, universal dirty-guard, cross-surface optimism), those deltas are scoped in the Sprint Roadmap (historical: `../../sprints/archive/06_2026/premium-operational-experience/sprint-roadmap.md`) and must update the locked docs in the same change that implements them (per documentation governance).

---

## When this doc must be updated

A new platform-level interaction law; a change to the ownership model; resolution of a roadmap delta into the locked performance docs; or a deliberate, documented exception to one of the Five Laws.
