# Admin / Configuration API

**Domain size:** ~73 route handlers. Full list: [`api-index.md` → Admin / Configuration](api-index.md#admin--configuration).

The configuration **control plane**: the surfaces that define how records, layouts, fields, statuses, pricing, and access behave for a tenant. This is where the platform's "configuration is the API" doctrine is most visible — config changes are versioned, server-validated HTTP writes, never direct DB edits.

> Conceptual model: `docs/platform/modules/configuration-platform.md` (four planes — Fields · Field grouping · Layouts · Actions). RBAC model: `docs/platform/governance/roles-and-permissions.md`.

---

## Auth & org scoping

- **Auth:** `getAdminContextCached` (org) is near-universal; mutating config routes commonly require org admin. RBAC/users routes use `requireUsersRolesManageAuth` / `requirePortalOrUsersRolesManageAuth` (org admin **or** `settings.users_roles`).
- **Scope:** Configuration is org-level (not department/site scoped) for most resources; every query filters `org_id`. System/default rows (e.g. default role definitions) are merged in read-only.

---

## Route groups

### Fields, sections & layouts

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/field-definitions` , `/[id]` | GET POST PATCH DELETE | Field registry CRUD |
| `/api/admin/field-definitions/batch-placement` | PATCH | Bulk section placement |
| `/api/admin/field-definitions/ensure-platform-field` | POST GET | Idempotent platform field provisioning |
| `/api/admin/field-sections` , `/[id]` | GET POST PATCH DELETE | Field grouping (sections) |
| `/api/admin/config/field-definition-visibility` | PUT | Field visibility config |
| `/api/admin/config/record-overview-layout` | PUT | Record overview layout |
| `/api/admin/config/layout-integrity` | GET | Layout integrity check (reads fields, sections, option sets) |
| `/api/admin/entity-layouts` , `/[id]` (+ `duplicate`/`publish`/`rollback`/`effective`/`field-catalog`/`focus-panel-summary`) | GET POST PATCH DELETE | Versioned entity layout authoring + publish lifecycle |
| `/api/admin/record-layouts` , `/effective-preview` , `/api/admin/record-overview-layouts` | GET POST | Record layout config |
| `/api/admin/record-drawer-layouts/opportunity-workflow-v1-*` | GET PATCH | Specific opportunity drawer layout placements/order/sections |
| `/api/admin/surface-layouts/registry` | GET | Surface layout registry |

`entity-layouts` carries an explicit version lifecycle (`publish`, `rollback`, `duplicate`, `effective`) — a good model for safe config change. Note these handlers had no detected DB table writes via `.from()` (they may use helper modules); verify before assuming statelessness.

### Option sets & status catalogs

`/api/admin/option-sets` , `/[setKey]` , `/[setKey]/items` , `/items/[itemId]` (GET POST PATCH DELETE) — option set CRUD. See also status definitions/options in [`business-process-api.md`](business-process-api.md).

### Pricing & commerce config

`/api/admin/pricing-dimensions(+/values)`, `/api/admin/pricing-modes`, `/api/admin/pricing/{matrix,first-clean-prices,recurring-prices,options}`, `/api/admin/discounts(+/[id])`, `/api/admin/discount-redemptions`, `/api/admin/addons`, `/api/admin/service-offerings`, `/api/admin/service-plan-templates`, `/api/admin/schedule-patterns`. Org-admin gated CRUD over commerce configuration.

### Access control (RBAC) & users

| Path | Methods | Auth | Notes |
|------|---------|------|-------|
| `/api/admin/rbac/roles` , `/[role_key]` | GET POST PATCH | portal admin/ops **or** `settings.users_roles` | Role definitions (system defaults merged) |
| `/api/admin/rbac/permissions` | GET | same | Permission catalog |
| `/api/admin/rbac/grants?role_key=` | GET PUT | same | Role → permission grants |
| `/api/admin/users` | GET POST | `settings.users_roles` | List / invite org members |
| `/api/admin/users/[userId]/role` | PATCH | same | Replace user's role |
| `/api/admin/users/[userId]/access-scope` | GET PATCH | same | Department/site scope; PATCH rejects restricted scope with empty allow lists |
| `/api/admin/users/[userId]/remove` | POST | same | Remove from org |
| `/api/admin/settings/users-roles/members` | GET | same | Members + departments + site locations |

RBAC/users are the **most security-sensitive config routes**. They write `role_definitions`, `user_roles`, and access profiles. Server-side validation rejects invalid scope combinations.

### Org, verticals, industries, locations config

`/api/admin/org-settings`, `/api/admin/org/industry`, `/api/admin/verticals(+/[id])`, `/api/admin/industries(+/[id])`, `/api/admin/location-types`, `/api/admin/location-program-categories`, `/api/admin/customer-person-role-types`, `/api/admin/customer-member-relationship-types`, `/api/admin/person-relationship-type-settings`. Org-level identity/config.

### `*-options` read helpers

Many `GET /api/admin/<thing>-options` routes (`customer-options`, `contact-options`, `person-options`, `vendor-options`, `location-options`, `opportunity-options`, `discount-code-options`, `service-frequency-options`, `job-statuses`, `schedule-statuses`, `vendor-statuses`) return select/dropdown option lists for config UIs. Lightweight reads, org-scoped, `{ options: [...] }`-style.

---

## Validation, envelopes & side effects

- **Validation:** Manual field checks with `400`. Config keys/uniqueness validated server-side. RBAC scope validated against role/permission catalogs.
- **Envelopes:** Lists return `{ <plural>: [...] }` (e.g. `{ roles }`, `{ options }`); single resources return the object or `{ ok, ... }`. Some failures return `{ error }`; a few return bare strings — see [audit](api-documentation-audit.md).
- **Side effects:** Config writes are durable but generally not event-emitting (except layout publish and field provisioning which may revalidate caches). They are the canonical write path — do not bypass them with direct DB edits.

Source root: `web/app/api/admin/{field-definitions,field-sections,config,entity-layouts,record-layouts,record-drawer-layouts,option-sets,pricing*,discounts,addons,service-*,rbac,users,settings,org*,verticals,industries,location-*,*-options}`.
