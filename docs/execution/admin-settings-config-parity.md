# Admin Settings — config parity (drawer, field sections, attention)

This note aligns **what Settings claims** with **what the product actually reads at runtime**. It complements per-feature docs (e.g. opportunity attention counts).

## Record drawer layout (source of truth)

- **Tables:** `record_drawer_layouts` → `record_layouts`.
- **Resolution:** The admin API (`GET` record layouts) prefers an **org-scoped** row in `record_drawer_layouts` (surface `drawer`, key such as `default`) that points at a `record_layouts` row; otherwise it falls back to global templates in `record_layouts`.
- **What drives the UI:** The selected row’s **`record_layouts.config_json`** — structure, sections, overview rows, and (for opportunities) workflow-oriented blocks such as **`inquiry_workflow_sections`** where present.

**Settings → Layouts** in AdminV2 is a **read-only navigation hub**; there is **no** layout JSON editor there yet.

## Field sections (separate layer)

- **Table / API:** Field sections are a **catalog** keyed by entity type (`field_sections` / admin field-sections API).
- **Purpose:** Labels and sort order for **`field_definitions.section_key`** — grouping fields in forms and many list/detail surfaces.
- **Not equivalent to:** The full **drawer shell** or **workflow v1 inquiry** section tree. Those come from **`record_layouts.config_json`** as above. Field sections **complement** layouts; they do **not** fully control workflow v1 drawer structure by themselves.

## Opportunity “Needs attention” (source of truth)

- **Not** controlled by **Settings → Attention & SLA Rules** (that UI is **not active** / planned).
- **Evaluator:** `resolveOpportunityAttention` (canonical resolver in application code).
- **Tuning:** `resolveOpportunityAttentionConfigFromMetadata` — typically `opportunity_attention_rules` inside **work unit** or **department** `metadata`.
- **Counts across surfaces:** Different cohorts and caps (500 / 800 / 5000 windows, work-unit vs org scope). See `docs/execution/crm-opportunity-needs-attention-count-semantics.md`.

## Job “Needs attention”

Workspace job exception summaries use **job** predicates (`getNeedsAttentionSummary`, etc.) — separate from opportunity attention.

---

## Future work (out of scope for this doc)

- Layout / drawer **editor** in Settings wired to `record_drawer_layouts` / `record_layouts`.
- **Attention & SLA Rules** screen wired to the same metadata or a dedicated config surface **without** duplicating resolver logic.
- Optional: unify naming so “Field sections” vs “drawer sections” is obvious in the nav.
