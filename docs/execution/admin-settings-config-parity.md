# Admin Settings — config parity (drawer, field groups, attention)

This note aligns **what Settings claims** with **what the product actually reads at runtime**. It complements per-feature docs (e.g. opportunity attention counts).

## Record drawer layout (source of truth)

- **Tables:** `record_drawer_layouts` (org overrides) and `record_layouts` (global templates).
- **Resolution chain (runtime / `GET /api/admin/record-layouts`):**
  1. If an active org row exists in **`record_drawer_layouts`** with `surface = drawer`, `key = default` (for that `entity_type`), its **`config_json`** is the effective layout — stored **inline** on that row (no join required for the admin API).
  2. Otherwise load active rows from **`record_layouts`** for the same `entity_type`; clients choose `key === "default"` or fall back to the first row (`useRecordChromeConfig`).
- **What drives the drawer body:** Effective **`config_json`** — `overview_section_order`, optional **`inquiry_drawer_mode`** / **`inquiry_workflow_sections`** (opportunity workflow v1), schedule **`layout_blocks`**, etc.

**Settings → Layouts** includes an **effective preview** (`GET /api/admin/record-layouts/effective-preview`) aligned with **`AdminEntityDrawer`** assembly.

### Safe drawer editing (Card 9, workflow v1 opportunity only)

- **Where:** Settings → Layouts → **Edit drawer section order** (shown only when effective layout has **`inquiry_drawer_mode: workflow_v1`**).
- **What changes:** **`overview_section_order`** on effective **`config_json`**, plus **`inquiry_workflow_sections` array reorder** so workflow virtual definitions follow the same global order (no arbitrary JSON; full permutation validated server-side).
- **Persistence:** **`record_drawer_layouts`** update when an org override exists; otherwise **INSERT** a new org row (surface `drawer`, key `default`, `entity_type = opportunity`) seeded from the effective global template + new order.
- **API:** `PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-order` (admin role). Body: `{ overview_section_order: string[] }` — must equal the canonical resolved section key list for that org (from `listOpportunityWorkflowV1CanonicalSectionKeys`).
- **Runtime parity:** After workflow v1 filters in **`AdminEntityDrawer`**, if **`overview_section_order`** is non-empty, **`applyOverviewSectionOrder`** runs on the final overview list. When **no** saved order exists, legacy behavior pins **`inquiry_children`** first; saved order disables that pin so operators control full ordering. The preview builder (`effectiveDrawerLayoutPreview.ts`) matches this.

### Workflow-generated vs static overview sections (opportunity)

- **Field-catalog sections:** Built from **`field_definitions`** grouped by **`section_key`**, with titles from **`field_section_definitions`** when present — same grouping the drawer uses for config-driven grids.
- **Workflow virtual sections:** When **`inquiry_drawer_mode === "workflow_v1"`**, **`inquiry_workflow_sections`** defines extra sections whose **`field_keys`** pull named fields out of that catalog (after header-field stripping). **`inquiry_tuition`** is an **injected** placeholder section for tuition/pricing chrome.
- **Injected system sections:** Examples include **`__unified_status`** (merged then removed under workflow v1 / `suppress_body_status`) and **`inquiry_children`**. Without **`overview_section_order`**, workflow v1 pins **`inquiry_children`** first; with a saved order, placement follows **`overview_section_order`**.

Job and schedule previews use a **presentation-ordered skeleton** (`entityPresentation` defaults + config ordering); full job/schedule merges (pricing blocks, canonical rows) still happen only in `AdminEntityDrawer`.

## Field grouping catalog (separate layer)

- **UI:** Settings → **Field grouping catalog** (route `/adminV2/settings/field-sections`; table **`field_section_definitions`** via admin field-sections API).
- **Purpose:** Labels and sort order for **`field_definitions.section_key`** — grouping fields in forms and config-driven grids.
- **Not equivalent to:** Runtime **drawer layout** structure or **workflow virtual** sections. Those come from effective **`record_drawer_layouts` / `record_layouts` `config_json`** as above. The catalog **feeds** field grouping used inside drawer sections but **does not** define drawer section order or `inquiry_workflow_sections`.

## Opportunity “Needs attention” (source of truth)

- **Settings → Attention & SLA Rules** (department-only editor today; deep-merge **`departments.metadata`**):
  - **Needs Attention types:** `needs_attention_buckets` — visibility, labels, order, and which **canonical reason codes** appear in each bucket (groupings only).
  - **Trigger criteria & thresholds:** supported knobs under **`metadata.opportunity_attention_rules`** — e.g. **`version: 1`** + **`thresholdsHours`** (lifecycle idle hours for stale/missing-quote paths), **`stale_high_value_days`**, **`stale_mid_funnel_days`**, **`sla_wait_hours`** (wait-bucket SLA), **`priority_score_weights`**, **`auxiliary_signals_enabled`**, **`reason_overrides`** (per-code enable/label/severity patches). UI explains each canonical reason, shows **department vs platform default** when a field is unset on the department row, and does **not** allow arbitrary rule expressions.
- **Evaluator:** `resolveOpportunityAttention` (canonical resolver **v2** in application code).
- **Tuning:** Full merge described in **`resolveOpportunityAttentionConfigFromMetadata`** (`web/lib/opportunities/opportunityAttentionConfig.ts`). Work-unit **`metadata`** still overrides department at runtime for the same keys — Settings does not edit work units yet.
- **Operational wait facet (per opportunity):** validated subtree **`metadata.enrollment_operational`** — updated via **`PATCH /api/admin/opportunities/:id`** body field **`enrollment_operational`** (`wait_bucket`, `wait_since`, `wait_reason`, `next_expected_action_owner`, `next_expected_action_at`). Not edited from Settings UI yet.
- **PATCH validation (transition):** Non-empty **`enrollment_operational`** bodies that fail sanitization are **not** applied; the API logs a **warning** (`[ADMIN_PATCH_OPPORTUNITY] enrollment_operational ignored after validation`). Long-term: optional strict mode / 400 responses — see sprint follow-ups.
- **Resolver outputs:** Per-reason **`sla_clock_confidence`** (`high` \| `medium` \| `low`) indicates how the SLA clock was derived (explicit `wait_since` vs fallbacks such as `updated_at`). This must eventually surface in explainability / debug tooling — do not treat as internal-only forever.
- **Architectural watch:** Stale and wait SLAs still partially depend on **`updated_at`**, which conflates meaningful engagement with incidental writes. Future foundation: canonical timestamps (e.g. last meaningful contact, last staff action, last operational transition) — not rushed in foundation phase; see sprint doc.
- **Counts across surfaces:** Different cohorts and caps (500 / 800 / 5000 windows, work-unit vs org scope). See `docs/execution/crm-opportunity-needs-attention-count-semantics.md`.

## Job “Needs attention”

Workspace job exception summaries use **job** predicates (`getNeedsAttentionSummary`, etc.) — separate from opportunity attention.

## Work unit & department `metadata` (read-only in Settings)

**AdminV2 → Settings → Work units / Departments:** opening **Edit** on a row shows **Runtime metadata (read-only)** — the effective JSON from the list API, grouped by known feature areas (`web/lib/admin/runtimeEntityMetadataCatalog.ts`). Most fields remain **visibility only**; **Attention & SLA Rules** PATCHes the **`opportunity_attention_rules`** subtree (buckets + supported thresholds/policies) into **`departments.metadata`** (deep-merged server-side).

- **Active runtime keys** (examples): `opportunity_attention_rules`, `activity_signal_rules`, **`enrollment_operational`** (on **opportunity** `metadata`) — consumed by attention resolver / queue paths and activity-signal APIs respectively.
- **Bootstrap / routing:** `tenant_slice` on departments (tenant bootstrap validation).
- **Internal / seed:** `placeholder`, `lifecycle_stage` (bootstrap) — not substitute for `status_definitions.metadata.lifecycle_stage` in CRM logic.
- **Unknown keys** still appear under **Other keys (not cataloged)**.

---

## Future work (out of scope for this doc)

- Drawer editing beyond **workflow v1 opportunity section order** (e.g. non-workflow opportunity, job/schedule parity editor, toggling **`overview_hidden_sections`** with validation, new workflow virtual definitions).
- Raw **`config_json`** or drag/drop builders without server-side validation.
- **Attention & SLA Rules:** work-unit override editing in UI; richer **`reason_overrides`** (label/severity) editors; optional **`primary_reason_priority_order`** picker **without** duplicating resolver logic.
