# 05 — Surface & capability access catalog

> **Required output #2.** Catalogs the three things the brief's threat statement puts in tension:
> the **capabilities** the product defines, the **surfaces** an operator can reach, and the
> **commands** an actor can call — then asks whether a change to the first constrains the second
> or the third.
>
> The brief's stated threat — *"A user could be blocked from seeing the Billing workspace while
> still calling a billing API"* — is the question this document answers. **The measured answer is
> worse than the threat as stated:** an operator cannot be blocked from seeing the Billing
> workspace at all, because the Billing capability is inert on both sides (§4, §7).
>
> **Read §9 before citing any number.**

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Surface and capability access catalog* · assignment `asg_86987746143432`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def`
**Date** 2026-08-03
**Method** static, file-grounded. Counts reproduce with §10.

**Revision note.** This file previously held only *§6 Command & action enforcement census*
(delivered `c8120d550` under `msn_2d054741a54698fa4c`). That census is **preserved verbatim** as §6
and is not re-derived. §2–§5 and §7 are new and supply output #2's missing **surface** and
**capability** halves — the parts `00-mission-intake-and-coverage.md:§3` recorded as covered by a
route census that, by its own title, censused commands only. The filename is retained because
downstream documents link to it.

---

## 1. Headline

**Alloy has a capability vocabulary, a surface tree, and a command surface — and no edge connects
them.**

Four measured facts, each reproducible in §10:

| Measure | Count | Of |
|---|---|---|
| Permission keys seeded into the RBAC catalog | **32** | across 5 migrations |
| Seeded keys an operator can actually grant in the UI | **18** | 56% |
| Grantable keys that **no code anywhere consults** | **11** | 61% of grantable |
| Admin page routes gated on anything **finer than "has a role"** | **1** | of 132 |

The load-bearing one is the last. `app/adminV2/layout.tsx:23-31` admits any authenticated principal
with any truthy `role`, and no navigation, section, or page below it narrows that further — with a
single exception that is a *display* prop, not an access decision (§3.3).

So the brief's threat does not describe the system. The system has **no surface-level capability
gate to be inconsistent with**. Surface access and command access are not divergent; they are
both, independently, coarse role checks — and the capability layer that was supposed to unify them
is largely disconnected from both.

## 2. The capability catalog

32 permission keys are seeded into the RBAC catalog by five migrations:

```
supabase/migrations/20260505120100_settings_users_roles_permission.sql
supabase/migrations/20260505164000_permission_grid_keys.sql
supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql
supabase/migrations/20260523150000_config_assist_permissions_seed.sql
supabase/migrations/20260720000000_operational_expectations_author_permission_and_idempotency.sql
```

Each key below is classified by **where its only occurrences are**. A key whose sole occurrence is
its own definition site enforces nothing — it is *inert*.

### 2.1 Operator-grantable keys (the permission grid) — 18 keys, 9 rows

`web/lib/admin/permissionGrid.ts:12-35` defines the 9 rows the Access & Roles UI renders.

| # | Grid row | Read key | Write key | Status |
|---|---|---|---|---|
| 1 | Opportunities / Inquiries | `crm.opportunities.read` | `crm.opportunities.write` | **Both inert** |
| 2 | Customers / Families | `crm.customers.read` | `crm.customers.write` | **Both inert** |
| 3 | Communications | `communications.read` — inert | `communications.send` — **enforced** | Split |
| 4 | Scheduling | `scheduling.read` | `scheduling.write` | **Both inert** |
| 5 | **Billing / Payments** | `billing.read` | `billing.write` | **Both inert** |
| 6 | Documents | `documents.read` — **enforced** | `documents.write` — inert | Split |
| 7 | Reports / Analytics | `reports.read` — **enforced** | `reports.write` — **enforced** | Enforced |
| 8 | Configuration | `settings.read` — **enforced** | `settings.manage` — **enforced** | Enforced |
| 9 | Users & Roles | `settings.users_roles.read` — inert | `settings.users_roles` — **enforced** | Split |

**11 of 18 grantable keys are inert. 4 of 9 rows are inert in both columns.** For rows 1, 2, 4 and
5, setting the level to *None*, *Read* or *Write* is indistinguishable at runtime: no code path
reads the key.

Evidence for inertness — every occurrence of these ten keys in `web/app` and `web/lib` is its own
definition inside `permissionGrid.ts:13-19`, plus `settings.users_roles.read` at `:22`:

```
lib/admin/permissionGrid.ts:13  crm.opportunities.read / crm.opportunities.write
lib/admin/permissionGrid.ts:14  crm.customers.read / crm.customers.write
lib/admin/permissionGrid.ts:15  communications.read
lib/admin/permissionGrid.ts:16  scheduling.read / scheduling.write
lib/admin/permissionGrid.ts:17  billing.read / billing.write
lib/admin/permissionGrid.ts:18  documents.write
lib/admin/permissionGrid.ts:22  settings.users_roles.read
```

The seven enforced keys, with their consumption sites:

| Key | Enforced at | Reached by |
|---|---|---|
| `communications.send` | `lib/communications/communicationPermissions.ts` (`assertCommunicationsSendAllowed`) | 3 `app/api` routes; 19 refs total |
| `documents.read` | `lib/documents/assertDocumentAccess.ts:79` | `documents/[id]/signed-url`, `vendors/[id]/documents/signed-url`, `persons/[id]/profile-photo` |
| `reports.read` / `reports.write` | `lib/admin/canReadAnalytics.ts:11-12` | `metrics/resolve`, `metrics/trends`, `intelligence/operational` |
| `settings.read` / `settings.manage` | inline | `app/api/admin/configuration/programs/route.ts:54-55,65` — the **only** route |
| `settings.users_roles` | `lib/admin/canManageUsersAndRoles.ts:15-18` | 6 `app/api` refs; the RBAC surface itself |

### 2.2 Seeded but not grantable — 14 keys

These 14 keys exist in the catalog and are checked by code, but **the permission grid has no row
for any of them**, so no operator can grant or revoke one through the product. They are reachable
only by direct API call or SQL.

| Key(s) | Enforced at | Note |
|---|---|---|
| `config_assist.generate` · `config_assist.review` · `config_assist.apply` | `lib/agent/configLayoutAssist/configurationProposalAccess.ts` | Enforced via lib helper, not inline in routes |
| `data_quality.view` | `configurationProposalAccess.ts:23,55`; `configurationProposalPermissions.ts:25` | Config-assist proposal vocabulary |
| `fields.manage` · `fields.requirements.manage` · `fields.editability.manage` · `sections.manage` · `layouts.manage` · `option_sets.manage` | `lib/agent/configLayoutAssist/configurationProposalPermissions.ts:11-26` | **Gate config-assist *proposals* only.** No direct configuration route enforces them — the same edit made through the normal configuration surface is not checked against these keys. |
| `operational_expectations.author` | `lib/operationalExpectations/intake/authoringServerContext.ts:26` | Consumed only inside `lib/operationalExpectations/**`; no `app/api` route references the key directly |
| `ai.enrichment.use` | `lib/ai/aiEnrichmentPermissions.ts:11` | **Conditionally enforced.** Only applies when `AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`; otherwise routes fall back to portal admin/ops role (`aiEnrichmentPermissions.ts:81`) |
| `ai.provider.config.manage` · `ai.telemetry.review` | — | **Inert.** Seeded by migration; the only mention is a comment marking them *"Future: separate keys (documented only)"* (`aiEnrichmentPermissions.ts:13`) |

**Catalog totals: 32 seeded · 18 grantable · 13 inert (11 grantable + 2 non-grantable) · 1 conditional.**

### 2.3 The grant path

`components/adminV2/settings/access/AccessRolesConfigurationPage.tsx` is the operator's authoring
surface. It imports `PERMISSION_GRID_ROWS` (`:31`), fetches the catalog for labels only
(`:76-88`, `:150-154`), and saves with `PUT /api/admin/rbac/grants` carrying
`permission_keys: [...grantKeys]` (`:228-231`). One UI row is rendered per grid row (`:473`).

Two consequences follow from the grid being the vocabulary rather than the catalog:

- **The operator's mental model is 9 capabilities; the system's is 32.** The 14 keys of §2.2 are
  invisible to the surface that is supposed to govern them.
- Out-of-grid keys already granted are preserved rather than stripped
  (`permissionGrid.ts:55-65`, `applyGridRowSelection`), so a directly-granted key survives UI
  edits — correct behaviour, but it means the UI does not show an actor's full authority.

A deliberate presentation choice compounds this: *"raw `permission_key` strings never appear as
primary UI text"* (`AccessRolesConfigurationPage.tsx:6`). The operator sees **"Billing / Payments —
Write"** and has no way, inside the product, to learn that the underlying key governs nothing.

## 3. The surface catalog

### 3.1 Inventory

| Surface tree | Page routes | Root gate |
|---|---|---|
| `app/adminV2/**` | **68** | `app/adminV2/layout.tsx:23-31` |
| `app/legacy-admin/**` | **64** | (separate; not re-censused here) |
| **Total admin page routes** | **132** | — |

`app/adminV2` sections, by page count:

```
settings 48 · workspace 3 · commercial 3 · processing 2 · finance 2
workflows 1 · tasks 1 · system 1 · operations 1 · messages 1
inquiries 1 · compliance 1 · communications 1 · ai-activity 1 · (root) 1
```

### 3.2 The one surface gate

The entire `adminV2` tree is admitted by:

```ts
// app/adminV2/layout.tsx:23-31
const auth = await getAdminAuth();
if (!auth?.user?.id) redirect("/login");
if (!auth.role)     redirect("/unauthorized");
```

**Two conditions: authenticated, and holds some role.** No permission key, no scope, no
per-section requirement. The layout passes `role` and `roleKeys` into
`AdminV2RootAuthProvider` (`layout.tsx:41-44`; `AdminV2RootAuthProvider.tsx:12,22,26`) — note it
passes **no `permissionKeys`**, so client components could not filter on capability even if they
wanted to.

Navigation does not narrow it either. `app/adminV2/components/Sidebar.tsx` contains **zero**
occurrences of `permission`, `hasPermission`, or `canManage`. Every section link is rendered for
every principal with a role.

### 3.3 Capability awareness across 132 admin pages

| Tree | Pages referencing any capability concept |
|---|---|
| `app/adminV2` | **2 of 68** — `settings/users-roles/page.tsx`, `settings/organization/access/page.tsx` |
| `app/legacy-admin` | **1 of 64** |

**Both adminV2 exceptions are the Access & Roles surface itself.** This mirrors the command side
exactly: §6.2.1 finds that 11 of the 13 permission-aware API routes are also the RBAC surface. The
capability system governs the capability system, on both axes.

And the single page-level check is not an access decision:

```ts
// app/adminV2/settings/users-roles/page.tsx:16-18, 35-38
const access = await getAdminAccessContextCached();
if (!access.ok) redirect("/unauthorized");
…
return <UsersRolesConfigurationPage canManageUsersRoles={canManageUsersAndRoles(access)} … />;
```

A principal lacking `settings.users_roles` still **renders the page**; the capability arrives as a
prop that the component may use to disable controls. The server-side denial lives one layer down,
in `requireUsersRolesManageAuth` on the mutation routes (`canManageUsersAndRoles.ts:25-40`) — which
is the correct place for it. The point is that **the surface itself is not gated on capability
anywhere in the product**, including here.

One further asymmetry worth recording: `canManageUsersAndRoles` short-circuits on
`roleKeys.includes("admin")` before consulting any permission (`canManageUsersAndRoles.ts:16`). The
`admin` role is therefore unconstrainable by grant — revoking every key from `admin` changes
nothing.

## 4. Surface × capability × command

For each grid row an operator can set, what does setting it actually constrain?

| Grid row | Constrains the surface? | Constrains the command? | Net effect of setting *None* |
|---|---|---|---|
| Opportunities / Inquiries | No | **No** | **Nothing** |
| Customers / Families | No | **No** | **Nothing** |
| Communications | No | Partly — send only | Cannot send; can still read/list |
| Scheduling | No | **No** | **Nothing** |
| **Billing / Payments** | No | **No** | **Nothing** |
| Documents | No | Partly — signed-URL reads | Cannot fetch signed URLs; can still write |
| Reports / Analytics | No | Yes — 3 metrics routes | Loses those 3 routes; analytics pages still render |
| Configuration | No | Yes — 1 route | Loses `configuration/programs`; all other config routes unaffected |
| Users & Roles | No (renders; controls disable) | Yes — 6 routes | Cannot mutate RBAC — **unless role is `admin`** |

**Read the "Constrains the surface?" column as a single finding: it is "No" nine times out of
nine.** No capability grant in this product affects what an operator can navigate to.

## 5. Worked trace — the brief's threat statement

*"A user could be blocked from seeing the Billing workspace while still calling a billing API."*

Traced end to end:

1. **The capability exists.** `billing.read` / `billing.write` are seeded
   (`20260505164000_permission_grid_keys.sql`) and presented to the operator as **"Billing /
   Payments"** (`permissionGrid.ts:17`).
2. **Nothing consults it.** Every occurrence of both keys in `web/app` and `web/lib` is that one
   definition line. Setting the row to *None* revokes nothing.
3. **The surface is not gated.** `app/adminV2/finance/page.tsx` and
   `app/adminV2/finance/obligation-review/page.tsx` contain no capability, role, or `billing`
   reference. They inherit only `layout.tsx:23-31`. **The workspace cannot be hidden.**
4. **The commands are gated on coarse role, or less.**

   | Route | Gate | Client |
   |---|---|---|
   | `app/api/admin/payments/route.ts:61` | `requireAdminOrOps` | `createAdminClient` (service role) |
   | `app/api/admin/payments/run/route.ts:28` | `requireAdmin` | `createAdminClient` |
   | `app/api/admin/payments/[id]/route.ts:19` | `requireAdminOrOps` | `createAdminClient` |
   | `app/api/admin/commercial/tuition-rates/route.ts:39-45` (GET) | `getAdminContextCached` only | `createAdminClient` |
   | `app/api/admin/commercial/tuition-rates/route.ts:93-99` (POST) | `getAdminContextCached` only | `createAdminClient` |
   | `app/api/admin/commercial/categories`, `…/policies` | `getAdminContextCached` only | `createAdminClient` |

**So the true finding inverts the brief's phrasing.** The threat assumes the surface gate works and
the command gate lags. Neither gate consults the capability. And the sharpest instance is
`POST /api/admin/commercial/tuition-rates` — **writing tuition pricing is authorized by org
membership alone**: no role check, no permission check, executed with the service-role client and
therefore no RLS backstop either.

This is not asserted as an exploited vulnerability — no request was issued (§9). It is the
structure the code describes.

## 6. Command & action enforcement census

> *Preserved verbatim from the `msn_2d054741a54698fa4c` delivery (`c8120d550`). Not re-derived.*

### 6.1 Headline

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

### 6.2 Gate families

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

#### 6.2.1 Coarse role, not permission

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

#### 6.2.2 Deferred authorization

`resolveOperatorRoute` computes `actorAuthorized = ctx.role === "admin" || ctx.role === "ops"`
(`operatorRouteContext.ts:42`) and **returns it in `deps` rather than enforcing it** (`:44-54`).
Authorization becomes a value passed to the service layer, which may or may not honour it. This
pattern is defensible — the service may need to distinguish authorized from unauthorized paths —
but it moves the decision out of the route, so a route-level census cannot see it.

### 6.3 The action registry

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

## 7. What this means for V2

Ordered by risk, not by effort. Items 1–4 are carried forward from the command census; 5–7 are new
and follow from the surface and capability halves.

1. **One admission point.** Every `/api/*` route passes through a single gate that resolves
   principal, org, account state ([`04`](./04-authentication-model.md) §3.2), roles, permissions,
   and scope — and *fails closed* for any route that does not declare its requirement. The ten
   families collapse into one resolver with declarative per-route requirements.
2. **Declare authorization on the action, not the route.** `RegisteredAction` gains a required
   permission and scope requirement; `actionExecutor` enforces it before dispatch. Then placement
   genuinely cannot affect enforcement, and eligibility becomes a pure display concern derived from
   the same declaration.
3. **Make the census mechanical.** A route that does not declare a requirement should fail a test,
   not a review. The reason this document must caveat its own numbers (§9) is that coverage is
   currently undiscoverable; V2 should make "every route declares" a static, enforced property.
4. **Decide RLS's role.** 94% service-role usage means RLS protects almost nothing on the
   privileged surface today. Either close that gap or state plainly that RLS is not an authority
   layer (D4, `02…:662-665`). Both are defensible; the current ambiguity is not.
5. **No inert capability may ship.** A permission key with zero consumers is a false statement made
   to the operator, and 11 of the 18 grantable keys are currently making it. Either bind each key
   to an enforcement site or remove the row — W-3 already established removal as the right move
   when a row grants nothing (`permissionGrid.ts:23-34`). This should be a build-time assertion,
   not a review item: *every catalog key resolves to at least one enforcement site.*
6. **Derive the grid from the catalog, not from a literal.** The grid is a hand-maintained array
   that has drifted to 18 of 32 seeded keys, so 14 capabilities are ungovernable through the
   product. `02…` already contemplates this as W-10; the census here quantifies the drift.
7. **Gate surfaces on capability, and derive the gate from the same declaration.** Today a section
   is reachable by anyone with a role. V2 should let each surface declare the capability it
   presents, have the layout enforce it, and have navigation *filter from the same declaration* —
   so that "blocked from seeing the Billing workspace" becomes true, and true for the same reason
   the billing commands are blocked. This is what makes the brief's threat statement testable
   rather than moot.

## 8. Bearing on the brief's rejection conditions

| Rejection condition | Status | Evidence |
|---|---|---|
| *"A permission exists but is not connected to a meaningful operator concept."* | **Triggered** | 11 of 18 grantable keys inert (§2.1); 14 seeded keys have no operator control (§2.2) |
| *"A UI checkbox is added without enforcement evidence."* | **Triggered** | The permission grid is a checkbox surface for 11 keys that enforce nothing (§2.3); action registry carries no authorization metadata (§6.3) |
| *"A user could be blocked from seeing the Billing workspace while still calling a billing API."* | **Triggered, in a stronger form** | Neither the workspace nor the API consults the Billing capability (§5) |

## 9. Limits — read before citing

- **Counts are file-level, not handler-level.** One `route.ts` may export `GET`, `POST`, `PATCH`,
  `DELETE` with different gates. A file counts as gated if *any* recognized helper appears in it.
  **A gated file does not mean every method in it is gated.** This is the single largest weakness
  of a static census and the reason §7.3 matters.
- **"Ungated" was not established, and is deliberately not reported as a number.** An initial pass
  suggested ~53 ungated admin routes; spot-checking dissolved most of it — some are re-exports
  (`app/api/admin/v2/view-models/drawer/person/[id]/route.ts` is one line re-exporting a gated
  route), others use domain resolvers the pattern did not match (§6.2.2). Any "N unprotected routes"
  claim from this corpus should be treated as unverified until checked per handler.
- **"Inert" is an occurrence claim, not a behavioural one.** It means the key string appears
  nowhere but its definition site in `web/app` and `web/lib`. A key assembled dynamically
  (string concatenation, template, or DB-driven comparison) would evade this. Spot-checks found no
  such construction, but it was not exhaustively excluded.
- **"Enforced" means *consumed*, not *deny-verified*.** For the seven enforced keys, consumption
  sites were located; that each site denies correctly on a real request was **not** tested.
- **Surface counts are `page.tsx` files.** Sub-routes rendered by a single page (tabs, chapters,
  `?section=` variants) are not counted separately, so 132 understates navigable destinations.
- **`legacy-admin` was inventoried, not censused.** Only its capability-awareness count (1 of 64)
  was measured; its gate structure was not analysed.
- **Grep cannot see intent.** A route calling a gate but ignoring its result reads as gated.
- **No route was executed.** No request was issued, authenticated or otherwise. Nothing here is a
  demonstrated vulnerability; it is a description of structure.
- **Public routes were not assessed.** `public`, `book-v2`, `webhooks`, `action-links`, `marketing`
  are presumably intentionally unauthenticated (middleware explicitly exempts two webhooks,
  `web/middleware.ts:28-33`); confirming each is intentional is separate work.

## 10. Reproduce

```bash
cd web

# ---- §2 capability catalog -------------------------------------------------
# 32 — seeded permission keys
grep -rhoE "'[a-z_]+\.[a-z_.]+'" ../supabase/migrations/*permission* | sort -u
# 18 — keys the operator can grant (9 rows x read/write)
grep -oE '"[a-z_]+\.[a-z_.]+"' lib/admin/permissionGrid.ts | sort -u | wc -l
# per-key occurrence census — a key whose only hit is permissionGrid.ts is inert
grep -rnE '(billing|scheduling|crm\.(customers|opportunities))\.(read|write)' \
  app lib --include='*.ts' --include='*.tsx'
# enforced-key consumption sites
grep -rln 'canReadAnalytics|ANALYTICS_READ_PERMISSION'  app lib --include='*.ts'
grep -rln 'assertDocumentAccess|DOCUMENT_READ_PERMISSION' app lib --include='*.ts'
grep -rn  'settings\.(read|manage)' app/api --include='*.ts'
# ai.provider.config.manage / ai.telemetry.review are documented-only
grep -n 'documented only' lib/ai/aiEnrichmentPermissions.ts

# ---- §3 surface catalog ----------------------------------------------------
# 68 / 64 / 132 — admin page routes
find app/adminV2   -name page.tsx | wc -l
find app/legacy-admin -name page.tsx | wc -l
# the whole adminV2 surface gate
sed -n '23,31p' app/adminV2/layout.tsx
# navigation does not filter on capability (expect: no output)
grep -nE 'permission|hasPermission|canManage' app/adminV2/components/Sidebar.tsx
# 2 of 68 / 1 of 64 — capability-aware pages
grep -rlE 'permissionKeys|hasPermission|permission_key|canManage|canRead' app/adminV2 --include='*.tsx'
grep -rlE 'permissionKeys|hasPermission|permission_key|canManage' app/legacy-admin --include='*.tsx' | wc -l

# ---- §2.3 grant path -------------------------------------------------------
grep -nE 'PERMISSION_GRID_ROWS|rbac/(grants|permissions|roles)' \
  components/adminV2/settings/access/AccessRolesConfigurationPage.tsx

# ---- §5 billing trace ------------------------------------------------------
grep -rnE 'permission|role|billing|canRead' app/adminV2/finance/page.tsx   # expect: no output
sed -n '39,45p;93,99p' app/api/admin/commercial/tuition-rates/route.ts

# ---- §6 command census (unchanged) ----------------------------------------
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

## 11. Provenance

- **Verified in** `wt6-vacilando-os-product-def`.
- **Read in full:** `lib/admin/permissionGrid.ts`, `lib/admin/canManageUsersAndRoles.ts`,
  `lib/agent/configLayoutAssist/configurationProposalPermissions.ts`, `app/adminV2/layout.tsx`,
  `app/adminV2/settings/users-roles/page.tsx`.
- **Read in part:** `components/adminV2/settings/access/AccessRolesConfigurationPage.tsx`,
  `app/api/admin/commercial/tuition-rates/route.ts`, `lib/ai/aiEnrichmentPermissions.ts`,
  `app/adminV2/components/Sidebar.tsx`, `app/adminV2/AdminV2RootAuthProvider.tsx`.
- **Carried forward (§6), read in full by the prior phase:** `lib/adminV2/actions/actionRegistry.ts`,
  `lib/pos/processingIdentity/operator/operatorRouteContext.ts:32-55`,
  `app/api/admin/users/route.ts`, `app/api/admin/analytics/metrics/route.ts`,
  `app/api/admin/communications/family-send/route.ts`.
- **Inputs:** `01-existing-state-inventory.md` (C1 gate-vs-resolver; route census `:478-527`),
  `02-canonical-access-identity-model.md` (§10 where authority is decided, D4, W-10),
  `00-mission-intake-and-coverage.md` §3 (output #2 coverage claim this document completes).
- **No source, schema, migration, or UI changed by this phase.**
