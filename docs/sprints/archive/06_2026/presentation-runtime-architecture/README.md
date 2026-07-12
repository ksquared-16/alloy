# Alloy OS — Presentation Runtime Architecture

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/`
**Status:** **Architecture sprint — design only. No code. No migrations. No schemas.**
**Type:** Defining architecture document (unification sprint).
**Depends on / does not reopen:** the frozen runtime spine, Universal Card System (System 4 / 5 / 5A / 5B / 5C), Experience Builder doctrine, OIP/Analytics platform, Configuration Runtime, and the AdminV2 runtime-performance doctrine.

> This sprint defines the **Presentation Runtime** — the one universal presentation system every operator experiences across Alloy — and the **Experience Builder**, the configuration application administrators use to author it. It is the presentation counterpart to the work that already unified **data** (entities, fields), **operations** (business processes), and **execution** (queues, Focus Panels, BOS).

---

## What this sprint is

Alloy has, over the last several months, converged on a single operational model:

- Canonical entities + canonical fields
- Business Processes
- Configuration Runtime (`/settings/*` mirrors runtime: Context → Queue → Workspace → BOS)
- Queue Runtime, Focus Panel Runtime, BOS
- Operational Intelligence (Analytics) Runtime
- Configuration Platform

The missing piece is **presentation as a single architecture**. Today presentation still exists as **parallel systems** that each grew their own configuration model:

| Parallel system today | Config model today |
|---|---|
| Drawer / Focus Panel record surfaces | `LayoutDoc` (`entity_layouts`) — Section → Row → Column → Item |
| Queue rows | `doc.metadata.queue_record_layout` (v3) — separate from `LayoutDoc.sections[]` |
| Universal Cards (Focus Panel body) | derived view-models (`deriveOpportunityFocusPanelCards`) + System 5A archetypes |
| Analytics / KPIs | `metric_definitions` + `metric_visualizations` + `metric_placements` (Analytics V2) **and** the code `kpiRegistry` / `workspace_kpi_placement` (OIP) |
| Forms | `FormSchemaV1` (capture) |
| Documents / Print | `document_composition` blocks + `pdf_mapping_json` (embedded in form versions) |
| POS | bespoke processing shell + minimal row composer |

Each is correct in isolation. Together they are **N configuration models for one job: presenting record truth to an operator.** Every new product (POS, Reports, Portal, Mobile) currently risks adding an `N+1`th.

**This sprint's thesis:** A KPI card, a queue row, a dashboard, a Focus Panel, an invoice print view, a parent-portal card, and a POS checkout screen are all **the same kind of thing** — a *Design Surface* — built from the **same presentation primitives**. Analytics stops being special; it becomes one more Design Surface category.

This sprint produces the architecture that lets all of them become **different expressions of one Presentation Runtime** instead of separate products with their own configuration systems.

---

## Product philosophy (the one rule)

The administrator should never think:

> "I am editing a layout."

They should think:

> "I am designing the experience operators will have."

The product they use is the **Experience Builder**. The thing they are authoring is the **Presentation Runtime**. Internally, both are expressions of one architecture.

The operator, in turn, should never see schema as the headline. They see **operational meaning** (`alloy-visual-language.md`): *"This family is ready for tour,"* not *"Enrollment Status: open."* The Presentation Runtime exists to turn record truth into scannable meaning.

---

## The rename: "Layout" → "Design Surface"

Throughout the Presentation Runtime, the operator/administrator noun for *a configurable presentation context* is **Design Surface**, not "Layout."

A Design Surface is anything an operator experiences that is composed from record truth: an Enrollment Queue Row, an Enrollment Focus Panel, an Attendance Workspace, an Analytics Dashboard, a POS Checkout, an Invoice Print View, a Parent Portal Card, a Document, a Communication Template.

> **Storage note (non-negotiable):** "Design Surface" is a **conceptual/product rename**, not a storage rename. `LayoutDoc`, `entity_layouts`, `surface_key`, and existing code identifiers remain. We generalize the *concept* (`LayoutDoc` → the surface document for record surfaces is one shape of a Design Surface) and rename the *experience*. See `07-architecture-recommendations.md` § Naming Doctrine and `06-reuse-map.md`.

---

## The decisive architectural answer (headline)

> **The smallest reusable presentation primitive in Alloy is the _Renderer_, not the Card.**

A Card is a mid-level composite. The atom that is reused across *every* surface — queue row, KPI tile, Focus Panel card, document line, POS line item, portal card — is the **Renderer**: a pure presentation function that draws one typed value, collection, or signal (Currency, Status, Date, Avatar, Chart, Progress, Timeline, Signature, Photo, QR, AI Summary, …).

The first reusable **composable** unit above it is the **Slot** — a Renderer bound to a Data Source (a field ref, a resolver, or a metric) plus its Behavior.

This reframes the entire platform as **renderer-first**: Analytics, Documents, POS, and Portal reuse the *same* Currency/Status/Chart renderers as the Focus Panel. The full reasoning and the recommended hierarchy are in `07-architecture-recommendations.md`. This README states it up front because it is the load-bearing decision of the sprint.

---

## Three axes (the clarifying model)

The brief proposed a single chain: `Perspective → Design Surface → Zone → Card → Card Slot → Renderer → Field → Behavior`. Investigation shows this **conflates three independent axes** that Alloy already keeps separate. The Presentation Runtime is organized on three orthogonal axes:

| Axis | Question it answers | Primitives |
|---|---|---|
| **Composition axis** | *How is meaning assembled?* | Design Surface → Zone → Card → Section → Slot → Renderer (bound to Data Source) |
| **Selection axis** (the lens) | *What subset of work, in what order?* | **Perspective** (operating lens — saved filter/sort/grouping). **Unchanged and frozen.** |
| **Audience axis** | *Who is experiencing this, and how does it differ for them?* | **Viewpoint** (audience/role scope — Director, Teacher, Parent, Corporate). **New name** (see below). |

The brief's "Perspective" (role-based: Director/Teacher/Parent) is the **Audience axis**, which collides with the **frozen** meaning of "Perspective" (operating lens). To remove ambiguity (the brief's explicit ask), this sprint keeps **Perspective = operating lens** and introduces **Viewpoint** for the audience/role layer. See `07-architecture-recommendations.md` § Naming Doctrine.

---

## Deliverables index

| # | Deliverable | Document |
|---|---|---|
| 1, 6, 9 | Presentation Runtime doctrine + complete primitive architecture | [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) |
| 2 | Experience Builder doctrine | [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) |
| 3 | Information Architecture | [`03-information-architecture.md`](./03-information-architecture.md) |
| 4 | Interaction Model (navigation, config flow, publishing, preview, assignments, versioning) | [`04-interaction-model.md`](./04-interaction-model.md) |
| 7 | Surface inventory | [`05-surface-inventory.md`](./05-surface-inventory.md) |
| 8 | Reuse map (reuse / compat / retire / extension) | [`06-reuse-map.md`](./06-reuse-map.md) |
| 9 | Architecture recommendations + smallest-primitive answer + naming doctrine | [`07-architecture-recommendations.md`](./07-architecture-recommendations.md) |
| 5 | High-fidelity mockups | [`mockups/`](./mockups/) → [`mockups/README.md`](./mockups/README.md) |

**Reading order:** README → 07 (the decisions) → 01 (the runtime) → 02 (the builder) → 03/04 (IA + interaction) → 05/06 (inventory + reuse) → mockups.

> Pragmatic readers who want "what changed and why" first should read `07-architecture-recommendations.md` before `01`.

---

## What this sprint may NOT do (constraints)

- **No implementation.** No code, migrations, schemas, or runtime changes.
- **Do not optimize for the current CRM implementation.** Design for the next decade.
- **Do not reopen frozen runtime systems.** The runtime spine, Queue UX (52px row), Focus Panel shell, Universal Card anatomy/archetypes (5/5A), interaction+expansion models (5B), content templates (5C), and the AdminV2 reveal/performance gates are inputs, not subjects.
- **Do not introduce new runtime primitives** that contradict `alloy-os-runtime-completion.md` ("the Runtime is complete; everything after this is Configuration Runtime").
- **Do not create a Queue Builder or Focus Panel Builder** as separate apps — forbidden by `configuration-ownership-doctrine.md`. Authoring lives in the Experience Builder.
- **Do not collapse metric *math* into presentation config.** Metric definitions stay code/OIP-owned (`operational-intelligence-platform.md`); only visualization + placement unify.
- **Do not weaken authority boundaries.** Queues/cards are previews; truth is the entity GET / record responder. Persons canonical; contacts legacy. Org/dept/site scoping and RLS preserved.

---

## Source grounding (what this builds on)

Canonical inputs this sprint reconciles (does not contradict):

- `docs/platform/operator/canonical-interaction-model.md` — the spine
- `docs/platform/operator/universal-card-system.md`, `universal-universal-card-archetypes.md` (5A), `card-interaction-expansion-doctrine.md` (5B), `card-content-template-field-inclusion-doctrine.md` (5C)
- `docs/platform/operator/experience-builder-doctrine.md`, `operational-action-doctrine.md`, `focus-panel-architecture-vocabulary.md`
- `docs/platform/modules/operational-intelligence-platform.md` (Analytics), `documents-and-forms.md`, `actions-and-workflows.md`
- `docs/platform/core/placement-system.md`, `record-system.md`, `entity-model.md`
- `docs/system/configuration-system.md`, `configuration-ownership-doctrine.md`, `configuration-mode-doctrine.md`
- `docs/platform/operator/alloy-visual-language.md`, `docs/system/typography-and-presentation-doctrine.md`
- Prior sprint art: `alloy_os_system_4_universal_card_system.md`, `workspace-v3-operational-command-center/`, `configuration_runtime_*`, `analytics_workspace_shell_plan.md`, `pos_*`

---

## Conclusion this sprint reaches (one sentence)

If the Presentation Runtime is **renderer-first** and every operator surface is a **Design Surface** composed on the **composition axis** (Surface → Zone → Card → Slot → Renderer), authored in **one Experience Builder**, scoped by **Perspective** (lens) and **Viewpoint** (audience), and resolved through one **inheritance cascade** and one **publishing lifecycle** — then Enrollment, Billing, Scheduling, Attendance, Communications, Analytics, Documents, Reports, POS, Portal, and every future module become *configurations of one system*, and Alloy stops accumulating parallel presentation products.
