# 05 — Command & action enforcement census

> **Completes required output #2.** Censuses every API route and every registered operational
> action, and asks of each: *is access enforced server-side, independently of UI placement?*
> The brief's stated threat — *"A user could be blocked from seeing the Billing workspace while
> still calling a billing API"* — is the question this document answers.

**Mission** `msn_2d054741a54698fa4c` v1 · phase *Command/action enforcement census* · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Method** static, file-grounded. Counts reproduce with §6. **Read §5 before citing any number.**

---

## 1. Headline

**Authorization in Alloy is not a layer. It is a convention, applied by at least ten different
helpers, and no static analysis can establish its coverage.**

Three measured facts:

| Measure | Count | Of |
|---|---|---|
| API route files | **539** | — |
| Routes constructing the **service-role** client (RLS bypassed) | **507** | 94% |
| Routes referencing **any permission-key concept** | **13** | 2.4% |

And one structural fact: **middleware does not authenticate `/api/*`**
(`web/lib/admin/operatorSessionGate.ts:16-22`; see [`04`](./04-authentication-model.md) §2.5). An API
route is unauthenticated at the edge by default; protection exists only if the handler opts in.

The 507 figure is the load-bearing one. With RLS bypassed on 94% of the privileged surface, the
database is not a backstop — which is the empirical basis for the D4 recommendation in
`02-canonical-access-identity-model.md:662-665`.

## 2. Gate families

Enforcement is spread across independent helper families, each with its own semantics and failure
mode. Occurrence counts across `app/api/**/route.ts`:

| Gate family | Occurrences | What it establishes |
|---|---|---|
| `getAdminContextCached` / `getAdminContext` | 948 / 450 | Authn + org; `ok`/`status` |
| `requireAdminOrOps` | 288 | Authn + coarse role |
| `adminRouteGate` | 93 | Route-level admin gate |
| `requireAdminOrgContextLight` | 42 | Authn + org, reduced payload |
| `requireAdmin` | 32 | Admin only |
| `requireAnalyticsV2AdminContext` / `…Mutate` | 28 / 26 | Analytics-specific, read vs write |
| `requireUsersRolesManageAuth` | 17 | The one true permission gate (`settings.users_roles`) |
| `requirePortalOrUsersRolesManageAuth` | 6 | Portal-or-manage |
| `assertCommunicationsSendAllowed` | 12 | Domain rule, post-authn |
| `assertLegacyOpportunityLayoutWriteAllowed` | 4 | Domain rule |
| `assertProcessingDevCleanupAllowed` | 2 | Domain rule |

Plus per-domain route resolvers that wrap a gate — e.g. `resolveOperatorRoute`
(`web/lib/pos/processingIdentity/operator/operatorRouteContext.ts:32-55`).

**Ten-plus admission points is the finding.** Each is individually reasonable; collectively they
mean there is no single place where "is this actor allowed to do this" is decided, and therefore no
place to add a rule and have it hold everywhere. A new route is protected only if its author
remembers to pick a helper, and nothing forces the choice.

### 2.1 Coarse role, not permission

Of the eleven families, exactly two consult a permission key
(`requireUsersRolesManageAuth`, `requirePortalOrUsersRolesManageAuth`). The rest branch on
`role === "admin" | "ops"` or merely on org membership. Only **13 of 539** routes reference
`permissionKeys` / `hasPermission` / `permission_key` / `canManage` at all, and **11 of those 13 are
the Access & Roles and config-assist surfaces themselves**:

```
app/api/admin/rbac/{grants,roles,roles/[role_key],permissions}/route.ts
app/api/admin/users/{route,[userId]/remove,[userId]/role,[userId]/access-scope}/route.ts
app/api/admin/settings/users-roles/members/route.ts
app/api/admin/config-layout-assist/proposals/[id]/{apply,state}/route.ts
app/api/admin/ai/config-layout-assist/capabilities/route.ts
app/api/admin/configuration/programs/route.ts
```

**The permission system governs the permission system.** Outside the RBAC surface and two config
routes, granting or revoking a permission key changes nothing about what an actor can call. This
is the precise mechanism behind the brief's rejection condition *"A permission exists but is not
connected to a meaningful operator concept."*

### 2.2 Deferred authorization

`resolveOperatorRoute` computes `actorAuthorized = ctx.role === "admin" || ctx.role === "ops"`
(`operatorRouteContext.ts:42`) and **returns it in `deps` rather than enforcing it** (`:44-54`).
Authorization becomes a value passed to the service layer, which may or may not honour it. This
pattern is defensible — the service may need to distinguish authorized from unauthorized paths —
but it moves the decision out of the route, so a route-level census cannot see it.

## 3. The action registry

The brief requires that *"every registered command verifies authorization independently of UI
placement."* It does not.

- **Nine canonical registered actions** (`web/lib/admin/actions/canonicalActionRegistry.ts`, 9
  `actionKey:` entries).
- **The registry carries no authorization metadata.** No `requiredPermission`, no role, no scope
  field — zero matches for `permission|requiredPermission|authorize|role` in that file.
- **The execution path performs no authorization.** `actionExecutor.ts` (185 lines) and
  `actionEligibility.ts` (139 lines) contain **zero** occurrences of
  `permission|authorize|access|canManage|role`.
- Four actions have handlers (`lib/adminV2/actions/definitions/`): `confirmTourAction`,
  `createLeadAction`, `scheduleCreateAction`, `updateStatusAction`.

**Consequence.** An action's authorization is whatever the API route its handler eventually calls
happens to enforce. Authorization is a property of the transport, not of the command. Two
placements of the same action that reach different routes get different enforcement, and
`actionEligibility` — the thing that decides whether to *show* the action — is exactly the
UI-placement concern the brief says must not be load-bearing.

This is the clearest instance in the codebase of the brief's rejection condition *"A UI checkbox is
added without enforcement evidence."*

## 4. What this means for V2

Ordered by risk, not by effort.

1. **One admission point.** Every `/api/*` route passes through a single gate that resolves
   principal, org, account state ([`04`](./04-authentication-model.md) §3.2), roles, permissions,
   and scope — and *fails closed* for any route that does not declare its requirement. The ten
   families collapse into one resolver with declarative per-route requirements.
2. **Declare authorization on the action, not the route.** `RegisteredAction` gains a required
   permission and scope requirement; `actionExecutor` enforces it before dispatch. Then placement
   genuinely cannot affect enforcement, and eligibility becomes a pure display concern derived from
   the same declaration.
3. **Make the census mechanical.** A route that does not declare a requirement should fail a test,
   not a review. The reason this document must caveat its own numbers (§5) is that coverage is
   currently undiscoverable; V2 should make "every route declares" a static, enforced property.
4. **Decide RLS's role.** 94% service-role usage means RLS protects almost nothing on the
   privileged surface today. Either close that gap or state plainly that RLS is not an authority
   layer (D4, `02…:662-665`). Both are defensible; the current ambiguity is not.

## 5. Limits — read before citing

- **Counts are file-level, not handler-level.** One `route.ts` may export `GET`, `POST`, `PATCH`,
  `DELETE` with different gates. A file counts as gated if *any* recognized helper appears in it.
  **A gated file does not mean every method in it is gated.** This is the single largest weakness
  of a static census and the reason §4.3 matters.
- **"Ungated" was not established, and is deliberately not reported as a number.** An initial pass
  suggested ~53 ungated admin routes; spot-checking dissolved most of it — some are re-exports
  (`app/api/admin/v2/view-models/drawer/person/[id]/route.ts` is one line re-exporting a gated
  route), others use domain resolvers the pattern did not match (§2.2). Any "N unprotected routes"
  claim from this corpus should be treated as unverified until checked per handler.
- **Grep cannot see intent.** A route calling a gate but ignoring its result reads as gated.
- **No route was executed.** No request was issued, authenticated or otherwise. Nothing here is a
  demonstrated vulnerability; it is a description of structure.
- **Public routes were not assessed.** `public`, `book-v2`, `webhooks`, `action-links`, `marketing`
  are presumably intentionally unauthenticated (middleware explicitly exempts two webhooks,
  `web/middleware.ts:28-33`); confirming each is intentional is separate work.

## 6. Reproduce

```bash
cd web
# 539 — API route files
find app/api -name route.ts | wc -l
# 507 — service-role client (RLS bypassed)
grep -rlE 'createAdminClient|SUPABASE_SERVICE_ROLE' app/api --include=route.ts | wc -l
# 13 — any permission-key concept
grep -rlE 'permissionKeys|hasPermission|requirePermission|permission_key|canManage' app/api --include=route.ts | wc -l
# gate family census
grep -rhoE 'require[A-Za-z0-9_]*|getAdminContext[A-Za-z0-9_]*|assert[A-Za-z0-9_]*Allowed|adminRouteGate' \
  app/api --include=route.ts | sort | uniq -c | sort -rn
# 9 — canonical registered actions; no permission metadata
grep -cE 'actionKey:' lib/admin/actions/canonicalActionRegistry.ts
grep -nE 'permission|requiredPermission|authorize|role' lib/admin/actions/canonicalActionRegistry.ts
# executor/eligibility carry no authorization
grep -rnE 'permission|authorize|access|canManage|role' \
  lib/adminV2/actions/actionExecutor.ts lib/adminV2/actions/actionEligibility.ts
```

## 7. Provenance

- **Verified in** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`.
- **Read in full:** `lib/adminV2/actions/actionRegistry.ts`,
  `lib/pos/processingIdentity/operator/operatorRouteContext.ts:32-55`,
  `app/api/admin/users/route.ts`, `app/api/admin/analytics/metrics/route.ts`,
  `app/api/admin/communications/family-send/route.ts`.
- **Inputs:** `01-existing-state-inventory.md` (C1 gate-vs-resolver),
  `02-canonical-access-identity-model.md` (§10 where authority is decided, D4).
- **No source, schema, migration, or UI changed by this phase.**
