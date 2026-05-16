# Sprint: Configuration / Layout Assist V1 (Agent #4)

**Path:** `docs/sprints/05_2026/configuration_layout_assist_v1.md`  
**Status:** **Cards 1–10 implemented (vertical slice)** — primitives, proposal contract, persistence, permissions, Orchestrator routing, review UX, apply adapters. Cards 11–12 deferred.  
**Prerequisites:** `docs/sprints/05_2026/agent_interaction_layer_v1.md` (Orchestrator + thread + action cards), `docs/sprints/05_2026/workflow_assist_v1.md` (propose/apply + permission patterns), `docs/system/configuration-system.md`, `docs/system/record-system.md`, `docs/product/ai-system.md`.

**Non-goals for this document:** Autonomous config mutation; raw SQL from agents; service-role bypass; childcare-only field keys in platform code; replacing human Settings UI; merging Task Assist or Workflow Assist responsibilities.

---

## Card 0 — Locked doctrine (2026-05-16)

| Decision | Locked choice |
|----------|----------------|
| **Agent role** | **Configuration / Layout Assist** is **AI-assisted configuration governance** — structured proposals, explainability, and integrity analysis over existing field/layout config. It is **not** autonomous system editing. |
| **Mutations** | **No** direct writes from model output. **No** client-side apply of proposal JSON without server re-validation. **Apply** uses **existing** admin APIs and/or **`agent_v*_*` DEFINER RPCs** where they already exist — **after** explicit human approval and permission checks. |
| **Orchestrator** | Routes NL to **`ConfigurationLayoutAssistService`**; Orchestrator **never** applies config mutations itself. |
| **Agent count (V1)** | **One** Orchestrator-facing specialist: **`ConfigurationLayoutAssistService`**, with **internal domains** (layout, fields, sections, requirements, editability, data_quality, explainability). **Do not** ship four disconnected agents in V1. |
| **Schema** | **Do not invent tables** in product code without a documented migration card. Prefer extending existing tables/APIs; document gaps as **Card 1–4** prerequisites. |
| **Vertical neutrality** | Example prompts (“Preferred Start Date”, “subsidy tier”, “tour date”) are **documentation examples**; platform catalogs stay industry-agnostic. |

---

## Implementation status (2026-05-16)

| Card | Status | Notes |
|------|--------|--------|
| **1–4** | **Implemented** | `field_requirement_policy`, `interaction_policy`, section management, `layoutIntegrityValidator`, admin layout-integrity GET. |
| **5** | **Implemented** | `ConfigurationProposalV1` contract — validate, normalize, serialize, risk, permissions. |
| **6** | **Implemented** | `config_layout_assist_proposals` table + lifecycle state machine (no apply in PATCH). |
| **7** | **Implemented** | Migration `20260523150000_config_assist_permissions_seed.sql`; `configurationProposalAccess.ts`; operation→permission map. Legacy admin/ops fallback **on by default**; set `CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK=false` to require seeded grants only. Approve + apply transitions require `config_assist.apply`. |
| **8** | **Implemented** | `config_layout_assist` route in Orchestrator; `POST /api/admin/ai/config-layout-assist/propose`; deterministic `buildDeterministicConfigurationProposal`; thread card `config_layout_assist_proposal`. |
| **9** | **Implemented** | Settings hub `/adminV2/settings/config-proposals` — list, detail, diff preview, lifecycle actions, recommendation vs applied banners. |
| **10** | **Implemented** | `apply/configurationProposalApply.ts` + `POST .../proposals/[id]/apply`; read-after-write verification via `buildApplyVerificationResult`; transitions to `applied` / `failed`. |
| **11–12** | **Deferred** | Dedicated analyze/explain routes; rollback execution. |

### Adapter architecture (Card 10)

- **Entry:** `POST /api/admin/config-layout-assist/proposals/[id]/apply` (requires `approved` + `config_assist.apply` + per-operation grants).
- **Flow:** `applyConfigurationProposal` → per-operation adapter → org-scoped `field_definitions` writes (same policy merge as admin field APIs) → `buildApplyVerificationResult` → lifecycle transition.
- **Supported apply kinds (V1):** `create_field`, `update_field`, `set_field_requirement`, `set_field_interaction`, `set_field_write_target`, `expose_field_on_layout`, `hide_field_on_layout`, `move_field_to_section`.
- **Unsupported kinds** return explicit errors (no silent skip). `data_quality_recommendation` is recommendation-only (skipped for verification).
- **Verification:** Re-fetch field row after patch; failed verification → `failed` state with `failed_reason` + diagnostics in `proposal_json.metadata.apply_verification`.

### Proposal lifecycle

`draft` → `reviewed` | `rejected` → `approved` → `applied` | `failed` → (`rolled_back` deferred). Apply is **never** triggered from propose or Orchestrator card — only from Settings after approval.

### Remaining gaps / TODOs

- Section / layout / option-set apply adapters (`create_section`, `reorder_section`, `update_option_set`, record-drawer JSON).
- Stale `expected_updated_at` optimistic locking on apply (field visibility RPC path not wired).
- Workflow events on lifecycle transitions (audit log only today).
- `org_settings.metadata.ai_policy` feature flag `config_layout_assist_draft` (permissions-only gate today).
- Rollback (`rolled_back`) execution path.

---

## 1. Purpose

**Configuration / Layout Assist** helps operators **design, review, and safely change** how Alloy presents and governs configurable data — custom fields, sections, record layouts, visibility, requirements, editability, write targets, and option sets — **without** the AI becoming a second admin console that mutates truth on its own.

The specialist:

- **Reads** authoritative config (field registry, layouts, sections, effective previews, permissions).
- **Produces** versioned **`ConfigurationProposal`** objects (structured operations + warnings + rationale).
- **Explains** why a field behaves a certain way (read-only, action-controlled, owned by a related entity).
- **Detects** layout/data-quality issues (required-but-hidden, orphan definitions, stale options).

The specialist **does not**:

- Apply changes without a human **review → approve → apply** path.
- Bypass RLS, org scope, or admin API validation.
- Generate or execute SQL.
- Use service-role credentials from the agent path.

**North star:** Operators ask natural-language questions in the **Orchestrator** command bar; Alloy returns **reviewable proposal cards** with impact, diffs, and permission requirements; **only** privileged humans trigger **server-validated** apply.

---

## 2. Current audit

*Evidence gathered 2026-05-16 from `web/`, `supabase/migrations/`, `docs/supabase/reference/`, and active system docs.*

### 2.1 Custom field system

| Area | Evidence | Notes |
|------|-----------|--------|
| **Definitions** | `public.field_definitions` | Org-scoped; `entity_type`, `field_key`, `field_type`, booleans (`is_required`, `is_active`, visibility flags), `section_key`, `sort_order`, `config` jsonb. |
| **Values** | `public.field_values` | Typed columns per definition; custom values only — system fields on native entity columns (`typedFieldValues.ts`, `entityFieldRegistryAttach.ts`). |
| **Sections** | `public.field_section_definitions` | Org-scoped `(org_id, entity_type, section_key)` with `label`, `sort_order`. |
| **Admin APIs** | `GET`/`POST` `web/app/api/admin/field-definitions/route.ts`; `PATCH`/`DELETE` `[id]/route.ts` | **POST/PATCH/DELETE: `ctx.role === "admin"`** only. Entity types: person, customer, job, opportunity, vendor, schedule, location. |
| **Public read** | `web/app/api/public/field-definitions/route.ts` | Org-scoped public form/booking field lists. |
| **Settings UI** | `web/app/adminV2/settings/fields/SettingsFieldsHubClient.tsx` | Per-entity tabs; wraps `EntityFieldsClient` / person/location clients. |
| **Registry attach** | `web/lib/admin/entityFieldRegistryAttach.ts` | Drawer/GET merges definitions + sections + live `field_values`. |
| **Upsert values** | `web/lib/fields/upsertConfigurableFieldValues.ts`, entity PATCH routes | Server paths for persisting custom values — **not** agent-owned. |

**Gaps vs sprint primitives:** No first-class **`conditionally_required`**, **`required_on_save`**, **`required_before_status_change`**, **`required_before_action`**, or role-aware requirement objects on `field_definitions`. `is_required` is a single boolean.

### 2.2 Record layouts

| Area | Evidence | Notes |
|------|-----------|--------|
| **Global templates** | `public.record_layouts` | `entity_type`, `key`, `config_json`, `is_active` — **no `org_id`** (global presentation chrome). |
| **Org drawer overrides** | `public.record_drawer_layouts` | Per-org `config_json` (`overview_section_order`, `overview_hidden_sections`, `inquiry_workflow_sections`, etc.). Migration `20260430140000_record_drawer_layouts_org_scoped.sql`. |
| **Overview layouts** | `public.record_overview_layouts` | Org-scoped `(org_id, entity_type, surface)` with versioned `config` — used for job overview bands (RRS). |
| **Record actions** | `public.record_actions` | Global action chrome; event keys + placement. |
| **Config JSON types** | `web/lib/recordChrome/types.ts` | Documents `RecordLayoutConfigJson` shape. |
| **Effective resolution** | `web/lib/admin/effectiveRecordDrawerLayout.ts`, `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts` | Org override → global fallback; preview kinds: `field_section_ref`, `workflow_virtual`, `layout_static`, `injected_system`. |
| **Admin APIs** | `web/app/api/admin/record-layouts/route.ts`, `record-overview-layouts/route.ts`, `record-layouts/effective-preview/route.ts`, `record-drawer-layouts/opportunity-workflow-v1-order/route.ts` | Opportunity workflow v1 section order PATCH is **narrow** and **admin-only**. |
| **Settings UI** | `web/app/adminV2/settings/layouts/LayoutsSettingsClient.tsx` | Layout management hub. |

**Gaps:** No unified **placement surface** model (drawer header vs summary vs queue preview) in one schema; placement is split across visibility booleans, layout JSON, and RRS descriptors. No cross-entity **layout consistency** validator in-repo.

### 2.3 Field visibility & prior agent paths

| Area | Evidence | Notes |
|------|-----------|--------|
| **Agent v2 visibility** | `web/app/api/admin/agent/v2/field-visibility/route.ts`, `agent_v2_commit_field_visibility_apply` | Patches **four visibility booleans** only; stale check via `expected_updated_at`; proposal + apply audit tables (`20260414100000_agent_v2_field_visibility_audit.sql`). Gated by **`AGENT_V2_FIELD_VISIBILITY_ENABLED`**. |
| **Admin visibility PUT** | `web/app/api/admin/config/field-definition-visibility/route.ts` | Human admin path mirroring v2 patch semantics. |
| **Agent v1 job overview** | `web/app/api/admin/agent/v1/record-overview-layout/route.ts` | **`job` + `overview` only**; structured_override → RPC; env **`AGENT_V1_RECORD_LAYOUT_ENABLED`**. |
| **Agent v0 queue** | `web/lib/agent/v0/agentV0AtomicCommit.ts` | Queue definition apply pattern (version stale check) — **template**, not field/layout breadth. |

### 2.4 Option sets

| Area | Evidence | Notes |
|------|-----------|--------|
| **Tables** | `public.option_sets`, `public.option_set_items` | Org-scoped sets; items keyed per set. |
| **Admin APIs** | `web/app/api/admin/option-sets/**` | List/create/update sets and items; admin routes. |
| **Usage guard** | `web/lib/admin/collectOptionSetUsage.ts` | Blocks delete when referenced from `field_definitions.config.option_set_key` or pricing dimensions. |
| **Field linkage** | `field_definitions.config.option_set_key` | Select-like fields reference sets by key. |
| **Settings UI** | `web/app/adminV2/settings/option-sets/**` | Manage sets and items. |

**Gaps:** No agent proposal path for option updates; no shared “stale/duplicate option” analyzer beyond usage collection.

### 2.5 Role / permission system

| Area | Evidence | Notes |
|------|-----------|--------|
| **Capabilities** | `role_permission_grants.permission_key` → `permission_keys` | Seeded keys include `settings.users_roles`, `ai.enrichment.use` — **no** `config_assist.*`, `fields.manage`, `layouts.manage` yet (**proposed in §7**). |
| **Portal roles** | `getAdminContextCached` compatibility `admin` / `ops` | Most field/layout **mutations** today are **`requireAdmin`** (role string), not fine-grained grants. |
| **Access scope** | `getAdminAccessContextCached`, `accessScope.ts` | Department/site visibility on **entity reads** — config tables are org-scoped, not site-scoped. |
| **AI policy** | `org_settings.metadata.ai_policy.allowed_features` | Task Assist / Workflow Assist features — **no** `config_layout_assist_draft` yet. |

### 2.6 Proposal / apply patterns (existing agents)

| Pattern | Where | Reusable for Config/Layout Assist |
|---------|--------|-----------------------------------|
| **Ephemeral propose + POST apply** | Task Assist, Workflow Assist | Yes — V1 can mirror before durable tables. |
| **Durable proposal + DEFINER RPC + audit** | `agent_v0_*`, `agent_v1_*`, `agent_v2_*` | Yes — preferred when touching `field_definitions` / layout JSON with stale checks. |
| **Structured override only (no LLM)** | Agent v1 record overview layout | Yes — deterministic propose path first. |
| **Human re-validation on apply** | All shipped assist routes | **Required** — non-negotiable. |

### 2.7 Data quality validation logic

| Area | Evidence | Notes |
|------|-----------|--------|
| **Field config validation** | `validateSelectLikeConfig` (`fieldDefinitionConfig.ts`) | Select/multiselect option_set_key validation on create/update. |
| **Overview layout strict parse** | `overviewLayoutConfigStrict.ts` | Job overview config schema tests. |
| **Drawer order validation** | `validateOpportunityWorkflowV1SectionOrder` | Permutation of canonical section keys only. |
| **Queue data quality** | `QueueService.ts` | Operational queue row checks — **not** field/layout governance. |
| **Option set delete blockers** | `collectOptionSetUsage` | Prevents destructive delete when referenced. |

**Gap:** No centralized **layout integrity** report (required-but-not-visible, editable-without-write-target, etc.) — **Card 4** deliverable.

### 2.8 Orchestrator routing (today)

| Route | Trigger | Specialist |
|-------|---------|------------|
| `workflow_assist` | Workflow-like NL | Workflow Assist |
| `task_assist` | Comms / reminder / schedule | Task Assist |
| `job_layout` | Layout verbs without comms | **Job overview layout** card (agent v1 semantic preview — **not** full Config/Layout Assist) |
| `clarify` | Otherwise | Clarify message |

**Gap:** No `config_layout_assist` route; layout-like commands on **non-job** entities fall through to clarify or Task Assist.

### 2.9 Supabase tables involved (primary)

| Table | Role in sprint |
|-------|----------------|
| `field_definitions` | Field metadata, visibility, requirement boolean, section placement |
| `field_values` | Custom data (read for DQ: empty required custom fields) |
| `field_section_definitions` | Section labels/order |
| `record_layouts` | Global drawer/modal chrome |
| `record_drawer_layouts` | Org drawer overrides |
| `record_overview_layouts` | Org overview layout (job-focused today) |
| `record_actions` | Action placement (explain action-controlled fields) |
| `option_sets`, `option_set_items` | Select options |
| `agent_v2_field_visibility_proposals`, `agent_v2_field_visibility_apply_audit` | Precedent for proposal/audit |
| `agent_v1_record_layout_proposals`, `agent_v1_record_layout_apply_audit` | Precedent for layout apply |
| `role_permission_grants`, `permission_keys` | Future assist permissions |
| `org_settings` | `ai_policy` feature flags |

**Likely new (document before migrate):** `config_layout_assist_proposals`, `config_layout_assist_apply_audit` (names TBD) — **Card 6**; optional columns/json on `field_definitions` for requirement/editability/write-target — **Cards 1–2**.

### 2.10 What is reusable

- Orchestrator shell: `AICommandSurfaceShell`, `CommandSurfaceThread`, action card pattern.
- Proposal lifecycle patterns from Task Assist / Workflow Assist (propose → card → approve → apply).
- Agent v2 visibility RPC + stale timestamp pattern for **narrow** visibility patches.
- Effective layout preview: `effective-preview` route + `effectiveDrawerLayoutPreview.ts`.
- Admin audit: `logAdminAudit` on config mutations.
- Settings hubs as **human** source of truth for manual edits post-apply.

### 2.11 What should not be rebuilt

- RRS / record responders as operational truth for **values**.
- `field_values` upsert helpers and entity PATCH write paths.
- Global `record_layouts` seed strategy (extend via org overrides and APIs).
- Separate command bar or drawer-only AI for the same intents.

---

## 3. Missing primitives to add before/with the agent

*These are **platform contracts** the agent depends on. Implement via Cards 1–4 (schema/API) before Cards 5–10 (agent UX/apply).*

### A. Field requirement policy

Fields must support (stored in code-validated jsonb and/or columns — **design in Card 1**):

| Mode | Meaning |
|------|---------|
| `required` | Always required when surfaced for edit/save. |
| `optional` | Never required by policy (may still have format rules). |
| `conditionally_required` | Predicate on field values, status, or metadata (expression catalog TBD). |
| `required_on_save` | Required on explicit save, not on draft/autosave surfaces. |
| `required_before_status_change` | Gate specific status transitions (ties to `status_definitions` / transition rules). |
| `required_before_action` | Gate named admin/workflow actions. |
| **Warning path** | `required_warning` + operator message when soft-required. |
| **Role-aware** | Optional `required_for_roles` / `required_for_permissions` where product needs it. |

**Today:** `is_required` boolean only.

### B. Field editability policy

Per **layout placement**, not only per definition:

| Mode | Meaning |
|------|---------|
| `editable` | Operator may edit via resolved write path. |
| `read_only` | Visible but not editable on this surface. |
| `editable_by_permission` | Edit allowed only when grant present. |
| `editable_through_related_record` | Shown on entity A; writes go to entity B (see C). |
| `action_controlled` | Mutations only via named action/workflow (e.g. tour scheduling). |
| `system_controlled` | Set by system/workflows only (e.g. `created_at`). |

**Examples (documentation):**

- Person **first/last name** on **opportunity** layout → read/write target **`person.first_name` / `person.last_name`**.
- **Tour date** on opportunity layout → **`read_only` + `action_controlled`** (tour scheduling workflow owns mutation).
- **Created date** → **`system_controlled`**.

### C. Field ownership / write-target policy

Each **placement** (or definition when global) needs:

| Field | Purpose |
|-------|---------|
| `source_entity` | Where the value is displayed from. |
| `source_field` | Field key or descriptor id on source. |
| `write_target_entity` | Table/entity receiving writes. |
| `write_target_field` | Column or `field_values` target. |
| `write_behavior` | `direct` \| `related_record` \| `none` |
| `lock_reason` | Human-readable explainability code/message. |
| `allowed_permissions` | Grants allowed to edit via this path. |
| `audit_behavior` | Whether edits emit admin audit / events. |

**Today:** RRS descriptors partially encode `editable_entity` (e.g. `field_values`) — **not** a unified cross-layout policy object.

### D. Section management

Agent may **propose** (not auto-execute):

- Create / rename / reorder section.
- Delete or archive section **only when safe** (no fields, or fields moved).
- Move field into section / remove from section.
- Assign section visibility per layout/entity.
- Hide/show section per layout.

**Today:** CRUD via `field-sections` API; drawer order via layout JSON — no “safe delete” analyzer.

### E. Field placement / surface policy

Support placement across surfaces (enum/catalog):

- `drawer_header`, `drawer_summary`, `drawer_body`, `tab_section`
- `queue_preview`, `related_record_surface`
- `public_form`, `internal_form`
- `read_only_system_display`

**Today:** Split across `is_visible_in_*` flags and layout JSON — needs normalized **placement** records for Assist proposals.

### F. Layout consistency and integrity checks

Agent **detects** (read-only analysis → warnings on proposal):

- Required field not visible anywhere.
- Visible field without definition.
- Editable field without valid write target.
- Related-entity field without write path.
- Empty section.
- Duplicate/overlapping fields across surfaces.
- Field never exposed (orphan definition).
- Deprecated field still visible.
- Action-controlled field incorrectly editable.
- Required field with no validation path.
- Option field with no active options.
- Cross-entity layout inconsistencies (same semantic field, conflicting rules).

**Deliverable:** `LayoutIntegrityReportV1` — **Card 4**.

### G. Option set management

Proposals may include:

- Create/update options (items), detect duplicate/stale keys/labels.
- Shared option sets across fields.
- Role permissions for option edits.
- **No destructive delete** when values or field references exist (`collectOptionSetUsage` pattern).

### H. Field lifecycle

| State | Behavior |
|-------|----------|
| `draft` | Not shown to operators; proposals may create in draft. |
| `active` | Normal use. |
| `deprecated` | Show warning; hide from new placements; keep values. |
| `archived` | Hidden; retain data. |
| **Delete** | Only when safe + explicit approved proposal (no values / no references). |

**Today:** `is_active` boolean — map to lifecycle in Card 1.

### I. Layout versioning / rollback

- Proposal carries **diff** + before/after preview.
- Apply uses **optimistic concurrency** (`expected_updated_at` / config version — mirror agent v1/v2).
- **Config history** row or audit trail per apply (forward-fix rollback — new proposal to revert, **not** raw DB rollback).

---

## 4. Recommended agent boundary

### 4.1 Single specialist (V1)

**`ConfigurationLayoutAssistService`** — one Orchestrator destination, one propose/apply API family.

**Internal domains** (modules, not separate agents):

| Domain | Responsibility |
|--------|----------------|
| `layout` | Drawer/overview layout order, hidden sections, placement on layout surfaces |
| `fields` | Create/update field definitions, lifecycle, visibility |
| `sections` | Section CRUD, reorder, field membership |
| `requirements` | Requirement policy proposals |
| `editability` | Editability + write-target proposals |
| `data_quality` | Integrity scans, recommendations (may be propose-only operations) |
| `explainability` | Read-only answers (“why can’t I edit tour date?”) |

### 4.2 Orchestrator routing (target)

Add route kind **`config_layout_assist`** with precedence **after** `workflow_assist`, **before** or **merged with** narrow `job_layout` (product decision in Card 8):

- Field/layout/section/visibility/requirement/editability language → Config/Layout Assist.
- Keep existing **`job_layout`** path working until merged — avoid regressing job overview semantic preview.

### 4.3 Non-goals (boundary)

- Four separate agents (FieldsAgent, LayoutAgent, …) in V1.
- Autonomous apply or “fix all warnings” batch without per-proposal approval.
- Mutating **`field_values`** or entity records as part of config assist.
- NL→raw SQL or NL→Supabase client patches.

---

## 5. Proposal contract

### 5.1 `ConfigurationProposal` (V1 shape)

Structured object returned by propose endpoints and stored if durable persistence ships.

```ts
export type ConfigurationProposalRiskLevel = "low" | "medium" | "high";
export type ConfigurationProposalApplyMode = "single_operation" | "batched_atomic" | "recommendation_only";

export type ConfigurationProposalOperationKind =
  | "create_field"
  | "update_field"
  | "set_field_requirement"
  | "set_field_editability"
  | "set_field_write_target"
  | "create_section"
  | "update_section"
  | "move_field_to_section"
  | "expose_field_on_layout"
  | "hide_field_on_layout"
  | "reorder_layout_section"
  | "update_option_set"
  | "data_quality_recommendation";

export type ConfigurationProposalOperationV1 = {
  kind: ConfigurationProposalOperationKind;
  /** Stable id within proposal for UI diff rows. */
  operation_id: string;
  /** Target entity type (person, opportunity, job, …). */
  entity_type: string;
  /** Optional field_definition id or field_key. */
  field_key?: string | null;
  field_definition_id?: string | null;
  section_key?: string | null;
  layout_key?: string | null;
  surface?: string | null;
  /** Operation-specific payload — validated per kind on apply. */
  payload: Record<string, unknown>;
  /** Optimistic concurrency hints when applying. */
  expected_updated_at?: string | null;
  expected_config_version?: number | null;
};

export type ConfigurationProposalV1 = {
  version: 1;
  id: string;
  intent: string;
  category:
    | "field"
    | "layout"
    | "section"
    | "requirement"
    | "editability"
    | "option_set"
    | "data_quality"
    | "explainability";
  summary: string;
  rationale: string;
  impacted_entities: string[];
  impacted_layouts: { entity_type: string; surface: string; key: string }[];
  impacted_fields: { entity_type: string; field_key: string; field_definition_id?: string }[];
  proposed_operations: ConfigurationProposalOperationV1[];
  warnings: string[];
  permission_requirements: string[];
  risk_level: ConfigurationProposalRiskLevel;
  requires_approval: boolean;
  apply_mode: ConfigurationProposalApplyMode;
  created_by: string;
  generated_by: "deterministic" | "model_assisted";
  created_at: string;
  /** Optional read-only explainability payload for “why” questions. */
  explainability?: Record<string, unknown> | null;
};
```

**Invariants:**

- `requires_approval === true` for any mutating `apply_mode` except explicit future org policy exceptions (default **deny**).
- `data_quality_recommendation` operations use `apply_mode: "recommendation_only"` unless paired with explicit mutating ops the human selects.
- Proposal JSON is **never** operational truth — config tables + RRS remain authoritative until apply succeeds.

---

## 6. Apply / approval model

### 6.1 States

| State | Meaning |
|-------|---------|
| `draft` | Generated; not reviewed. |
| `reviewed` | Operator opened diff; no decision. |
| `approved` | Human approved; apply not yet attempted. |
| `applied` | Server apply succeeded; audit + read-after-write OK. |
| `rejected` | Human declined. |
| `failed` | Apply attempted; terminal error (stale version, validation, permission). |
| `rolled_back` | Forward-fix revert proposal applied (not DB PITR). |

### 6.2 Flow

```
Orchestrator command
  → ConfigurationLayoutAssistService (parse intent, read config)
  → ConfigurationProposal (ephemeral or persisted)
  → human review (proposal card: diff, warnings, permissions)
  → permission check (config_assist.* + domain keys)
  → authoritative admin API / DEFINER RPC (per operation kind)
  → audit log (admin + agent apply audit when present)
  → read-after-write verification (GET effective preview / field definition)
```

**No AI-only write path.** Client cannot PATCH config tables directly with proposal blobs.

---

## 7. Permission model

### 7.1 Proposed permission keys (seed in Card 7)

| Key | Purpose |
|-----|---------|
| `config_assist.generate` | Call propose / explain / DQ read endpoints. |
| `config_assist.review` | View others’ proposals (if durable). |
| `config_assist.apply` | Execute approved proposals. |
| `fields.manage` | Field definition CRUD (human or assist apply). |
| `fields.requirements.manage` | Requirement policy mutations. |
| `fields.editability.manage` | Editability / write-target mutations. |
| `sections.manage` | Section CRUD/reorder. |
| `layouts.manage` | Layout JSON mutations. |
| `option_sets.manage` | Option set/item mutations. |
| `data_quality.view` | Run integrity reports without apply. |

### 7.2 Layering

| Layer | Gate |
|-------|------|
| **Org policy** | `metadata.ai_policy.allowed_features` includes e.g. `config_layout_assist_draft` (name TBD in Card 7). |
| **Portal** | Compatibility `admin` for apply in V1 default (mirror Workflow Assist — ops read-only unless product widens). |
| **Grants** | `permissionKeys` from `getAdminAccessContextCached` for fine-grained roles. |
| **Field-level editability** | Resolved at apply time from **editability policy** (§3.B) — Assist must not bypass. |

---

## 8. UX inside Orchestrator

All UX lives in the **Orchestrator thread** — proposal action cards, no separate AI settings page required for V1.

### 8.1 Example prompts → behavior

| Prompt | Expected behavior |
|--------|-------------------|
| “Create Preferred Start Date for opportunities.” | Propose `create_field` + optional `expose_field_on_layout`; show impact on `field_definitions` + layout surfaces. |
| “Make subsidy tier visible in the summary.” | Propose `expose_field_on_layout` with `drawer_summary` surface; diff visibility/placement. |
| “Expose Location in every drawer header.” | Multi-layout scan + batched ops with warnings if header placement unsupported for entity. |
| “Make First Name editable from opportunity but update the person record.” | Propose `set_field_write_target` + `set_field_editability` with related-record write path. |
| “Show me fields that are required but not visible.” | `data_quality` / explain card — **recommendation_only** or linked mutating ops. |
| “Which layouts are inconsistent?” | Integrity report card listing `LayoutIntegrityReportV1` findings. |
| “Why can’t I edit tour date?” | Explainability card: `action_controlled` + link to tour scheduling / workflow docs. |

### 8.2 Proposal card contents

- **Proposal card** with summary + risk badge.
- **Impact summary** (entities, layouts, fields).
- **Before/after diff** (JSON or field-level rows).
- **Warnings** (integrity, permissions, destructive risk).
- **Role/permission requirements** (disabled Apply until satisfied).
- **Approve / Apply** (admin-gated; separate Review if durable workflow).
- **Source ownership & write target** explainer for related-record fields.

---

## 9. Implementation cards

*Execute in order. Do not skip Card 0 doctrine lock.*

---

### Card 0 — Audit + doctrine lock

**Goal:** Lock this document’s §2 audit and §Card 0 table; confirm no implementation contradicts proposal-only doctrine.

**Files likely touched:** This doc only; optional cross-links in `docs/product/ai-system.md` when first route ships.

**Acceptance criteria:**

- [ ] Stakeholders agree: **no autonomous config mutation**.
- [ ] Audit table reviewed against `docs/supabase/reference/*.csv` for listed tables.
- [ ] Gap list (§3) accepted as prerequisite work.

**Non-goals:** Product code; migrations.

**Tests:** N/A (doc gate).

---

### Card 1 — Field requirement policy model

**Goal:** Introduce validated requirement policy on `field_definitions` (or `config.requirement_policy` jsonb) supporting §3.A modes.

**Files likely touched:**

- `supabase/migrations/*_field_requirement_policy.sql` (new)
- `web/lib/fields/fieldRequirementPolicy.ts` (new)
- `web/app/api/admin/field-definitions/route.ts`, `[id]/route.ts`
- Entity save validators (opportunity/job PATCH paths) — **Needs verification** per entity
- `docs/system/configuration-system.md`

**Acceptance criteria:**

- [ ] Policy schema validated on admin create/update.
- [ ] At least `required`, `optional`, `required_on_save` enforceable server-side on one entity (opportunity recommended).
- [ ] Soft warning path does not block save when configured as warning-only.

**Non-goals:** Agent propose/apply; UI for every mode.

**Tests:**

- Unit: policy parse + validation matrix.
- Integration: save rejected when `required_on_save` violated.

---

### Card 2 — Field editability / ownership / write-target model

**Goal:** Model §3.B–C per placement; integrate with RRS/drawer write resolution.

**Files likely touched:**

- `supabase/migrations/*_field_placement_policy.sql` (new table or jsonb — **document choice in migration**)
- `web/lib/fields/fieldEditabilityPolicy.ts`, `fieldWriteTargetResolve.ts`
- `web/lib/rrs/**`, `web/lib/admin/entityFieldRegistryAttach.ts`
- Admin PATCH paths for related-record writes (e.g. person fields from opportunity drawer)

**Acceptance criteria:**

- [ ] Opportunity layout can declare person name fields with `write_target_entity: person`.
- [ ] `action_controlled` + `system_controlled` honored on apply and drawer render.
- [ ] Explainability helper returns `lock_reason` for a field key.

**Non-goals:** Full multi-entity layout editor; LLM.

**Tests:**

- Unit: write-target resolution for person-on-opportunity.
- Integration: tour-date field remains read-only on opportunity PATCH.

---

### Card 3 — Section management model

**Goal:** Safe section CRUD + reorder APIs aligned with §3.D; “safe delete” preflight.

**Files likely touched:**

- `web/app/api/admin/field-sections/route.ts`, `[id]/route.ts`
- `web/lib/fields/sectionManagement.ts` (new)
- Layout JSON merge helpers

**Acceptance criteria:**

- [ ] Cannot delete section with assigned fields without explicit force flag (admin-only).
- [ ] Reorder persists `sort_order` and reflects in effective drawer preview.

**Non-goals:** Agent routing.

**Tests:**

- API: delete blocked when fields reference `section_key`.
- API: reorder permutations.

---

### Card 4 — Layout placement / integrity validator

**Goal:** `LayoutIntegrityReportV1` implementing §3.F checks across effective layouts + field registry.

**Files likely touched:**

- `web/lib/config/layoutIntegrityValidator.ts` (new)
- `web/app/api/admin/record-layouts/effective-preview/route.ts` (extend or sibling route)
- `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts`

**Acceptance criteria:**

- [ ] Detects required-but-not-visible and editable-without-write-target cases with stable issue codes.
- [ ] Read-only endpoint usable by Settings and future Assist.

**Non-goals:** Auto-fix; agent UI.

**Tests:**

- Fixture layouts producing each warning class.
- Regression: option field with no active options.

---

### Card 5 — ConfigurationProposal contract

**Goal:** TypeScript types + validators for §5.1; deterministic propose for one vertical slice (e.g. `create_field` on opportunity).

**Files likely touched:**

- `web/lib/agent/configLayoutAssist/configurationProposalV1.ts` (new)
- `web/lib/agent/configLayoutAssist/configurationLayoutAssistService.ts` (new)
- Tests under `web/tests/agent/configLayoutAssist/`

**Acceptance criteria:**

- [ ] Invalid operations rejected at parse time.
- [ ] `recommendation_only` proposals cannot call apply adapter.

**Non-goals:** Persistence; Orchestrator UI.

**Tests:**

- Unit: schema validation per `operation.kind`.
- Unit: permission_requirements populated from operation kinds.

---

### Card 6 — Proposal persistence + approval states

**Goal:** Durable `config_layout_assist_proposals` + `apply_audit` (or reuse generalized agent proposal table if adopted) with states §6.1.

**Files likely touched:**

- `supabase/migrations/*_config_layout_assist_proposals.sql`
- RLS policies mirroring `agent_v2_field_visibility_*`
- Optional DEFINER `config_layout_assist_commit_apply` if multi-row atomic apply needed

**Acceptance criteria:**

- [ ] State transitions enforced server-side (`approved` → `applied` only via apply route).
- [ ] Ephemeral propose still supported when persistence disabled by env.

**Non-goals:** LLM generation.

**Tests:**

- Integration: stale proposal cannot apply twice.
- RLS: cross-org proposal denied.

---

### Card 7 — Permission checks

**Goal:** Seed §7.1 keys; wire `getAdminAccessContextCached.permissionKeys` + org `ai_policy` feature flag.

**Files likely touched:**

- `supabase/migrations/*_config_assist_permissions.sql`
- Propose/apply routes (new under `web/app/api/admin/ai/config-layout-assist/`)
- `docs/system/roles-and-permissions.md`, `docs/product/ai-system.md`

**Acceptance criteria:**

- [ ] User without `config_assist.apply` receives 403 on apply.
- [ ] Generate allowed with `config_assist.generate` + policy feature.

**Non-goals:** Per-field grant editor UI.

**Tests:**

- Mirror `web/tests/ai/aiEnrichmentRouteAccess.test.ts` patterns.

---

### Card 8 — Orchestrator routing

**Goal:** `config_layout_assist` route in `commandSurfaceRouter.ts`; thread card type; slot extract for field/layout language.

**Files likely touched:**

- `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts`
- `commandSurfaceSlotExtract.ts`, `commandSurfaceThreadTypes.ts`
- `AICommandSurfaceShell.tsx`, `CommandSurfaceThread.tsx`
- `web/tests/adminV2/commandSurfaceRouter.test.ts`

**Acceptance criteria:**

- [x] Field/layout NL routes to Config/Layout Assist, not Task Assist.
- [x] Job layout commands remain functional (explicit regression tests).

**Non-goals:** Full NL understanding (deterministic keywords first).

**Tests:**

- Router fixtures for §8.1 example phrases (substring/slot based).

---

### Card 9 — Proposal card UX

**Goal:** Thread action card showing §8.2 (diff, warnings, permissions, ownership explainer).

**Files likely touched:**

- `web/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistProposalCard.tsx` (new)
- `AICommandSurfaceShell.tsx` apply handlers

**Acceptance criteria:**

- [x] Apply only from Settings after approval (Orchestrator card links to review; no thread Apply).
- [x] Before/after visible for operations in Settings detail.

**Non-goals:** Settings page redesign.

**Tests:**

- Component/contract tests for disabled Apply states.

---

### Card 10 — Apply adapters through existing APIs

**Goal:** Map each `ConfigurationProposalOperationKind` to authoritative admin API or existing agent RPC — **no parallel write path**.

**Files likely touched:**

- `web/lib/agent/configLayoutAssist/applyConfigurationProposal.ts` (new)
- Reuse: `field-definitions`, `field-sections`, `record-drawer-layouts`, `option-sets`, `agent/v2/field-visibility`, `agent/v1/record-overview-layout` where applicable
- `logAdminAudit`

**Acceptance criteria:**

- [x] Apply uses same validators as human Settings saves (`mergeFieldDefinitionPoliciesFromBody`, field key rules).
- [ ] Stale version returns structured `failed` with safe message (deferred — no lock timestamp on apply yet).
- [x] Read-after-write re-fetches field definition after patch.

**Non-goals:** New Supabase tables for field values.

**Tests:**

- Integration per operation kind (mock Supabase).
- Assert no `supabase.from(...).update` in propose path.

---

### Card 11 — Data quality / explainability queries

**Goal:** Read-only endpoints for §3.F and “why can’t I edit X?” using Card 4 validator + Card 2 explainability.

**Files likely touched:**

- `web/app/api/admin/ai/config-layout-assist/analyze/route.ts`
- `web/app/api/admin/ai/config-layout-assist/explain-field/route.ts`
- `configurationLayoutAssistService.ts` explainability domain

**Acceptance criteria:**

- [ ] Returns `ConfigurationProposal` with `category: "data_quality"` or `explainability` and `apply_mode: "recommendation_only"` when appropriate.
- [ ] No mutations in analyze/explain handlers.

**Non-goals:** LLM answers without structured `lock_reason`.

**Tests:**

- Explain tour-date returns `action_controlled`.
- DQ lists required-but-hidden fields from fixture org.

---

### Card 12 — Tests and safety hardening

**Goal:** Full §10 matrix; env kill switches; documentation sync.

**Files likely touched:**

- `web/tests/agent/configLayoutAssist/**`
- `docs/product/ai-system.md`
- Optional: `AGENT_CONFIG_LAYOUT_ASSIST_ENABLED` env

**Acceptance criteria:**

- [ ] All §10 scenarios covered in CI.
- [ ] Feature flag defaults off in production until pilot org policy set.

**Non-goals:** LLM classification.

**Tests:** See §10.

---

## 10. Testing strategy

| Scenario | Layer | Expected outcome |
|----------|-------|------------------|
| No direct DB mutation from propose | Unit/integration | Propose handlers only read; no writes without apply. |
| Required field not visible warning | Card 4 + 11 | Integrity issue surfaced; recommendation_only proposal. |
| Editable related-person field → person write target | Card 2 + 10 | Apply PATCH person route (or shared helper), not opportunity column. |
| Tour date read-only / action-controlled | Card 2 + 11 | Explain + PATCH rejected on opportunity. |
| Role without permission cannot apply | Card 7 | 403 on apply route. |
| Proposal-only mode does not mutate | Card 5 + 10 | `recommendation_only` apply rejected. |
| Apply uses authoritative APIs | Card 10 | Spies/mocks show calls to admin routes or DEFINER RPCs only. |
| Stale config version fails safely | Card 6 + 10 | `failed` state; no partial silent merge. |
| Section create / update / reorder | Card 3 + 10 | Matches manual Settings behavior. |
| Layout consistency validator | Card 4 | Stable issue codes on fixtures. |
| Audit log emitted | Card 10 | `logAdminAudit` or agent apply audit row. |
| Read-after-write verification | Card 10 | Post-apply GET matches intended config. |

**CI entrypoints (when implemented):**

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- web/tests/agent/configLayoutAssist
cd web && npm run test -- web/tests/adminV2/commandSurfaceRouter.test.ts
```

---

## 11. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Approval bypass | Single server apply entrypoint; `config_assist.apply` + admin role default. |
| Config drift / stale apply | `expected_updated_at` / config version on every mutating operation. |
| Parallel write paths | Card 10 adapter map — code review blocks raw table updates in agent lib. |
| Over-scoped V1 | Cards 1–4 before agent UX; deterministic propose before LLM. |
| Global vs org layout confusion | Effective resolution helpers only; proposals target explicit `org_id`. |
| Destructive option/field delete | Usage collectors + explicit high-risk flag on proposal. |

---

## 12. Sources of truth

- `docs/system/configuration-system.md`, `docs/system/record-system.md`
- `docs/system/roles-and-permissions.md`, `docs/product/ai-system.md`
- `docs/sprints/05_2026/agent_interaction_layer_v1.md`, `workflow_assist_v1.md`, `task_assist_v1.md`
- `docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md` (agent proposal/audit precedent)
- Schema: `docs/supabase/reference/supabase_tables.csv`, `supabase_schema_columns.csv`

---

## 13. Open questions (Needs verification)

1. Merge **`job_layout`** Orchestrator route into Config/Layout Assist vs keep parallel until job overview parity is proven.
2. Whether requirement policies should live on **`field_definitions`** only or per-**placement** rows (recommended for status/action gates tied to surface).
3. Durable proposals in V1 vs ephemeral (Workflow Assist pattern) — default **ephemeral** until Card 6 compliance review.
4. Minimum entity scope for V1 apply adapters (**opportunity + person** recommended first).
5. Whether `record_layouts` (global) edits ever belong in tenant Assist or **platform-admin only**.

---

**When to update this doc:** Card 0 amendments; permission seed merged; first route shipped; schema migrations for §3 A–C land; intentional change to admin-only apply posture.
