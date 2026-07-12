# Architecture Recommendations

**Path:** `docs/sprints/archive/06_2026/presentation-data-analytics-architecture/08-architecture-recommendations.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 9 — Architecture recommendations

This document answers the ownership questions the sprint poses and records the decisions future implementation must respect.

---

## 1. The ownership map (the answers)

> Guiding test for *every* piece of information: **"Must this be consistent, auditable, and reused across surfaces?"** If yes → it belongs to a truth layer (Canonical / OI / Runtime / AI). If it is purely *how something looks or is placed* → it belongs to Experience Builder.

### 1.1 What belongs in **Operational Intelligence**

Everything that defines **what a number is**:

- Metric calculation, aggregation, filters, periods, dimensions, comparisons.
- Metric formatting **defaults**, semantic **bands** (good/warning/critical) that carry operational meaning.
- Metric lifecycle (draft/published/deprecated), versioning, and governance.

*Rationale:* a metric must mean one thing everywhere. Math lives once, in OI; surfaces reference it. (See [`04-analytics-architecture.md`](./04-analytics-architecture.md).)

### 1.2 What belongs in **Canonical Data**

The **record truth** and its structure:

- Entity fields, their types, validation, and grouping into business categories.
- Declared **relationships** (edges) and **roles** (resolutions like "Primary Contact"), with cardinality and direction.
- **Collections** as the to-many expression of relationships.

*Rationale:* identity and record facts are the system of record. Presentation reads them; never the reverse. (See [`02-data-taxonomy.md`](./02-data-taxonomy.md) §1–3, [`03-relationship-architecture.md`](./03-relationship-architecture.md).)

### 1.3 What belongs in **Runtime** (Status/State + Business Process + queues)

**Derived, ephemeral state** computed at request time:

- Record state (Current Status, Needs Attention, Readiness) — Status/State system.
- Business Process state (Workflow Stage, Mission, entry times) — BP system.
- Work/queue state (Current Queue, position, Current Assignee, Tasks Due counts) — runtime/queues.

*Rationale:* state is **output**, not stored truth. It is surfaced read-only and recomputed; it must never be hand-edited through presentation. (See [`02-data-taxonomy.md`](./02-data-taxonomy.md) §5.)

### 1.4 What belongs in **AI**

**Generated outputs** with provenance:

- Summaries, suggested next steps, risk scores, generated timelines, recommendations.
- Each carries model/version, confidence, freshness, grounding.

*Rationale:* AI output is a **presentation source**, never record truth. It is clearly marked, governed by the AI platform, and acted on only through existing records/workflows/permissions. (See [`02-data-taxonomy.md`](./02-data-taxonomy.md) §6.)

### 1.5 What belongs in **Experience Builder**

**Presentation only** — never truth:

- Bindings (reference ↔ renderer), renderer choice and semantic options.
- Placement, sizing, grouping, comparison **display**, threshold **coloring/display**.
- Presentation-level conditions (visibility, emphasis, availability) atop authoritative rules.
- **Computed** (kind 8) trivial display derivations — explicitly ungoverned and local.

*Rationale:* the Experience Builder **references** everything from layers above and **defines** none of it. It owns the *picture*, not the *facts*. (See [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) §7.)

## 2. The boundary table (one glance)

| Information | Owner | EB may… | EB may not… |
|---|---|---|---|
| Entity field value/type | Canonical Data | bind, choose renderer, label | redefine type or validation |
| Relationship / role | Canonical Data | traverse, pick role | invent joins or change resolution |
| Metric math | Operational Intelligence | select metric + exposed profile, choose viz | change calculation/aggregation/period |
| Runtime/BP/work state | Runtime / BP | surface (read-only), condition on it | edit state through presentation |
| AI output | AI Platform | place, render with provenance | treat as truth, hide provenance |
| Action definition | Actions/Workflows | place, label, condition availability | redefine what the action does |
| Computed display value | Experience Builder | derive trivially, render | encode governed business meaning |
| System/context value | Platform | use in conditions/labels | mutate |

## 3. Where future products plug in

Every future product contributes to the **existing** layers and consumes the **existing** model — it never adds a configuration model.

| Layer | A new product contributes… |
|---|---|
| **Canonical Data** | new entities, fields, relationships/roles, collections |
| **Operational Intelligence** | new metrics (math + bands + dimensions) |
| **Runtime** | new derived state (if any), via Status/State + BP |
| **AI** | new generated outputs (with provenance) |
| **Renderer catalog** | new renderers + their **contracts** (accepted types) |
| **Experience Builder** | new **Card Types** (instances composing the above) |

| Product | Plug-in summary |
|---|---|
| **POS** | entities (orders/line items) + metrics (sales) + actions (charge/refund); renders via existing + maybe a Receipt renderer (new contract). |
| **Documents** | merge fields (Canonical/Relationship/System) + collections (attachments); Document Viewer renderer exists. |
| **Forms** | captured fields (Canonical) + submission state (State) + submit (Action). |
| **Portal** | parent-scoped relationships + collections (invoices) + actions (pay); Viewpoint = audience scope. |
| **Scheduling** | room/staff relationships + session collections + occupancy metrics. |
| **Communications** | template variables (Canonical/Relationship) + thread (Collection) + draft (AI) + send (Action). |

**The test this passes:** none of the above requires a new *kind*, a new *browser*, a new *condition engine*, or a new *binding mechanism*. They add instances; the architecture absorbs them.

## 4. Key decisions (decision log)

| # | Decision | Rationale |
|---|---|---|
| D1 | **One Presentation Data Model** feeds every surface | prevents parallel configuration models |
| D2 | **Nine source kinds**, fixed; products add instances | extensibility without taxonomy sprawl |
| D3 | **Renderers validate by Presentation Type, not source kind** | nine kinds converge into one pipeline |
| D4 | **Business concepts are primary; technical paths are secondary** | "navigate the business, not tables" |
| D5 | **Metric definition (OI) ⟂ metric presentation (EB)** | a metric means one thing everywhere |
| D6 | **Computed ≠ Metric** | trivial display math without forking governed truth |
| D7 | **Relationships are declared roles, not joins; depth-bounded** | predictable, safe traversal |
| D8 | **To-many→scalar requires a selection rule** | avoids ambiguous values |
| D9 | **One condition engine; left operand = same Browser** | no parallel condition systems |
| D10 | **AI carries mandatory provenance; never truth** | trust and safety |
| D11 | **Presentation never mutates truth; org scoping at resolution** | authority boundaries hold |
| D12 | **Shared Data Source Browser for bindings and conditions** | one mental model |

## 5. Open questions deferred to implementation (not this sprint)

- Caching/materialization strategy for expensive metric/state references (performance, not architecture).
- Exact wire shape of a Data Reference (storage; out of scope — `LayoutDoc`/`entity_layouts` remain the storage terms).
- Cross-entity Computed limits and a possible small expression vocabulary.
- Real-time vs request-time recomputation of reactive conditions.

These are engineering decisions; the architecture above constrains them but does not resolve them here (design-only sprint).

## 6. How this completes the four-layer picture

```
Business Processes            → what work exists
Canonical Data + OI           → what information exists      ┐
                                                             ├─ Presentation Data Model
Presentation Runtime          → how information is presented ┘   (this sprint = the seam)
Operator Experience           → what the operator does
```

With the Presentation Data Model defined, the seam between *information* and *presentation* is closed with one architecture. Combined with the Presentation Runtime primitives and the editable-runtime authoring model, Alloy now has a complete, implementation-ready presentation architecture in which every present and future product presents information the same way.

## 7. Cross-references

| Concern | Doc |
|---|---|
| The model | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) |
| Taxonomy | [`02-data-taxonomy.md`](./02-data-taxonomy.md) |
| Relationships | [`03-relationship-architecture.md`](./03-relationship-architecture.md) |
| Analytics split | [`04-analytics-architecture.md`](./04-analytics-architecture.md) |
| Renderer contracts | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| Condition engine | [`06-condition-builder.md`](./06-condition-builder.md) |
| Browser IA | [`07-data-source-browser.md`](./07-data-source-browser.md) |
