# Universal Card System (Alloy OS — System 4)

**Status:** Design freeze — System 5 owns operational surface presentation; System 5A owns archetype composition; System 5B/5C own interaction and content templates (doctrine only until implementation requested).  
**Visual law:** [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5) · [`universal-card-archetypes.md`](./universal-card-archetypes.md) (System 5A) · [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (System 5B) · [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md) (System 5C)  
**Full artifact:** [`docs/sprints/06_2026/alloy_os_system_4_universal_card_system.md`](../../sprints/06_2026/alloy_os_system_4_universal_card_system.md) (all 13 deliverables, Concept A/B/C, freeze checklist)  
**Interactive mock:** Cursor Canvas `universal-card-system.canvas.tsx` (when opened beside chat)

This document is the **platform entry point** for the Universal Card System. The sprint doc remains the authoritative design freeze; promote sections into [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) Part 7–8 only after checklist approval.

**Unifying umbrella:** The Card sits inside the broader **Presentation Runtime** — see [`presentation-runtime-doctrine.md`](./presentation-runtime-doctrine.md). Note its renderer-first conclusion: the Card is a mid-level composite, while the **Renderer** is the smallest reusable presentation primitive shared across cards, queue rows, dashboards, documents, and POS.

---

## Convergence position (locked)

The Universal Card is the **future composition unit** of the canonical operator surface, the **Focus Panel**. **Universal Cards absorb drawer sections over time** — drawer/tab overview and LayoutDoc drawer sections are legacy/transitional, and new operational behavior is specified as card behavior, not drawer-section behavior. See the freeze rule and sunset status matrix in [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

> **Editing gap (highest-risk blocker):** When `focusPanelActive` is on, the LayoutDoc operational edit stack is **not mounted**, so the Focus Panel is currently **read-only for most operational data**. The next implementation priority is the editing/interaction substrate (card expansion → focused item state → card-level actions → inline editing → save/dirty → collection editing), **not more cards**. First editable card: **Household**; second: **Children**. Detail: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) and [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md).

---

## What a card is

A **Universal Card** is a reusable **business primitive** — not a field container. It answers **one operational question** and may contain fields, widgets, actions, metrics, related records, or workflow entry points.

| Owner | Concern |
|-------|---------|
| **Platform** | Card anatomy, behavior, tiers, density, grid engine, states |
| **Experience Builder** | Composition — which cards, order, span, visibility, fields/widgets |
| **Business Processes** | Why/when cards appear; workflow entry points |
| **Analytics** | Metric / KPI cards |
| **Record System** | Data |
| **Actions / Workflow** | Card actions |

---

## Anatomy (platform-owned)

Header (icon, title, status chip, primary insight, overflow) · Body (secondary details, widgets) · Footer (primary action, related actions, metadata). States: empty, loading (coordinated reveal — no section skeletons), error, expand/collapse.

Sizing tokens: header 36–56px by density; padding 16×12px; title 14/600; body 13/400; icon 16–20px; radius 10px; flat elevation (Attention tier may lift one level).

---

## Layout system — **Concept B (recommended)**

Responsive card grid inside the Focus Panel body:

| Primitive | Use |
|-----------|-----|
| Stack | Narrow fallback |
| Row / 2-col / 3-col micro grid | Side-by-side context |
| Span 1 / 2 / full row | Within grid |
| Inline strip | Micro KPI tiles |
| Collapsible section | Reference / History groups |

Grid: up to **4 columns** at wide panel (≥1040px); **16px** gaps; min card **240px** (160px micro). Collapses to 2-col, then single column by **tier priority** (not raw config order).

---

## Density

| Density | Height | Use |
|---------|--------|-----|
| Micro | 56–88px | KPI / readiness glance |
| Compact | 96–160px | Context at a glance |
| Standard | 160–360px | Default working card |
| Expanded | 360px+ | Active work / timeline |

---

## Tiers

Attention → Work → Context → Reference → Historical → Metric (cross-cutting). Configuration may reorder **within** a tier only.

---

## Focus Panel header target (Concept B)

Fixed **chrome** (close, breadcrumb, Message/Schedule/overflow) · **subject** (avatar, identity, mission line, state row, primary action) · **mode control** (Summary / Work / Activity). Body scrolls; shell stays mounted on record swap; mode persists; scroll resets; no full-panel skeleton on warm swap.

---

## Mode compositions (reference — not hardcoded)

**Summary (enrollment reference):** Row1 — Attention · Current Work · Tour Summary · Readiness KPI. Row2 — Household · Children (2-col). Row3 — Communications. Row4 — Documents.

**Work:** Launcher row · Active steps (expanded) · Tasks + Automations.

**Activity:** Timeline (full) · Communications + Documents · Notes + Audit.

---

## Configuration mapping (future)

| Design | Config surface | Owner |
|--------|----------------|-------|
| Mode layouts | Experience Builder layout doc | Experience Builder |
| Rows / cells / span / density | Card composition config | Experience Builder |
| Visibility | BP rules + EB visibility | BP + EB |
| Actions | Registered action keys | Actions / Workflow |
| Metrics | Placements | Analytics |
| Data | Entity GET / record responders | Record System |

First implementation may **derive** defaults from existing CRM layout slots and KPI placements (compatibility layer).

---

## Recommendation

**Concept B — responsive operational grid.** Concept A = narrow collapse target. Concept C rejected as default (absorb micro patterns only where needed).

---

## Freeze checklist

Approve in sprint doc Deliverable 13 before implementation: anatomy, density, grid/span, header target, Summary/Work/Activity compositions, config mapping, tier amendment, Concept B direction.

---

## Cross-references

- Runtime spec (stubs): [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) Part 7–8, 11
- Visual language: [`alloy-visual-language.md`](./alloy-visual-language.md)
- Experience Builder: [`experience-builder-doctrine.md`](./experience-builder-doctrine.md)
- Reveal gates: [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md)
