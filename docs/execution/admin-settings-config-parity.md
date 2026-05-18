# Admin Settings — config parity (drawer, field groups, attention)

This note aligns **what Settings claims** with **what the product actually reads at runtime**. It complements per-feature docs (e.g. opportunity attention counts).

**Settings hub:** `/adminV2/settings` — tiles use **Editable ·**, **Partial ·**, **Read-only ·**, or **Related hub ·** prefixes (see `web/lib/adminV2/settingsSurfaceModes.ts`).

**Sprint closeout (May 2026):** Shipped vs deferred lists — **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12. Regression tests — `web/tests/sprints/settingsRecordUxParityRegression.test.ts`.

## Configurable capability inventory (operator exposure)

| Configurable capability | Exists where | Currently exposed? | Recommended treatment |
|-------------------------|--------------|--------------------|------------------------|
| Field `is_required` + visibility flags | `field_definitions`; `/adminV2/settings/fields` | **Editable** | Shipped Card 2 |
| Field `requirement_policy` / `interaction_policy` | `field_definitions` columns; PATCH API | **Editable + enforced (opportunity/job enforceable)** | Shipped Cards 2–4 |
| Drawer field-policy write map (Card 1.5) | `drawerFieldPolicyAdapter.ts`; `_field_policy_resolved` on opportunity/job GET | **Active** | Shipped |
| Field grouping (`section_key` labels) | `field_section_definitions`; `/adminV2/settings/field-sections` | **Editable** | Keep |
| Drawer layout `config_json` | `record_drawer_layouts`, `record_layouts` | **Partial** — preview + opportunity workflow v1 order | Later: broader layout editor |
| Layout integrity validation | `GET /api/admin/config/layout-integrity` | **Editable visibility** — Settings → Layouts **Layout integrity** panel (manual run, read-only report with severity/category) | **Done (Card 6)** |
| Status transition rules | `status_transition_rules` table | **Read-only inventory** — `/adminV2/settings/status-transition-rules` | Developer/seed-managed for now |
| Action definitions / placements | `action_definitions`, `action_placements` | **Read-only inventory** — `/adminV2/settings/actions` (runtime executor column) | **Done (Card 5)**; access verified Card 7 |
| Legacy `record_actions` | `record_actions` table; drawer/queue | **Partially exposed** (runtime only) | **Keep** until dedicated migration card |
| Queue definitions | `work_units.queue_definition` | **Partial** — JSON editor on work units | Keep; validate via schema |
| Attention / SLA rules | `departments.metadata.opportunity_attention_rules` | **Editable** — `/adminV2/settings/attention-sla-rules` | Work-unit overrides: later card |
| Placement priority | `work_units.metadata.placement_priority_v1` | **Editable** — `/adminV2/settings/placement-priority` | Keep |
| Workspace KPI placements | org settings API | **Editable** — `/adminV2/settings/kpis` | Keep |
| Option sets | `option_sets` | **Editable** — `/adminV2/settings/option-sets` | Keep |
| Forms / packets | `form_definitions`, packet tables | **Related hub** — `/adminV2/forms` (not on Settings index before Card 1) | Cross-link only |
| Document field definitions | `document_field_definitions` | **Editable** — Settings tile | Keep |
| Communication bindings | `communication_provider_bindings` | **Editable** — `/adminV2/settings/communications` | Keep |
| Users / roles / access scope | `user_access_*`, RBAC APIs | **Editable** — `/adminV2/settings/users-roles` | Keep |
| Entity labels | entity label overrides API | **Editable** — `/adminV2/settings/entity-labels` | Keep |
| Tour availability | tour availability rules API | **Editable** — `/adminV2/settings/tours/availability` | Keep |
| Config proposals (Layout Assist) | `config_layout_assist_proposals` | **Partial** — review/limited apply | No AI expansion this sprint |
| Status definitions | `status_definitions` | **Editable** — `/adminV2/settings/statuses` | Keep |

## Drawer field-policy mapping (Card 1.5 / C0)

- **Adapter:** `resolveDrawerFieldPolicy` / `buildDrawerFieldPolicyResolvedMap` in `web/lib/fields/drawerFieldPolicyAdapter.ts`.
- **GET payload (opportunity + job only):** After `attachFieldDefinitionsAndValues`, entity responses include:
  - `_field_definitions[]` with `is_required`, `requirement_policy`, `interaction_policy` (raw, for future UI).
  - `_field_policy_resolved`: `Record<field_key, DrawerFieldPolicyResolved>` with `storage`, `bodyKey`, `policyMode`, `requirementSupported`, `interactionSupported`, `reason`.
- **Settings UI (Card 2):** Opportunity/job Fields hub shows Policy column; edit modal exposes requirement (optional / always required / required on save) and editability (editable / read-only) for **enforceable** fields only. Advanced JSON policies are read-only in UI.
- **`is_required` sync:** Optional → `is_required=false`; always required → `is_required=true`; required on save → `is_required=false` with `requirement_policy.mode=required_on_save`.
- **Enforcement (Card 3):** `PATCH /api/admin/opportunities/:id` and `PATCH /api/admin/jobs/:id` call `enforceDrawerFieldPoliciesOnPatch` before any DB write. Job `action_key` branches skip policy enforcement.
- **PATCH validation error contract (Card 4 will consume):**
  ```json
  { "error": "Field validation failed", "violations": [{ "field_key": "name", "code": "required", "message": "..." }] }
  ```
  Codes: `required`, `required_on_save`, `read_only`.
- **Scope:** Only `policyMode === enforceable` fields. Deferred/never categories unchanged (status, quote/pricing, FKs, tour fields, etc.).
- **Drawer feedback (Card 4):** `drawerSaveErrors.ts` parses PATCH 400 payloads; `fieldEditabilityInDrawer.ts` drives required/read-only display in `EntityDrawerOverview` for opportunity/job.

## Record drawer layout (source of truth)

- **Tables:** `record_drawer_layouts` (org overrides) and `record_layouts` (global templates).
- **Resolution chain (runtime / `GET /api/admin/record-layouts`):**
  1. If an active org row exists in **`record_drawer_layouts`** with `surface = drawer`, `key = default` (for that `entity_type`), its **`config_json`** is the effective layout — stored **inline** on that row (no join required for the admin API).
  2. Otherwise load active rows from **`record_layouts`** for the same `entity_type`; clients choose `key === "default"` or fall back to the first row (`useRecordChromeConfig`).
- **What drives the drawer body:** Effective **`config_json`** — `overview_section_order`, optional **`inquiry_drawer_mode`** / **`inquiry_workflow_sections`** (opportunity workflow v1), schedule **`layout_blocks`**, etc.

**Settings → Layouts** includes an **effective preview** (`GET /api/admin/record-layouts/effective-preview`) aligned with **`AdminEntityDrawer`** assembly, plus a **Layout integrity** panel (`LayoutIntegrityReportPanel`, `GET /api/admin/config/layout-integrity`) — on-demand read-only diagnostics: field registry vs layout visibility, write paths, sections, and layout ordering. Presentation helpers: `layoutIntegrityPresentation.ts`. Does not mutate config; operators fix via Fields, Field grouping, and Layouts section-order editor (Card 9).

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

## Action surface runtime inventory (Card 5)

Dual systems remain intentional: **`action_definitions` + `action_placements`** (registry) and **`record_actions`** (legacy chrome), plus hardcoded enrollment queue lanes and dedicated modals (tour, quote intake, job `JOB_ACTIONS`). Card 5 improved **feedback and refresh** only — see `web/lib/admin/actions/actionSurfaceFeedback.ts`.

| Surface | Primary UI | Source | Executor path | Refresh after success | Migration |
|---------|------------|--------|---------------|----------------------|-----------|
| Opportunity drawer header | `AdminEntityDrawer` | Registry `record_header` | `applyRegistryResolvedActionClient` / `POST …/actions/execute` | `adminv2:opportunity-updated` → refetch header actions | **Keep** registry; legacy `record_actions` header chrome not rendered when registry has placements |
| Opportunity drawer sections | `OpportunityRecordSectionRegistryActions` | Registry `record_section` | Same client helper | `adminv2:opportunity-updated` on mutating success (Card 5) | **Keep**; dedup via `excludeActionKeys` vs header |
| Inquiry children section header | `OpportunityInquiryChildrenRegistryActions` | Registry `inquiry_children` | Same | Same event on mutating success | **Keep** |
| Opportunity quote intake | `OpportunityQuoteIntakeSection` | Dedicated | PATCH opportunity (quote workflow) | `refetch` + refresh | **Do not migrate** in Card 5 |
| Tour schedule / lifecycle | Tour modals + drawer sections | Dedicated | Tour booking APIs + legacy submit | `adminv2:opportunity-updated` | **Do not migrate** |
| Registry form modals | `AdminEntityDrawer` `actionFormState` | Registry `open_form` | `POST …/actions/execute` with payload | Event + refetch | **Keep** dedicated modal UX |
| Job drawer primary | `JobDrawerV2PrimaryActions` | `record_actions` + hardcoded | Scroll/modals; `PATCH jobs` `{ action }` for `JOB_ACTIONS` | `refetch` | **Do not replace** `JOB_ACTIONS` |
| Schedule drawer header | `AdminEntityDrawer` | `record_actions` + hardcoded | Local reschedule/cancel UI | Local state | **Later** |
| Work unit queue row | `work-unit/.../page.tsx` | Registry `queue_row` when loaded; else hardcoded lane VM | Registry client / legacy `executeOpportunityRecordAction` → PATCH opp | `invalidate` (registry); legacy silent success | **Later** migrate lane keys; Card 5 surfaces errors |
| Right rail (enrollment) | Dept / work-unit workspace | Registry `right_rail` + hardcoded nav blocks | `applyRegistryResolvedActionClient` | Partial feedback | **Keep** mixed |
| Settings → Actions | `/adminV2/settings/actions` | Inventory API | N/A (read-only) | N/A | **Later** editor |

## Access verification (Card 7)

Sprint Cards 1–6 were audited for access boundaries. **No missing server gates found**; no ops mutate expansion.

| Route / path | Auth | Mutation gate | CRM scope | Notes |
|--------------|------|---------------|-----------|--------|
| `GET/PATCH /api/admin/field-definitions` | `getAdminContextCached` | PATCH/POST: **`admin` only** | Org `org_id` on rows | Org-wide field catalog — not dept-scoped per field row |
| `GET /api/admin/config/layout-integrity` | `getAdminContextCached` | Read-only | Org fields/layouts query | Card 6 panel |
| `GET /api/admin/actions`, inventory | `requireAdminOrOps` | Read-only | Resolver uses org + hints | |
| `POST /api/admin/actions/execute` | `requireAdminOrOps` | `executeAdminAction` | **`accessScope`** on entity | Card 5 feedback is client-only |
| `PATCH /api/admin/opportunities/:id` | Auth + admin context | Scope **then** `enforceDrawerFieldPoliciesOnPatch` | `assertExistingOpportunityMutableInAdminScope` | Legacy queue PATCH uses same route |
| `PATCH /api/admin/jobs/:id` | Auth + admin context | Scope **then** policy (non-`JOB_ACTIONS` body) | `assertJobInAccessScope` | `JOB_ACTIONS` branches unchanged |
| Record layouts / workflow order | `getAdminContextCached` | Order PATCH: admin | Org | |

**Tests:** `web/tests/admin/settingsRecordUxParityAccess.test.ts` — PATCH order, portal `canMutate`, execute scope wiring.

**Deferred:** Ops drawer mutate — see `docs/system/roles-and-permissions.md` § Ops drawer mutate.

### BOS / configuration-agent readiness (note only)

Future **BOS** or configuration agents need action and settings surfaces to stay **structured, queryable, and truthfully classified** (surface, executor, migration stance). Card 5 adds inventory docs and Settings **runtime executor** labels; it does **not** implement agent behavior or expand the apply catalog.

---

## Future work (out of scope for this doc)

- Drawer editing beyond **workflow v1 opportunity section order** (e.g. non-workflow opportunity, job/schedule parity editor, toggling **`overview_hidden_sections`** with validation, new workflow virtual definitions).
- Raw **`config_json`** or drag/drop builders without server-side validation.
- **Attention & SLA Rules:** work-unit override editing in UI; richer **`reason_overrides`** (label/severity) editors; optional **`primary_reason_priority_order`** picker **without** duplicating resolver logic.
