# Presentation Runtime Doctrine

**Status:** Approved architecture doctrine (June 2026) — **design stage**, no runtime implementation yet.
**Scope:** The unifying doctrine for how Alloy presents record truth to operators across every surface, and how administrators author that presentation.
**Supersedes:** "Layout" as **product language** (storage terms unchanged — see §8).
**Source sprint:** [`docs/sprints/06_2026/presentation-runtime-architecture/`](../../sprints/06_2026/presentation-runtime-architecture/) (full deliverables, mockups, surface inventory, reuse map, decision log).

> This doc is the distilled, durable subset. It does **not** restate the whole sprint. It records only the approved decisions other platform work must respect. For rationale, alternatives, and the migration phasing, read the sprint.

---

## Position in the stack

The Presentation Runtime is the **umbrella** over the already-frozen presentation systems. It unifies them; it does not reopen them.

| Layer | Owns | Status |
|---|---|---|
| **Presentation Runtime** (this doc) | The universal presentation layer + three-axis model + ownership + lifecycle | Approved doctrine, design stage |
| `experience-builder-doctrine.md` | LayoutDoc authoring, builder, queue v3, actions/widgets | Reference implementation (Lead/Opportunity) |
| `universal-card-system.md` (System 4) | Card primitive — anatomy, tiers, density, grid | Design freeze |
| `universal-card-archetypes.md` (5A) | 8 card archetypes | Approved / implemented in Focus Panel |
| `card-interaction-expansion-doctrine.md` (5B) | 5 interaction/expansion models | Doctrine; runtime not fully built |
| `card-content-template-field-inclusion-doctrine.md` (5C) | Field inclusion at compact/expanded/drill/workspace | Doctrine; not fully built |
| `canonical-interaction-model.md` | The interaction spine | Canonical |

**Law:** The Presentation Runtime does not change the runtime spine, queue UX (52px row), Focus Panel shell, card anatomy/archetypes, interaction models, content templates, or the reveal/performance gates. It is the **Configuration Runtime layer** that authors what the frozen runtime renders.

---

## 1. The Presentation Runtime

The **Presentation Runtime** is Alloy's universal presentation system — the layer that turns **record truth** into **operational meaning** for every operator, on every surface, in every product.

Every operator experience — a queue row, a Focus Panel card, a workspace KPI tile, an analytics chart, a document line, a POS checkout line, a parent-portal card — is an **expression of one Presentation Runtime**, not a separate product with its own configuration model.

## 2. The Experience Builder

The **Experience Builder** is the configuration application administrators use to author the Presentation Runtime. It is not a separate product; it is the **Configuration Runtime surface for presentation**, and it follows the same interaction doctrine as every other:

```
Configuration Context → Configuration Queue → Configuration Workspace → BOS rail
```

Product philosophy: the administrator thinks *"I am designing the experience operators will have,"* never *"I am editing a layout."* The Experience Builder is the existing `/settings/layouts` capability, extended — not a new app. No Queue Builder or Focus Panel Builder is permitted (`configuration-ownership-doctrine.md`).

## 3. Design Surface (product language)

A **Design Surface** is a named, versioned, publishable **presentation context** — the unit an administrator authors and an operator experiences. "Design Surface" replaces "Layout" in product and UI language.

Examples: Enrollment Queue Row, Enrollment Focus Panel, Analytics Dashboard, Invoice Document, POS Checkout, Parent Portal Card, Communication Template.

Design Surfaces are organized into **categories** (Queue Row, Focus Panel, Workspace, Dashboard, Document, Communication, Form, POS, Portal, Mobile, Report) — each a queue group in the Experience Builder.

## 4. Renderer-first primitive model

> **The smallest reusable presentation primitive in Alloy is the _Renderer_, not the Card.**

A **Renderer** is a pure presentation function that draws one typed value, collection, or signal (Text, Status, Currency, Date, Avatar, Chart, Progress, Timeline, Table, Signature, QR, AI Summary, KPI Card, …). The same Currency renderer draws a balance in a Focus Panel card, a queue row, a KPI tile, a POS line item, a document cell, and a portal card.

- Renderers are **platform-owned**; tenants select them, never create them.
- Renderers own **presentation only** — never data, behavior, or actions.
- A **Slot** is the first composable unit: a Data Source bound to a Renderer, plus its Behavior.
- A **Card** is a mid-level meaning unit (Archetype + Card Type instance + Content Template).

Everything above the Renderer is composition; everything below it (field value, metric) is **data**.

## 5. The three axes

Presentation is organized on **three orthogonal axes**. They must not be collapsed into one hierarchy.

| Axis | Question | Primitive(s) |
|---|---|---|
| **Composition** | How is meaning assembled? | **Design Surface → Zone → Card → Section → Slot → Renderer** (bound to a Data Source, governed by Behavior, gated by Condition) |
| **Selection** | What subset of work, in what order? | **Perspective** — an operating lens (saved filter/sort/grouping). **Frozen; unchanged.** |
| **Audience** | Who experiences this, and how does it differ? | **Viewpoint** — an audience scope (Director, Teacher, Parent, Corporate). **New term.** |

**Perspective is not renamed.** It remains the operating lens defined in `canonical-interaction-model.md` and `glossary.md`. Role/audience-based presentation is the **Viewpoint** — a distinct primitive that overrides card visibility, zone presence, density, and Design Surface assignments for a class of operator. Viewpoint is **not** RBAC: permissions gate capability; Viewpoints gate presentation.

### Data Source (binding, not presentation)

A Slot binds to a **Data Source** — a reference to record truth: a **field ref** (`field_definitions`), a **resolver ref** (record responder / VM), a **metric ref** (OIP), or a **collection ref** (related records). Fields are data; Renderers are presentation. Presentation config never overrides data truth.

## 6. Analytics is a Design Surface category

Analytics is **not a separate product**. It is the **Dashboard** Design Surface category.

- **Metric math** (aggregation, filters, thresholds) stays code/OIP-owned (`operational-intelligence-platform.md`, `metric_definitions`). It is **not** collapsed into presentation config.
- **Visualization** (KPI Card, Trend, Sparkline, Chart, Gauge, Scorecard, Table) is the shared **Renderer catalog**.
- **Placement** (zone, sort, visibility) is **Design Surface composition** (Zone → Metric Card → Slot → Renderer).

A dashboard composes exactly like a Focus Panel. There is no second configuration model for Analytics.

## 7. Card Slots = intra-card composition

Sub-units of one business question are **Slots**, not separate Cards. Billing (`balance`, `invoices`, `credits`, `payments`) is one Card with multiple Slots; Family (`parents`, `children`, `emergency_contacts`) is one Card with multiple Slots. Slots are governed by Content Templates (5C) at four depths: compact, expanded, drill, workspace. Distinct operational questions remain distinct Cards; cross-card navigation uses the Change Subject interaction model (5B).

## 8. Storage terms remain (no rename)

"Design Surface" is a **product/concept rename only**. The following remain unchanged as storage and code identifiers:

| Term | Remains |
|---|---|
| `LayoutDoc` | The JSON document shape for record-surface Design Surfaces |
| `entity_layouts` | The DB table holding versioned LayoutDocs |
| `surface_key` | The registry identifier (`opportunity_drawer`, etc.) |

The concept generalizes (a `LayoutDoc` is one shape of a Design Surface); the experience renames. Storage shapes may differ by category during migration (queue v3, metric placements, document composition, FormSchemaV1) — see the sprint reuse map. **This doctrine does not authorize a storage migration.**

## 9. Publishing, versioning, inheritance

### Publishing lifecycle (every Design Surface)

```
Working Copy → Preview → Published → Retired → Restored
```

- **Working Copy** is invisible to runtime. **Preview** renders against live/sandbox data, read-only, no side effects. **Published** is immutable and assignable; runtime reads only published versions.
- Every publish creates a new version. Rollback = publish a previous version. Publishing runs **impact analysis** over downstream assignments.

### Inheritance cascade

```
Platform Default → Industry Default → Organization → Location → Viewpoint → Operator
```

Child scope overrides parent; unset values inherit. Overrides may **hide** what a parent shows and **change Renderer/density** for visible primitives; they may **not** invent primitives a parent disallows, nor override data truth, process rules, or permissions. BP stage/mission rules apply **additively**. This extends the existing layout resolver order (Work View pins → `business_process_layout_assignments` → org/default/builtin/registry) with Viewpoint/Location above org and Industry below.

### Assignment

Design Surfaces are **authored** in the Experience Builder and **assigned** in Business Processes (Work View setup pins queue + Focus Panel surfaces; stage/status routing via `business_process_layout_assignments`). Authoring vs assignment ownership is frozen (`configuration-ownership-doctrine.md`).

## 10. Surface ownership models

Every Design Surface declares an ownership model:

| Model | Meaning | Examples |
|---|---|---|
| **System-Owned** | Platform defines everything; not reconfigurable | Platform shell chrome, BOS rail, reveal gates |
| **Hybrid** | Platform owns topology + Card Types; tenant configures instances | Focus Panel, Queue Row, Workspace, KPI strips |
| **Fully Configurable** | Tenant composes zones/cards/slots within platform guardrails | Dashboard, Document, Communication, Portal, Print |
| **Capture** | Tenant defines fields/validation/submission (distinct runtime) | Forms (`FormSchemaV1`), POS intake |

Capture surfaces share authoring chrome with the Experience Builder but keep a **separate runtime contract** (validation, signatures, submission). They are not display Design Surface clones.

## 11. Reuse / compatibility posture

- **Reuse, don't fork.** The Experience Builder extends `/settings/layouts`, `ConfigurationModeShell`, the gallery, assignment cards, and publishing APIs.
- **Renderer catalog is unified; runtime adapters are not consolidated.** Do not merge the LayoutDoc, queue-v3, FormSchemaV1, and metric renderers into one — unify the Renderer *catalog*, keep per-runtime adapters.
- **Capture stays separate from display.** Do not merge `FormSchemaV1` into `LayoutDoc`.
- **Metric math stays in OIP.** Only visualization + placement move into the Presentation Runtime.
- **Compatibility layers bridge migration:** card compositions may derive from existing layout sections; `perspectives_v1` → `work_views_v1`; legacy `record_drawer_layouts` / `record_layouts` retire after cutover. Full retirement list and phasing live in the sprint reuse map.

---

## Naming (canonical)

| Term | Meaning |
|---|---|
| **Presentation Runtime** | The universal presentation layer |
| **Experience Builder** | The authoring/configuration surface for it |
| **Design Surface** | A publishable presentation context (replaces "Layout" in product copy) |
| **Zone** | Structural region within a Design Surface |
| **Card / Card Type / Card Instance** | Business primitive / platform identity / tenant placement |
| **Archetype** | Structural card behavior (8 frozen: Action, Status, Summary, Profile, Collection, Metric, Timeline, Launcher) |
| **Slot** | Data Source bound to a Renderer inside a Card |
| **Renderer** | The smallest reusable presentation primitive |
| **Data Source** | Reference to record truth (field / resolver / metric / collection) |
| **Behavior / Condition** | Declarative appearance rule / predicate gating it |
| **Perspective** | Operating lens (selection axis) — **frozen** |
| **Viewpoint** | Audience scope (audience axis) — **new** |

Retire in product copy: "Layout," "Layout Builder," "Layout Gallery," "Queue/Focus Panel layout" → "Design Surface" equivalents. Storage terms (`LayoutDoc`, `entity_layouts`, `surface_key`) are exempt.

---

## What this doctrine does NOT decide

Schema for a generalized Design Surface document, grid-engine internals, Viewpoint UI, Portal/Mobile editors, the 6-tier Runtime Spec amendment, the Field/widget catalog spec, and per-card warm-swap reveal are **deferred** to dedicated sprints. See the sprint decision log (§10 of `07-architecture-recommendations.md`).

---

## Related docs

| Concern | Doc |
|---|---|
| Full sprint (rationale, mockups, inventory, phasing) | [`../../sprints/06_2026/presentation-runtime-architecture/`](../../sprints/06_2026/presentation-runtime-architecture/) |
| Interaction spine | [`canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Card primitive / archetypes / interaction / templates | [`universal-card-system.md`](./universal-card-system.md), [`universal-card-archetypes.md`](./universal-card-archetypes.md), [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md), [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md) |
| LayoutDoc authoring (reference implementation; **drawer authoring is transitional legacy**) | [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Drawer sunset / Focus Panel convergence (sunset matrix + freeze rule + editing gap) | [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md) |
| Analytics / metrics | [`../modules/operational-intelligence-platform.md`](../modules/operational-intelligence-platform.md) |
| Configuration ownership / mode | [`../../system/configuration-ownership-doctrine.md`](../../system/configuration-ownership-doctrine.md), [`../../system/configuration-mode-doctrine.md`](../../system/configuration-mode-doctrine.md) |
| Visual language / typography | [`alloy-visual-language.md`](./alloy-visual-language.md), [`../../system/typography-and-presentation-doctrine.md`](../../system/typography-and-presentation-doctrine.md) |
