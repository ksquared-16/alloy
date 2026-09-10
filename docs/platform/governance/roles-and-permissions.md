---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Roles and permissions

**Status:** Canonical (V1 as-built).

Capability (permission keys) vs visibility (department/site scope).

> This document distinguishes **the rule** from **what the code does today**. Where they differ, the
> gap is named with its workstream id rather than left for the reader to discover at a call site.
> A canonical document that states an unfollowed rule as an as-built fact is itself a defect
> (`M2-15`).

---

## Model — four layers

The canonical enumeration lives in code at `web/lib/admin/authorityLayers.ts` (W-62 / AD-25),
with a test that proves the mapping from physical store to conceptual layer is total in both
directions. The four layers are **Membership → Role → Capability → Scope**.

| Layer | Mechanism | As-built |
|-------|-----------|----------|
| **1. Membership / admission** | `user_roles` row existence — this user is admitted to this org | The row's existence is the membership fact; one physical store backs layers 1 and 2 |
| **2. Role** | `user_roles.role` → `role_definitions.role_key` | Portal shell requires `admin` or `ops` among the resolved role keys |
| **3. Capability** | `role_permission_grants` unioned into `permissionKeys` | Populated and correct. **Many admin routes never consult it** — see *Enforcement* |
| **4. Scope** | `user_access_profiles` + `user_department_access` / `user_site_access` | Resolved on every request; enforced only on routes that opt in. AD-25 is explicit that several physical scope tables do not make several conceptual layers |

Per-record contextual checks (for example document access decisions) exist on some routes.
AD-25 deliberately does **not** treat them as a fifth authority layer.

`W-13` shipped and resolved the admission question the opposite way from the open item this
document used to record: there is **no** `portal.access` key. The fifth-layer portal-eligible
grants were collapsed (`supabase/migrations/20260818170000_w13_collapse_portal_eligible_fifth_layer_grants.sql`)
and the gates converted to `settings.users_roles`.

**Rule:** Role ≠ visibility. Check `permissionKeys` for capabilities; check the access profile for
data scope.

**A membership is a set.** `user_roles` is keyed on `(user_id, org_id, role)`, so a principal may
hold several role keys in one org and `permissionKeys` is their **union**. Any surface that renders
"the user's role" as a single value is collapsing that set.

**Role keys have one normal form** — trim + lowercase, applied at the resolver boundary
(`normalizeRoleKey`, `W-42`). Do not raw-compare a role key.

---

## Enforcement

- List routes: filter by org ∩ allowed departments/sites
- Mutations: re-assert scope on the target row
- **Absent** access profile: legacy default `all` scopes — a transition default
  (`ABSENT_PROFILE_ENFORCEMENT`), lockout-class to change, waiting on `W-7` / migration `M1`
- **Failed** access-profile read: **denies** (`restricted`, empty allow-lists) — `W-43`. Absence and
  failure are deliberately different populations

### What is not true yet

The rule above says capabilities are checked. **Most admin surfaces gate on admission alone** and
never read `permissionKeys`. Per-route capability requirements are recorded in the `W-14`
declaration table, where each handler is `declared` (bound to source by three joins), `none`
(reasoned — public token-scoped routes, signed webhooks, stubs), or `pending` (the majority).
Converting `pending` handlers is `W-15`, and each conversion is a decision about who may act, not a
refactor.

**Grep when touching routes.** Do not infer from a neighbouring handler that a route is gated.

---

## Key files

- `web/lib/admin/resolveAdminAccessCore.ts` — the enforcing resolver, the normal form, the absent-profile mode
- `web/lib/admin/resolveAdminPortalOrgCore.ts` — the light path's separate resolver
- `web/lib/admin/getAdminAccessContext.ts` — the cached bundle
- `web/lib/admin/adminRouteGate.ts` — `loadAdminRouteGate`, preferred at route entry
- `web/lib/admin/accessScope.ts` — scope enforcement helpers

**There is more than one resolver** (three, plus a light path), and they can disagree about the same
principal (`M2-13`). `W-41` reduces them to one; it needs decision `AD-12`.

---

## Expanded reference

Implementation-level detail: **[`../../../web/README_ADMIN_AUTH.md`](../../../web/README_ADMIN_AUTH.md)**.

Superseded background, retained for history and **not canonical**:
`docs/archive/2026-06-superseded-system/roles-and-permissions.md`.

---

## When to update

New permission keys, scope dimensions, or enforcement patterns — and whenever an item under
*What is not true yet* becomes true.
