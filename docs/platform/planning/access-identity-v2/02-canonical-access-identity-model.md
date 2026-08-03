# 02 — Canonical access & identity model (Person ↔ user ↔ role ↔ scope)

> **Mission 2 refresh.** The accepted model is reused as input, not re-derived. This pass states the
> **Person ↔ user ↔ role ↔ scope** model normatively (§1–§6), then re-anchors the accepted invariants
> to the code as it stands today (§7) and records what this re-anchoring newly found (§8).
>
> Prior artifacts, unchanged and still authoritative for their own dates: the frozen certification copy at
> `docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md`
> (mission `msn_e9133cdade883793d2`, 2026-07-30, assignment `asg_9c1635a5beb5e0`, contentHash
> `a48a454dc1a5a25a537a345999d982dc`). That QA path is runtime certification evidence and is **not** modified
> by this pass (`PRODUCT-SOURCE.md`).
>
> The as-built state is [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (Mission 2 pass,
> 2026-08-03). Read it first; this document does not restate its evidence, it cites it.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Person ↔ user ↔ role ↔ scope model* · assignment `asg_7a47782c7dc1c9`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `bdcf55908`
**Date** 2026-08-03
**Status** Proposed — specification only. No code, schema, or migration is changed by this phase.
**Method** static, file-grounded. Every claim marked **[verified]** was read at the cited `path:line` in this
pass. Claims carried from the accepted model without re-derivation are marked **[carried]**.

Keywords **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used in the RFC 2119 sense.

---

## 0. Headline — the chain in the title is not a chain

The accepted model specified principals, subjects, orgs, roles, permissions, portal eligibility and scope
across §3–§9. It was right, and this pass does not overturn it. But it left the phrase this phase is named
for — *Person ↔ user ↔ role ↔ scope* — implicitly linear, and **the schema is not linear**:

```
  persons ─────✗ no edge (§3) ─────┐
  (subject graph)                  │   E1 does not exist. It MUST NOT be
                                   │   inferred into existence (I-5).
                                   ┆
  auth.users ──E2──▶ (user, org) membership ──┬──E3a──▶ role_keys ──▶ capability set   "MAY DO WHAT"
  (principal)         user_roles              │         role_definitions
                                              │         role_permission_grants
                                              │
                                              └──E3b──▶ access profile ──▶ scope dims  "TO WHICH ROWS"
                                                        user_access_profiles
                                                        user_department_access
                                                        user_site_access
```

**Role and scope are siblings, not parents and children.** Both hang off the same `(user, org)` membership pair
and neither is an input to the other. `user_access_profiles` is keyed on `(user_id, org_id)` and carries no
`role` column at all (`20260504103000_user_access_scope_tables_v1.sql:18-30`, unique at `:50`) **[verified]**.

Three consequences, and they carry most of §7's weight:

1. **The two branches compose by intersection at the gate, never by precedence.** Capability answers *which
   operations*; scope answers *which rows*. A gate needs both, and neither can substitute for the other.
2. **A role writing into the scope branch is a category error, not merely a permissive setting.** That is
   exactly what `portalAdminBypassesDepartmentScope` does (`web/lib/admin/accessScope.ts:45,51-53`, forced to
   `"all"` at `:60-64`) **[verified]** — the accepted model's C8. This pass restates it as I-27, generalized,
   because the converse (scope widening capability) is equally forbidden and was never stated.
3. **"Person ↔ user" is a leg to design, not a leg to audit** **[carried]** — `01…:1`. E1 has no
   implementation to be wrong about. Every other edge does.

### What moved since the accepted model

| Accepted position | Status now | Where |
|---|---|---|
| I-12 — one catalog, one FK on `permission_key` | **satisfied** by Phase 0 | §6.1 |
| I-11 — no self-elevation | **half satisfied** — self-ban shipped, ceiling open | §7, D3 |
| I-15 — no blanket grants | **violated more broadly than recorded** | §6.2 |
| C11 — "a second resolver" | **there are three** | §8, M2-5 |
| C10 — `owner`/`manager` are an RLS-only defect | **the vocabulary has leaked into application code** | §8, M2-6 |
| §6.2 — "three break-glasses" | **at least 13 authority-deciding role literals** | §8, M2-7 |
| §6.1 — `role_definitions` is the sole role vocabulary | **there are four vocabularies, one of them a CHECK constraint** | §4.2 |

Nine divergences are newly recorded by this pass as **M2-1 … M2-9** (§8). Two new invariants (**I-26**,
**I-27**) and two new decisions (**D9**, **D10**) follow from them.

---

## 1. The model in one page

### 1.1 The four nouns

| Noun | Definition | Backing table | Cardinality | Written by | Confers |
|---|---|---|---|---|---|
| **Person** | A real-world human *record*. Acted upon, never acting. | `persons` (`remote_schema.sql:2431-2450`) | many per org | operators, intake forms, imports | **nothing** |
| **User (principal)** | Anything that can *act*; the subject of an authorization question. | `auth.users` | one per credential-holder | invite / auth provider | nothing by itself — see §4.1 |
| **Role** | A named, org-scoped label for a grant set. | `role_definitions(org_id, role_key)` (`:2701-2711`, unique `:3814-3815`) | 4 seeded per org | DB trigger; RBAC API | its granted capabilities |
| **Scope** | Which *rows* a principal may see and mutate, per dimension. | `user_access_profiles` + two junctions | ≤1 profile per `(user, org)` | access-scope API | narrowing only |

All four are verified at the cited lines in this pass **[verified]**.

### 1.2 The three edges

| Edge | Relation | Implementation today | Verdict |
|---|---|---|---|
| **E1** | person ↔ user | **none.** `persons` carries no `user_id`, no `auth_user_id`, no FK to `auth.users` (`remote_schema.sql:2431-2450`) | **correct as absent** (§3) |
| **E2** | user ↔ org (membership) | `user_roles(user_id, org_id, role)`, composite PK (`20260505120000_…:1-4`) | present; **unconstrained on `role`** (§4) |
| **E3a** | membership → capability | `role_definitions` → `role_permission_grants` → resolved key set | present; **does not honour `is_active`** (§4.4) |
| **E3b** | membership → scope | `user_access_profiles(user_id, org_id)` → junctions | present; **fail-open on absence, bypassed by role** (§5) |

### 1.3 The one authority chain, restated

The accepted model's five-link chain **[carried]** (`02…:60-89` in the frozen copy) is unchanged and remains
normative. This document adds only that its fourth and fifth links are **parallel branches off the third**,
not a sequence — and that every gate therefore owes both (§7, I-23).

---

## 2. What each noun may and may not do

Normative. Each rule is testable; §7 says which currently hold.

**Person**

- A person **MUST NOT** appear as an input to any link of the authority chain except the last (scope anchoring).
- Being *named on* a record — as contact, guardian, primary, or owner — **MUST NOT** confer authority
  over it. **[carried]**

**User (principal)**

- A P1 operator principal **MUST** be `auth.users.id`; no other table may originate a principal identity. **[carried]**
- A principal with no membership row in an org has **no** authority in that org — not reduced authority. **[carried]**
- A principal **MAY** hold memberships in multiple orgs; each is resolved independently. **[carried]**

**Role**

- A role **MUST** name a `role_key` that exists in `role_definitions` for that org, at every layer that names
  a role: memberships, grants, RLS, seeds, UI, tests. **[carried]**
- A role **MUST NOT** carry behaviour of its own beyond its granted capabilities. **[carried]**
- A role **MUST NOT** widen a scope dimension (I-20), and **MUST NOT** be readable by the scope branch at
  all (I-27, new).
- Deactivating a role (`is_active = false`) **MUST** revoke its capabilities from every principal holding it
  (I-26, new — §4.4).

**Scope**

- Scope **MUST** attach to the membership pair `(principal, org)`, never to a role.
- Absent or unreadable scope **MUST** deny. **[carried]**
- Scope **MUST** apply symmetrically to reads and writes. **[carried]**

---

## 3. Edge E1 — person ↔ user

### 3.1 The edge does not exist, and that is correct **[carried]**

`persons` is the canonical human record and carries no principal link
(`remote_schema.sql:2431-2450` — eighteen columns, none of them a user reference) **[verified]**. The accepted
model's position stands verbatim: *the absence of an implicit edge is the right design; what is missing is not
a column but an explicit, directional, auditable link for the day a real human needs to act.*

### 3.2 The five rules for the day a person must act **[carried]**

Unchanged from the accepted model §4.2, restated here because they are the durable half of this deliverable:

1. A **new principal is created** (`auth.users`). The person record is not upgraded — personhood and
   principalhood are different populations that may be linked, never merged.
2. The link is an **explicit row**: direction `principal → person`, org-scoped, with `created_by` and
   `created_at`. It is the **only** sanctioned join between the graphs.
3. The link is **never inferred**. Matching on email, phone, or name **MUST NOT** create or imply it.
4. The link **confers no authority by itself.** A linked principal still needs a membership, a role, and
   capabilities. Linkage means only that the scope layer *may* use that person as a scope anchor.
5. A person-linked principal **MUST NOT** be portal-eligible by default (§6.3).

### 3.3 What this pass adds: the inference hazard is not hypothetical

The user-creation path already matches on email. `POST /api/admin/users` invites by email address
(`web/app/api/admin/users/route.ts:91`) **[verified]**, and `persons.email` is a plain nullable column
(`remote_schema.sql:2438`) **[verified]**. Nothing today joins them — but the two populations are keyed on the
same natural identifier, in the same org, with no constraint preventing a future convenience join.

> Rule 3 above is therefore a **standing prohibition on a join that is one query away**, not a precaution
> about a distant feature.

Alloy already has an identity-resolution discipline built for exactly this hazard on the *subject* side
(`Candidate Match`, `Identity-review gate`, `docs/platform/governance/glossary.md:94,96`) **[carried]**.
Authority linkage is strictly higher-stakes than record matching and gets the stricter rule: not "review
before merging" but "never infer at all".

### 3.4 The legacy principal tables are not the missing edge

`app_users` looks like a person↔user bridge and is not one. It is a **principal** table on the legacy fallback
authority path, carrying its own role vocabulary (§4.2) and two different join columns to `auth.users` — `id`
(`resolveAdminAccessCore.ts:54`) and `auth_user_id` (`:62`) **[verified]**. It has no `person_id`
(`remote_schema.sql:1010-1019`) **[verified]**.

Whether a person ever becomes a principal remains decision **D1** — unchanged, unanswered, and still the first
question, per `01…:361`.

---

## 4. Edge E2 — user ↔ role (membership)

### 4.1 A membership is the unit of authority

`user_roles(user_id, org_id, role)` with composite primary key
(`20260505120000_user_roles_composite_primary_key.sql:1-4`, constraint comment: *"One membership row per
(user, org, role); supports multiple roles per user per org"*) **[verified]**. The multi-role model is real in
the schema and in the resolver, which unions role keys into a sorted set
(`resolveAdminAccessCore.ts:34-36`) **[verified]**.

> Effective capability for a multi-role membership is the **union** of its roles' grants. Union, never
> intersection. **[carried]**

**Still unwritable through the product** (C7, unchanged). The one assignment path deletes every row for the
pair and inserts one (`web/app/api/admin/users/[userId]/role/route.ts:44-47`), and says so in its own
docstring — *"replace **all** role rows for this user in this org with a single role_key. Multi-role personas
(e.g. ops + regional_lead) must be re-added via seed or a future additive API"* (`:6-9`) **[verified]**.

> The assignment API **MUST** support adding and removing an individual `(principal, org, role)` row. **[carried]**

### 4.2 Four role vocabularies, only one of them canonical

The accepted model required one vocabulary (I-8). This pass finds four, and the fourth is new to the register:

| # | Vocabulary | Values | Constraint | Evidence |
|---|---|---|---|---|
| 1 | `role_definitions.role_key` — **canonical** | `admin`, `ops`, `regional_lead`, `school_director` | unique `(org_id, role_key)` | `phase0:175-181`; `remote_schema.sql:3814-3815` |
| 2 | `user_roles.role` — the membership leg | *anything* | **none** — unconstrained `text` | `remote_schema.sql:2915-2920`; FKs at `:6617-6623` cover only `org_id` and `user_id` |
| 3 | RLS policy literals | includes `owner`, `manager` — never seeded | inline in policies | `remote_schema.sql:7302-7351` and throughout |
| 4 | **`app_users.role` CHECK** | `admin`, `ops`, `vendor_owner`, `vendor_worker` | `app_users_role_check` | `remote_schema.sql:1018` |

All four **[verified]**. Vocabulary 4 is the new record (**M2-8**): it is a *database-enforced* role vocabulary
that names two roles — `vendor_owner`, `vendor_worker` — appearing in no `role_definitions` seed, and it sits
directly on the legacy fallback authority path (`resolveAdminAccessCore.ts:40-71`).

**The asymmetry that makes this durable:** the *grant* leg of the model is doubly FK-constrained onto
`role_definitions` while the *membership* leg is unconstrained.

```sql
-- role_permission_grants → role_definitions, twice, identically:
ADD CONSTRAINT "role_permission_grants_role_definitions_fkey"
    FOREIGN KEY ("org_id","role_key") REFERENCES "role_definitions"("org_id","role_key") ON DELETE CASCADE;  -- :6512-6513
ADD CONSTRAINT "role_permission_grants_role_fk"
    FOREIGN KEY ("org_id","role_key") REFERENCES "role_definitions"("org_id","role_key") ON DELETE CASCADE;  -- :6517-6518
-- user_roles.role → nothing.                                                                                  :2915-2920
```

**[verified]** — this is **M2-2**. Phase 0 was surgical about the *permission-key* column's dual FKs, which
genuinely disagreed (`RESTRICT` vs `CASCADE`, `phase0:127-128`), and correctly replaced them with one
(`:131-140`). The *role-key* duplicate pair is harmless — identical semantics — but it remains, and it stands
in exactly the place where the accepted model's I-8 asked for a constraint that is still absent one table over.

> `user_roles.role` **MUST** be constrained by foreign key to `role_definitions(org_id, role_key)`. **[carried]**
> The duplicate role FK on `role_permission_grants` **SHOULD** be collapsed to one at the same time.

### 4.3 Two seeded personas still cannot act

Phase 0 seeds four system roles into **every org on insert** — `admin`, `ops`, `regional_lead`,
`school_director` (`phase0:175-181`, trigger `:199-202`, backfill `:205-213`) **[verified]** — while
`PORTAL_ROLES` remains `{admin, ops}` (`resolveAdminAccessCore.ts:18`) **[verified]**.

This is C6, unchanged in substance and **worse in population**: the platform now manufactures two unusable role
rows per new org automatically, where before it seeded them once. Phase 0 fixed *supply* of role definitions;
it did not touch *admission* (`01…:219-226` **[carried]**).

### 4.4 M2-3 — `is_active` is enforced on write and ignored on resolve

`role_definitions.is_active` exists (`remote_schema.sql:2708`) and the assignment API honours it — a role must
be an active row for the org or the request is rejected `400 Invalid or inactive role for this org`
(`role/route.ts:33-36`) **[verified]**.

The resolver does not. `fetchPermissionKeys` queries `role_permission_grants` by `org_id`, `role_key` and
`allowed`, and **never joins `role_definitions`** (`resolveAdminAccessCore.ts:89-94`) **[verified]**. Membership
rows are read straight from `user_roles` with no existence check against the catalog at all (`:111-126`).

Two consequences, both fail-open:

- **Deactivating a role does not revoke it.** Setting `is_active = false` via `PATCH /api/admin/rbac/roles/[role_key]`
  blocks *new* assignments and leaves every existing holder's capabilities intact.
- **A membership naming a role that does not exist still resolves.** Its grant lookup returns nothing, so it
  carries no capabilities — but if the literal happens to be `admin` or `ops`, `portalEligible` is `true`
  regardless (`:142`), because that test reads the raw membership string, not the catalog.

> **I-26 (new).** Role deactivation revokes. A principal's resolved capability set **MUST** be computed only
> from role definitions that are present and `is_active` for that org.

### 4.5 M2-4 — the seed cannot express "ops is less than admin"

`seed_default_rbac` grants `admin` every active catalog key (`phase0:292-296`) and grants `ops` every active key
**except two**: `admin.users.write` and `admin.roles.write` (`:299-304`) **[verified]**. Those two keys are the
seed's only mechanism for making `ops` a lesser role.

**Neither key is read anywhere in `web/`.** A repository-wide search for `admin.users.write`,
`admin.roles.write`, `admin.users.read` and `admin.roles.read` returns **no matches** **[verified]** — they are
seeded (`phase0:282-285`), granted, and enforced by nothing.

The key that actually gates user and role management is `settings.users_roles`
(`canManageUsersAndRoles.ts:9,15-18`) **[verified]** — and `ops` is granted it, because it is not one of the two
withheld keys.

Traced end to end, in a default-seeded org:

| Step | Evidence |
|---|---|
| `ops` holds `settings.users_roles` | `phase0:299-304` (only `admin.*.write` withheld) |
| `requireUsersRolesManageAuth` admits on that key | `canManageUsersAndRoles.ts:17,36-39` |
| `PATCH /users/[userId]/role` applies no ceiling on the target role | `role/route.ts:33` validates only that the role is active for the org |
| Self-mutation is blocked | `role/route.ts:21-23`, `selfAuthorityMutation.ts:20-25` |
| **Therefore** | an `ops` principal may promote **any other** principal to `admin`; two `ops` principals may promote each other |

**[verified]** at every step. This is not a new exploit — it is `01…:208-213`'s open half of G3, D3 — but it is
sharper than "no ceiling exists": **the role↔capability edge cannot currently express the distinction the seed
is trying to make**, because the differentiating keys are inert. W-2's self-elevation ban is real and
load-bearing; it removes the one-principal path and leaves the two-principal path open.

This is decision **D9** (§10).

---

## 5. Edge E3b — membership ↔ scope

### 5.1 Shape (unchanged, and still the best-built leg) **[carried]**

Two orthogonal dimensions, each `all` or `restricted` with an explicit allow-list:

| Dimension | Mode column | Allow-list | Evidence |
|---|---|---|---|
| **Department** | `user_access_profiles.department_scope` | `user_department_access` | `20260504103000…:18-30`, `:69-80` |
| **Site** | `user_access_profiles.site_scope` | `user_site_access` (`locations.location_type='site'`) | `:150-161` |

**[verified]**, including the org-match and site-type integrity constraints and the junction FKs onto
`user_access_profiles(user_id, org_id)`.

### 5.2 The schema says "at most one"; the model requires "exactly one"

`uq_user_access_profiles_user_org UNIQUE (user_id, org_id)` (`20260504103000…:50`) **[verified]** guarantees a
principal never has two conflicting profiles in an org. It cannot guarantee one exists.

That remaining half is G4, **open and unchanged**: `POST /api/admin/users` inserts into `user_roles` only
(`web/app/api/admin/users/route.ts:102-111`) and references no scope table **[verified]**.

> **Every membership MUST have exactly one access profile row, created in the same transaction as the
> membership.** **[carried]** — I-18.

### 5.3 Absence denies

Today absence means `all` on both dimensions, with the resolver's own comment calling it a *"legacy transition
until profiles always exist"* (`resolveAdminAccessCore.ts:152-161`) **[verified]**.

> A missing or unreadable scope row **MUST** deny. **[carried]** — I-19. §5.2 makes this cheap: once the
> profile invariant holds, denial on absence is unreachable in normal operation, and any occurrence is a
> genuine integrity failure that should be loud.

### 5.4 I-27 (new) — the branches are independent in both directions

`portalAdminBypassesDepartmentScope` forces `departmentScope = "all"` for any `admin`/`ops`
(`accessScope.ts:45,51-53`, applied `:60-64`) **[verified]**. Combined with §4.3 — only `admin`/`ops` reach the
portal — **every principal who can use the product bypasses department scope**. Department scope is
configurable, displayed to the operator, and inert. That is C8 **[carried]**.

The accepted model stated the fix as I-20 (*no role widens a scope dimension*). This pass generalizes it,
because §0's structural finding makes the reason explicit and the converse equally necessary:

> **I-27 (new).** The capability branch (E3a) and the scope branch (E3b) are independent. Neither may read or
> modify the other's output. A gate composes them by intersection; nothing else may.

The converse matters as much as the case that motivated it: a principal whose scope is `all` **MUST NOT**
thereby gain a capability, and a scope allow-list **MUST NOT** be widened because a capability is held. Stated
only as I-20, the rule would forbid today's defect and permit its mirror image.

---

## 6. Edge E3a — role ↔ capability

### 6.1 One catalog — satisfied

I-12 is **met**. Phase 0 makes `permission_definitions` the single canonical table, replaces both legacy FKs on
`role_permission_grants.permission_key` with one `ON DELETE RESTRICT` FK onto it (`phase0:131-140`), and
demotes `permissions` and `permission_keys` to `security_invoker` read-only views over the same data
(`:147-164`), behind an apply-time preflight that aborts on orphan grants before any `DROP` (`:36-83`)
**[verified]**. `01…:154-171` records the same closure **[carried]**.

This is the accepted model's §7.1 satisfied in full, and it is the first invariant in the register to move from
violated to met.

### 6.2 M2-9 — the blanket grant is now broader than when it was recorded

I-15 said: *seeds **MUST** enumerate the keys they grant; `SELECT * FROM <catalog>` **MUST NOT** appear in a
grant seed.* **[carried]**

`seed_default_rbac` still does exactly that — `select … from public.permission_definitions pd where
pd.is_active = true` for `admin` (`phase0:292-296`) and the same minus two keys for `ops` (`:299-304`)
**[verified]**.

The change is the *target*. The blanket previously swept one of three catalogs; Phase 0 unions all three into
`permission_definitions` (`:90-98`) before the blanket reads it. **The same unenumerated grant now covers the
union of every vocabulary the platform has ever defined**, and the function's own key list has grown to 57
entries (`:229-285`).

Phase 0 was right to prefer this over silently narrowing new orgs (`:28-30` states that reasoning explicitly).
The finding is not that Phase 0 erred — it is that closing I-12 mechanically enlarged I-15, and the two must be
sequenced together.

### 6.3 Portal eligibility is a capability **[carried]**

Unchanged and still required:

> Portal admission **MUST** be a granted capability — one key, e.g. `portal.access` — resolved through the same
> catalog and grant table as every other capability. It **MUST NOT** be a hard-coded role set. (I-16)
>
> Portal eligibility is **admission, not authority**. Every route **MUST** additionally declare the capability
> it requires. (I-17)

**The target shape now exists in the codebase at one route family.** `canReadAnalytics` gates on
`reports.read` / `reports.write` (`web/lib/admin/canReadAnalytics.ts:11-12,32-36`), and its docstring names
`portalEligible` as an explicitly temporary leg to be replaced by `portal.access` under W-13 (`:29-30`)
**[verified]**; `01…:79-100` records it **[carried]**. Nothing new needs inventing — it needs generalizing.

### 6.4 The grid is a projection **[carried]**

`PERMISSION_GRID_ROWS` remains an independently hand-maintained list (`web/lib/admin/permissionGrid.ts:22`)
**[verified]**. I-14 stands unchanged, and `01…:143-151`'s **C13** shows the failure mode is still live: the
repair for C5 produced `ops.workflows.*` — catalogued (`phase0:106-113`), granted to `admin` in every org
(`:116-122`), reachable from no UI and enforced by no route **[carried]**.

§4.5 shows C13 is not a single stray pair. `admin.users.read`, `admin.users.write`, `admin.roles.read` and
`admin.roles.write` are in the same state **[verified]** — so the orphaned-capability class has **at least six**
members, and two of them are load-bearing in the seed's role differentiation.

---

## 7. Invariant status — the accepted register, re-anchored

The accepted model's I-1 … I-25 are unchanged in wording and keep their numbers. Status is as of `bdcf55908`.
**met** · **partial** · **open** · **worse** (regressed or found broader than recorded).

| # | Invariant (abbreviated) | Status | Current evidence |
|---|---|---|---|
| I-1 | One identity source (`auth.users.id`) | **open** | legacy fallback intact, `resolveAdminAccessCore.ts:40-71` |
| I-2 | No membership ⇒ no authority | **open** | same fallback; `:136-140` |
| I-3 | Service-role client confers nothing | **open, narrowed** | 534/559 routes hold one (`01…:249`); W-4 allowlist tightened by `2ec3d322d` |
| I-4 | Delegated-link token properties | **[carried]** — not re-verified this pass | accepted §3.4 |
| I-5 | No implicit person↔principal relation | **met, at risk** | no link exists (`remote_schema.sql:2431-2450`); §3.3 hazard |
| I-6 | Everything carries `org_id` | **met** **[carried]** | accepted §5.1 |
| I-7 | Org from the request, not an ordering heuristic | **open** | lexicographic `sort()[0]`, `resolveAdminAccessCore.ts:32` |
| I-8 | One role vocabulary | **worse** | four vocabularies, §4.2 (M2-8); membership leg still unconstrained (M2-2) |
| I-9 | Roles carry no behaviour; one break-glass | **worse** | ≥13 authority-deciding role literals, §8 M2-7 |
| I-10 | Individually addable/removable roles; union | **open** | delete-then-insert, `role/route.ts:44-47` |
| I-11 | No granting what you lack; no self-elevation | **partial** | self-ban met (`selfAuthorityMutation.ts:20-25`); ceiling open, and §4.5 shows why it bites |
| I-12 | One catalog, one FK on `permission_key` | **met** | `phase0:131-140,147-164` |
| I-13 | Catalog keys ≡ enforced keys | **worse** | ≥6 orphaned keys (§6.4); 11 of 18 grantable keys inert (`05…§1`) |
| I-14 | Grid derived from catalog | **open** | `permissionGrid.ts:22` |
| I-15 | Seeds enumerate their grants | **worse** | blanket now over the unioned catalog, §6.2 (M2-9) |
| I-16 | Portal admission is a capability | **open** | `PORTAL_ROLES`, `resolveAdminAccessCore.ts:18` |
| I-17 | Portal eligibility never sufficient | **open, first crack** | 1 of 132 admin pages gated finer than "has a role" (`05…§1`); `canReadAnalytics` at 3 routes |
| I-18 | Exactly one access profile per membership | **open** | `users/route.ts:102-111`; schema gives "at most one" (§5.2) |
| I-19 | Absent scope denies | **open** | `resolveAdminAccessCore.ts:152-161` |
| I-20 | No role widens a scope dimension | **open** | `accessScope.ts:45,60-64` |
| I-21 | Scope symmetric on reads and writes | **[carried]** — not re-verified this pass | accepted §9.5 |
| I-22 | One resolver; previews render from enforcing code | **worse** | three resolvers, §8 M2-5 |
| I-23 | Every gate evaluates G-A…G-D, fails closed | **open** | `05…§1`; G-C and G-D independently unmet at scale |
| I-24 | `(route → capability)` declared and enumerable | **open** | no declaration mechanism exists |
| I-25 | Authority caches keyed and invalidated | **[carried]** — not re-verified this pass | accepted §10.4 |
| **I-26** | **Role deactivation revokes** | **open (new)** | `resolveAdminAccessCore.ts:89-94` vs `role/route.ts:33` |
| **I-27** | **Capability and scope branches are independent both ways** | **open (new)** | `accessScope.ts:60-64` |

**Score:** 3 met (I-5, I-6, I-12) · 2 partial (I-11, I-3) · 17 open · 5 worse · 4 carried unverified.

The one genuinely new *positive* is I-12 — and it is the only invariant closed by a migration rather than by
reclassification.

---

## 8. New divergences recorded by this pass

Numbered `M2-n` so the accepted `C`/`G` register stays stable.

| # | Finding | Violates | Nature | Evidence |
|---|---|---|---|---|
| **M2-1** | Role and scope are sibling branches off the membership, not a chain; the model had left this implicit | — | **specification clarification**, not a defect | `20260504103000…:18-30,50` |
| **M2-2** | `role_permission_grants` carries **two identical FKs** onto `role_definitions`, while `user_roles.role` carries none | I-8 | redundancy beside an absence | `remote_schema.sql:6512-6518` vs `:2915-2920` |
| **M2-3** | `role_definitions.is_active` is honoured on assignment and ignored on resolution — deactivating a role does not revoke it | I-26, I-19 | fail-open | `role/route.ts:33` vs `resolveAdminAccessCore.ts:89-94` |
| **M2-4** | The two keys the seed withholds from `ops` (`admin.users.write`, `admin.roles.write`) are read nowhere; the key that gates user/role management (`settings.users_roles`) **is** granted to `ops` | I-11, I-13 | `ops` ≈ `admin` in any default-seeded org (**D9**) | `phase0:299-304`; `canManageUsersAndRoles.ts:17`; zero repo matches |
| **M2-5** | A **third** resolver: `resolveAdminPortalOrgCore.ts` re-implements the legacy fallback and its own `PORTAL_ROLES` | I-22 | third source of truth | `resolveAdminPortalOrgCore.ts:7,12-35` |
| **M2-6** | The never-seeded `owner`/`manager` vocabulary has **leaked from RLS into application code** | I-8, I-9 | dead authorization terms in live gates | `assertDocumentAccess.ts:76`; `configurationProposalAccess.ts:53` |
| **M2-7** | Role literals decide authority in **at least 13** places, not the three the accepted model named | I-9 | break-glass is not one door | table below |
| **M2-8** | `app_users.role` CHECK is a **fourth**, database-enforced role vocabulary including `vendor_owner`/`vendor_worker` | I-8 | vocabulary on the fallback authority path | `remote_schema.sql:1018` |
| **M2-9** | Closing I-12 enlarged I-15 — the blanket grant now sweeps the unioned catalog | I-15 | coupled remediation | `phase0:90-98,292-296` |

### M2-6, in detail

`DOCUMENT_READ_ROLES = ["owner", "admin", "ops", "manager"]` (`web/lib/documents/assertDocumentAccess.ts:76`)
**[verified]**. Its own comment is candid and, on its premises, correct: *"Mirrors the `documents` RLS SELECT
policy (owner|admin|ops|manager). The routes bypass RLS via the service-role client, so this restores in code
the boundary the database already declares — rather than inventing a new one"* (`:70-75`).

The premise is what fails. C10 established that no migration ever seeds `owner` or `manager` **[carried]**, and
Phase 0 seeds neither (`:175-181`) **[verified]**. So the mirrored boundary is `{admin, ops}` with two terms
that no principal can hold — and a reader of this module reasonably concludes the platform has an `owner` role.
`configurationProposalAccess.ts:53` carries the same `owner` term **[verified]**.

This is the accepted C10 upgraded from *"RLS specification defect"* to *"a vocabulary that has propagated into
application authority checks."* Remediating C10 in SQL alone would now leave the leak behind.

### M2-7, enumerated

Authority-deciding sites — a role literal directly decides allow/deny or portal admission:

| # | Site | Literals |
|---|---|---|
| 1 | `admin/resolveAdminAccessCore.ts:18` `PORTAL_ROLES` | `admin`, `ops` |
| 2 | `admin/resolveAdminAccessCore.ts:49,58,66` legacy fallback admission | `admin`, `ops` |
| 3 | `admin/resolveAdminPortalOrgCore.ts:7` second `PORTAL_ROLES` | `admin`, `ops` |
| 4 | `adminAuth.ts:19` `ALLOWED_ROLES` | `admin`, `ops` |
| 5 | `adminAuth.ts:103` | `admin` |
| 6 | `admin/accessScope.ts:45` department-scope bypass | `admin`, `ops` |
| 7 | `admin/canManageUsersAndRoles.ts:16` | `admin` |
| 8 | `metrics/platform/adminApiHelpers.ts:17` | `admin` |
| 9 | `communications/communicationPermissions.ts:32` | `admin`, `ops` |
| 10 | `ai/aiEnrichmentPermissions.ts:75` | `admin`, `ops` |
| 11 | `documents/assertDocumentAccess.ts:76` | `owner`, `admin`, `ops`, `manager` |
| 12 | `agent/configLayoutAssist/configurationProposalAccess.ts:53,57-59` | `owner`, `admin`, `ops` |
| 13 | `pos/processingIdentity/operator/operatorRouteContext.ts:42` | `admin`, `ops` |
| 14 | `adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate.ts:11` | `admin` |

Two further sites *collapse* a multi-role membership to one literal for display or compatibility rather than
deciding authority — `admin/userRolesMembership.ts:24-25` and `admin/adminPortalRolePick.ts:2-4` **[verified]**.
They are listed separately because they are not gates, but they are where the union semantics of §4.1 are
silently discarded on the way to the operator's screen.

**Bound, not census.** Sites 8–14 are cited from a single matched line each; their surrounding functions were
not read in this pass. Thirteen-plus is a **lower bound** on authority-deciding role literals in `web/lib`
alone, produced by a literal search that by construction cannot see role checks written any other way. `web/app`
was not swept. Per the accepted model's own methodological rule, a grep is a floor, never a count.

---

## 9. Conformance additions

The accepted §12 conformance table stands **[carried]**. Three checks are added for the new findings; each is
mechanical.

| Invariant | Check | Kind |
|---|---|---|
| **I-26** | Deactivate a role held by a fixture principal; assert its capabilities disappear from the next resolve | integration |
| **I-27** | Assert `effectiveDepartmentScopeDimensions` (or its successor) takes no role input; assert no scope helper reads `permissionKeys` | static |
| I-8 (M2-8) | Union of role literals in `role_definitions` seeds, `user_roles`, RLS policies, and every CHECK constraint on a role column — assert one set | schema + static |
| I-13 (M2-4) | For each pair of seeded roles, the symmetric difference of their granted keys **MUST** contain at least one key that some gate reads | static |
| I-22 (M2-5) | Assert exactly one module defines `PORTAL_ROLES` or an equivalent admission set | static |
| I-9 (M2-6, M2-7) | Role literals in application code appear only in the declared break-glass module; no literal names a key absent from `role_definitions` seeds | static |

The I-13 check is the one that would have caught M2-4 before it shipped: it asks not *"is this key in the
catalog"* but *"does granting or withholding this key change any outcome."*

---

## 10. Decisions

**D1 – D4 carry forward unchanged** from the accepted model §14; **D5 – D8** live in
`04-authentication-model.md` §4 **[carried]**. Status as of this pass:

| # | Question | Status |
|---|---|---|
| **D1** | Does a person ever become a principal? | **open** — still first; §3 holds either way |
| **D2** | What are `regional_lead` / `school_director` for? | **open, cost compounding** — now seeded per org on insert (§4.3) |
| **D3** | What is the delegation ceiling? | **open, and now the sharpest** — §4.5 |
| **D4** | Is RLS an authority layer? | **open, and more durable** — §8 M2-6 shows its vocabulary has leaked outward |

Two decisions are new to this pass.

**D9 — Is `ops` a user-and-role administrator?**
In any default-seeded org, `ops` holds `settings.users_roles` and can therefore invite users, change any other
principal's role (including to `admin`), create roles, and rewrite grants (§4.5). The seed's only attempt to
prevent this withholds two keys that nothing reads. Either that is intended — in which case `ops` and `admin`
differ in name only and the product should say so — or it is not, and the fix is to enforce
`admin.users.write` / `admin.roles.write` at the users-and-roles gate rather than `settings.users_roles`.
*Recommendation:* **not intended.** Point `requireUsersRolesManageAuth` at `admin.users.write` /
`admin.roles.write`, which the seed already withholds from `ops`, and keep `settings.users_roles` for read and
lesser settings management. This is a small change that makes an existing seed decision effective, and it is
independent of D3's subset rule — it should not wait for it.

**D10 — Does deactivating a role revoke it?**
`is_active = false` currently blocks new assignments and leaves existing holders fully capable (§4.4).
*Recommendation:* **revoke.** An operator toggling a role inactive is making a security decision, and the
current behaviour makes it a documentation decision. The alternative — "inactive means unassignable, not
revoked" — is defensible only if the UI says so at the point of the toggle, which it does not.

Neither decision is worker-resolvable; both are recorded rather than assumed, per the mission's
document-authority rule.

---

## 11. Reproduce

```bash
# §1.1 / §3.1 — the four nouns, and the absent E1 edge
rg -n 'CREATE TABLE IF NOT EXISTS "public"\."(persons|user_roles|role_definitions|role_permission_grants|app_users)"' \
  -A 20 supabase/migrations/20260329165048_remote_schema.sql
rg -n 'CREATE TABLE|UNIQUE' supabase/migrations/20260504103000_user_access_scope_tables_v1.sql

# §4.2 (M2-2) — grants doubly constrained, membership unconstrained
rg -n 'role_permission_grants_role|user_roles_.*fkey' supabase/migrations/20260329165048_remote_schema.sql

# §4.2 (M2-8) — the fourth vocabulary
rg -n 'app_users_role_check' supabase/migrations/20260329165048_remote_schema.sql

# §4.4 (M2-3) — is_active honoured on write, absent on resolve
rg -n 'is_active' web/app/api/admin/users/\[userId\]/role/route.ts
rg -n 'role_permission_grants|role_definitions' web/lib/admin/resolveAdminAccessCore.ts   # no role_definitions

# §4.5 (M2-4) — the withheld keys are inert; the granted one is the gate
rg -n 'admin\.users\.write|admin\.roles\.write|admin\.users\.read|admin\.roles\.read' web/   # no matches
rg -n "not in \('admin.users.write'" supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql
rg -n 'SETTINGS_USERS_ROLES_PERMISSION|roleKeys.includes' web/lib/admin/canManageUsersAndRoles.ts

# §6.2 (M2-9) — blanket grant over the unioned catalog
rg -n 'from public.permission_definitions pd' supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql

# §8 (M2-5, M2-6, M2-7) — resolvers, leaked vocabulary, role literals
rg -n 'PORTAL_ROLES' web/lib
rg -n 'DOCUMENT_READ_ROLES|"owner"' web/lib/documents/assertDocumentAccess.ts web/lib/agent/configLayoutAssist/configurationProposalAccess.ts
rg -n '"admin"|"ops"' web/lib --glob '*.ts' | rg -v '\.test\.'
```

---

## 12. Limits

1. **Static and file-grounded.** No request issued, no browser used, no live database queried, no test suite or
   typecheck run. The only file written by this phase is this document.
2. **Repo state, not deployed state.** `20260729120000_…` was vendored to match deployed staging (`555fa056a`,
   `01…:341-343`), so on staging it is applied. Whether any other environment has it was not verified. Every
   Phase 0 claim here is a claim about the migration's text.
3. **M2-7 is a lower bound produced by a literal search**, over `web/lib` only, and sites 8–14 were confirmed at
   the matched line without reading the surrounding function. It is offered as a floor, not a census (§8).
4. **I-4, I-21 and I-25 were not re-verified** in this pass and are carried from the accepted model. A reader
   should not treat their line citations as freshly confirmed.
5. **Carried claims were not re-derived.** C1, C2, C4, C7, C8, C9, G1, G5 and the accepted model's §1–§2
   vocabulary and chain are inherited via `01…§7.1` and the frozen QA copy.
6. **M2-4 is an authorization finding, not an exploit report.** It describes what a default-seeded org permits
   by design of its seed. No live org was inspected, and no org's actual grant rows were read.
7. **Not a threat model, not an RLS policy review, no product UI claim** — unchanged non-goals **[carried]**.
   `05-command-enforcement-census.md` supplies the surface and command halves this document cites but does not
   re-derive.
8. **Read-only.** No source, schema, migration, or UI was modified. The frozen QA copy is untouched.

---

## 13. Provenance

- **Inputs (reused, not re-derived):** [`01-existing-state-inventory.md`](./01-existing-state-inventory.md)
  (Mission 2, 2026-08-03), the accepted [`authority-path-inventory.md`](./authority-path-inventory.md), the
  frozen `02-canonical-access-identity-model.md` (mission `msn_e9133cdade883793d2`), and
  `05-command-enforcement-census.md` §1 for the surface and capability counts.
- **Schema read this pass:** `20260329165048_remote_schema.sql` (`persons`, `user_roles`, `role_definitions`,
  `role_permission_grants`, `app_users` DDL; grant and membership FKs; role-definition uniqueness),
  `20260504103000_user_access_scope_tables_v1.sql` (read in full for the three scope tables),
  `20260505120000_user_roles_composite_primary_key.sql` (read in full),
  `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql` (read in full).
- **Application code read this pass:** `resolveAdminAccessCore.ts` (both resolvers, in full),
  `resolveAdminPortalOrgCore.ts` (head), `accessScope.ts` (bypass region), `canManageUsersAndRoles.ts` (in
  full), `selfAuthorityMutation.ts` (in full), `web/app/api/admin/users/route.ts` (create path),
  `web/app/api/admin/users/[userId]/role/route.ts` (in full), `userRolesMembership.ts`,
  `assertDocumentAccess.ts` (role region), `permissionGrid.ts`.
- **Repository-wide searches:** `admin.users.*` / `admin.roles.*` (no matches), `settings.users_roles`
  (consumers), role literals in `web/lib`.
- **Verified at** `bdcf55908` in `wt6-vacilando-os-product-def`.
