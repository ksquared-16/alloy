# Renderer Contracts

**Path:** `docs/sprints/archive/06_2026/presentation-data-analytics-architecture/05-renderer-contracts.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 6 — Renderer contracts

---

## 1. What a renderer contract is

A **renderer contract** is the declaration of what a renderer can draw. It is the validation currency between the Presentation Data Model and the Presentation Runtime. Because renderers validate by **Presentation Type** (not source kind), one contract works for canonical fields, metrics, computed values, and relationships alike.

A contract declares four things:

| Part | Meaning |
|---|---|
| **Accepts** | The set of Presentation Types the renderer can draw |
| **Requires** | Shape constraints beyond the type (e.g., "Metric with ≥1 time dimension") |
| **Options** | Typed, platform-owned semantic options (never font/color) |
| **Provenance** | Whether/how it surfaces provenance (AI, metric version, freshness) |

## 2. The Presentation Type vocabulary

The closed set of shapes references resolve to and renderers accept:

`Text` · `Number` · `Money` · `Percentage` · `Score` · `Duration` · `Date` · `DateTime` · `Boolean` · `Status` · `Entity` · `Collection<T>` · `Metric` · `Action` · `Narrative` (AI prose) · `Image` · `File` · `Signature` · `Geo`

Plus **projections**: a `Metric` projects to its scalar (`Metric→Money`, `Metric→Percentage`, `Metric→Score`), so scalar renderers can accept metrics without special-casing.

## 3. The contract catalog (representative, not exhaustive)

Grouped to match the renderer catalog from the Presentation Runtime sprint.

### Text & identity
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Text** | Text, Number, Date, Status (as label) | — | truncation, emphasis (semantic) |
| **Avatar + Name** | Entity (Person/Child/Employee) | Entity with name+image refs | size, secondary line |
| **Link / Record Chip** | Entity | Entity with title ref | open behavior (drill/expand) |

### Status & state
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Status Pill** | Status, Boolean | — | tone mapping (from status system) |
| **Readiness** | Status, Score | derived-state ref | show reasons |
| **Badge** | Boolean, Count, Status | — | condition-driven (see conditions) |

### Numbers & money
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Currency** | Money, Number, **Metric→Money** | — | show cents, sign display |
| **Number** | Number, Percentage, **Metric→Number** | — | precision, unit |
| **Gauge** | Percentage, Score, **Metric→Percentage/Score** | bounded 0..max | bands display |
| **Scorecard** | Number, Money, **Metric** | — | comparison display |

### Time
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Date** | Date, DateTime | — | format, relative ("2d ago"), show time |
| **Duration** | Duration | — | unit granularity |

### Collections
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Table** | Collection\<Entity\> | per-item slot template | columns (each a binding), sort |
| **List** | Collection\<T\> | per-item template | primary/secondary line bindings |
| **Timeline** | Collection\<Event/Activity\> | items with a Date ref | grouping, density |
| **Relationship Card** | Entity, Collection\<Entity\> | — | summary line bindings, expand |

### Analytics
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **KPI Card** | Metric, Number, Money, Percentage | — | comparison display, band coloring |
| **Trend / Sparkline** | Metric | time dimension | range, baseline |
| **Chart** (bar/line/area) | Metric | ≥1 dimension or time series | dimension, stacking |
| **Donut / Breakdown** | Metric | categorical dimension | top-N, legend |

### Documents & media
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Document Viewer** | File | — | inline/expand |
| **Image / Photo** | Image | — | crop, size |
| **Signature** | Signature | — | required state |
| **QR / Barcode** | Text | encodable value | symbology |

### Actions
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **Action Button** | Action | — | style (primary/quick), confirm |
| **Action Menu** | Collection\<Action\> | — | grouping |

### AI
| Renderer | Accepts | Requires | Key options |
|---|---|---|---|
| **AI Summary** | Narrative | provenance present | length, regenerate affordance |
| **Suggestion** | Narrative, Action | provenance present | accept/dismiss |
| **Risk Score** | Score | provenance present | bands display |

## 4. Validation rules

1. **Bind is valid iff** reference Presentation Type ∈ renderer `Accepts` **and** all `Requires` constraints hold.
2. **Incompatible pairings are prevented**, not errored after the fact — the renderer picker greys incompatible renderers and states why ("needs a Metric with a time dimension").
3. **Compatible alternatives are suggested** — choosing a renderer whose type doesn't match the bound reference offers the nearest valid renderer instead of failing.
4. **Projections are automatic** — a `Metric→Money` satisfies a `Money`-accepting renderer without manual conversion.
5. **Provenance-requiring renderers** (AI) refuse references that don't carry provenance.

## 5. Collection contracts and per-item templates

Collection renderers are special: they accept `Collection<T>` and declare a **per-item slot template** — each column/line is itself a Binding over the *item's* references.

```
Table( Collection<Child> ) {
  column 1: Child → Name        (Text)        → Text renderer
  column 2: Child → Current Room (Text)        → Text renderer
  column 3: Child → Status       (Status)      → Status Pill
}
```

This means the **same** binding machinery composes inside collections — a collection is just a surface-within-a-slot. Per-item templates honor the same renderer contracts recursively.

## 6. Options are semantic, never cosmetic

Contract `Options` are **typed semantic choices** (show cents, relative date, comparison display, top-N). They are **never** font size, color, spacing, or pixel values — those are platform-owned typography/visual tiers. This keeps "published == editing" honest and prevents the renderer picker from becoming a style editor.

## 7. Contracts are how the model and runtime stay decoupled

- The **Presentation Data Model** guarantees a reference's Presentation Type.
- The **Renderer** guarantees what types it accepts.
- The **contract** is the only thing that needs to match.

Neither side needs to know the other's internals. Adding a new renderer (future product) means declaring a contract; adding a new source kind instance means declaring its Presentation Type. The pipeline absorbs both with no new configuration model.

## 8. Cross-references

| Concern | Doc |
|---|---|
| Presentation Types & Binding | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) §2 |
| `Metric` shape | [`04-analytics-architecture.md`](./04-analytics-architecture.md) §4 |
| Renderer picker UX | [`07-data-source-browser.md`](./07-data-source-browser.md) + mockup `06-renderer-picker-contracts` |
| Renderer catalog (groups) | `docs/platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` |
