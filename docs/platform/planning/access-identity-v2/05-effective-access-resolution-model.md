# 05 — Effective Access Resolution Model

> **Normative runtime decision model** for how Alloy computes effective access on every
> authenticated request. This is the authoritative authorization algorithm — not UI, not a
> redesign of Users / Roles / Authentication, and not an implementation plan.
>
> **Mission:** Identity & Access Platform · Access & Identity V2  
> **Brief output #:** 5 of 12 (*Effective-access resolution model*)  
> **Status:** Speculative-complete for Director synthesis. Does not change shipped code.  
> **Date:** 2026-08-03  
> **Method:** Carries accepted Mission 2 outputs; verifies the live resolver path against
> repository evidence; records new findings where the as-built path diverges from the
> normative chain.
>
> **Filename note.** This directory already contains
> [`05-command-enforcement-census.md`](./05-command-enforcement-census.md) (enforcement
> census). That artifact remains. This file is the distinct brief Output #5 named by the
> mission intake (`00-mission-intake-and-coverage.md` §3 row 5). Intake previously treated
> Output #5 as “covered” by [`02`](./02-canonical-access-identity-model.md) §9–§10; this
> document **is** the dedicated resolution model those sections pointed at.

**Evidence tags**

| Tag | Meaning |
|---|---|
| `[carried]` | Accepted from prior Mission 2 / governance artifacts; restated, not rediscovered |
| `[verified]` | Confirmed against repository evidence in this pass (path + anchor cited) |

---

## 0. How to read this

1. **§1** is the evaluation vocabulary (what each link means).
2. **§2** is the **canonical evaluation pipeline** — the single deterministic sequence every
   runtime MUST use.
3. **§3** is the **Effective Access** result object and explainability contract.
4. **§4** is conflict / lifecycle resolution.
5. **§5** is ownership boundaries.
6. **§6** is the integration matrix.
7. **§7** maps the twelve operator questions in the success criteria to sections of this doc.
8. **§8** records new findings (A3-x), invariants (I-35+), divergences (M3-x), decisions (D14+).

**Relationship to accepted outputs**

| Prior artifact | What this document carries |
|---|---|
| [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) | Gate families, fail-open ledger, route census posture |
| [`02-canonical-access-identity-model.md`](./02-canonical-access-identity-model.md) | Authority chain, principals P1–P5, I-1…I-25, G-A…G-D, scope invariants |
| [`04-authentication-model.md`](./04-authentication-model.md) | Credential / account-state placement in the pipeline (D5–D8) |
| [`05-command-enforcement-census.md`](./05-command-enforcement-census.md) | Command/action gate families (portal-heavy, permission-sparse) |
| [`docs/platform/governance/roles-and-permissions.md`](../../../governance/roles-and-permissions.md) | V1 as-built: role ≠ visibility |
| Runtime | `resolveAdminAccessCore.ts`, `getAdminAccessContext.ts`, `accessScope.ts`, `middleware.ts`, `adminAuth.ts` |

This document **does not** reopen D1–D8. Where the as-built path violates an accepted
invariant, that is recorded as **M3-x** (implementation divergence), not as a rewrite of `02`.

---

## 1. Evaluation model — the authority links

Alloy determines effective access by evaluating one chain. Every decision point MUST evaluate
every applicable link; skipping a link is a defect. `[carried]` from `02` §2.

```
Identity
   ↓
Authentication
   ↓
User Membership
   ↓
Organization
   ↓
Role Assignment
   ↓
Permission Grants
   ↓
Capability Grants
   ↓
Access Profiles
   ↓
Scope Resolution
   ↓
Relationship Scope
   ↓
Field Policies          ← subject/layout interaction; NOT an authority link (see §1.12)
   ↓
Command Authorization
   ↓
Surface Visibility
   ↓
Runtime Decision
   ↓
Explanation
```

### 1.1 Identity

**Question:** Who is the actor?

| Class | Origin | Holds roles? | Ceiling |
|---|---|---|---|
| **P1 Operator** | `auth.users.id` via session | yes | granted capabilities ∩ scope |
| **P2 Delegated link** | single-use token (`action_links`) | no | exactly one named action on one subject |
| **P3 Public** | anonymous + public artifact | no | create-only into quarantined intake |
| **P4 Service** | service-role key | no | **none** — transport only |
| **P5 System** | DB/migrations/jobs | no | never serves a request |

`[carried]` `02` §3.1–§3.5 · I-1, I-3, I-4.

**Normative:** A person (`persons` row) is a **subject**, never a principal. Being named on a
record confers no authority. `[carried]` `02` §4.1 · I-5.

### 1.2 Authentication

**Question:** Is the credential currently valid for this request?

For P1: a live Supabase session establishing `auth.users.id`. `[verified]`
`web/lib/admin/cachedAuthSession.ts` (JWT claims then `getUser()`); used by
`resolveAdminAccessCore`.

**Target (not yet a single runtime gate):** account state MUST be `active` for the evaluated
`(auth_user_id, org_id)` on **every** authenticated request — not only at sign-in.
`[carried]` `04` §3.2 · D5/D6.

**As-built gap:** middleware refreshes session for page surfaces but does **not** session-gate
`/api/*`. `[verified]` `web/middleware.ts` + `operatorSessionGate.ts` — `/api/*` falls through
after `getUser()`; handlers must 401. Recorded as **M3-1**.

### 1.3 User Membership

**Question:** Does this principal hold a membership that can authorize anything?

P1 membership storage today: `user_roles(user_id, org_id, role)`. `[carried]` `01`, `02` §6.

**Normative:** No membership in the evaluated org ⇒ **no authority** in that org (not reduced
authority). `[carried]` I-2.

**As-built divergence:** if `user_roles` is empty, `resolveAdminAccessCore` falls back to
`user_profiles.role` / `app_users` as a legacy admin/ops path. `[verified]`
`resolveAdminAccessCore.ts` legacy branch. Violates I-1/I-2 when that path alone authorizes.
Recorded as **M3-2** (was C / §2.1 in inventory).

### 1.4 Organization

**Question:** Which tenant is this decision for?

Every authority decision is against **one explicit org**. `[carried]` I-6, I-7.

**Normative:** The evaluated org is determined by the **request** (header, route context, or
explicit org switcher), never by sorting memberships. `[carried]` I-7 · `02` §5.2.

**As-built divergence:** primary org is chosen by lexicographic `org_id` among admin/ops
memberships (else among all). `[verified]` `chooseOrgAndRoleKeysFromMembershipRows` in
`resolveAdminAccessCore.ts`. Recorded as **M3-3**.

### 1.5 Role Assignment

**Question:** As what role set does the principal act in this org?

**Normative:**

- Vocabulary: `role_definitions(org_id, role_key)` only. `[carried]` I-8.
- A role is a **label for a grant set**, not a behaviour switch. `[carried]` I-9 · `02` §6.2.
- Effective capability from roles is the **union** of assigned roles. `[carried]` I-10.
- Roles are granted only via membership — never direct user→permission. `[carried]`
  `cap_access_roles` ad1 / rp1; `roles-and-permissions.md`.

**As-built:** `roleKeys` = sorted `user_roles.role` for the chosen org. `[verified]`
`ResolvedAdminAccessCore.roleKeys`. Multi-role is modelled in types but not product-writable
everywhere (**M3-4** / prior C7).

### 1.6 Permission Grants

**Question:** Which permission keys does the role set grant?

Storage: `role_permission_grants(org_id, role_key, permission_key, allowed)`. `[carried]` `01` §1.

**Normative:** One catalog, one FK, grid derived from catalog. `[carried]` I-12…I-15.

**As-built:** `permissionKeys` = union of grants where `allowed = true`. Grant query error ⇒
empty set (fail-closed for permission checks). `[verified]` `resolveAdminAccessCore.ts`.

### 1.7 Capability Grants

**Question:** Which operations may this principal attempt?

In this model, a **capability** is a permission key (or a declared null capability with reason)
that a gate requires. Portal admission is a capability concern, not a second identity system.
`[carried]` I-16, I-17 · `02` §8.

**As-built portal gate:** `portalEligible = roleKeys ∩ {admin, ops}`. `[verified]`
`resolveAdminAccessCore.ts`. Custom roles with grants but without `admin`/`ops` are not
portal-eligible — this is the current coarse shell gate (**M3-5** / prior C6 for
`regional_lead` / `school_director` usability).

**Normative target:** portal admission is a granted key (e.g. `portal.access`), not a hard-coded
role set. `[carried]` I-16.

### 1.8 Access Profiles

**Question:** What visibility profile is attached to this membership?

Storage: `user_access_profiles` + `user_department_access` / `user_site_access`. `[carried]`
`02` §9.1 · migration `20260504103000_user_access_scope_tables_v1.sql`.

**Normative:** Exactly one profile row per membership, created in the same transaction as the
membership. `[carried]` I-18.

**As-built divergence:** missing profile ⇒ both scopes treated as `all` (“legacy transition”).
`[verified]` `resolveAdminAccessCore.ts` profile absence branch; `roles-and-permissions.md`
“Missing profile: legacy default `all`”. Violates I-19. **M3-6** (prior G4/§2.4).

### 1.9 Scope Resolution (organizational)

**Question:** Which departments and sites may this principal see/mutate?

| Dimension | Profile field | Allow-list |
|---|---|---|
| Department | `department_scope` ∈ `all` \| `restricted` | `user_department_access` |
| Site | `site_scope` ∈ `all` \| `restricted` | `user_site_access` (`location_type='site'`) |

`[carried]` `02` §9.1.

**Normative rules**

- Absent/unreadable scope **denies**. `[carried]` I-19.
- No role widens a dimension. `[carried]` I-20.
- Scope applies symmetrically to reads and writes. `[carried]` I-21.
- Effective visibility = org ∩ department ∩ site at the query/gate layer. `[verified]`
  `accessScope.ts` header contract.

**As-built divergence:** `portalAdminBypassesDepartmentScope` forces department `all` for
`admin`/`ops` at selected call sites (`effectiveDepartmentScopeDimensions`). `[verified]`
`accessScope.ts`. Violates I-20. **M3-7** (prior C8).

### 1.10 Relationship Scope

**Question:** Given org ∩ dept ∩ site, which **subjects** (persons, children, households,
opportunities) are in play because of relationship edges?

**Normative definition (V2):** Relationship scope is an additional filter over the subject graph
after organizational scope. It answers “why is this child visible / why isn’t this sibling?”
without conferring authority (subjects never authorize). `[carried]` direction from `02` §2
consequence 1 and mission integrity RERUN relationship-scope primitive.

**Evaluation order**

1. Organizational scope (§1.9) first — if the hosting record is out of dept/site scope, stop.
2. Relationship scope then includes subjects reachable by declared relationship edges the
   principal is allowed to traverse (e.g. household membership, guardian↔child, authorized
   pickup) within that org.
3. Relationship scope **MUST NOT** widen org or organizational scope. `[carried]` chain
   narrowing rule `02` §2.

**As-built today:** organizational record readability is enforced by
`assertEntityDrawerRecordReadable` and related helpers; relationship-aware visibility for
portal/family principals is **not** a single named resolver on the admin path. `[verified]`
`accessScope.ts` entity switch; field/relationship UI is separate. Gap recorded as **A3-1** /
target invariant **I-35**.

### 1.11 Field Policies

**Question:** How may this principal interact with a field on a visible subject?

Field policies answer **interaction** (required / optional / read-only / hidden) for a layout
or stage — they are **not** a substitute for G-A…G-D. `[verified]`
`resolveEffectiveFieldBehavior.ts` resolves placement → definition → preset; it does not
consume `AdminAccessContext`.

**Normative placement in the pipeline**

1. Runtime Decision has already allowed the surface + subject.
2. Field policy then projects visibility/editability for that subject’s fields.
3. A field policy **MUST NOT** grant access to a subject the scope layer denied.
4. A field marked editable still requires the capability gate on the mutating command.

Recorded as **I-36**.

### 1.12 Command Authorization

**Question:** May this principal invoke this command / action / mutation?

**Normative:** After G-A…G-C, the command’s declared required capability MUST be ∈
`permissionKeys` (or the command declares `capability: null` with reason). Scope (G-D) is
re-asserted on every target row. `[carried]` I-17, I-23, I-24 · `02` §10.2.

**As-built (actions):** `POST /api/admin/actions/execute` uses `requireAdminOrOps` (light
portal) + `getAdminContextCached` + `getAdminAccessContextCached`, then optional record-scope
assert when scope restricts — **no `permissionKeys` branch in the executor**. `[verified]`
`execute/route.ts`, `executeAdminAction.ts`, census `05-command-enforcement-census.md`.
**M3-8**.

### 1.13 Surface Visibility

**Question:** Which pages, nav items, Work Units, Focus Panel cards, Settings sections appear?

Surface visibility is a **projection** of Effective Access, not a separate authority store.

| Surface class | Visibility input |
|---|---|
| Operator shell / adminV2 | `portalEligible` (as-built) → target: portal capability |
| Settings sections | required permission keys (e.g. `settings.users_roles`) |
| Work Unit / queue | org membership + dept/site scope over queue rows |
| Focus Panel cards | layout composition ∩ subject readability (scope); card Linked/Visible is layout, not RBAC |
| BOS / command starters | command authorization + process bindings |
| Portal (family) | portal capability + relationship scope |

`[carried]` layout visibility doctrine for Focus Panel cards is orthogonal (`focusPanelCardVisibility.ts`);
it MUST NOT be mistaken for authorization. **I-37**.

### 1.14 Runtime Decision

**Question:** Allow, filter, or deny — and with what HTTP/UX semantics?

| Outcome | When | Typical signal |
|---|---|---|
| **401** | G-A fails (no principal) | unauthenticated |
| **403** | G-B/G-C fails (no membership / missing capability / not portal-eligible where required) | forbidden |
| **404** | G-D fails on a specific row (prefer non-enumeration) | not found / filtered |
| **Empty set** | G-D filters a list to zero rows | empty UI, not an error |
| **Allow** | All applicable gates pass | proceed |

`[carried]` `02` §10.2 denial table; `[verified]` out-of-scope drawer/actions commonly 404 via
`assert*` helpers.

---

## 2. Canonical evaluation pipeline

This is the **one** deterministic sequence. Every runtime, API, Business Process gate, BOS
command, Portal request, Current Work surface, and Settings page MUST either run this sequence
or call a shared resolver that does.

### 2.1 Pipeline (normative)

```
 1. Authenticate identity                          → principal_id, principal_class
 2. Resolve account / credential state             → must be active for (principal, org)* 
 3. Resolve request organization                   → org_id (explicit; never lexicographic)
 4. Resolve organization membership                → membership | DENY
 5. Resolve assigned roles                         → roleKeys[]
 6. Resolve permission grants                      → permissionKeys[]  (union across roles)
 7. Resolve capability / portal admission          → portalEligible | required keys
 8. Resolve access profile                         → departmentScope, siteScope | DENY if absent*
 9. Resolve organizational allow-lists             → allowedDepartmentIds, allowedSiteLocationIds
10. Resolve relationship scope (when subject graph)→ allowedSubjectIds | edge constraints
11. Resolve field policies (when rendering/editing)→ per-field interaction
12. Resolve command authorization (when mutating)  → required capability ∈ permissionKeys
13. Resolve surface visibility (when navigating)   → show | hide projection
14. Produce Effective Access                       → §3 object
15. Explain decision                               → §3.2 explanation
```

\* Steps marked with target semantics that currently diverge are listed in §8 (M3-x). The
**normative** pipeline uses deny-by-default for missing profile and request-scoped org selection
(I-7, I-19). As-built behaviour is not the model.

`[carried]` gate order G-A…G-D = steps 1, 4, 6–7, 8–10. `[carried]` I-23.

### 2.2 As-built pipeline (verified — do not pretend these are the same)

```
HTTP request
  → middleware: session refresh; page-only operator redirect (not /api/*)     [verified]
  → handler:
       getCachedAuthUserId()                         → 401 if none
       resolveAdminAccessCore():
         user_roles → choose org (lexicographic) → roleKeys
         OR legacy user_profiles/app_users
         portalEligible = admin|ops
         permissionKeys from role_permission_grants
         profile → scopes (missing ⇒ all)            [fail-open]
       then OPTIONAL gates:
         portalEligible / requireAdmin(OrOps)
         permissionKeys (rare)
         accessScope helpers (when called)
```

`[verified]` explorer pass over `getAdminAccessContext.ts`, `resolveAdminAccessCore.ts`,
`accessScope.ts`, `adminAuth.ts`, `middleware.ts`.

**Resolving is not authorizing.** `[carried]` `02` §10.1. A route that only calls
`getAdminAccessContextCached` and checks `access.ok` has performed G-A/G-B-ish resolution, not
G-C.

### 2.3 Single resolver rule

> Exactly one function computes Effective Access for `(principal_id, org_id)`.
> Every gate is a thin wrapper over its output.
> Operator previews MUST call that same function.

`[carried]` I-22.

**As-built divergence:** settings preview uses
`resolveAdminAccessDimensionsForOrgMember` (no legacy fallback, no dept bypass), while request
runtime uses `resolveAdminAccessCore` (+ call-site bypass). `[verified]`
`resolveAdminAccessCore.ts`. **M3-9** (prior C11).

### 2.4 Caching

Authority MAY be memoized per request. Cross-request caches MUST be keyed on
`(principal_id, org_id)` and invalidated by membership, role, grant, profile, or allow-list
writes. `[carried]` I-25 · `[verified]` React `cache` + shell TTL cache written only for
portal-eligible bundles in `getAdminAccessContext.ts`.

---

## 3. Effective Access result & explainability

### 3.1 Result object (normative)

Every authorization decision produces (or can produce) an **Effective Access** record:

```text
EffectiveAccess {
  principal_id
  principal_class          # P1…P5
  org_id
  account_state            # active | suspended | …  (target; see D5)
  membership_present       # boolean
  role_keys[]              # contributing roles
  permission_keys[]        # union of grants
  portal_eligible          # boolean (or portal capability present)
  department_scope         # all | restricted
  site_scope               # all | restricted
  allowed_department_ids[] | null
  allowed_site_location_ids[] | null
  relationship_scope       # descriptor | "n/a"
  decision                 # allow | deny | filter
  denial_gate              # G-A | G-B | G-C | G-D | null
  explanation              # §3.2
}
```

### 3.2 Explanation contract

Every grant or denial MUST be explainable in operator language without reading source.

| Slot | Content |
|---|---|
| **Outcome** | Allowed / Denied / Filtered |
| **Gate** | Which of G-A…G-D decided |
| **Roles that contributed** | `role_keys` that supplied the winning permission (union; list all contributors) |
| **Capability** | Required key vs granted keys (match / miss) |
| **Scope restriction** | Which dimension restricted; allow-list miss vs `all` |
| **Policy / relationship** | Which relationship edge included/excluded a subject; which field policy hid a field |
| **Inheritance** | If role inheritance exists (V2 target): show parent contribution vs own grants separately |
| **Temporary grants** | If a time-bounded grant exists: show `valid_from` / `valid_to` and whether now ∈ window |
| **Conflicts** | Which rule won (§4) |

**I-38** — An Effective Access explanation MUST be generable from the resolver output alone
(no second semantic model).

**As-built:** Effective Access UI is planned/stubbed; access-scope GET returns scope dims from
the **preview** resolver, not a unified explanation API. `[verified]` census +
`accessPresentationContracts` planned stub noted in explorer pass. **A3-2**.

### 3.3 Example explanations (normative templates)

**Why can they see this page?**  
“Authenticated as P1 → membership in Org X → roles `{ops}` → portal admission granted →
Settings → Users & Roles requires `settings.users_roles` or `admin` → granted via role `admin`.”

**Why can’t they?**  
“Denied at G-C: required `reports.read`; roles `{school_director}` grant neither `reports.read`
nor portal-bypass.”

**Why can they run this command?**  
“G-A…G-C passed; command `assignment.promote_proposed` requires capability K; K ∈ permission
keys from role `ops`; target row passed G-D site allow-list.”

**Why is this child visible / sibling not?**  
“Opportunity in allowed site; child A on household edge included by relationship scope; child B
belongs to another household outside relationship scope (org scope would have allowed the
campus, relationship scope excluded the subject).”

---

## 4. Conflict & lifecycle resolution

Deterministic rules. First matching rule wins; no silent “most permissive” heuristic unless
explicitly stated.

| Situation | Resolution |
|---|---|
| **Multiple roles** | Union permission keys (I-10). Scope is **not** unioned from roles — scope comes only from the access profile (I-20). |
| **Multiple organizations** | Evaluate exactly one `org_id` per request (I-7). No cross-org inheritance. |
| **Multiple access profiles** | Illegal. At most one profile per membership (I-18). If duplicates exist, deny and signal integrity failure. |
| **Role removed** | Next resolution omits its grants. Cache MUST invalidate (I-25). |
| **Role disabled** (`is_active=false`) | Role contributes **no** grants while disabled. Membership row may remain for audit; effective capability ignores it. **I-39**. |
| **Invitation pending** | Account state ≠ `active` → deny at authentication/state gate (`04` §3.2). |
| **Account suspended** | Deny at state gate for that org; existing sessions MUST fail on next request (`04` §3.2). |
| **Credential revoked / deactivated** | No valid P1 principal → G-A deny. D6 governs last-org deactivation. `[carried]` |
| **Expired access / temporary grant** | Grant outside validity window does not contribute to union. Explanation shows expiry. **I-40** (target; no first-class temporary grant table verified in as-built admin resolver — **A3-3**). |
| **Relationship changes** | Recompute relationship scope on read; no sticky subject allow-list across requests. |
| **Conflicting grants** | `allowed=true` wins over absence; an explicit deny row (if introduced) wins over allow for the same key — monotonic allow-only is today’s model (`allowed` boolean). Do not invent subtractive inheritance here (`cap_access_roles` V2: own grants add only). |
| **Missing scope profile** | **Deny** (I-19). As-built fail-open is M3-6, not normative. |
| **Missing capability** | Deny at G-C (403). |
| **Unknown organization** | Deny at G-B (403). |
| **Conflicting preview vs runtime** | Forbidden. Preview MUST use the enforcing resolver (I-22). M3-9 until closed. |

---

## 5. Runtime ownership

| Concern | Owner layer | Notes |
|---|---|---|
| **Authentication** | Auth platform / session (`cachedAuthSession`, Supabase Auth) | Establishes principal_id only |
| **Account state** | Auth + access resolver (target) | `04` §3.2 — checked every request |
| **Authorization (G-A…G-C)** | **Route/action gate** over one resolver | `02` §10.3 — middleware is NOT an authority layer |
| **Scope (G-D organizational)** | `accessScope` helpers + resolver dims | Query/filter + mutate re-assert |
| **Relationship scope** | Access resolver + relationship read models | Subject-graph filter; not RBAC |
| **Field policy** | Fields / layout runtime | After subject is authorized |
| **Navigation / surface visibility** | Shell + Work Unit / Focus Panel composition | Projection of Effective Access + layout |
| **Command authorization** | Actions / Command Runtime gates | Must declare capability (I-24) |
| **API authorization** | Same gate family on every handler | Service-role ≠ authority (I-3) |
| **RLS** | Defence-in-depth pending **D4** | Not the product authority layer while service-role dominates |
| **Audit** | Append-only authority change log (V2 target) | Mutations to roles/grants/membership/scope |
| **BOS authorization** | Command Runtime + process bindings | Same Effective Access; no parallel BOS ACL |
| **Portal authorization** | Portal capability + relationship scope | Admission ≠ operation authority (I-17) |
| **Surface filtering** | Presentation / queue loaders consuming scope | Must call shared scope helpers |

`[carried]` `02` §10.3–§10.5 · `[verified]` middleware non-gating of `/api/*`.

---

## 6. Integration matrix

How Effective Access plugs into platform surfaces. “Uses resolver” means MUST call the single
Effective Access function (or a thin wrapper).

| System | Integration |
|---|---|
| **Users** | Membership + profile writes invalidate cache; create path MUST create profile (I-18) |
| **Roles** | Grant changes recompute `permissionKeys`; preview uses same resolver |
| **Authentication** | Supplies principal_id + account state into step 1–2 |
| **Business Processes** | Stage/command bindings declare capabilities; execution runs §2 steps 12+ |
| **Current Work** | Queue row visibility = G-D over work-unit entities |
| **Focus Panel** | Subject open requires record readability; card Linked/Visible is layout-only (I-37) |
| **Actions Runtime** | Every execute path: portal/capability + scope re-assert (close M3-8) |
| **Configuration Runtime** | Settings sections gated by permission keys; config writes audited |
| **Communications** | Send/read gated by capability; recipient subjects filtered by scope |
| **Processing** | Case read/mutate under org + scope; no service-role-as-principal |
| **Operational Intelligence** | Analytics reads require reports capability (not `access.ok` alone) |
| **BOS** | Commands resolve through Command Runtime with server-side actor overwrite |
| **Portal** | Separate principal class / capability; relationship scope for family subjects |
| **Search** | Hits filtered by org ∩ scope before return |
| **Notifications** | Delivery targets must remain in recipient’s Effective Access |
| **Relationships** | Edges feed relationship scope; never grant roles |
| **Entity Model** | `org_id` on every authority and subject row (I-6); persons remain subjects |

---

## 7. Success criteria — question index

| Operator question | Answer location |
|---|---|
| Why can this user see this page? | §1.13, §2.1 steps 7+13, §3.3 |
| Why can’t they? | §1.14, §3.2 denial_gate, §4 |
| Why can they run this command? | §1.12, §2.1 step 12, §6 Actions/BOS |
| Why can’t they? | G-C miss or G-D on target — §1.12, §1.14 |
| Why can they edit this field? | Subject allowed (§1.9–1.10) + capability on mutate + field policy editable (§1.11) |
| Why is this hidden? | Surface projection (§1.13) or field policy hide (§1.11) or G-D filter |
| Why is this child visible? | Org scope + relationship scope include (§1.10) |
| Why isn’t this sibling visible? | Relationship scope exclusion (§1.10, §3.3) |
| Which role granted access? | `role_keys` + grant contribution in explanation (§3.2) |
| Which scope restricted it? | department/site/relationship slots (§3.1–3.2) |
| Which policy decided the outcome? | `denial_gate` + field/relationship policy ids (§3.2) |
| How can runtime explain to an operator? | §3 entire; I-38 |

If a question still requires reading handler source, the implementation has not yet conformed to
this model (see M3-x) — the **specification** answer is still the table above.

---

## 8. New findings, invariants, divergences, decisions

### 8.1 Findings (A3-x)

| ID | Finding | Evidence |
|---|---|---|
| **A3-1** | Relationship scope is required for child/sibling explainability but is not a named stage in today’s admin resolver. | `accessScope.ts` entity readability vs absence of relationship-scope resolver on admin path |
| **A3-2** | No unified Effective Access explanation API; operator preview ≠ runtime resolver. | Preview `resolveAdminAccessDimensionsForOrgMember`; planned presentation stub |
| **A3-3** | Temporary / expiring capability grants are not represented in `resolveAdminAccessCore`. | Grant query has no validity window fields in resolver |
| **A3-4** | Field “effective” behaviour is a homonym — layout/requirement effective dating, not access. | `resolveEffectiveFieldBehavior.ts` |
| **A3-5** | Brief Output #5 was marked covered by `02` §9–§10; those sections define gates/scope but not the full explainability + conflict + integration matrix required by the refreshed assignment. | `00-mission-intake-and-coverage.md` §3 row 5 vs this assignment success criteria |

### 8.2 New invariants (I-35+)

| ID | Invariant |
|---|---|
| **I-35** | When a decision involves subjects in a household/family graph, Effective Access MUST compute relationship scope after organizational scope and MUST explain inclusion/exclusion per subject. |
| **I-36** | Field policies NEVER grant subject access; they only project interaction on already-authorized subjects. |
| **I-37** | Presentation composition (e.g. Focus Panel Linked/Visible) is not an authorization layer and MUST NOT be treated as one in explanations. |
| **I-38** | Every authorization decision MUST be explainable from the Effective Access result object alone. |
| **I-39** | Disabled roles contribute no grants. |
| **I-40** | Time-bounded grants contribute only when the decision timestamp is inside their validity window; explanations MUST surface expiry. |

(I-1…I-25 remain as defined in `02` §11.)

### 8.3 Implementation divergences (M3-x)

Relative to this normative model (and accepted I-* where noted):

| ID | Divergence | Normative reference |
|---|---|---|
| **M3-1** | `/api/*` not session-gated at middleware | §1.2, G-A |
| **M3-2** | Legacy `user_profiles` / `app_users` role fallback | I-1, I-2 |
| **M3-3** | Lexicographic primary-org selection | I-7 |
| **M3-4** | Multi-role union modelled; product write path incomplete | I-10 |
| **M3-5** | Portal admission hard-coded to `admin`/`ops` | I-16 |
| **M3-6** | Missing access profile ⇒ scopes `all` | I-19 |
| **M3-7** | `admin`/`ops` department scope bypass | I-20 |
| **M3-8** | Actions execute lacks permissionKeys capability gate | I-17, I-23 |
| **M3-9** | Preview resolver ≠ runtime resolver | I-22 |

### 8.4 New product decisions (D14+)

D1–D8 remain owned by `02` / `04`. New decisions opened by this resolution model:

**D14 — Is relationship scope in V1 Effective Access or a V2 portal/family slice?**  
Recommendation: specify now (this document); implement for admin family graphs when portal
principals ship, and reuse the same primitive for operator “why is this child visible?”.

**D15 — Explicit deny grants vs allow-only union?**  
Recommendation: stay allow-only + role disable for V2; do not add deny-rows until audit UX
exists (avoids non-monotonic reasoning).

**D16 — Should command authorization reuse permissionKeys before or after scope?**  
Recommendation: **capability then scope** (G-C before G-D), matching `02` §10.2 — never scope
as a substitute for a missing capability check (closes M3-8).

**D17 — Effective Access explanation storage?**  
Recommendation: compute on demand from resolver output; persist only on audited denials /
break-glass, not every allow.

---

## 9. Conformance hooks (for later implementation — not this assignment)

Mechanical checks that would prove this model (do not implement here):

| Check | Proves |
|---|---|
| Single exported `resolveEffectiveAccess(principal, org, requestCtx)` used by runtime + preview | I-22, M3-9 |
| Missing profile ⇒ deny in that function | I-19, M3-6 |
| Route table `(route → capability)` build-time | I-24 |
| Actions execute asserts capability key | M3-8, D16 |
| Explanation golden fixtures for grant/deny/filter | I-38 |
| Relationship scope fixtures: child in / sibling out | I-35 |

---

## 10. Provenance

| Kind | Sources |
|---|---|
| Carried | `02-canonical-access-identity-model.md` §2–§11; `04-authentication-model.md` §3; `01-existing-state-inventory.md`; `05-command-enforcement-census.md`; `roles-and-permissions.md`; `cap_access_roles-v2-proposal.md` (rp1/ad1) |
| Verified this pass | `web/lib/admin/resolveAdminAccessCore.ts`; `getAdminAccessContext.ts`; `accessScope.ts`; `adminAuth.ts`; `cachedAuthSession.ts`; `middleware.ts` / `operatorSessionGate.ts`; `executeAdminAction` / actions `execute/route.ts`; `resolveEffectiveFieldBehavior.ts` |
| Deliberately not redesigned | Users, Roles, Authentication product shapes (D1–D8 stand) |

---

*End of Output #5 — Effective Access Resolution Model.*
