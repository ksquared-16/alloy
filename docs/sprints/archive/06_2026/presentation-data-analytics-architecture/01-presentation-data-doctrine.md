# Presentation Data Doctrine

**Path:** `docs/sprints/archive/06_2026/presentation-data-analytics-architecture/01-presentation-data-doctrine.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 1 — Presentation Data doctrine

---

## 1. What this layer is

The **Presentation Data Model** is the single information layer that sits between *what information exists* (Canonical Data + Operational Intelligence + Runtime + AI) and *how it is presented* (the Presentation Runtime). Every renderer, card, dashboard, queue row, document, and Focus Panel obtains information **only** through this model.

It is **not** a database, an API, or a caching layer. It is a **conceptual contract**: a typed, business-named description of every value the runtime can present, and the rules for resolving and validating it.

## 2. The three nouns

| Noun | Definition |
|---|---|
| **Data Reference** | A typed, business-named pointer to a piece of information. It declares a **source kind** (one of nine — see [`02-data-taxonomy.md`](./02-data-taxonomy.md)), a **business-concept path** (e.g., *Enrollment → Primary Contact → Email*), and the **Presentation Type** it resolves to. It never names a table or column to the operator. |
| **Presentation Type** | The typed *shape* a Data Reference yields: `Text`, `Money`, `Number`, `Percentage`, `Date`, `Status`, `Boolean`, `Entity`, `Collection<T>`, `Metric`, `Action`, `Narrative` (AI), `Score`, `Duration`, etc. This is the contract currency between data and renderers. |
| **Binding** | The pairing of a Data Reference with a Renderer inside a Slot. Valid **iff** the reference's Presentation Type is in the renderer's accepted set (see [`05-renderer-contracts.md`](./05-renderer-contracts.md)). |

## 3. The unifying law

> A renderer does not care **where** information comes from. It cares only about the **Presentation Type** it receives. Therefore every one of the nine source kinds is consumed through the **same** Binding mechanism, and the data pipelines converge.

This single law is what lets a `Currency` renderer draw a canonical field (`billing.balance`), a metric (`projected_tuition`), or a computed value with identical machinery — because all three resolve to `Money` (or `Metric<Money>`, which `Currency` also accepts).

## 4. The convergent pipeline

Two apparent pipelines exist; they converge at the Binding.

```
CANONICAL / RELATIONSHIP / COLLECTION / STATE / AI / ACTION / COMPUTED / SYSTEM
        │   (business-concept path resolution)
        ▼
   Data Reference  ──┐
                     │
OPERATIONAL          │   resolve → typed Presentation shape
INTELLIGENCE         │
        │            ▼
   Metric Ref ─────► Binding (Reference + Renderer)  ──►  Slot  ──►  Card  ──►  Zone  ──►  Design Surface
                            ▲
                    renderer contract validates type
```

- The **left inputs** are the nine source kinds. Each resolves a business-concept path to a Presentation Type.
- **Operational Intelligence** is one of those inputs (the Metric kind), drawn separately here only to honor the requested "two pipelines" framing — but it converges at the **same** Binding as everything else.
- Downstream (Slot → Card → Zone → Surface) is the frozen composition axis from the Presentation Runtime doctrine. This sprint only defines **everything to the left of the Slot.**

## 5. Business concepts, never fields (the resolution principle)

Every Data Reference has two faces:

| Face | Audience | Example |
|---|---|---|
| **Business concept** (primary) | The administrator in the Experience Builder | *Enrollment → Billing → Balance* |
| **Technical resolution** (hidden) | The runtime, and admins who explicitly expand "details" | `billing.balance` (current org's `field_definitions`) |

The Data Source Browser ([`07-data-source-browser.md`](./07-data-source-browser.md)) shows the business concept as the label and value. The technical resolution is available on demand for power users/debugging, but is **never** the primary surface. This is non-negotiable: *browsing data feels like navigating the business.*

## 6. Resolution semantics

A Data Reference resolves **in a context**: the current **subject** (the record the surface is about), the current **Viewpoint** (audience scope), the current **Perspective** (operating lens), and **system context** (user, time, org, location). Resolution rules:

1. **Org scoping always applies.** Every resolution is scoped by `org_id` (and site/department where relevant). No reference can cross tenant boundaries.
2. **Truth stays authoritative.** A reference is a *read* against the authoritative source (entity GET / record responder / OI / runtime). The Presentation Data Model never becomes the system of record. Queue/card values remain previews.
3. **Type is declared, not guessed.** A reference's Presentation Type is known before resolution, so the Experience Builder can validate bindings and offer compatible renderers without fetching data.
4. **Missing ≠ empty ≠ null.** Resolution distinguishes *not-yet-loaded*, *resolved-empty*, and *not-applicable*, preserving the reveal/empty-state doctrine (no false empties).
5. **Provenance travels with the value.** AI and computed values carry provenance/freshness/confidence so renderers can mark them.

## 7. What the model owns vs references

| The Presentation Data Model **owns** | The Presentation Data Model **references (never owns)** |
|---|---|
| The taxonomy of source kinds | Field definitions & validation (Canonical Data) |
| The shape of a Data Reference | Relationship edges & roles (Canonical Data) |
| Presentation Types and their compatibility | Metric math, dimensions, periods (Operational Intelligence) |
| Renderer contracts (accepted types) | Runtime/BP state computation (Status/State + BP systems) |
| The one condition grammar | AI generation (AI platform) |
| Resolution semantics (context, scoping, provenance) | Action definitions & permissions (Actions/Workflows) |

The model is a **describing and validating** layer. It defines *how to point at information and prove a renderer can draw it* — it does not define the information itself.

## 8. Why nine kinds and not one

A single opaque "Data Source" cannot:
- offer the right **browse path** (a field browses differently than a metric or a relationship),
- enforce the right **ownership boundary** (metric math is governed; a computed concat is not),
- carry the right **provenance** (AI needs confidence; canonical does not),
- expose the right **selection rules** (a to-many relationship needs first/primary/each),
- validate against the right **renderer contract**.

Naming the nine kinds (taxonomy doc) is what makes the Experience Builder *understand* information rather than treat it as an opaque string.

## 9. Invariants (the contract future products must honor)

1. Every presented value is a **Binding** of a typed **Data Reference** to a **Renderer**.
2. References are **business-named**; technical paths are secondary.
3. There are exactly **nine source kinds**; new products add *instances*, not new kinds.
4. **Renderers validate by Presentation Type**, never by source kind.
5. **Conditions and bindings draw from the same references** (one condition engine — [`06-condition-builder.md`](./06-condition-builder.md)).
6. **Metric definition (OI) and metric presentation (EB) stay separate** ([`04-analytics-architecture.md`](./04-analytics-architecture.md)).
7. **Org scoping and authority** are preserved at resolution; presentation never becomes truth.

## 10. Cross-references

| Concern | Doc |
|---|---|
| The nine source kinds | [`02-data-taxonomy.md`](./02-data-taxonomy.md) |
| Relationship traversal | [`03-relationship-architecture.md`](./03-relationship-architecture.md) |
| Metric definition vs presentation | [`04-analytics-architecture.md`](./04-analytics-architecture.md) |
| Renderer accepted types | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| One condition engine | [`06-condition-builder.md`](./06-condition-builder.md) |
| Browsing business concepts | [`07-data-source-browser.md`](./07-data-source-browser.md) |
| Ownership answers | [`08-architecture-recommendations.md`](./08-architecture-recommendations.md) |
| Primitives & composition axis | `docs/platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` |
