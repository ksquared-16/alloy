# Supabase schema alignment audit (2026)

**Status:** Living audit — CSV reference under `docs/supabase/reference/` plus **live RLS verification** (predicate review in Supabase).  
**Rules:** No migrations from this document alone; no destructive changes proposed here.

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
   - **Treat as legacy compatibility risk:** any bug in chain resolution or future policy loosening increases cross-tenant exposure. **Do not change yet** — document and monitor.

2. **`workflow_events` policy composition**  
   - **`workflow_events_modify`** allows **admin/ops authenticated users `ALL`**.  
   - **`workflow_events_no_client_write`** uses **`false`** (deny), but policies are **PERMISSIVE**, so it **does not block** the modify policy.  
   - **Recommendation:** Decide whether **`workflow_events` should be server-write-only** (service role / restricted server paths only). **Do not change yet** — requires product + API contract agreement.

### Medium

1. **`workflows` row access**  
   - Policy role is **`{public}`**, but the **predicate checks `user_profiles.role = admin`** — **not** public-open in practice.  
   - Uses **older `user_profiles.role`** rather than **`user_roles` / `role_permission_grants`**.  
   - **Recommendation:** Future alignment to RBAC / permission grants — **not** an immediate migration.

2. **`SECURITY DEFINER` hardening**  
   - Most elevated functions **`SET search_path`** safely.  
   - **`is_org_member`**, **`post_ledger_transaction`**, and **`seed_default_rbac`** do **not** explicitly **`SET search_path`** in verified definitions.  
   - **Recommendation:** Planned hardening migration to add **`SET search_path`** (and verify dependencies) — **after** dependency review; **not** immediate.

3. **Deny-by-default tables (`customer_payment_methods`, `orgs`, `customer_vertical_job_counters`)**  
   - **RLS enabled, zero policies** ⇒ **deny-by-default** for roles subject to RLS (service role bypasses as configured).  
   - **`customer_payment_methods`:** Treat as **intentional service-role-only** unless product explicitly requires browser reads/writes.  
   - **Do not add policies without design approval.**

### Lower / cleared (acceptable for current posture)

1. **Communications V1 canonical tables** — **mostly aligned** with docs (`docs/product/communications.md`):  
   - **`communication_threads`**, **`communication_messages`**, **`communication_provider_bindings`**, **`communication_message_reads`**  
   - **Org-member `SELECT`** via **`user_roles`**; **writes** via **`auth.role() = 'service_role'`** only.  
   - **Treat as acceptable for V1.**

2. **`messages_outbox`** — **safer pattern:** org-member **`SELECT`** via **`user_roles`**; **`INSERT` / `UPDATE` / `DELETE`** service-role-only; **FORCE RLS** enabled.

---

## Safe non-breaking fixes only (now)

These do **not** require schema migrations:

1. **Documentation** — Keep this audit and related product/system docs explicit about:  
   - Legacy **`messages`** risk model (no `org_id`, admin/ops predicate, chain-dependent isolation).  
   - **`workflow_events`** permissive-policy interaction and the **server-write-only** decision pending.  
   - **`workflows`** policy’s reliance on **`user_profiles.role`** vs modern RBAC.  
   - **`customer_payment_methods`** as **service-role-only by default** until product says otherwise.

2. **Engineering hygiene** — When touching workflow or messaging code, **re-verify** org predicates on server paths; prefer **service role** for writes that should not be expressible from the browser.

**No migrations** from this section until explicit approval.

---

## Design decisions (do not implement without approval)

| Topic | Question |
|-------|----------|
| **`workflow_events` writes** | Should inserts/updates be **server-only** (strip or narrow admin/ops `ALL`), keeping audit spine trustworthy? |
| **Legacy `messages`** | Long-term **retire path** vs indefinite dual pipeline with **`communication_*`**? |
| **`customer_payment_methods`** | Will any flow require **authenticated client** direct table access (Stripe elements, wallet UI)? If yes, design **least-privilege policies**; if no, **document service-role-only**. |
| **`workflows` RLS** | Migrate predicate from **`user_profiles.role`** to **`user_roles` + `role_permission_grants`** (or equivalent) for consistency with Admin V2 access model. |
| **`SECURITY DEFINER` search_path** | Batch hardening for **`is_org_member`**, **`post_ledger_transaction`**, **`seed_default_rbac`** after confirming no reliance on non-`public` resolution order. |

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
