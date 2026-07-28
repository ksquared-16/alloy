---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Alloy Card Language

**Status:** Foundational platform doctrine (June 2026). Defines how every operational answer behaves.
**Precedes:** the Card Library. **Follows:** [`operational-grammar.md`](./operational-grammar.md).
**Companions:** [`universal-card-archetypes.md`](./universal-card-archetypes.md) · [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) · [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md)

> The Operational Grammar defines **why** Alloy works. The Card Language defines **how** every operational answer behaves. This is the design language every card, surface, module, and future workflow follows. Individual cards are not defined here — only the language they all speak.

---

## Purpose

Cards are not UI components — they are operational answers. Every card behaves consistently regardless of Business Process, Module, Entity, Surface, Device, or Density. Enrollment, Billing, Attendance, Scheduling, Staff, POS, Analytics, and Parent Portal all use the same language.

---

## Alloy Law #4

**A card never owns truth. A card assembles truth.** Canonical entities own information; Business Processes own process; Rules own decisions; Metrics own calculations. Cards compose operational answers from those sources. Cards are **projections, never storage.**

---

## Card Anatomy

Every card is composed from the same operational regions (not all required):

1. **Identity** — what am I looking at? (always visible)
2. **Insight** — one sentence of immediate understanding (never a paragraph)
3. **Primary Answer** — the answer to the operational question (greatest emphasis)
4. **Supporting Evidence** — facts supporting the answer (DOB, program, room, preferred contact…)
5. **Collections** — groups of related operational evidence (children, contacts, documents…) — evidence, not pages
6. **Actions** — contextual operations on the answer (call, schedule, enroll…) — belong to the card, not the page
7. **Context** — supporting metadata (last updated, created by, source) — usually de-emphasized

---

## Evidence Hierarchy

Every card classifies information into one of four levels, which prevents field dumps:

| Level | Meaning |
|-------|---------|
| **Answer** | The direct answer |
| **Evidence** | Information supporting the answer |
| **Context** | Helpful supporting information |
| **Metadata** | System information |

---

## Operational Weight

> The tier below is the **priority** dimension (how soon the operator must engage → reading **order**). It is distinct from **Composition Weight** (Heavy / Medium / Light = how much **area/emphasis** a card needs → **size**). Both feed the layout engine — see [`card-composition-system.md`](./card-composition-system.md).

Cards have **operational** weight (not visual weight), which influences placement and density:

| Tier | Meaning | Examples |
|------|---------|----------|
| **Tier 1 — Decision** | Operator must act | Current Work, Attention, Readiness |
| **Tier 2 — Context** | Operator must understand | Household, Children, Status, Program |
| **Tier 3 — Evidence** | Operator may reference | Documents, Messages, Timeline |
| **Tier 4 — Reference** | Occasional supporting info | Metrics, Audit, History |

---

## Card States

Every card supports the same lifecycle and never invents new states: Loading, Collapsed, Compact, Standard, Expanded, Focused Item, Editing, Saving, Success, Permission Limited, Empty, Overflow, Error.

---

## Density System

Cards adapt by density and never change identity: Micro (queue) · Compact (summary) · Standard (work) · Expanded (focused) · Immersive (embedded workspace). One card, multiple densities.

---

## Interaction Model

Cards support six interaction families: **Observe, Reveal, Focus, Edit, Act, Navigate.** Navigation is the **least preferred** — cards should transform rather than navigate.

### Progressive Depth

```
Observe → Reveal → Focus → Edit → Act
```

Pages are replaced by depth.

### Focus

Collections support focused subjects (focused child, contact, task, message, document). The card remains visible; the selected subject changes **within the same operational question** (Perspective Change).

### Subject Change (final interaction primitive)

A **Subject Change** is different from a Perspective Change.

| | Perspective Change | Subject Change |
|--|-------------------|----------------|
| Process | Same | Same |
| Focus Panel | Same | Same |
| Operational Context | Same | **New** |
| Subject | Same | **Different** |
| Operational question | Same | **Different** |
| Loading | Never | Context recomposes (may load deep truth) |
| Route / drawer / page | Never | Never |

**Perspective examples:** Overview → Evidence → Focused Group → Edit (local UI only).

**Subject Change examples:** Household → Child · Household → Primary Contact · Child → Parent · Billing Contact → Household.

Rules:

- No new Focus Panel, drawer, page, or separate operator surface
- The Operational Context changes; cards observe the new context and recompose
- Cards answer one operational question — Subject Changes change which question is active

> **Household clarification:** Children shown inside Household are **belonging-only** (names/count). Selecting Emma is Subject Change, not expanded Household evidence. Program, room, schedule, enrollment, medical, and documents belong to the Children card after the context shifts.

> **Employee clarification:** Employee status is not a Household field. When the context changes to Sarah and Sarah is linked to an Employee entity, the configured surface may include an Employee card. Relationship is derived — never an "Employee = Yes" checkbox as canonical truth.

> **Card Links (Focus Panel):** Configured in-panel links between cards (e.g. Children → Schedule) are Perspective Changes owned by `FocusPanelCoordination.requestFocus`. Platform helpers live in `focusPanelCardLinks.ts`. They never open a new page, drawer, or workspace — they change the active card inside the same Focus Panel. Surface Builder authors which fields/controls link where.

### Editing

Editing is always **contextual** — the operator never leaves the operational context. It may occur inline, in focused detail, in an action modal, or in an embedded workspace. **Cards never become generic forms.**

---

## Color Language

Color communicates **operational meaning, not module identity.** Cards remain visually calm; operational state creates color.

| Color | Meaning |
|-------|---------|
| Neutral / Slate | Context, identity |
| Blue | Financial |
| Green | Healthy / complete |
| Amber | Requires attention |
| Red | Blocked / urgent |
| Purple | Intelligence |
| Gray | History |

---

## Motion, Search, Surface Independence

- **Motion:** Cards compose and transform; they do not appear or navigate. Changing context should feel like information reorganizing around the operator — not replacing the interface.
- **Search:** Establishes an Operational Context (focused subject/item, expansion, editing, available actions) — it does not open a record.
- **Surface Independence:** The same card may appear in Queue, Focus Panel (Summary / Work / Activity), Workspace, Dashboard, Parent Portal, and Mobile. Only density changes.

---

## Composition

Experiences are composed from cards. Cards are composed from operational answers. Operational answers are composed from canonical information. **This hierarchy never changes.**

---

## Outcome

This language governs every card in Alloy. The next document, [`universal-card-archetypes.md`](./universal-card-archetypes.md), defines the Card Archetypes that speak this language.
