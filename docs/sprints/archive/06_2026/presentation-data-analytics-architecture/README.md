# Alloy OS — Presentation Data & Analytics Architecture

**Path:** `docs/sprints/06_2026/presentation-data-analytics-architecture/`
**Status:** **Architecture sprint — design only. No code. No schemas. No migrations. No React. No DB/API work.**
**Type:** Foundational information-layer architecture.
**Depends on:**
- [`../presentation-runtime-architecture/`](../presentation-runtime-architecture/) — primitives (Design Surface, Zone, Card, Slot, Renderer, Viewpoint, Perspective)
- [`../experience-builder-v2-runtime-editing/`](../experience-builder-v2-runtime-editing/) — the editable-runtime authoring model
- Canonical: [`docs/platform/operator/presentation-runtime-doctrine.md`](../../../platform/operator/presentation-runtime-doctrine.md)

> The Presentation Runtime architecture is complete. The Experience Builder architecture is complete. The editable-runtime model is complete. **One foundational architecture remains before implementation: how information enters the Presentation Runtime.** This sprint defines the **Presentation Data Model** — the universal information layer every Design Surface consumes.

---

## The problem

Today the Experience Builder assumes one generic flow:

```
Data Source → Renderer → Card
```

That is not sufficient. Alloy has fundamentally different **categories** of information — canonical entity fields, related-entity fields, calculated metrics, AI summaries, runtime state, Business Process state, Operational Intelligence metrics, actions, and collections. A single opaque "Data Source" cannot describe them, validate them against renderers, or let an administrator reason about them.

The Experience Builder must *understand* these categories — and present them as **business concepts, not database fields.**

## Goal

Design the **Presentation Data Model**: the universal information layer consumed by every renderer, card, dashboard, queue row, and Focus Panel. Every Design Surface obtains information from this one model. No surface invents its own.

## The one principle

> The Experience Builder must never expose database fields. It exposes **business concepts.**

Administrators should think:

```
Primary Contact → Email          (not  person.email)
Enrollment → Desired Start Date   (not  enrollment.desired_start_date)
```

Browsing data should feel like **navigating the business**, not navigating tables.

---

## Where this sits — the four layers of Alloy

```
Business Processes              ── determine what WORK exists
        │
Canonical Data + Operational    ── determine what INFORMATION exists
Intelligence
        │
Presentation Runtime            ── determines how information is PRESENTED
        │
Operator Experience             ── what the operator actually does
```

- **Business Processes** decide what work exists.
- **Canonical Data + Operational Intelligence** decide what information exists.
- **Presentation Runtime** decides how information is presented.
- **Experience Builder** decides how that presentation is authored.

This sprint defines the **contract between layer 2 (information) and layer 3 (presentation)** — the Presentation Data Model is exactly that seam.

---

## The keystone idea (one sentence)

Every value a renderer can draw is a **Binding** that resolves a **Data Reference** — a business-concept path into one of nine **source kinds** — to a **typed Presentation shape**; renderers declare which shapes they accept, so the *kind* of source becomes irrelevant to the renderer and **all nine categories converge into one pipeline.**

---

## Deliverables index

| # | Deliverable | Document |
|---|---|---|
| 1 | Presentation Data doctrine | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) |
| 7 | Data taxonomy (9 source kinds) | [`02-data-taxonomy.md`](./02-data-taxonomy.md) |
| 3 | Relationship architecture | [`03-relationship-architecture.md`](./03-relationship-architecture.md) |
| 2 | Analytics architecture (definition vs presentation) | [`04-analytics-architecture.md`](./04-analytics-architecture.md) |
| 6 | Renderer contracts | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| 5 | Condition Builder | [`06-condition-builder.md`](./06-condition-builder.md) |
| 4 | Data Source Browser (IA) | [`07-data-source-browser.md`](./07-data-source-browser.md) |
| 9 | Architecture recommendations (ownership) | [`08-architecture-recommendations.md`](./08-architecture-recommendations.md) |
| 8 | High-fidelity mockups | [`mockups/`](./mockups/) → [`mockups/README.md`](./mockups/README.md) |

**Reading order:** README → 01 (doctrine) → 02 (taxonomy) → 03 (relationships) → 04 (analytics) → 05 (renderer contracts) → 06 (conditions) → 07 (browser IA) → 08 (recommendations) → mockups.

---

## Constraints

- **No implementation.** No code, React, schemas, migrations, DB, or API work.
- **Design only.** This produces architecture and UX, not engineering artifacts.
- **Respect frozen doctrine.** Presentation Runtime primitives, the editable-runtime model, Universal Cards, Configuration Runtime, the renderer-first model, OI metric ownership, and `org_id` scoping are inputs — not subjects to reopen.
- **One model, no parallel systems.** The output must let Enrollment, Billing, Scheduling, Attendance, POS, Documents, Forms, Portal, Analytics, Communications, and AI all consume information **without inventing new configuration models.**
- **Authority boundaries hold.** Presentation never becomes truth: queues/cards/bindings are previews; entity GET / record responders / OI remain authoritative.

---

## Conclusion this sprint reaches (one sentence)

If all information — canonical fields, relationships, metrics, collections, state, AI, actions, computed, and system values — is expressed as typed Data References resolved through one Presentation Data Model, browsed as business concepts, validated against renderer contracts, and reused unchanged by a single condition engine, then every present and future Alloy product presents information through one architecture instead of many, which is the last foundational piece before implementation.
