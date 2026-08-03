# 02 — Canonical access & identity model

> **Specification.** The authority model Alloy is to be measured against: principals, subjects, roles,
> permissions, portal eligibility, and scope. Normative, not descriptive — where this document and the
> code disagree, the code is the defect and §13 says so by name.
>
> The as-built state is [`01-existing-state-inventory.md`](./01-existing-state-inventory.md). Read it first;
> this document does not restate its evidence, it cites it.

**Mission** `msn_e9133cdade883793d2` v1 · phase *Canonical access & identity model* · assignment `asg_9c1635a5beb5e0`
**contentHash** `a48a454dc1a5a25a537a345999d982dc`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Status** Proposed — specification only. No code, schema, or migration is changed by this phase.

---

## 0. How to read this

| Section | What it fixes |
|---|---|
| §1–§2 | The vocabulary and the one authority chain. Everything else is a rule about a link in that chain. |
| §3–§9 | One section per concept named in the objective: principals, subjects, orgs, roles, permissions, portal eligibility, scope. |
| §10 | Where authority is decided — the gate contract every decision point owes. |
| §11 | **The invariants.** Numbered `I-n`, each one testable. This is the normative core; §1–§10 is its rationale. |
| §12 | How to test each invariant. |
| §13 | **Divergence register** — every finding in phase 1 mapped to the invariant it violates. This is the work list. |
| §14 | Four decisions only the operator can make. |

Keywords **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used in the RFC 2119 sense.

---

## 1. Vocabulary

Alloy's access confusion is largely a vocabulary confusion: `user`, `person`, `role`, and `permission` each
name two different things in different layers. This model fixes one meaning per term.

| Term | Definition | Backing (today) |
|---|---|---|
| **Principal** | Anything that can *act*. The subject of an authorization question. | `auth.users`, action-link tokens, service clients |
| **Credential** | The artifact that proves a principal's identity for one request. | session cookie, bearer token, service-role key |
| **Identity / Person** | A real-world human *record*. Acted upon, never acting. | `persons` |
| **Subject** | Anything a principal acts upon: a person, customer, opportunity, job, document, configuration row. | domain tables |
| **Org (tenant)** | The isolation boundary. Every subject row and every membership belongs to exactly one. | `orgs`, `org_id` |
| **Membership** | A `(principal, org)` pair. Authority exists only inside a membership; there is no global authority. | `user_roles` |
| **Role** | A named, org-scoped bundle of capabilities. A role is a *label for a grant set* — nothing more. | `role_definitions` |
| **Capability (permission)** | A single named thing a principal may do. The atom of authority. | `permission_keys` + `role_permission_grants` |
| **Portal eligibility** | Admission to the operator application shell. | today `roleKeys ∩ {admin, ops}` |
| **Scope** | Which *rows* a principal may see and mutate, given that it may perform the operation at all. | `user_access_profiles` + junctions |
| **Gate** | A runtime decision point that returns allow or deny. | route/layout entry |
| **Resolver** | Code that computes a principal's authority. Not a gate. | `resolveAdminAccessCore.ts` |

**The distinction that carries the most weight in this document is resolver ≠ gate.** Phase 1's C1 showed a
route census over-reporting permission enforcement by ~30× precisely because resolving authority looks, to a
static walker, exactly like consulting it. In this model they are different objects with different rules.

---

## 2. The authority chain

One chain. Five links. Every link **MUST** be present at every decision point; a decision point that skips a
link is a defect regardless of how safe it happens to be today.

```
  credential          membership           role set            capability set        scope
      │                    │                   │                      │                │
  ┌───▼────┐          ┌────▼────┐         ┌────▼────┐           ┌─────▼─────┐     ┌────▼─────┐
  │ WHO    │─────────▶│ WHERE   │────────▶│ AS WHAT │──────────▶│ MAY DO    │────▶│ TO WHICH │
  │        │          │         │         │         │           │           │     │  ROWS    │
  └────────┘          └─────────┘         └─────────┘           └───────────┘     └──────────┘
  principal            org (tenant)        role_definitions      permission        dept / site
  authenticated        isolation           org-scoped            keys granted      dimensions

                                  SUBJECT GRAPH (persons, customers, opportunities, …)
                                  is what the last link filters. It is never an input
                                  to any earlier link. ────────────────────────────────┘
```

Three consequences, stated once and relied on throughout:

1. **Authority flows in one direction.** A subject never confers authority. Being *named on* a record grants
   nothing. (This is what makes §4 a hard rule rather than a preference.)
2. **Every link narrows.** No link may widen what an earlier link permitted. A role cannot escape its org; a
   capability cannot escape its role; scope cannot escape its capability. Any "bypass" is, by construction, a
   violation — see I-11 and its divergence C8.
3. **The chain is evaluated per request, from the credential.** Nothing is carried across requests, and no
   layer may substitute a cached conclusion for a resolved one except through the request-scoped memoization
   in §10.4.

---

## 3. Principals

### 3.1 The five classes

A principal is not always a user. Alloy already has five distinct kinds of actor; the model names them so each
gets rules instead of being handled ad hoc.

| Class | Authenticated by | Bound to org by | May hold roles? | Ceiling |
|---|---|---|---|---|
| **P1 Operator** | Supabase session cookie → `auth.users.id` | `user_roles.org_id` (§5.2) | **yes** | its granted capabilities |
| **P2 Delegated link** | single-use, expiring token (`action_links.token`) | the token row's `org_id` | no | exactly the one action the token names, on exactly the one subject it names |
| **P3 Public** | nothing — anonymous | the org resolved from the public artifact (form, booking link) | no | create-only, into a quarantined intake surface |
| **P4 Service** | infrastructure secret (service-role key) | **nothing** — see 3.3 | no | none — it is transport, not authority |
| **P5 System** | none — runs as the database | n/a | no | migrations, triggers, scheduled jobs; never serves a request |

Only **P1** participates in the full chain of §2. P2 and P3 are *capability-bearing artifacts*, not
memberships: their authority is carried by the artifact and dies with it. P4 and P5 are not authorities at all.

### 3.2 Rules for P1 (operator)

- A P1 principal **MUST** be `auth.users.id`. No other table may originate a principal identity. Phase 1 §2.1
  found three (`user_profiles.role`, `app_users.role` on either of two join columns —
  `resolveAdminAccessCore.ts:44-68`); under this model exactly one is legal.
- A P1 principal with no membership row in an org **has no authority in that org.** Not reduced authority —
  none. There is no fallback source of role (I-2).
- A P1 principal **MAY** hold memberships in multiple orgs. Each membership is evaluated independently; there
  is no cross-org inheritance and no "primary" org at the authority layer (§5.2).

### 3.3 The service-principal rule

> **A service-role client is a transport, not a principal.**

517 of 539 route files hold one (phase 1 G6). Holding it means the handler can reach any row; it says nothing
about whether the *caller* may. The model therefore requires that **every handler which uses a service-role
client resolve a P1/P2/P3 principal separately and gate on it** — and that the two never be conflated in
either code or review. A handler that authenticates nothing and uses a service-role client is a public
administrative endpoint, whatever its path says.

This is the single most load-bearing rule in the document, because it is the one the current architecture
depends on most and enforces least.

### 3.4 Rules for P2 (delegated link)

A delegated-link token **MUST** be: unguessable, expiring, single-use, bound to one org, bound to one subject,
and bound to one action. `action_links` carries `expires_at` and `consumed_at` and the consume route checks
both (`web/app/api/action/[token]/consume/route.ts:26-31`). The model adds no new mechanism — it states that
these six properties are *required*, so that a future token type cannot ship with four of them.

A P2 token **MUST NOT** be exchangeable for a session, and **MUST NOT** widen to sibling subjects.

### 3.5 Rules for P3 (public)

Public surfaces (`/api/public/forms/*`, `/api/book-v2/*`) **MUST** be create-only into an intake surface that
is quarantined until an operator (a P1 principal) acts on it. A public principal **MUST NOT** read, update, or
delete an existing canonical record, and **MUST NOT** be able to enumerate.

---

## 4. Subjects, and the identity boundary

### 4.1 Persons are subjects

`persons` is the canonical human *record* (`docs/platform/governance/glossary.md:86`). It carries no
`user_id`, no `auth_user_id`, and no FK to `auth.users`
(`supabase/migrations/20260329165048_remote_schema.sql:2431-2450`). **This is correct and the model keeps it.**

> **A person never authorizes anything.** The subject graph is an input to the *last* link of the chain and to
> no other.

Phase 1's §1 framed the missing person→user edge as a gap. The model's position is narrower and firmer: the
*absence of an implicit edge* is the right design. What is missing is not a column — it is an explicit,
directional, auditable link for the day a real human needs to act.

### 4.2 If a person must act

When the platform gains a surface where a real-world person acts on their own record — family portal, staff
self-service — the following **MUST** hold:

1. A **new principal is created** (`auth.users`). The person record is not upgraded; personhood and
   principalhood are different populations that may be linked, never merged.
2. The link is an **explicit row** — direction `principal → person`, org-scoped, with `created_by` and
   `created_at`. It is the **only** sanctioned join between the graphs.
3. The link is **never inferred**. Matching on email, phone, or name **MUST NOT** create or imply it. (Alloy
   already has a whole identity-resolution discipline for exactly this hazard — `Candidate Match`,
   `Identity-review gate`, glossary `:94,96`. Authority linkage is strictly higher-stakes than record
   matching and gets the stricter rule.)
4. The link **confers no authority by itself.** A linked principal still needs a membership, a role, and
   capabilities like any other. Being linked to a person means only that the *scope* layer may use that
   person as a scope anchor.
5. A person-linked principal **MUST NOT** be portal-eligible by default (§8).

Whether that surface ships is decision **D1** (§14). The five rules above hold regardless, which is why the
model can be canonical without D1 being answered.

---

## 5. Orgs and tenancy

### 5.1 The isolation invariant

Every subject row, every membership, every role definition, every grant, and every scope row carries `org_id`.
Every query on the authority path and every query on the data path **MUST** constrain by the org of the
resolved membership. Tenancy is the one link of the chain that is currently enforced everywhere (phase 1 §5),
and the model's only requirement is that it stay that way.

### 5.2 Multi-org principals: no "primary org"

Today a principal with memberships in several orgs is collapsed to one — admin/ops rows win, else the
lexicographically smallest `org_id` (`resolveAdminAccessCore.ts:26-37`). Roles in every other org are
discarded.

Under this model, **authority is resolved for an explicit `(principal, org)` pair.** The org **MUST** be
determined by the request (route, host, or an explicit active-org selection), not by sorting UUIDs. A
lexicographic tiebreak is a silent, unexplainable authority decision: it can grant a principal the wrong org's
authority and can hide an org the principal legitimately belongs to.

"Primary org" **MAY** survive as a *presentation* default — which org the shell opens into. It **MUST NOT**
survive as an authority input.

---

## 6. Roles

### 6.1 One vocabulary

> `role_definitions(org_id, role_key)` is the **sole** role vocabulary in the platform.

Every layer that names a role — membership rows, RLS policies, seeds, UI, tests — **MUST** name a `role_key`
that exists in `role_definitions` for that org. Concretely:

- `user_roles.role` **MUST** be constrained by foreign key to `role_definitions(org_id, role_key)`. It is
  today unconstrained text (`remote_schema.sql:2915-2920, 6617-6623`); the constraint lives in one application
  write path (`web/app/api/admin/users/[userId]/role/route.ts:27-30`) and nowhere else. Governance already
  claims this FK exists (`docs/platform/governance/roles-and-permissions.md:20`) — the model makes the claim
  true rather than deleting it.
- Any SQL that hard-codes a role literal **MUST** name a key the platform seeds. Phase 1 C10 found RLS
  authorizing `owner` (71×) and `manager` (14×), neither of which any migration ever seeds, while
  `regional_lead` and `school_director` appear in RLS zero times.

### 6.2 A role is a label for a grant set

A role **MUST NOT** carry behaviour of its own. Anything a role "means" is expressed as capabilities it is
granted. There are no special role names in application code.

The one legitimate special case is a **break-glass** role, which **MAY** shortcut capability checks provided
it (a) is a single named role, (b) is declared in exactly one place, and (c) still passes tenancy and scope.
Today `admin` and `ops` are special in at least three unrelated places — `PORTAL_ROLES`
(`resolveAdminAccessCore.ts:18`), `ALLOWED_ROLES` (`web/lib/adminAuth.ts`), and
`PORTAL_DEPARTMENT_SCOPE_BYPASS_ROLES` (`accessScope.ts:51-53`) — each with different consequences. That is
three break-glasses, not one.

### 6.3 Multi-role memberships

Multi-role is already modelled: the composite PK exists specifically to allow it
(`20260505120000_user_roles_composite_primary_key.sql:1-4`) and the resolver unions role keys into a set
(`resolveAdminAccessCore.ts:33-36`). The model requires that it also be **writable**: the assignment API
**MUST** support adding and removing an individual `(principal, org, role)` row. Today the only path deletes
every row for the pair and inserts one (`.../role/route.ts:38-41`), which makes the modelled capability
unreachable through the product.

Effective capability for a multi-role membership is the **union** of its roles' grants. Union, never
intersection — a second role must never reduce authority, or role assignment becomes non-compositional.

### 6.4 Delegation ceiling

> A principal **MUST NOT** grant authority it does not itself hold.

Two mechanical rules:

- **Subset rule.** When principal *A* assigns role *R* to principal *B*, the capability set of *R* **MUST** be
  a subset of *A*'s own capability set in that org.
- **No self-elevation.** A principal **MUST NOT** modify its own memberships, roles, or grants. Elevation
  requires a second principal.

Today neither holds: `PATCH /api/admin/users/[userId]/role` gates on `canManageUsersAndRoles`
(`canManageUsersAndRoles.ts:15-18`) and applies no ceiling and no self-assignment guard, so any holder of
`settings.users_roles` can make themselves `admin` (phase 1 G3). Whether that is delegation or escalation is
decision **D3**; that *a* ceiling must exist is not in question, because without one every permission model
collapses to `admin`.

---

## 7. Permissions

### 7.1 One catalog

> There is exactly **one** permission catalog table. A permission key exists in it or it does not exist.

Today there are three — `permission_keys`, `permissions`, `permission_definitions` — with
`role_permission_grants.permission_key` carrying **two foreign keys on the same column with different
`ON DELETE` semantics** (`remote_schema.sql:6503, 6508`), while the write API validates against the third
(`web/app/api/admin/rbac/grants/route.ts:61-67`). Every new permission must be inserted into all three by hand
or grants fail; the migrations do exactly that and say so
(`20260505120100_settings_users_roles_permission.sql:9-45`).

Consolidation to one table with one FK is the model's requirement. Which table survives is an implementation
choice; that only one survives is not.

### 7.2 One vocabulary

Alloy has three disjoint key vocabularies (phase 1 C4): the legacy `ops.*`/`fin.*` seed set, the UI grid's
`crm.*`/`settings.*`/… set, and the per-feature keys that are actually enforced. Of the grid's 20 keys, 4 are
enforced; of the ~17 enforced keys, 13 have no grid row.

> A permission key **MUST** be named in exactly one vocabulary, and **MUST** be enforced by at least one gate.

A key that nothing checks is not a permission — it is a label that misleads the operator into believing they
have configured something. The corollary is the deletion rule: **an unenforced key is removed from the
catalog, not left in the grid.**

### 7.3 The grid is a projection

> The operator-facing permission grid **MUST** be derived from the enforced set, never maintained beside it.

`PERMISSION_GRID_ROWS` is today an independent hand-maintained list (`web/lib/admin/permissionGrid.ts:12-24`).
The cost is already visible: its `workflows.read` / `workflows.write` row (`:23`) names two keys seeded into
no catalog table — while `ops.workflows.read` / `ops.workflows.write` do exist
(`remote_schema.sql:731-732`), one namespace away. Toggling that row fails the whole save with HTTP 400
(`grants/route.ts:61-67`), taking the operator's other valid selections with it.

Deriving the grid from the catalog makes that class of defect **impossible by construction** rather than
caught by review, and converts phase 1's C4 from an invisible gap into a visible, shrinking one.

### 7.4 Blanket grants are not a grant model

`seed_default_rbac()` grants `admin` *every active row* in `permission_keys` and `ops` all but two
(`remote_schema.sql:748-760`). Because that table now also holds the grid vocabulary and every feature
vocabulary, the blanket silently widens whenever any migration seeds a key.

> Seeds **MUST** enumerate the keys they grant. `SELECT * FROM <catalog>` **MUST NOT** appear in a grant seed.

### 7.5 Enforcement shape

A capability check is a **branch on the resolved capability set**:

```ts
if (!access.permissionKeys.includes(REQUIRED_KEY)) return deny(403);
```

The eight modules that already do this (phase 1 C1) — Config Layout Assist, Operational Expectations,
Communications, AI enrichment, Users & Roles, and `configuration/programs/route.ts:54-55,65` — are the
reference shape. Nothing new needs inventing; it needs generalizing.

---

## 8. Portal eligibility

### 8.1 Portal eligibility is a capability

Today: `const PORTAL_ROLES = new Set(["admin", "ops"])` (`resolveAdminAccessCore.ts:18`), consumed as a
boolean by every tier-2 gate (`adminRouteGate.ts:43-45`, `getAdminContext.ts:38-40`, `adminAuth.ts:43-45`).
The consequence is C6: the platform seeds four system roles per org
(`20260505120100_settings_users_roles_permission.sql:60-64`) and can admit two of them. A `regional_lead` is
redirected to `/unauthorized` (`web/app/adminV2/layout.tsx:23-30`) no matter what it has been granted.

> Portal eligibility **MUST** be a granted capability — one key, e.g. `portal.access` — resolved through the
> same catalog and the same grant table as every other capability. It **MUST NOT** be a hard-coded role set.

This is a one-line change in kind and a large change in consequence: a hard-coded set makes every new persona
a code change, so the product accumulates roles it cannot admit. As a capability, seeding the grant to `admin`
and `ops` reproduces today's behaviour exactly, and adding a third persona becomes configuration.

### 8.2 Portal eligibility is admission, not authority

> `portalEligible` answers *may this principal open the shell*. It **MUST NOT** be read as *may this principal
> perform this operation.*

This is the model's answer to phase 1's C1/C2 taken together: ~500 admin routes gate on portal eligibility and
17 on a capability, while canonical governance states the opposite rule
(`docs/platform/governance/roles-and-permissions.md:25`). Portal eligibility is a **coarse first gate** —
necessary, never sufficient. Every route **MUST** additionally name the capability it requires (§10.2).

### 8.3 Portals, plural

The model treats "portal" as a named surface with its own admission key, not a global boolean. The operator
portal is `portal.access` today; a future family or staff surface (§4.2, D1) gets its own key and its own
gate, and admission to one **MUST NOT** imply admission to another.

---

## 9. Scope

### 9.1 Two dimensions

Scope answers *which rows*, after capability has answered *which operations*. Two orthogonal dimensions,
each `all` or `restricted` with an explicit allow-list:

| Dimension | Restricted by | Allow-list |
|---|---|---|
| **Department** | `user_access_profiles.department_scope` | `user_department_access` |
| **Site** | `user_access_profiles.site_scope` | `user_site_access` (`locations.location_type='site'`) |

This leg is the best-built part of the current system (`20260504103000_user_access_scope_tables_v1.sql:18-30`
plus org-match triggers and site-type validation, and 28 exported enforcement helpers in
`web/lib/admin/accessScope.ts`). The model preserves its shape and fixes three properties.

### 9.2 The profile invariant

> Every membership **MUST** have exactly one access profile row, created in the same transaction as the
> membership.

Today `POST /api/admin/users` inserts into `user_roles` only (`web/app/api/admin/users/route.ts:102`) and
references no scope table at all — so *every membership created through the product since the backfill
migration has no profile row* (phase 1 G4). Scope is the one leg that is well built, and the create path
silently opts every new user out of it.

### 9.3 Absent scope is deny, not allow

Today a missing profile row means both scopes are `all`, with the resolver's own comment calling it a "legacy
transition until profiles always exist" (`resolveAdminAccessCore.ts:152-161`).

> A missing or unreadable scope row **MUST** deny. Fail-open **MUST NOT** be the default at any link of the
> chain.

§9.2 makes this cheap: once the invariant holds, denial on absence is unreachable in normal operation, and any
occurrence is a genuine integrity failure that should be loud.

### 9.4 No role bypasses a dimension

`portalAdminBypassesDepartmentScope` forces `departmentScope = "all"` for any `admin`/`ops`
(`accessScope.ts:51-53`, applied at `:56-66`). Combined with §8 — only `admin`/`ops` can reach the portal —
**every principal who can use the product bypasses department scope** (phase 1 C8). Department scope is
configurable, displayed to the operator, and inert.

> A role **MUST NOT** widen a scope dimension. Unrestricted access is expressed by setting the dimension to
> `all` on the principal's profile — explicitly, per principal, and visibly.

The desired behaviour is reachable without the bypass, and the difference is that it becomes visible in the
operator's own configuration instead of hidden in a constant.

### 9.5 Scope applies to reads and writes symmetrically

List routes filter by the allow-list; mutations re-assert scope on the target row before writing; drawer and
detail reads assert readability. `accessScope.ts` already provides all three families
(`fetchScopedPersonIdsForRestrictedAdmin`, `assertExistingJobMutableInAdminScope`,
`assertEntityDrawerRecordReadable`). The model requires symmetry: a capability that can read a row scope-
filtered **MUST NOT** be able to mutate that same row unfiltered.

---

## 10. Where authority is decided

### 10.1 One resolver, one gate family

- Exactly **one** resolver computes a principal's authority for a `(principal, org)` pair.
- Every gate is a thin, declarative wrapper over that resolver's output.
- **Resolving is not gating.** A module that resolves and returns a bundle has authorized nothing.

Today the request path has one resolver (a genuine strength) but the operator-facing *preview* of a user's
access has a second implementation with different semantics —
`resolveAdminAccessDimensionsForOrgMember` (`resolveAdminAccessCore.ts:209-292`) omits the legacy fallback and
omits the department-scope bypass, so it can disagree with runtime in both directions (phase 1 C11).

> The screen an operator uses to reason about a principal's access **MUST** be rendered from the same code
> that enforces it.

An access model the operator cannot see accurately is not a model they can operate.

### 10.2 The gate contract

Every decision point — API route, server action, page layout — **MUST** declare and evaluate all four gates,
in order, and **MUST** fail closed at each:

| # | Gate | Denial |
|---|---|---|
| **G-A** Authentication | a principal of a declared class is established | 401 |
| **G-B** Tenancy | the principal has a membership in the org the request targets | 403 |
| **G-C** Capability | the principal's capability set contains the key this route declares | 403 |
| **G-D** Scope | every row read or written is inside the principal's scope | filtered / 404 |

"Declare" is literal: the required capability **SHOULD** be a value on the route, not a condition buried in
its body, so that the set of `(route → capability)` pairs is enumerable by a build-time check rather than by
grep. Phase 1 C1 is the direct argument for this: a grep-based census over-reported enforcement 30× because
mentioning a symbol and branching on it are indistinguishable to a text search. A declared table is
mechanically checkable; a convention is not.

Routes that legitimately require no capability (health checks, public intake, webhooks) **MUST** declare that
explicitly — `capability: null` with a stated reason — so that "no gate" is an auditable assertion rather than
an omission. The 28 tier-0 routes phase 1 classified by family become a reviewed list rather than a residue.

### 10.3 Layers, and what each is for

| Layer | Role in this model |
|---|---|
| **Middleware** | Session presence and redirects for page surfaces only. Returns before `/api/*` (`web/middleware.ts:106-108`). **Not an authority layer.** |
| **Route/action gate** | **The** authority layer. G-A…G-D per §10.2. |
| **Query layer** (`accessScope.ts`) | Mechanical enforcement of G-D. |
| **RLS** | See §10.5 — decision **D4**. |

### 10.4 Caching

Authority **MAY** be memoized per request (`getAdminAccessContext.ts` uses React `cache`, and a shell context
cache for portal-eligible principals). Any cross-request cache **MUST** be keyed on `(principal, org)` and
**MUST** be invalidated by any write to membership, role, grant, or scope. A stale authority cache is
indistinguishable from an authorization bug and is far harder to find.

### 10.5 RLS

With 517 of 539 route files holding a service-role client (phase 1 G6), RLS today is neither the enforcement
layer nor a coherent backstop — and where it does apply, part of its role vocabulary is unreachable (C10),
alongside three separate SQL definitions of "is this user privileged" (C9: `has_org_role`, `is_admin`, and
`user_profiles.role` policies).

The model requires a **stated position**, because the ambiguous middle is the expensive state — every reader
must rediscover that RLS looks authoritative and is not. Either:

- **(a) RLS is a backstop.** Then it uses `role_definitions` as its vocabulary, has one privilege function,
  and its coverage is tested; or
- **(b) RLS is not an authority layer.** Then it is documented as defence-in-depth only, no new policy may be
  written as though it gates the product, and the dead `owner`/`manager` grants are removed.

This is decision **D4** (§14). The model's requirement is that one of them be true and written down.

---

## 11. Invariants

The normative core. Each is testable; §12 says how; §13 maps each to what currently violates it.

**Principals**

- **I-1** — A principal's identity originates from exactly one source. For operators, `auth.users.id`.
- **I-2** — A principal with no membership in an org has no authority in that org. No fallback role source exists.
- **I-3** — A service-role client confers no authority. Every handler using one resolves and gates a principal separately.
- **I-4** — Delegated-link tokens are unguessable, expiring, single-use, and bound to one org, one subject, and one action.

**Identity boundary**

- **I-5** — No implicit relation exists between `persons` and any principal. Where a principal represents a person, the relation is an explicit, directional, auditable link that is never inferred and confers no authority by itself.

**Tenancy**

- **I-6** — Every authority row and every subject row carries `org_id`, and every authority decision is made against one explicit org.
- **I-7** — The evaluated org is determined by the request, never by an ordering heuristic over the principal's memberships.

**Roles**

- **I-8** — `role_definitions(org_id, role_key)` is the only role vocabulary. Every layer that names a role — memberships (by FK), RLS, seeds, UI — names a key that exists there.
- **I-9** — A role carries no behaviour beyond the capabilities granted to it. At most one declared break-glass role exists, in one place.
- **I-10** — Memberships are individually addable and removable, and effective capability is the union of a membership's roles.
- **I-11** — A principal cannot grant authority it does not hold, and cannot modify its own authority.

**Permissions**

- **I-12** — Exactly one permission catalog table; `role_permission_grants.permission_key` has exactly one foreign key.
- **I-13** — Every catalog key is enforced by at least one gate; every enforced key is in the catalog. The two sets are equal.
- **I-14** — The operator permission grid is derived from the catalog, not maintained beside it.
- **I-15** — Grant seeds enumerate their keys; no seed grants "all active keys".

**Portal**

- **I-16** — Portal admission is a granted capability, not a hard-coded role set.
- **I-17** — Portal eligibility is never sufficient authority for an operation. Every route additionally declares a capability (or declares `null` with a reason).

**Scope**

- **I-18** — Every membership has exactly one access-profile row, created transactionally with it.
- **I-19** — Absent or unreadable scope denies. No link of the chain fails open.
- **I-20** — No role widens a scope dimension.
- **I-21** — Scope is enforced symmetrically on reads and writes.

**Decision points**

- **I-22** — One resolver. Operator-facing previews of access are rendered by the enforcing code.
- **I-23** — Every decision point evaluates G-A…G-D in order and fails closed at each.
- **I-24** — The `(route → required capability)` mapping is declared and enumerable without source-text search.
- **I-25** — Authority caches are keyed on `(principal, org)` and invalidated by any authority write.

---

## 12. Conformance

How each invariant is checked. Mechanical checks are preferred; where a check is a review, the model says so
rather than pretending otherwise.

| Invariant | Check | Kind |
|---|---|---|
| I-1, I-2 | No read of `user_profiles.role` / `app_users.role` on any authority path | static |
| I-3 | Every file importing a service-role client also resolves a principal; enumerated allow-list for the rest | static + reviewed list |
| I-4 | Token issuance/consumption tests: expiry, replay, cross-subject, cross-org | integration |
| I-5 | No FK or join between `persons` and `auth.users` except the declared link table; no email/phone-based principal lookup | static |
| I-6, I-7 | Every authority query filters `org_id`; no `sort()` over `org_id` on an authority path | static |
| I-8 | FK exists on `user_roles`; role literals in SQL ∩ seeded keys = role literals in SQL | schema + static |
| I-9 | Role literals in application code appear only in the declared break-glass module | static |
| I-10 | Add/remove a single role on a multi-role membership; assert union semantics | integration |
| I-11 | Attempt to grant a capability the caller lacks (deny); attempt self-elevation (deny) | integration |
| I-12 | `pg_constraint` shows one FK on `role_permission_grants.permission_key`; one catalog table exists | schema |
| I-13 | Catalog keys vs keys named in declared route capabilities — set difference is empty both ways | static |
| I-14 | Grid rows are generated from the catalog; no literal key list in UI source | static |
| I-15 | No `SELECT` over the catalog inside a grant seed | static |
| I-16 | `portal.access` resolves through the grant table; no `PORTAL_ROLES` constant | static |
| I-17 | Every route declares a capability or an explicit `null` + reason | static (from the I-24 table) |
| I-18 | Create a membership through the product; assert a profile row exists | integration |
| I-19 | Delete a profile row; assert denial, not `all` | integration |
| I-20 | An `admin` with `department_scope = restricted` sees only allowed departments | integration |
| I-21 | For each scoped entity: read filtered, mutate denied out-of-scope | integration matrix |
| I-22 | Preview and runtime resolve identically for a fixture matrix of principals | integration |
| I-23 | Per-route gate-order test at the boundary | integration |
| I-24 | Route table builds and covers every route file | build-time |
| I-25 | Write an authority row; assert the next request reflects it | integration |

Two methodological rules carried forward from phase 1, because they invalidate the obvious cheap checks:

- **Reachability is not enforcement.** A census that greps or walks imports for `permissionKeys` over-reports
  by ~30× in this codebase (C1). I-24's declared table exists so that conformance is a lookup, not a grep.
- **A passing route census proves nothing about scope.** G-C and G-D are independent; a route can gate
  capability correctly and read the whole org.

---

## 13. Divergence register

Every phase 1 finding, mapped to the invariant it violates. This is the work list for the remediation phase —
ordered by the model's own dependency order, not by severity, because several fixes are cheap only after an
earlier one lands.

| # | Finding (phase 1) | Violates | Nature |
|---|---|---|---|
| **§2.1** | Legacy fallback: `user_profiles.role` / `app_users.role` (two join columns) can make a principal admin/ops | I-1, I-2 | latent escalation path |
| **G1** | `handle_new_user()` defaults every new auth user to `ops`; its trigger is **not in version control** | I-1, I-2, I-19 | latent; needs live verification |
| **§5.2 / C-new** | Primary-org picked by lexicographic `org_id` sort | I-7 | silent authority selection |
| **C2** | `user_roles.role` has no FK to `role_definitions`; governance claims it does | I-8 | schema ↔ doc divergence |
| **C10** | RLS authorizes `owner`/`manager` (85 occurrences), never seeded; `regional_lead`/`school_director` absent from RLS | I-8 | specification defect |
| **C9** | Three SQL definitions of "privileged": `has_org_role`, `is_admin`, `user_profiles.role` policies | I-8, I-9 | three sources of truth |
| **C6** | Two of four seeded system roles cannot log in | I-16 | ships unusable personas |
| **C7** | Multi-role modelled everywhere, writable nowhere | I-10 | unreachable capability |
| **G3** | `settings.users_roles` holder can set any role, including their own, to `admin` | I-11 | no delegation ceiling (**D3**) |
| **C3** | Three permission catalogs; dual FKs with different `ON DELETE` on one column | I-12 | hand-maintained duplication |
| **C4** | Three disjoint vocabularies; 4 of 20 grid keys enforced; 13 enforced keys have no grid row | I-13 | operator cannot grant what is enforced |
| **C5** | Grid offers `workflows.read`/`.write`, seeded nowhere; `ops.workflows.*` exists one namespace away | I-13, I-14 | save fails, taking valid selections with it |
| **G5** | `seed_default_rbac()` grants `admin` every active catalog key | I-15 | unbounded blanket grant |
| **C1** | 490 of 507 "permission-gated" routes are false positives; 17 truly gate | I-17, I-24 | measurement artifact over a real gap |
| **C2** | Canonical governance states "check `permissionKeys`"; ~500 routes check `portalEligible` | I-17 | doc ↔ code divergence |
| **G2** | 6 of 88 access-context routes gate on `access.ok` alone — org-wide analytics readable by any member | I-17, I-23 | confirmed read exposure, no mutation |
| **G4** | `POST /api/admin/users` creates no access profile — every product-created membership is unscoped | I-18 | confirmed fail-open |
| **§2.4** | Missing profile row ⇒ both scopes `all` | I-19 | fail-open by design |
| **C8** | `admin`/`ops` bypass department scope — i.e. everyone who can log in | I-20 | dimension inert |
| **C11** | Second resolver drives the operator's access preview; differs from runtime in both directions | I-22 | operator cannot see true state |
| **G6** | 517 of 539 routes bypass RLS; middleware gates no `/api/*` | I-3, I-23 | the handler's own gate is the only authority (**D4**) |

**Suggested order.** I-18/I-19 (scope invariant) and I-3 (service-client rule) first — they are fail-open and
cheap. Then I-12/I-13/I-14 (one catalog, one vocabulary, derived grid), which unblocks I-16/I-17. Then
I-24's declared route table, which converts I-17 from an audit into a build check. I-1/I-2 (delete the legacy
fallback) requires a live-data check first — how many principals currently authorize only through it. I-8's FK
requires C10's remediation to land first, or the FK will reject existing rows.

---

## 14. Decisions required

Four product decisions. The model is specified so that none of them blocks it — each selects between variants
that all satisfy the invariants — but each must be answered before the corresponding remediation.

**D1 — Does a person ever become a principal?**
Does Alloy plan a surface where a real-world person (family, staff) acts on their own record? *Recommendation:*
answer "not yet", and adopt §4's rules now regardless. They cost nothing today and make the link impossible to
introduce implicitly later. Deciding "yes" adds the link table and a second portal key (§8.3); it does not
change any invariant.

**D2 — What are `regional_lead` and `school_director` for?**
Two seeded personas the product cannot admit (C6). Either grant them `portal.access` and define their
capability sets, or delete them from the seeds. *Recommendation:* grant. They exist because someone modelled a
real operational hierarchy; deleting them loses that, and under I-16 admitting them is configuration.

**D3 — What is the delegation ceiling?**
May a `settings.users_roles` holder create an `admin`? *Recommendation:* no — apply §6.4's subset rule and
self-elevation ban. The alternative is defensible only if `settings.users_roles` is understood as
"admin, differently named", in which case it should be named that way.

**D4 — Is RLS an authority layer?**
§10.5(a) backstop or (b) explicitly not. *Recommendation:* (b) for now, with (a) as a stated goal. With 96% of
the privileged surface bypassing it, calling RLS a backstop today would be a claim the platform cannot honour,
and every new policy written under that belief adds cost without adding protection.

---

## 15. Non-goals

1. **No implementation.** No code, schema, migration, or UI changes in this phase. Sequencing is §13's
   suggested order, not a plan.
2. **No product UI claim.** Nothing here asserts that Access & Identity UI exists or is complete.
3. **Not a threat model.** Token strength, webhook signature verification, session lifetime, secret handling,
   and rate limiting are out of scope. §3.4 states required token *properties*; it does not audit them.
4. **Not an RLS policy review.** §10.5 requires a position on RLS's role; evaluating individual `USING` /
   `WITH CHECK` clauses is separate work.
5. **No live-data claims.** Like phase 1, this document is file-grounded and static. G1 in particular still
   requires `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;` against the deployed
   database.
6. **Governance docs not yet updated.** `docs/platform/governance/roles-and-permissions.md` is `status:
   canonical` and states a rule the code does not follow (C2); its "Expanded reference" pointer
   (`:53` → `docs/system/roles-and-permissions.md`) resolves to a file that does not exist. Reconciling it is
   remediation work, not this phase.

---

## 16. Glossary delta

Terms this model adds or sharpens relative to `docs/platform/governance/glossary.md`:

| Term | Status | Note |
|---|---|---|
| **Principal** | new | The glossary defines Person but no actor concept. §1, §3. |
| **Subject** | sharpened | Glossary `:74` defines Subject as the operator-facing Record of Attention. This model uses it in the authorization sense — the thing acted upon. Both readings coexist; §1 fixes which applies here. |
| **Membership** | new | `(principal, org)`. Authority exists only inside one. |
| **Capability** | new | Synonym for permission key; used where "permission" would be ambiguous with the three catalog tables. |
| **Gate / Resolver** | new | The distinction C1 turned on. §1, §10.1. |
| **Portal eligibility** | sharpened | Admission to a named surface, not a privilege level. §8. |
| **Scope dimension** | new | Department and site, each `all` or `restricted`. §9. |

---

## 17. Provenance

- **Inputs:** [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (this mission, phase 1) and
  the accepted [`authority-path-inventory.md`](./authority-path-inventory.md).
- **Verified for this phase** in `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`:
  `resolveAdminAccessCore.ts` (both resolvers, read in full), `getAdminAccessContext.ts`, `adminRouteGate.ts`,
  `accessScope.ts` (export surface), `canManageUsersAndRoles.ts`, `permissionGrid.ts`,
  `operatorSessionGate.ts`, `web/app/api/admin/users/route.ts`,
  `web/app/api/admin/users/[userId]/role/route.ts`, `web/app/api/admin/rbac/grants/route.ts`,
  `web/app/api/action/[token]/consume/route.ts`, `20260504103000_user_access_scope_tables_v1.sql`,
  `20260505120100_settings_users_roles_permission.sql`, `20260505164000_permission_grid_keys.sql`, and the
  `persons` / `user_roles` DDL in `20260329165048_remote_schema.sql`.
- **Re-verified independently:** the 20 grid permission keys against every migration — 18 seeded, and
  `workflows.read` / `workflows.write` seeded nowhere (C5 confirmed).
- **Method:** static and file-grounded. No request issued, no browser used, no live database queried, no
  source file modified. The only file written by this phase is this document.
