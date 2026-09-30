---
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# RLS_AUTHORITY_MODEL_DIRECTOR_GATE

**Status:** **RATIFIED 2026-09-30 — Model A.** The decision this document was written to enable has
been made and now lives in its durable owner,
[`../foundation/platform-decisions.md`](../foundation/platform-decisions.md) § *2026-09 — Route
capabilities authorize; RLS isolates tenants; mutation is server-side*. **Read that for the
decision; read this for the measurement and the staged plan.**

**Implementation status (2026-09-30).** Phase 1 is **DONE**; Phases 2b–3b are **AUTHORED, APPLY
PENDING** — the migrations are in the tree and have not been applied to the deployed primary, so the
exposures they close are **still open in production**. Phase 2's original tenancy class was already
closed by `20260916040000`. The
remeasurement that preceded them found a class the first pass had no term for — SECURITY DEFINER
functions taking their organization as a parameter. See *Remeasured 2026-09-30* below, which
supersedes every count in *The database, measured*. Phase 4 (retiring 259 tables' worth of
`authenticated` write grants, family by family) and Phase 5 (a capability primitive, only if
browser→table writes are ever adopted) remain open.
**Classification:** `RLS_AUTHORITY_MODEL_RATIFIED` (was `RLS_AUTHORITY_MODEL_DIRECTOR_GATE`)
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

> **Remeasured 2026-09-30 — the reading holds; two rows above do not.** Routes are now **677** with
> **599** on `createAdminClient`. **Not every browser-client file is auth-only.** Of the 9 non-test
> files under `app/`, `components/`, `lib/` and `hooks/` that construct or import the browser client,
> eight call `supabase.auth.*` exclusively — and `lib/pricing/supabasePricing.ts` calls the read-only
> `get_quote_pricing` RPC for the cleaning vertical retired in July. It has **zero callers**.
>
> So "client components calling `supabase.rpc()` = 0" remains literally true — that file is a lib
> module, not a component — but the stronger claim a reader takes from this table, *the browser never
> touches the data plane*, needs the exception stated. It is now **pinned as dead** by
> `tests/access/clientDataPathLock.test.ts`: an allowlist entry would have permitted exactly what the
> lock exists to prevent, so wiring it up fails the test instead. See *Remeasured 2026-09-30* below
> for every current count.

---

## Remeasured 2026-09-30 — what changed, and the finding the first pass missed

**The September numbers below are kept as the record of that pass. They are no longer current.**
Two catalog-only censuses of the deployed primary
(`certification/migrations/identity-access-model-a-authority-census.sql`,
`…-rpc-and-tenancy-census.sql`) re-derived every population, because a revoke proposed against a
stale grant count is a revoke proposed against a database that no longer exists.

| Measure | 2026-09-16 | 2026-09-30 | Reading |
|---|---|---|---|
| Public base tables | 301 | **322** | the estate grew |
| RLS enabled | 300 | **320** | |
| RLS **disabled** | 1 | **2** | `commercial_policy_exceptions` joined `payment_provider_disputes` |
| Tables where `authenticated` holds INSERT/UPDATE/DELETE | 257 | **259** | drift grew slightly |
| Tables with a write-capable policy | 277 | **250** | |
| Write-grant tables with **no** write policy | 12 | **56** | pure excess; the cleanest revoke class |
| `app_users`-shaped write policies with no org predicate | **51** | **0** | **CLOSED** |
| `work_units` self-comparison tautologies | 2 | **0** | **CLOSED** |
| Write policies resting on `current_org_id()` | 15 | **41** | still fails closed; see below |
| Unconditional permissive write policies | — | **0** | nothing permits blindly |
| API route files | 637 | **677** | |
| …using `createAdminClient` (service role) | 574 | **599** | |

### Three findings from the first pass are now closed

**The tenancy class is gone.** Zero policies anywhere in `public` reference `app_users` — confirmed by
reading every write policy's text, not by a `not like` test, because a zero has two readings and only
the text separates "repaired" from "mis-probed". Migration `20260916040000` removed them, and
`tests/access/rlsTenancyLock.test.ts` holds the invariant. The policies granted nothing even before
removal: `app_users` and `user_profiles` are dead legacy identity tables.

**The `work_units` tautology is gone.** The installed policies read `org_id = current_org_id()` with an
EXISTS subclause. No self-comparison survives in any write policy.

**`current_org_id()` still denies, and now we know it.** It returns NULL above one organization;
`pg_class.reltuples` for `orgs` came back `-1` (never analyzed), so the first census could not answer
this and the second asked directly: **3 organizations.** All 41 dependent write policies therefore
deny. The caveat from September stands unchanged — this predicate is load-bearing in exactly one
deployment shape and inert in the other.

**`app_users` itself carries no write defect.** One policy only — `app_users_read_self`, `id =
auth.uid()` — and the FK proves that is the right column (`app_users.id` → `auth.users(id)`;
`auth_user_id` is a separate legacy unique column). `authenticated` holds full write grants on it with
**no write policy**, so every such write denies. The grants are excess, not exposure.

### The finding the first pass did not have a term for

The September measurement framed the drift as *table grants*, and concluded it was latent because RLS
still says no on the write. **That reasoning does not extend to SECURITY DEFINER functions, and nobody
had counted those.**

Measured 2026-09-30: **14 mutating functions in `public` are EXECUTE-granted to `authenticated`, 9 of
them SECURITY DEFINER, and not one contains a caller-authority check of any kind** — no `auth.uid()`,
no `auth.role()`, no `has_org_role`, no `effective_capability_keys`. Every one takes the organization
it acts on as a **parameter**.

A SECURITY DEFINER function runs as its owner and never consults RLS. So for those 9, `p_org_id` was
the entire tenancy story, and the caller supplied it.

**`20260915160000` had already closed this exact class once** — and
`accessRpcExecuteBoundary.live.test.ts` has held it shut since. Its scan matches `p_actor_user_id`,
plus writers of `user_roles` and `role_permission_grants`. Two near-misses walked through:

- `revoke_operational_authority_assignment(p_org_id, p_assignment_id, p_actor)` takes an actor —
  spelled `p_actor`.
- `grant_operational_authority_assignment` and `upsert_operational_authority` write
  `operational_authority_assignments` / `operational_authorities` — a **second authority table family**.

That migration's own header predicted the recurrence: *"The next actor-taking function will ship
exposed by default, and this is what notices."* It was right about the mechanism and wrong about the
coverage, because the scan enumerated the **spellings** of the danger rather than its **shape**.
`apply_held_funds_atomic` then shipped in `20261102120000` with EXECUTE to PUBLIC, six weeks later.

**Severity, split honestly — the subsets are not equally serious.**

| Subset | Functions | Live? |
|---|---|---|
| Governed lifecycle writers | `execute_lead_status_mutation`, `execute_enrollment_status_mutation` | **LIVE.** Both SECURITY DEFINER, both writing `opportunities.status_key` / `opportunity_customer_members.outcome_status_key` for any org the caller names |
| Operational-authority writers | `grant_…`, `revoke_…`, `upsert_operational_authority` | **LATENT.** `operational_authority_assignments` has no application reader; the model is not switched on |
| Role config seeding | `seed_default_role_definitions` | LATENT |
| Money | `post_ledger_transaction` (0 callers, dormant), `apply_held_funds_atomic` (not SECURITY DEFINER, so RLS and table grants still apply) | mixed |
| Operational | `record_child_attendance_event`, `execute_processing_identity_group`, `insert_enrollment_participation_and_maintain_facts`, `staff_coverage_plan`, `staff_coverage_supersede`, `set_assignment_weekday_intervals` | LIVE writers, server-only callers |

The first row is the one that matters most to this program. PRs 1338–1341 established that the
canonical transition endpoint is the only lifecycle writer and `validateStatusTransition` the only
transition gate. **Both are application-layer facts.** These two functions bypass the route, the
capability check and the transition gate together — which is the precise sense in which "the claim
*this capability governs this operation* is true of the product and not true of the database", stated
one layer lower than September stated it.

### Repaired here — authored, not yet applied

> Both migrations below are committed and validated. **Neither has been applied to the deployed
> primary.** `database.apply_migration` is a separate governed action and is the single remaining step;
> until it runs, everything described as closed here is closed in the tree only.

- **`20261104120000`** revokes EXECUTE from PUBLIC/anon/authenticated on the org- and
  actor-parameterized mutating family, keeps `service_role`, and **widens
  `access_rpc_boundary_report`** so the existing live lock guards the shape rather than the spellings.
  Safe because `service_role` retains EXECUTE, every supported caller is a server module holding an
  injected client, and internal function-to-function calls run with the calling function's privileges.
- **`20261104130000`** enables RLS on both RLS-disabled tables with a service-role policy. It
  deliberately does **not** copy the sibling read predicate: that rests on `current_org_id()`, which
  denies at 3 orgs, so it would look org-scoped while granting nothing. Choosing its replacement is a
  Financials read-semantics decision and is ledgered, not guessed.
- Three repo locks: `clientDataPathLock` (Phase 1 of the staged plan), `rlsEstateCoverage`,
  `orgParameterizedRpcBoundary`.

### Still open, with exact sizes

| Debt | Size | Class |
|---|---|---|
| `authenticated` write grants on tables the product never writes as that principal | **259 tables**, of which **56** have no write policy at all | Phase 4 — retire per table family |
| Write policies resting on the inert `current_org_id()` | 41 | fails closed today; becomes permissive in a single-org deployment |
| Write policies matching none of the four known shapes | 142 | none unconditional; unclassified rather than unsafe |
| Read exposure semantics for the two repaired tables | 2 | ledgered for Financials |

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

**Phase 1 — lock the intended data path (no migration). ✅ DONE 2026-09-30.**
`tests/access/clientDataPathLock.test.ts`, subject discovered from disk. No browser-client file
mutates a table; every browser-client call is `supabase.auth.*` with one pinned exception —
`lib/pricing/supabasePricing.ts`, which calls the read-only `get_quote_pricing` for the retired
cleaning vertical and has zero callers. It is **pinned as dead** rather than allowlisted: an
allowlist entry would permit exactly what the lock exists to prevent, so wiring it up fails the
test. No API route writes through the RLS-bound server client. All four assertions were proved by
planting a violation and watching each fail on its own name.

**Phase 2 — repair the tenancy class, not the authority class. ✅ DONE — by `20260916040000`,
before this run.** Remeasured 2026-09-30: zero policies in `public` reference `app_users`, and zero
write policies contain a self-comparison. Confirmed by reading every write policy's text rather than
by a `not like` probe, because a zero has two readings. Held by
`tests/access/rlsTenancyLock.test.ts`.

**Phase 3 — decide `payment_provider_disputes`. ⚠️ AUTHORED 2026-09-30, APPLY PENDING — and it was two
tables, not one.** `commercial_policy_exceptions` had acquired the identical defect since September. Both
repaired by `20261104130000`: RLS enabled, service-role policy, `authenticated` SELECT grant left
alone (revoking SELECT is a broader decision than closing a leak, and with RLS on the grant already
yields nothing). The sibling read predicate was deliberately **not** copied — see the remeasurement
above. `tests/access/rlsEstateCoverage.test.ts` holds the estate invariant going forward, because a
migration's embedded guard is one-shot.

**Phase 3b — the SECURITY DEFINER family. ⚠️ AUTHORED 2026-09-30, APPLY PENDING.** Not in the original
plan because the original measurement had no term for it. `20261104120000`; see the remeasurement
above. **Until `database.apply_migration` runs against the deployed primary, all 14 functions remain
EXECUTE-granted to `authenticated` there.**

**Phase 4 — retire unnecessary write grants, table family by table family. OPEN — the largest
remaining item.** Proving product compatibility per family, starting with families already fully
converged on route capabilities. This is where the **259** shrinks. Start with the **56 tables that
hold a write grant and no write policy at all**: RLS already denies those writes, so the grant is
pure excess and removing it changes no behaviour. It is reversible and incremental; a revoked grant
that breaks something shows up immediately and is restored in one statement.

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
