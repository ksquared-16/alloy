# Data Taxonomy — The Nine Source Kinds

**Path:** `docs/sprints/06_2026/presentation-data-analytics-architecture/02-data-taxonomy.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 7 — Data taxonomy

Every Data Reference declares exactly one **source kind**. There are nine. New products add *instances* within these kinds — never new kinds.

---

## 0. The nine at a glance

| # | Source Kind | One-line meaning | Owned by | Typical Presentation Types | Browse path |
|---|---|---|---|---|---|
| 1 | **Canonical** | A field on the current entity | Canonical Data | Text, Money, Number, Date, Status, Boolean | Entity → Category → Field |
| 2 | **Relationship** | A value reached by traversing to a related entity | Canonical Data | Entity, scalar (via hop), Collection | Entity → Relationship → … |
| 3 | **Collection** | A set of related records | Canonical Data | Collection\<Entity\> | Entity → List |
| 4 | **Metric** | A governed Operational Intelligence measure | Operational Intelligence | Metric (value + period + comparison + dimensions) | OI → Domain → Metric |
| 5 | **State** | Derived runtime / Business Process / work state | Runtime + Status/State + BP | Status, Boolean, Count, EntityRef | State → … |
| 6 | **AI** | A generated output with provenance | AI Platform | Narrative, Score, Collection, Text | AI → … |
| 7 | **Action** | An invokable operation as a presentation object | Actions / Workflows | Action | Actions → … |
| 8 | **Computed** | A surface-local, ungoverned derivation | Experience Builder (presentation-time) | scalar (Text, Number, Date, Boolean) | Computed → expression |
| 9 | **System** | Platform/contextual values | Platform | Text, Date, EntityRef, Boolean | System → … |

---

## 1. Canonical — entity fields

The plainest kind: a field on the **subject** entity of the surface.

- **Path:** Entity → Category → Field. (*Enrollment → Billing → Balance*, *Person → Contact → Email*.)
- **Categories** group fields into business areas (Contact, Identity, Billing, Schedule, Program, Compliance…), driven by the org's `field_definitions` grouping — never raw column order.
- **Presentation Type** comes from the field's declared type (currency → `Money`, date → `Date`, enum/status → `Status`).
- **Editability** (read-only vs editable, required) is inherited from the field definition + Business Process rules; the model surfaces it, never invents it.

## 2. Relationship — traversal to related entities

A reference that **hops** from the subject to a related entity, then to a field, another relationship, or a collection. Full design in [`03-relationship-architecture.md`](./03-relationship-architecture.md).

- **Path:** Entity → Relationship(role) → {Field | Relationship | Collection}.
  - *Enrollment → Primary Contact → Email* (to-one → field → `Text`)
  - *Enrollment → Children → Current Room* (to-many → per-item field; needs a selection rule → `Collection` or scalar)
  - *Enrollment → Assigned Employee → Email* (to-one → field)
- **Roles** are business-named relationship resolutions (*Primary Contact*, not "persons"), hiding the resolution logic (who is flagged primary).
- **Cardinality** (to-one vs to-many) determines whether the result is a scalar/entity or a Collection.

## 3. Collection — sets of records

A set of related records presented together.

- **Examples:** Children, Invoices, Tasks, Communications, Documents, Payments, Activities.
- **Presentation Type:** `Collection<EntityType>`, carrying each item's available references (so a collection renderer can map per-item slots).
- **Source:** a relationship with to-many cardinality, or a runtime/derived list (e.g., "Tasks Due"). Collections therefore overlap Relationship and State — the *kind* is chosen by how the admin browses to it (under "Lists").
- **Consumption:** collection renderers (Table, List, Timeline, Relationship Card) accept `Collection<T>` and declare a **per-item slot template** (see [`05-renderer-contracts.md`](./05-renderer-contracts.md) §Collections).

## 4. Metric — Operational Intelligence measures

A **governed** measure defined in Operational Intelligence. Metrics are **not fields**. Full split in [`04-analytics-architecture.md`](./04-analytics-architecture.md).

- **Examples:** Projected Revenue, Capacity, Tour Show Rate, Enrollment Velocity, Forecast Occupancy, Projected Tuition.
- **Path:** OI → Domain → Metric (*OI → Enrollment → Projected Tuition*).
- **Presentation Type:** `Metric` — a rich shape carrying value, unit, period, comparison, dimensions, and (optional) semantic bands. Renderers may accept the scalar projection (`Metric → Money/Percentage/Score`).
- **Boundary:** the Experience Builder selects *which* metric and *how to display* it; it never defines the math.

## 5. State — runtime, Business Process, and work state

Derived state computed at request time — **not stored fields.**

| Subtype | Examples | Owner | Type |
|---|---|---|---|
| **Record state** | Current Status, Needs Attention, Readiness | Status/State system | Status, Boolean |
| **Business Process state** | Workflow Stage, current Mission, stage entry time | Business Process system | Status, Date |
| **Work / queue state** | Current Queue, position, Current Assignee, Tasks Due (count) | Runtime / queues | EntityRef, Count |

- **Read-only by nature** in presentation — state is *output*, surfaced not authored. The model marks BP-owned state distinctly so the Experience Builder shows it as non-editable.
- Resolved fresh per request; honors reveal/empty semantics (a `null` readiness is "not computed", not "not ready").

## 6. AI — generated outputs as presentation sources

AI outputs are first-class presentation sources, clearly marked.

- **Examples:** Summary, Suggested Next Step, Risk Score, Generated Timeline, Recommendations.
- **Presentation Types:** `Narrative` (summary/next step), `Score` (risk), `Collection` (timeline/recommendations).
- **Provenance is mandatory:** every AI reference resolves with model/version, generated-at, confidence, and grounding so AI renderers can show "AI-generated", freshness, and a path to the source. AI is **never** treated as record truth.
- **Governed by the AI platform** (events/permissions/audit); the model only *references* the output.

## 7. Action — operations as presentation objects

Actions become presentation objects so cards/surfaces can place them — but their *definition* lives in the Actions/Workflows layer.

| Action class | Examples | Owner |
|---|---|---|
| **Primary Actions** | "Schedule Tour", "Send Agreement" | Business Process / Surface |
| **Quick Actions** | "Call", "Email", "Add Note" | Card / Surface |
| **Workflow Actions** | "Advance Stage", "Request Documents" | Workflow |
| **Record Actions** | "Edit", "Archive" | Entity/System |
| **Surface Actions** | "Refresh", "Export" | Surface |

- **Presentation Type:** `Action`, carrying label, icon, availability (a condition — see [`06-condition-builder.md`](./06-condition-builder.md)), and invocation reference.
- The Experience Builder **places** actions and sets labels/conditions; it does not define what an action *does*. Layered ownership matches the frozen Actions doctrine.

## 8. Computed — surface-local derivations

Lightweight, **ungoverned** presentation-time derivations — explicitly *not* OI metrics.

- **Examples:** full name from parts, "days since inquiry" from a date, a concatenated label, a simple ratio for display.
- **Presentation Type:** the scalar the expression yields.
- **The Metric vs Computed line (critical):**

| | **Metric (kind 4)** | **Computed (kind 8)** |
|---|---|---|
| Owner | Operational Intelligence | Experience Builder (presentation) |
| Governed / audited | ✅ | ❌ |
| Dimensions / periods / comparisons | ✅ | ❌ |
| Reused consistently across surfaces | ✅ (single source of truth) | ❌ (local to a slot/card) |
| Use when | the number must be consistent, auditable, business-meaningful | a trivial display convenience |

> Rule: if a value carries business meaning that must stay consistent everywhere, it is a **Metric**, not a Computed. Computed exists only to avoid forcing trivial display math into OI.

## 9. System — platform & contextual values

Ambient context values.

- **Examples:** Current User, Current Date/Time, Current Org, Current Location, Active Viewpoint, Permission context, Feature flags (display-relevant only).
- **Presentation Type:** scalars and `EntityRef`.
- Primarily used in **conditions** (e.g., *Visible When Active Viewpoint is Director*) and in document/communication surfaces (e.g., generated-on date), but available anywhere.

---

## 10. How kinds map to renderer contracts

The taxonomy exists to feed the contract validator. Each kind resolves to Presentation Types; renderers accept Presentation Types. The kind influences **browse path** and **ownership**, while the **type** governs **renderer compatibility** (see [`05-renderer-contracts.md`](./05-renderer-contracts.md)). This separation is why nine very different kinds still flow through one pipeline.

## 11. Future products fit existing kinds

| Future product | Adds instances to kinds | New kind? |
|---|---|---|
| POS | Canonical (line items), Collection (cart), Metric (daily sales), Action (charge) | No |
| Documents | Canonical (merge fields), Collection (attachments), System (generated-on) | No |
| Forms | Canonical (captured fields), State (submission status), Action (submit) | No |
| Portal | Relationship (parent's children), Collection (invoices), Action (pay) | No |
| Scheduling | Canonical, Relationship (room/staff), Collection (sessions), Metric (occupancy) | No |
| Communications | Canonical (variables), Collection (thread), AI (draft), Action (send) | No |

Every product plugs into the **same nine kinds**. This is the future-proofing test, and the taxonomy passes it.

## 12. Cross-references

| Concern | Doc |
|---|---|
| The model & convergence | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) |
| Relationship traversal & roles | [`03-relationship-architecture.md`](./03-relationship-architecture.md) |
| Metric definition vs presentation | [`04-analytics-architecture.md`](./04-analytics-architecture.md) |
| Renderer accepted types | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| Ownership answers | [`08-architecture-recommendations.md`](./08-architecture-recommendations.md) |
