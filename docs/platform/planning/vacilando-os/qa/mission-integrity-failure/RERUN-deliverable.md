# Access & Roles V2 — Discovery & Specification

**Mission** `msn_71e1e393abfebf08fe` · **Package** `pkg_4ee8a61376e1252904` (v2) · **Capability** `cap_access_roles`
**Objective:** Discover and specify Access & Roles V2. Inventory the current implementation and every authority path (person → user → role → scope), identify contradictions and gaps, define the canonical security/authority model, and return a short sequenced delivery plan.
**Boundary (hard):** Do **not** build V2 and do **not** modify application source. Findings live only in this document.
**Governance:** `no_push no_merge no_promote no_scope_broadening ask_before_consequential loopback_only`

> This document is *evidence*, not doctrine. Where it cites code, the citation is `path:line` at the current worktree base. Where it proposes a model, it is a **proposal requiring approval** — see §10 (Decisions). Canonical doctrine (`docs/platform/core/entity-model.md`, `docs/platform/governance/roles-and-permissions.md`) is read-only and is treated as authority, not amended here.

---

## 0. Executive summary

Alloy already has the *skeleton* of a role-based access system — an org-scoped role catalog, a permission-grant join table, a permission-grid UI that avoids the raw-checkbox wall, and a deliberate two-axis split between **capability** (what you can do, via roles) and **visibility** (what data you can see, via a separate access profile). That skeleton is genuinely good and V2 should build on it, not replace it.

But the system is **half-wired**, and the unwired halves are the security-critical ones. The three findings that dominate everything below:

1. **The person graph and the auth/user graph are two disjoint identity systems with zero foreign keys between them.** A staff user has no canonical `persons` row; a `persons` record has no path to a login. This is the single biggest architectural gap and the mission's stated #1 principle ("a user account authenticates a person; it must not become a second person database").
2. **Enforcement is per-route opt-in over a service-role client that bypasses RLS.** Authorization is real where a route remembers to call it and absent where it forgets. Three concrete server-side holes were found: a **privilege-escalation self-role-edit path**, a **department/site scope bypass in two registered actions**, and **broad `authenticated` write access to financial tables** at the RLS layer.
3. **Roles today control coarse capability areas only — not surfaces, not actions, not fields.** Surface visibility is uniform (everyone with portal access sees everything); field-level policy exists as dormant type-system scaffolding wired to no real user; "Experience Access" is a stubbed placeholder. The mission's four-layer model (surface / data-scope / capability / field) is one layer real and three layers aspirational.

V2 is therefore **~40% consolidation of what exists** and **~60% net-new** — with the net-new concentrated in identity unification, server-side enforcement hardening, and the effective-access resolver. The recommended sequence (§9) front-loads the security holes (they are live today) and the person↔user link (everything else depends on it), and defers authentication method expansion (SSO/MFA/OAuth) to last because it is the most isolated and the least blocking.

**Do not begin implementation from this document.** It closes with an acceptance rubric and a decisions list that must be resolved with the operator first.

---

## 1. Existing-state inventory — the evidence matrix

The mission requires an evidence-backed matrix across ten authority layers, not a code summary. Each row states what **exists**, what is **absent**, and the enforcement reality.

| Layer | What exists today | Enforcement reality | Key evidence |
|---|---|---|---|
| **Authentication** | Supabase Auth, **email+password only**. Forgot/reset password (self-service + admin-triggered), invite-by-email. | Session validated in middleware via `supabase.auth.getUser()`. | `web/app/login/page.tsx:74`; `web/middleware.ts:102-104`; `web/README_ADMIN_AUTH.md:9` |
| **User account** | `auth.users` (Supabase) ⟷ `user_roles` / `app_users` / `user_profiles`. **No account-status column** anywhere. | Membership = existence of a `user_roles` row. "Remove from org" deletes that row; does not touch `auth.users`. | `remote_schema.sql:2915-2920`; `web/app/api/admin/users/[userId]/remove/route.ts:20-24` |
| **Person identity** | Canonical `persons` table (customer/family side). | **No FK from any auth/user table to `persons`.** Staff users have no person row. | `remote_schema.sql:2431-2453`; `resolveAdminAccessCore.ts` (string `persons` never appears) |
| **Person type** | Modeled as **role-on-relationship**, not a type column (`customer_person_role_types`, `person_child_relationship_roles`). | Sound pattern; avoids person-subtype explosion. | `20260711153000_person_child_relationships.sql:4-38` |
| **Role** | Org-scoped `role_definitions` + `role_permission_grants`. 4 system roles seeded (`admin, ops, regional_lead, school_director`). | Real, but a role owns **capability grants only** — not surfaces/actions/fields/scope. `admin` universally bypasses granular checks. | `20260505153000_backfill_default_role_definitions.sql:3-16`; `canManageUsersAndRoles.ts:15-17` |
| **Surface access** | Full operator nav + 32 settings surfaces. | **Not role-gated** — shown to every admin/ops user. Only carve-out is the Access surface itself. | `configurationModeNav.ts:47-179`; `adminAuth.ts:19` |
| **Record scope** | Two-axis: `user_access_profiles` (`department_scope`/`site_scope` ∈ all\|restricted) + allow-lists `user_department_access` / `user_site_access`. | **Application-layer only** — not in RLS. Enforced by per-route `assertEntityDrawerRecordReadable()` calls; some routes omit it. | `20260504103000_user_access_scope_tables_v1.sql`; `web/lib/admin/accessScope.ts:3-4` |
| **Capability access** | ~26 canonical registered actions across 8 placement kinds; execution gated by `requireAdminOrOps()`. | Role+org checked server-side; **department/site scope inconsistently enforced** (2 of 4 executable actions bypass it). | `canonicalActionRegistry.ts:282-296`; `actionExecutor.ts:126-185` |
| **Field access** | Type-system scaffolding exists (`editable_by_permission`, `required_permissions`) + static surface field visibility. | **Dormant** — no field definition sets it; every caller passes synthetic placeholder permission arrays. | `web/lib/fields/fieldInteractionPolicy.ts:8-17,191-246` |
| **Administration** | `canManageUsersAndRoles` = org `admin` OR `settings.users_roles` grant. | **Self-role-edit is permitted** and any role (incl. `admin`) can be self-assigned → privilege escalation. | `canManageUsersAndRoles.ts:15-18`; `web/app/api/admin/users/[userId]/role/route.ts:9-51` |
| **Audit** | None. | **No audit/event tables for access changes at all.** Role changes and invites are unrecorded. | `accessPresentationContracts.ts:167-210` (types only, "no events fabricated") |

### 1.1 The role/permission data model (detail)

- **`role_definitions`** (`remote_schema.sql:2701-2711`) — org-scoped catalog `(org_id, role_key, role_label, description, is_system, is_active)`, unique on `(org_id, role_key)`.
- **`role_permission_grants`** (`remote_schema.sql:2717-2725`) — `(org_id, role_key, permission_key, allowed)`. `permission_key` validated against **both** `permissions.key` and `permission_keys.key`.
- **`user_roles`** (`remote_schema.sql:2915-2920`) — membership `(user_id, org_id, role)`. PK was **deliberately reshaped** to composite to support multiple roles per user per org (`20260505120000_user_roles_composite_primary_key.sql:3-4`) — **but the write API still replaces with a single role** (see §1.3).
- **Triple-redundant permission catalog** — `permissions`, `permission_keys`, `permission_definitions` are three near-identical tables written in lockstep by every seeding migration (`20260505164000_permission_grid_keys.sql:7-79`). Only `permission_definitions` is read for validation (`web/app/api/admin/rbac/grants/route.ts:60-67`). **Schema drift, not intentional layering** — a V2 consolidation target.
- **Scope tables kept orthogonal by design** — `user_access_profiles` comment explicitly: *"capabilities remain on role_definitions / role_permission_grants + user_roles"* (`20260504103000...:33`). This separation is a strength to preserve.
- **A second, unrelated authority primitive exists** — `operational_authorities` / `operational_authority_assignments` (`20260722000000_...wave_c.sql:49-99`), documented as distinct from RBAC ("may the actor *invoke a command*" vs "may the actor *author/ratify under an authority*"). V2 must decide whether to unify or explicitly wall these off (Decision D7).

### 1.2 Permission taxonomy (detail)

- **No TypeScript enum/constant** for permission keys — free-text strings validated only at write time. The operator-facing grouping is `PERMISSION_GRID_ROWS` (`web/lib/admin/permissionGrid.ts:12-24`): **10 capability areas** (opportunities, customers, communications, scheduling, billing, documents, reports, settings, users_roles, workflows), each a `read`/`write` key pair collapsed to a 3-state radio.
- **No unified `hasPermission()`/`usePermission()`** — every gate inlines `permissionKeys.includes(...)` / `roleKeys.includes(...)` against `AdminAccessContextSuccess`. Real gates exist (comms, AI, operational-expectations authoring, config-assist, users/roles) but are bespoke per call site.
- **No cross-org super-admin.** `admin` is per-org (`user_roles.role`) and universally bypasses granular permission checks — meaning non-`admin`/`ops` roles are effectively second-class, and the grid mainly matters for *custom* roles.

### 1.3 The config UI (detail) — already better than the mission feared

`UsersRolesConfigurationPage.tsx` is now a **19-line wrapper** forwarding to `AccessWorkspaceSurface` (`web/components/adminV2/settings/access/AccessWorkspaceSurface.tsx`), the real product surface. It renders four chapters: **Users / Roles / Scopes / Security** (`web/lib/access/accessChapterRoutes.ts:10`), gated by `canManage`.

- **Roles chapter** presents a **permission *grid*, not a raw-checkbox wall** — one row per capability area × 3 mutually-exclusive levels (No access / Read / Write-Manage). Raw permission keys never appear as primary labels (`docs/platform/operator/access-product-ui.md:97-98`). This already satisfies part of the mission's UX bar.
- **But** the Roles chapter's "Experience Access" and "History" tabs are **hard-coded `Planned` placeholders** (`AccessRolesConfigurationPage.tsx:533-544`); the Security chapter shows Google/Microsoft/SSO/MFA/sessions/audit as static `Planned` badges.
- **The multi-role gap is self-documented:** `PATCH /api/admin/users/[userId]/role` deletes all role rows and inserts exactly one (`route.ts:38-41`), despite the schema supporting many. The contract file literally notes *"Existing API replaces with a single role"* (`accessPresentationContracts.ts:77-78`).

### 1.4 Seed / defaults

- 4 system roles upserted per-org (`20260505153000_backfill_default_role_definitions.sql:3-16`), mirrored client-side (`web/lib/admin/defaultRoleDefinitions.ts:12-17`).
- **Every permission key gets a default `admin` grant and nothing else** — no non-admin role receives default grants for newer keys (`20260505120100...:64-72`). New capability areas are invisible to every non-admin role until explicitly granted.

---

## 2. Surface & capability access catalog

### 2.1 Operator surfaces (workspace mode)
Home/Workspace, Inbox, Processing, Scheduling, Work Items/Tasks, Analytics, plus **one expandable entry per configured business process** with its Work Views (`Sidebar.tsx:208-418`, driven by `loadOperatorLifecycleLandingCards`). Modal launchers duplicated in `TopNavBar.tsx:45-80`.

### 2.2 Configuration surfaces (config mode)
Four IA groups (`configurationModeNav.ts:47-179`): **Organization** (Programs & Locations, Access, Communications) · **Data Model** (Entities, Fields, Statuses, Option Sets, Relationships, Operational Calculations) · **Operations** (Processes, Surfaces, Automation) · **Business** (Financials) — plus an `internal:true` Action-definitions catalog. Backed by **32 settings route directories** under `web/app/adminV2/settings/`.

### 2.3 Registered action/capability catalog
Three layered registries (there is *no* single capability registry — a V2 consolidation target):
1. **Executable handler registry** — 4 actions with code-owned handlers: `updateStatusAction`, `createLeadAction`, `confirmTourAction`, `scheduleCreateAction` (`actionRegistry.ts:23-28`).
2. **Settings-facing library** — 15 categorized entries (`record`/`communication`/`workflow`/`bos_native`/`status_lifecycle`) (`actionDefinitionRegistry.ts:41-202`).
3. **Canonical registry** (superset) — ~26 keys merged, 8 placement kinds (`canonicalActionRegistry.ts:30-38,282-296`).

**Critical catalog fact:** the action type (`CanonicalActionDefinition`, `canonicalActionRegistry.ts:48-73`) has **no `requiredPermission`/`roleKey` field**. Actions do not declare who may run them; authorization is entirely in the execute route + handler. This is the structural reason the mission's "a role controls actions" requirement is currently unmet.

### 2.4 Surface-visibility & field-policy reality
- **Surface visibility is NOT role-gated** — every admin/ops user sees every nav item and every settings section. The only conditional is a feature flag. Portal entry itself is coarse: `ALLOWED_ROLES = ["admin","ops"]` (`adminAuth.ts:19`).
- **Field policy is dormant** — `editable_by_permission` mode and `required_permissions` exist in the type layer with a real `permissionGate()` (`fieldInteractionPolicy.ts:191-246`), but no field ever sets the mode and every caller passes synthetic placeholders (`["__drawer_display__"]`, `["__admin_patch__"]`, `["__synthetic_all__"]`). The hook is ready; nothing feeds it real auth context.
- **No parent/guardian portal** — only unauthenticated public flows (`/book`, `/a/[token]`, `/forms/embed`). Explicitly out of go-live scope (`docs/product/crm-system.md:197`).

---

## 3. Person ↔ User ↔ Role ↔ Scope model (current + canonical target)

### 3.1 Current state — two disjoint graphs

```
CUSTOMER / FAMILY GRAPH                 AUTH / AUTHORIZATION GRAPH
─────────────────────────               ──────────────────────────
persons ──< customer_persons            auth.users
   │           (role_type)                 ├─ app_users (role, vendor_id)      [no person_id]
   ├──< person_child_relationships         ├─ user_profiles (role)             [no person_id]
   │       ├─ roles (guardian,             └─ user_roles (user_id, org_id, role)
   │       │   emergency_contact,                  ├─ role_permission_grants → permission_keys
   │       │   authorized_pickup)                  └─ user_access_profiles
   │       └─ kinship (mother, ...)                     ├─ user_department_access
   ├──< opportunity_persons                            └─ user_site_access
   └──< person_locations
customer_members (child, optional person_id)

          ⟂  ZERO foreign keys between the two graphs  ⟂
```

**Findings:**
- **Confirmed disconnect** — `resolveAdminAccessCore.ts` resolves org/role/scope entirely from the auth graph; the string `persons` never appears. The invite flow (`web/app/api/admin/users/route.ts:91-106`) creates an `auth.users` row and a `user_roles` row and **never touches `persons`**. Staff have no canonical person.
- **Not the mission's feared failure mode, but its mirror** — the user side carries *no* identity fields (email is fetched live from `auth.users`), so there is no *drifted duplicate profile*. The problem is the **opposite**: the user graph is identity-*starved*, so a staff member cannot be represented in any person relationship.
- **A real duplicate store does exist, but elsewhere** — `contacts` vs `persons` both hold name/email/phone for the same customer-side humans, mid-deprecation, bridged by a nullable `contacts.person_id` (`relationship-model.md:171-178`). `vendor_users`, `messages`, `documents.owner_contact_id`, `customers.primary_contact_id` still FK to `contacts`.

### 3.2 Scope model (current)
- Dimensions that exist: **org** (`org_id`, everywhere), **department** (`user_department_access`), **site/location** (`user_site_access`, constrained to `location_type='site'`).
- **"Region" is not a dimension** — only a role *label* (`regional_lead`) with no enforced region linkage. No `regions` table.
- **No household / child / record-relationship scope dimension** exists for user access.
- Scope is a **separate per-(user,org) profile**, correctly independent of role (`roles-and-permissions.md:12-25`: *"Role ≠ visibility"*) — a strength — but also disconnected from the person/household graph, so scope **cannot** currently be derived from "records associated with the user's own children" (the mission's parent-scope requirement).

### 3.3 Canonical target model (proposed — requires approval)

The canonical entity doctrine already establishes **persons as the human identity owner, with roles/responsibilities via relationships, not copied identity** (`docs/platform/core/entity-model.md`). V2 should carry that principle into users:

- **`persons`** = the one human identity owner. Everyone — staff, parent, guardian, contact, vendor — is a person.
- **`user` (login identity)** = a thin credential record that **authenticates exactly one person**. Introduce the missing link: `users.person_id → persons(id)` (or an `auth_identity` join). A user must not carry name/email as source-of-truth — it references the person.
- **Person type** = derived from **relationships**, never a column. Staff-ness becomes a person↔org employment relationship (today "Planned — not canonical", `relationship-model.md:84-90`), using the same role-on-relationship pattern already proven for guardians.
- **Role** = a reusable capability + surface + field + default-scope *package* (see §4), assigned to a user, org-scoped, **multi-role**.
- **Scope** = the existing two-axis profile, **extended** with relationship-derived dimensions (records for the user's own children / where the person holds a named relationship) so parent-portal scope is relationship-driven, not household-wide (a mission validation rule: *"parent access relies on relationship scope, not household-wide assumptions"*).

This unifies identity **without** making the user a second person database: the user row holds credentials + status + a pointer; all human facts live on the person.

---

## 4. The four-layer access model (target)

The mission is explicit and the evidence confirms it: surfaces alone are insufficient. A user blocked from the Billing *workspace* can still call a billing *action* unless capability enforcement is separate. V2 must enforce four independent layers, all server-authoritative:

| Layer | Controls | Current state | V2 requirement |
|---|---|---|---|
| **L1 Surface visibility** | What nav/workspaces/settings appear | Uniform (not role-gated) | Role → surface map; presentation-only, **never** the security boundary |
| **L2 Record/data scope** | Which orgs/locations/departments/records | Exists (dept/site), app-layer only | Extend to relationship scope; add RLS backstop for direct-PostgREST defense-in-depth |
| **L3 Capability/action** | Which actions can execute | Role+org checked; scope inconsistent | Every registered action declares required capability; executor checks it **and** scope uniformly |
| **L4 Field view/edit** | Which sensitive fields visible/editable | Dormant scaffolding | Wire `fieldInteractionPolicy` to real user grants |

**Doctrine invariant (from `docs/platform/governance/roles-and-permissions.md` + the mission):** configuration steers, code + RLS own invariants. L1 is configuration (what shows). L2–L4 are enforcement (what is allowed). A UI checkbox without enforcement evidence is, by the mission's own validation rule, an incomplete deliverable.

---

## 5. Authentication model (current + target)

### 5.1 Current (all citations §"Authentication" agent)
Email+password only. Invite-by-email (no SMS). Forgot/reset password (self + admin-triggered), enumeration-safe. Session via Supabase cookie + middleware `getUser()`. **Absent:** magic link, OTP, OAuth (Google/Microsoft/Apple), SSO/SAML, MFA, password show/hide toggle, invitation-state tracking, account-status column, suspend/lock/ban, session timeout config, trusted device, forced reset, login rate-limiting/lockout.

### 5.2 Target (org-configurable, phased)
- **Baseline (cheap, required):** password show/hide toggle on every password field — a straightforward win the mission calls out explicitly.
- **Account lifecycle:** add a real status model — `draft → invitation_pending → active → suspended → locked → deactivated → invitation_expired` — as a first-class column, replacing the hardcoded "Active" literal. This unblocks suspend/lockout/deactivate without deleting `auth.users`.
- **Method expansion (org-configurable, not hardcoded):** magic link, email/SMS OTP, OAuth for the parent experience, enterprise SSO/SAML as advanced. Supabase supports most natively; the work is config + UI, not protocol.
- **Policy:** MFA by role/risk, session timeout, trusted device, forced reset, account recovery, invitation acceptance.

Authentication expansion is the **most isolated** work (see §9) and should be sequenced last — it does not block identity unification or enforcement hardening.

---

## 6. Effective-access resolution model

The mission's target equation:

```
Effective access =
    Authentication state
  + Person relationship
  + Assigned roles (capability grants)
  + Explicit grants
  − Explicit restrictions
  ∩ Organization scope
  ∩ Location / department scope
  ∩ Record-relationship scope
  + Field policy
```

**Current resolver** (`resolveAdminAccessCore.ts`) computes a partial version: roles → `permissionKeys` (union), plus org/dept/site scope — but no relationship scope, no explicit per-user grants/restrictions (correctly — see rejected pattern `rp1`), no field policy, and no *explainable projection*.

**Proposed V2 resolver — `effectiveAccess.mjs`-style pure function** (deterministic, testable, no new store), producing:
1. A **capability set** = ⋃ grants across assigned roles (never per-user direct grants — honors `[ad1]`, `[rp1]`).
2. A **visibility set** = org ∩ (dept-scope ∪ site-scope ∪ relationship-scope).
3. A **field policy set** = ⋃ field grants across roles.
4. An **operator-language explanation** for every allowance: *"Kelly can manage Enrollment for Bend and Redmond because of the Center Director role."* This is a mission acceptance requirement (`EffectiveAccessVm`, `accessPresentationContracts.ts:218-225`, currently "Planned").

**Explicit-deny decision (deferred to modeling, per the mission):** start with **role inheritance + user-specific *additive* scope only** — no deny-precedence engine — unless the inventory proves it necessary. The inventory does **not** prove it necessary (no current deny mechanism exists), so V2 should **not** introduce deny precedence in V2.0 (Decision D5).

---

## 7. Product IA & principal flows

### 7.1 Settings IA (the mission's target, reconciled with what exists)
The mission asks for a single **Access & Identity** workspace with Overview / Users / Roles / Access Policies / Authentication / Invitations / Audit Log. The current surface already has **Users / Roles / Scopes / Security**. V2 delta:

```
Access & Identity
├── Overview        (NEW — health: active users, pending invites, locked accounts,
│                    missing assignments, excessive-access warnings, auth health)
├── Users           (EXISTS — extend: person link, lifecycle status, multi-role, MFA state)
├── Roles           (EXISTS — extend: surface/action/field/default-scope ownership + real Experience Access)
├── Access Policies  (NEW — reusable named scope policies)
├── Authentication  (EXISTS as "Security" — extend: methods, MFA, session, IdP)
├── Invitations     (NEW — pending/accepted/expired/failed, resend/revoke)
└── Audit Log       (NEW — no audit tables exist today; net-new)
```

### 7.2 Principal flows to specify (implementation-ready)
1. **Create staff person + user together** (today impossible — no person↔user link).
2. **Add login access to an existing person** (staff or parent) — one person, one login, roles + scope.
3. **Grant parent/guardian portal access** scoped to *their* children via relationship scope (not household-wide).
4. **Invite by email or mobile**, or create-without-invitation and send later.
5. **Assign one or several roles** (multi-role — schema already supports it; API does not).
6. **Preview effective access before activation** — the resolver's explanation surface, pre-save.
7. **Lifecycle transitions** — suspend / lock / deactivate / reactivate / expire, without deleting the auth identity.
8. **Role editor** presenting meaningful access groups (grid already does this; extend to surfaces/actions/fields).

---

## 8. Security threat & enforcement matrix

Three **confirmed, server-side-reachable** issues found. All are within-org (none cross-tenant), but all are live today.

| # | Threat | Status | Evidence | Failure scenario |
|---|---|---|---|---|
| **T1** | **Privilege escalation via self-role-edit** | CONFIRMED | `canManageUsersAndRoles.ts:15-18`; `web/app/api/admin/users/[userId]/role/route.ts:9-51` | A user granted the narrow `settings.users_roles` permission (intended for "invite staff / reset passwords") can `PATCH .../{own-user-id}/role` with `{"role":"admin"}` — no self-edit guard, no role-value restriction — and self-promote to full org admin. |
| **T2** | **Department/site scope bypass in registered actions** | CONFIRMED | `actionExecutor.ts:126-185`; `entryLifecycleActions.ts:255-315` (no `accessScope` ref); `scheduleCreateAction.ts` → `commit.ts` (no scope check) | `update_status` and `schedule.create` never call `assertEntityDrawerRecordReadable`, unlike sibling actions `confirm_tour`/`create_lead`. A user restricted to Location A can mutate a Location B record via `/api/admin/actions/execute` by supplying its id. Structural — any future action that doesn't delegate to `executeAdminAction` inherits the hole. |
| **T3** | **Broad `authenticated` write to financial tables (RLS)** | CONFIRMED (self-flagged) | `remote_schema.sql:202-212` (`current_org_id()` does no `auth.uid()` check); `20260331120000_charges_receivables_foundation.sql:159-163`; team's own note `operational_execution_p3...:143` | `charges`/`payments`/`payment_allocations` RLS gates on `org_id = current_org_id()`, which just returns the sole org id when one org exists — granting *every* authenticated session INSERT/UPDATE/SELECT. Defense-in-depth gap: the app always writes via service-role, but a leaked authenticated JWT + direct PostgREST bypasses all role gating on money tables. |
| **T4** | **No audit trail for access changes** | CONFIRMED | `route.ts` role/invite handlers have no `logAdminAudit`; no audit tables (`accessPresentationContracts.ts:167-210`) | Role escalations, invites, removals leave no record. Fails the mission's "audit events for consequential access changes." |
| **T5** | **RLS role vocabulary drift** | CONFIRMED | `field_sections_public_visibility.sql:53-72` checks `role = ANY('owner','admin','ops','manager')` | Custom roles created in the UI (e.g. `front_desk_coordinator`) get **zero** DB-level RLS grant on field/layout tables — RLS never consults `role_permission_grants`. Config-created roles are second-class at the data layer. |
| **T6** | **Per-route opt-in enforcement (structural)** | CONFIRMED pattern | `middleware.ts` gates pages not `/api/admin/*`; archived audit `ADMIN_API_ORG_SCOPING_AUDIT_V1.md:8` | New routes are unauthenticated-by-default behind a service-role client. Prior audit found many such holes (since remediated for the routes spot-checked), but the *pattern* — fail-open, not fail-closed — persists. |

**Enforcement principle for V2:** move from **fail-open opt-in** to **fail-closed by construction** — a route wrapper / server-action gate that requires an explicit capability + scope assertion or refuses to run, so a forgotten check is a build/test failure, not a silent hole.

**Threats the mission asks to cover and their current status:** cross-location leakage (T2 — open), cross-org leakage (largely closed via `.eq(org_id)`, T3 RLS-layer gap remains), cross-child/cross-household (no relationship scope exists — unbuildable today), privilege escalation + self-role-edit (T1 — open), hidden-surface-via-URL (L1 is presentation-only, so URLs *are* reachable — the real gate must be L2–L4, not hidden nav).

---

## 9. Gap analysis (consolidated)

| Gap | Severity | Build class |
|---|---|---|
| No person ↔ user FK; staff have no person identity | **Critical** | Net-new + migration |
| T1 self-role-edit privilege escalation | **Critical** | Fix (guard + role-value restriction) |
| T2 scope bypass in `update_status` / `schedule.create` | **Critical** | Fix (move scope check into shared executor) |
| T3 financial-table RLS `current_org_id()` broad write | **High** | Fix (RLS reconcile to `has_org_role`) |
| No account-status lifecycle (hardcoded "Active") | **High** | Net-new column + transitions |
| Actions don't declare required capability | **High** | Registry field + executor check |
| No audit log (T4) | **High** | Net-new tables + emit points |
| Multi-role API replaces with single role | Medium | Fix (API already schema-supported) |
| No effective-access resolver / explanation | Medium | Net-new pure module |
| Surface visibility not role-mapped (L1) | Medium | Config mapping (presentation) |
| Field policy dormant (L4) | Medium | Wire existing scaffolding |
| RLS role-vocabulary drift (T5) | Medium | RLS reconcile |
| Triple permission-catalog redundancy | Low | Consolidation |
| No relationship/child scope dimension | Medium (blocks parent portal) | Net-new, depends on person↔user |
| Auth methods (MFA/SSO/OAuth/OTP), password show/hide | Medium | Net-new, isolated |
| No parent/guardian portal surface | Medium | Net-new, depends on relationship scope |

---

## 10. Decisions requiring operator approval

Implementation must not begin until these are resolved.

- **D1 — Person↔User link shape.** Add `users.person_id` to a canonical user table vs. a dedicated `auth_identities` join? (Recommendation: dedicated join; keeps `auth.users` untouched and supports future multi-credential.)
- **D2 — Staff-as-person.** Promote the "Employee relationship" (currently Planned, `relationship-model.md:84-90`) to canonical using the role-on-relationship pattern? Backfill existing staff users to persons?
- **D3 — `contacts` deprecation.** Does V2 close the `contacts`↔`persons` duplication, or explicitly defer it and wall it off? (It touches vendor/message/document FKs — large blast radius.)
- **D4 — Account-status model.** Confirm the state set (draft/invitation_pending/active/suspended/locked/deactivated/invitation_expired) and which are operator-driven vs system-driven.
- **D5 — Deny precedence.** Confirm V2.0 ships **additive-only** (role inheritance + additive user scope), **no** deny-precedence engine, per the mission's own guidance and the inventory (no deny mechanism exists to preserve).
- **D6 — Enforcement posture.** Adopt fail-closed route/action wrapper (requires explicit capability+scope assertion) as the standard, replacing per-route opt-in?
- **D7 — Two authority primitives.** Unify `operational_authorities` with RBAC, or keep them explicitly separate with a documented boundary?
- **D8 — RLS reconciliation scope.** Fix `current_org_id()` financial tables (T3) and role-vocabulary drift (T5) inside this mission's V2, or as a separate security sprint? (They are pre-existing, not introduced by V2.)
- **D9 — Auth method priority.** Which methods are in V2.0 (recommendation: password show/hide + lifecycle + magic link) vs V2.1+ (SSO/SAML, MFA, OAuth)?
- **D10 — Parent portal.** Is an authenticated parent/guardian portal in scope for this capability, or a downstream capability that only consumes the relationship-scope primitive V2 builds?

---

## 11. Sequenced delivery plan

Ordering rationale: **live security holes first** (T1/T2 are exploitable now and are small, contained fixes), then **the identity link everything depends on**, then **the enforcement layers**, then **isolated auth expansion** last.

**Slice 0 — Security stop-the-bleed (fixes, no new model).**
- Fix T1: self-role-edit guard + restrict assignable role (cannot self-escalate; cannot assign `admin` without being `admin`).
- Fix T2: move `assertEntityDrawerRecordReadable` scope check into the shared `runRegisteredAction` executor so all actions inherit it.
- Add audit emission (T4) to role-change/invite/remove routes (even before the full audit UI).
- *Acceptance:* cross-location `update_status` blocked; self-promotion blocked; role changes logged.

**Slice 1 — Identity unification.** Person↔user link (D1/D2), staff-as-person, user carries pointer + status not identity. Backfill.

**Slice 2 — Account lifecycle.** Status column + transitions (suspend/lock/deactivate/reactivate) without deleting auth identity; invitation-state tracking; password show/hide.

**Slice 3 — Capability enforcement (L3).** Actions declare required capability; fail-closed executor wrapper (D6); reconcile the multi-role write API.

**Slice 4 — Effective-access resolver + Experience Access (L1 + explanation).** Pure resolver, operator-language explanation, pre-save preview, real Experience-Access projection (kill the stub), surface→role mapping.

**Slice 5 — Data scope extensions (L2).** Relationship/child scope dimension; RLS backstop; reconcile T3/T5 (D8).

**Slice 6 — Field policy (L4).** Wire `fieldInteractionPolicy` to real grants; role-editor field controls.

**Slice 7 — Audit log surface + Overview health.** Full audit tables/UI; Overview health dashboard.

**Slice 8 — Authentication expansion.** Org-configurable methods, MFA, SSO/SAML, session/trusted-device policy (D9).

**Slice 9 — Parent/guardian portal** (only if D10 = in scope), consuming Slice 5's relationship scope.

---

## 12. Director acceptance rubric

The Director should **reject implementation as incomplete** when (mission validation rules, made concrete against this inventory):

- **Enforcement-free UI** — a role checkbox/surface toggle is added without a server-side assertion + a test proving denial (the L1-only trap: surfaces are presentation, not security).
- **Orphan permission** — a permission key exists but maps to no meaningful operator concept in the grid.
- **Household-wide parent access** — parent scope uses household assumptions instead of per-child relationship scope.
- **Duplicate identity** — a user-creation path writes name/email as source-of-truth instead of pointing at a person.
- **Page-only role** — a role controls surfaces but not the corresponding actions and data.
- **Happy-path-only QA** — no cross-location / cross-org / self-escalation / expired-state tests.
- **Mock-vs-matrix disagreement** — a screen looks correct but the effective-access matrix contradicts it.

**Product completion gates:** create/link a person + grant login; all person types get appropriate access without identity duplication; roles control surfaces+actions+records+fields+administration; scope previewable pre-save; auth methods configurable; password show/hide present; full lifecycle (invite/suspend/lock/deactivate/recover); effective access explained in operator language.

**Security completion gates:** every protected route has a server-side assertion; every registered command verifies authorization independent of UI placement; RLS and API scopes agree; hidden surfaces unreachable by direct URL (because L2–L4 enforce, not because nav hides); cross-location/org/child/household leakage tests pass; privilege-escalation + self-role-edit covered; audit events for consequential changes.

**UX completion gates:** no raw permission-key wall (already met by the grid); common roles configurable quickly; advanced granularity progressive; effective access explainable; empty/inherited/restricted/conflicting/expired states visually clear.

---

## 13. QA & evidence plan

- **Effective-access matrix tests** — for each seeded role × scope combination, assert the resolver's capability/visibility/field sets and the operator-language explanation string. This matrix is the source of truth QA validates *against* (mock-vs-matrix rule).
- **Security tests (must fail before Slice 0, pass after):**
  - T1: `settings.users_roles`-only user cannot self-assign `admin` (403).
  - T2: location-A-scoped user cannot `update_status` / `schedule.create` on a location-B record (404/403) via `/api/admin/actions/execute`.
  - Cross-org: no route returns another org's rows.
  - T3/T5 (if D8 in scope): authenticated-but-unauthorized direct write to `charges` denied by RLS; custom role gets correct field-table RLS grant.
- **Lifecycle tests** — each transition (invite→active→suspend→reactivate→deactivate→expire) with correct login effect.
- **Audit tests** — every consequential change emits exactly one audit event with actor/target/before/after/reason.
- **E2E/visual** — role editor renders grouped capabilities (not raw keys); effective-access preview matches resolver; empty/inherited/restricted/conflicting/expired states render distinctly.
- **Evidence discipline** — every "can" claim in the role editor must link to a passing enforcement test; a checkbox without a linked test is a rubric failure (§12).

---

## Appendix A — Primary evidence index

Auth: `web/app/login/page.tsx:74`, `web/middleware.ts:81-118`, `web/README_ADMIN_AUTH.md`, `web/app/forgot-password/page.tsx`, `web/app/reset-password/page.tsx`, `web/app/api/admin/send-password-reset/route.ts`.
Roles/permissions: `supabase/migrations/20260329165048_remote_schema.sql` (2701-2725, 2915-2920, 2333-2369), `20260505120000_user_roles_composite_primary_key.sql`, `20260505120100_settings_users_roles_permission.sql`, `20260505153000_backfill_default_role_definitions.sql`, `20260505164000_permission_grid_keys.sql`, `web/lib/admin/permissionGrid.ts:12-24`, `web/lib/admin/canManageUsersAndRoles.ts:15-40`.
Scope: `supabase/migrations/20260504103000_user_access_scope_tables_v1.sql`, `web/lib/admin/accessScope.ts`, `web/lib/admin/resolveAdminAccessCore.ts:107-292`.
Identity: `remote_schema.sql:2431-2453` (persons), `20260711153000_person_child_relationships.sql`, `docs/platform/core/entity-model.md`, `docs/platform/core/data/relationship-model.md:84-90,171-178`.
Surfaces/actions: `web/app/adminV2/components/Sidebar.tsx:208-418`, `web/lib/adminV2/configurationModeNav.ts:47-179`, `web/lib/adminV2/actions/actionRegistry.ts:23-28`, `web/lib/admin/actions/canonicalActionRegistry.ts:48-73,282-296`, `web/lib/fields/fieldInteractionPolicy.ts:8-17,191-246`.
Enforcement/RLS: `web/lib/adminAuth.ts:98-119`, `web/lib/admin/getAdminContext.ts`, `web/app/api/admin/actions/execute/route.ts:59-65`, `web/lib/adminV2/actions/actionExecutor.ts:126-185`, `remote_schema.sql:202-212` (`current_org_id()`), `20260718140000_has_org_role_security_definer.sql`, `docs/sprints/archive/06_2026/operational_execution_p3_financial_resolution_planning.md:143`, `docs/schema/schema-tables.md`, `docs/schema/schema-policies-and-security.md`.
Config UI: `web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx`, `web/components/adminV2/settings/access/AccessWorkspaceSurface.tsx`, `AccessRolesConfigurationPage.tsx`, `AccessUsersConfigurationPage.tsx`, `AccessSecurityPage.tsx`, `web/lib/access/accessPresentationContracts.ts`, `docs/platform/operator/access-product-ui.md`.

*End of deliverable D1.*
