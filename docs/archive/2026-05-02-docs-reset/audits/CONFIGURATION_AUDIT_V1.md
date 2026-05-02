# Configuration Audit

**Scope:** Alloy web app (`web/`), admin APIs (`web/app/api/admin/**`), and representative database schema (`supabase/migrations/20260323181806_remote_schema.sql`).  
**Method:** Code and schema inspection (March 2025). Where behavior is ambiguous, noted as **unsure**.

---

## 1. Currently configurable in UI

Items an org admin (`user_roles.role === "admin"`) can change through the product today, unless noted as ops-readable only.

### 1.1 Navigation & entry points

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Admin app structure | N/A (fixed nav) | `web/components/admin/AdminLayout.tsx` (`navGroups`) | N/A | Sidebar links are code-defined; not all allowed middleware paths appear in the sidebar. |
| Settings (pipelines) | Pipeline name; pipeline stages (name, position, funnel/pie flags) | `/admin/settings` → `SettingsClient.tsx` | **Unsure** — see §2 (pipelines `GET` has no `org_id` filter in route handler) | Page is **not** linked from main `AdminLayout` nav; reachable by URL (`middleware.ts` allows `/admin/settings`). |

### 1.2 Access control & users

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Org users | Invite user, assign role from active roles, remove user, password reset | `/admin/system/access-control` → `AccessControlClient.tsx` | Per org | `useAdminAuth`: only `admin` may mutate; `ops` is view-oriented for many actions. |
| RBAC matrix | Permission checkboxes per `role_key` (stored in `role_permission_grants`) | Same page → “Roles” tab → `RolesClient.tsx` | Per org | **Fine-grained grants are editable in UI**, but **API enforcement is still largely `admin` vs `ops`** (see §2). |
| Custom roles | Create role (`role_key` + label), activate/deactivate | `RolesClient.tsx` | Per org | `role_definitions` + grants APIs (`/api/admin/rbac/*`). |

### 1.3 Entity labels & industry

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Entity display names | Singular/plural overrides per `entity_type` | `/admin/system/entity-labels` → `EntityLabelsClient.tsx` | Per org | Blocked when `org_settings.metadata.config_locked` is true (`/api/admin/entity-labels` PUT). |
| Config lock | Toggle lock on label/industry-related setup | Same UI (uses `/api/admin/org-settings` PATCH) | Per org | Lock stored in `org_settings.metadata`. |
| Org industry | Set `orgs.industry_id` | Wired via entity labels / industry flows (PATCH `/api/admin/org/industry`) | Per org | Also respects config lock. |
| Industry catalog | View active industries | `/admin/system/verticals-industries` | System list | **Read-only list** in this view; editing industries is `/admin/system/industries/[id]` (detail). |
| Verticals | Manage vertical records | Link to `/admin/verticals` from Verticals & Industries page | **Unsure** tenant model | Verticals table has `settings` jsonb — exposure depends on vertical admin UI implementation. |

### 1.4 Statuses

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Workflow / record statuses | CRUD on `status_definitions` for a fixed set of `entity_type` values | `/admin/system/statuses` → `StatusesClient.tsx` | Per org + industry defaults | Entity types are a **hardcoded list** in the client (`ENTITY_TYPES`). Resolution merges org rows with industry defaults (`/api/admin/status-definitions`, `lib/admin/statusDefinitionsResolve.ts`). |

### 1.5 Custom fields (CRM entities)

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Field definitions | Label, type, required, active, visibility (form/drawer/table), filter/sort, section, placeholder, help, sort order | `/admin/system/*-fields` pages using `EntityFieldsClient.tsx` (customer, job, opportunity, vendor, schedule, location, person) | Per org | API allows only `entity_type` in `["person","customer","job","opportunity","vendor","schedule","location"]` (`web/app/api/admin/field-definitions/route.ts`). `config` jsonb exists on row but UI exposure **unsure** without reading full client. |
| Field values | Stored per entity in `field_values` | Populated via entity drawers/forms, not a separate “field values admin” | Per entity | Configuration is on definitions; values are data entry. |

### 1.6 Document fields

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Document field definitions | Per `doc_type`: key, label, type, required, AI extractable, hint, sort | `/admin/system/document-fields` → `DocumentFieldsClient.tsx` | Per org | `doc_type` is a **text filter** (defaults to `general`); not a closed enum in UI. |

### 1.7 Documents (runtime)

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Upload / attach | Upload, link to entity | `/admin/documents` → `DocumentsClient.tsx` | Per org | Entity attachment options constrained by `V1_DOCUMENT_ENTITY_OPTIONS` in `web/lib/admin/v1DocumentEntities.ts` (**code list**). |
| Document hints | Org-level hints text in `org_settings.metadata` (used for upload/extraction hints) | Documents page (fetches `/api/admin/org-settings`) | Per org | Not a full “document template builder.” |

### 1.8 Directory configuration

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Customer–person role types | Types used when linking people to customers | `/admin/system/customer-person-roles` | Per org | Backed by `customer_person_role_types` APIs. |
| Person relationship types & settings | Relationship labels + settings | `/admin/system/person-relationship-types` | Per org | APIs: `person-relationship-type-settings`. |
| Customer member contact roles | Role keys/labels for member contacts | `/admin/system/customer-person-roles` / related routes | Per org | `customer_member_contact_roles` table + API. |
| Customer member relationship types | Relationship type catalog | API `GET/POST /api/admin/customer-member-relationship-types` | Per org | **No dedicated admin page found** under `web/app/admin` (grep); may be used by drawers or future UI only. |
| DB relationships | **Unsure** — admin visualization vs mutation | `/admin/system/db-relationships` → `DbRelationshipsClient.tsx` | **Unsure** | Treat as operational/debug unless client clearly writes config. |

### 1.9 Workflows

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Workflow header | Name, description, enabled, `event_type`, `entity_type` | `/admin/workflows` + `AdminEntityDrawer` when `drawer.type === "workflows"` | Per org row | Large editor lives in `web/components/admin/AdminEntityDrawer.tsx` (workflow sections ~lines 1360–2545, 7064+, etc.). |
| Conditions & actions | PUT to `/api/admin/workflows/[id]/conditions` and `.../actions` | Same drawer | Per workflow | Condition field/operator/value and action `payload` jsonb are **config-shaped**; allowed `action_type` values depend on server validation **unsure** without full route read. |
| Manual run | POST run endpoint from drawer | Drawer | Per workflow | Debug/ops use. |
| Events & runs | View streams | `/admin/workflow-events`, `/admin/workflow-runs` | Per org **unsure** if list APIs filter `org_id` | See §2 for service-role list patterns. |

### 1.10 Financials & pricing

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Pricing matrix / modes / dimensions | Multiple clients under `/admin/financials/pricing` | `PricingClient.tsx`, `PricingModesConfig.tsx`, related APIs | Mix of vertical-scoped and org-scoped data | Schema includes `pricing_*` tables tied to `vertical_id` in places — **consultant must map vertical vs org**. |
| Plan templates, service offerings, add-ons | Dedicated admin pages / drawers | `/admin/financials/plan-templates`, offerings routes, etc. | **Unsure** without full pass | Backed by `service_plan_templates`, `service_offerings`, `pricing_addons`, etc. |
| Payout defaults | `org_settings` payout fields + metadata policies | `/admin/system/payouts` → `PayoutsClient.tsx` | Per org | Uses `/api/admin/org-settings`. |
| Vendor payout override | Per vendor | Vendor drawer / API `vendors/[id]/payout-policy` | Per vendor | See `web/lib/admin/vendorPayoutPolicy.ts`. |
| Discounts & redemptions | Programs/codes/redemptions | `/admin/discounts`, `/admin/discount-redemptions` | Per org | Some status enums constrained in DB CHECK constraints. |

### 1.11 Other admin surfaces

| Area | What is configurable | Where in UI | Scope | Limitations |
|------|----------------------|-------------|-------|-------------|
| Opportunities / jobs / schedules / … | CRUD via list + `AdminEntityDrawer` | Entity list pages | Per org | Drawer types in `EDITABLE_TYPES` in `AdminEntityDrawer.tsx`. |
| Messaging / outbox | Operational messaging | `/admin/messaging`, `/admin/messages-outbox` | Per org | **Unsure** template configurability without deeper read. |
| Subscriptions | Admin subscription operations | `/admin/subscriptions` | Per org | Generation APIs exist (`subscriptions/[id]/generate-next`). |

### 1.12 Explicitly **not** configurable in UI (placeholders)

| Area | Notes |
|------|--------|
| Operations recurrence | `/admin/operations/recurrence` → `ComingSoonPlaceholder` only. |
| UI V2 workspace | `/adminV2/workspace` is a **demo**; not org configuration for production workspace layout. |

---

## 2. Configurable in schema/code but not fully exposed

| Area | What appears config-ready | Evidence | What’s missing / gap |
|------|---------------------------|----------|----------------------|
| RBAC | `permission_keys`, `role_permission_grants`, UI to edit grants | Migration seeds permissions; `RolesClient.tsx`; `/api/admin/rbac/grants` | **Runtime enforcement:** `getAdminContext()` only distinguishes `admin` vs `ops`. **Unsure** any admin route checks `permission_key` grants for ops. |
| Org settings | `org_settings` row: `payout_type`, `payout_value`, `metadata` jsonb | Table + `/api/admin/org-settings` | No single “Org settings” hub in main nav; scattered (payouts, documents hints, entity labels lock). |
| Field definition `config` | jsonb on `field_definitions` | Schema | Full structured editor in UI **unsure**; may be underpowered if present. |
| Workflow action payloads | `workflow_actions.payload` jsonb | Schema + drawer PUTs | Validation surface for consultants **unclear**; malformed JSON could fail at runtime. |
| Pipelines | `pipelines.org_id` nullable column | Schema | `GET /api/admin/pipelines` does **not** filter by `org_id` in handler while using service-role client → **multi-tenant risk** if multiple orgs in one DB. |
| Workflows list (server page + GET API) | `workflows.org_id` on table | `admin/workflows/page.tsx`, `/api/admin/workflows` GET | Same pattern: service client, **no `org_id` filter** in shown code → **tenant isolation must be verified** for production. |
| Status definitions | `industry_key`, `is_default`, `metadata` on `status_definitions` | Schema; `status-definitions` API uses resolve helpers | Full industry authoring UX may be partial; org vs industry layering is non-trivial. |
| Vertical `settings` | jsonb | `verticals.settings` | How much is exposed in `/admin/verticals` UI **unsure**. |
| Person / vendor / assignment | Many `metadata` jsonb columns | Various tables | Escape hatch for integrators; **little guarantee** of UI parity. |
| `recordAssignmentContext` (UI V2) | Type exists for record workspace | `web/lib/ui-v2/workspace-types.ts` | **No** rendering in `RecordWorkspace.tsx` — dead shape. |

---

## 3. Hardcoded today

| Area | What is hardcoded | File(s) / source | Likely future configuration surface |
|------|-------------------|-------------------|-------------------------------------|
| Admin sidebar | Nav structure, labels, grouping | `AdminLayout.tsx` `navGroups` | DB-driven nav or feature-flag map per org tier. |
| Middleware allowlist | Prefix list for `/admin` routes | `web/middleware.ts` `ADMIN_PATH_PREFIXES` | Generated from route manifest or org feature flags. |
| Custom field entity allowlist | POST/GET `field_definitions` restricted types | `web/app/api/admin/field-definitions/route.ts` `ALLOWED_ENTITY_TYPES` | Org-industry profile: allowed entities + field caps. |
| Status admin entity list | Tab/filter entity types | `StatusesClient.tsx` `ENTITY_TYPES` | Drive from `status_definitions` distinct query or industry package manifest. |
| Document attach entities | Dropdown values | `web/lib/admin/v1DocumentEntities.ts` | Config table or derive from `documents` + entity registry. |
| App role enum (legacy) | `user_profiles.role` enum `app_role` | Migration | Align with `user_roles` + RBAC or deprecate. |
| Many CHECK constraints | e.g. discount `target_entity_type`, vendor payout checks | `20260323181806_remote_schema.sql` | Productized enums → still need migration discipline when extending. |
| Public booking (`book-v2`) | Flows, validation | `web/app/book-v2/**`, related APIs | Tenant theming + service catalog from org/vertical config. |
| UI V2 demo | Industries, drill keys, all copy | `web/lib/ui-v2/demo/**` | Replace with org-driven workspace definition (out of scope here). |

---

## 4. UI V2-specific configurable foundations

These support **future** productized workspace configuration; **today** they are mostly **demo + library types**, not wired to org data.

| Item | Evidence |
|------|----------|
| View models (`SignalVm`, `QueueVm`, `ActionsVm`, `ContextBlockConfig`, record body sections) | `web/lib/ui-v2/workspace-types.ts`, `web/lib/ui-v2/context-config.ts` |
| Context block normalization from config + raw rows | `web/lib/ui-v2/adapters/context-adapter.ts` |
| Stable action protocol | `web/lib/ui-v2/workspace-actions.ts` |
| Adapters merge context into shells | `company-adapter.ts`, `department-adapter.ts`, `work-unit-adapter.ts`, `record-adapter.ts` |
| Demo-only host | `web/app/adminV2/workspace/page.tsx` |

**Caveat:** Several VM fields are unused or only partially rendered in blocks; see prior workspace-focused audit if drilling into UI V2 only.

---

## 5. Recommended next configuration priorities

Ranked for **multi-tenant flexibility**, **fewer per-customer code changes**, **consultant/AI-safe setup**, and **go-live readiness**.

1. **Enforce org scoping on all service-role admin reads/writes** — Audit every `createAdminClient()` route for missing `.eq("org_id", ctx.orgId)` (workflows, pipelines called out above). **Highest production risk.**
2. **Wire RBAC grants into API authorization** — Either map `ops` to default grant set and check keys per route, or document that grants are “future” and hide the UI until enforced.
3. **Single org “System settings” hub** — Surface `org_settings`, config lock, industry, payout defaults, and document hints in one discoverable place (still backed by existing APIs).
4. **Industry/consultant packages** — Formalize bundles: default labels, statuses, field defs, relationship types, document `doc_types`, seeded workflows — versioned and importable.
5. **Entity registry** — Replace scattered allowlists (`field_definitions`, document entities, status entity list) with one server-driven registry per org/industry.
6. **Workflow authoring guardrails** — Schema/UI for allowed `event_type` / `action_type`, validated payload forms, and simulation before enable.
7. **Recurrence** — Implement `/admin/operations/recurrence` against `recurrence_plans` (or equivalent) once schema is confirmed; currently placeholder only.
8. **Document templates & required fields** — Tie `document_field_definitions` + `doc_type` to upload validation and extraction pipelines in UI.
9. **Vertical settings UX** — Expose `verticals.settings` jsonb with typed forms for pricing add-ons, service catalog links, etc.
10. **Observability of config** — Activity log / audit for who changed statuses, fields, workflows, grants (table exists: `activity_log` — **unsure** coverage).

---

## 6. Summary table

| Area | Current state | Priority | Notes |
|------|---------------|----------|-------|
| Pipelines & stages | UI-configurable (`/admin/settings`) | **P1** | Not in main nav; **verify org filter** on APIs |
| Entity labels | UI-configurable | P2 | Industry defaults + org overrides; config lock supported |
| Org industry | UI/API (PATCH org industry) | P2 | Drives label defaults |
| Status definitions | UI-configurable (fixed entity list) | P2 | Org + industry resolution in API |
| Custom fields (`field_definitions`) | UI-configurable (7 entity types) | P2 | Allowlist in API |
| Document field definitions | UI-configurable | P3 | Per `doc_type` string |
| Workflows | UI-configurable (large drawer) | **P1** | **Verify org-scoped list/save**; conditions/actions are jsonb-heavy |
| RBAC grants | UI-configurable | **P1** | **Enforcement gap** vs `admin`/`ops` only |
| User invites / roles | UI-configurable | P2 | Membership in `user_roles` |
| Financials / pricing | UI-configurable (multi-surface) | P2 | Mix of vertical vs org — map carefully |
| Org settings / payouts | Partial UI (payouts, scattered) | P2 | `metadata` underused in UX |
| Documents list/upload | UI | P3 | Entity options hardcoded in TS |
| Operations recurrence | **Hardcoded placeholder** | P3 | No config UI |
| UI V2 workspace | **Demo / types only** | P4 | Foundations for future workspace config |
| Admin navigation | **Hardcoded** | P3 | Consultant extensibility limited |
| Service-role APIs w/o org filter | **Code smell / risk** | **P1** | Multi-tenant go-live blocker until audited |

---

*End of Configuration Audit v1.*
