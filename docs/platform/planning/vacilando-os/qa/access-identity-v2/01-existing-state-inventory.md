# 01 — Existing-state & authority inventory

> **Operational inventory** for Access & Identity V2 closeout. Refreshes and refines the accepted
> [`authority-path-inventory.md`](./authority-path-inventory.md) against the live worktree.
> The pre-acceptance draft at `archive/draft-inventory-pre-acceptance.md` is history, not truth.

**Mission** `msn_e9133cdade883793d2` v1 · phase *Existing-state & authority inventory* · assignment `asg_69cd1fc151087f`
**contentHash** `a48a454dc1a5a25a537a345999d982dc`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Sources** `web/`, `docs/platform/`, `supabase/migrations/`, `supabase/baselines/`
**Method** static, file-grounded. Every claim cites `path:line`. Counts reproduce with §8.

---

## 0. What this pass changed

The accepted inventory stands. Every one of its nine contradictions and six gaps was re-checked against
this worktree and **all fifteen still hold**. This pass closes three of its stated limits and adds two findings.

| Item | Accepted state | State after this pass |
|---|---|---|
| **G2** — access context without a portal gate | "latent hazard, 3 sampled safe, set-difference not computed" | **CONFIRMED, bounded: exactly 6 of 88 routes** (§4 G2) |
| **G4** — user creation and access profiles | "`POST /api/admin/users` was not audited" | **CONFIRMED defect** — it inserts `user_roles` only (§4 G4) |
| **C5** — unsavable Workflows grid row | "seeded into no catalog table" | Confirmed, and **re-diagnosed as a namespace near-miss** — `ops.workflows.*` exists, `workflows.*` does not (§3 C5) |
| **C10** — RLS role vocabulary | not reported | **NEW** — RLS authorizes `owner`/`manager`, which no migration ever seeds (§3 C10) |
| **C11** — second authority resolver | not reported | **NEW** — a second full resolver exists with different semantics (§3 C11) |

Nothing in the accepted artifact was found to be wrong. C5's evidence command was too narrow to see the
adjacent legacy keys; the corrected reading makes the defect easier to fix, not less real.

---

## 1. Headline — the chain is two chains

**person → user → role → scope is not a chain.** Alloy has two identity graphs that never join by identity:

```
PRINCIPAL GRAPH (who is acting)
  auth.users ──▶ user_roles(user_id, org_id, role) ──▶ role_definitions(org_id, role_key)
                          │                                      │
                          │                                      └──▶ role_permission_grants ──▶ permissionKeys[]
                          └──▶ user_access_profiles(user_id, org_id) ──▶ user_department_access / user_site_access

SUBJECT GRAPH (who is acted upon)
  persons ──▶ customer_persons ──▶ customers
      └──▶ contacts / opportunities ──▶ work_units(department_id) / locations(location_type='site')
```

`persons` carries **no** `user_id`, `auth_user_id`, or any column referencing `auth.users`
(`supabase/migrations/20260329165048_remote_schema.sql:2431-2450`; the only uuid actor column is `archived_by`,
which has no FK). The glossary defines **Person** as "`persons` — canonical human identity"
(`docs/platform/governance/glossary.md:86`) and defines no principal, and no person↔user relation.

The graphs meet in one place and only at query time: `web/lib/admin/accessScope.ts` filters *subject* rows by
dimensions derived from the *principal* (`fetchScopedPersonIdsForRestrictedAdmin`, `accessScope.ts:728-778`).
A person is a record; a user is a credential.

**Consequence.** "person → user" is not a leg to audit. It is a leg to *design* (§9 Q1). Everything below
concerns the three legs that exist: user → role, role → permission, user → scope.

---

## 2. Leg by leg, as built

### 2.1 user (principal)

Resolved from the auth cookie by `getCachedAuthUserId()` (`web/lib/admin/getAdminAccessContext.ts:43`), through
one path: `loadAdminAccessBundleOnce` (`getAdminAccessContext.ts:40-89`) → `resolveAdminAccessCore`
(`web/lib/admin/resolveAdminAccessCore.ts:107-203`). A single request-scoped resolver with no competing runtime
source of truth is a genuine structural strength of this codebase.

`resolveAdminAccessCore` carries a **legacy fallback** that fires whenever `user_roles` yields no rows
(`resolveAdminAccessCore.ts:131-140`):

| Order | Source | Line |
|---|---|---|
| 1 | `user_profiles.role` (org from `app_users`) | `resolveAdminAccessCore.ts:44-52` |
| 2 | `app_users.role` on `app_users.id = userId` | `:54-60` |
| 3 | `app_users.role` on `app_users.auth_user_id = userId` | `:62-68` |

Three tables can make someone `admin`/`ops`, and `app_users` is joined on *either* of two columns because the
linkage is itself ambiguous — `app_users` has both `id` and `auth_user_id` (`remote_schema.sql:1010-1019`).

### 2.2 user → role

`user_roles(user_id, org_id, role)`, FK to `auth.users(id)` and `orgs(id)` only (`remote_schema.sql:6617-6623`).
Multi-row per user is intended; the composite PK was repaired to allow it
(`20260505120000_user_roles_composite_primary_key.sql:1-4`, naming "ops + regional_lead").

`chooseOrgAndRoleKeysFromMembershipRows` (`resolveAdminAccessCore.ts:26-37`) picks **one primary org** —
admin/ops rows win, else lexicographically smallest `org_id`. Roles in any other org are discarded.

Portal eligibility is the product's real gate:

```ts
const PORTAL_ROLES = new Set(["admin", "ops"]);                   // resolveAdminAccessCore.ts:18
const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r)); // :142
```

Every tier-2 gate reduces to that boolean — `getAdminContext` (`web/lib/admin/getAdminContext.ts:38-40`),
`getAdminAuth` (`web/lib/adminAuth.ts:43-45`), `loadAdminRouteGate` (`web/lib/admin/adminRouteGate.ts:43-45`).

### 2.3 role → permission

`role_permission_grants(org_id, role_key, permission_key, allowed)` unioned into `permissionKeys[]`
(`resolveAdminAccessCore.ts:83-101,143`). Grants FK to `role_definitions(org_id, role_key)`
(`remote_schema.sql:6512-6518`) and to **two** catalog tables at once (C3).

### 2.4 user → scope

`user_access_profiles(user_id, org_id, department_scope, site_scope)` plus two allow-list junction tables
(`20260504103000_user_access_scope_tables_v1.sql:18-30,69-80,150-161`). This is the best-built leg: org-match
triggers on both junctions (`:105-139`, `:186-228`), `location_type='site'` validation, and real query-layer
enforcement across 28 exported helpers in `web/lib/admin/accessScope.ts`.

A missing profile row silently means **unrestricted** (`resolveAdminAccessCore.ts:161`, whose own comment says
"legacy transition until profiles always exist").

---

## 3. Contradictions

### C1 — The audit script reports 507 permission-gated routes. **17 are.**

`web/scripts/auditAuthorityPaths.mjs` over 539 routes:

```
tier 0 none         28
tier 1 session       0
tier 2 role          4
tier 3 permission  507
service-role (RLS-bypassing): 517       service-role AND tier 0: 22
```

`tier 3 = 507` is a measurement artifact. The histogram of which module earned each route its credit proves it:

| Routes credited | Crediting module | Branches on `permissionKeys`? |
|---:|---|---|
| 440 | `lib/admin/getAdminAccessContext.ts` | **No** — resolves and returns the bundle (`:102-116`) |
| 30 | `lib/admin/adminRouteGate.ts` | **No** — gates on `portalEligible` (`:43-45`), copies `permissionKeys` out unread (`:51`) |
| 20 | `lib/admin/resolveAdminAccessCore.ts` | **No** — the SQL that fetches grants (`:83-101`) |
| 8 | `lib/admin/canManageUsersAndRoles.ts` | **Yes** (`:17`) |
| 9 | config-layout-assist route/helper modules | **Yes** |

The `PRIMITIVES` regex `/permissionKeys\b/` (`auditAuthorityPaths.mjs:37`) cannot distinguish *resolving* a
permission set from *consulting* it, and `if (best.tier === 3) return best` (`:103`) stops the walk at the first
mention. **490 of 507 are false positives.**

**Ground truth — 11 files in `web/lib` mention `permissionKeys`; 8 branch on it:**

| Module | Keys consulted |
|---|---|
| `web/lib/admin/canManageUsersAndRoles.ts:17` | `settings.users_roles` |
| `web/lib/communications/communicationPermissions.ts:34-35` | `communications.send`, legacy alias `ops.messaging.write` |
| `web/lib/ai/aiEnrichmentPermissions.ts:34,63` | `ai.enrichment.use` |
| `web/lib/operationalExpectations/intake/authoringServerContext.ts:41` | `operational_expectations.author` |
| `web/lib/operationalExpectations/ratification/ratificationServerContext.ts:39` | `operational_expectations.ratify` |
| `web/lib/agent/configLayoutAssist/configurationProposalAccess.ts:39` | `config_assist.*`, `fields`/`sections`/`layouts`/`option_sets.manage` |
| `web/lib/agent/configLayoutAssist/configurationProposalApiHelpers.ts` | (same family) |
| `web/lib/agent/configLayoutAssist/apply/configurationProposalApply.ts` | (same family) |
| `web/app/api/admin/configuration/programs/route.ts:54-55,65` | `settings.read`, `settings.manage` |

The other 3 — `resolveAdminAccessCore.ts`, `getAdminAccessContext.ts`, `adminRouteGate.ts` — resolve and carry.

### C2 — Canonical governance states a rule the code does not follow

`docs/platform/governance/roles-and-permissions.md` is `status: canonical`, "Canonical (V1 as-built)":

> **Rule:** Role ≠ visibility. Check `permissionKeys` for capabilities; check access profile for data scope. — `:25`

As-built, ~500 admin routes check `portalEligible`; 17 check `permissionKeys`. The doc's "Verification debt"
understates this as "Not every admin route opts into access context yet — grep when touching routes" (`:47`).
The real state is that opting into access context does not, by itself, consult a single permission.

The same doc gives the membership layer as `user_roles` → `role_definitions.role_key` (`:20`). **There is no
such foreign key.** `user_roles` carries only `org_id` and `user_id` FKs (`remote_schema.sql:6617-6623`);
`user_roles.role` is unconstrained text. The constraint lives in application code on one write path
(`web/app/api/admin/users/[userId]/role/route.ts:27-30`, which checks `role_definitions` + `is_active`).

Its "Expanded reference" pointer `../../system/roles-and-permissions.md` (`:53`) resolves to
`docs/system/roles-and-permissions.md`, **which does not exist**.

### C3 — Three permission catalogs; dual FKs on one column

`role_permission_grants.permission_key` carries **two** foreign keys on the same column:

```sql
role_permission_grants_permission_key_fkey  → permission_keys(key)  ON DELETE RESTRICT  -- remote_schema.sql:6503
role_permission_grants_permissions_fkey     → permissions(key)      ON DELETE CASCADE   -- remote_schema.sql:6508
```

A third table, `permission_definitions`, is what the write API validates against
(`web/app/api/admin/rbac/grants/route.ts:61-67`). Every new permission must be inserted into all three or grants
fail. The migrations do exactly that and say so (`20260505120100_settings_users_roles_permission.sql:4-7`;
`20260505164000_permission_grid_keys.sql:4-5`, "dual FKs on the same column in this schema"). This is a known,
hand-maintained duplication with **two different `ON DELETE` semantics on the same referencing column**.

### C4 — Three permission vocabularies, mostly disjoint

| Vocabulary | Source | Enforced? |
|---|---|---|
| `admin.users.*`, `ops.customers.*`, `ops.jobs.*`, `ops.workflows.*`, `fin.*` (22 keys) | `seed_default_rbac()`, `remote_schema.sql:711-737` — granted **in full to `admin`**, and to `ops` minus two (`:748-760`) | Only `ops.messaging.write`, as a back-compat alias (`communicationPermissions.ts:35`) |
| `crm.*`, `communications.*`, `scheduling.*`, `billing.*`, `documents.*`, `reports.*`, `settings.*`, `workflows.*` (20 keys) | `PERMISSION_GRID_ROWS`, `web/lib/admin/permissionGrid.ts:12-24`; 17 seeded by `20260505164000_permission_grid_keys.sql:9-32`, `settings.users_roles` by `20260505120100:11` | 4 of 20 |
| `config_assist.*`, `fields`/`sections`/`layouts`/`option_sets.manage`, `ai.enrichment.use`, `operational_expectations.author`/`.ratify` | per-feature migrations | **All** |

Of the grid's 20 keys, **4 are enforced** (`communications.send`, `settings.read`, `settings.manage`,
`settings.users_roles`); of the ~17 enforced keys, 13 have no grid row at all.

**An operator cannot grant, from the UI, most of what the platform enforces — and most of what the UI offers
changes nothing.**

### C5 — The grid offers a permission that cannot be saved (namespace near-miss)

`permissionGrid.ts:23` renders a "Workflows / Automation" row over `workflows.read` / `workflows.write`:

```ts
{ id: "workflows", label: "Workflows / Automation", readKeys: ["workflows.read"], writeKeys: ["workflows.write"] },
```

Those two keys are seeded into **no** catalog table. The grid seed migration
(`20260505164000_permission_grid_keys.sql:9-32,40-63,72-95,106-113`) seeds 17 keys and omits both. **18 of the
grid's 20 keys are seeded; these 2 are not.**

The refinement: keys of that name *nearly* exist. `seed_default_rbac()` seeds `ops.workflows.read` and
`ops.workflows.write` (`remote_schema.sql:731-732`) — the legacy namespace. The grid asks for the bare form.
So this is a one-prefix mismatch between two vocabularies (C4), not an invented concept.

`PUT /api/admin/rbac/grants` validates the submitted set against `permission_definitions` and rejects unknown
keys with HTTP 400 (`grants/route.ts:61-67`). Validation runs **before** the delete-all-then-insert
(`:70-89`), so no grant data is lost — but the row is inoperable by construction, and toggling it fails the
whole save including the operator's other, valid selections on that screen.

### C6 — Two platform-seeded roles cannot log in

Every org is seeded with four `is_system` roles — `admin`, `ops`, `regional_lead`, `school_director`
(`20260505120100_settings_users_roles_permission.sql:59-65`, repeated in
`20260505153000_backfill_default_role_definitions.sql:12-18`). `PORTAL_ROLES` is `{admin, ops}`
(`resolveAdminAccessCore.ts:18`).

A user holding only `regional_lead` or `school_director` is not `portalEligible`: the AdminV2 layout redirects
to `/unauthorized` (`web/app/adminV2/layout.tsx:23-30`) and admin APIs return 403 — regardless of grants. **The
platform ships two named personas it cannot admit.** The one escape hatch is
`requirePortalOrUsersRolesManageAuth` (`canManageUsersAndRoles.ts:46-63`), which admits a non-portal role
holding `settings.users_roles` — i.e. the only thing a custom role can reach is the screen for managing roles.

### C7 — Multi-role is modelled everywhere and writable nowhere

The composite PK exists specifically to allow "ops + regional_lead"
(`20260505120000_user_roles_composite_primary_key.sql:4`); the resolver computes `roleKeys[]` as a set
(`resolveAdminAccessCore.ts:33-36`). But the only role-assignment API deletes every row for `(user, org)` and
inserts exactly one (`web/app/api/admin/users/[userId]/role/route.ts:38-44`), and says so in its own docstring:
"Multi-role personas (e.g. ops + regional_lead) must be re-added via seed or a future additive API" (`:5-7`).
**The multi-role model is unreachable through the product.**

### C8 — Department scope is bypassed by exactly the roles that can log in

`portalAdminBypassesDepartmentScope` forces `departmentScope = "all"` for any `admin`/`ops`
(`web/lib/admin/accessScope.ts:45,51-53`), applied by `effectiveDepartmentScopeDimensions` (`:56-67`). Combined
with C6 — only `admin`/`ops` reach the portal — **every user who can use the product bypasses department
scope.** Site scope is not bypassed and remains effective.

### C9 — Three SQL definitions of "is this user privileged"

| Function | Reads | Line |
|---|---|---|
| `has_org_role(org, roles[])` | `user_roles` | `20260718140000_has_org_role_security_definer.sql:11-17` |
| `is_admin()` | `app_users.role` | `remote_schema.sql:439-448` |
| RLS policies on 3 tables | `user_profiles.role = 'admin'::app_role` | `remote_schema.sql:6795,6801,6807` |

Three sources of truth for one question, live simultaneously in RLS.

### C10 — RLS authorizes two roles the product can never assign *(new)*

The role literals appearing in RLS policy bodies in `remote_schema.sql`:

| Literal | Occurrences | Seeded as a `role_definitions` row? |
|---|---:|---|
| `admin` | 236 | yes |
| `ops` | 183 | yes |
| `owner` | 71 | **no** |
| `manager` | 14 | **no** |

`owner` and `manager` are authorized throughout RLS — including in current hardening work
(`20260714000001_commercial_catalog_rls_hardening.sql:51,58,65,73`;
`20260722020000_configuration_publication_runtime_v1.sql:880`;
`20260701120000_childcare_rate_plans_p3_2.sql:218,225,232`) — yet neither appears in either seed of the four
system roles (`20260505120100:59-65`, `20260505153000:12-18`). Conversely, `regional_lead` and
`school_director` appear **zero** times in `remote_schema.sql`.

So the two role vocabularies intersect only on `{admin, ops}`:

```
seeded / assignable :  admin  ops  regional_lead  school_director
RLS-authorized      :  admin  ops  owner          manager
```

Because `user_roles.role` is unconstrained text (C2) and the assignment API restricts to `role_definitions`
(C7), `owner` and `manager` rows are reachable only by direct SQL. This is not currently exploitable through the
product — it is a **specification defect**: RLS is written against a role model the product does not implement,
so RLS grants for `owner`/`manager` are dead code, and RLS provides nothing for the two seeded custom personas.

### C11 — A second authority resolver, with different semantics *(new)*

`resolveAdminAccessDimensionsForOrgMember` (`resolveAdminAccessCore.ts:209-290`) recomputes the entire access
result — `roleKeys`, `permissionKeys`, both scopes, both allow-lists, `portalEligible` (`:233`) — for an
explicit `(userId, orgId)` pair. Its docstring scopes it to "admin settings preview only."

It is correctly *narrower* by design (no primary-org picking), but it also differs in ways the docstring does
not state:

- **no legacy fallback** — it returns `null` when `user_roles` is empty (`:228`), where the primary resolver
  would consult `user_profiles`/`app_users` (§2.1). The preview therefore shows nothing for exactly the users
  whose authority comes from the legacy path.
- **no department-scope bypass** — it returns the stored `departmentScope` (`:245-250`) without
  `effectiveDepartmentScopeDimensions` (C8). The preview shows an `admin` as department-restricted when at
  runtime that user is not.

The accepted inventory's "one resolver, no competing source of truth" holds for the *request* path. For the
*operator-facing preview* of what a user can do, there is a second implementation that can disagree with
runtime in both directions. **The screen an operator uses to reason about access is not driven by the code that
enforces it.**

---

## 4. Gaps

### G1 — `handle_new_user()` defaults every new auth user to `ops`, and its trigger is unversioned

```sql
insert into public.user_profiles (id, role) values (new.id, 'ops');   -- remote_schema.sql:409-417
```

`user_profiles.role` is `app_role NOT NULL DEFAULT 'ops'` (`remote_schema.sql:2906`), and `user_profiles.role`
is the first thing the legacy fallback consults (`resolveAdminAccessCore.ts:44-52`). The fallback fires only
when `user_roles` is empty *and* an `app_users` row supplies an `org_id` (`:50-51`) — so this is a **latent**
escalation path, not a demonstrated one.

What makes it a gap: **no `CREATE TRIGGER` on `auth.users` exists in `supabase/migrations/` or
`supabase/baselines/`.** The function is defined in both (`remote_schema.sql:409`, `prod_baseline.sql:244`) and
granted to `anon`, `authenticated` and `service_role` (`remote_schema.sql:8928-8930`), but whether it is
attached is **not visible in version control**. Live-DB verification required (§7.2).

### G2 — 6 routes gate on `access.ok` alone *(closed — was deferred)*

`getAdminAccessContextCached` (`getAdminAccessContext.ts:102-116`) destructures `portalEligible` away and
returns `ok: true` for any authenticated user with a resolvable org membership — including `regional_lead` and
`school_director`. `docs/platform/governance/api-contracts.md:18-19` documents the intended two-step pattern, so
step 2 alone is not a gate.

The set-difference the accepted inventory could not run has now been computed (88 access-context routes minus
those carrying a portal-gate token). **6 of 88 routes gate on `access.ok` and nothing else:**

| Route | Gate |
|---|---|
| `web/app/api/admin/intelligence/operational/route.ts:26-29` | `if (!access.ok) return adminContextFailureResponse(access)` |
| `web/app/api/admin/metrics/resolve/route.ts:83-84` | same |
| `web/app/api/admin/metrics/trends/route.ts:47-48` | same |
| `web/app/api/admin/analytics/metrics/[id]/trend/route.ts:40-41` | same |
| `web/app/api/admin/analytics/metrics/[id]/preview/route.ts:31-32` | same |
| `web/app/api/admin/analytics/metrics/[id]/snapshot/route.ts:23-24` | same |

A seventh route in the raw difference, `web/app/api/admin/configuration/programs/route.ts`, is **correctly
gated** — by permission rather than by portal role (`:54-55,65`), which is the shape §9 Q2 recommends.

All six are operational-analytics reads. They do apply scope dimensions
(`scopeDimensionsFromAccess`, e.g. `intelligence/operational/route.ts:33`), so site scope still narrows the
result. Exposure is: **org-wide metrics and analytics readable by any authenticated member of the org,
including the two personas the product refuses to admit to the portal.** No mutation route is affected.

This bounds the accepted inventory's hazard: 82 of 88 are properly paired, and the leak is a read surface,
not a write one.

### G3 — Users & Roles managers can grant themselves `admin`

`canManageUsersAndRoles` admits any `admin` roleKey *or* any holder of `settings.users_roles`
(`canManageUsersAndRoles.ts:15-18`). `PATCH /api/admin/users/[userId]/role` gates on exactly that (`:10-12`)
and applies **no ceiling** — no check that the assigned role is ≤ the caller's own, and no self-assignment
guard. It validates only that the target role is an active `role_definitions` row for the org (`:27-30`).

A `settings.users_roles` holder can therefore set any user's role, including their own, to `admin`. Whether
this is intended delegation or an escalation is a **product decision**, not a code question (§9 Q2).

### G4 — User creation never creates an access profile *(closed — was deferred)*

`resolveAdminAccessCore.ts:152-161`: an absent `user_access_profiles` row ⇒ both scopes `all`. The migration
backfilled memberships existing at the time (`20260504103000_user_access_scope_tables_v1.sql:272-275`).

The accepted inventory left open whether the create path maintains the invariant. It does not.
`POST /api/admin/users` (`web/app/api/admin/users/route.ts:67`) inserts into **`user_roles` only**
(`:102-106`); the file contains no reference to `user_access_profiles`, `user_department_access` or
`user_site_access`.

**Every membership created through the product since that migration has no access profile, and therefore
unrestricted department and site scope by default.** This is fail-open, confirmed, and it silently undoes the
one leg of the chain that is otherwise well built (§2.4). Combined with C11, an operator viewing that user in
Settings sees scope dimensions derived from the same missing row.

### G5 — Catalog tables accumulate rows nothing grants and nothing checks

`seed_default_rbac()` grants `admin` **every active row in `permission_keys`** (`remote_schema.sql:748-752`)
and `ops` all but two (`:755-760`). Because that table now also holds the grid vocabulary and every feature
vocabulary (C4), this is an unbounded blanket grant whose content changes whenever any migration seeds a key.

### G6 — RLS is not a backstop for the API

517 of 539 route files hold a service-role client, documented as bypassing RLS (`web/lib/supabaseAdmin.ts`).
Middleware returns before gating anything under `/api/*` (`web/middleware.ts:106-108`; `requiresOperatorSession`
covers only operator page paths, `web/lib/admin/operatorSessionGate.ts:16-22`). For ~96% of the privileged
surface, **the check inside the handler's own module graph is the only authority that exists.** C10 compounds
this: even where RLS does apply, part of its role model is unreachable.

---

## 5. Enforced vs configured

| Authority concept | Configured | Enforced |
|---|---|---|
| Authenticated session | yes | **yes** — pages (middleware + AdminV2 layout) and all admin API |
| Org membership / tenant isolation | yes | **yes** — every gate carries `orgId` |
| Portal eligibility (`admin`/`ops`) | yes | **yes** — the primary and near-only API gate |
| `admin` vs `ops` | yes | partial — `requireAdmin` only |
| Custom / non-portal roles (`regional_lead`, `school_director`) | yes, seeded per org | **no** — cannot reach the portal (C6); absent from RLS (C10) |
| RLS roles `owner` / `manager` | **no** — never seeded | policies exist but are unreachable (C10) |
| Multi-role membership | yes (schema + resolver) | **no write path** (C7) |
| Permission grants — 8 feature modules | yes | **yes** (C1 table) |
| Permission grants — grid's core domains | yes (grid + 3 catalogs + DB) | **no** — 16 of 20 grid keys (C4) |
| `workflows.read` / `workflows.write` | UI only | **not seeded** — `ops.workflows.*` exists instead (C5) |
| Department scope | yes | **no** for `admin`/`ops` (C8) — i.e. for everyone who can log in |
| Site scope | yes | **yes** — real query-layer enforcement, 28 helpers |
| Access profile on new membership | intended | **no** — never created (G4) |
| Operator preview of effective access | yes | **diverges from runtime** (C11) |
| person → user identity | **no** | n/a — the relation does not exist (§1) |

---

## 6. Relation to prior artifacts

**`authority-path-inventory.md` (accepted).** Re-verified in full against this worktree; all 9 contradictions
and 6 gaps confirmed. Counts reproduce exactly: 539 routes, 517 service-role, 88 access-context routes, 11
`permissionKeys` files in `web/lib`, 8 branching. This document supersedes it as the operational inventory by
closing G2 and G4, sharpening C5, and adding C10 and C11.

**`docs/platform/planning/access-identity-v2/inventory.md` (superseded, route-census angle).** Its corrections
stand: (1) its §8 deferred the tier census, which when run reports 507 permission-gated routes — a false
positive; the true figure is 17 via 8 modules (C1). (2) Its F4 attributes `fields.manage` /
`sections.manage` / `layouts.manage` / `option_sets.manage` to
`web/app/api/admin/configuration/programs/route.ts`; that route consults `settings.read` / `settings.manage`,
and those keys belong to the Config Layout Assist family
(`web/lib/agent/configLayoutAssist/configurationProposalPermissions.ts:12-24`).

---

## 7. Limits

1. **Static, not dynamic.** Reachability is proven by imports and reads, not execution. No request was issued,
   no browser used, no live database queried. Per the assignment, no product UI claim is made here.
2. **G1 still requires live verification.** Absence of `CREATE TRIGGER` in version control is not proof of
   absence in the deployed database: `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;`
3. **G2 is a token-level difference.** A route is counted as gated if it names any gate primitive; a route that
   gated inside a bespoke local helper without those tokens would be missed. All six survivors were read
   individually and confirmed by hand.
4. **Token and webhook strength unaudited.** The 28 tier-0 routes are classified by family; whether each
   capability token is unguessable, expiring, single-use or scope-bound was not assessed, nor was webhook
   signature verification.
5. **RLS policy content largely unread.** C10 counts role literals across policy bodies; individual `USING` /
   `WITH CHECK` clauses were not evaluated for correctness beyond the role vocabulary and the three
   `user_profiles.role` policies in C9.
6. **C10 is not an exploit claim.** No path was found by which the product writes `owner` or `manager` into
   `user_roles`; it is reported as a specification divergence.
7. **Read-only.** No source file was modified by this phase. The only file written is this document.

---

## 8. Reproduce

```bash
# Route + service-role census
rg -l --glob 'route.ts' '' web/app/api | wc -l          # 539
rg -l 'supabaseAdmin|createServiceRoleClient|SERVICE_ROLE' --glob 'web/app/api/**/route.ts' | wc -l   # 517

# C1 — transitive script vs ground truth
npm run --prefix web audit:authority-paths
rg -l 'permissionKeys' web/lib                                              # 11 files
rg -n 'permissionKeys[^A-Za-z]*(\.includes|\.some|\.has)' web -g '!node_modules'   # 8 branch + programs route

# G2 — access-context routes lacking any portal-gate token
rg -l 'getAdminAccessContext' -g 'route.ts' web/app/api | wc -l             # 88
grep -rLE 'getAdminContextCached|getAdminAuth|requireAdminOrOps|requireAdmin|loadAdminRouteGate|UsersRolesManageAuth|resolveOperatorRoute|portalEligible' \
  --include=route.ts web/app/api/admin                                      # 45; intersect with the 88 → 7, of which 6 are ungated

# G4 — user creation writes no access profile
rg -n 'user_access_profiles|user_roles|insert' web/app/api/admin/users/route.ts

# §1 — person → user: no link
rg -n -A22 'CREATE TABLE IF NOT EXISTS "public"."persons"' supabase/migrations/20260329165048_remote_schema.sql

# C3 — dual FKs on one column
rg -n 'role_permission_grants_permission' supabase/migrations

# C5 — grid asks for workflows.*; only ops.workflows.* is seeded
rg -n 'workflows' web/lib/admin/permissionGrid.ts                           # :23
rg -n "workflows\.(read|write)" supabase/migrations                         # only ops.workflows.* @ remote_schema.sql:731-732
rg -n "'(crm|communications|scheduling|billing|documents|reports|settings|workflows)\.[a-z_.]+'" \
  supabase/migrations/20260505164000_permission_grid_keys.sql               # 17 keys, no workflows.*

# C6 — four seeded system roles vs two portal roles
rg -n 'regional_lead|school_director' supabase/migrations
rg -n 'PORTAL_ROLES' web/lib/admin/resolveAdminAccessCore.ts

# C10 — RLS role vocabulary vs seeded roles
rg -o "'(owner|manager|admin|ops|regional_lead|school_director)'::\"?text\"?" \
  supabase/migrations/20260329165048_remote_schema.sql | sort | uniq -c | sort -rn
rg -n "'owner'|'manager'" supabase/migrations/20260505120100_settings_users_roles_permission.sql \
  supabase/migrations/20260505153000_backfill_default_role_definitions.sql   # no matches
rg -c 'regional_lead|school_director' supabase/migrations/20260329165048_remote_schema.sql   # no matches

# C11 — second resolver
rg -n 'resolveAdminAccessDimensionsForOrgMember' web

# G1 — function defined, trigger not in version control
rg -n 'handle_new_user' supabase/
rg -n 'CREATE TRIGGER' supabase/ | rg -i 'auth'                             # no matches
```

---

## 9. Handoff to the model phase

Four questions the canonical authority model must answer, in dependency order. The first three are unchanged
from the accepted inventory; the fourth is new.

1. **Is a person ever a user?** Access & Identity V2 cannot specify "person → user → role → scope" until the
   platform decides whether `persons` gains a principal link (family portal, staff self-service) or whether
   principals stay a separate population and `persons` remains purely a subject. Everything downstream depends
   on this. It is a product decision, not an engineering one.

2. **What admits someone to the portal, and what bounds delegation?** The enforcement vocabulary is
   `{admin, ops}`; the configuration vocabulary is `role_definitions × permission_keys`. C6, C7 and G3 are one
   defect seen from three sides. Either `portalEligible` derives from a granted permission, or a portal-access
   permission is introduced that custom roles can hold — and either way the role-assignment ceiling in G3 must
   be decided at the same time, because delegated role management without a ceiling makes any permission model
   collapse to `admin`. The Config Layout Assist and Operational Expectations families already demonstrate the
   working shape at feature scale, and `configuration/programs/route.ts:54-55,65` shows it on a plain route.

3. **One permission vocabulary, or none?** C3, C4 and C5 are one failure: three catalog tables, three key
   vocabularies, and a UI grid that is neither the enforced set nor a subset of it. The cheapest coherent move
   is to make `PERMISSION_GRID_ROWS` a *projection of what is enforced* rather than an independent list — which
   makes C5 impossible by construction and turns C4 into a visible, shrinking gap instead of an invisible one.
   C5's namespace near-miss (`workflows.*` vs `ops.workflows.*`) shows the cost of hand-maintained parallel
   lists is already being paid.

4. **Which layer owns the role model — RLS or the resolver?** *(new)* C10 shows RLS is written against
   `{owner, admin, ops, manager}` while the product seeds `{admin, ops, regional_lead, school_director}`. With
   517 of 539 routes bypassing RLS (G6), RLS today is neither the enforcement layer nor a coherent backstop.
   The model phase should either bring RLS's vocabulary under the same `role_definitions` source of truth or
   state explicitly that RLS is not an authority layer — leaving it in its current state means every future
   reader has to rediscover that two of its four roles are dead.

Two methodological warnings for whatever this phase hands forward:

- **Reachability of a permission set is not enforcement of it.** Any audit that greps or walks imports for
  `permissionKeys` will over-report by roughly 30× in this codebase (C1).
- **What the operator is shown is computed by different code than what the runtime enforces** (C11), and the
  invariant that makes scope meaningful is not maintained on create (G4). A model phase that specifies scope
  without specifying who creates the profile row will specify something the product does not do.
