# Admin Settings — config parity (drawer, field sections, attention)

This note aligns **what Settings claims** with **what the product actually reads at runtime**. It complements per-feature docs (e.g. opportunity attention counts).

## Record drawer layout (source of truth)

- **Tables:** `record_drawer_layouts` (org overrides) and `record_layouts` (global templates).
- **Resolution chain (runtime / `GET /api/admin/record-layouts`):**
  1. If an active org row exists in **`record_drawer_layouts`** with `surface = drawer`, `key = default` (for that `entity_type`), its **`config_json`** is the effective layout — stored **inline** on that row (no join required for the admin API).
  2. Otherwise load active rows from **`record_layouts`** for the same `entity_type`; clients choose `key === "default"` or fall back to the first row (`useRecordChromeConfig`).
- **What drives the drawer body:** Effective **`config_json`** — `overview_section_order`, optional **`inquiry_drawer_mode`** / **`inquiry_workflow_sections`** (opportunity workflow v1), schedule **`layout_blocks`**, etc.

**Settings → Layouts** includes a **read-only effective preview** (Card 8): resolved section order and provenance via **`GET /api/admin/record-layouts/effective-preview`**. There is **no** layout JSON editor in Settings yet.

### Workflow-generated vs static overview sections (opportunity)

- **Field-catalog sections:** Built from **`field_definitions`** grouped by **`section_key`**, with titles from **`field_section_definitions`** when present — same grouping the drawer uses for config-driven grids.
- **Workflow virtual sections:** When **`inquiry_drawer_mode === "workflow_v1"`**, **`inquiry_workflow_sections`** defines extra sections whose **`field_keys`** pull named fields out of that catalog (after header-field stripping). **`inquiry_tuition`** is an **injected** placeholder section for tuition/pricing chrome.
- **Injected system sections:** Examples include **`__unified_status`** (merged then removed under workflow v1 / `suppress_body_status`) and **`inquiry_children`** (appended for existing opportunities; workflow v1 may pin it first).

Job and schedule previews use a **presentation-ordered skeleton** (`entityPresentation` defaults + config ordering); full job/schedule merges (pricing blocks, canonical rows) still happen only in `AdminEntityDrawer`.

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

## Work unit & department `metadata` (read-only in Settings)

**AdminV2 → Settings → Work units / Departments:** opening **Edit** on a row shows **Runtime metadata (read-only)** — the effective JSON from the list API, grouped by known feature areas (`web/lib/admin/runtimeEntityMetadataCatalog.ts`). This is **visibility only**; there is no metadata editor in Settings yet.

- **Active runtime keys** (examples): `opportunity_attention_rules`, `activity_signal_rules` — consumed by `resolveOpportunityAttentionConfigFromMetadata`, queue paths, and activity-signal APIs.
- **Bootstrap / routing:** `tenant_slice` on departments (tenant bootstrap validation).
- **Internal / seed:** `placeholder`, `lifecycle_stage` (bootstrap) — not substitute for `status_definitions.metadata.lifecycle_stage` in CRM logic.
- **Unknown keys** still appear under **Other keys (not cataloged)**.

---

## Future work (out of scope for this doc)

- Layout / drawer **editor** in Settings wired to `record_drawer_layouts` / `record_layouts`.
- **Attention & SLA Rules** screen wired to the same metadata or a dedicated config surface **without** duplicating resolver logic.
- Optional: unify naming so “Field sections” vs “drawer sections” is obvious in the nav.
