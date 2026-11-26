---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Configuration system

## Purpose

Define what **configuration** is allowed to control vs what must remain **platform-owned** logic — preventing “JSON became the codebase” failures.

## Control plane vs runtime

| Layer | Role |
|-------|------|
| **Settings (control plane)** | Structure, presentation, and **policies** operators may change through validated admin APIs: field registry, catalog section labels, drawer layout composition, action placement rows, department attention metadata, queue definitions, etc. |
| **Runtime (operational)** | Business logic and side effects: entity PATCH, `executeAdminAction`, `executeWorkflowRun`, dedicated tour/quote/job flows, status transitions. |
| **Integrity / diagnostics** | Read-only checks (e.g. layout integrity) that config matches enforceable write paths — not a second config store. |

**Principles:** No second source of truth; no builder-only hidden config; no AI-only config model. **Alloy OS Configuration Runtime** design alignment (Settings IA, ownership copy, sprint dependencies): **`docs/system/configuration-runtime-design-alignment.md`**. **BOS config capabilities** use the same structured PATCH helpers and tables as human operators (see **BOS readiness** below; doctrine **`docs/product/bos-foundation.md`**).

## Four-plane operator model (Records settings)

Settings hub: **`/admin`** (canonical) — rewrites to `app/adminV2/settings`. Product hrefs must use **`/admin/settings/…`**, not `/adminV2/settings/…`. Tiles use **Editable ·**, **Partial ·**, **Read-only ·**, or **Related hub ·** (`web/lib/adminV2/settingsSurfaceModes.ts`). **Settings V2 domain organization and Business Processes reference patterns:** **`docs/system/settings-v2-doctrine.md`**. Sprint baselines: **`docs/sprints/archive/05_2026/settings_record_ux_parity_sprint.md`** §12–§13; **May 2026 control plane closeout:** **`docs/sprints/archive/05_2026/completed/settings_control_plane_closeout.md`** (Layouts composition, Action buttons, Status vs Automations).

| Plane | Route (canonical) | Owns | Does **not** own |
|-------|-------------------|------|------------------|
| **Fields** | `/admin/settings/fields` | **Data structure:** labels, help text, field types, option sets, catalog `section_key` / `sort_order`, visibility flags (drawer/form/table) | Drawer section order; **primary** Required/editability for opportunity/job drawers (see Layouts); button placement |
| **Field grouping** | `/admin/settings/field-sections` | Catalog taxonomy (`field_section_definitions`) | Workflow virtual section titles |
| **Layouts** | `/admin/settings/layouts` | Drawer composition: section order, show/hide, workflow virtual titles; **field order/placement** (`batch-placement`); **per-field drawer behavior** on opportunity workflow v1 (`field_placements_v1` — Required on this layout, Editability here); **queue record row layout** (`metadata.queue_record_layout` v3 — columns, fields, widgets, display modes, link targets, repeated related `maxItems`); effective preview; deep-link to Action buttons per section | Field registry labels/types; button ownership; status labels/transitions; raw `config_json` as primary UX. **Queue row renderer contract:** **`docs/system/queue-record-doctrine.md`** |
| **Actions** | `/admin/settings/actions` (**Workflows & automation** on Settings index) | **Create** org placement from approved catalog; **edit** org placements (enabled, record type, surface, slot, section key, order); org-owned definition label; built-in → **Add org placement** | New execution handlers; `executeAdminAction` semantics; `condition_config`; arbitrary custom actions |
| **Automations** | `/admin/workflows` | Workflow definitions, execution semantics | Placement rows |
| **Forms** | `/admin/forms` | Definitions, versions, packets | Action `payload_schema` in Settings (today) |
| **Lifecycle hub** | `/admin/settings/lifecycle` | Lifecycle catalog, activation, work-unit bindings | Runtime reveal gates |

Related Settings surfaces (same family): statuses, attention/SLA metadata, queue definitions, communications bindings, users/roles, option sets, KPI placements, etc.

### Next strategic layers (deferred)

Record Experience Builder; BOS/AI config layer (structured PATCH only); **multi-hop** linked-record PATCH fanout; structured `condition_config` builders; workflow-driven actions/forms wiring from Settings.

### Admin Settings capability inventory

| Capability | Exposure | Notes |
|------------|----------|-------|
| Field registry (structure + visibility) | **Editable** | Labels, help, types, option sets, visibility; opportunity/job **not** primary Required/editability in Fields UI (Card 6) |
| Layout field behavior (opportunity workflow v1) | **Editable** | `field_placements_v1` via `PATCH …/opportunity-workflow-v1-field-placements`; does not write `field_definitions` policies (G2/G3) |
| Field grouping | **Editable** | `field_section_definitions` |
| Drawer layout (workflow v1) | **Editable** | Reorder, show/hide, rename workflow virtuals; **Show hidden section** |
| Layout integrity | **Read-only report** | Settings → Layouts panel; `GET /api/admin/config/layout-integrity` |
| Action placements (org) | **Editable V1** | `POST /api/admin/action-placements`, `PATCH …/[id]` (incl. `entity_type`); catalog `GET /api/admin/actions/definition-catalog`; operator copy `actionPlacementPresentation.ts`; surfaces: record header, record section, workspace side panel (`right_rail`), workspace queue row (`queue_row`) |
| Workflow automation rules | **Read-only** | `status_transition_rules` — status changes driven by workflow conditions; labels on **Statuses** |
| Attention & SLA | **Editable** | Department `metadata.opportunity_attention_rules` |
| Legacy `record_actions` | **Runtime only** | Coexists with registry; migration deferred |
| Forms / packets | **Related hub** | `/admin/forms` |

### Layout composition mutation classes (Record Experience Builder Phase 1)

Human operators and BOS **`config_layout_assist`** use the same admin APIs — no parallel AI storage:

| Class | Store | Settings entry |
|-------|--------|----------------|
| **A — Drawer chrome** | `record_drawer_layouts.config_json` | `PATCH …/opportunity-workflow-v1-sections` |
| **B — Field placement (catalog)** | `field_definitions.section_key`, `sort_order` | `PATCH …/field-definitions/batch-placement` |
| **B2 — Layout surface behavior** | `record_drawer_layouts.config_json.field_placements_v1` | `PATCH …/opportunity-workflow-v1-field-placements` |
| **C — Catalog section** | `field_section_definitions` | `POST/PATCH …/field-sections` |
| **C — Actions** | `action_placements` | **Owned by Actions hub**; Layouts deep-links only | `/admin/settings/actions` |

Capability gates: `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts` (`primaryBosCapability: config_layout_assist`).

### Fields vs layouts — structure vs surface behavior

- **Fields (`field_definitions`)** define the **registry**: `field_key`, `field_type`, label, help, option set binding, catalog section/sort, visibility flags. For opportunity/job, `requirement_policy`, `interaction_policy`, and legacy **`is_required`** remain on the row as **defaults and API compatibility** — they are **not** the primary operator control for drawer requiredness in v1 (Settings → Fields de-emphasizes those controls; see sprint **`docs/sprints/archive/05_2026/layout_field_behavior_semantics_v1.md`**).
- **Layouts (`record_drawer_layouts.config_json`)** define **how fields behave on record surfaces** for opportunity workflow v1: which sections appear, field order, and **`field_placements_v1`** overrides for Required / editability on **`drawer_overview`**.

### `field_placements_v1` (opportunity workflow v1)

- **Location:** `record_drawer_layouts.config_json.field_placements_v1` (array of placement rows keyed by `field_key`).
- **Surface:** `surfaces.drawer_overview.requirement` and `surfaces.drawer_overview.interaction` (policy v1 objects; same shape as `field_definitions` policies).
- **Write API:** `PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements` — merges presets into layout JSON only; **does not** PATCH `field_definitions` (G2). **G3:** no sync to `field_definitions.is_required`.
- **Read for Settings:** `GET /api/admin/record-layouts/effective-preview?entity_type=opportunity` includes `field_placements_v1` for Layouts field rows.

### Effective behavior precedence (drawer_overview)

1. Valid placement override for `field_key`
2. `field_definitions` requirement/interaction (or legacy `is_required` → policy)
3. System preset caps from `drawerFieldPolicyAdapter` (enforceable vs deferred vs never_policy_controlled)

Runtime: `resolveEffectiveFieldBehavior` + `buildDrawerFieldPolicyResolvedMap(..., { layoutConfig })` for opportunity paths. Job entity GET/PATCH uses definition-only maps in v1.

### Drawer layout and field policy (source of truth)

- **Tables:** `record_drawer_layouts` (org), `record_layouts` (templates). Effective `config_json` drives drawer body; opportunity workflow v1 uses `overview_section_order`, `overview_hidden_sections`, `inquiry_workflow_sections`, and optional **`field_placements_v1`**.
- **Section body layout:** Default sections use the fields grid (`EntityDrawerSection` → `grid-cols-1` / optional two-column). Custom React bodies (e.g. **`inquiry_children`**) may set **`contentLayout: "block"`** on `EntityDrawerSectionConfig` (`entityPresentation.ts`, `effectiveDrawerLayoutPreview.ts`, `AdminEntityDrawer` injection) so wide row layouts are not forced into a single column.
- **Settings APIs:** `PATCH …/opportunity-workflow-v1-sections`, `…/opportunity-workflow-v1-order`, `…/opportunity-workflow-v1-field-placements`; helpers `opportunityWorkflowV1SectionConfig.ts`, `opportunityWorkflowV1FieldPlacements.ts`, `persistOpportunityDrawerLayoutConfig`.
- **Field policy (runtime):** `drawerFieldPolicyAdapter.ts` → placement-aware **`_field_policy_resolved`** on opportunity GET; **`enforceDrawerFieldPoliciesOnPatch`** on opportunity PATCH (layout-aware) and job PATCH (definition-only). Violation contract: `{ error: "Field validation failed", violations: [...] }`. See **`docs/archive/2026-06-superseded-system/record-system.md`**.
- **Layouts composition (opportunity workflow v1):** Sections list = effective drawer composition (`mergeExplicitCatalogSectionsInDrawerLayout` in `effectiveDrawerLayoutPreview.ts`) — not all catalog taxonomy rows. Field picker uses `layoutFieldPickerEligibility.ts` (drawer-visible fields). Section detail: field order + **layout behavior** controls (`LayoutSectionFieldsPanel`, `layoutFieldBehaviorUi.ts`).
- **Action placement V1:** `actionPlacementMutation.ts`, `actionPlacementPresentation.ts`, `actionButtonCreateUi.ts`; `GET /api/admin/actions/inventory`, `GET /api/admin/actions/definition-catalog`, `POST /api/admin/action-placements`, `PATCH /api/admin/action-placements/[id]` (org rows: `is_active`, `entity_type`, `surface`, `slot`, `section_key`, `order_index`), `PATCH /api/admin/action-definitions/[id]` (org-owned label only). UI: `ActionPlacementsSettingsClient.tsx`, `ActionButtonCreatePanel.tsx`. **`surface=workspace`** in DB is valid but AdminV2 does not resolve it yet — use `right_rail` or `queue_row` for workspace. Full contract: **`docs/archive/2026-06-superseded-system/actions-and-workflows.md`**.

### Attention & SLA (Settings)

**Settings → Attention & SLA Rules** PATCHes `departments.metadata.opportunity_attention_rules` (buckets + supported thresholds). Evaluator: `resolveOpportunityAttention`. Count semantics across workspace surfaces: **`docs/archive/2026-06-superseded-system/workspace-system.md`** § Needs attention count semantics.

### BOS / configuration-agent readiness

| Domain | Structured entry points |
|--------|-------------------------|
| Fields | `PATCH /api/admin/field-definitions/:id`; `fieldSettingsOperatorUi.ts`, `drawerFieldPolicyAdapter.ts` |
| Layouts | Opportunity workflow v1 PATCH routes; `opportunityWorkflowV1SectionConfig.ts`; composition capabilities `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts`; field batch placement `PATCH /api/admin/field-definitions/batch-placement` |
| Actions | `actionPlacementMutation.ts`, `actionPlacementPresentation.ts`; `GET …/definition-catalog`; placement POST/PATCH; definition label PATCH (org-owned) |
| Integrity | `GET /api/admin/config/layout-integrity`; effective-preview `editor_sections` |
| Proposals | `config_layout_assist_proposals` — apply catalog expansion **paused** |

Do **not** train agents on raw `config_json` or React-only state as source of truth.

## Current state

Config surfaces include (non-exhaustive):

- **Communications provider bindings** — **`communication_provider_bindings`** edited via **`/organization/communications`** and **`/api/admin/communications/bindings`** (safe fields only on PATCH; no secrets in GET). Binds canonical send paths to Twilio/Resend config; full tenant **self-serve** DNS/SPF/DKIM wizards are **not** V1 (see **`docs/product/communications.md`**).
- **Forms definitions** — **`form_definitions`** + **`form_definition_versions`** (draft/published/archived), **`form_public_links`**, driven via **`/api/admin/forms/**`** and **`/admin/forms`**. **Partially implemented** for full enrollment product scope — see **`docs/product/documents-and-forms.md`**.
- **Users & Roles (CRM settings)** — Tables **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`** hold **data visibility** per `(user_id, org_id)` (`department_scope` / `site_scope` plus optional allow lists). **Capabilities** stay on **`user_roles`** and **`role_definitions`** / **`role_permission_grants`**. Canonical sites are **`locations`** rows with **`location_type = 'site'`**. Runtime enforcement resolves scope via **`getAdminAccessContextCached`** + helpers in **`web/lib/admin/accessScope.ts`** on entity reads, queue builders, actions, and **direct admin mutators** touching jobs, schedules, opportunities, work units, etc. (out-of-scope targets → **404**). Capability vs visibility split: **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`**. **Admin settings UI:** **`/admin/settings/users-roles`** (two tabs: Users, Roles). Legacy **`/admin/settings/user-access`** redirects there. **APIs:** **`GET /api/admin/settings/users-roles/members`** (enriched member list for managers); **`GET` / `PATCH /api/admin/users/[userId]/access-scope`**, **`PATCH /api/admin/users/[userId]/role`**, **`POST /api/admin/users`**, **`POST /api/admin/users/[userId]/remove`**, RBAC **`/api/admin/rbac/*`** mutations — all require org **`admin`** role_key **or** permission **`settings.users_roles`** (see migration **`supabase/migrations/20260505120100_settings_users_roles_permission.sql`**). Catalog **`GET`** for **`/api/admin/rbac/roles`**, **`/permissions`**, **`/grants`** allows **portal (admin/ops)** or the same managers (so ops can read catalogs; only managers change grants). **`resolveAdminAccessDimensionsForOrgMember`** (`web/lib/admin/resolveAdminAccessCore.ts`) previews scope for a **specific org** (multi-org safe). Migration: **`supabase/migrations/20260504103000_user_access_scope_tables_v1.sql`** (triggers enforce site rows and department org match).
- **Status definitions** — per-entity allowed keys and display labels (`fetchEffectiveStatusDefinitions`, `web/lib/admin/statusDefinitionsResolve.ts`, admin APIs).
- **Queue definitions** — `work_units.queue_definition` validated as v1 (`web/lib/config/queueDefinitionSchema.ts`). Queue entries may include optional **`icon`**, **`grain`** (case vs candidate/child-primary), and UI presentation flags under **`ui`** (e.g. `suppress_other_pill`, `suppress_lifecycle_panel`). **Enrollment Pipeline** v2 shape: **`enrollmentPipelineQueueDefinitionV2.ts`** + migrations; v1 template retained for compat. UI pills, department pipeline rows, and summaries remain **definition-driven**, not hardcoded in React. **Deferred:** admin Settings CRUD to rename/reorder/hide domains and Needs Attention buckets — see closeout Card 15 in **`docs/sprints/archive/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`**.
- **Needs attention buckets** — `metadata.opportunity_attention_rules.needs_attention_buckets[]` supports optional **`priority`** (lower first; fallback **`order`**) and **`icon`** (same token convention as queue icons). **No platform vertical defaults:** list is empty until metadata or Settings defines buckets; childcare enrollment demo lenses are seeded by **`ensureEnrollmentPipelineWorkUnitV1.ts`** (`enrollmentNeedsAttentionBucketsSeed.ts`).
- **Record / drawer layouts** — org overrides in **`record_drawer_layouts`**, templates in **`record_layouts`** (`web/app/api/admin/record-layouts/route.ts`).
- **Person / role type** metadata for dropdowns (`web/lib/admin/personTypeSettings.ts`).
- **Queue UI** presentation hints (`web/lib/ui-v2/queueUiConfig.ts`).
- **Placement priority (waitlist lanes)** — subtree **`placement_priority_v1`** on **`work_units.metadata`** (and optional department defaults): enable flag, preset **`profile_id`**, lane filter, evaluation cap, display flags, rule order — validated on PATCH; drives queue preview ordering only when enabled (**opt-in**). Settings UI: **`/admin/settings/placement-priority`** (**Waitlist Ranking Policy** — operator priority factors + ranking mode). Settings V2 reframe: **`docs/sprints/archive/05_2026/waitlist_ranking_policy_settings_v2.md`**. Runtime position + ranking validation: **`docs/sprints/archive/05_2026/waitlist_ranking_validation_position_controls.md`**.
- **Locations & hierarchy (May 2026 — demo readiness)** — **`/admin/settings/locations`**: read-first site → classroom/room tree (`locations.parent_location_id`, `location_type` address/site/unit). Full CRUD via location drawer + **`/admin/locations`**. Org-level cohort keys unchanged; site-scoped rates/catalog deferred — **`docs/sprints/archive/05_2026/waitlist_demo_readiness_final_pass.md`**.
- **Field / section policies** — **`field_definitions.requirement_policy`**, **`interaction_policy`**, legacy **`is_required`** (migration **`20260523120000_field_policy_and_section_v1.sql`**). **Defaults** on the definition row; **effective** drawer behavior for opportunity workflow v1 merges **`field_placements_v1`** (see above). **Settings:** Fields hub = structure; Layouts hub = drawer behavior for opportunity workflow v1. **Enforcement:** opportunity PATCH uses effective policies; job PATCH uses definitions only. Complex JSON policies are not operator-edited in Settings UI. Sprint: **`docs/sprints/archive/05_2026/layout_field_behavior_semantics_v1.md`**.
- **Linked-record edit (V1):** **`editable_through_related_record`** on opportunity fields (`first_name`, `last_name`, `email`, `phone`) routes drawer blur-save to **`PATCH /api/admin/persons/:id`** when **`primary_person_id`** is set; preset **`personFieldOnOpportunityInteractionPolicy`**. Host opportunity PATCH ignores those keys. See **`docs/sprints/archive/05_2026/linked_record_field_editing_v1.md`**.
- **Inquiry summary layout (deferred config):** Workflow v1 uses a **hardcoded two-column summary** (`hardcoded_v1`); future **`record_drawer_layouts`** should own column/section placement. Field policies and native vs `field_values` SoT still apply per key on overview sections (e.g. `inquiry_source_external`).
- **Inquiry child fields:** Settings → Fields exposes **`inquiry_child`** (operator label “Inquiry child”; persistence on **`opportunity_customer_members`**). **`inquiry_child.desired_start_date`** is the canonical per-child enrollment start in the drawer; **opportunity `desired_start_date`** is legacy/default (placement + inheritance display only). Work-unit CRM compact shows **child-level** start summary (`_child_desired_start_summary` from OCM), not opportunity-level desired start. Drawer UI: one horizontal row per child (`OpportunityInquiryChildrenSection`). See **`inquiryChildFieldRegistry.ts`** and **`docs/sprints/archive/05_2026/linked_record_field_editing_v1.md`** § V1b.
- **Layout integrity (read-only)** — **`GET /api/admin/config/layout-integrity`** (`validateLayoutIntegrityNow`); operator UI at **Settings → Layouts** (`LayoutIntegrityReportPanel`, formatting in **`layoutIntegrityPresentation.ts`**). Opportunity checks use **effective layout requiredness** vs drawer preview; issue code **`required_on_layout_not_visible`** when a field is required on this layout but absent from the preview. Does not change config.
- **Settings + Record UX Parity (May 2026)** — Field policy UI + PATCH enforcement for opportunity/job **enforceable** subset; layout integrity panel; Settings index parity.
- **Settings Config Completion V1 (May 2026)** — Opportunity workflow drawer sections (reorder, show/hide, rename workflow virtual titles, **Show hidden section**); org-scoped **action placement** editor. Structured admin PATCH only — no raw JSON primary UX.
- **Settings UX Contract pass (May 2026)** — Four-plane Settings copy; operator-first field modal; workflow/relationship fields hidden by default.
- **Settings control plane closeout (May 2026)** — Layouts drawer-composition UX; Action buttons under **Workflows & automation** (create from catalog, org placement edit, surface/slot help); Status vs workflow automation ownership; see **`docs/sprints/archive/05_2026/completed/settings_control_plane_closeout.md`**. **Deferred:** items under [Next strategic layers](#next-strategic-layers-deferred) above.
- **Config/Layout Assist proposals** — **`config_layout_assist_proposals`** durable lifecycle (`draft` → … → `applied`); propose via Orchestrator + admin APIs; apply **partially implemented** — see **`docs/product/bos-foundation.md`**, sprint **`configuration_layout_assist_v1.md`**. **Roadmap:** foundation shipped; **catalog expansion paused** until settings/field parity advances (`roadmap-and-gaps.md`).

## How it works

1. **Validated JSON** — queue definitions and similar pass schema validation before persistence (see `QueueService` load path, seed scripts).
2. **Effective resolution** — admin UI fetches “effective” config per org with fallbacks (e.g. status definitions, layouts).
3. **Presentation vs behavior** — config can steer labels, ordering, which keys appear, and which workflow is wired in DB — but **authorization**, monetary calculations, and cross-entity invariants must remain in server code/workflows as appropriate.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Queue schema | `web/lib/config/queueDefinitionSchema.ts` |
| Record layouts API | `web/app/api/admin/record-layouts/route.ts`, `…/effective-preview` |
| Layout composition helpers | `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts`, `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts`, `layoutFieldPickerEligibility.ts` |
| Action placement Settings | `web/lib/admin/actions/actionPlacementMutation.ts`, `actionPlacementPresentation.ts`, `actionPlacementEditorUi.ts`, `actionButtonCreateUi.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Access scope (CRM) | `web/lib/admin/accessScope.ts`, `web/lib/admin/getAdminAccessContext.ts`, `web/app/api/admin/users/[userId]/access-scope/route.ts` |
| Admin entity types for statuses | `web/lib/admin/statusDefinitionsAdminEntityTypes.ts` |

## AI-mediated configuration mutations

When **agents** or automation apply JSON config (queue definitions, record overview layouts, field visibility), the database layer expects **`agent_v0_*` / `agent_v1_*` / `agent_v2_*` `SECURITY DEFINER`** apply functions (**`docs/supabase/reference/supabase_functions.csv`**, **`docs/product/bos-foundation.md`**): **optimistic concurrency** (expected version / updated-at), **`FOR UPDATE`** where applicable, and **proposal + apply-audit** rows. Treat direct writes to those tables as **unsafe** unless they follow the same invariants.

---

## Guardrails

- **Opportunity `metadata`:** Treat it as **inquiry / enrollment context** (program interest, tour, desired start, notes, structured inquiry payloads), **not** as the canonical store for **household child identity**. Child names and DOB for queue previews must be enriched from **`customer_members`** via **`opportunities.customer_id`** (see **`docs/archive/2026-06-superseded-system/workspace-system.md`** and **`docs/archive/2026-06-superseded-system/entity-model.md`**). Do not add new features that **require** child names to live only in metadata.
- **Do not** encode one-off business rules only in config if other orgs would break — platform must validate.
- **Do not** hardcode strings/keys in UI that should be driven by status definitions or layout config when those systems already apply.
- **Do** extend schema/version when changing queue or layout shape with migration + validation.

## Known gaps / risks

- **Deferred Settings work:** platform-global placements; `condition_config` editors; new action definitions wizard; job/schedule layout builders; person/location field modal parity; full `record_actions` → registry migration; **work-unit domain / Needs Attention presentation CRUD** (rename, reorder, hide domains — extend `queue_definition` + `opportunity_attention_rules`, not parallel stores).
- **Needs verification:** Single index of all JSON columns used as “config” in production (beyond those listed).
- Archived audits referenced hardcoded workflow debt — confirm with `docs/archive/2026-05-02-docs-reset/` if needed, but treat codebase grep as truth.

## When this doc must be updated

New config tables, new schema versions, when elevating a concern from code → config or vice versa, or when **policy for what may live in opportunity JSON metadata** changes.
