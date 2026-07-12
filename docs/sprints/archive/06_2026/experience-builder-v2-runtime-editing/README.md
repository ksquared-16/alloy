# Alloy OS — Experience Builder V2 · Runtime Editing Architecture

**Path:** `docs/sprints/06_2026/experience-builder-v2-runtime-editing/`
**Status:** **UX architecture sprint — design only. No code. No schemas. No migrations. No React. No CSS.**
**Type:** Authoring experience redesign.
**Depends on:** [`../presentation-runtime-architecture/`](../presentation-runtime-architecture/) (approved primitives) and the canonical [`docs/platform/operator/presentation-runtime-doctrine.md`](../../../platform/operator/presentation-runtime-doctrine.md).

> The Presentation Runtime Architecture sprint gave us the **primitives** — Design Surfaces, Zones, Cards, Card Slots, Renderers, Perspectives, Viewpoints, and the Experience Builder. The architecture is approved. This sprint redesigns the **authoring experience** itself, because the first-pass mockups still think like a traditional configuration application — and that is not the Alloy experience.

---

## The realization

We are not building **an editor for the runtime.**

We are building **an editable runtime.**

That distinction changes everything below it.

| Traditional builder (what to leave behind) | Editable runtime (what to build) |
|---|---|
| Navigate into a separate editing application | Stay in the runtime; reveal Edit Mode in place |
| A canvas that *approximates* the result | The actual runtime *is* the canvas |
| Architecture tree → select node → inspector | Hover the thing → edit the thing, in context |
| Preview button to see "what it will look like" | No preview — you are always looking at the real surface |
| Configure metadata | Edit the product |

## Product philosophy (the one rule)

> A published Focus Panel and an editable Focus Panel should look **almost identical**.

The runtime becomes the editor. Entering Edit Mode does not navigate anywhere — it reveals editing affordances on the surface already in front of you. The published experience and the authoring experience share the same visual language, spacing, cards, hierarchy, and interaction model. There is never a "translation" between configuration and runtime.

**If it looks correct while editing, it looks identical when published.**

---

## Primary goal

Redesign the Experience Builder so configuration happens **directly inside the runtime**. The administrator should feel like they are editing the product — not configuring metadata.

The defining experience of Alloy becomes: *open any runtime surface → click Edit → change it in context → Publish — without ever feeling like you left the product.*

---

## The eight design principles (this sprint's spine)

1. **Runtime First** — the workspace literally renders the real runtime (Enrollment Summary, Analytics Dashboard, Queue Row, Document, POS Checkout). Editing only *adds* affordances.
2. **Edit Mode** — the runtime has two states: Viewing and Editing. Entering Editing reveals affordances; nothing else changes.
3. **Inline Editing** — configuration happens where the content lives. Hover a card → edit it there. Fields, renderers, slots, titles, conditions — all editable where they appear.
4. **Architecture recedes** — the structure (Surface → Zone → Card → Slot → Renderer) stays behind the scenes. Editing is visual. Users think *"I want this card higher,"* not *"edit Card #3 in Zone A."*
5. **Card insertion between cards** — cards are added *between* cards, in place, not through an abstract side panel.
6. **Structure Mode vs Content Mode** — two intentional mental models: editing the *skeleton* vs editing the *content*.
7. **Preview disappears** — the runtime is the preview. Replaced by runtime states: Viewing · Working Copy · Published · History.
8. **Scalable, inheritance-aware IA** — surface categories that scale to dozens of surfaces, anticipating Platform → Industry → Org → Location → Viewpoint → Overrides.

Plus two cross-cutting laws: **Analytics is identical** (same Edit Mode; only Card Types and Renderers change) and **respect all frozen doctrine** (this sprint makes existing systems feel like one coherent product, it does not reinvent them).

---

## Deliverables index

| # | Deliverable | Document |
|---|---|---|
| 1 | Redesigned Experience Builder interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| 2 | Revised Information Architecture | [`02-information-architecture.md`](./02-information-architecture.md) |
| 3 | Edit Mode doctrine (enter/exit, publish, versioning, working copy, collaboration) | [`03-edit-mode-doctrine.md`](./03-edit-mode-doctrine.md) |
| 4 | Structure Mode doctrine | [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md) |
| 5 | Content Mode doctrine | [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) |
| 7 | Interaction walkthroughs | [`06-interaction-walkthroughs.md`](./06-interaction-walkthroughs.md) |
| 8 | Design critique of existing mockups | [`07-design-critique.md`](./07-design-critique.md) |
| 6 | High-fidelity mockups | [`mockups/`](./mockups/) → [`mockups/README.md`](./mockups/README.md) |

**Reading order:** README → 01 (the model) → 03 (Edit Mode) → 04/05 (Structure/Content) → 02 (IA) → 06 (walkthroughs) → 07 (critique) → mockups.

---

## What this sprint may NOT do (constraints)

- **No implementation.** No code, React, CSS, schemas, or migrations.
- **Do not reinvent approved doctrine.** Business Processes, Configuration Runtime, Focus Panels, Presentation Runtime, Universal Cards, Operational UX, Navigation, and the renderer-first model are inputs. This sprint makes them feel like one product.
- **Do not reopen frozen runtime systems** (spine, queue 52px row, Focus Panel shell, card anatomy/archetypes 5/5A, interaction+expansion 5B, content templates 5C, reveal/performance gates).
- **Do not change storage terms** (`LayoutDoc`, `entity_layouts`, `surface_key`).
- **Do not weaken authority boundaries.** Edit Mode never mutates record truth — it edits *presentation*. Queues/cards remain previews; entity GET is truth.

---

## Relationship to the prior sprint

| Prior sprint (Presentation Runtime Architecture) | This sprint (Experience Builder V2) |
|---|---|
| Defined **what** the primitives are | Defines **how** you author them |
| Established the Configuration Mode shell (Context → Queue → Workspace → BOS) as the builder home | Reframes that shell as a **secondary browse/manage** surface; the **primary** authoring path is in-context Edit Mode on the live runtime |
| Mockups 1–6 (admin-style builder) | Critiqued in [`07-design-critique.md`](./07-design-critique.md); evolved into runtime-first editing |
| "Preview" as a first-class interaction | "Preview" removed — runtime states replace it |

This sprint **supersedes the authoring-UX portions** of the prior sprint's IA and Interaction Model where they conflict. It does **not** change the prior sprint's primitive definitions or the canonical doctrine.

---

## Conclusion this sprint reaches (one sentence)

If every Alloy runtime surface can be entered, edited in context through two clear modes (Structure and Content), and published — with the editing surface visually identical to the published surface and the architecture kept behind the scenes — then the Experience Builder stops being a configuration application and becomes the runtime editing itself, which is the defining experience of Alloy.
