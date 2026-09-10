---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — authorization and tenancy sweep

Discovery record. Every claim below was re-verified against the tree at
`f27347f45` by the director before filing; where the worker's figure differed
from the verified one, the verified one is used and the discrepancy is named.

## 1. Enforcement distribution across 613 routes

| Strongest gate present | Routes |
|---|---|
| Session + org context only | 413 |
| Scope dimensions (department/site) | 136 |
| Permission key | 17 |
| Token capability | 25 |
| Provider signature | 5 |
| BOS trust | 3 |
| Device | 2 |
| Cron | 2 |
| **Insufficient or none** | **10** |

Of the 396 mutating routes, **22 (5.6%) check a capability or permission**.
`requireAdminOrOps` is used by 153 routes and checks no role
(`web/lib/adminAuth.ts:124`); **0 routes use it as their only gate**, so it is a
no-op layer rather than a false gate — it neither grants nor denies.

## 2. RLS is not load-bearing for the API surface

**Verified counts at `f27347f45`:**

- Route files under `web/app/api`: **613**
- Routes constructing an RLS-bound (user-JWT) Supabase client: **0**
- Routes using a service-role / admin client: **577**

Every tenancy decision on the API surface is therefore made in TypeScript.
Postgres RLS is inert for these paths by construction, not by accident.

**40 tables carry a bare `admin_ops_full_access` policy with no `org_id` term.**
The policy tests role membership only:

```sql
CREATE POLICY "admin_ops_full_access" ON "public"."customers" USING ((EXISTS (
  SELECT 1 FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"())
    AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))))
```

`supabase/migrations/20260329165048_remote_schema.sql:6915`. All 40 matching
policies are org-blind; **none** carries an org predicate. The set includes
`customers`, `contacts`, `locations`, `jobs`, `opportunities`, `messages`,
`payments`, `schedules`, `quotes`, `vendors`, `assignments`, `campaigns`,
`activity_log` and `pipelines`.

**Correct-shape comparison, same file:**
`CREATE POLICY "pricing_matrix_delete_org" … USING ("public"."user_belongs_to_org"("org_id"))`
(`:8208`). The org-scoping helper exists and is used elsewhere.

**Honest severity.** Because no route binds RLS, these 40 policies are **latent,
not currently exploitable through the API**. They are a trap laid for the first
user-JWT client anyone introduces: on that day, an `admin`/`ops` user reads
every tenant's customers. This is *worse* than a live bug in one respect — it
will be introduced by a change that looks correct and safe in review.

Thread 2 reported 2 such tables. The verified figure is 40. Thread 2's number
was a sample, not a count.

## 3. Authority changes take up to 120 seconds to bite

`web/lib/adminV2/adminShellContextCache.ts:13` —
`ADMIN_SHELL_CONTEXT_CACHE_TTL_MS = 120_000`, and the cache is deliberately
process-wide rather than module-scoped (`:22`) so it spans requests.

`invalidateAdminShellContextCache` is defined at `:93`. Repo-wide references:

- `:6` — its own doc comment, instructing callers to invoke it on logout/org switch
- `tests/adminV2/adminShellContextCache.test.ts:5,75` — a test

**Zero production call sites.** Revoking a permission, removing a membership or
switching org leaves the prior authority live for up to two minutes. The
module's own comment names the obligation nobody discharged.

Note the path: `lib/adminV2/`, not `lib/admin/`.

## 4. Pricing routes select without an org predicate

Six pricing routes fetch by row id with no org filter.
`web/lib/admin/deletionEligibility.ts:73` discards the org explicitly:

```ts
const evalPricingModes: Evaluator = async (id, { orgId: _orgId }) => {
```

The underscore records that the author saw the parameter and chose not to use
it. This is reachable today — unlike §2, it does not wait on a future change.

## 5. What this means for externalization

Authorization was never built as a layer. `runRegisteredAction` has no
permission step; the Command Runtime types its absence as a literal
(`authorizationEvaluated: false`, `commandRuntimeTypes.ts:165`) and refuses any
invocation claiming otherwise. The platform's own Definition of Done
(`docs/api/api-platform-governance.md:40`) asks for an authenticated admin
context and `org_id` filtering and stops there — it names no capability
requirement. The code is consistent with its doctrine; the doctrine is the gap.

Where domains did add a permission check — attendance, subsidy, reductions,
responsibility, tuition, users/roles, analytics — each built it privately.
`web/lib/childcareOperational/attendance/attendancePermissions.ts:17` explains
why nobody repaired the shared helper: changing `requireAdminOrOps` would alter
authorization for 153 routes in one commit with no per-route certification.
That is a sound reason to have deferred it and not a reason to keep deferring
it, because the deferral is what produced 413 session-only routes.
