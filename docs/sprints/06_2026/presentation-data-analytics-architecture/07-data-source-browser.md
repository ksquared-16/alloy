# Data Source Browser — Information Architecture

**Path:** `docs/sprints/06_2026/presentation-data-analytics-architecture/07-data-source-browser.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 4 — Data Source browser (IA)

---

## 1. Purpose

The Data Source Browser is the single surface for picking **what information** a slot, condition operand, collection column, or metric placement points at. It is used **everywhere** a Data Reference is chosen — bindings and conditions alike. Its job is to make selecting information feel like **navigating the business**, never navigating tables.

## 2. The top level: business areas, not source kinds

The administrator does not start by choosing "Canonical vs Relationship vs Metric." They start with **business-framed areas** that map onto the nine source kinds:

| Browser area (what the admin sees) | Maps to source kind(s) | Example first drill |
|---|---|---|
| **This Record** | Canonical (1) | Enrollment → Billing → Balance |
| **Related** | Relationship (2) | Enrollment → Primary Contact → Email |
| **Lists** | Collection (3) | Enrollment → Children |
| **Metrics** | Metric (4) — OI | OI → Enrollment → Projected Tuition |
| **State** | State (5) | Readiness · Current Stage · Assignee |
| **AI** | AI (6) | Summary · Suggested Next Step |
| **Actions** | Action (7) | Schedule Tour · Send Agreement |
| **Computed** | Computed (8) | Days since inquiry |
| **System** | System (9) | Current User · Today · Active Viewpoint |

The source kind is **inferred from where you browse**, so the taxonomy powers the IA without the administrator needing to learn it.

## 3. The drill model (progressive, three-pane)

```
┌──────────────┬───────────────────────────┬──────────────────────────┐
│  AREA         │  PATH (drill)              │  LEAF DETAIL              │
│  This Record  │  Billing ▸                 │  ● Balance                │
│  Related      │   • Balance                │  Type: Money              │
│  Lists        │   • Next Invoice           │  Example: $1,234.00       │
│  Metrics      │   • Autopay                │  Yields: scalar           │
│  State        │  Contact ▸                 │  Compatible renderers:    │
│  AI           │  Schedule ▸                │   Currency · Number ·     │
│  Actions      │                            │   Gauge · Scorecard       │
│  System       │                            │  details: billing.balance │
└──────────────┴───────────────────────────┴──────────────────────────┘
```

- **Column 1 — Area:** the nine business areas (§2).
- **Column 2 — Path:** drill by Category → Field, Relationship role → …, OI domain → Metric, etc. Breadcrumbs show the business path (*Enrollment ▸ Primary Contact ▸ …*).
- **Column 3 — Leaf detail:** the business name, the **Presentation Type**, an example value, and the **compatible renderers** (from contracts). The technical resolution (`billing.balance`) appears here as a small, secondary "details" line — never the headline.

## 4. Per-area drill specifics

| Area | Drill | Special UI |
|---|---|---|
| **This Record** | Category → Field | grouped by business category, not column order |
| **Related** | Relationship role → (Field \| Relationship \| List) | hop breadcrumb; cardinality icon (1 vs ∞); for to-many→scalar, a **selection rule** chooser (first/primary/each/aggregate) |
| **Lists** | Collection → (item template) | shows item entity type; opens per-item slot template |
| **Metrics** | OI domain → Metric → presentation profile | shows definition summary (read-only) + period/dimension/comparison menus the definition exposes |
| **State** | subtype (Record / BP / Work) → concept | marks BP-owned/read-only |
| **AI** | output type → concept | shows provenance/freshness note |
| **Actions** | action class → action | shows availability condition entry |
| **Computed** | expression builder (picker-driven) | composes from other references; flagged ungoverned |
| **System** | concept | parameters for conditions |

## 5. Search and assist

- **Search** spans business concepts across areas ("email" finds *Primary Contact → Email*, *Assigned Employee → Email*) — ranked by relevance to the current surface's entity.
- **Common for this card type** — the Card Type suggests its typical references first (a Billing card surfaces Balance, Next Invoice, Autopay).
- **Recently used** — per admin, per surface.
- **Type filter** — optionally filter to references compatible with an already-chosen renderer (the inverse of the renderer picker).

## 6. Leaf detail always shows the type and compatibility

Because every reference declares a Presentation Type, the leaf panel can always show:
1. **Business name** (headline)
2. **Presentation Type** (e.g., `Money`)
3. **Example value** (resolved against a sample record)
4. **Compatible renderers** (from [`05-renderer-contracts.md`](./05-renderer-contracts.md))
5. **Details** (technical resolution, collapsed) — for power users/debugging only

This means the admin learns *what they'll get* and *how they can show it* before binding — no trial and error.

## 7. The Browser is shared (the unification)

The exact same Browser component serves:

- **Slot binding** (Content Mode) — pick a reference, then a renderer.
- **Condition operands** ([`06-condition-builder.md`](./06-condition-builder.md)) — pick the left (and optionally right) reference.
- **Collection columns** — pick each per-item reference.
- **Metric placement** — pick a metric + presentation profile.

One Browser, one mental model, everywhere a reference is chosen. This is the IA expression of "one Presentation Data architecture."

## 8. Authority & scoping in the Browser

- Only references the admin is **permitted** to bind appear (permission-aware).
- Org/site scoping is implicit — the Browser only shows the current tenant's concepts.
- Deprecated metrics/fields are shown with a warning and blocked from new bindings where appropriate.

## 9. What the Browser must not do

- Must not show tables, columns, joins, or foreign keys as primary labels.
- Must not present source kinds as the entry taxonomy (areas are business-framed).
- Must not allow a binding without a resolvable Presentation Type.
- Must not differ between bindings and conditions — it is one Browser.

## 10. Cross-references

| Concern | Doc |
|---|---|
| References & types | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md) |
| The nine areas ↔ kinds | [`02-data-taxonomy.md`](./02-data-taxonomy.md) |
| Relationship drill & selection rule | [`03-relationship-architecture.md`](./03-relationship-architecture.md) |
| Metric presentation profile | [`04-analytics-architecture.md`](./04-analytics-architecture.md) |
| Compatible renderers | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
