# Workflow / RBAC alignment audit (2026)

**Purpose:** Map **workflow-related RLS and APIs** to **`user_profiles.role`** vs **`user_roles` / `role_permission_grants`**. **No migrations** in this sprint — documentation for a future alignment pass.

**Sources:** `docs/supabase/reference/supabase_rls_policies.csv`, `prod_baseline.sql` predicates, greps under `web/` and `backend/`.

---

## Summary

| Surface | Auth model in RLS today | Notes |
|--------|-------------------------|--------|
| **`workflows`** | **`user_profiles.role = admin`** only (`admin_full_access_workflows`) | **Ops** and **custom roles** with workflow permissions are **not** represented; **`public` role** in policy means “subject to predicate,” not open access. |
| **`workflow_actions`** | Same **`user_profiles.role = admin`** (`admin_full_access_workflow_actions`) | Align with **`workflows`** when migrating. |
| **`workflow_conditions`** | Same **`user_profiles.role = admin`** (`admin_full_access_workflow_conditions`) | Align with **`workflows`** when migrating. |
| **`workflow_runs`** | **`user_roles`** admin/ops org match (`workflow_runs_modify`, `workflow_runs_select`) | **Already** membership-based; inconsistent with **`workflows`** trio above. |
| **`workflow_events`** | **`user_roles`** / **`is_org_member`** SELECT-only (after hardening); writes via **service_role** | Documented in **`docs/audits/supabase-schema-alignment-audit.md`**. |

**API reality:** Admin workflow routes use **`createAdminClient()`** (service role), so **RLS on `workflows*` does not gate server routes today**. Alignment still matters for **any future authenticated Supabase client** access, consistency with **roles-and-permissions V1**, and **least-privilege** expectations.

---

## Exact policies (baseline reference)

From **`prod_baseline.sql`** (predicates abbreviated):

- **`admin_full_access_workflows`** — `EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin')`
- **`admin_full_access_workflow_actions`** — same predicate
- **`admin_full_access_workflow_conditions`** — same predicate

---

## Application code — workflow APIs (server)

These paths mutate or read **`workflows`** and related tables via **admin/service client** (RLS bypass). When RLS is tightened later, keep **`assertRowOrg`** / **`getAdminContextCached`** behavior as the semantic gate:

| Area | Files |
|------|--------|
| Workflow CRUD | `web/app/api/admin/workflows/route.ts`, `web/app/api/admin/workflows/[id]/route.ts` |
| Actions / conditions | `web/app/api/admin/workflows/[id]/actions/route.ts`, `web/app/api/admin/workflows/[id]/conditions/route.ts` |
| Manual run | `web/app/api/admin/workflows/[id]/run/route.ts` |
| Summaries / catalog | `web/app/api/admin/workflows/summary/route.ts`, `web/app/api/admin/workflows/field-catalog/route.ts`, `web/app/api/admin/workflows/debug-vendor-enrichment/route.ts` |
| Reads embedded in other routes | `web/app/api/book-v2/confirm/route.ts`, `web/app/api/book-v2/quote-start/route.ts`, `web/app/api/admin/jobs/[id]/route.ts`, `web/app/api/admin/schedules/**`, `web/app/api/action/[token]/consume/route.ts`, `web/app/api/action-links/**`, etc. |

---

## Legacy / hybrid identity reads

| Location | Behavior |
|----------|----------|
| `web/lib/admin/resolveAdminAccessCore.ts` | **`fetchLegacyAdminOpsOrgAndRole`** reads **`user_profiles.role`** (and **`app_users`**) for portal eligibility fallback paths alongside **`user_roles`**. |

This is **orthogonal** to **`workflows` RLS** but couples product semantics to **`user_profiles`**; any RBAC migration should define whether **`user_profiles`** remains a bootstrap-only signal or is deprecated for portal access.

---

## Documentation drift

| Doc | Issue |
|-----|--------|
| `web/README_ADMIN_AUTH.md` | Still describes admin portal as **`user_profiles.role`**-only; codebase now uses **`user_roles`** + **`resolveAdminAccessCore`** — README should be refreshed in a **docs-only** follow-up. |

---

## Future change checklist (no implementation here)

1. **RLS migration** — Replace **`user_profiles.role = admin`** on **`workflows`**, **`workflow_actions`**, **`workflow_conditions`** with a predicate that matches **Admin V2** intent, e.g. org-scoped membership plus **`ops.workflows.read` / `ops.workflows.write`** (or a single “manage workflows” permission) from **`role_permission_grants`**. Decide whether **ops** may PATCH workflow definitions in RLS (today API allows ops where routes use shared admin/ops gates — confirm product).  
2. **Policy role** — Consider `TO authenticated` instead of `{public}` for clarity (optional; behavior depends on Supabase role mapping).  
3. **Align `web/README_ADMIN_AUTH.md`** with **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`**.  
4. **Regression tests** — After RLS change, add tests that an **authenticated** user **without** grants cannot mutate workflow rows via PostgREST (if that access path is ever supported).

---

## Related

- **`docs/audits/supabase-schema-alignment-audit.md`** — `workflows` / `user_profiles` called out in risk table.  
- **`docs/archive/2026-06-superseded-system/roles-and-permissions.md`** — capability model.  
- **`docs/archive/2026-06-superseded-system/actions-and-workflows.md`** — event and workflow behavior.
