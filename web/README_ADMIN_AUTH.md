# Admin authentication setup

How **admin portal** auth works in `web/` today. Canonical product semantics: **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`** (capabilities vs visibility, permission keys, scope).

---

## Overview

- **Login:** `/login` — email/password via Supabase Auth.
- **Portal routes:** `/admin/*`, `/adminV2/*` (and `/admin/v2/*` rewrite) — middleware requires a session; layouts/API gates require a resolved **portal-eligible** identity (see below).
- **Unauthorized:** Missing session → `/login`; signed in but not portal-eligible → `/unauthorized` (layout) or **401/403** JSON from APIs.

---

## Runtime resolution (canonical)

Server code resolves **org**, **role keys**, **permission keys**, and **department/site scope** through:

| Layer | Role |
|-------|------|
| **`resolveAdminAccessCore`** (`web/lib/admin/resolveAdminAccessCore.ts`) | Single resolver: reads **`user_roles`**, **`role_permission_grants`**, **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`**; falls back to **legacy** paths when there is no usable **`user_roles`** membership row (see below). |
| **`loadAdminAccessBundleCached`** (`web/lib/admin/getAdminAccessContext.ts`) | Wraps **`resolveAdminAccessCore`** with the signed-in **`user_id`** (service-role Supabase client). Exposes **`portalEligible`**. |
| **`getAdminAccessContextCached`** | Same bundle **without** exposing **`portalEligible`** — use when enforcing **CRM/workspace scope** (`permissionKeys`, department/site dimensions). |
| **`getAdminAuthCached`** / **`getAdminContextCached`** | Built on **`loadAdminAccessBundleCached`**. Require **`portalEligible`** so only users who present as **admin portal** users pass. They derive a **single compatibility `role` string** (`admin` \| `ops`) via **`compatibilityPortalRole`** — **`admin` wins** if both keys appear in **`roleKeys`**. |

**Org selection:** If the user has **`user_roles`** rows, **`chooseOrgAndRoleKeysFromMembershipRows`** picks a primary org (prefers orgs where the user has **`admin`** or **`ops`** **`role_key`**; otherwise smallest **`org_id`** among memberships). **`roleKeys`** for that org are all **`role`** values on **`user_roles`** for `(user_id, org_id)`.

**Portal eligibility (`portalEligible`):** **`true`** when **`roleKeys`** includes **`admin`** or **`ops`** (after resolution). Users with **only** custom role keys and **no** legacy fallback do **not** get the admin shell.

**Capabilities:** **`permissionKeys`** = union of **`role_permission_grants.permission_key`** where **`allowed = true`** for the user’s **`role_key`**s in the resolved org. Prefer checking **`permissionKeys`** (or helpers) for feature gates; do not assume a single role label encodes all behavior.

**Visibility (CRM scope):** **`user_access_profiles`** (`department_scope`, `site_scope`). When **`restricted`**, allowed IDs come from **`user_department_access`** and **`user_site_access`** (sites reference **`locations`** with **`location_type = 'site'`**). **Missing profile** ⇒ both scopes behave as **`all`** (legacy transition). Enforcement is via **`getAdminAccessContextCached`** + **`web/lib/admin/accessScope.ts`** on routes that opt in — not every handler is scoped yet (**`docs/archive/2026-06-superseded-system/roles-and-permissions.md`**).

---

## Legacy fallback (still true at runtime)

If **`resolveAdminAccessCore`** finds **no** membership-based org/roles from **`user_roles`**, it calls **`fetchLegacyAdminOpsOrgAndRole`**:

1. **`user_profiles`** — if **`role`** is **`admin`** or **`ops`**, org comes from **`app_users`** (**`id`** or **`auth_user_id`** match).
2. Else **`app_users`** row with **`role`** **`admin`** \| **`ops`** and **`org_id`**.

These paths exist for **bootstrap / migration** periods. **Preferred:** ensure each portal user has **`user_roles`** (+ grants + optional access profile) so behavior matches RBAC V1.

---

## Compatibility `role` string vs RBAC

Layouts and **`adminAuth`** still expose one string **`role`** (**`admin`** or **`ops`**) for UI and some APIs:

- Derived only from **`compatibilityPortalRole(roleKeys)`** — not a substitute for **`permissionKeys`**.
- **`AdminAuthContext`** sets **`canMutate = (role === "admin")`** — ops sees read-only **UI** affordances; individual **API** routes may still allow ops via **`requireAdminOrOps`** or permission checks.

---

## API guards (patterns)

| Helper | Behavior |
|--------|----------|
| **`requireAdmin()`** | **401** if no portal session; **403** if compatibility **`role` ≠ `admin`** (ops blocked). Use for routes that should stay admin-only in the legacy sense. |
| **`requireAdminOrOps()`** | **401** if **`getAdminAuth`** fails (no session / not **`portalEligible`**). If authenticated and portal-eligible, allows **both** admin and ops — it does **not** return **403** based on role; naming reflects “portal user allowed,” not “verify ops.” Prefer **`getAdminAccessContextCached`** + permission checks for new routes. |
| **`getAdminContextCached`** | Org + compatibility **`role`** + **`userId`** for org-scoped admin APIs. |

Many routes also use **`permissionKeys`** or dedicated RBAC checks (e.g. settings/users-roles). See **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`** and route handlers.

---

## Database: what to provision for a new portal user

**Target state (RBAC V1):**

1. **Auth user** in Supabase Auth (`auth.users`).
2. **`user_roles`** — `(user_id, org_id, role)` where **`role`** is a **`role_definitions.role_key`** for that org (e.g. **`admin`**, **`ops`**, or custom keys if product allows portal entry for them — today portal still expects **`admin`** or **`ops`** in **`roleKeys`**).
3. **`role_permission_grants`** — seeded per org (e.g. **`seed_default_rbac`** in migrations) so **`permissionKeys`** are populated.
4. **`user_access_profiles`** (+ **`user_department_access`** / **`user_site_access`** when scope should be restricted).

**Legacy-only bootstrap (discouraged for new installs):** insert **`user_profiles`** (`id` = auth user id, **`role`** = `admin` \| `ops`) **and** ensure **`app_users`** supplies **`org_id`** as resolved by **`fetchLegacyAdminOpsOrgAndRole`**.

---

## Environment variables

### Required (typical)

- **`NEXT_PUBLIC_SUPABASE_URL`** — project URL.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — browser/auth.
- **`SUPABASE_SERVICE_ROLE_KEY`** — server-only resolver + admin data reads (**never** expose to client).

Server may also read **`SUPABASE_URL`** / **`SUPABASE_ANON_KEY`** if set.

### Not used for admin access

- **`ALLOWED_ADMIN_EMAILS`** — removed; access is membership/RBAC-based, not email allowlists.

---

## How it works (request flow)

1. **`web/middleware.ts`** — For `/admin*` / `/adminV2*`, requires a Supabase session; otherwise redirect to **`/login`**.
2. **`web/app/admin/layout.tsx`** — **`getAdminAuth()`**; if missing → **`/unauthorized`**. Loads org via **`getAdminOrgIdForUser`** (delegates to **`resolveAdminAccessCore`** + **`portalEligible`** — same org as context APIs when eligible).
3. **API routes** — Combine **`getAdminContextCached`**, **`getAdminAccessContextCached`**, **`requireAdmin`** / **`requireAdminOrOps`**, and permission checks as implemented per route.

---

## Files (entrypoints)

| File | Purpose |
|------|---------|
| `web/lib/admin/resolveAdminAccessCore.ts` | Org, **`roleKeys`**, **`permissionKeys`**, scope dimensions, **`portalEligible`**. |
| `web/lib/admin/getAdminAccessContext.ts` | Cached bundle + **`getAdminAccessContextCached`**. |
| `web/lib/admin/getAdminContext.ts` | **`getAdminContextCached`** (org + compatibility role). |
| `web/lib/adminAuth.ts` | **`getAdminAuthCached`**, **`requireAdmin`**, **`requireAdminOrOps`**. |
| `web/lib/admin/adminPortalRolePick.ts` | **`compatibilityPortalRole`**. |
| `web/lib/admin/entityLabelsServer.ts` | **`getAdminOrgIdForUser`** → **`resolveAdminAccessCore`**. |
| `web/contexts/AdminAuthContext.tsx` | Client **`role`** / **`canMutate`** (admin-only mutations in UI). |
| `web/middleware.ts` | Session gate. |

---

## Related docs

- **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`** — capabilities vs visibility, guardrails.
- **`docs/system/configuration-system.md`** — settings/users-roles APIs and access tables.
