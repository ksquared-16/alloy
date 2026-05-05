# Supabase schema alignment audit (2026)

**Status:** Living audit — CSV reference under `docs/supabase/reference/` plus **live RLS verification** (predicate review in Supabase).  
**Rules:** This document does not apply SQL by itself; referenced migrations live under **`supabase/migrations/`** and require normal review/apply. No destructive schema changes (drops, column removals) proposed here.

## Scope

- **Docs:** `docs/system/*`, `docs/product/*`, `docs/execution/*`
- **Schema exports:** `docs/supabase/reference/*.csv`
- **RLS:** Verified live (policy roles + `USING` / `WITH CHECK` predicates), not inferred from CSV alone

---

## Revised risk summary (after live RLS verification)

### Critical (must address before treating DB exposure as “done”)

**None newly classified as critical** after live verification for Communications V1 and clarified `workflows` / deny-by-default tables. Residual exposure is concentrated in **legacy messaging** and **workflow event write semantics** (see High).

_Use judgment:_ if admin/ops JWT clients ever gain broad workflow-event write ability without org-safe predicates, escalate to Critical after threat modeling.

### High

1. **Legacy `messages` (SMS / workflow parallel)**  
   - Policy uses **`ALL` for `{public}`**, but the **predicate limits to `app_users` admin/ops** (not a literal world-open policy).  
   - **No `org_id` column** — tenant isolation depends on **that role gate** plus **relationship chains** (`customer_id`, `contact_id`, `job_id`, `opportunity_id`, etc.).  
   - **Treat as legacy compatibility risk:** any bug in chain resolution or future policy loosening increases cross-tenant exposure. **Schema unchanged** — retirement path documented in **`docs/product/communications.md`** (**`communication_*`** canonical; **`messages` / `messages_outbox`** compatibility until backfill/cutover).

2. **`workflow_events` policy composition** *(migration proposed)*  
   - **Previously:** **`workflow_events_modify`** granted **admin/ops authenticated `ALL`**; **`workflow_events_no_client_write`** (`false`) did nothing under **PERMISSIVE** OR.  
   - **Code audit (2026-05):** Inserts are only via **`createAdminClient`** (`web/lib/emitEvent.ts`) and Python PostgREST + **service role**; admin routes **SELECT** only; **no** browser/authenticated direct writes found.  
   - **Change:** Migration **`20260505180000_workflow_events_authenticated_select_only.sql`** drops **`workflow_events_modify`** and **`workflow_events_no_client_write`**; keeps **`workflow_events_select`** / **`workflow_events_select_org`**. **Authenticated JWT** can **SELECT** org-scoped rows only; **mutations** rely on **service_role** (RLS bypass). **Review before apply** if any external integration used an authenticated key to mutate this table.

### Medium

1. **`workflows` row access**  
   - Policy role is **`{public}`**, but the **predicate checks `user_profiles.role = admin`** — **not** public-open in practice.  
   - Uses **older `user_profiles.role`** rather than **`user_roles` / `role_permission_grants`**.  
   - **Recommendation:** Future alignment to RBAC / permission grants — **not** an immediate migration.

2. **`SECURITY DEFINER` hardening** *(migration proposed)*  
   - Migration **`20260505180100_security_definer_search_path_public_pg_temp.sql`** runs **`ALTER FUNCTION … SET search_path TO public, pg_temp`** on **`is_org_member`**, **`post_ledger_transaction`**, **`seed_default_rbac`** — **no** body rewrite; mitigates search-path hijacking for these DEFINER entrypoints.

3. **Deny-by-default tables (`customer_payment_methods`, `orgs`, `customer_vertical_job_counters`)**  
   - **RLS enabled, zero policies** ⇒ **deny-by-default** for roles subject to RLS (service role bypasses as configured).  
   - **`customer_payment_methods`:** Documented as **service-role / server-only** until customer portal / saved payment UX exists; see **`docs/product/billing-and-financials.md`**. **Do not add browser policies without design approval.**

### Lower / cleared (acceptable for current posture)

1. **Communications V1 canonical tables** — **mostly aligned** with docs (`docs/product/communications.md`):  
   - **`communication_threads`**, **`communication_messages`**, **`communication_provider_bindings`**, **`communication_message_reads`**  
   - **Org-member `SELECT`** via **`user_roles`**; **writes** via **`auth.role() = 'service_role'`** only.  
   - **Treat as acceptable for V1.**

2. **`messages_outbox`** — **safer pattern:** org-member **`SELECT`** via **`user_roles`**; **`INSERT` / `UPDATE` / `DELETE`** service-role-only; **FORCE RLS** enabled.

---

## Safe non-breaking fixes only (now)

Docs-only items are reflected in **`docs/product/communications.md`**, **`docs/product/billing-and-financials.md`**, and this audit.

**Optional migrations (reviewed separately):**

- **`workflow_events`** authenticated **SELECT-only** — see migration **`20260505180000_workflow_events_authenticated_select_only.sql`**.  
- **`SECURITY DEFINER` `search_path`** — see **`20260505180100_security_definer_search_path_public_pg_temp.sql`**.

**Engineering hygiene** — When touching workflow or messaging code, **re-verify** org predicates on server paths; prefer **service role** for writes that should not be expressible from the browser.

**Still documentation-only (no migration from this sprint):**

- **`workflows`** policy’s reliance on **`user_profiles.role`** vs modern RBAC — future alignment.

---

## Design decisions

| Topic | Status |
|-------|--------|
| **`workflow_events` writes** | **Proposed:** migration removes authenticated admin/ops **`ALL`**; app already uses **service_role** for inserts. **Confirm** no external authenticated Supabase clients relied on direct writes. |
| **Legacy `messages`** | **Documented:** **`communication_*`** canonical V1; **`messages` / `messages_outbox`** compatibility; retirement needs **backfill/migration plan** — see **`docs/product/communications.md`**. |
| **`customer_payment_methods`** | **Documented server-only** until portal/payment UX; then design **least-privilege** policies — see **`docs/product/billing-and-financials.md`**. |
| **`workflows` RLS** | **Open:** migrate predicate from **`user_profiles.role`** to **`user_roles` + `role_permission_grants`** (or equivalent). |
| **`SECURITY DEFINER` search_path** | **Proposed:** **`ALTER FUNCTION … SET search_path TO public, pg_temp`** for the three functions above (migration **`20260505180100_…`**). |

### Post-migration verification (SQL)

Run as a privileged reader or in CI against a staging DB **after** migrations:

```sql
-- workflow_events: authenticated should have no INSERT/UPDATE/DELETE policies
SELECT policyname, cmd, roles::text, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workflow_events'
ORDER BY policyname;

-- Expect service_role mutations still succeed from app (integration test / manual insert via service key).

-- DEFINER functions: search_path pinned
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_org_member', 'post_ledger_transaction', 'seed_default_rbac');
```

Expect **`proconfig`** to include `{search_path=public,pg_temp}` (or equivalent) for each row.

---

## References

- Identity / entities: `docs/system/entity-model.md`
- Access: `docs/system/roles-and-permissions.md`
- Workflows / events: `docs/system/actions-and-workflows.md`
- Communications: `docs/product/communications.md`
- Billing surface (doc vs schema depth): `docs/product/billing-and-financials.md`
- Schema exports: `docs/supabase/reference/*.csv`

---

## Change log

- **2026-05:** Initial audit from CSV + doc review; revised after **live RLS verification** (communications V1 acceptable; legacy `messages` and `workflow_events` composition documented; `messages_outbox` and deny-by-default tables clarified).
- **2026-05-05:** Hardening sprint — **`workflow_events`** code audit + proposed RLS migration; legacy messaging retirement notes in product comms doc; **`customer_payment_methods`** billing doc posture; **`SECURITY DEFINER` search_path** migration via **`ALTER FUNCTION`** only.
