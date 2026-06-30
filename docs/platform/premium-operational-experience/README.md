# Premium Operational Experience Sprint

**Path:** `docs/sprints/06_2026/premium-operational-experience/`
**Status:** Doctrine + audit complete (June 2026). Implementation sequenced, not yet started.
**Mandate:** Make Alloy feel like a premium operating system. Not a redesign — a disappearance. The software should vanish; the work should remain.

---

## The thesis

Alloy already owns the contracts for a premium experience — atomic reveal gates, warm prefetch, hold-prior-payload, optimistic save coordination, shallow-URL drawers. **The illusion holds inside a surface and shatters at the seams.** Three structural reasons, one owner each:

1. Global navigation is a full `window.location.assign()` reload → **Navigation**
2. The atomic-reveal law is selectively un-enforced (KPI, editable cards) → **Runtime / Card Runtime**
3. There is no motion language at all → **Motion System** (created by this sprint)

The platform knows how to disappear. This sprint makes it do so everywhere.

---

## Deliverables

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | **Operational Experience Doctrine** — the platform HIG; the Five Laws | [`../../../platform/experience/operational-experience-doctrine.md`](../../../platform/experience/operational-experience-doctrine.md) |
| 2 | **Operational Motion Doctrine** — one motion language; tokens + five choreographies | [`../../../platform/experience/operational-motion-doctrine.md`](../../../platform/experience/operational-motion-doctrine.md) |
| 3 | **Experience Audit** — 16 issues, each with behavior / perception / owner / root cause / desired experience / choreography / plan | [`./experience-audit.md`](./experience-audit.md) |
| 4 | **Premium Interaction Principles** — the practitioner field manual | [`../../../platform/experience/premium-interaction-principles.md`](../../../platform/experience/premium-interaction-principles.md) |
| 5 | **Sprint Roadmap** — four tracks, ranked by impact × foundation vs. effort × risk | [`./sprint-roadmap.md`](./sprint-roadmap.md) |
| + | **Moments of Broken Illusion** — the scored punch list (severity / frequency / owner / complexity / ROI) | [`./moments-of-broken-illusion.md`](./moments-of-broken-illusion.md) |

**Canonical doctrines** (Deliverables 1, 2, 4) live under `docs/platform/experience/` — they outlive the sprint and govern all future features. **Sprint artifacts** (3, 5, + the punch list) live here.

---

## The Five Laws (Experience Doctrine, in one screen)

1. **Reveal** — a surface is not-yet-here or fully-here, never half-here. No region exempt; refinement must be imperceptible.
2. **Continuity** — navigation changes context, not location. No reloads. Loading belongs to arrival, never departure.
3. **Memory** — the recent past is warm; returning is free; state is durable.
4. **Truth** — one record, one truth, everywhere, instantly; continuity never costs truth.
5. **Editing** — editing is a single, safe verb: inline, optimistic, one acknowledgement, universal guard, legible rollback.

## The motion language (Motion Doctrine, in one screen)

- **4 durations:** `instant` 80 · `micro` 160 · `standard` 240 · `expressive` 360 (ms)
- **4 easings:** `exit` (accelerate) · `enter` (decelerate) · `move` (standard) · `spring` (acknowledge only)
- **5 choreographies:** `reveal` · `navigate` · `swap` · `acknowledge` · `recede`
- **Prime question:** why does this movement exist? It must say continuity, confidence, or progress — or be imperceptible.

---

## Reading order

1. This README.
2. [Moments of Broken Illusion](./moments-of-broken-illusion.md) — see the symptoms, scored.
3. [Experience Audit](./experience-audit.md) — understand each one to the file:line.
4. [Operational Experience Doctrine](../../../platform/experience/operational-experience-doctrine.md) — the law that prevents them.
5. [Operational Motion Doctrine](../../../platform/experience/operational-motion-doctrine.md) — how the law moves.
6. [Premium Interaction Principles](../../../platform/experience/premium-interaction-principles.md) — apply it at a desk.
7. [Sprint Roadmap](./sprint-roadmap.md) — the order of operations.

---

## Status & next step

Phase 1 of the sprint mandate is complete: **audit and doctrine, before any implementation** — exactly as the mandate required ("Produce the following before implementing anything").

The recommended first implementation move is **Phase 0 of the roadmap** — three Small, low-risk fixes that stop active harm (silent edit loss, half-built workspace, outbound skeleton) — followed by the motion-token foundation. The keystone (persistent runtime / soft navigation) is sequenced last and behind a fallback, by design.
