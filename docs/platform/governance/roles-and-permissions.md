---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Roles and permissions

**Status:** Canonical (V1 as-built).

Capability (permission keys) vs visibility (department/site scope).

---

## Model

| Layer | Mechanism |
|-------|-----------|
| Org membership | `user_roles` → `role_definitions.role_key` |
| Capabilities | `role_permission_grants` unioned into `permissionKeys` |
| Portal shell | Fixed `admin` / `ops` gate for admin surfaces |
| CRM visibility | `user_access_profiles` + dept/site junction tables |

**Rule:** Role ≠ visibility. Check `permissionKeys` for capabilities; check access profile for data scope.

---

## Enforcement

- List routes: filter by org ∩ allowed departments/sites
- Mutations: re-assert scope on target row
- Missing profile: legacy default `all` scopes (transition)

---

## Key files

- `web/lib/admin/resolveAdminAccessCore.ts`
- `web/lib/admin/getAdminAccessContext.ts`
- `web/lib/admin/accessScope.ts`

---

## Verification debt

Not every admin route opts into access context yet — grep when touching routes.

---

## Expanded reference

`../../system/roles-and-permissions.md`

---

## When to update

New permission keys, scope dimensions, or enforcement patterns.
