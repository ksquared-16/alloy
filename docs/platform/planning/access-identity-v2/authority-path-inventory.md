# Authority Path Inventory — person → user → role → scope

> **Authoritative accepted artifact** for Access & Identity V2 inventory.
> An earlier draft at `docs/platform/planning/access-identity-v2/inventory.md` is superseded;
> preserved for history at `archive/draft-inventory-pre-acceptance.md` (not operational truth).

**Mission** `msn_f904f4970652b86e34` v1 · phase *Authority Path Inventory* · assignment `asg_e22f196db64054`
**contentHash** `811d73bdb8cf97f0593db86a3f906c01`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Sources** `web/`, `docs/platform/`, `supabase/migrations/` (schema is where three of the contradictions live)

This inventory walks the authority chain named in the objective — **person → user → role → scope** — one leg at a
time, states what each leg actually is in the live codebase, and then enumerates contradictions and gaps.
Every claim cites `path:line`. Counts are reproducible with the commands in §8.

---

## 1. Headline

**The chain does not exist as a chain.** Alloy has two disjoint identity graphs that are never joined by identity:

```
PRINCIPAL GRAPH (who is acting)
  auth.users ──▶ user_roles(user_id, org_id, role) ──▶ role_definitions(org_id, role_key)
                          │                                      │
                          │                                      └──▶ role_permission_grants ──▶ permissionKeys[]
                          └──▶ user_access_profiles(user_id, org_id) ──▶ user_department_access / user_site_access

SUBJECT GRAPH (who is being acted upon)
  persons ──▶ customer_persons ──▶ customers
      └──▶ contacts / opportunities ──▶ work_units(department_id) / locations(location_type='site')
```

`persons` has **no** `user_id`, `auth_user_id`, or any column referencing `auth.users`
(`supabase/migrations/20260329165048_remote_schema.sql:2431-2450` — the only uuid actor column is
`archived_by`, which carries no FK). The platform glossary defines **Person** as "`persons` — canonical human
identity" (`docs/platform/governance/glossary.md:86`) but defines no principal and no person↔user relation.

The two graphs meet in exactly one place, and only at query time, never by identity: `web/lib/admin/accessScope.ts`
filters *subject* rows by department/site dimensions derived from the *principal*
(`fetchScopedPersonIdsForRestrictedAdmin`, `accessScope.ts:728-778`). A person is a data record; a user is a
credential. Nothing in the schema says a given `persons` row *is* a given `auth.users` row.

**Consequence for Access & Identity V2:** "person → user" is not a leg to be audited, it is a leg to be *designed*.
Everything below concerns the three legs that do exist: user → role → permission, and user → scope.

---

## 2. Leg by leg

### 2.1 user (principal)

The principal is `auth.users.id`, resolved from the auth cookie by `getCachedAuthUserId()`
(`web/lib/admin/getAdminAccessContext.ts:43`). One resolver serves every gate:
`loadAdminAccessBundleOnce` (`getAdminAccessContext.ts:40-89`) → `resolveAdminAccessCore`
(`web/lib/admin/resolveAdminAccessCore.ts:107-203`). This single-resolver design is a genuine structural
strength — there is no competing runtime source of truth for a request's authority.

But `resolveAdminAccessCore` has a **legacy fallback** that fires whenever `user_roles` yields no rows
(`resolveAdminAccessCore.ts:131-140`). It consults, in order:

| Order | Source | Line |
|---|---|---|
| 1 | `user_profiles.role` (+ org from `app_users`) | `resolveAdminAccessCore.ts:44-52` |
| 2 | `app_users.role` matched on `app_users.id = userId` | `:54-60` |
| 3 | `app_users.role` matched on `app_users.auth_user_id = userId` | `:62-68` |

So there are **three** tables that can make someone `admin`/`ops`, and `app_users` is joined to the auth user on
*either* of two columns because the linkage is itself ambiguous (`app_users` has both `id` and `auth_user_id`,
`remote_schema.sql:1010-1019`).

### 2.2 user → role

`user_roles(user_id, org_id, role)`, FK to `auth.users(id)` and `orgs(id)`
(`remote_schema.sql:6617-6623`). Multi-row per user is intended and the composite PK was repaired to allow it
(`supabase/migrations/20260505120000_user_roles_composite_primary_key.sql:1-4`, which names
"ops + regional_lead" as the motivating case).

`chooseOrgAndRoleKeysFromMembershipRows` (`resolveAdminAccessCore.ts:26-38`) picks **one primary org**:
admin/ops rows win; otherwise the lexicographically smallest `org_id`. Roles from any *other* org are discarded.

Portal eligibility is the product's real gate:

```ts
const PORTAL_ROLES = new Set(["admin", "ops"]);        // resolveAdminAccessCore.ts:18
const portalEligible = roleKeys.some(r => PORTAL_ROLES.has(r));  // :142
```

Every tier-2 gate reduces to that one boolean — `getAdminContext` (`web/lib/admin/getAdminContext.ts:38-40`),
`getAdminAuth` (`web/lib/adminAuth.ts:43-45`), `loadAdminRouteGate` (`web/lib/admin/adminRouteGate.ts:43-45`).

### 2.3 role → permission

`role_permission_grants(org_id, role_key, permission_key, allowed)` unioned into `permissionKeys[]`
(`resolveAdminAccessCore.ts:83-101,143`). Grants FK to `role_definitions(org_id, role_key)`
(`remote_schema.sql:6512-6518`) and to **two** catalog tables simultaneously (§3, C3).

### 2.4 role → scope

`user_access_profiles(user_id, org_id, department_scope, site_scope)` plus two allow-list junction tables
(`supabase/migrations/20260504103000_user_access_scope_tables_v1.sql:18-30,69-80,150-161`). Scope is the
best-built leg in the whole chain: org-match triggers on both junction tables (`:105-139`, `:186-228`),
`location_type='site'` validation, and real query-layer enforcement across ~20 helpers in
`web/lib/admin/accessScope.ts`.

A missing profile row silently means **unrestricted** (`resolveAdminAccessCore.ts:161`, comment: "legacy
transition until profiles always exist").

---

## 3. Contradictions

### C1 — The transitive audit script says 507 routes are permission-gated. **17 are.**

The script committed with the prior phase (`web/scripts/auditAuthorityPaths.mjs`) has now actually been run
(prior inventory §8 deferred it). Output over 539 routes:

```
tier 0 none         28
tier 1 session       0
tier 2 role          4
tier 3 permission  507
service-role (RLS-bypassing): 517       service-role AND tier 0: 22
```

`tier 3 = 507` is a **measurement artifact**, and the histogram of which module earned each route its tier-3
credit proves it:

| Routes credited | Crediting module | Does it check `permissionKeys`? |
|---:|---|---|
| 440 | `lib/admin/getAdminAccessContext.ts` | **No** — resolves the bundle and returns it (`:102-116`) |
| 30 | `lib/admin/adminRouteGate.ts` | **No** — gates on `portalEligible` (`:43-45`), copies `permissionKeys` into the caller's hand unread (`:51`) |
| 20 | `lib/admin/resolveAdminAccessCore.ts` | **No** — the SQL that fetches grants (`:83-101`) |
| 8 | `lib/admin/canManageUsersAndRoles.ts` | **Yes** (`:17`) |
| 9 | config-layout-assist route/helper modules | **Yes** |

The script's `PRIMITIVES` regex `/permissionKeys\b/` (`auditAuthorityPaths.mjs:37`) cannot distinguish *resolving*
a permission set from *consulting* it, and its `if (best.tier === 3) return best` short-circuit (`:103`) stops the
walk at the first mention. 490 of the 507 are false positives.

**Ground truth.** Modules that actually branch on `permissionKeys` — 8 of the 11 files in `web/lib` that mention it:

| Module | Keys consulted |
|---|---|
| `web/lib/admin/canManageUsersAndRoles.ts:17` | `settings.users_roles` |
| `web/lib/communications/communicationPermissions.ts:34-35` | `communications.send`, legacy alias `ops.messaging.write` |
| `web/lib/ai/aiEnrichmentPermissions.ts:34,63` | `ai.enrichment.use` |
| `web/lib/operationalExpectations/intake/authoringServerContext.ts:41` | `operational_expectations.author` |
| `web/lib/operationalExpectations/ratification/ratificationServerContext.ts:39` | `operational_expectations.ratify` |
| `web/lib/agent/configLayoutAssist/configurationProposalAccess.ts:39` | `config_assist.*`, `fields/sections/layouts/option_sets.manage` |
| `web/lib/agent/configLayoutAssist/configurationProposalApiHelpers.ts` | (same family) |
| `web/lib/agent/configLayoutAssist/apply/configurationProposalApply.ts` | (same family) |
| `web/app/api/admin/configuration/programs/route.ts:54-55,65` | `settings.read`, `settings.manage` |

The remaining 3 — `resolveAdminAccessCore.ts`, `getAdminAccessContext.ts`, `adminRouteGate.ts` — resolve and carry.

*Correction to the prior inventory (`docs/platform/planning/access-identity-v2/inventory.md`):* its F4 table
attributes `fields.manage`/`sections.manage`/`layouts.manage`/`option_sets.manage` to
`web/app/api/admin/configuration/programs/route.ts`. That route consults `settings.read`/`settings.manage`; the
field/section/layout keys are consulted by the Config Layout Assist family
(`web/lib/agent/configLayoutAssist/configurationProposalPermissions.ts:12-24`).

### C2 — Canonical governance states a rule the code does not follow

`docs/platform/governance/roles-and-permissions.md` is marked `status: canonical`, "Canonical (V1 as-built)":

> **Rule:** Role ≠ visibility. Check `permissionKeys` for capabilities; check access profile for data scope.
> — `:25`

As-built, ~500 admin routes check `portalEligible` — `roleKeys ∩ {admin, ops} ≠ ∅` — and 17 check
`permissionKeys`. The doc's own "Verification debt" section understates this as "Not every admin route opts into
access context yet — grep when touching routes" (`:47`); the actual state is that opting into access context does
not, by itself, consult a single permission.

The same doc claims the membership layer is `user_roles` → `role_definitions.role_key` (`:20`). **There is no such
foreign key** — `user_roles` carries only `org_id` and `user_id` FKs (`remote_schema.sql:6617-6623`);
`user_roles.role` is unconstrained text. The constraint exists only in application code, on one write path
(`web/app/api/admin/users/[userId]/role/route.ts:27-30`).

Its "Expanded reference" pointer `../../system/roles-and-permissions.md` (`:53`) resolves to
`docs/system/roles-and-permissions.md`, **which does not exist** (`docs/system/` has 30 files; none is this one).

### C3 — Three permission catalog tables, dual FKs on one column

`role_permission_grants.permission_key` carries **two** foreign keys on the same column
(`remote_schema.sql:6502-6508`):

```sql
role_permission_grants_permission_key_fkey  → permission_keys(key)  ON DELETE RESTRICT
role_permission_grants_permissions_fkey     → permissions(key)      ON DELETE CASCADE
```

A third table, `permission_definitions`, is what the write API validates against
(`web/app/api/admin/rbac/grants/route.ts:60-68`). So every new permission must be inserted into three tables or
grants fail; the migrations do exactly that, and say so —
`supabase/migrations/20260505120100_settings_users_roles_permission.sql:4-7`,
`20260505164000_permission_grid_keys.sql:4-5` ("dual FKs on the same column in this schema"). This is a known,
manually-maintained duplication with two different `ON DELETE` semantics on the same referencing column.

### C4 — Three vocabularies of permission keys, mostly disjoint

| Vocabulary | Source | Enforced? |
|---|---|---|
| `admin.users.*`, `ops.customers.*`, `ops.jobs.*`, `fin.*` (22 keys) | `seed_default_rbac()`, `remote_schema.sql:711-737` — granted **in full to `admin`**, and to `ops` minus two keys (`:748-760`) | Only `ops.messaging.write`, as a back-compat alias (`communicationPermissions.ts:35`) |
| `crm.*`, `scheduling.*`, `billing.*`, `documents.*`, `reports.*`, `settings.*`, `workflows.*` (20 keys) | `PERMISSION_GRID_ROWS`, `web/lib/admin/permissionGrid.ts:12-24`, seeded by `20260505164000_permission_grid_keys.sql` | 4 of 20 |
| `config_assist.*`, `fields.manage`, `sections.manage`, `layouts.manage`, `option_sets.manage`, `ai.enrichment.use`, `operational_expectations.author/ratify` | per-feature migrations | **All** |

The operator-facing grid and the enforcement layer barely overlap: of the grid's 20 keys, 4 are enforced
(`communications.send`, `settings.read`, `settings.manage`, `settings.users_roles`); of the ~17 enforced keys, 13
have no row in the grid at all. **An operator cannot grant, from the UI, most of what the platform actually
enforces — and most of what the UI offers changes nothing.**

### C5 — The grid offers a permission that cannot be saved

`permissionGrid.ts:23` renders a "Workflows / Automation" row over `workflows.read` / `workflows.write`. Those
keys are seeded into **no** catalog table — `rg "'workflows\.(read|write)'" supabase/migrations` returns nothing;
they appear in `web/` only inside comments in the operational-expectations modules. `PUT /api/admin/rbac/grants`
validates the submitted set against `permission_definitions` and rejects unknown keys with HTTP 400
(`web/app/api/admin/rbac/grants/route.ts:60-68`).

Because that PUT **deletes all grants for the role before inserting** (`:70-91`), the 400 fires on validation
first, so no data is lost — but the row is inoperable by construction. Directly reproducible in the UI.

### C6 — Two platform-seeded roles cannot log in

Every org is seeded with four `is_system` roles — `admin`, `ops`, `regional_lead`, `school_director`
(`supabase/migrations/20260505120100_settings_users_roles_permission.sql:59-65`, repeated in
`20260505153000_backfill_default_role_definitions.sql:12-18`). `PORTAL_ROLES` is `{admin, ops}`
(`resolveAdminAccessCore.ts:18`).

A user whose only role is `regional_lead` or `school_director` is not `portalEligible`, so the AdminV2 layout
redirects them to `/unauthorized` (`web/app/adminV2/layout.tsx:23-30`) and the admin API returns 403 — regardless
of grants. The platform ships two named personas it cannot admit. The one escape hatch is
`requirePortalOrUsersRolesManageAuth` (`web/lib/admin/canManageUsersAndRoles.ts:46-62`), which admits a
non-portal role holding `settings.users_roles` — i.e. the *only* thing a custom role can be given access to is
the screen for managing roles.

### C7 — Multi-role is modelled everywhere and writable nowhere

The composite PK exists specifically to allow "ops + regional_lead"
(`20260505120000_user_roles_composite_primary_key.sql:4`); `resolveAdminAccessCore` computes `roleKeys[]` as a set
(`:34-37`). But the only role-assignment API deletes every row for `(user, org)` and inserts exactly one
(`web/app/api/admin/users/[userId]/role/route.ts:38-41`), and says so in its own docstring: "Multi-role personas
(e.g. ops + regional_lead) must be re-added via seed or a future additive API" (`:6-7`). The multi-role model is
unreachable through the product.

### C8 — Department scope is bypassed by exactly the roles that can log in

`portalAdminBypassesDepartmentScope` forces `departmentScope = "all"` for any `admin`/`ops`
(`web/lib/admin/accessScope.ts:45,51-66`). Combined with C6 — only `admin`/`ops` reach the portal — **every user
who can use the product bypasses department scope.** Site scope is not bypassed and remains effective.

### C9 — Three different SQL definitions of "is this user privileged"

| Function | Reads | Line |
|---|---|---|
| `has_org_role(org, roles[])` | `user_roles` | `20260718140000_has_org_role_security_definer.sql:11-17` |
| `is_admin()` | `app_users.role` | `remote_schema.sql:439-448` |
| RLS policies on 3 tables | `user_profiles.role = 'admin'::app_role` | `remote_schema.sql:6795,6801,6807` |

Three sources of truth for the same question, live simultaneously in RLS.

---

## 4. Gaps

### G1 — `handle_new_user()` defaults every new auth user to `ops`, and its trigger is unversioned

```sql
insert into public.user_profiles (id, role) values (new.id, 'ops');   -- remote_schema.sql:409-417
```

`user_profiles.role` is `app_role NOT NULL DEFAULT 'ops'` (`remote_schema.sql:2906`), and `user_profiles.role` is
the first thing the legacy fallback consults (`resolveAdminAccessCore.ts:44-52`). The fallback only fires when
`user_roles` is empty for that user, and additionally requires an `app_users` row carrying an `org_id`
(`:50-51`) — so this is a **latent** escalation path, not a demonstrated one.

What makes it a gap rather than a note: **no `CREATE TRIGGER` on `auth.users` exists anywhere in
`supabase/migrations/` or `supabase/baselines/`.** The function is defined and granted to `anon`, `authenticated`
and `service_role` (`:8928-8930`), but whether it is attached is not visible in version control. Live-DB
verification required.

### G2 — `getAdminAccessContextCached` returns `ok: true` without checking `portalEligible`

`getAdminAccessContextCached` (`getAdminAccessContext.ts:102-116`) destructures `portalEligible` away and
succeeds for any authenticated user with a resolvable org membership — including `regional_lead` and
`school_director`. `docs/platform/governance/api-contracts.md:18-19` documents the intended pattern as two steps
("1. Auth + `getAdminContextCached` (org + portal eligibility); 2. CRM routes add
`getAdminAccessContextCached`"), so step 2 alone is not a gate.

88 route files import it. I sampled three of the most sensitive — `admin/persons`, `admin/customers`,
`admin/global-search` — and **all three correctly pair it with a portal gate** (`persons/route.ts:3,10`;
`customers/route.ts:3`; `global-search/route.ts:12,23`). The full set-difference was not computed (see §7.2).
This is a latent hazard with a proven-safe sample, not a confirmed defect.

### G3 — Non-admin Users & Roles managers can grant themselves `admin`

`canManageUsersAndRoles` admits anyone holding `settings.users_roles`
(`web/lib/admin/canManageUsersAndRoles.ts:15-18`). `PATCH /api/admin/users/[userId]/role` gates on exactly that
(`route.ts:10`) and applies no ceiling — no check that the assigned role is ≤ the caller's own, and no
self-assignment guard. A `settings.users_roles` holder can set any user's role, including their own, to `admin`.
Whether this is intended delegation or an escalation is a **product decision**, not a code question.

### G4 — Missing access profile silently means unrestricted

`resolveAdminAccessCore.ts:152-161`: absent `user_access_profiles` row ⇒ both scopes `all`. The backfill covers
memberships existing at migration time (`20260504103000_user_access_scope_tables_v1.sql:272-275`); nothing
guarantees a profile for memberships created afterward, and `POST /api/admin/users` was not audited for whether it
creates one. Fail-open by default.

### G5 — `permissions` and `permission_keys` accumulate rows that nothing grants and nothing checks

`seed_default_rbac()` grants `admin` **every active row in `permission_keys`** (`remote_schema.sql:748-752`) and
`ops` all but two (`:755-760`). Since the same table now also holds the grid vocabulary and every feature
vocabulary, this is an unbounded blanket grant whose content changes each time any migration seeds a key.

### G6 — RLS is not a backstop for the API

517 of 539 route files hold a service-role client, documented as bypassing RLS
(`web/lib/supabaseAdmin.ts`). Middleware returns before gating anything under `/api/*`
(`web/middleware.ts:106-108`; `requiresOperatorSession` covers only operator page paths,
`web/lib/admin/operatorSessionGate.ts:16-22`). For ~96% of the privileged surface, the check inside the
handler's own module graph is the only authority that exists. RLS policy *content* was not evaluated here.

---

## 5. Enforced vs configured

| Authority concept | Configured | Enforced |
|---|---|---|
| Authenticated session | yes | **yes** — pages (middleware + AdminV2 layout) and all admin API |
| Org membership / tenant isolation | yes | **yes** — every gate carries `orgId` |
| Portal eligibility (`admin`/`ops`) | yes | **yes** — the primary and near-only API gate |
| `admin` vs `ops` | yes | partial — `requireAdmin` only |
| Custom / non-portal roles (`regional_lead`, `school_director`) | yes, seeded per org | **no** — cannot reach the portal (C6) |
| Multi-role membership | yes (schema + resolver) | **no write path** (C7) |
| Permission grants — 8 feature modules | yes | **yes** (C1 table) |
| Permission grants — grid's core domains | yes (grid + 3 catalogs + DB) | **no** — 16 of 20 grid keys (C4) |
| `workflows.read` / `workflows.write` | UI only | **not even seeded** (C5) |
| Department scope | yes | **no** for `admin`/`ops` (C8) — i.e. for everyone who can log in |
| Site scope | yes | **yes** — real query-layer enforcement |
| person → user identity | **no** | n/a — the relation does not exist (§1) |

---

## 6. Relation to the prior inventory

`docs/platform/planning/access-identity-v2/inventory.md` (mission `msn_7782d3e37dfeebd871`,
contentHash `071e9f20…`) covers the same phase from the route-census angle.

**Confirmed:** no server actions; middleware does not gate `/api/*`; 539 routes; 517 service-role; authority
collapses to `portalEligible`; custom roles cannot reach the portal; department-scope bypass; `logAdminAudit`
records rather than decides.

**Corrected:**
1. Its §8 deferred the tier census to an unrun script. Run, the script reports 507 permission-gated routes —
   which would contradict its own F1/F3. The census is a false positive (C1); the true figure is 17 routes via
   8 modules.
2. Its F4 attributes the field/section/layout keys to the wrong module (C1, closing note).

**Added by this phase:** the person→user absence (§1), the three-vocabulary split (C4), the three-catalog dual-FK
schema (C3), the unsavable Workflows grid row (C5), the two seeded-but-unadmittable system roles (C6), the
multi-role write gap (C7), the three SQL privilege functions (C9), the `handle_new_user` default and its
unversioned trigger (G1), and the role-assignment ceiling question (G3).

---

## 7. Limits

1. **Static, not dynamic.** Reachability is proven by imports and reads, not execution. No request was issued;
   nothing was verified in a browser; no live database was queried.
2. **G2's set-difference was not computed.** The shell forms needed to diff the two route lists
   (`cd &&`, `sed`, `tee`, redirection to `/tmp`) were each declined by the session's command policy. The exact
   command is in §8; three sensitive routes were sampled by hand instead, all safe.
3. **G1 requires live verification.** Absence of a `CREATE TRIGGER` in version control is not proof of absence in
   the deployed database. `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;`
4. **Token and webhook strength unaudited.** The 28 tier-0 routes are classified by family; whether each
   capability token is unguessable, expiring, single-use or scope-bound was not assessed, nor was webhook
   signature verification.
5. **RLS policy content unread.** Counted and scoped to the 6-file browser-client surface; individual `USING`
   clauses not evaluated (except the three `user_profiles.role` policies in C9).
6. **`POST /api/admin/users` not audited** for whether it creates a `user_access_profiles` row (G4).
7. **Read-only.** No source file was modified by this phase.

---

## 8. Reproduce

```bash
# Transitive per-route tier census (the C1 numbers)
npm run --prefix web audit:authority-paths
npm run --prefix web audit:authority-paths -- --json

# Ground-truth permission enforcement (C1) — 11 files, 8 of which branch
rg -l 'permissionKeys' web/lib
rg -n 'permissionKeys[^A-Za-z]*(\.includes|\.some|\.has)' web

# person → user: no link (§1)
rg -n -A22 'CREATE TABLE IF NOT EXISTS "public"."persons"' supabase/migrations/20260329165048_remote_schema.sql

# C3 — dual FKs on one column
rg -n 'role_permission_grants_permission(s)?(_key)?_fkey' supabase/migrations

# C5 — grid offers keys seeded nowhere
rg "'workflows\.(read|write)'" supabase/migrations        # → no matches
rg -n 'workflows' web/lib/admin/permissionGrid.ts          # → :23

# C6 — four seeded system roles vs two portal roles
rg -n 'regional_lead|school_director' supabase/migrations
rg -n 'PORTAL_ROLES' web/lib/admin/resolveAdminAccessCore.ts

# G1 — function defined, trigger not in version control
rg -n 'handle_new_user' supabase/
rg -n 'CREATE TRIGGER.*auth' supabase/                     # → no matches

# G2 — routes with access context but no portal gate (NOT RUN, see §7.2)
comm -23 \
  <(rg -l 'getAdminAccessContext' -g route.ts web/app/api | sort) \
  <(rg -l 'getAdminContextCached|getAdminAuth|requireAdminOrOps|requireAdmin\b|loadAdminRouteGate|UsersRolesManageAuth|resolveOperatorRoute' -g route.ts web/app/api | sort)
```

---

## 9. Handoff to the model phase

Three questions the canonical authority model has to answer, in dependency order:

1. **Is a person ever a user?** Access & Identity V2 cannot specify "person → user → role → scope" until the
   platform decides whether `persons` gains a principal link (family portal, staff self-service) or whether
   principals stay a separate population and `persons` remains purely a subject. Everything downstream depends
   on this. It is a product decision, not an engineering one.

2. **What admits someone to the portal?** The enforcement vocabulary is `{admin, ops}`; the configuration
   vocabulary is `role_definitions × permission_keys`. C6 and C7 are one defect from two ends. Either
   `portalEligible` derives from a granted permission, or a portal-access permission is introduced that custom
   roles can hold. The Config Layout Assist and Operational Expectations families already demonstrate the
   working shape at feature scale.

3. **One permission vocabulary, or none?** C3, C4 and C5 are the same failure: three catalog tables, three key
   vocabularies, and a UI grid that is neither the enforced set nor a subset of it. The cheapest coherent move is
   to make `PERMISSION_GRID_ROWS` a *projection of what is enforced* rather than an independent list — which
   would make C5 impossible by construction and turn C4 into a visible, shrinking gap instead of an invisible one.

C1 is a methodological warning for whatever this phase hands forward: **in this codebase, reachability of a
permission set is not enforcement of it.** Any future audit that greps or walks imports for `permissionKeys`
will over-report by roughly 30×.
