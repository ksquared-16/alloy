# Configuration system

## Purpose

Define what **configuration** is allowed to control vs what must remain **platform-owned** logic — preventing “JSON became the codebase” failures.

## Control plane vs runtime

| Layer | Role |
|-------|------|
| **Settings (control plane)** | Structure, presentation, and **policies** operators may change through validated admin APIs: field registry, catalog section labels, drawer layout composition, action placement rows, department attention metadata, queue definitions, etc. |
| **Runtime (operational)** | Business logic and side effects: entity PATCH, `executeAdminAction`, `executeWorkflowRun`, dedicated tour/quote/job flows, status transitions. |
| **Integrity / diagnostics** | Read-only checks (e.g. layout integrity) that config matches enforceable write paths — not a second config store. |

**Principles:** No second source of truth; no builder-only hidden config; no AI-only config model. **BOS config capabilities** use the same structured PATCH helpers and tables as human operators (see **BOS readiness** below; doctrine **`docs/product/bos-foundation.md`**).

## Four-plane operator model (Records settings)

Settings hub: `/adminV2/settings` — tiles use **Editable ·**, **Partial ·**, **Read-only ·**, or **Related hub ·** (`web/lib/adminV2/settingsSurfaceModes.ts`). Sprint closeout: **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12–§13.

| Plane | Route | Owns | Does **not** own |
|-------|-------|------|------------------|
| **Fields** | `/adminV2/settings/fields` | Registry: labels, help, required rules, editability, visibility | Drawer section order; button placement |
| **Field grouping** | `/adminV2/settings/field-sections` | Catalog taxonomy (`field_section_definitions`) | Workflow virtual section titles |
| **Layouts** | `/adminV2/settings/layouts` | Drawer composition workspace (sections, catalog sections, field placement, preview); opportunity workflow v1 | Field policies; net-new workflow virtuals with arbitrary `field_keys`; raw `config_json` |
| **Actions** | `/adminV2/settings/actions` | Org placement + enablement (`action_placements`) | Execution (`executeAdminAction`, workflows) |
| **Automations** | `/adminV2/workflows` | Workflow definitions, execution semantics | Placement rows |
| **Forms** | `/adminV2/forms` | Definitions, versions, packets | Action `payload_schema` in Settings (today) |

Related Settings surfaces (same family): statuses, attention/SLA metadata, queue definitions, communications bindings, users/roles, option sets, KPI placements, etc.

### Next strategic layers (deferred)

Record Experience Builder; BOS/AI config layer (structured PATCH only); linked-record inline PATCH (`interaction_policy` schema exists); structured `condition_config` builders; workflow-driven actions/forms wiring from Settings.

### Admin Settings capability inventory

| Capability | Exposure | Notes |
|------------|----------|-------|
| Field policies + visibility | **Editable** (opportunity/job enforceable) | Inline Required + `FieldDefinitionEditModal`; PATCH enforcement on entity routes |
| Field grouping | **Editable** | `field_section_definitions` |
| Drawer layout (workflow v1) | **Editable** | Reorder, show/hide, rename workflow virtuals; **Show hidden section** |
| Layout integrity | **Read-only report** | Settings → Layouts panel; `GET /api/admin/config/layout-integrity` |
| Action placements (org) | **Editable V1** | Enable, label, surface/slot/section/order |
| Status transition rules | **Read-only** | Seed/migration-managed |
| Attention & SLA | **Editable** | Department `metadata.opportunity_attention_rules` |
| Legacy `record_actions` | **Runtime only** | Coexists with registry; migration deferred |
| Forms / packets | **Related hub** | `/adminV2/forms` |

### Layout composition mutation classes (Record Experience Builder Phase 1)

Human operators and BOS **`config_layout_assist`** use the same admin APIs — no parallel AI storage:

| Class | Store | Settings entry |
|-------|--------|----------------|
| **A — Drawer chrome** | `record_drawer_layouts.config_json` | `PATCH …/opportunity-workflow-v1-sections` |
| **B — Field placement** | `field_definitions.section_key`, `sort_order` | `PATCH …/field-definitions/batch-placement` |
| **C — Catalog section** | `field_section_definitions` | `POST/PATCH …/field-sections` |
| **D — Actions** | `action_placements` (read-only on Layouts until Card 5) | Actions hub |

Capability gates: `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts` (`primaryBosCapability: config_layout_assist`).

### Drawer layout and field policy (source of truth)

- **Tables:** `record_drawer_layouts` (org), `record_layouts` (templates). Effective `config_json` drives drawer body; opportunity workflow v1 uses `overview_section_order`, `overview_hidden_sections`, `inquiry_workflow_sections`.
- **Settings APIs:** `PATCH …/opportunity-workflow-v1-sections`, `…/opportunity-workflow-v1-order`; helpers `opportunityWorkflowV1SectionConfig.ts`, `persistOpportunityDrawerLayoutConfig`.
- **Field policy:** `drawerFieldPolicyAdapter.ts` → `_field_policy_resolved` on GET; `enforceDrawerFieldPoliciesOnPatch` on opportunity/job PATCH. Violation contract: `{ error: "Field validation failed", violations: [...] }`.
- **Action placement V1:** `actionPlacementMutation.ts`; `PATCH /api/admin/action-placements/[id]`, `POST …`, `PATCH /api/admin/action-definitions/[id]` (label). Registry + legacy `record_actions` inventory summarized in **`docs/system/actions-and-workflows.md`**.

### Attention & SLA (Settings)

**Settings → Attention & SLA Rules** PATCHes `departments.metadata.opportunity_attention_rules` (buckets + supported thresholds). Evaluator: `resolveOpportunityAttention`. Count semantics across workspace surfaces: **`docs/system/workspace-system.md`** § Needs attention count semantics.

### BOS / configuration-agent readiness

| Domain | Structured entry points |
|--------|-------------------------|
| Fields | `PATCH /api/admin/field-definitions/:id`; `fieldSettingsOperatorUi.ts`, `drawerFieldPolicyAdapter.ts` |
| Layouts | Opportunity workflow v1 PATCH routes; `opportunityWorkflowV1SectionConfig.ts`; composition capabilities `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts`; field batch placement `PATCH /api/admin/field-definitions/batch-placement` |
| Actions | `actionPlacementMutation.ts`; placement PATCH/POST |
| Integrity | `GET /api/admin/config/layout-integrity`; effective-preview `editor_sections` |
| Proposals | `config_layout_assist_proposals` — apply catalog expansion **paused** |

Do **not** train agents on raw `config_json` or React-only state as source of truth.

## Current state

Config surfaces include (non-exhaustive):

- **Communications provider bindings** — **`communication_provider_bindings`** edited via **`/adminV2/settings/communications`** and **`/api/admin/communications/bindings`** (safe fields only on PATCH; no secrets in GET). Binds canonical send paths to Twilio/Resend config; full tenant **self-serve** DNS/SPF/DKIM wizards are **not** V1 (see **`docs/product/communications.md`**).
- **Forms definitions** — **`form_definitions`** + **`form_definition_versions`** (draft/published/archived), **`form_public_links`**, driven via **`/api/admin/forms/**`** and **`/adminV2/forms`**. **Partially implemented** for full enrollment product scope — see **`docs/product/documents-and-forms.md`**.
- **Users & Roles (CRM settings)** — Tables **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`** hold **data visibility** per `(user_id, org_id)` (`department_scope` / `site_scope` plus optional allow lists). **Capabilities** stay on **`user_roles`** and **`role_definitions`** / **`role_permission_grants`**. Canonical sites are **`locations`** rows with **`location_type = 'site'`**. Runtime enforcement resolves scope via **`getAdminAccessContextCached`** + helpers in **`web/lib/admin/accessScope.ts`** on entity reads, queue builders, actions, and **direct admin mutators** touching jobs, schedules, opportunities, work units, etc. (out-of-scope targets → **404**). Capability vs visibility split: **`docs/system/roles-and-permissions.md`**. **Admin settings UI:** **`/adminV2/settings/users-roles`** (two tabs: Users, Roles). Legacy **`/adminV2/settings/user-access`** redirects there. **APIs:** **`GET /api/admin/settings/users-roles/members`** (enriched member list for managers); **`GET` / `PATCH /api/admin/users/[userId]/access-scope`**, **`PATCH /api/admin/users/[userId]/role`**, **`POST /api/admin/users`**, **`POST /api/admin/users/[userId]/remove`**, RBAC **`/api/admin/rbac/*`** mutations — all require org **`admin`** role_key **or** permission **`settings.users_roles`** (see migration **`supabase/migrations/20260505120100_settings_users_roles_permission.sql`**). Catalog **`GET`** for **`/api/admin/rbac/roles`**, **`/permissions`**, **`/grants`** allows **portal (admin/ops)** or the same managers (so ops can read catalogs; only managers change grants). **`resolveAdminAccessDimensionsForOrgMember`** (`web/lib/admin/resolveAdminAccessCore.ts`) previews scope for a **specific org** (multi-org safe). Migration: **`supabase/migrations/20260504103000_user_access_scope_tables_v1.sql`** (triggers enforce site rows and department org match).
- **Status definitions** — per-entity allowed keys and display labels (`fetchEffectiveStatusDefinitions`, `web/lib/admin/statusDefinitionsResolve.ts`, admin APIs).
- **Queue definitions** — `work_units.queue_definition` validated as v1 (`web/lib/config/queueDefinitionSchema.ts`). Queue entries may include an optional **`icon`** string (**kebab-case** Lucide token) for AdminV2 operational rows; resolution is registry-based (`WorkspaceOperIcon`), not per-queue React switches. **Enrollment Pipeline** canonical shape for childcare enrollment ops is centralized in **`web/lib/config/enrollmentPipelineQueueDefinitionV1.ts`** so scripts (`web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts`) and DB migrations stay aligned — UI pills, department pipeline rows, and summaries remain **definition-driven**, not hardcoded in React.
- **Needs attention buckets** — `metadata.opportunity_attention_rules.needs_attention_buckets[]` supports optional **`priority`** (lower first; fallback **`order`**) and **`icon`** (same token convention as queue icons). **No platform vertical defaults:** list is empty until metadata or Settings defines buckets; childcare enrollment demo lenses are seeded by **`ensureEnrollmentPipelineWorkUnitV1.ts`** (`enrollmentNeedsAttentionBucketsSeed.ts`).
- **Record / drawer layouts** — org overrides in **`record_drawer_layouts`**, templates in **`record_layouts`** (`web/app/api/admin/record-layouts/route.ts`).
- **Person / role type** metadata for dropdowns (`web/lib/admin/personTypeSettings.ts`).
- **Queue UI** presentation hints (`web/lib/ui-v2/queueUiConfig.ts`).
- **Placement priority (waitlist lanes)** — subtree **`placement_priority_v1`** on **`work_units.metadata`** (and optional department defaults): enable flag, preset **`profile_id`**, lane filter, evaluation cap, display flags, rule order — validated on PATCH; drives queue preview ordering only when enabled (**opt-in**). Settings UI: **`/adminV2/settings/placement-priority`**.
- **Field / section policies** — **`field_definitions.requirement_policy`**, **`interaction_policy`** (migration **`20260523120000_field_policy_and_section_v1.sql`**). **Write map:** `drawerFieldPolicyAdapter.ts` → **`_field_policy_resolved`** on opportunity/job GET. **Settings:** opportunity/job Fields hub — inline Required + unified edit modal (`FieldDefinitionEditModal`, capability matrix) for enforceable keys; catalog grouping via **`field_section_definitions`**. **Enforcement:** opportunity/job admin PATCH validates required/read-only before DB write. Complex stored JSON policies are not edited in Settings UI.
- **Layout integrity (read-only)** — **`GET /api/admin/config/layout-integrity`** (`validateLayoutIntegrityNow`); operator UI at **Settings → Layouts** (`LayoutIntegrityReportPanel`, formatting in **`layoutIntegrityPresentation.ts`**). Manual run per entity type; reports issues (severity, code, field/section/layout targets) without changing config.
- **Settings + Record UX Parity (May 2026)** — Field policy UI + PATCH enforcement for opportunity/job **enforceable** subset; layout integrity panel; Settings index parity.
- **Settings Config Completion V1 (May 2026)** — Opportunity workflow drawer sections (reorder, show/hide, rename workflow virtual titles, **Show hidden section**); org-scoped **action placement** editor. Structured admin PATCH only — no raw JSON primary UX.
- **Settings UX Contract pass (May 2026)** — Four-plane Settings copy; operator-first field modal; workflow/relationship fields hidden by default. **Deferred:** items under [Next strategic layers](#next-strategic-layers-deferred) above.
- **Config/Layout Assist proposals** — **`config_layout_assist_proposals`** durable lifecycle (`draft` → … → `applied`); propose via Orchestrator + admin APIs; apply **partially implemented** — see **`docs/product/ai-system.md`**, sprint **`configuration_layout_assist_v1.md`**. **Roadmap:** foundation shipped; **catalog expansion paused** until settings/field parity advances (`roadmap-and-gaps.md`).

## How it works

1. **Validated JSON** — queue definitions and similar pass schema validation before persistence (see `QueueService` load path, seed scripts).
2. **Effective resolution** — admin UI fetches “effective” config per org with fallbacks (e.g. status definitions, layouts).
3. **Presentation vs behavior** — config can steer labels, ordering, which keys appear, and which workflow is wired in DB — but **authorization**, monetary calculations, and cross-entity invariants must remain in server code/workflows as appropriate.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Queue schema | `web/lib/config/queueDefinitionSchema.ts` |
| Record layouts API | `web/app/api/admin/record-layouts/route.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Access scope (CRM) | `web/lib/admin/accessScope.ts`, `web/lib/admin/getAdminAccessContext.ts`, `web/app/api/admin/users/[userId]/access-scope/route.ts` |
| Admin entity types for statuses | `web/lib/admin/statusDefinitionsAdminEntityTypes.ts` |

## AI-mediated configuration mutations

When **agents** or automation apply JSON config (queue definitions, record overview layouts, field visibility), the database layer expects **`agent_v0_*` / `agent_v1_*` / `agent_v2_*` `SECURITY DEFINER`** apply functions (**`docs/supabase/reference/supabase_functions.csv`**, **`docs/product/ai-system.md`**): **optimistic concurrency** (expected version / updated-at), **`FOR UPDATE`** where applicable, and **proposal + apply-audit** rows. Treat direct writes to those tables as **unsafe** unless they follow the same invariants.

---

## Guardrails

- **Opportunity `metadata`:** Treat it as **inquiry / enrollment context** (program interest, tour, desired start, notes, structured inquiry payloads), **not** as the canonical store for **household child identity**. Child names and DOB for queue previews must be enriched from **`customer_members`** via **`opportunities.customer_id`** (see **`docs/system/workspace-system.md`** and **`docs/system/entity-model.md`**). Do not add new features that **require** child names to live only in metadata.
- **Do not** encode one-off business rules only in config if other orgs would break — platform must validate.
- **Do not** hardcode strings/keys in UI that should be driven by status definitions or layout config when those systems already apply.
- **Do** extend schema/version when changing queue or layout shape with migration + validation.

## Known gaps / risks

- **Deferred Settings work:** platform-global placements; `condition_config` editors; new action definitions wizard; job/schedule layout builders; person/location field modal parity; full `record_actions` → registry migration; work-unit attention overrides in UI.
- **Needs verification:** Single index of all JSON columns used as “config” in production (beyond those listed).
- Archived audits referenced hardcoded workflow debt — confirm with `docs/archive/2026-05-02-docs-reset/` if needed, but treat codebase grep as truth.

## When this doc must be updated

New config tables, new schema versions, when elevating a concern from code → config or vice versa, or when **policy for what may live in opportunity JSON metadata** changes.
