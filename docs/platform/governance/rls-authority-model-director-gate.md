---
owner: platform
status: canonical
last_reviewed: 2026-09-16
supersedes: []
---

# RLS_AUTHORITY_MODEL_DIRECTOR_GATE

**Status:** OPEN — Director decision required. No implementation.
**Classification:** `RLS_LAYER_IS_ROLE_TITLE_GOVERNED`
**Found:** AI Residual Authority V1 (Access & Identity V2), 2026-09-16.
**Not AI-specific. Not caused by any Access & Identity slice.**

---

## Why this exists

Access & Identity V2 has spent fourteen slices converging operator mutations from role
titles onto capabilities, at the **route** layer. This packet records a measurement that
bounds what that work achieves, and asks for a decision before anyone acts on it.

It was found while auditing privileged execution for the Task Assist proposal routes. The
route now requires `ai.enrichment.use`. The table's own INSERT and UPDATE policies require
the `owner`, `admin` or `ops` **role title**. Those are two different authorities over one
piece of state, and nobody has decided which is supposed to win.

**The naive remediation — replace every role predicate with a capability predicate — is
exactly what this packet asks the Director NOT to assume.** See *Why this is not obviously
a bug*.

---

## What was measured

All figures from the certification database, 2026-09-16.

| Measure | Value |
|---|---|
| Public base tables | 301 |
| RLS enabled | 300 |
| RLS **disabled** | 1 — `payment_provider_disputes` (SELECT granted to `authenticated`) |
| Tables with write policies (INSERT/UPDATE/ALL) | 277 |
| …whose predicates name a **role title** | 101 |
| …whose predicates reference **permission/grant truth** | **1** — `role_permission_grants` itself |
| Distinct tables with any role-title-bearing policy | 142 |
| Tables with a `service_role` escape predicate | 66 |
| Tables with tenant-only predicates (org/uid, no role) | 41 |
| Tables where `authenticated` holds INSERT/UPDATE/DELETE | **257** |

### Who can actually reach PostgREST

| Measure | Value |
|---|---|
| Files calling `supabase.from(...)` under `app/` | 121 |
| …that are client components (`"use client"`) | **0** |
| Files importing the browser client (`@/lib/supabaseClient`) | 6 |
| …that call `.from()` or `.rpc()` | **0** — all six use `supabase.auth.*` only |

**Reading:** the product's data access is entirely server-side. The browser client exists to
authenticate and never queries data. But the anon key is public by design, users hold real
sessions, and `authenticated` carries write grants on 257 tables — so the path is
**reachable but unexercised**. This is a latent authority disagreement, not a live exploit,
and the difference matters for how urgently it is treated.

---

## The question actually being asked

**Does RLS enforce tenant isolation, business authorization, or both?**

The measurement suggests it was built mostly for **tenant isolation** (`org_id` / `auth.uid()`
predicates, present in some form nearly everywhere) with role titles added as a coarse
*"is this principal an operator at all"* check — which is closer to the portal-admission
concept Access & Identity V2 has been separating from authority all along.

If that reading is right, then RLS role predicates are not a competing authorization model
at all; they are admission plus tenancy, and the capability layer is correctly the only
authorization layer. The policies would then be **imprecise rather than wrong**, and the
remediation is much smaller than 101 tables.

If the reading is wrong — if RLS is meant to be a genuine second authorization layer — then
route and database can disagree, and the answer today is that the database is more
permissive than the route for any role-titled principal.

Neither reading can be settled from the code. That is why this is a gate.

---

## Why this is not obviously a bug

1. **Defence in depth is a legitimate design.** A coarse database check behind a precise
   route check is a common, deliberate pattern. It is only a defect if someone believes the
   database check is the authoritative one.
2. **Capability predicates in RLS are expensive.** Every policy would join
   `role_permission_grants` on every row operation. That is a performance decision, not only
   a correctness one.
3. **Capabilities are per-organization.** RLS predicates would have to resolve the
   capability for the row's `org_id`, not the caller's default — subtle, and easy to get
   wrong in a way that fails open.
4. **`service_role` already bypasses RLS** for the 66 tables that name it and in general for
   server routes. Tightening user-facing policies does not change what server code can do,
   so it does not, by itself, close any route-layer hole.
5. **Blast radius.** 257 tables carry `authenticated` write grants. Revoking them is a
   different remediation from rewriting policies, with different compatibility risk.

---

## Representative affected tables

Tables where a promoted route capability and a role-title RLS predicate both govern the same
state:

| Table | Route capability | RLS write predicate |
|---|---|---|
| `task_assist_proposals` | `ai.enrichment.use` | `role = ANY('owner','admin','ops')` |
| `entity_layouts` | `layouts.manage` | role-title bearing |
| `field_definitions` | `fields.manage` | role-title bearing |

---

## Migration scale

- Policy rewrite touching every role-title write policy: **~101 tables**, migration-bearing.
- Grant revocation instead of policy rewrite: up to **257 tables**.
- Either is far larger than any single Access & Identity slice, and both change behaviour for
  any principal reaching PostgREST directly.

---

## Recommended investigation before remediation

1. Establish the **intent**: was `authenticated` given table grants deliberately, as an
   application-principal surface, or incidentally by a Supabase default?
2. Decide the **model**: is RLS tenancy+admission (and therefore correct as-is, if
   imprecise), or a second authorization layer (and therefore wrong today)?
3. If the second: pick the mechanism — capability-aware policies, a
   `SECURITY DEFINER` helper that resolves capabilities once, or revoking direct grants so
   PostgREST is not a user-facing surface at all.
4. Measure the performance cost of a capability predicate on a hot table before committing
   to 101 of them.
5. Only then scope a migration, in slices, with a lock that fails when a new table ships a
   role-title write policy.

---

## What this packet does NOT claim

- It does not claim a live exploit. No product client reaches these tables from the browser.
- It does not claim the route convergence is void. Every promoted capability gate is real and
  certified; this concerns a second path that the product does not use.
- It does not claim 101 tables need changing. That number is the size of the *question*, not
  of the answer.

---

## Related

- `ADMIN_SEED_INTEGRATIONS_GAP` — separate, also unowned by Access & Identity.
- `ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT` — the one-key inventory schema cannot express
  conditional owners (`config_assist.review` OR `.apply`).
