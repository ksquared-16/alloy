# Architecture Recommendations

**Path:** `docs/sprints/06_2026/presentation-runtime-architecture/07-architecture-recommendations.md`
**Status:** Architecture sprint — design only (June 2026)
**This is the decision document.** Read this first if you want the headline answers.

---

## 1. The fundamental question

> **What is the smallest reusable presentation primitive in Alloy?**

### Evaluated candidates

| Candidate | Argument for | Argument against |
|---|---|---|
| **Card** | Already the platform's "unit of operational meaning"; 8 frozen archetypes; System 4/5 investment | Too coarse for queue row fields, KPI tiles, document lines, form inputs, POS line items — all of which are not Cards but need the same Currency/Status/Date rendering |
| **Field** | Canonical data unit; universal across all systems | Fields are **data**, not **presentation**. A field does not know how to render itself — the Renderer does. Field refs are Data Sources, not presentation primitives |
| **Zone** | Structural region in every surface | Zones are topology, not content. A Zone without Cards/Slots is an empty container |
| **Slot** | First composable unit above Renderer; binds data to presentation | Correct mid-level primitive, but a Slot without a Renderer is just a data binding — the Renderer is what actually draws |
| **Renderer** | Pure presentation function; reused identically across queue row, card, dashboard, document, POS, portal | Does not compose — needs Slot (binding) and Card (meaning) above it |

### Recommendation

> **The smallest reusable presentation primitive is the Renderer.**

The first reusable **composable** unit is the **Slot** (Renderer + Data Source + Behavior).

The mid-level **meaning** unit is the **Card** (Archetype + Card Type instance + Content Template).

The structural **topology** unit is the **Zone**.

The **Design Surface** is the top-level authoring and publishing unit.

### Why Renderer, not Card

A queue row displays `Created Mar 15` using a **Date Renderer**. A Focus Panel Billing card displays `$1,234.00` using a **Currency Renderer**. An Analytics KPI tile displays `87%` using a **KPI Card Renderer**. A POS checkout line displays `$45.00` using the **same Currency Renderer**. A document table cell displays `$45.00` using the **same Currency Renderer**. A parent portal card displays `$1,234.00` using the **same Currency Renderer**.

If Cards were the atom, Alloy would need separate "queue row field rendering," "KPI tile rendering," "document cell rendering," and "portal card rendering" — which is exactly the parallel-system problem this sprint solves.

**Renderers are the atom. Everything else is composition.**

---

## 2. The recommended hierarchy

The brief proposed:

```
Perspective → Design Surface → Zone → Card → Card Slot → Renderer → Field → Behavior
```

After investigation, this **conflates three independent axes**. The recommended model:

### Composition axis (how meaning is assembled)

```
Design Surface
  → Zone
    → Card (Archetype + Card Type instance)
      → Section
        → Slot
          → Renderer ← THE ATOM
            bound to → Data Source (Field ref / Resolver / Metric / Collection)
            governed by → Behavior
              gated by → Condition
```

### Selection axis (what subset of work — FROZEN, unchanged)

```
Perspective (operating lens — filter/sort/grouping)
  → selects → Queue → Row → opens → Design Surface (Focus Panel)
```

### Audience axis (who experiences it — NEW)

```
Viewpoint (audience scope — Director, Teacher, Parent, Corporate)
  → overrides → Design Surface assignments, card visibility, density, zone presence
```

### Full runtime stack (operational mode)

```
Workspace
  → Perspective (lens)
    → Queue
      → Row
        → Focus Panel (Design Surface instance)
          → Context Frame (Mission)
            → Mode (Summary / Work / Activity)
              → Zone
                → Card
                  → Slot
                    → Renderer
```

### Full configuration stack (Configuration Mode)

```
Configuration Context
  → Surface Category (Configuration Queue)
    → Design Surface list
      → Configuration Workspace (editor)
        → Zone → Card → Slot → Renderer → Behavior → Preview
          → BOS rail
```

---

## 3. Card Slots — yes, they should exist

**Recommendation: Card Slots are the correct intra-card composition primitive.**

| Alternative | Why rejected |
|---|---|
| Nested Cards for every sub-unit | Fragments operational meaning. "Who are the people?" is one question — Parents, Children, Emergency Contacts are Slots within the Family Card, not separate Cards |
| Flat field lists | Schema-first, not meaning-first. Violates card philosophy |
| LayoutDoc sections within cards | Conflates layout-container "Section" with card-internal "Section" — migration path exists but target is Slot-native |

Slots are governed by **Content Templates** (System 5C) at four depths: compact, expanded, drill, workspace. This is frozen and adopted unchanged.

---

## 4. Card expansion — adopt System 5B unchanged

**Recommendation: The five frozen interaction models are the complete expansion architecture.**

| Model | Use when |
|---|---|
| **Expand** | More detail within same card (compact → expanded Slot depths) |
| **Embedded Workspace** | Domain module needed inside Focus Panel (Communications, Documents) |
| **Drill View** | Subordinate detail (invoice line items, contact detail) |
| **Change Subject** | Operator selects another business object (Family → Person) |
| **External / Full Workspace** | Destination cannot fit in Focus Panel |

Do not invent ad hoc expansion. Do not assume modal as default — modal is one option within External/Full Workspace.

Runtime expansion is **not fully built** (5B §12). This sprint defines the target; implementation follows in a dedicated sprint.

---

## 5. Analytics unification

**Recommendation: Analytics becomes a Design Surface category (Dashboard). No second configuration model.**

| Layer | Stays where | Moves to Presentation Runtime |
|---|---|---|
| Metric math (aggregation, filters, thresholds) | OIP / `metric_definitions` | — |
| Metric visualization type | — | Renderer catalog (KPI Card, Trend, Sparkline, Chart, Gauge, Scorecard, Table, Chip) |
| Metric placement (surface, zone, sort) | — | Design Surface config (Zone + Metric Card + Slot + Renderer) |
| Dashboard composition | — | Experience Builder (Dashboard category editor) |
| KPI pack enablement | Industry bootstrap + Settings | — |

The Analytics modal, workspace KPI strip, work-unit KPI strip, and OI panel all become **expressions of the same Metric Card Type + Renderer catalog** — assigned to different Design Surface categories (Dashboard, Workspace, Focus Panel strip).

---

## 6. Perspectives vs Viewpoints

**Recommendation: Keep "Perspective" frozen. Introduce "Viewpoint" for audience/role scope.**

| Term | Axis | Meaning | Status |
|---|---|---|---|
| **Perspective** | Selection | Operating lens — saved filter/sort/grouping. Changes the lens, not reality. | **Frozen** — do not rename |
| **Viewpoint** | Audience | Audience scope — Director, Teacher, Parent, Corporate. Changes presentation defaults, not data or permissions. | **New** — this sprint |

The brief's "Admissions Director / Teacher / Parent / Corporate" examples are **Viewpoints**, not Perspectives. A Director and Teacher share the same Perspective ("Today's Enrollments") but have different Viewpoints.

Viewpoints participate in the inheritance cascade (Org → Location → **Viewpoint** → Operator). Perspectives do not — they are runtime selection, not presentation config.

---

## 7. Naming doctrine

This sprint establishes consistent terminology. Every term has one meaning.

### Core terms

| Term | Definition | Not this |
|---|---|---|
| **Presentation Runtime** | The universal presentation system every operator experiences | "Layout system," "UI framework" |
| **Experience Builder** | The configuration application administrators use to author the Presentation Runtime | "Layout Builder," "Page Builder" |
| **Design Surface** | A named, versioned, publishable presentation context (replaces "Layout" in product vocabulary) | "Layout" (storage term), "Screen," "Page" |
| **Design Surface Category** | A grouping in the Experience Builder queue (Queue Row, Focus Panel, Dashboard, …) | "Layout type" |
| **Surface Blueprint** | A platform-provided starter Design Surface with default topology and Card Types | "Template" (reserved for content templates) |
| **Zone** | A structural region within a Design Surface | "Section" (layout doc term), "Area," "Panel" |
| **Card** | A reusable business primitive answering one operational question | "Widget," "Block," "Component" |
| **Card Type** | A platform-defined card identity with fixed purpose, Archetype, and Slot grammar | "Card template," "Card blueprint" (use Card Type) |
| **Card Instance** | A tenant-configured placement of a Card Type inside a Design Surface | "Card config," "Card layout" |
| **Archetype** | The structural behavior of a Card (Action, Status, Summary, Profile, Collection, Metric, Timeline, Launcher) | "Card type" (use Archetype for structure, Card Type for identity) |
| **Slot** | A named region inside a Card where a Data Source binds to a Renderer | "Field placement," "Widget slot" |
| **Renderer** | The smallest reusable presentation primitive — a pure presentation function | "Render hint," "Display mode," "Widget" |
| **Data Source** | A reference to record truth (field ref, resolver, metric, collection) — not a presentation primitive | "Field" (when referring to presentation) |
| **Behavior** | A declarative rule governing appearance, response, or transition | "Setting," "Option," "Flag" |
| **Condition** | A predicate gating Behavior at render time | "Filter" (use for Perspective), "Rule" |
| **Content Template** | A named specification for how a Card presents information at each interaction depth | "Layout," "Field group" |
| **Perspective** | An operating lens — saved filter/sort/grouping (FROZEN) | "Role," "View," "Persona" |
| **Viewpoint** | An audience scope — presentation defaults for a class of operator (NEW) | "Perspective" (frozen for lens), "Role" (use for RBAC) |
| **Viewpoint Override** | A presentation default changed at a Viewpoint scope | "Role config," "Persona setting" |

### Publishing terms

| Term | Definition |
|---|---|
| **Working Copy** | Draft edits in progress — not visible to runtime |
| **Preview** | Render against live/sandbox data — read-only, no side effects |
| **Published** | Immutable version — runtime reads this |
| **Retired** | Soft-deleted — no new assignments, existing continue |
| **Restored** | Re-publish a retired version |
| **Assigned** | A Published Design Surface linked to a BP/Work View/Viewpoint |
| **Inherited** | A value from a parent scope in the cascade — not explicitly set at this level |
| **Overridden** | A value explicitly set at this scope — replaces inherited value |
| **Platform Default** | The system-provided baseline for a Design Surface category |

### Storage terms (unchanged during migration)

| Term | Definition | Status |
|---|---|---|
| **LayoutDoc** | The JSON document shape for record-surface Design Surfaces | Storage — not renamed |
| **entity_layouts** | The DB table holding LayoutDoc versions | Storage — not renamed |
| **surface_key** | The registry identifier for a surface type (`opportunity_drawer`, etc.) | Code — not renamed |
| **CaptureSurfaceDoc** | The distinct document shape for capture surfaces (forms) | Future storage shape |

### Terms to retire in product copy

| Retire | Replace with |
|---|---|
| "Layout" (product/UI) | "Design Surface" |
| "Layout Builder" | "Experience Builder" |
| "Layout Gallery" | "Design Surface Gallery" |
| "Layout assignment" | "Design Surface assignment" |
| "Open in Layouts" | "Edit in Design Surfaces" |
| "Queue layout" | "Queue Row Design Surface" |
| "Focus Panel layout" | "Focus Panel Design Surface" |
| "Drawer layout" | "Focus Panel Design Surface" (product term) |

---

## 8. System ownership boundaries

| Surface / primitive | System-Owned | Hybrid | Fully Configurable | Capture |
|---|---|---|---|---|
| Platform shell (header, tabs, BOS, lifecycle rail) | ✅ | | | |
| Reveal / performance gates | ✅ | | | |
| Card anatomy + Archetypes | ✅ | | | |
| Interaction models (5B) | ✅ | | | |
| Content Templates (5C) | ✅ | | | |
| Renderer catalog | ✅ | | | |
| Card Type catalog | ✅ | | | |
| Zone topology (per category) | ✅ | | | |
| Queue Row | | ✅ | | |
| Focus Panel | | ✅ | | |
| Workspace | | ✅ | | |
| Dashboard / Analytics | | | ✅ | |
| Document / Print | | | ✅ | |
| Communication template | | | ✅ | |
| Portal / Mobile | | | ✅ | |
| POS | | ✅ | | |
| Form | | | | ✅ |
| BOS rail | ✅ | | | |

---

## 9. Decision log

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D1 | **Renderer is the smallest primitive** | Card, Field, Zone, Slot | Renderer is reused identically across all surface categories; Card is too coarse for rows/tiles/lines |
| D2 | **Three axes, not one hierarchy** | Single chain (brief proposal) | Alloy already separates composition, selection, and audience — collapsing them breaks frozen Perspective and creates RBAC confusion |
| D3 | **"Design Surface" replaces "Layout" in product vocabulary** | Keep "Layout," use "Surface," use "Presentation" | "Layout" implies grid editing; "Design Surface" implies experience authoring; storage terms unchanged |
| D4 | **"Viewpoint" for audience/role scope** | Reuse "Perspective," use "Persona," use "Role View" | "Perspective" is frozen as operating lens; "Role" collides with RBAC; "Persona" is not Alloy vocabulary |
| D5 | **Card Slots exist** | Nested Cards, flat field lists | Content Template doctrine (5C) already defines Slot depths; intra-card sub-units are Slots, not Cards |
| D6 | **Analytics = Dashboard Design Surface category** | Separate analytics config model, embed analytics in cards only | Metric math stays in OIP; visualization + placement unify into Presentation Runtime; no N+1 config model |
| D7 | **Forms = Capture category (distinct runtime)** | Merge into LayoutDoc, treat as Design Surface clone | Capture has validation/submission/signatures — distinct runtime contract; shares authoring chrome only |
| D8 | **Inheritance cascade: Platform → Industry → Org → Location → Viewpoint → Operator** | Flat config, BP-only inheritance, no inheritance | Enables vertical bootstrap, multi-site, and audience-specific presentation without duplicating surfaces |
| D9 | **System 5B/5C interaction + content templates adopted unchanged** | New expansion model, simplify to expand-only | Already frozen; implementation deferred — doctrine is the target |
| D10 | **Storage shapes may differ by category during migration** | Single DesignSurfaceDoc schema now | Honest about current parallel stores; concept unifies first, storage converges over phases (reuse map §7) |
| D11 | **Experience Builder extends existing `/settings/layouts`** | New route/app, rebuild from scratch | Gallery, editor, APIs, assignment flow exist — extend, don't fork |
| D12 | **Condition grammar shared across forms + layouts + cards** | Separate condition systems per surface | Reduces config complexity; forms visibility shape is the seed |

---

## 10. What this sprint does NOT decide

These require dedicated follow-on sprints or stakeholder sign-off:

| Open item | Owner | Blocker |
|---|---|---|
| DesignSurfaceDoc schema specification | Implementation sprint | This sprint defines concept, not storage |
| Grid engine implementation detail | System 4/5 implementation | Design freeze pending sign-off |
| Viewpoint UI + assignment | P6 implementation phase | Core editors must ship first |
| Portal / Mobile category editors | P8 implementation phase | Portal product not started |
| Runtime Spec tier amendment (6-tier) | Platform architecture review | Attention + Metric tier promotion |
| Field System spec (widget catalog) | Configuration Runtime | Referenced by 5C content templates |
| Communications embed API contract | Communications platform | Activity-mode embedded workspace |
| Per-card warm-swap reveal behavior | AdminV2 performance | Runtime-sensitive — test suite required |
| Franchise / multi-tenant inheritance | Platform architecture | Inheritance cascade supports it; UI deferred |

---

## 11. Cross-references

| Concern | Doc |
|---|---|
| Presentation Runtime doctrine (full primitive specs) | [`01-presentation-runtime-doctrine.md`](./01-presentation-runtime-doctrine.md) |
| Experience Builder doctrine | [`02-experience-builder-doctrine.md`](./02-experience-builder-doctrine.md) |
| Reuse map + migration phasing | [`06-reuse-map.md`](./06-reuse-map.md) |
| Surface inventory | [`05-surface-inventory.md`](./05-surface-inventory.md) |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
| Sprint README | [`README.md`](./README.md) |
