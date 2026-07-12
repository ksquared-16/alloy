# Settings + Record UX Parity Sprint

**Path:** `docs/sprints/archive/05_2026/settings_record_ux_parity_sprint.md`  
**Status:** **Sprint complete (Cards 0–9 + post-closeout passes).** Shipped May 2026 — settings/record UX parity, field policy enforcement subset, layout integrity panel, action placement V1, opportunity workflow v1 layout sections, UX contract pass (four-plane copy + unified field modal). See **§12–§13**.  
**Prerequisites:** Step 0 audit (conversation / product hardening backlog); active docs: `docs/system/configuration-system.md`, `docs/archive/2026-06-superseded-system/record-system.md`, `docs/archive/2026-06-superseded-system/workspace-system.md`, `docs/archive/2026-06-superseded-system/actions-and-workflows.md`, `docs/execution/roadmap-and-gaps.md`, `docs/system/configuration-system.md`.  
**Program framing:** Operational completion + product hardening; **AI agent expansion paused** — this sprint does not expand Config/Layout Assist apply catalog or autonomous agents.

---

## 1. Sprint Goal

Make Alloy’s **operator experience coherent** by:

1. **Exposing existing configuration safely** in AdminV2 Settings (truthful copy, clear read-only vs editable surfaces, cross-links to related control planes).
2. **Wiring field requirement and editability policies** that already exist in schema/API into **server-side save enforcement** and **minimal Settings UI**.
3. **Improving resolver-backed record drawer UX** for save feedback, validation errors, dirty state, and read-only fields — **without** replacing `AdminEntityDrawer` or resolver-first reads.
4. **Cleaning up action button placement/visibility** on current surfaces using the **registry-first** path where safe — **not** a full migration off legacy `record_actions`.

Success means operators can trust that **what Settings says, what the drawer shows, and what the server rejects** align — within existing tables, APIs, and doctrine.

---

## 2. Why This Matters

Alloy is past architecture proof. Pilots and internal ops depend on **config-driven** CRM/workspace behavior, but today:

- Settings surfaces historically mixed **fully editable**, **read-only inventory**, and **stale marketing copy** (e.g. Attention & SLA labeled inactive while a full editor exists) — **addressed in Cards 1–9 and post-closeout passes**; see §12–§13 for current shipped state.
- `field_definitions.requirement_policy` and `interaction_policy` are **shipped in DB and PATCH APIs** but **not exposed in Fields settings** and **not enforced on drawer save** (`evaluateFieldRequirementViolations` is test/lib-only for mutations).
- The record drawer (`AdminEntityDrawer.tsx`, ~13k lines) uses **blur-to-save** and **admin-only `canMutate`**, while **two action systems** (`action_definitions` + legacy `record_actions`) create duplicate opportunity mutation paths.
- **~54 / 263** admin API routes use `getAdminAccessContextCached`; CRM entity paths are relatively strong, but settings remain **org-admin-wide** by design — operators need clarity, not surprise.

This sprint closes **parity and trust gaps** on stable primitives — aligned with roadmap items 4–7 in `docs/execution/roadmap-and-gaps.md` — without a platform rewrite.

---

## 3. Current State Summary

> **Note:** This table is the **Step 0 / sprint-start** snapshot. **Post-sprint shipped state** is in **§12–§13** and **`docs/system/configuration-system.md`**.

| Area | State | Evidence (repo) |
|------|--------|-------------------|
| **Settings hub** | **Implemented** — Organization, Records, Automation, Vocabulary, Layouts | `web/app/adminV2/settings/page.tsx` |
| **Fields settings** | **Implemented** — `is_required`, visibility flags, section_key; **no** policy JSON UI | `EntityFieldsClient.tsx`, `/api/admin/field-definitions` |
| **Field policies (schema)** | **Implemented** — columns + backfill migration | `20260523120000_field_policy_and_section_v1.sql`, `fieldRequirementPolicy.ts`, `fieldInteractionPolicy.ts` |
| **Policy enforcement on save** | **Missing** on PATCH routes | No `evaluateFieldRequirementViolations` in `web/app/api/admin/**` |
| **Drawer layouts** | **Partial** — effective resolution + opportunity workflow v1 **section order** only | `effectiveRecordDrawerLayout.ts`, `record-drawer-layouts/opportunity-workflow-v1-order` |
| **Layout integrity** | **Implemented** — API + Settings → Layouts read-only panel | `GET /api/admin/config/layout-integrity`, `LayoutIntegrityReportPanel.tsx` |
| **Attention & SLA Settings** | **Implemented** — PATCH department metadata | `attention-sla-rules/page.tsx`; index card text **stale** |
| **Actions registry** | **Implemented** resolve + execute; Settings **read-only** | `resolveActionsForContext.ts`, `executeAdminAction.ts`, `settings/actions/page.tsx` |
| **Legacy `record_actions`** | **Still used** for opportunities | `executeOpportunityRecordAction.ts` → direct opportunity PATCH |
| **Record read truth** | **Implemented** — jobs RRS, opportunity responder, entity GET | `entity/[type]/[id]/route.ts`, `opportunityEntityRecord.ts` |
| **Drawer editing** | **Partial** — many entity types; blur-save; ops read-only | `INLINE_EDIT_ENTITY_TYPES`, `AdminAuthProvider.canMutate` (admin only) |
| **Forms config** | **Product hub** — not on Settings index | `/adminV2/forms/**` |
| **Legacy admin** | **Parallel** routes | `/admin/system/**` sharing clients with AdminV2 Settings |

**Queue doctrine (unchanged):** Queue rows are preview/selection only; drawer and mutations must use entity GET / resolver payloads — see `docs/archive/2026-06-superseded-system/record-system.md`.

---

## 4. Scope

1. **Settings index truthfulness and parity cleanup** — fix stale copy; cross-link Forms and related areas; clarify read-only vs editable.
2. **Field policy UI** — required/optional + visibility/editability using existing PATCH columns; hide unsafe raw JSON.
3. **Server-side save enforcement** — wire policy evaluators into record mutation routes (phased by entity).
4. **Drawer UX consistency** — save bar, errors, dirty state, read-only display; **no** full drawer rewrite.
5. **Action placement/visibility cleanup** — registry-first on drawer/header/queue; isolate legacy paths; no full registry migration.
6. **Layout integrity visibility** — link existing integrity report from Settings/Layouts.
7. **Permissions verification** for new/changed paths; **document** ops mutate decision (default: **non-scope**).
8. **Tests + docs + roadmap alignment** as part of completion.

---

## 5. Non-Scope

- Full drag-and-drop layout builder or raw `config_json` editor without server validation
- Full **`record_actions` → `action_definitions` migration** or deleting legacy tables
- Autonomous / AI-agent expansion; Config/Layout Assist **apply catalog expansion**; Workflow Assist template expansion
- New record architecture or second drawer system
- Client-side privileged Supabase writes
- Replacing resolver-first record truth or using queue rows as authority
- Person/contact model redesign
- Full RRS migration for every entity type
- Enrollment Packet Phase 2, waitlist mutator, Reporting V1 (adjacent roadmap items)
- Status transition rules **editor** (remain migration/seed-driven unless explicitly pulled in)
- Changing **org-wide admin-only** settings gates to department-scoped settings (unless Card 7 explicitly documents and implements a narrow exception)

---

## 6. Doctrine / Implementation Rules

1. **Resolver-first record truth** — Drawer loads via `GET /api/admin/entity/[type]/[id]` (jobs: RRS surfaces; opportunities: `respondOpportunityEntityGet`). Do not treat queue list payloads as authoritative for edit or action payloads.
2. **Queues = preview** — Pass `entity_type` + `entity_id` (+ context keys) from queue gestures only.
3. **Config steers, code owns invariants** — Policies validate on server; JSON config does not replace auth, workflow side effects, or financial rules.
4. **No client-side privileged writes** — All mutations through Next admin API routes / server actions.
5. **Respect access** — CRM reads/mutations on opted-in routes use `getAdminAccessContextCached` + `accessScope.ts`; new scoped mutators must opt in. Settings catalog routes may remain org-admin-only; document behavior.
6. **Use existing patterns** — `fieldDefinitionPolicyWrite.ts`, `evaluateFieldRequirementViolations`, `resolveFieldEditability`, `validateStatusTransition`, `executeAdminAction`, `fetchEffectiveRecordDrawerLayout`.
7. **No new architecture** — Extend `AdminEntityDrawer`, `EntityFieldsClient`, and PATCH allowlists; extract **small helpers** only when it reduces duplicate risk in the drawer.
8. **Incremental cards** — One card per PR where practical; each card updates docs it touches.
9. **AI pause** — Do not expand Orchestrator routing or Config/Layout Assist apply scope as part of this sprint.

---

## 7. Target UX Model

### Settings / config control model

| Layer | Operator sees | Persists via | Notes |
|-------|----------------|--------------|-------|
| **Organization** | Communications, departments, work units (incl. queue JSON), placement priority, KPIs, users/roles | Existing admin APIs | Work-unit `metadata` mostly read-only in UI except placement priority |
| **Records — editable** | Fields, field-sections, statuses, entity-labels, tour availability, layouts (section order), attention/SLA (department) | PATCH routes as today | Fields gains **policy controls** (Card 2) |
| **Records — read-only inventory** | Status-transition-rules | None from UI | Copy explains seed/migration path |
| **Actions** | Org placement editor V1 (enable, label, surface/slot/section/order) | `action_placements`, `action_definitions` | Execution via Automations / `executeAdminAction`; not definition create |
| **Layouts** | Effective preview + integrity report + **opportunity workflow v1** section config (reorder, show/hide, rename, restore hidden) | `record_drawer_layouts` | Not Record Experience Builder |
| **Forms** | Linked from Settings index → `/adminV2/forms` | `form_definitions` etc. | Parity = navigation + doc, not moving forms into Settings |
| **Config proposals** | Existing review hub | Proposal lifecycle only | No new apply kinds in this sprint |

**Principle:** Every Settings tile states **editable | read-only | partial** in subtitle or helper text.

### Record editing model

| Concern | Target behavior |
|---------|-----------------|
| **Load** | Entity GET / resolver; `surface` param for opportunities/jobs as today |
| **Editable fields** | Driven by `interaction_policy` + legacy flags; read-only fields render as text/disabled with **lock reason** when available |
| **Who can edit** | Unchanged for sprint unless Card 7 explicitly changes: **`canMutate` = org admin** for inline edit |
| **Dirty state** | Consistent sticky indicator when snapshot differs from server row |
| **Save** | Explicit **Save** on sticky bar retained; blur-save may remain for low-friction fields but **must not** swallow server validation errors |
| **Create in drawer** | No expansion; keep existing “use list flow” messaging |

### Validation / save / error model

| Phase | Where enforced | Operator feedback |
|-------|----------------|-------------------|
| **Save** | PATCH handlers call `evaluateFieldRequirementViolations(..., { phase: "save" })` and respect `resolveFieldEditability` for field keys in body | 400 with structured `violations[]` (field_key, message) |
| **Status change** | Existing `validateStatusTransition` + optional `required_before_status_change` when status_key in PATCH | Existing error strings + field violations when added |
| **Action** | `executeAdminAction` / registry — optional `required_before_action` in follow-up | Action execute returns clear error JSON |
| **Client** | Map 400 violations to inline field highlights + `saveError` summary | No silent console-only failures |

### Action button model

| Surface | Resolution | Execute |
|---------|------------|---------|
| **Record header / section** | `GET /api/admin/actions` (registry) | `POST /api/admin/actions/execute` when mutating |
| **Queue row / right rail** | Same registry; avoid hardcoded duplicates where placement exists | Same execute path |
| **Legacy opportunity chrome** | **Audit list** — prefer registry; keep `record_actions` only where migration risk is high | `executeOpportunityRecordAction` deprecated in favor of registry **only** if Card 5 proves safe per action_key |
| **Placeholders** | `ui_intent` shows calm message; no fake success | Documented in Settings actions inventory |

**Rule:** Action conditions use **authoritative** status/metadata from server refetch after execute — document `hintOpportunityStatusKey` as best-effort only.

### Layout / integrity model

| Concern | Target |
|---------|--------|
| **Effective layout** | Unchanged resolution: org `record_drawer_layouts` → `record_layouts` template |
| **Integrity** | Admin runs **Layout integrity** report per entity type from Settings → Layouts; sees issues (required-but-hidden, invalid write target, etc.) from `validateLayoutIntegrityNow` |
| **Fix path** | Operator fixes via Fields + Layouts section order — **not** raw JSON editor in this sprint |

---

## 8. Proposed Card Breakdown

### Card 0 — Current-state audit checkpoint

**Purpose:** Lock sprint boundaries and record audit conclusions for implementers.

**Work:**

- Mark Step 0 audit complete in this doc (reference date).
- Confirm **in-scope / non-scope** tables match §4–§5.
- List **entity priority** for Cards 3–4: **Phase 1:** `opportunity`, `job`; **Phase 2 (if time):** `person`, `schedule`; defer catalog-only entities.
- Record **dual action inventory** snapshot: grep `record_actions`, `executeOpportunityRecordAction`, hardcoded job buttons — attach path list in card notes or `docs/system/configuration-system.md`.
- Confirm **ops mutate** default: **non-scope** (document only in Card 7).

**Acceptance:**

- [ ] This sprint doc merged with Card 0 section filled (entity priority + action inventory pointer).
- [ ] No code changes required for Card 0.

---

### Card 1 — Settings index truthfulness + parity cleanup

**Purpose:** Settings hub accurately describes what operators can change.

**Work:**

- **Fix stale copy** on `web/app/adminV2/settings/page.tsx`:
  - Attention & SLA: change from “Planned — UI not active” to **editable department metadata** (buckets + thresholds).
  - Actions: clarify **read-only inventory**; link to Automations/workflows.
  - Status transition rules: keep **read-only**; mention server enforcement on PATCH.
- **Cross-links:**
  - Add tile or footer link: **Forms** → `/adminV2/forms` (definitions/metadata parity).
  - Layouts tile: mention **integrity report** (Card 6 entry point — can ship stub link in Card 1 if Card 6 follows).
- **Read-only vs editable** — short helper on each tile category (Organization vs Records vs Layouts).
- Optional: redirect note on legacy `/admin/settings` and `/admin/system/*` — “prefer AdminV2 Settings” in `docs/system/configuration-system.md` only (no mass redirect implementation required).

**Files (expected):**

- `web/app/adminV2/settings/page.tsx`
- `docs/system/configuration-system.md` (Settings inventory table)

**Acceptance:**

- [ ] No Settings tile claims “not implemented” for shipped editors (attention-sla, work-units queue JSON, users-roles, etc.).
- [ ] Forms hub discoverable from Settings without implementing forms editor in Settings.
- [ ] Actions + status-transition-rules tiles explicitly **read-only**.

> **Post-closeout:** Actions gained **org placement editor V1** (Config Completion Pass); status-transition-rules remain read-only. See §12–§13.

---

### Card 1.5 / C0 — Drawer field-policy mapping adapter

**Purpose:** Safe mapping layer from `field_definitions.field_key` to real drawer/PATCH write paths for **opportunity** and **job** — **read-side only**. No enforcement, no drawer behavior change, no Settings policy UI.

**Work (implemented):**

- `web/lib/fields/drawerFieldPolicyAdapter.ts` — classifies each def into `storage`, `bodyKey`, `policyMode` (`enforceable` \| `display_only` \| `deferred` \| `never_policy_controlled`), and `requirementSupported` / `interactionSupported`.
- **Enforceable v1 subset:** custom non-system → `field_values`; opportunity natives `name`, `source`, `assigned_to`, `lost_reason`, `job_date`, `job_time_window`, `notes` (→ `metadata.notes`); job natives `title`, `description`, `service_key`, `job_type`, `scheduled_at`, `completed_at`, `service_frequency_key`, `is_recurring`.
- **Deferred / never:** status, quote/pricing/pipeline, tour/enrollment workflow fields, FKs, aliases (`customer_notes`), computed `_` keys, action paths.
- **GET enrichment:** `attachFieldDefinitionsAndValues` adds `is_required`, `requirement_policy`, `interaction_policy` on `_field_definitions` and `_field_policy_resolved` on opportunity/job entity GET (resolver-first paths unchanged).

**Files:**

- `web/lib/fields/drawerFieldPolicyAdapter.ts`
- `web/lib/admin/entityFieldRegistryAttach.ts`
- `web/tests/fields/drawerFieldPolicyAdapter.test.ts`

**Acceptance:**

- [x] Adapter unit tests cover enforceable, deferred, never, and attach enrichment.
- [x] No PATCH enforcement; drawer edit UX unchanged.
- [x] Card 2 UI must only edit policies for **enforceable** mapped keys (warn on others).
- [x] Card 3 enforcement must only target **enforceable** keys.

---

### Card 2 — Field policy UI foundation

**Purpose:** Expose existing policy columns in Fields settings without raw JSON editors.

**Prerequisite:** Card 1.5 — only expose/edit policies for fields where `_field_policy_resolved[field_key].policyMode === "enforceable"` (or show read-only warning for deferred/never).

**Work:**

- Extend `EntityFieldsClient.tsx` (and shared person/location clients if they duplicate — prefer single path via hub):
  - **Required mode:** dropdown mapping to `requirement_policy.mode`: `required`, `optional`, `required_on_save` (v1 set); hide advanced modes (`required_before_status_change`, `required_before_action`, `conditionally_required`) behind “Advanced” expando **or** defer to Phase 2 with doc note.
  - **Editability:** dropdown mapping to `interaction_policy.editability_mode`: `editable`, `read_only`, `system_controlled` (v1); show `ownership.write_target_*` read-only summary when `editable_through_related_record` / `action_controlled`.
  - On save PATCH: use existing `mergeFieldDefinitionPolicyWrite` / `fieldDefinitionPolicyWrite.ts` so `is_required` stays in sync with `requirement_policy`.
- Load existing policies when opening edit modal (parse failures → show legacy `is_required` only + warning).
- Table columns: optional compact “Policy” badge (Required / Optional / Read-only).

**API:** No new routes; `PATCH /api/admin/field-definitions/[id]` already accepts policies.

**Files (expected):**

- `web/components/admin/EntityFieldsClient.tsx`
- `web/lib/fields/fieldDefinitionPolicyWrite.ts` (if helper gaps)
- Possibly `web/app/admin/system/person-fields/PersonFieldsClient.tsx` — **only** if not fully funneled through hub; avoid duplicate UX.

**Acceptance:**

- [x] Operator can set required/optional and read-only/editable for an existing field without editing JSON (opportunity + job Fields settings only).
- [x] PATCH persists valid `requirement_policy` / `interaction_policy`; API rejects policy writes on non-enforceable fields.
- [x] Advanced modes not editable in UI (read-only warning; no accidental overwrite).

**Implemented:** `fieldPolicySettingsUi.ts`, `EntityFieldsClient.tsx` (Policy column + modal), `field-definitions/[id]` enforceable gate.

---

### Card 3 — Server-side field policy enforcement

**Purpose:** Server rejects saves that violate policies already stored on `field_definitions`.

**Prerequisite:** Card 1.5 — enforce only keys with `policyMode === "enforceable"` and matching `bodyKey` / `storage` from `drawerFieldPolicyAdapter`.

**Work:**

- Add shared helper e.g. `web/lib/fields/enforceFieldPoliciesOnPatch.ts`:
  - Input: orgId, entity_type, field definitions for entity, body patch map, phase (`save` | `status_change` | `action`), optional status_key / action_key.
  - Call `evaluateFieldRequirementViolations` + check editability for keys present in body (`resolveFieldEditability`).
  - Return `{ ok: true } | { ok: false, status: 400, violations: FieldRequirementViolation[] }`.
- Wire into **Phase 1** PATCH routes:
  - `web/app/api/admin/opportunities/[id]/route.ts` — after allowlist build, before DB update; include custom fields from `upsertFieldValuesFromBody` path.
  - `web/app/api/admin/jobs/[id]/route.ts` — same pattern.
- Load field defs via existing `attachFieldDefinitions` select shape or lightweight query (org_id + entity_type).
- **Do not** weaken `validateStatusTransition` — compose both errors when status changes.

**Phase 2 (optional same sprint):** `persons/[id]`, `schedules/[id]` PATCH.

**Files (expected):**

- New: `web/lib/fields/enforceFieldPoliciesOnPatch.ts`
- `web/app/api/admin/opportunities/[id]/route.ts`
- `web/app/api/admin/jobs/[id]/route.ts`
- Tests: `web/tests/fields/` (new file e.g. `fieldPolicyEnforcementOpportunityPatch.test.ts`)

**Acceptance:**

- [x] PATCH with missing required-on-save field returns **400** with field_key violations (opportunity + job).
- [x] PATCH updating read-only field (per interaction_policy) returns **400**.
- [x] Valid PATCH behavior unchanged when policies satisfied.
- [x] Enforcement runs before DB write; custom `field_values` upsert only after validation passes.

**Implemented:** `enforceDrawerFieldPoliciesOnPatch.ts`, wired in opportunity/job PATCH routes. Structured error: `{ error: "Field validation failed", violations: [{ field_key, code, message }] }`.

---

### Card 4 — Drawer validation/save UX

**Purpose:** Operators see policy and validation failures; dirty/save UX is predictable.

**Work (implemented — surgical edits + `web/lib/admin/drawer/` helpers):

- **Parse 400 violations** from opportunity/job PATCH via `parseDrawerFieldPolicySaveResponse`; `fieldValidationErrorsByKey` + global `saveError` summary.
- **Field-level errors** in `EntityDrawerOverview` / `EntityDrawerField`; **unmapped** violations listed in overview global alert when field not in current sections.
- **Policy chrome:** required `*` and read-only hint/disabled edit from `_field_policy_resolved` + `_field_definitions` (enforceable fields only).
- **Blur-save:** failed save keeps dirty `formData` and field errors; success clears field errors; editing a field clears its error.
- Sticky save bar unchanged; blur-save retained.

**Files:**

- `web/lib/admin/drawer/drawerSaveErrors.ts`, `web/lib/admin/drawer/fieldEditabilityInDrawer.ts`
- `web/components/admin/AdminEntityDrawer.tsx`, `EntityDrawerOverview.tsx`, `EntityDrawerField.tsx`
- `web/tests/admin/drawer/*.test.ts`

**Acceptance:**

- [x] Server policy rejection visible in drawer (field + global summary).
- [x] Read-only policy fields not editable in opportunity/job overview grids.
- [x] Field validation errors clear on successful save; dirty state preserved on failure.
- [ ] No new architecture; file size growth minimized via helpers.

---

### Card 5 — Action Surface Coherence

**Purpose:** Improve operator-visible consistency for action placement, feedback, and refresh — **not** a full action architecture migration.

**Work (implemented):**

- **Runtime inventory** — `docs/system/configuration-system.md` § Action surface runtime inventory (registry vs legacy vs hardcoded vs dedicated).
- **`actionSurfaceFeedback.ts`** — normalize errors; `dispatchOpportunityRecordUpdated` on mutating registry success.
- **Section registry actions** — inline errors; post-mutate `adminv2:opportunity-updated` (`OpportunityRecordSectionRegistryActions`, `OpportunityInquiryChildrenRegistryActions`).
- **Queue** — visible errors for registry + legacy `executeOpportunityRecordAction` failures (work-unit page); registry-first branch unchanged.
- **Header/section dedup** — `excludeActionKeys` on `family_contacts` and `customer_booking` sections (header keys from `opportunityRegistryHeaderActionKeys`).
- **Settings → Actions** — **Runtime executor** column via `classifyRegistryDefinitionExecutor`.
- **No changes** to `executeAdminAction`, `JOB_ACTIONS`, quote intake, tour modals, or `record_actions` table.

**Files:**

- `web/lib/admin/actions/actionSurfaceFeedback.ts`
- `web/tests/admin/actionSurfaceFeedback.test.ts`
- `web/components/admin/opportunity/OpportunityRecordSectionRegistryActions.tsx`
- `web/components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx`
- `web/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx`
- `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx`
- `web/app/adminV2/settings/actions/page.tsx`
- `web/components/admin/AdminEntityDrawer.tsx` (surgical: `excludeActionKeys` on customer_booking panel only)
- `docs/system/configuration-system.md`, `docs/archive/2026-06-superseded-system/actions-and-workflows.md`

**Acceptance:**

- [x] Documented runtime action inventory (sources, executors, refresh, migration stance).
- [x] Registry section actions show errors; mutating success dispatches `adminv2:opportunity-updated`.
- [x] Queue legacy failures visible to operators (not console-only).
- [x] No `executeAdminAction` / job / tour / quote semantic changes.
- [x] Settings Actions inventory includes runtime executor classification.

---

### Card 6 — Layout integrity operator visibility

**Purpose:** Admins see config health issues without raw JSON editing.

**Work (implemented):**

- `web/components/adminV2/settings/LayoutIntegrityReportPanel.tsx` on Settings → Layouts (`LayoutsSettingsClient.tsx`):
  - Entity type selector; manual **Run integrity check** → `GET /api/admin/config/layout-integrity?entity_type=…` (no auto-run).
  - Panel states: idle, loading, clean, issues, API error (with retry).
  - Summary issue count + error/warning breakdown; issues grouped by severity with category badges and operator titles.
  - Per-issue: message, recommendation, entity/section/field/layout target line; fix links to Fields, Field grouping, Layouts, Option sets as applicable.
- `web/lib/config/layoutIntegrityPresentation.ts` — read-only formatting helpers (no validation logic).
- `web/tests/config/layoutIntegrityPresentation.test.ts`
- Reuses existing `validateLayoutIntegrityNow` / `LayoutIntegrityReportV1` — no new validation engine, schema, or migrations.

**Files:**

- `web/components/adminV2/settings/LayoutIntegrityReportPanel.tsx`
- `web/lib/config/layoutIntegrityPresentation.ts`
- `web/tests/config/layoutIntegrityPresentation.test.ts`
- `web/app/adminV2/settings/layouts/LayoutsSettingsClient.tsx` (mount)
- `docs/system/configuration-system.md`, `docs/system/configuration-system.md`

**Acceptance:**

- [x] Operator can run integrity report for `opportunity` and `job` (and other supported entity types) from Settings → Layouts.
- [x] Report is read-only; copy explains fixes via Fields / Field grouping / Layouts section order — not inline JSON.
- [x] Unauthenticated/forbidden handled per existing admin API patterns (panel surfaces API error + retry).

---

### Card 7 — Permissions/access verification

**Purpose:** Verify Cards 1–6 respect org/CRM scope and document the admin vs ops mutation boundary. **Verification + docs** — no permission expansion.

**Work (completed):**

- **Settings/config routes:** `field-definitions` GET/PATCH org-scoped via `getAdminContextCached`; PATCH/POST require `ctx.role === "admin"`. Layout integrity GET org-scoped (read-only). Actions GET/execute/inventory use `requireAdminOrOps` + org context; execute passes `accessScope` into `executeAdminAction`. Record layout routes org-scoped; workflow v1 order PATCH admin-only.
- **Record PATCH:** Opportunity/job — `assertExistingOpportunityMutableInAdminScope` / `assertJobInAccessScope` run **before** `enforceDrawerFieldPoliciesOnPatch` (verified in route source + `settingsRecordUxParityAccess.test.ts`).
- **Actions:** `executeAdminAction` calls `assertEntityDrawerRecordReadable` when `accessScopeRestrictsData`. Legacy `executeOpportunityRecordAction` → same opportunity PATCH (scope applies). Card 5 client feedback is presentation-only (no privileged writes).
- **Drawer:** `canMutate` = portal **`admin`** role_key only (`hasPortalAdminMutateAccess`); ops mutate **deferred**.
- **Tests:** `web/tests/admin/settingsRecordUxParityAccess.test.ts` (portal mutate, PATCH order, field-def admin gate, execute scope wiring).

**Files:**

- `web/tests/admin/settingsRecordUxParityAccess.test.ts`
- `docs/archive/2026-06-superseded-system/roles-and-permissions.md`, `docs/archive/2026-06-superseded-system/record-system.md`, `docs/system/configuration-system.md`

**Acceptance:**

- [x] Checklist completed for sprint-touched routes (no missing scope gate found).
- [x] No new CRM mutator without scope helper introduced by Cards 1–6.
- [x] Ops mutate stance documented as **out of scope** / deferred.

---

### Card 8 — Tests + regression coverage

**Purpose:** Lock sprint behavior with focused unit/source-order tests (no broad RTL).

**Work (completed):**

- Extended sprint-area tests: `actionSurfaceFeedback`, `enforceDrawerFieldPoliciesOnPatch`, `layoutIntegrityPresentation`, `fieldPolicySettingsUi`.
- Manifest: `web/tests/sprints/settingsRecordUxParityRegression.test.ts` — lists all sprint Vitest paths + regression expectation map.
- **RTL omitted** for `LayoutIntegrityReportPanel` / full `AdminEntityDrawer` (documented in manifest — helpers/API contracts covered instead).

**Commands:**

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/settingsSurfaceModes.test.ts tests/fields/ tests/admin/drawer/drawerSaveErrors.test.ts tests/admin/drawer/fieldEditabilityInDrawer.test.ts tests/config/layoutIntegrityPresentation.test.ts tests/config/layoutIntegrityValidator.test.ts tests/admin/actionSurfaceFeedback.test.ts tests/admin/settingsRecordUxParityAccess.test.ts tests/sprints/settingsRecordUxParityRegression.test.ts
```

**Acceptance:**

- [x] Sprint regression expectations covered by unit/source-order tests (see manifest).
- [x] No regression in existing field policy tests.
- [x] CI commands recorded above.

---

### Card 9 — Docs + roadmap update

**Purpose:** Active docs and roadmap reflect shipped vs deferred work.

**Work (completed):** §12 Sprint closeout + updates to `roadmap-and-gaps.md`, `configuration-system.md`, `record-system.md`, `actions-and-workflows.md`, `roles-and-permissions.md`.

**Acceptance:**

- [x] Shipped vs deferred lists explicit (§12).
- [x] `requirement_policy` enforced on save for opportunity/job enforceable subset.
- [x] BOS/config-agent readiness note (control plane vs future agent).

---

## 9. Acceptance Criteria

### Sprint-level (all cards complete)

- [x] Settings hub copy matches runtime capabilities (editable vs read-only).
- [x] Fields settings can edit required/optional and basic editability without JSON (enforceable subset).
- [x] Opportunity and job PATCH enforce save-phase field policies with structured 400 errors.
- [x] Drawer displays those errors and respects read-only editability for config-driven fields (opportunity/job).
- [x] Action surface coherence (feedback, inventory, dedup) — not full registry migration.
- [x] Layout integrity report runnable from Settings → Layouts.
- [x] Permissions verification checklist signed off; ops mutate deferred.
- [x] Tests added per Card 8; docs updated per Card 9.
- [x] No client-side service-role writes; no queue-as-truth regressions introduced.

### Card-level

See **Acceptance** checklists under each card in §8.

---

## 10. Test Strategy

| Layer | What to test | Tools |
|-------|----------------|-------|
| **Unit** | Policy parse/merge, violation evaluation, editability resolution, drawer error mapping | Vitest — `web/tests/fields/`, `web/tests/admin/` |
| **Route integration** | Opportunity/job PATCH 400/200 with mocked or test DB patterns used in repo | Vitest route tests (follow `enrichAttentionSuggestionRoute.test.ts` patterns) |
| **Component** | Layout integrity panel renders severities; optional Fields policy dropdown labels | RTL — keep minimal |
| **Manual** | Settings walkthrough; drawer save with required field empty; scoped user 404 on out-of-scope opportunity | Checklist in PR template |
| **E2E** | **Not required** for sprint — auth fixtures insufficient today (per access hardening sprint note) |

**Regression focus:** `AdminEntityDrawer` opportunity workflow v1 section order; existing `executeAdminAction` tests in `web/tests/agent/` if touched.

---

## 11. Risk Controls

| Risk | Mitigation |
|------|------------|
| **13k-line drawer** | Card 4 uses extracted helpers; avoid drive-by refactors; one entity flow at a time; contract tests for error JSON |
| **Dual action system** | Card 5 inventory-first; migrate only proven duplicates; keep `record_actions` until documented zero-use |
| **Blur-to-save** | Card 4: explicit Save + visible errors; do not add new blur-only paths without error surfacing |
| **Admin-only mutation** | Document ops limitation (Card 7); avoid implying ops can edit in Settings copy |
| **Config/runtime mismatch** | Card 6 integrity report; Card 3 server enforcement; Card 2 UI syncs `is_required` |
| **Queue preview as truth** | Code review: no new `queueRow.field` → PATCH; entity refetch after action execute |
| **Org-wide field PATCH by dept admin** | Document in Card 7; do not expand scope accidentally |
| **Policy rollout breaks saves** | Phase entities only; start with `optional` default from backfill; monitor 400 rates in staging |
| **hintOpportunityStatusKey wrong actions** | Refetch actions after execute; document transient wrong UI in Card 5 |

---

## 12. Required Documentation Updates

Must land before sprint is **closed** (can land incrementally per card):

1. `docs/system/configuration-system.md` — field policies UI + enforcement; layout integrity entry
2. `docs/archive/2026-06-superseded-system/record-system.md` — drawer validation/save; read-only semantics
3. `docs/execution/roadmap-and-gaps.md` — checklist items 4–6 progress
4. `docs/system/configuration-system.md` — Settings truth table; integrity; actions inventory
5. `docs/archive/2026-06-superseded-system/actions-and-workflows.md` — **if** Card 5 changes primary execute path for any shipped action
6. `docs/archive/2026-06-superseded-system/roles-and-permissions.md` — **if** Card 7 documents ops mutate deferral or changes
7. This file — update **Status** line per card completion

---

## 13. Cursor Implementation Protocol

Implement **one card per task** unless dependencies require pairing (e.g. Card 2 before Card 3). **Recommended order:** `1 → 1.5 (C0) → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9`. **Do not** skip docs on behavior-changing cards.

Each implementation handoff **must** include:

1. **Files changed** — paths list
2. **What was implemented** — map to card acceptance criteria
3. **Tests added/updated** — file paths + what they assert
4. **Commands run** — e.g. `npx tsc --noEmit`, targeted `npm run test -- …`, `npm run lint`
5. **Risks / follow-ups** — out-of-scope discoveries, deferred keys, staging verification notes
6. **Docs updated** — which topic files; link to sections
7. **Recommended next card** — explicit ID (e.g. “Card 3 after Card 2”)

**Order recommendation:**

`0` (done) → `1` → `2` → `3` → `4` → `6` (can parallel with 4 after 3) → `5` → `7` → `8` → `9`

Cards **3 + 4** should land close together so operators are not blocked by errors they cannot see.

**Before coding any card:** Read `docs/execution/operating-doctrine.md` and the topic files listed in Prerequisites.

---

## 12. Sprint closeout (Cards 8–9, May 2026)

### Shipped this sprint

| Deliverable | Cards | Primary surfaces |
|-------------|-------|------------------|
| Settings index truthfulness + parity copy | 1 | `/adminV2/settings` |
| Configurable-but-unexposed inventory table | 1 | `configuration-system.md` |
| Drawer field-policy mapping adapter (`_field_policy_resolved`) | 1.5 | Opportunity/job entity GET |
| Field policy UI (enforceable opportunity/job fields) | 2 | Settings → Fields |
| Server-side policy enforcement on PATCH | 3 | Opportunity/job PATCH APIs |
| Drawer validation/save UX (violations, chrome, blur-save) | 4 | `AdminEntityDrawer` overview |
| Action Surface Coherence (feedback, dedup, inventory) | 5 | Drawer sections, queue, Settings → Actions |
| Layout integrity operator panel | 6 | Settings → Layouts |
| Permissions/access verification | 7 | Docs + source-order tests |
| Regression test manifest | 8 | `web/tests/sprints/settingsRecordUxParityRegression.test.ts` |

### Deferred / future (explicitly not this sprint)

- Settings IA redesign / visual facelift
- **BOS AI command** as future primary configuration interface (not implemented)
- Full drag-and-drop **layout builder**; raw `config_json` editor
- Full **action_definitions** migration; **`record_actions` retirement**
- **Ops mutate** via permission keys (drawer `canMutate` stays admin-only)
- Expanding policy enforcement beyond opportunity/job **enforceable** subset
- More native/computed fields in enforceable map (status, tour, quote, pricing, FKs)
- Status/tour/quote **dedicated flows** remain separate execute paths
- Broader **admin route access inventory** (grep maintenance)
- **End-to-end UI tests** for drawer/settings (RTL omitted — see Card 8 manifest)
- Config/Layout Assist **apply catalog expansion** (program pause unchanged)

### BOS / configuration-agent readiness

**Today:** AdminV2 **Settings** is the safety and control plane for org configuration. Operators (and engineers via seeds/migrations) change field definitions, layouts, actions, queues, and related metadata through documented admin APIs and read-only inventories.

**This sprint improved machine-readable visibility** for agents and implementers: capability inventory, action runtime executor labels, layout integrity reports, field-policy write maps, and structured PATCH violation contracts. **No new autonomous configuration agent behavior** was added.

**Future BOS configuration agents** should consume **structured inventories and config contracts** (`action_definitions`, `field_definitions`, integrity reports, parity docs) — not scrape React UI. Agents must still respect server gates (`executeAdminAction`, PATCH scope, admin-only field-def PATCH).

### Regression tests (Card 8)

Run:

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/sprints/settingsRecordUxParityRegression.test.ts
# Or full sprint bundle — paths listed in that file's SETTINGS_RECORD_UX_PARITY_TEST_PATHS
```

### Settings UX repair passes (post-closeout, May 2026)

**Pass 1:** Operator IA on Settings index (diagnostics section), Fields filtering/labels, modal copy; interim Layouts/Actions framing (superseded by Pass 3–4).

**Pass 2 (Settings UI before drawer QA):**

| Area | Change |
|------|--------|
| Settings index | `max-w-6xl` two-column layout — main config grid + sticky diagnostics sidebar |
| Fields | Inline Required dropdown with immediate save + Saved feedback; locked reasons per field; modal defers Required when editable inline |
| Layouts | Entity tabs (opportunity/job/schedule); interim section UI (superseded by Config Completion Pass) |
| Actions | Interim inventory/diagnostics UI (superseded by placement editor V1) |
| Tests | `fieldSettingsOperatorUi`, `layoutsSettingsEntities`, `actionInventoryDiagnostics` |

**Pass 3 (Fields polish only, before drawer QA):**

| Area | Change |
|------|--------|
| Fields table | Policy-editable opportunity/job fields: inline Required select (Optional / Required / Required when saving) with immediate PATCH + Saving…/Saved; locked fields show operator reason only |
| Fields modal | Operator sections only by default; technical fields behind collapsed **Developer details** |
| Tests | `fieldRequiredInlineUi`, `fieldEditModalOperatorUi`, `fieldSettingsOperatorUi.pass3` |

**Settings Config Completion Pass (May 2026 — core control plane V1):**

| Area | Shipped |
|------|---------|
| Fields (A) | Inline Required select + operator modal (Pass 3) |
| Layouts (B) | Opportunity workflow v1: reorder, show/hide, rename workflow virtual titles, **Show hidden section**; `PATCH …/opportunity-workflow-v1-sections`; `editor_sections` on effective-preview |
| Actions (C) | Org-scoped placement editor: enable/disable, label (org definitions), surface/slot/section/order on record surfaces; `PATCH /api/admin/action-placements/[id]`, `PATCH /api/admin/action-definitions/[id]` (label), `POST /api/admin/action-placements` |

**Still not editable in Settings UI:** platform-global placements/definitions; queue/work-unit scoped placements; raw `condition_config` JSON; new workflow virtual sections (only show hidden + rename existing); job/schedule layout section builder; status transition rules; action definition create/migrate.

**BOS / config-agent readiness:** Layout and placement mutations are structured PATCH bodies with validation helpers (`opportunityWorkflowV1SectionConfig.ts`, `actionPlacementMutation.ts`) — suitable for future agent proposals without raw JSON editors.

**Settings UX Contract pass (Fields + IA, May 2026):**

| Area | Change |
|------|--------|
| Four-plane copy | Fields, Field grouping, Layouts, Actions hubs aligned to control-plane doctrine |
| Field modal | `FieldDefinitionEditModal` + `buildFieldEditModalCapabilities` — operator sections default; Developer details collapsed |
| Field list | Operator labels only; workflow/relationship/computed keys hidden by default |
| Not in pass | Person/Location modal unification; Layouts/Actions builder expansion |

**Post-closeout follow-on (May 2026, after sprint close):** Linked-record person card + inquiry children row grid + Orchestrator session hydration + workspace scope stability — not counted as Cards 0–9 scope; tracked in **`completed/settings_control_plane_closeout.md`** (follow-on shipped) and **`linked_record_field_editing_v1.md`**.

---

## 13. Final control-plane doctrine (post-sprint)

Canonical reference: **`docs/system/configuration-system.md`**.

| Plane | Owns | Does not own |
|-------|------|----------------|
| **Fields** | Registry + policies on `field_definitions` | Drawer section order; button placement |
| **Field grouping** | Catalog taxonomy (`field_section_definitions`) | Workflow virtual section titles |
| **Layouts** | Drawer composition (`record_drawer_layouts`) | Field policies; arbitrary new workflow virtuals with custom `field_keys` |
| **Actions** | Placement + enablement (`action_placements`) | Execution (`executeAdminAction`, workflows) |
| **Automations** | Workflow execution semantics | Placement rows |
| **Forms** | Form definitions/versions (hub) | Action payload editing in Settings |

**Control plane vs runtime:** Settings configures structure/presentation/policies; runtime PATCH and workflows execute operational logic. **BOS/AI** should orchestrate via structured PATCH helpers — not raw JSON mutation.

**Next strategic layers (deferred):** Record Experience Builder; BOS/AI config layer; linked-record editing beyond opportunity V1/V1b (job/schedule); structured condition builders; workflow-driven actions/forms wiring from Settings.

---

## Appendix A — Key file index (implementation quick reference)

| Concern | Path |
|---------|------|
| Settings index | `web/app/adminV2/settings/page.tsx` |
| Fields UI | `web/components/admin/EntityFieldsClient.tsx`, `web/components/admin/fields/FieldRequiredInlineCell.tsx`, `web/components/admin/fields/FieldDefinitionEditModal.tsx` |
| Fields operator UI helpers | `web/lib/fields/fieldSettingsOperatorUi.ts`, `fieldRequiredInlineUi.ts`, `fieldEditModalOperatorUi.ts` |
| Layout section config V1 | `web/lib/admin/opportunityWorkflowV1SectionConfig.ts`, `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections/route.ts`, `OpportunityWorkflowV1SectionsEditor.tsx` |
| Action placement editor V1 | `web/lib/admin/actions/actionPlacementMutation.ts`, `actionPlacementEditorUi.ts`, `web/app/api/admin/action-placements/**`, `ActionPlacementsSettingsClient.tsx` |
| Drawer | `web/components/admin/AdminEntityDrawer.tsx` |
| Opportunity record | `web/lib/admin/opportunityEntityRecord.ts` |
| Job RRS | `web/lib/rrs/entities/job.ts` |
| Entity GET | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Opportunity PATCH | `web/app/api/admin/opportunities/[id]/route.ts` |
| Job PATCH | `web/app/api/admin/jobs/[id]/route.ts` |
| Field requirement policy | `web/lib/fields/fieldRequirementPolicy.ts` |
| Field interaction policy | `web/lib/fields/fieldInteractionPolicy.ts` |
| Policy write merge | `web/lib/fields/fieldDefinitionPolicyWrite.ts` |
| Layout integrity | `web/lib/config/layoutIntegrityValidator.ts`, `web/app/api/admin/config/layout-integrity/route.ts` |
| Effective drawer layout | `web/lib/admin/effectiveRecordDrawerLayout.ts` |
| Actions resolve/execute | `web/lib/admin/actions/resolveActionsForContext.ts`, `executeAdminAction.ts` |
| Legacy opportunity actions | `web/lib/recordChrome/executeOpportunityRecordAction.ts` |
| Access scope | `web/lib/admin/accessScope.ts` |
| Admin auth (canMutate) | `web/contexts/AdminAuthContext.tsx` |
| Settings parity doc | `docs/system/configuration-system.md` |

---

## Appendix B — Step 0 audit lock (2026-05)

**Completed:** Repository audit for Settings + Record UX Parity (no code changes).

**Locked boundaries:**

- No new record architecture; extend `AdminEntityDrawer` and existing PATCH routes.
- No full action registry migration; inventory + targeted cleanup only.
- No layout builder; integrity report + existing section-order editor only.
- Field policy enforcement starts with **opportunity** and **job**.
- Ops inline drawer mutate remains **admin-only** unless product opens a follow-up sprint.

**Known stale product copy:** Settings index “Attention & SLA — Planned / not active” contradicts `attention-sla-rules/page.tsx` (full editor with department PATCH).

**Resolved in sprint:** `enforceDrawerFieldPoliciesOnPatch` wired on opportunity/job PATCH (Card 3); drawer violation UX (Card 4).

**Still open:** Dual action systems (`action_definitions` vs `record_actions`) — coherence improved (Card 5), migration deferred.

This appendix is the Card 0 checkpoint record; see **§12** for May 2026 closeout.
