---
owner: platform
status: canonical
last_reviewed: 2026-09-16
supersedes: []
---

# RLS_AUTHORITY_MODEL_DIRECTOR_GATE

**Status:** DIRECTOR_DECISION_READY — one architecture recommended, no implementation performed.
**Classification:** `RLS_AUTHORITY_MODEL_DIRECTOR_GATE`
**Raised:** AI Residual Authority V1, 2026-09-16. **Investigated:** RLS Authority Model V1, same day.
**Not AI-specific. Not caused by any Access & Identity slice.**

---

## The short version

**The doctrine was already written. This investigation did not have to invent it — it had to find
it, and then measure how far the database has drifted from it.**

`docs/platform/governance/implementation-patterns.md` § *Supabase access* states:

> - Browser: anon/authenticated client with RLS
> - Server privileged writes: `createAdminClient` / service role
> - Never expose service role to client

`configuration-publication-model.md` states the canonical per-domain shape:

> The RLS shape: authenticated **org-readers** via `has_org_role`, **all mutation through
> `service_role`**.

So the intended division is already doctrine: **routes own business authorization; RLS owns
tenant-scoped reading; mutation does not happen under the authenticated principal at all.**

The measured gap is that 257 tables still grant `authenticated` write privileges the intended
architecture never needed, and ~122 of them carry write policies that would *permit* some of
those writes. Nothing in the product uses that path.

---

## What the product actually does

| Measure | Value |
|---|---|
| API route files | 637 |
| …using `createAdminClient` (**service role — bypasses RLS**) | **574** |
| …using a request-scoped, RLS-bound client | **0** |
| Files using the RLS-bound server client at all | 4 (session resolution; the caller's own grant read) |
| Client components calling `supabase.from()` | **0** |
| Client components calling `supabase.rpc()` | **0** |
| Files importing the browser client | 6 — **all six use `supabase.auth.*` only** |

**Reading.** The product's entire data plane runs under `service_role`. RLS is not in the write path
for any product traffic, and cannot be: `service_role` bypasses it by definition. RLS today protects
one thing in production — a direct PostgREST path that no product code takes.

This is the fact that decides the architecture. A layer the product never executes cannot be the
canonical authorization model, whatever its policies say.

---

## The database, measured

| Measure | Value |
|---|---|
| Public base tables | 301 |
| RLS enabled | 300 |
| RLS **disabled** | 1 — `payment_provider_disputes` (see below) |
| Tables with write policies | 277 |
| Policies carrying a role-title predicate | 157, across 111 tables |
| Policies referencing permission/grant truth | **1** (`role_permission_grants` itself) |
| Tables where `authenticated` holds INSERT/UPDATE/DELETE | **257** |

### 101+ policies are not 101 problems — they are four shapes

| Shape | Tables | What it actually does |
|---|---|---|
| `has_org_role(org_id, ARRAY[...])` | 104 | org-scoped role check — **tenancy + coarse admission**, works correctly |
| `auth.role() = 'service_role'` | 51 | a server-only escape; denies authenticated writes |
| `EXISTS(app_users au WHERE au.id = auth.uid() AND au.role = ANY(...))` | 51 | role check with **no org predicate** — see risk below |
| `EXISTS(user_roles ur WHERE ... ur.org_id = <T>.org_id AND ur.role = ANY(...))` | 20 | hand-rolled equivalent of `has_org_role` |
| `org_id = current_org_id()` | 30 (15 write) | **inert in multi-org** — see below |

### Of the 257 authenticated-writable tables

| Outcome for a direct authenticated write | Tables |
|---|---|
| No write policy → denied | 12 |
| `service_role`-only policy → denied | 28 |
| `current_org_id()` → **NULL in multi-org → denied** | 15 |
| `has_org_role` → **permitted to `owner`/`admin`/`ops` title holders** | **71** |
| `app_users` global role, no org predicate → **permitted, un-tenanted** | **51** |

(Counts overlap where a table carries several policies.)

---

## Three findings worth separating

### 1. `current_org_id()` is inert wherever there is more than one organization

```sql
CREATE FUNCTION public.current_org_id() RETURNS uuid ... AS $$
  SELECT CASE WHEN (SELECT count(*) FROM public.orgs) = 1
              THEN (SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1)
              ELSE null END
$$
```

With more than one org it returns `NULL`, so `org_id = current_org_id()` is `NULL` → the policy
denies. Measured on the certification database (10 orgs): returns `NULL`. **This fails closed**, so
it is not a security hole — but 15 write-policy tables are relying on a predicate that does nothing
except deny, and would silently become permissive in a single-org deployment. It is load-bearing in
exactly one configuration and inert in the other.

### 2. The `app_users` shape has no tenant predicate — highest-risk class

```sql
EXISTS (SELECT 1 FROM app_users au
         WHERE au.id = auth.uid() AND au.role = ANY(ARRAY['admin','ops']))
```

`app_users` *has* an `org_id` column and the target tables have `org_id`, but neither is referenced.
On these 51 tables an `admin`/`ops` principal **in any organization** satisfies the policy for rows
belonging to **any other organization**. This is a cross-tenant *write* shape, not merely a
capability disagreement.

It is **latent**: the product never writes from the browser, and no product code path reaches these
tables as `authenticated`. It is still the first thing to fix, because it is the only class where the
failure mode is tenancy rather than authority.

### 3. A self-comparison tautology, bounded to two policies

`work_units_insert_same_org` and `work_units_update_same_org` check
`d.org_id = d.org_id` — always true — where the SELECT policy correctly says
`d.org_id = work_units.org_id`. The tenant check that survives is `org_id = current_org_id()`, which
(see finding 1) denies in multi-org anyway. Scanned the whole policy estate: **only these two**.

---

## Can the two authority layers disagree?

Yes, and here is the exact state.

| Table | Route requires | RLS write predicate | Disagreement |
|---|---|---|---|
| `task_assist_proposals` | `ai.enrichment.use` | `user_roles` role ∈ (owner, admin, ops) | An `ops` user **without** the capability satisfies RLS |
| `field_definitions` | `fields.manage` | `user_roles` role ∈ (…) | same shape |
| `communication_messages` | `communications.send` | `service_role` only | **No disagreement** — RLS denies the principal outright |
| `work_units` | `work.configure` | `current_org_id()` (NULL → deny) | No disagreement in multi-org; denies |

So the disagreement is real but **unreachable through any supported product path**, because every
product mutation runs as `service_role` and no browser code writes.

---

## Is there a capability primitive for RLS?

**Partly — and this is better than expected.** `public.effective_capability_keys(p_org_id, p_user_id)`
already exists, `STABLE SECURITY DEFINER`:

```sql
SELECT COALESCE(array_agg(DISTINCT g.permission_key), ARRAY[]::text[])
  FROM public.user_roles ur
  JOIN public.role_permission_grants g
    ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
 WHERE ur.org_id = p_org_id AND ur.user_id = p_user_id;
```

It handles multi-role union, honours `allowed`, and scopes to org membership. Gaps if it were to
become an RLS primitive:

- it takes an explicit `p_user_id`; there is **no `auth.uid()`-bound wrapper** and nothing calls it
  from a policy today;
- it does **not** check `role_definitions.is_active`, so a deactivated role could still confer keys;
- it aggregates an array per call — per-row evaluation cost is unmeasured, and `STABLE` caching does
  not help when `org_id` varies across rows;
- it has no scope (department/site) dimension, which routes do enforce.

**No safe drop-in primitive exists. Building one is real implementation cost, not a wrapper.**

---

## `payment_provider_disputes` — report separately

| | |
|---|---|
| RLS | **disabled**, 0 policies |
| `authenticated` grants | **SELECT** |
| `service_role` / `postgres` | full |
| `org_id` column | present |
| Rows (est.) | ~253 |
| Callers | `web/lib/financials/payments/providerDispute.ts` only (server, service-role) |
| Created by | `supabase/migrations/20260909250000_provider_initiated_reversal.sql` |

**Any authenticated principal can `SELECT` every row, across every organization.** Writes are
service-role only, so this is a **cross-tenant read exposure on a payments table**, not a write one.
Its siblings all enable RLS, so the omission reads as an oversight rather than a decision.

Not repaired here — this run is discovery-only. It is the narrowest, highest-value repair available
and is recommended as its own small slice: enable RLS, add an `org_id = ` org-membership read policy
matching sibling payment tables, keep mutation on `service_role`. Nothing in the product reads it as
`authenticated`, so compatibility risk is low — but that must be proved, not assumed.

---

## Models compared

| | A — Route authority / RLS tenancy | B — Dual authority | C — RLS primary | D — Hybrid by data path |
|---|---|---|---|---|
| Matches written doctrine | **yes** | no | no | partly |
| Works with 574 service-role routes | **yes** | no (RLS bypassed anyway) | **no** | yes |
| Needs a capability primitive in SQL | no | yes (does not exist) | yes | for direct-client tables only |
| Per-row cost | none | high | high | scoped |
| Migration size | small, staged | ~122 policies + new primitive | whole estate | medium |
| Risk of lockout | low | medium-high | high | medium |

**B and C are not merely expensive — they are incoherent with the current runtime.** RLS cannot own
business authorization for traffic that arrives as `service_role`, and 574 of 637 route files do
exactly that. Adopting B or C would mean either rewriting the data plane onto the authenticated
principal, or building an authorization layer that the product never executes.

**D is a real option only if browser→table writes are planned.** Nothing in doctrine or source
indicates they are; doctrine says the browser gets *reads* under RLS.

---

## RECOMMENDED: MODEL A (variant — "routes authorize, RLS tenants, mutation is server-only")

**ROUTE CAPABILITIES OWN:** business authorization — who may perform this operation
(`fin.write`, `work.operate`, `ai.enrichment.use`, …), plus department/site/record scope, plus the
tenant pin on every write (`ctx.orgId`, `assertRowOrg`). This is the canonical authority layer and
Access & Identity V2 has been converging the right thing.

**RLS OWNS:** tenant-scoped **reading** for any authenticated principal, and **denial of direct
writes**. Its job on the write side is to say *no*, not to decide *who*. Role titles inside policies
are admission-and-tenancy heuristics, not business authority, and should not be read as a competing
model.

**DATABASE GRANTS OWN:** the shape of what is reachable at all. The 257 `authenticated` write grants
are not required by this architecture. They are the drift.

**SERVICE ROLE MAY:** perform all mutation, exclusively from server routes that have already resolved
capability, tenancy and scope. It must never reach the client.

**BROWSER CLIENT MAY:** authenticate, and read within its organization under RLS. It may not write.

---

## Staged plan — no 101-table big bang

**Phase 1 — lock the intended data path (no migration).**
A repo lock asserting: no client component calls `supabase.from()`/`.rpc()`; the browser client is
auth-only; new API routes do not introduce an RLS-bound write client. This freezes the assumption the
whole model rests on, and is the only phase that must happen before anything else.

**Phase 2 — repair the tenancy class, not the authority class.**
The 51 `app_users` policies with no org predicate, and the 2 `work_units` tautologies. These are
tenant-integrity defects independent of the capability debate, and they are correct to fix under
*any* model. Small, mechanical, testable.

**Phase 3 — decide `payment_provider_disputes`** (or do it before Phase 2 — it is one table).

**Phase 4 — retire unnecessary write grants, table family by table family**, proving product
compatibility per family, starting with families already fully converged on route capabilities. This
is where the 257 shrinks. It is reversible and incremental; a revoked grant that breaks something
shows up immediately and is restored in one statement.

**Phase 5 — only if browser→table writes are ever adopted:** build the `auth.uid()`-bound capability
primitive, with `is_active`, scope and measured per-row cost. Not before.

Explicitly **not** recommended: converting 101 role-title policies to capability predicates. That
work serves a model the runtime does not use.

---

## Does this block Access & Identity V2?

**NO.**

Route capabilities remain the canonical business authority, and every promoted slice is enforced on
the path the product actually takes. The RLS disagreement is reachable only by a principal calling
PostgREST directly — a path no product code exercises, from a client that today only authenticates.

**Partially, in one narrow sense:** the *claim* "this capability governs this operation" is true of
the product and not true of the database. Until Phase 4, statements about authority should say
**"on the supported path"**. That is a precision requirement on how completion is described, not a
blocker on continuing convergence.

---

## Related

- `ADMIN_SEED_INTEGRATIONS_GAP` — unowned by Access & Identity.
- `ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT` — one-key inventory cannot express conditional owners.
