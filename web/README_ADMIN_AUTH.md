# Admin authentication setup

How **admin portal** auth works in `web/` today. Canonical product semantics:
**`../docs/platform/governance/roles-and-permissions.md`**.

> **This document describes what the code does, not what it should do.** Where the model has a
> known defect, the defect is stated here rather than smoothed over — an authority model whose own
> description is aspirational is how an engineer "fixes" a path that was never the live one. Open
> items carry their workstream id.

---

## Overview

- **Login:** `/login` — email/password via Supabase Auth.
- **Operator surfaces (canonical):** `/workspace/*`, `/organization/*`, `/settings/*`.
- **Transitional / legacy, all redirected:** `/admin`, `/adminV2/*`, `/admin/v2/*`, `/legacy-admin/*`.
  `/admin` and `/adminV2` **redirect to `/organization`**; they are not the portal's own URLs.
- **Where the canonical URLs actually render:** `next.config.ts` **rewrites** them into
  `web/app/adminV2/**` — e.g. `/organization/access` → `/adminV2/settings/organization/access`.
  There is **no `web/app/admin/` directory**; the enforcing layout is `web/app/adminV2/layout.tsx`.
- **Session gate:** `web/middleware.ts` → `requiresOperatorSession` (`lib/admin/operatorSessionGate.ts`),
  which is `isOperatorAdminPath ∪ isCanonicalSettingsPath` — **not** a literal `/admin*` prefix test.
- **Unauthorized:** Missing session → `/login`; signed in but not portal-eligible → `/unauthorized` (layout) or **401/403** JSON from APIs.

---

## Runtime resolution — there is more than one resolver

**There is not a single resolver.** Three functions independently compute `orgId`, `roleKeys` and
`portalEligible`, each with its own `PORTAL_ROLES` membership test:

| # | Resolution path | File | What it reads |
|---|---|---|---|
| 1 | **`resolveAdminAccessCore`** | `lib/admin/resolveAdminAccessCore.ts` | the **enforcing** resolver — `user_roles`, `role_permission_grants`, `user_access_profiles`, `user_department_access`, `user_site_access`, plus the legacy fallback |
| 2 | **`resolveAdminAccessDimensionsForOrgMember`** | `lib/admin/resolveAdminAccessCore.ts` | the **operator preview** behind Settings → Users & Roles. Recomputes rather than projects (`C11`) |
| 3 | **`resolveAdminPortalOrgCore`** | `lib/admin/resolveAdminPortalOrgCore.ts` | the **light path** — org + role keys only, no grants and no scope. Carries its own copy of the legacy fallback (`M2-5`) |

`PORTAL_ROLES` (`{admin, ops}`) is defined **twice** — once in path 1's module and once in path 3's.

> **`M2-13`: two gates in one request can disagree about the same principal**, because they do not
> all consult the same resolver. `W-41` is the workstream that reduces these to one resolution
> function whose entry points **project** rather than **compute**; it needs decision `AD-12` and has
> not started. Until it does, *which* helper a route calls is a behavioural choice, not a style one.

### Entry points (what routes actually call)

| Entry point | Resolution path | Notes |
|---|---|---|
| **`loadAdminAccessBundleCached`** (`lib/admin/getAdminAccessContext.ts`) | 1 | wraps the enforcing resolver with the signed-in `user_id` (service-role client). Exposes **`portalEligible`**. |
| **`getAdminAccessContextCached`** (`lib/admin/getAdminAccessContext.ts`) | 1 | the same bundle **without** `portalEligible` — use when enforcing **CRM/workspace scope** (`permissionKeys`, department/site dimensions). |
| **`getAdminContextCached`** (`lib/admin/getAdminContext.ts`) | 1 | org + compatibility `role` + `userId`. Requires `portalEligible`. |
| **`getAdminAuthCached`** (`lib/adminAuth.ts`) | 1 | as above, for layouts. |
| **`loadAdminRouteGate`** (`lib/admin/adminRouteGate.ts`) | 1 | **preferred at route entry.** One bundle resolution per request, instead of separate `getAdminContextCached` + `getAdminAccessContextCached`. 403s a caller who is not portal-eligible. |
| **`getAdminOrgContextLightCached`** (`lib/admin/getAdminOrgContextLight.ts`) | **3** | count/summary routes. **Reads no grants and no scope** — a route gated only by this has resolved *admission*, never *capability* or *visibility*. |

---

## Org selection, role keys, and the normal form

**Org selection.** If the user has `user_roles` rows, `chooseOrgAndRoleKeysFromMembershipRows` picks
a primary org (prefers orgs where the user holds `admin` or `ops`; otherwise the smallest `org_id`
among memberships). `roleKeys` for that org are **all** `role` values on `user_roles` for
`(user_id, org_id)` — a membership is a **set**, not a single role.

**Normal form (`W-42`, `I-28`ᴬ).** `normalizeRoleKey` (`lib/admin/resolveAdminAccessCore.ts`) is the
one normalization — **trim + lowercase** — and it is applied **at the boundary**, before the
membership is classified, in all three resolution paths. It exists because the enforcing path once
built `roleKeys` raw while the preview built them trimmed: a row holding `"admin "` presented as a
working portal administrator in Settings → Users & Roles while every runtime gate returned 401/403.
An all-whitespace role key is **dropped**, not carried as an empty key.

**Portal eligibility (`portalEligible`).** `true` when the normalized `roleKeys` include `admin` or
`ops`. Users with only custom role keys and no legacy fallback do **not** get the admin shell.

> **`W-13` (open, needs a product decision):** portal admission is a **role literal test**, not a
> capability. It is not `portal.access` and cannot currently be granted to a custom role.

**Capabilities.** `permissionKeys` = union of `role_permission_grants.permission_key` where
`allowed = true` for the resolved org's `role_key`s. Prefer checking `permissionKeys` (or helpers)
for feature gates; do not assume a single role label encodes all behaviour.

> **Known gap (`W-15`):** most admin surfaces gate on **admission** alone and never consult
> `permissionKeys`. Route-level capability requirements are recorded in the declaration table
> (see *Route capability declarations* below); the conversion of the remaining handlers is not
> complete. Checking `permissionKeys` is the rule; it is not yet what most routes do.

---

## Visibility (CRM scope), and what absence means

`user_access_profiles` carries `department_scope` and `site_scope`. When `restricted`, allowed IDs
come from `user_department_access` and `user_site_access` (sites reference `locations` with
`location_type = 'site'`). Enforcement is via `getAdminAccessContextCached` +
`lib/admin/accessScope.ts` on routes that opt in — **not every handler is scoped**.

Three cases, and they are deliberately different:

| Case | Resolves to | Why |
|---|---|---|
| Profile row present | its `department_scope` / `site_scope` | — |
| **No profile row** | both scopes `all` | `ABSENT_PROFILE_ENFORCEMENT = "legacy-all"`, a transition default. Flipping it to `deny` is a **lockout-class** change and waits on migration `M1` (`W-7`). A shadow resolution runs the opposite mode and logs the divergence. |
| **A read that FAILS** | **`restricted` with explicitly empty allow-lists — i.e. deny** | `W-43` (`I-30`ᴬ). A transient fault is a different population from a missing row, which is why it can deny today while absence cannot. |

> The failure case is stated in terms of **failure, not absence**, because the two were once
> indistinguishable: `user_access_profiles` did not destructure its error at all, so a transient
> read fault resolved the **widest possible** way — both scopes `all`. Read failures are logged on
> their own channel, deliberately **not** through `logScopeDivergence`, whose every line is supposed
> to mean "a membership exists with no profile row".

---

## Legacy fallback (still true at runtime)

If a resolver finds **no** membership-based org/roles from `user_roles`, it calls
`fetchLegacyAdminOpsOrgAndRole`:

1. `user_profiles` — if `role` is `admin` or `ops`, org comes from `app_users` (`id` or `auth_user_id` match).
2. Else an `app_users` row with `role` `admin` | `ops` and an `org_id`.

These paths exist for **bootstrap / migration** periods. **Preferred:** ensure each portal user has
`user_roles` (+ grants + optional access profile) so behaviour matches RBAC V1.

> Path 3 (`resolveAdminPortalOrgCore`) carries a **duplicate** of this fallback. `W-41` owns the
> consolidation; a source-discovered scan holds the two copies together until then.

---

## Compatibility `role` string vs RBAC

Layouts and `adminAuth` still expose one string `role` (`admin` or `ops`) for UI and some APIs:

- Derived only from `compatibilityPortalRole(roleKeys)` — **not** a substitute for `permissionKeys`.
- **`"ops"` is the default, not a membership fact.** `compatibilityPortalRole` returns `admin` when
  the role keys contain `admin` and `ops` **otherwise** — so `role === "ops"` means *"portal-eligible
  and not admin"*, not *"holds the `ops` role key"*. Every caller reaches it only after a
  `portalEligible` check, which is what keeps the distinction from mattering today.
- `AdminAuthContext` sets `canMutate = (role === "admin")` — ops sees read-only **UI** affordances;
  individual **API** routes may still allow ops via `requireAdminOrOps` or permission checks.

---

## API guards (patterns)

| Helper | What it actually does |
|---|---|
| **`requireAdmin()`** | `getAdminAuth()` → **401** if no portal session; **403** if the compatibility `role` ≠ `admin`. The one guard here that genuinely branches on role. |
| **`requireAdminOrOps()`** | **Does not check a role, and does not call `getAdminAuth`.** It calls `getAdminOrgContextLightCached()` — **resolution path 3** — and returns **401** with no session, **403** when the principal is not portal-eligible. The name reflects *"portal user allowed"*, not *"verify ops"*. |
| **`requireAdminOrgContextLight()`** | the same path 3 resolution, returning the context instead of `null`. Supersedes `requireAdminOrOps` + `getAdminContextCached` for lightweight routes. |
| **`loadAdminRouteGate()`** | **preferred for new routes** — path 1, one resolution per request, with `permissionKeys` and scope dimensions available for the capability check the route should then make. |

> `requireAdmin` and `requireAdminOrOps` resolve through **different resolvers**. That is `M2-13`,
> and it is the reason this table describes each helper's resolution path rather than only its
> status codes.

---

## Route capability declarations

`W-14` gave every exported route handler a declared capability, recorded in the declaration table
(`docs/platform/planning/vacilando-os/qa/access-identity-v2/w14-declared-route-capability-table.json`).
An entry is one of:

- **`declared`** — the handler enforces the named capability. Bound to source by three joins: the
  exported handler's **own body** calls the named helper (method grain), the returned verdict is
  **tested**, and the helper's module names the capability on an executable line.
- **`none`** — reasoned: the route legitimately holds no capability (public token-scoped routes,
  webhooks with signature verification, build metadata, unconditional `405` stubs).
- **`pending`** — not yet converted. The majority.

**A declaration is a checked claim, not a comment.** Deleting the guard an entry names fails the
lock. Adding a handler without an entry fails the lock.

---

## Database: what to provision for a new portal user

**Target state (RBAC V1):**

1. **Auth user** in Supabase Auth (`auth.users`).
2. **`user_roles`** — `(user_id, org_id, role)` where `role` is a `role_definitions.role_key` for
   that org. Today the portal still requires `admin` or `ops` among `roleKeys` (`W-13`).
3. **`role_permission_grants`** — seeded per org (e.g. `seed_default_rbac` in migrations) so
   `permissionKeys` are populated.
4. **`user_access_profiles`** (+ `user_department_access` / `user_site_access` when scope should be
   restricted).

**Legacy-only bootstrap (discouraged for new installs):** insert `user_profiles` (`id` = auth user
id, `role` = `admin` | `ops`) **and** ensure `app_users` supplies `org_id` as resolved by
`fetchLegacyAdminOpsOrgAndRole`.

---

## Environment variables

### Required (typical)

- **`NEXT_PUBLIC_SUPABASE_URL`** — project URL.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — browser/auth.
- **`SUPABASE_SERVICE_ROLE_KEY`** — server-only resolver + admin data reads (**never** expose to client).

Server may also read `SUPABASE_URL` / `SUPABASE_ANON_KEY` if set.

### Not used for admin access

- **`ALLOWED_ADMIN_EMAILS`** — removed; access is membership/RBAC-based, not email allowlists.

---

## How it works (request flow)

1. **`web/middleware.ts`** — legacy and transitional paths are redirected to their canonical form
   first; then `requiresOperatorSession(pathname)` decides whether a Supabase session is required.
   No session on an operator surface → `/login`.
2. **`next.config.ts` rewrites** — the canonical URL is served from `web/app/adminV2/**`.
3. **`web/app/adminV2/layout.tsx`** — `getAdminAuth()`; no session → `/login`, resolved but not
   portal-eligible → `/unauthorized`.
4. **API routes** — `loadAdminRouteGate` (preferred), or the older combination of
   `getAdminContextCached`, `getAdminAccessContextCached`, `requireAdmin` / `requireAdminOrOps`,
   plus the route's capability check.

---

## Files (entrypoints)

| File | Purpose |
|------|---------|
| `web/lib/admin/resolveAdminAccessCore.ts` | Resolution paths 1 and 2; `normalizeRoleKey`; `ABSENT_PROFILE_ENFORCEMENT`. |
| `web/lib/admin/resolveAdminPortalOrgCore.ts` | Resolution path 3, and the duplicate legacy fallback. |
| `web/lib/admin/getAdminAccessContext.ts` | `loadAdminAccessBundleCached`, `getAdminAccessContextCached`. |
| `web/lib/admin/getAdminContext.ts` | `getAdminContextCached` (org + compatibility role). |
| `web/lib/admin/getAdminOrgContextLight.ts` | `getAdminOrgContextLightCached`, `requireAdminOrgContextLight`. |
| `web/lib/admin/adminRouteGate.ts` | `loadAdminRouteGate` — preferred route entry. |
| `web/lib/adminAuth.ts` | `getAdminAuthCached`, `requireAdmin`, `requireAdminOrOps`. |
| `web/lib/admin/adminPortalRolePick.ts` | `compatibilityPortalRole`. |
| `web/lib/admin/accessScope.ts` | Department/site scope enforcement helpers. |
| `web/lib/admin/entityLabelsServer.ts` | `getAdminOrgIdForUser` → `resolveAdminAccessCore`. |
| `web/lib/admin/operatorSessionGate.ts` | `requiresOperatorSession` — which paths need a session. |
| `web/lib/admin/canonicalAdminRoutes.ts` | Canonical / transitional / legacy route bases. |
| `web/app/adminV2/layout.tsx` | The enforcing layout for every canonical operator URL. |
| `web/contexts/AdminAuthContext.tsx` | Client `role` / `canMutate`. |
| `web/middleware.ts` | Session gate. |

---

## Open items named in this document

| Id | What is not true yet |
|---|---|
| `W-41` (`AD-12`) | Three resolvers, two `PORTAL_ROLES` sets, two copies of the legacy fallback. |
| `W-13` | Portal admission is a role literal, not a `portal.access` capability. |
| `W-15` | Most handlers gate on admission, not capability; declarations are mostly `pending`. |
| `W-7` (`M1`) | An absent access profile still resolves as `all`. |
| `W-17` | The role write **replaces** a membership's role set rather than adding to it. |

---

## Related docs

- **`../docs/platform/governance/roles-and-permissions.md`** — capabilities vs visibility, guardrails.
- **`../docs/system/configuration-system.md`** — settings/users-roles APIs and access tables.

*This file is locked by `web/tests/access/authorityModelDocumentationLock.test.ts` (`RL-41`): the
resolution paths and entry points it names are checked against the exports actually present, in both
directions, and every document it points at must exist.*
