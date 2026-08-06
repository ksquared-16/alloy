# 02 — Canonical access & identity model (Person ↔ user ↔ role ↔ scope)

> **This file carries three Mission 2 phases.**
>
> **Part I — §1–§13 · *Person ↔ user ↔ role ↔ scope*** (assignment `asg_7a47782c7dc1c9`). States the four
> nouns and three edges normatively, re-anchors the accepted invariant register to today's code (§7), and
> records divergences `M2-1 … M2-9` (§8). **Reopened 2026-08-06** on operator guidance: §1.3 restates the
> authority chain as **four layers, two branches** (`M2-16`), and §4.6 bounds what a role-administration
> surface owes the model (`I-32`, `R1–R5`). Parts II and III are not modified by the reopen.
>
> **Part III — §24–§32 · *Decisions requiring approval*** (assignment `asg_90a921a3b7f414`). Consolidates
> every open decision in the corpus — from all six documents that raise one — into a single register that can
> be cited by number, groups them into the sittings that must decide them together, and orders them by what
> they block. It **adds no new decision** and re-derives no recommendation; it makes the existing ones
> approvable. **Parts I and II are not modified by Part III.**
>
> **Part II — §14–§22 · *Effective-access resolution model*** (assignment `asg_5a0d3ccf5dea42`). Specifies the
> **function** that turns a request into an access decision — the stages, their order, how the two branches
> compose, and what must happen when an input changes or a read fails. Part I said *what the nouns are*; Part II
> says *how a decision is computed from them*. It adds `M2-10 … M2-15`, invariants `I-28 … I-31`, and decisions
> `D11`/`D12`. **Part I is not modified by Part II** except for §7, where the invariant register gains four rows
> and `I-25` moves from *carried, unverified* to *verified and violated*.

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
**Date** 2026-08-03 · **reopened and extended 2026-08-06** (§0, §1.3, §4.6) in
`wt6-director-experience-dx5-5-continuation` @ `a72caaff4`
**Status** Proposed — specification only. No code, schema, or migration is changed by this phase.
**Method** static, file-grounded. Every claim marked **[verified]** was read at the cited `path:line` in this
pass. Claims carried from the accepted model without re-derivation are marked **[carried]**.

> **Reopen (2026-08-06), on operator guidance.** Two directives: *the role hierarchy is still too deep — reduce
> to four layers*, and *simplify the role editor without changing the access architecture*. The first is
> answered in **§1.3** — the chain is restated as four layers and two branches, which is what M2-1 already
> implied. The second is **bounded, not executed**, in **§4.6**: `02` specifies what any role-editing surface
> must preserve; the redesign itself belongs to `06-product-ia-and-flows.md` and is outside this assignment's
> scope. The four-chapter Access workspace the guidance refers to (`users`, `roles`, `scopes`, `security`) was
> read but **not modified**. Claims verified in the reopen pass are cited at `a72caaff4`.

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
| §2 — "one chain, five links", drawn in sequence | **four layers, two branches** — the fifth link was width read as depth | §1.3, M2-16 |

Nine divergences are newly recorded by this pass as **M2-1 … M2-9** (§8). Two new invariants (**I-26**,
**I-27**) and two new decisions (**D9**, **D10**) follow from them.

**The reopen pass (2026-08-06) adds two things and changes nothing else.** §1.3 restates the chain as **four
layers, two branches** rather than five links — the arithmetic of M2-1, which Part I made but never carried
through to the depth (**M2-16**). §4.6 states what a role-administration surface owes the model, so that
simplifying the Access workspace can be checked against the architecture instead of judged by eye (**I-32**,
constraints **R1–R5**). Both are projections of rules already in this document; **no invariant, edge, table, or
decision is renumbered, reworded, or reinterpreted.**

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

### 1.3 The authority chain is four layers deep, not five

The accepted model states *"One chain. Five links"* and draws them in sequence — credential → membership →
role set → capability set → scope — with the consequence that *"a capability cannot escape its role; scope
cannot escape its capability"* (frozen `02…:60-89`) **[carried]**. §0 shows the last two links are not in
sequence: `user_access_profiles` is keyed on `(user_id, org_id)` and carries no `role` column
(`20260504103000…:18-30`, unique at `:50`) **[verified]**, so scope hangs off the **membership**, not off the
capability set.

Once scope is a sibling of capability rather than its child, the fifth link is not depth. It is width:

| Layer | Question | Capability branch (E3a) | Scope branch (E3b) |
|---|---|---|---|
| **L1 — Principal** | *who* | `auth.users.id` | *(shared)* |
| **L2 — Membership** | *where* | `user_roles(user_id, org_id, role)` | *(shared)* |
| **L3 — Assignment** | *as what* / *under what limit* | `role_definitions(org_id, role_key)` | `user_access_profiles(user_id, org_id)` |
| **L4 — Resolved set** | *may do what* / *to which rows* | permission keys via `role_permission_grants` | department + site dimensions via the two junctions |

**Four layers, two branches, both branches exactly four deep.** L1 and L2 are shared; the branches separate at
L3 and are composed — never merged — at the gate.

> **The chain is four layers deep. It MUST NOT be specified, drawn, or implemented as five.** A fifth layer can
> only be produced by making one branch an input to the other, which is exactly what I-27 forbids.

This is a restatement, not a change. No table, column, constraint, edge, or gate obligation moves; every
invariant keeps its number and its wording. What changes is that the model stops describing a depth the schema
does not have. Recorded as **M2-16** (§8).

**This section also corrects Part I's own first statement of the finding.** The prior wording of §1.3 said the
fourth and fifth links are *"parallel branches off the third"* — off the **role set**. §0 says otherwise, and
§0 is right: `user_access_profiles` is keyed on the membership pair and never on a role, so the scope branch
leaves at L2, one layer earlier. Branching at the role set would have left the chain five deep and would have
made scope a property of a role. The corrected statement is that **E3a and E3b both leave the membership**.

**One carried consequence follows from the correction.** The accepted §2's second consequence is right about
the first pair and wrong-shaped about the second: scope does not derive from capability, so it cannot escape
it. The correct form is what I-27 already requires —

> **Narrowing is within a branch; composition is across branches.** A layer **MUST NOT** widen what the layer
> above it in the *same* branch permitted. Between branches there is no narrowing relation at all: a gate
> takes the intersection (I-27), and neither branch may read the other's output.

Every gate still owes both branches (§7, I-23), unchanged.

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

### 4.6 What a role-administration surface owes the model

The model has been silent on the operator surface, and that silence has become load-bearing: the Access
workspace is under active simplification, and from the UI alone *simplify the editor* and *change the access
architecture* are not distinguishable. This section supplies the boundary. It specifies **what any role-editing
surface must preserve** — not what it should look like. The shape of the surface remains
`06-product-ia-and-flows.md`'s to design.

The surface today is one workspace at `/organization/access?section=…` with four chapters — `users`, `roles`,
`scopes`, `security` (`web/lib/access/accessChapterRoutes.ts:10`) **[verified]** — rendered by
`AccessWorkspaceSurface` (`:93-118`) **[verified]**, with `/settings/users-roles` retained as a thin named
entrypoint (`UsersRolesConfigurationPage.tsx:7-18`) **[verified]**.

**Roles and Access Scopes are already separate chapters, and that separation is not cosmetic** — it is L3's two
branches made visible to the operator (§1.3). Folding them into a single role editor would put scope inside the
role object and encode the precise category error I-27 forbids. It is the one simplification this document
rules out by name.

Five constraints. Each is a projection of a rule already stated above; none is new policy.

| # | A role-administration surface… | Because | Rule |
|---|---|---|---|
| **R1** | **MUST** offer only `role_key`s present and `is_active` in `role_definitions` for the request's org | one role vocabulary | I-8, I-26 |
| **R2** | **MUST NOT** present scope as an attribute of a role, or a role as an input to a scope control | the branches are independent in both directions | I-27, §0 |
| **R3** | **MUST** be able to add and remove one `(principal, org, role)` row without disturbing the others | membership is the unit; capability is the union of roles | I-10, §4.1 |
| **R4** | **MUST NOT** offer a role-level control that is not a capability grant | a role carries no behaviour of its own | §2 |
| **R5** | **MUST** state, at the control itself, what deactivating a role does to principals already holding it | today it does nothing | M2-3, D10 |

> **I-32 (new).** Simplification is a surface operation. A role-administration surface **MUST NOT** be where
> the access model acquires or loses structure: every fact it writes **MUST** be expressible as rows in
> `user_roles`, `role_definitions` and `role_permission_grants` under the constraints above, and every fact it
> chooses not to show **MUST** remain settable by some sanctioned path.

**R3 is the constraint violated today, and by the API rather than by the UI.** `PATCH /users/[userId]/role`
deletes every role row for the pair and inserts one (`role/route.ts:44-47`) **[verified]**, §4.1. A surface
built on that endpoint **cannot** satisfy R3 however it is drawn. So *"simplify the editor"* and *"do not
change the access architecture"* are jointly satisfiable only if the additive assignment path that I-10 already
requires is built first — otherwise a simplified single-select role control does not merely reflect C7, it
hardens it into the product as an intended design.

> **This is a sequencing constraint on the simplification, and it is the only claim in this section that is not
> purely descriptive:** the additive `(principal, org, role)` assignment API — `03…`'s **`W-17` — Multi-role
> write path** *(M · I-10 · closes C7 · informed by D2)* (`03…:1103`) **[verified]** — **SHOULD** land before,
> or with, any redesign of the Roles chapter.

**The plan of record already says this, and §4.6 only gives it a rule to be checked against.** `03…§14.1`
records the same two facts as non-goals: the four-chapter Access surface *"already exists"* at
`/organization/access` (`03…:1572-1575`, citing `web/tests/access/accessProductUi.test.ts:22-35`), and
`W-10`/`W-17` *"change what those screens are backed by, **not what they are**"* (`03…:1576-1577`)
**[verified]**. R1–R5 and I-32 are the conformance form of that sentence: *what those screens are* is the part
a simplification may move, and *what they are backed by* is the part it may not.

**Escalated, not answered.** The operator guidance that prompted this section — *simplify the role editor
without changing the access architecture* — is a directive to a **surface**, and this document does not own one
(§12.7). What `02` can do is bound it: that is R1–R5, I-32, and the sequencing constraint above. The redesign
itself belongs to `06-product-ia-and-flows.md`, which exists only under
`docs/platform/planning/vacilando-os/qa/access-identity-v2/` and is outside this assignment's declared scope —
the same split `README.md` records as `X-2`. **No UI code, route, component, or QA-folder document was changed
by this pass.**

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
| I-25 | Authority caches keyed and invalidated | **worse** — re-verified in Part II and violated | `adminShellContextCache.ts:12,48,64`; **zero** production invalidation callers (§18, M2-10) |
| **I-26** | **Role deactivation revokes** | **open (new)** | `resolveAdminAccessCore.ts:89-94` vs `role/route.ts:33` |
| **I-27** | **Capability and scope branches are independent both ways** | **open (new)** | `accessScope.ts:60-64` |
| **I-28** | **One normalization, applied at the boundary** | **open (new, Part II)** | three disciplines across the stack, §18 M2-11 |
| **I-29** | **Revocation is effective on the next request** | **open (new, Part II)** | `role/route.ts:44-47` and `remove/route.ts:26-30` invalidate nothing (M2-10) |
| **I-30** | **Every resolver read error denies** | **open (new, Part II)** | `resolveAdminAccessCore.ts:145-161` discards the profile error and widens to `all` (M2-12) |
| **I-31** | **Authority writes are atomic** | **open (new, Part II)** | `role/route.ts:44-47` delete-then-insert, no transaction (M2-14) |
| **I-32** | **A role-administration surface adds and removes no model structure** | **open (new, reopen pass)** | R3 unsatisfiable on `role/route.ts:44-47`; §4.6 |

**Score (32 invariants):** 3 met (I-5, I-6, I-12) · 2 partial (I-3, I-11) · 19 open · 6 worse · 2 carried
unverified (I-4, I-21).

> *Tally note.* Part I's line read "17 open · 5 worse · 4 carried", which summed to 31 against 27 rows. The
> figures above are recounted directly from the table as it now stands; no Part I **status cell** was changed
> except `I-25`, which Part II re-verified.
>
> *Reopen pass (2026-08-06).* `I-32` is appended and the score is recounted from 31 rows to 32 — 18 open
> becomes 19. **No other row's status cell was changed**, and no invariant was renumbered or reworded.

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
| **M2-16** | The chain is specified as **five links** and the schema is **four layers**; §1.3's first statement of the fix also branched at the wrong layer (role set, not membership) | — | **specification clarification**, not a defect — plus an internal inconsistency in Part I, now corrected | `20260504103000…:18-30,50`; frozen `02…:60-89`; §1.3 |

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
| **I-32 (R2)** | Assert no role-administration component reads a scope field, and no scope component reads `roleKeys` — the chapter split of §4.6 holds in code, not only in navigation | static |
| **I-32 (R3)** | Give a fixture principal two roles through the sanctioned path, remove one through the surface's endpoint, assert the other **survives** | integration |
| **I-32 (R1)** | Assert the role options a surface offers equal the `is_active` `role_definitions` rows for the request's org — neither a superset nor a hard-coded list | integration |
| **M2-16** | Assert the model's own diagrams and prose state four layers; no artifact in the corpus draws capability → scope as a sequence | doc-lint |

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

# --- reopen pass (2026-08-06) ---

# §1.3 (M2-16) — scope is keyed on the membership pair, never on a role
rg -n 'user_access_profiles|role' supabase/migrations/20260504103000_user_access_scope_tables_v1.sql | head -20
#   → the profile table has user_id, org_id and two *_scope mode columns; no role column.
#   The accepted five-link wording it restates:
sed -n '60,89p' docs/platform/planning/vacilando-os/qa/access-identity-v2/02-canonical-access-identity-model.md

# §4.6 — the four Access chapters, and the thin users-roles entrypoint
rg -n 'ACCESS_WORKSPACE_CHAPTERS' web/lib/access/accessChapterRoutes.ts
rg -n 'access-chapter-(users|roles|scopes|security)' web/components/adminV2/settings/access/AccessWorkspaceSurface.tsx
cat web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx   # 19 lines

# §4.6 (R3) — why the current endpoint cannot satisfy "remove one role, keep the rest"
rg -n 'delete|insert' 'web/app/api/admin/users/[userId]/role/route.ts'

# §4.6 — the workstream the sequencing constraint names
rg -n 'W-17' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
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
9. **§4.6 constrains a surface it did not review.** The reopen pass read the Access workspace's chapter
   definition, its render dispatch, and the `users-roles` entrypoint — **not** the Roles chapter's own
   component tree, and no browser was opened. R1–R5 are therefore stated as **obligations on any surface**, and
   only R3 is asserted as violated today, on API evidence (`role/route.ts:44-47`) rather than UI evidence.
   Whether the current Roles chapter satisfies R1, R2, R4 or R5 **was not determined** and must not be inferred
   from this section.
10. **The reopen answered one directive and bounded the other.** "Reduce to four layers" is discharged in §1.3.
   "Simplify the role editor" is **not** discharged — no editor was simplified, because this document does not
   own one (§12.7). See §4.6's closing note.

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
- **Reopen pass (2026-08-06), read at `a72caaff4` in `wt6-director-experience-dx5-5-continuation`:**
  `web/lib/access/accessChapterRoutes.ts` (in full — the four chapters and their metadata),
  `web/components/adminV2/settings/access/AccessWorkspaceSurface.tsx` (chapter dispatch, `:81-122`),
  `web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx` (in full — a 19-line wrapper),
  `03-implementation-qa-sequence.md` (`W-17` and the `I-10` coverage rows), and the frozen copy's §2 chain
  (`02…:60-89`) for the five-link wording that §1.3 restates. **No file outside this document was modified.**

---
---

# Part II — Effective-access resolution model

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Effective-access resolution model* · assignment `asg_5a0d3ccf5dea42`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `7df17b9b3`
**Date** 2026-08-03
**Status** Proposed — specification only. No code, schema, or migration is changed by this phase.
**Method** static, file-grounded. Every claim marked **[verified]** was read at the cited `path:line` in this
pass; claims inherited from Part I or the accepted corpus are marked **[carried]**.

**Inputs reused, not re-derived:** Part I §§1–13 (nouns, edges, invariant register), Part I's `M2-1 … M2-9`,
[`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (Mission 2 pass), and
`docs/platform/planning/vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md` §1 for the
surface and capability counts. The accepted model's gate obligations **G-A** (authentication) · **G-B**
(tenancy) · **G-C** (capability) · **G-D** (scope) are **[carried]** verbatim from the frozen copy at
`02…:458-461` and are **not** restated or renumbered here.

---

## 14. Headline — the gate obligations were specified; the function they call was not

The accepted model specified what every **gate** owes: evaluate G-A…G-D in order and fail closed (I-23). Part I
specified what the **nouns** are and how the capability and scope branches hang off a membership (§0, M2-1).
Neither specified the thing in between: **the function that takes a request and produces the facts a gate
evaluates.** That function is what this phase names *effective-access resolution*, and it is where the
platform's authority behaviour actually lives.

Its normative signature is a total function of four inputs:

```
resolveEffectiveAccess(principal, org, operation, resource) → allow | deny(reason)
```

**No function in the codebase has that signature.** What exists resolves **two** of the four inputs — principal
and org — into a *bundle* of facts, and hands the remaining two to each of 559 route files to handle by
convention:

```
   REQUEST
      │
      ▼
   R1 authenticate ──────────────▶ principal            (G-A)
      │
   R2 normalize        ← undefined today (M2-11)
      │
   R3 select org ──────────────▶ (principal, org)       (G-B)
      │
      ├── R4a resolve capability set ────┐              (G-C)   ┐
      │                                  │                      ├── the bundle
      └── R4b resolve scope dims ────────┤              (G-D)   ┘   the platform builds
                                         │
   R5 compose ───────────────────────────┴──▶ decision   ← per-route, by convention (§17.5)
   R6 cache                                              ← 120 s, never invalidated (M2-10)
```

Three claims follow, and they carry §§17–18:

1. **Resolution stops at R4.** The bundle is a *projection of the principal*, not a decision about an
   operation on a resource. `AdminAccessContextSuccess` carries `roleKeys`, `permissionKeys`, and four scope
   fields (`getAdminAccessContext.ts:18-28`) **[verified]** — and no `operation`, no `resource`. R5 is
   therefore not a stage of the model; it is 559 independent implementations of one. The measured consequence
   is already recorded: **1 of 132 admin page routes gates on anything finer than "has a role"** (`05…§1`)
   **[carried]**.
2. **R2 does not exist, and its absence is observable.** Three different normalization disciplines are applied
   to the same `roleKeys` array at different layers, and the enforcing resolver and the operator-facing preview
   resolver disagree (§18, M2-11).
3. **R6 is a correctness stage, not a performance stage, and it is implemented as though it were the latter.**
   A 120-second in-process cache serves every consumer — including mutation gates — and nothing in production
   ever invalidates it (§18, M2-10). Part I could only carry I-25 as unverified; it is now verified, and open.

---

## 15. The normative resolution model

Normative. `MUST` / `MUST NOT` / `SHOULD` / `MAY` per RFC 2119, as in Part I.

### 15.1 The six stages

| Stage | Obligation | Feeds |
|---|---|---|
| **R1 — Authenticate** | Establish a principal of a declared class from the request, or deny `401`. The principal identity **MUST** come from the credential, never from the request body or a path parameter. | G-A |
| **R2 — Normalize** | Reduce every identifier that will be compared — role key, org id, principal id, permission key — to canonical form, **once**, at the point it enters the resolver. | all |
| **R3 — Select org** | Determine the org the request targets **from the request**. A principal with no membership in that org is denied `403`; a principal with memberships elsewhere is not "reduced", it is absent. | G-B |
| **R4a — Resolve capability** | Compute the capability set as the union of grants of the principal's **present and active** role definitions in that org. | G-C |
| **R4b — Resolve scope** | Compute the scope dimensions from the `(principal, org)` access profile, independently of R4a. | G-D |
| **R5 — Compose** | Combine into one decision by **intersection** (§15.3). | the gate |
| **R6 — Cache** | Any memoization **MUST** preserve the properties in §15.2. | all |

R4a and R4b are **siblings** (Part I §0, M2-1): neither is an input to the other, and neither may read the
other's output (I-27).

### 15.2 The five properties a resolution model owes

These are what make the stages a *model* rather than a sequence of queries. Each is testable.

| # | Property | Statement |
|---|---|---|
| **P1** | **Total** | Every `(principal, org, operation, resource)` has a defined answer. "No rule matched" is not a state; it resolves to `deny`. |
| **P2** | **Deterministic** | The same inputs against the same stored state produce the same decision, independent of which entry point asked, which process served it, and what else the request did first. |
| **P3** | **Fail-closed** | Any error, absence, or ambiguity at any stage resolves to `deny`. No stage may substitute a default that is *wider* than what it failed to read (**I-30**). |
| **P4** | **Monotone under revocation** | Removing a membership, a grant, a role definition, or a scope entry **MUST NOT** widen any decision. Adding one **MUST NOT** narrow any decision. |
| **P5** | **Freshness-bounded** | A revocation is effective on the next request (**I-29**). A cache TTL bounds how stale a *read* may be; it is not an implementation of revocation. |

P2 is the property that the existence of parallel entry points threatens (§18, M2-13). P4 and P5 are what the
authority cache breaks today (M2-10). P3 is what the scope read breaks today (M2-12).

### 15.3 The composition rule

> **A decision is the intersection of five independent predicates, evaluated in order, each failing closed:**
>
> ```
> allow  ⟺  authenticated(P)
>        ∧  member(P, O)
>        ∧  admitted(P, O)              -- a granted capability, not a role set (I-16)
>        ∧  capable(P, O, operation)    -- R4a
>        ∧  in_scope(P, O, resource)    -- R4b
> ```
>
> There is no precedence between the conjuncts and no ordering that lets a later term rescue an earlier one.
> A role **MUST NOT** appear as a term. Where a role appears today, it is standing in for a capability that
> was never defined (Part I §6.3, I-16) or bypassing a scope that was (I-27).

Two corollaries that the as-built code violates in opposite directions:

- **No conjunct may be omitted because another passed.** A gate that establishes `member(P,O)` and stops has
  not evaluated `capable` or `in_scope`; it has assumed them. This is I-23, and it is the shape of 131 of 132
  admin page routes (`05…§1`) **[carried]**.
- **No conjunct may be *widened* by another.** `portalAdminBypassesDepartmentScope` lets the admission term
  rewrite the scope term (`accessScope.ts:45,51-53,60-64`) **[verified]** — I-27, and it is baked into the
  shared route gate at `adminRouteGate.ts:64` **[verified]**.

### 15.4 Normalization (R2), stated

> **I-28 (new).** Normalization is part of the resolution model, not of its callers. Exactly one function
> **MUST** define the canonical form of a role key, and it **MUST** be applied where the value enters the
> resolver — not at each comparison site. Any two layers that compare the same value **MUST** compare it in
> the same form. Values that do not survive normalization to a catalog entry **MUST** be dropped from the
> resolved set, not carried through as opaque strings.

This is not pedantry: §18 M2-11 shows the enforcing resolver and the operator-facing preview resolver already
disagree about the same membership row, and the disagreement is entirely a normalization difference.

### 15.5 Cache and revocation (R6), stated

> **I-29 (new).** Revocation is effective on the next request. A write to `user_roles`, `role_definitions`,
> `role_permission_grants`, `user_access_profiles`, `user_department_access`, or `user_site_access` **MUST**
> invalidate every cached authority derived from it *before the write is acknowledged*, for **every** process
> that may serve the next request. A TTL **MAY** bound staleness for performance; it **MUST NOT** be the
> mechanism by which a revocation takes effect.
>
> Corollary — **a cache whose invalidation cannot span the processes that read it is not a valid authority
> cache**, however short its TTL.

> **I-30 (new).** Every resolver read error denies. A failed or unreadable read at any stage **MUST** produce a
> denial. A stage **MUST NOT** substitute a default that grants more than the value it failed to read; in
> particular an unreadable scope row **MUST NOT** resolve to `all`. This strengthens I-19 (*absent scope
> denies*) to cover the case where absence and failure are indistinguishable — which, today, they are.

> **I-31 (new).** Authority writes are atomic. A change to a principal's authority **MUST** leave that
> principal in either its prior complete state or its intended complete state. No path may produce an
> intermediate state with fewer memberships, grants, or scope rows than both.

---

## 16. As-built — one resolver, one-and-a-half copies, five entry points

Every gate in `web/app/api` reaches resolution through one of five exported entry points. All five ultimately
answer the same two questions (which org, which roles) — but they do not share a resolver, a cache, or a
projection.

| Entry point | Resolver | Reads grants? | Reads scope? | Uses the 120 s cache? | Route files |
|---|---|---:|---:|---:|---:|
| `getAdminContextCached` (`getAdminContext.ts:68`) | core | yes | yes | **yes** | **429** |
| `requireAdminOrOps` (`adminAuth.ts:113`) / `requireAdmin` (`:98`) | **portal (light)** / core | **no** / yes | **no** / yes | **no** / yes | **147** |
| `getAdminAccessContextCached` (`getAdminAccessContext.ts:102`) | core | yes | yes | **yes** | **88** |
| `loadAdminRouteGate` (`adminRouteGate.ts:40`) | core | yes | yes | **yes** | **30** |
| `requireAdminOrgContextLight` (`getAdminOrgContextLight.ts:93`) | **portal (light)** | **no** | **no** | **no** | **20** |

Counts are files under `web/app/api/**/route.ts` at `7df17b9b3` **[verified]**, against the 559-file
denominator from `01…§4` **[carried]**. They overlap — a route may use two — so they do not sum to a coverage
figure; §22 bounds them.

A sixth resolution site exists outside the entry points: `getAdminOrgIdForUser` calls `resolveAdminAccessCore`
directly with its own client (`entityLabelsServer.ts:18-25`) **[verified]**, bypassing both the per-request
memo and the cross-request cache. And a seventh path, `resolveAdminAccessDimensionsForOrgMember`
(`resolveAdminAccessCore.ts:209`), serves the operator's own preview of someone else's access at
`users/[userId]/access-scope/route.ts:48,180` **[verified]** — this is the accepted C11 / Part I M2-5 surface,
and §18 M2-11 shows it now disagrees with the enforcing path on a case neither document had identified.

**The repository's own canonical description of this is wrong** (M2-15). `web/README_ADMIN_AUTH.md:21` calls
`resolveAdminAccessCore` the *"Single resolver"*, and `:61` states that `requireAdminOrOps()` fails *"if
`getAdminAuth` fails"* — but `adminAuth.ts:113-118` routes it through `getAdminOrgContextLightCached`, a
different resolver that reads neither grants nor scope **[verified]**.

---

## 17. Stage-by-stage conformance

### 17.1 R1 — Authenticate

**Conforms.** `resolveAuthSessionOnce` resolves the principal from the session once per request, preferring
JWT claims and falling back to `auth.getUser()`, returning `userId: null` on any error
(`cachedAuthSession.ts:17-48`) **[verified]**; `null` becomes `401` at `getAdminAccessContext.ts:44-46`
**[verified]**. `middleware.ts:117,127-131` independently requires a session for operator paths **[verified]**.
The principal is never taken from the body — `selfAuthorityMutation.ts:15-19` says so explicitly and the role
route compares the context id, not a payload field (`role/route.ts:21`) **[verified]**.

**One hygiene note:** `isSelfAuthorityMutation` returns `false` — *permit* — when either id is blank
(`selfAuthorityMutation.ts:23`) **[verified]**. A deny-predicate defaulting to permit is the wrong direction
under P3. It is not reachable today, because the caller id comes from a resolved context that cannot be empty;
it is recorded as a shape to fix, not a live defect.

### 17.2 R2 — Normalize

**Absent.** See §18, M2-11. Three disciplines coexist:

| Discipline | Sites |
|---|---|
| **raw**, exact match | membership selection and `roleKeys` construction (`resolveAdminAccessCore.ts:30,35`); `portalEligible` (`:142`); the grant lookup (`:93`); `canManageUsersAndRoles.ts:16` |
| **trim** | legacy fallback (`:48,56,64`); preview resolver (`:230`); scope bypass (`accessScope.ts:52`); `hasPortalAdminMutateAccess` (`adminPortalRolePick.ts:12`) |
| **trim + lowercase** | `hasPortalRecordManageAccess` (`adminPortalRolePick.ts:18-19`) |

All **[verified]**. Note that two of these sit inside the *same function*: `resolveAdminAccessCore` trims on the
legacy branch and does not trim on the membership branch.

### 17.3 R3 — Select org

**Violates the model.** The org is not taken from the request; it is *inferred* from the principal's
memberships by a lexicographic rule — prefer orgs where the principal holds `admin`/`ops`, then
`[...new Set(pool.map(r => r.org_id))].sort()[0]` (`resolveAdminAccessCore.ts:30-32`) **[verified]**. This is
I-7, **open**, unchanged from Part I.

Its consequence for *this* model is specific: because the org is derived rather than supplied, **G-B is not
evaluable**. There is no org for the gate to check membership *against* — the org is defined as one the
principal is a member of, so `member(P, O)` is true by construction. A multi-org principal's requests are
silently answered in whichever org sorts first, and no gate can detect the mismatch because no gate was told
what org the request meant.

### 17.4 R4a / R4b — Resolve

Both stages run in `resolveAdminAccessCore` (`:107-203`) **[verified]**. The shape is right — they are
independent reads off the same `(user, org)` pair, exactly as Part I §0 specifies. Three defects, all recorded:

- R4a does not join `role_definitions`, so `is_active` is ignored on resolve (Part I §4.4, **M2-3**, I-26)
  **[carried]**.
- R4b's output is then rewritten by a role at the gate (`adminRouteGate.ts:64` → `accessScope.ts:60-64`)
  (Part I §5.4, I-27) **[verified]**.
- Both stages' **error handling is inconsistent within the single function** — §18, M2-12.

### 17.5 R5 — Compose

**Not implemented as a stage.** No shared function evaluates §15.3. Each route composes what it chooses from
the bundle, and the codebase contains exactly **two** named capability predicates, each wrapped by one helper
that pairs it with authentication and returns the scope dimensions unused:

| Predicate (wrapper) | Conjuncts evaluated | Note |
|---|---|---|
| `canReadAnalytics` (`canReadAnalytics.ts:31-37`) — via `requireAnalyticsReadAccess` (`:48-66`) | authenticated ∧ (admitted ∨ capable) | `portalEligible` short-circuits the capability — marked temporary, W-13 (`:29-30`) |
| `canManageUsersAndRoles` (`canManageUsersAndRoles.ts:15-18`) — via `requireUsersRolesManageAuth` (`:25-40`) | authenticated ∧ (role-literal ∨ capable) | `roleKeys.includes("admin")` short-circuits the capability at `:16` |

Both **[verified]**. Both predicates are **disjunctions with a role on the left**, which is the negation of
§15.3's rule that a role is not a term. `canManageUsersAndRoles.ts:16` matters for **D9** (Part I §10): even if
`requireUsersRolesManageAuth` were repointed at `admin.users.write` as D9 recommends, the `admin` role literal
on line 16 would still short-circuit it, so D9's fix is a two-line change, not a one-line change.

`in_scope(P, O, resource)` has no composer at all. `accessScope.ts` supplies the mechanical predicates —
`departmentIdAllowed` (`:38-43`), `locationAllowedUnderSiteScope` (`:118-132`), `resolveRecordScopeConstraints`
(`:179`) **[verified]** — and each route decides whether to call them. That is G-D delegated to convention,
which is why `05…§1`'s count of finely-gated surfaces is 1.

### 17.6 R6 — Cache

Three caching layers sit on the resolution path. Only the second is an authority cache, and it is the one that
breaks P4 and P5.

| Layer | Scope | TTL | Verdict |
|---|---|---|---|
| React `cache()` request memo (`getAdminAccessContext.ts:40`, `adminAuth.ts:63`, `getAdminContext.ts:61`, `getAdminOrgContextLight.ts:30`, `cachedAuthSession.ts:17`) | one HTTP request | request | **Sound.** A transparent dedup; cannot outlive the decision it serves. |
| `adminShellContextCache` (`adminShellContextCache.ts`) | **cross-request, per process** | **120 s** (`:12`) | **Unsound** — §18, M2-10 |
| Entity-label / status-definition caches (`entityLabelsServer.ts:28`, `statusDefinitionsResolve.ts`) | cross-request | 90 s | Out of scope — org-config data, not authority. |

---

## 18. New divergences recorded by this pass

Continuing Part I's `M2-n` series so the accepted `C`/`G` register stays stable.

| # | Finding | Violates | Nature | Evidence |
|---|---|---|---|---|
| **M2-10** | The cross-request authority cache is **never invalidated in production** — a 120 s window in which a revoked principal still resolves as authorized | I-25, I-29, P4, P5 | **fail-open on revocation** | `adminShellContextCache.ts:12,48,64,83`; `role/route.ts:44-47`; `remove/route.ts:26-30` |
| **M2-11** | Role-key normalization differs between the enforcing resolver and the operator preview, so the preview can show capabilities the runtime denies | I-8, I-22, I-28, P2 | preview ≠ runtime | `resolveAdminAccessCore.ts:30,35` vs `:230` |
| **M2-12** | One resolver, four different error dispositions; the scope read **discards its error entirely** and widens to `all` | I-19, I-30, P3 | fail-open on read failure | `resolveAdminAccessCore.ts:111-119,95-98,145-161,170-172` |
| **M2-13** | `requireAdminOrOps` resolves through the **light** resolver, which reads no grants and no scope and does not use the cache — so two gates in one request can disagree about the same principal | I-22, P2 | two answers, one request | `adminAuth.ts:113-118`; `getAdminOrgContextLight.ts:45`; `resolveAdminPortalOrgCore.ts:61-99` |
| **M2-14** | Role reassignment is `delete` then `insert` with no transaction; a failed insert leaves the principal with **zero** memberships | I-31 | non-atomic authority write | `role/route.ts:44-50` |
| **M2-15** | `README_ADMIN_AUTH.md` — the repository's canonical description of this model — asserts a single resolver and misdescribes `requireAdminOrOps`; it cites an **archived** doc as canonical product semantics | — | documentation divergence | `README_ADMIN_AUTH.md:3,21,61` vs `adminAuth.ts:113-118` |

### M2-10, in detail — the 120-second revocation window

`loadAdminAccessBundleOnce` consults a module-level `Map` **before** it touches the database:

```ts
const shellHit = readAdminShellContextCache(userId);
if (shellHit) return shellHit;                            // getAdminAccessContext.ts:48-51
...
if (portalEligible) writeAdminShellContextCache(bundle);  // :72-74
```

**[verified]**. Three properties of this arrangement compound:

1. **The read is unconditional; the write is not.** Every consumer of `loadAdminAccessBundleCached` reads the
   cache — including `requireUsersRolesManageAuth` (`canManageUsersAndRoles.ts:26`) and therefore every
   Settings/RBAC **mutation** route. Only `portalEligible` bundles are written (`:72`). **The cache exists
   exclusively for the principals with the most authority, and serves the routes that change authority.** The
   module's own header says the opposite — *"Mutations must not rely on this cache for authorization"*
   (`adminShellContextCache.ts:5-6`) **[verified]**. Nothing enforces that sentence; the entry point that would
   have to is the shared one.
2. **`invalidateAdminShellContextCache` has zero production callers.** It is defined at
   `adminShellContextCache.ts:83` and referenced only by its own module and
   `web/tests/adminV2/adminShellContextCache.test.ts:5,75` — a repository-wide search finds no other
   occurrence **[verified]**. The docstring names the two events that should call it — *"logout / org switch"*
   (`:82`) — and neither does. Nor does any authority write: `PATCH /api/admin/users/[userId]/role`
   (`:44-47`), `POST /api/admin/users/[userId]/remove` (`:26-30`), and the access-scope route all write and
   return without touching it **[verified]**.
3. **Even if they did, it would not be sufficient.** `cache` is a module-level `Map`
   (`adminShellContextCache.ts:20`) **[verified]** — per process. An invalidation call in the process that
   served the write cannot reach the entry in any other process that served a read. This is why I-29 is stated
   with a cross-process clause: the fix is not "add an invalidate call," it is "this is the wrong mechanism for
   an authority cache."

**The failure, concretely.** An operator removes a compromised `admin` from the org. The `DELETE` succeeds and
the API returns `{ ok: true }` (`remove/route.ts:32-34`). The removed principal's next request hits
`readAdminShellContextCache`, gets the bundle resolved before the deletion, and passes every gate built on
`loadAdminAccessBundleCached` — the 429 + 88 + 30 route files in §16 — for **up to 120 seconds**, in each
process holding a warm entry. Nothing in the product surfaces this delay, and the operator has been told the
removal succeeded.

The same window applies to demotion (`role/route.ts`) and to scope narrowing (`access-scope/route.ts`). It does
**not** apply to `requireAdminOrOps` / `requireAdminOrgContextLight` routes, which resolve fresh — which is
M2-13's disagreement, arriving here as the *safe* side of an inconsistency.

> This is the single sharpest finding in either part of this document. Part I could only carry I-25 as
> unverified (§7). It is now verified, and it is the only recorded defect that lets a principal act **after** an
> operator has revoked their authority and been told it worked.

### M2-11, in detail — the preview and the runtime normalize differently

`user_roles.role` is unconstrained `text` (Part I §4.2, M2-2) **[carried]**. The two resolvers read it
differently:

| | Enforcing (`resolveAdminAccessCore`) | Preview (`resolveAdminAccessDimensionsForOrgMember`) |
|---|---|---|
| `roleKeys` built as | `.map(r => r.role)` — **raw** (`:35`) | `.map(r => String(r.role).trim())` — **trimmed** (`:230`) |
| `portalEligible` | `PORTAL_ROLES.has(r)` on raw (`:142`) | on trimmed (`:233`) |
| grant lookup | `.in("role_key", raw)` (`:93`) | `.in("role_key", trimmed)` (`:234`) |

**[verified]**. For a membership row holding `"admin "`, the enforcing path yields `portalEligible: false` and
an **empty** capability set (the grant lookup matches nothing), while the preview path yields
`portalEligible: true` and the **full** `admin` grant set. Settings → Users & Roles shows a working portal
administrator; every runtime gate returns 401/403.

**Bounded honestly:** the product's own assignment path trims the submitted role (`role/route.ts:26`)
**[verified]**, so this state is not reachable through the UI. It is reachable through the writers that M2-2
shows are unconstrained — seeds, imports, direct SQL — which is precisely the population that `user_roles`'
missing foreign key leaves unguarded. The finding is that **the model has no defined normal form**, which
M2-11 makes observable; it is not a claim that padded rows exist in any live org. None was inspected.

### M2-12, in detail — four error dispositions in one function

`resolveAdminAccessCore` handles a failed read four different ways:

| Read | On error | Effect | Direction |
|---|---|---|---|
| `user_roles` (`:111-119`) | `return null` | `403` | **closed** ✓ |
| `role_permission_grants` (`:89-98`) | log, return `[]` | capability set empty — but `portalEligible` is computed at `:142` **before** and is unaffected | **open** for the 131-of-132 surfaces that gate on admission alone |
| `user_access_profiles` (`:145-150`) | **error not destructured at all** | indistinguishable from "no row" ⇒ `departmentScope`/`siteScope` = `all` (`:152-161`) | **open — widest possible** |
| `user_department_access` / `user_site_access` (`:165-191`) | log, allow-list `[]` | narrowest possible | **closed** ✓ |

**[verified]**. The third row is the defect: the scope read is the only one whose error is *silently dropped*,
and it is the one whose failure default is maximal. I-19 already required that *absent* scope deny; this pass
finds that a transient read failure is indistinguishable from absence and resolves the same way — so the fix
must cover both, which is why I-30 is stated in terms of failure, not absence.

The second row is subtler and worth stating: because `portalEligible` is derived from `roleKeys` and not from
grants, **a total outage of the grant table does not reduce a portal admin's access at all** on any route that
gates on admission — it only silently strips capability-gated features. Part I §6.3's I-17 (portal eligibility
is never sufficient) is what makes that safe; until I-17 holds, the grant table is not on the critical path for
almost any decision.

---

## 19. Conformance checks

Mechanical, and each fails today. These extend Part I §9; the accepted §12 table stands **[carried]**.

| Invariant | Check | Kind |
|---|---|---|
| **I-28** | One exported `normalizeRoleKey`; assert no other module trims, lowercases, or raw-compares a role key. Property test: the enforcing and preview resolvers return identical `roleKeys` and `permissionKeys` for the same fixture rows, including whitespace and case variants | static + property |
| **I-29** | Integration: resolve a fixture principal (warming the cache), revoke the membership, resolve again in the **same process** and in a **second** process — assert both deny. Assert every authority-write route is in a list of routes that invalidate | integration |
| **I-30** | Fault injection: force each of the five resolver reads to error in turn; assert every case denies. Static: assert no Supabase call in the resolution path destructures `data` without `error` | integration + static |
| **I-31** | Integration: fail the `insert` in `PATCH /users/[userId]/role`; assert the principal's memberships are unchanged | integration |
| **P2** | For a fixture principal, assert every entry point in §16 returns the same `orgId` and `roleKeys` — including when one is served from cache and another is not | integration |
| **P4** | Property: for any removal of a membership / grant / scope row, no `(P,O,X,R)` decision flips deny → allow | property |
| **§15.3** | Static: assert no capability composer contains a role literal on either side of a disjunction (`canManageUsersAndRoles.ts:16` fails this today) | static |
| **M2-15** | `README_ADMIN_AUTH.md` asserts a resolver and entry-point set; assert it matches the exports actually present | static |

The I-29 check is the one that would have caught M2-10: it asks not *"is the cache correct"* but *"does
revocation take effect"* — and it must run in two processes, or it passes for the wrong reason.

---

## 20. Decisions

Part I's **D1 – D4** and **D9 – D10** carry forward unchanged. Two are added; neither is worker-resolvable.

**D11 — What is the maximum acceptable revocation latency, and does an authority cache survive the answer?**
Today the answer is *up to 120 seconds, unbounded in the number of processes, with no operator signal*
(M2-10). If the product's answer is **zero** — a revocation is effective on the next request — then
`adminShellContextCache` cannot be kept in its current form, because a per-process `Map` cannot be invalidated
across processes; it would have to become a shared store keyed on the authority inputs, or be dropped from the
resolution path and replaced with the per-request memo alone.
*Recommendation:* **zero, and drop the cache from the authority path.** The per-request React `cache()` memo
already collapses repeated resolution within a request, which is where the measured cost was
(`getAdminAccessContext.ts:76-83` warns only above 400 ms). Keeping a 120-second cross-request window buys
latency on reads that are already memoized, and pays for it with the one behaviour an access system may not
have: an operator being told a revocation succeeded when it has not yet taken effect. If the cache is kept for
measured reasons, then the minimum is: shared store, keyed on every authority input, invalidated
synchronously by every authority write, and **never** read by a mutation gate.

**D12 — Is the light resolver a permitted optimization or a second source of truth?**
`resolveAdminPortalOrgCore` duplicates ~40 lines of the legacy fallback verbatim and serves
`requireAdminOrOps` — 147 route files (§16) — with an answer computed from different code and cached
differently (M2-13). It is *currently* consistent on org and roles because it shares
`chooseOrgAndRoleKeysFromMembershipRows`; it is inconsistent on freshness today, and nothing prevents the
duplicated fallback from drifting.
*Recommendation:* **optimization, not a resolver.** Keep one resolution function and let entry points differ
only in what they **project** from it — never in what they **compute**. Concretely: have the light path call
the same core and skip the grant/scope *reads*, rather than re-implementing the selection and fallback logic.
This subsumes I-22 and Part I's M2-5 into a single structural rule and removes the P2 violation as a
side-effect.

---

## 21. Reproduce

```bash
# §16 — entry-point census (files under web/app/api/**/route.ts)
rg -l 'getAdminContextCached'                       -g 'route.ts' web/app/api | wc -l   # 429
rg -l 'requireAdminOrOps|requireAdmin\('            -g 'route.ts' web/app/api | wc -l   # 147
rg -l 'getAdminAccessContextCached'                 -g 'route.ts' web/app/api | wc -l   #  88
rg -l 'loadAdminRouteGate'                          -g 'route.ts' web/app/api | wc -l   #  30
rg -l 'getAdminOrgContextLightCached|requireAdminOrgContextLight' -g 'route.ts' web/app/api | wc -l  # 20

# §16 — resolution sites outside the entry points
rg -n 'resolveAdminAccessCore\(|resolveAdminPortalOrgCore\(|resolveAdminAccessDimensionsForOrgMember\(' web/lib web/app

# §18 M2-10 — the cache is read unconditionally, written only for portal-eligible, invalidated nowhere
rg -n 'readAdminShellContextCache|writeAdminShellContextCache' web/lib/admin/getAdminAccessContext.ts
rg -n 'invalidateAdminShellContextCache' web/            # definition + test only
rg -n 'ADMIN_SHELL_CONTEXT_CACHE_TTL_MS|new Map' web/lib/adminV2/adminShellContextCache.ts
rg -n 'user_roles|invalidate' web/app/api/admin/users/\[userId\]/role/route.ts \
                              web/app/api/admin/users/\[userId\]/remove/route.ts

# §17.2 / §18 M2-11 — three normalization disciplines; enforcing vs preview
rg -n '\.trim\(\)|PORTAL_ROLES\.has|roleKeys\.includes' \
  web/lib/admin/resolveAdminAccessCore.ts web/lib/admin/accessScope.ts \
  web/lib/admin/adminPortalRolePick.ts web/lib/admin/canManageUsersAndRoles.ts

# §18 M2-12 — four error dispositions; the profile read drops its error
rg -n 'error|const \{ data' web/lib/admin/resolveAdminAccessCore.ts

# §18 M2-13 / M2-15 — requireAdminOrOps resolves through the light path; the README says otherwise
rg -n 'requireAdminOrOps' -A 6 web/lib/adminAuth.ts
rg -n 'Single resolver|getAdminAuth. fails' web/README_ADMIN_AUTH.md

# §18 M2-14 — delete then insert, no transaction
rg -n 'delete\(\)|insert\(' web/app/api/admin/users/\[userId\]/role/route.ts
```

---

## 22. Limits

1. **Static and file-grounded.** No request issued, no browser used, no live database queried, no test suite,
   typecheck, or build run. The only file written by this phase is this document.
2. **The 120-second window is derived from code, not observed.** `ADMIN_SHELL_CONTEXT_CACHE_TTL_MS = 120_000`
   (`adminShellContextCache.ts:12`) and the read/write sites were read; **no request was issued to demonstrate
   a revoked principal being served.** The mechanism is verified; the exploit is reasoned, not reproduced.
   Whether any deployed environment runs multiple server processes — which governs how many warm entries a
   single invalidation would have to reach — was not established.
3. **The entry-point counts are file counts, not gate counts.** A file may call an entry point in several
   handlers, or call two entry points; the sets overlap and do not sum to coverage. They bound how much of the
   route surface depends on each path — nothing finer.
4. **M2-11 is a model finding, not a live-data claim.** No org's `user_roles` rows were read. The divergence is
   in the two resolvers' code; whether any row today triggers it is unknown and was not investigated.
5. **R5 was surveyed through named composers only.** Routes that inline a capability check without one of the
   three helpers in §17.5 were not enumerated — the same grep-is-a-floor rule Part I applies to M2-7. `web/app`
   was not swept for inline scope predicates.
6. **Part I's carried claims remain carried.** Part II re-verified I-25 and the resolution path; it did **not**
   re-verify I-4 or I-21, which stay inherited.
7. **Not a threat model, not an RLS policy review, no product UI claim.** RLS is out of scope here for the same
   reason as Part I: 534 of 559 routes bypass it (`01…§3.6`) **[carried]**, so it is not on the resolution path
   this document specifies.
8. **Read-only.** No source, schema, migration, or UI was modified. The frozen QA copies are untouched.

---

## 23. Provenance — Part II

- **Inputs (reused, not re-derived):** Part I §§0–13 of this file; `01-existing-state-inventory.md` (Mission 2
  pass, 2026-08-03); `05-command-enforcement-census.md` §1 (surface/capability counts); the frozen
  `02-canonical-access-identity-model.md` (mission `msn_e9133cdade883793d2`) for **G-A…G-D** and I-1…I-25.
- **Application code read this pass, in full:** `getAdminAccessContext.ts`, `getAdminContext.ts`,
  `getAdminOrgContextLight.ts`, `resolveAdminPortalOrgCore.ts`, `adminShellContextCache.ts`,
  `cachedAuthSession.ts`, `adminAuth.ts`, `adminRouteGate.ts`, `adminPortalRolePick.ts`,
  `canReadAnalytics.ts`, `canManageUsersAndRoles.ts`, `selfAuthorityMutation.ts`, `middleware.ts`,
  `web/app/api/admin/users/[userId]/role/route.ts`, `web/app/api/admin/users/[userId]/remove/route.ts`,
  `README_ADMIN_AUTH.md`.
- **Read in part:** `resolveAdminAccessCore.ts` (both resolvers, in full — re-read this pass),
  `accessScope.ts:1-180`, `entityLabelsServer.ts:1-32`.
- **Repository-wide searches:** `invalidateAdminShellContextCache` (2 non-definition occurrences, both in one
  test), the five entry-point identifiers scoped to `web/app/api/**/route.ts`, direct callers of the three
  resolver functions.
- **Verified at** `7df17b9b3` in `wt6-vacilando-os-product-def`.

---
---

# Part III — Decisions requiring approval

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Decisions requiring approval* · assignment `asg_90a921a3b7f414`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `852f93ff8`
**Date** 2026-08-03
**Status** Proposed — specification only. No code, schema, migration, or UI is changed by this phase, and **no
decision is answered by it.**
**Method** static, corpus-grounded. This part **reuses the accepted and delivered corpus as input and
re-derives nothing.** Every decision below was raised, argued and given a recommendation by another document;
what is new here is the *register* — one ID per question, one place, with the couplings and the ordering made
explicit. Claims marked **[verified]** were read at the cited `path:line` in this pass.

---

## 24. Headline — the corpus has twenty-one open decisions and no way to name them

Nine required outputs have raised **21 open decisions across six documents**. None is worker-resolvable; all
are recorded rather than assumed, per the mission's document-authority rule. Two further decisions have been
**closed** — one by the corpus, one by implementation (§29).

The problem this part exists to solve is not that the decisions are unrecorded. It is that they are recorded
**five times over, in five different documents, under numbers that collide** — `01…§30` states it plainly:
*"the decision register cannot currently be cited"* (`01…:1172`) **[verified]**. `D11` today denotes three
different questions; `D12` and `D13` denote two each. A Director asked to *"approve D11"* cannot act on the
sentence.

Three things follow, and the third is the one that makes this worth doing now rather than later:

1. **Consolidation is not renumbering.** `01…§30` escalates one renumbering pass as **Director-owned**, and
   §32 of that document repeats that where the canonical artifacts live is not a worker decision
   (`01…:1211-1213`, `:1253-1254`) **[verified]**. This part therefore *proposes* a canonical numbering
   (§26) and **applies it to no source document**. Until it is ratified, the superscript form (`D11`ᴬ) that
   `01…§30` introduced remains the safe citation.
2. **The numbering can be made almost free.** Under the rule in §26, **every decision whose number does not
   collide keeps its number**, and for each collision the reading downstream text most often means keeps its
   number too. Three questions change number; nothing else moves.
3. **Nothing downstream has bound to a colliding number yet — and that will not last.** This pass searched
   the two artifacts that bind to decision IDs: `07-director-acceptance-rubric.md` cites exactly one decision,
   `D4`, three times (`:117`, `:127`, `:182`), and `03-implementation-qa-sequence.md` cites only `D1`–`D4`
   (10 × `D3`, 9 × `D4`, 8 × `D2`, 4 × `D1`; **zero** occurrences of `D5`–`D14` or `D-IA n`) **[verified]**.
   Every one of those is an uncollided number. **GAP-14's decision half has not yet corrupted a single
   acceptance criterion or regression lock.** It becomes expensive the moment the authentication wave — which
   owns four of the colliding readings and currently has no workstream at all (`01…:1162-1163`) — acquires a
   rubric row. This is a window, and it is open today.

> The corpus's recurring failure mode, named at `01…§8` and demonstrated against the corpus itself at
> `01…§18`: *check that a plan's premises still hold at execution time.* A decision register whose IDs are
> ambiguous is that failure mode in its cheapest-to-fix form.

---

## 25. The canonical register

Twenty-one open decisions. `AD-n` is the proposed canonical ID (§26); **Legacy** is how the corpus cites the
question today, and remains valid. **Blocks** uses the gap numbering of `01…§26`. Every **Recommendation** is
**[carried]** verbatim in substance from the owning document — this part endorses none and originates none.

| `AD` | Legacy | Question | Owner (defined at) | Blocks | Recommendation **[carried]** |
|---|---|---|---|---|---|
| **AD-1** | `D1` | Does a person ever become a principal? | frozen `02…:646` | GAP-13 | "Not yet" — adopt §3's five rules now |
| **AD-2** | `D2` | What are `regional_lead` / `school_director` for? | frozen `02…:652` | GAP-4 (`W-13` value) | Grant them `portal.access`; admission is configuration |
| **AD-3** | `D3` | What is the delegation ceiling? | frozen `02…:657` | GAP-8 (`W-18`) | Subset rule + self-elevation ban |
| **AD-4** | `D4` | Is RLS an authority layer? | frozen `02…:662` | GAP-6 (`W-19` sizing) | **(b)** not an authority layer, with (a) as a stated goal |
| **AD-5** | `D5` | Does account state live per-org or per-account? | `04…:735`, re-anchored `:446` | GAP-1, GAP-2 | Per-`(user, org)`; `locked` per-credential, short-circuits every org |
| **AD-6** | `D6` | Does deactivating an **account** revoke the credential? | `04…:741`, re-anchored `:447` | **GAP-1** | **Yes**, and explicitly — never as a side effect of deleting a role row |
| **AD-7** | `D7` | MFA scope for the first wave | `04…:746` | GAP-2 | Operators first, policy-by-role; do not couple to parent/guardian |
| **AD-8** | `D8` | Is SSO/SAML in V2 at all? | `04…:750` | GAP-2 | Specify the policy shape; do not build it |
| **AD-9** | `D9`ᴬ | Is `ops` a user-and-role administrator? | §10 of this file | **GAP-8** | **Not intended** — gate on `admin.users.write` / `admin.roles.write` |
| **AD-10** | `D10`ᴬ | Does deactivating a **role** revoke it? | §10 of this file | **GAP-1** | **Revoke** — the toggle is a security decision, not a documentation one |
| **AD-11** | `D11`ᴬ | Maximum acceptable revocation latency — and does an authority cache survive the answer? | §20 of this file | **GAP-1** | **Zero**; drop the cross-request cache from the authority path |
| **AD-12** | `D12`ᴬ | Is the light resolver an optimization or a second source of truth? | §20 of this file | GAP-7 | **Optimization** — entry points may differ in what they *project*, never in what they *compute* |
| **AD-13** | `D13`ᴬ | Is the unauthenticated public surface inside the tenancy model, or beside it? | `01…:759` | GAP-11 | **Inside** — derive org from the request; delete the env coupling |
| **AD-14** | `D14` | Is abuse control a security control in this platform? | `01…:769` | GAP-2 | **Yes** for credential and unauthenticated surfaces; out of scope elsewhere, in writing |
| **AD-15** | `D11`ᴮ | Is the admin password-reset trigger bounded to the caller's org? | `04…:459` | GAP-11 | **Bound it** — resolve to a membership in `access.orgId`, 404 otherwise |
| **AD-16** | `D12`ᴮ | What step-up does a password change require? | `04…:466` | **GAP-1** | Recovery-type session for reset; current password in-session; **split the two** |
| **AD-17** | `D13`ᴮ | Which identity-verification mode is the platform's asserted contract? | `04…:472` | GAP-2 | **Local JWKS verification**, asserted by a test that fails if the posture changes |
| **AD-18** | `D-IA1` | Does the Users chapter show account status or membership status? | `06…:571` | GAP-12 | Membership status primary; credential state a distinct secondary marker |
| **AD-19** | `D-IA2` | Does the directory show a person, or an account? | `06…:579` | GAP-13 | Account primary; linked person an explicit **nullable** attribute — never matched by email |
| **AD-20** | `D-IA3` | Is a reusable access policy in V2, and what is it? | `06…:588` | GAP-12 | Specify now, build after the resolver |
| **AD-21** | `D-IA4` | Is time-boxed access in the first wave? | `06…:595` | GAP-12 | Specify now, build after the resolver — it is a scope attribute, not a new concept |

**Reconciliation with `01…§30`.** That table carries **17 rows for these same 21 questions** — it merges
`D6 ≡ D10` into one row (`01…:1184`) and collapses `D-IA1…D-IA4` into one (`:1195`) **[verified]**. Both
compressions are deliberate and correct in their context; this register expands them because a decision that
must be *decided* with another is still a decision that must be *recorded* separately (§27, sitting 1).

---

## 26. The collision map, and the renumbering rule

### 26.1 What collides, exactly

**[verified this pass]** against every defining site:

| Number | Reading ᴬ | Reading ᴮ | Third reading | Live meanings |
|---|---|---|---|---|
| `D1`–`D8` | — | — | — | **1** each — no collision |
| `D9` | Is `ops` a user-and-role administrator? (§10) | *none* — see §30, `X-6` | *conflict resolution* (`06…:861`) — **closed** | **1** |
| `D10` | Does role deactivation revoke? (§10) | — | *where Access lives in nav* (`06…:868`) — **closed** | **1** |
| `D11` | Revocation latency (§20) | Reset trigger org-bounding (`04…:459`) | *time-boxed access* (`06…:873`) — superseded by `D-IA4` | **2** |
| `D12` | Light resolver (§20) | Password step-up (`04…:466`) | — | **2** |
| `D13` | Public-surface tenancy (`01…:759`) | Verification mode (`04…:472`) | — | **2** |
| `D14` | Abuse control (`01…:769`) | — | — | **1** |
| `D-IA1`–`D-IA4` | `06…:571-599` | — | — | **1** each — namespaced deliberately (`06…:550-558`) |

Six numbers carry more than one definition in the corpus; **three of them carry more than one *live*
definition** (`D11`, `D12`, `D13`). That is the whole of the decision collision — smaller than the raw
citation count suggests, and correspondingly cheap to close.

### 26.2 The rule

The proposed numbering is not an arbitrary reassignment. It is generated by three clauses, in order:

1. **A number that does not collide keeps its value.** `D1`–`D8` and `D14` are unchanged.
2. **For a collision, the ᴬ reading keeps the number.** `D9`ᴬ → `AD-9`, `D10`ᴬ → `AD-10`, `D11`ᴬ → `AD-11`,
   `D12`ᴬ → `AD-12`, `D13`ᴬ → `AD-13`. The ᴬ readings are the ones the model documents and the gap analysis
   most often mean, so this minimizes silent misreadings of text already written.
3. **Displaced readings are reassigned above the existing range**, in source order: `D11`ᴮ → `AD-15`,
   `D12`ᴮ → `AD-16`, `D13`ᴮ → `AD-17`, then `D-IA1…D-IA4` → `AD-18…AD-21`.

**Net churn: three questions change number** (`D11`ᴮ, `D12`ᴮ, `D13`ᴮ — all owned by `04`, all in the
authentication wave that has no workstream yet), plus the `D-IA` block folds into the main series. Eighteen of
twenty-one keep the number they are cited by today, and — per §24 — **no existing citation in `03` or `07`
points at a number that moves** **[verified]**.

### 26.3 The superscript convention does not survive contact with `D13`

`01…§26` states the convention as *"ᴬ = the `02…` reading, ᴮ = the `04…` reading"* (`01…:1027-1028`)
**[verified]**. It does not hold for `D13`: `02` defines no `D13`, and `01…§30` assigns `D13`ᴬ to its **own**
§19 reading and `D13`ᴮ to `04`'s (`01…:1192-1193`) **[verified]**. The convention is therefore a per-row
assignment recorded in one table, not a rule a reader can apply — which means the current safe citation form
requires having read `01…§30`. Recorded as `X-8` (§30). It is an argument for ratifying §26.2 rather than
living on superscripts.

---

## 27. The decisions, by sitting

Six sittings. The grouping is not thematic tidiness: within each sitting the decisions **share an enforcement
point, a mechanism, or a migration**, so deciding them apart produces either a second flag that means nothing
or a second migration. `04…§7` makes this argument for sitting 1 and it generalizes (`04…:451-455`)
**[verified]**.

### Sitting 1 — Revocation *(AD-6, AD-10, AD-11, AD-16)*

**One question at four layers: what does it mean to take authority away?** Today the answer is *nothing, three
times over* — an inactive account whose credential still works (`04…§2.3`), an inactive role that still
resolves (M2-3, §4.4), and a removal that a warm cache keeps serving for up to 120 seconds (M2-10, §18).

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-6** | (a) deactivation disables the credential explicitly · (b) deactivation is membership-only and the credential persists | `04…:447` — "yes" is **a build, not a toggle**: no revocation call exists at all |
| **AD-10** | (a) `is_active = false` revokes on next resolve · (b) it means *unassignable*, and the UI must say so at the toggle | Every day it is open, an operator's security action is a documentation action |
| **AD-11** | (a) zero latency; drop the cross-request cache · (b) keep it as a shared store, keyed on every authority input, invalidated synchronously, never read by a mutation gate | **Live fail-open.** This is "the single sharpest finding in either part of this document" (§18) |
| **AD-16** | (a) recovery-type session for reset **and** current password in-session, split · (b) status quo | Until decided, "session possession is account ownership" (`04…:469-470`) |

**Why these are one sitting.** `04…§7` states it for two of them — *"D6 and D10 are one question… they should be
decided in one sitting, and **I-26 and I-30 implemented against one enforcement point**, or the platform will
acquire a second inactive-means-nothing flag"* (`04…:451-455`) **[verified]**. AD-11 belongs with them because
a revocation that resolves correctly and is then served from a stale cache has not happened, and AD-16 because
a password change an attacker can perform is a revocation the operator cannot rely on. All four land in the
coherent wave `01…§29` describes with a single exit test: **revoke, then assert denial on the next request in
a second process** (`01…:1160-1161`) **[verified]**.

**One input is missing, and it changes the price, not the answer.** `U-7` — *does the platform run more than
one server process?* — *"decides whether `D11`ᴬ has a cheap answer or an architectural one"* (`01…:1309`)
**[verified]**. It does not decide **whether** revocation must be immediate. Do not let AD-11 wait on `U-7`;
let the *implementation* wait on it.

### Sitting 2 — Delegation *(AD-3, AD-9)*

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-3** | (a) a principal may grant only a subset of what it holds · (b) a named ceiling role · (c) no ceiling | Blocks `W-18`; needed before wave 5 (`03…:1047`) |
| **AD-9** | (a) `ops` ≠ `admin` — move the gate to `admin.users.write` / `admin.roles.write` · (b) `ops` **is** an administrator, and the product should say so | In any default-seeded org, `ops` can promote itself to `admin` today (§4.5) |

**Decided together, shipped apart.** Both are about how far delegated authority reaches, and the same seed
evidence answers both. But `01…§30` is explicit that AD-9's *fix* is **independent of AD-3 and should not
wait** (`01…:1187`) **[verified]**, and §10 makes the same point: it is "a small change that makes an existing
seed decision effective." AD-3 is the sharper *design* question; AD-9 is the one with a live consequence.

### Sitting 3 — Authentication *(AD-5, AD-7, AD-8, AD-14, AD-17, AD-18)*

This sitting unblocks **GAP-2, the gap with no workstream at all** — *"the whole of `04…§6`, which has no
workstream because `03` was sequenced before `04` existed"* (`01…:1162-1163`) **[verified]**.

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-5** | (a) state per-`(user, org)`, `locked` per-credential · (b) all state per-account | Gates AD-18 and the whole lifecycle model |
| **AD-7** | (a) operators first, policy-by-role · (b) operators and parents together | Coupling to parent/guardian pulls in SMS OTP, itself new |
| **AD-8** | (a) specify the policy shape, build nothing · (b) build SSO in V2 · (c) preclude it | "the one method here that materially changes tenancy and provisioning" (`04…:752`) |
| **AD-14** | (a) a security control for credential + unauthenticated surfaces, out of scope elsewhere **in writing** · (b) not a platform concern | Alloy can mail a reset link to an arbitrary address with no rate limit and no membership check (`01…:774-776`) |
| **AD-17** | (a) assert local JWKS verification · (b) assert remote `getUser()` validation | `U-4`: the current mode is an inherited default of unversioned hosted configuration; **every session-security statement in `07` depends on it** (`01…:1306`) |
| **AD-18** | (a) membership status primary, credential state secondary · (b) one merged badge | `06…:577` — "the IA half of D5", cannot be deferred behind it |

**AD-18 travels with AD-5, not with the IA work.** `06…§8` is explicit: the IA consequence *"is immediate and
cannot be deferred behind"* the account-state question, *"and should be decided in the same sitting"*
(`06…:571-577`) **[verified]**.

### Sitting 4 — Tenancy *(AD-13, AD-15)*

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-13** | (a) inside the tenancy model — derive org from host/token/path, delete `ALLOY_PUBLIC_ORG_ID` · (b) single-tenant by design, stated and made visible to operators | *"small **now**, and becomes a migration once a second tenant has a public surface"* (`01…:766-767`) |
| **AD-15** | (a) bound the target to a membership in the caller's org · (b) unbounded by design | *"small, independent of D5–D8, and should not wait for the lifecycle work"* (`04…:463-464`) |

Both are instances of GAP-11 — *"tenancy has three holes; two are unplanned"* (`01…:1022`), of which `W-22`
covers only `I-7` **[verified]**. AD-15 is also the tenancy half of AD-14's mail primitive: it is the
membership bound, where AD-14 supplies the volume bound. **Neither alone closes the asymmetry `01…§19`
describes.**

### Sitting 5 — Vocabulary and resolver shape *(AD-2, AD-4, AD-12)*

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-2** | (a) admit them via `portal.access` · (b) retire them from the seed | **Cost compounding** — now seeded per org on insert (§4.3); answering after wave 4 costs a second grant migration (`03…:1053-1056`) |
| **AD-4** | (a) RLS is an authority layer and must agree with the API · (b) it is not, with (a) as a stated goal | **The one decision a delivered artifact binds to** — `07…:117` makes `AE-3` satisfiable two ways, and one of them *is* this decision |
| **AD-12** | (a) one resolution function; entry points project, never compute · (b) two resolvers, kept consistent by discipline | Nothing prevents the duplicated fallback from drifting (M2-13) |

**AD-4 is more durable than it was recorded.** §8's M2-6 shows the never-seeded `owner`/`manager` vocabulary
has leaked out of RLS into live application gates, so *"remediating C10 in SQL alone would now leave the leak
behind"* (§8). And `U-3` records that **no policy-by-policy RLS review has ever been done** — *"GAP-6 and `D4`
are being decided from secondary evidence"* (`01…:1305`) **[verified]**. AD-4 is the one decision in this
register whose recommendation rests on evidence the corpus itself flags as insufficient.

### Sitting 6 — Person, policy, and the shape of scope *(AD-1, AD-19, AD-20, AD-21)*

Four *specify-now, build-later* decisions. None blocks current work; each becomes a migration if answered after
the resolver lands.

| `AD` | Options | Cost of deferral |
|---|---|---|
| **AD-1** | (a) not yet — adopt the five rules now · (b) design E1 in V2 | *"genuinely not blocking"* — §3's rules hold either way (`03…:1050-1051`) |
| **AD-19** | (a) account primary, person an explicit nullable attribute · (b) person primary | A directory that resolves a person by email is *"the prohibited join at its most tempting"* (`06…:585-586`) |
| **AD-20** | (a) specify now, build after the resolver · (b) out of V2 | Without it, *"every user edit is hand-authored scope"* (`06…:593`) |
| **AD-21** | (a) specify now, build after the resolver · (b) out of V2 | Needs expiry in the resolver **and** a sweep; the Expired state has no home until `IA-R2` exists |

**AD-1 and AD-19 are the same question at two altitudes** and should be decided together: AD-1 asks whether
the person↔principal edge may ever exist, AD-19 asks what the directory may display *while it does not*.
`06…§8` deliberately declines to presume AD-1 (`06…:582-584`) **[verified]** — that restraint is only durable
if both are answered in one sitting.

---

## 28. Approval order — and what each sitting releases

Ordered by *live consequence*, then by *cost compounding*. This is a recommendation about sequence only; it
answers nothing.

| # | Sitting | Releases | Why here |
|---|---|---|---|
| **1** | **Revocation** (AD-6, AD-10, AD-11, AD-16) | **GAP-1**, and 3 of the 8 truthfulness mechanisms in `01…§31` (rows 1, 6, 7) | The only recorded defect that lets a principal act **after** an operator was told revocation worked (§18). It is a live fail-open, not a design gap |
| **2** | **Delegation** (AD-3, AD-9) | GAP-8; AD-9 ships without AD-3 | `ops` self-promotion is available in any default-seeded org today |
| **3** | **Authentication** (AD-5, AD-7, AD-8, AD-14, AD-17, AD-18) | **GAP-2** — the gap with *no workstream* | Six decisions gate an entire unplanned wave; until they are answered `03` cannot even size it |
| **4** | **Tenancy** (AD-13, AD-15) | GAP-11's two unplanned holes | Both are small today and one becomes a migration on the second tenant |
| **5** | **Vocabulary & resolver** (AD-2, AD-4, AD-12) | GAP-4, GAP-6, GAP-7 | AD-2 compounds per org seeded; AD-4 should be preceded by the `U-3` review |
| **6** | **Person, policy, scope shape** (AD-1, AD-19, AD-20, AD-21) | GAP-12, GAP-13 | Specify-now/build-later by their own recommendations; nothing waits on them |

**Two read-only inputs would improve three of these sittings and are not decisions.** `01…§33` already
proposes a second read-only census scoped to `U-2`, `U-3`, `U-5`, `U-7` — *"the cheapest thing that would move
several gaps from reasoned to established"* (`01…:1312-1315`) **[verified]**. Against this register: `U-7`
prices sitting 1, `U-3` grounds AD-4 in sitting 5, and `U-4` is the evidence AD-17 in sitting 3 is asserting a
contract about. **None of the three blocks a decision; all three improve one.**

**A caution on sequence.** `03…§12`'s framing — *"None blocks the model; each blocks specific work"*
(`03…:1041`) **[verified]** — was written about AD-1…AD-4 and remains true of them. It is **not** true of
sitting 1: AD-11 does not block work, it describes a defect that is live in the product now. Sitting 1 is
first for that reason and not because more is blocked behind it.

---

## 29. What is *not* a decision

Recorded so that "still open" is a conclusion and not an omission.

**Closed by the corpus — no product decision remains.**
`06…§12 D9` (*what is a conflict, and how does it resolve*) is **closed** by `02…§15.3`, which settles it
normatively: capability unions, scope intersects, no conjunct may widen another. *"The accepted recommendation
and the model agree"* (`06…:562-564`) **[verified]**.

**Closed by implementation — differently from the recommendation, and better.**
`06…§12 D10` (*where Access lives in navigation*) is closed: Access is an Organization domain at
`/organization/access`. The residue is `IA-8`, a duplicate route — *"a cleanup rather than a decision"*
(`06…:565-567`) **[verified]**.

**Superseded, not closed.** `06…§12 D11` (*time-boxed access*) is carried forward unchanged as `D-IA4` =
**AD-21** (`06…:595-596`). It is still open; only its ID moved.

**Director housekeeping, not product decisions.** `X-1`…`X-5` and this part's `X-6`…`X-8` are corpus-integrity
findings. They require a Director *act* — a renumbering pass, a folder rule, a commit — not a product
judgment. They are listed with the decisions in `01…§30` because they gate the same artifacts, but approving a
decision does not close one and closing one does not answer a decision. **`X-5` is the exception worth naming
twice: Part II of this file is required output #5, is cited by three other documents, and is uncommitted
working-tree state** (`01…:1281-1287`) **[verified]** — Part III inherits that exposure, since it is appended
to the same uncommitted file.

**Worker-resolvable: none.** Every owning document says so in its own words, and this part repeats it rather
than quietly narrowing any of the 21 to an assumption.

---

## 30. New findings recorded by this pass

Continuing the corpus-integrity `X-n` series (`01…§18`, `§32`). No product finding is added by this part —
Part III raises no `M2-n`, because consolidating decisions cannot discover a defect in code.

| # | Finding | Nature | Evidence |
|---|---|---|---|
| **X-6** | **`D-IA0` overstates the `D9` collision.** It reports `D9` as denoting *"who may mint a credential"* in `04…§3.5`. That section does not define a decision — its heading reads *"who may mint a credential **is decision D9**"* and its body cites `02…:564-573` (**D9**) as the authority. It is a citation of the `02` reading, not a second one | citation misread; the corpus's own collision report is one entry too pessimistic | `04…:296-301` vs `06…:551-552` |
| **X-7** | **No downstream artifact binds to a colliding decision number.** `07…` cites only `D4` (`:117`, `:127`, `:182`); `03…` cites only `D1`–`D4`, with zero occurrences of `D5`–`D14` or `D-IA n` | the escalated renumbering is still free — a window, not yet a debt | `rg` counts, §32 |
| **X-8** | **The ᴬ/ᴮ convention is a per-row assignment, not a rule.** `01…§26` states *"ᴬ = the `02…` reading"*, but `01…§30` assigns `D13`ᴬ to `01`'s own §19. A reader who has not read that table cannot apply the convention | the disambiguation mechanism itself needs a lookup | `01…:1027-1028` vs `:1192-1193` |

**`X-6` is a correction, not a rebuttal.** `06…§8`'s conclusion — that the decision numbers have collided and
that one register with one authority is needed before D-numbers are cited in a rubric — is **entirely
correct**, and `D-IA0` is why this part exists. What §26.1 establishes is that the collision is *three live
numbers*, not six, which makes the fix smaller than the corpus currently believes. Recorded because `01…§30`
propagates the same reading in its consolidated table.

Note that `X-6` and `X-7` are the same shape as `X-1`…`X-5`: **each phase was individually careful; nothing
reconciled them** (`01…:1289-1291`). A register whose own defect report is off by one is the argument for
having exactly one register.

---

## 31. Conformance — keeping the register true

Mechanical, cheap, and each fails today. These extend `§9` and `§19`; they check the *corpus*, not the code,
and so belong with `01…§18`'s escalation rather than with a wave.

| Check | Asserts | Kind |
|---|---|---|
| **CR-1** | Every `D`/`AD` identifier defined in the corpus is defined **exactly once**. Collect defining sites by regex over `^\*\*(D\|AD)[-A-Z0-9]+ —`; assert no duplicate key | static |
| **CR-2** | Every `D`/`AD` identifier *cited* in `03`, `07` and the `IA-R` requirement set resolves to exactly one defining site | static |
| **CR-3** | The register in §25 and the table in `01…§30` name the same set of open questions — reconciling the `D6 ≡ D10` and `D-IA` compressions declared there | static |
| **CR-4** | No decision is marked *closed* without a cited closing artifact (`06…:562-567` is the pattern to match) | static |
| **CR-5** | Every open decision names at least one gap it blocks, and every blocked gap in `01…§26` names at least one decision | static |

**CR-2 is the one that would have prevented GAP-14's decision half**, and it is the one that must run *before*
the first rubric row is written against `AD-15`…`AD-17` — because after that, it stops being a check and starts
being a migration.

---

## 32. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ 852f93ff8
P=docs/platform/planning/access-identity-v2
Q=docs/platform/planning/vacilando-os/qa/access-identity-v2

# §25 / §26.1 — every defining site of a decision, corpus-wide
rg -n '^\*\*D(-IA)?[0-9]+ —' $P $Q
rg -n '^## .*Decision' $P $Q

# §26.1 — D9's second reading is a citation, not a definition (X-6)
sed -n '296,301p' $Q/04-authentication-model.md          # "is decision D9", citing 02…:564-573
sed -n '550,558p' $Q/06-product-ia-and-flows.md          # D-IA0's claim

# §24 / §30 X-7 — what downstream actually binds to
rg -o 'D(-IA)?[0-9]+' $Q/07-director-acceptance-rubric.md | sort | uniq -c    # D4 ×3, nothing else
rg -o 'D(-IA)?[0-9]+' $Q/03-implementation-qa-sequence.md | sort | uniq -c    # D1..D4 only

# §26.3 X-8 — the convention states one rule and applies another
sed -n '1027,1028p' $P/01-existing-state-inventory.md    # "ᴬ = the 02… reading"
sed -n '1192,1193p' $P/01-existing-state-inventory.md    # D13ᴬ = 01's own §19

# §27 — the couplings, at their sources
sed -n '451,455p' $Q/04-authentication-model.md          # D6 and D10 are one question
sed -n '571,577p' $Q/06-product-ia-and-flows.md          # D-IA1 is the IA half of D5
sed -n '1039,1059p' $Q/03-implementation-qa-sequence.md  # the D1–D4 decision gates

# §29 — the two closures
sed -n '560,567p' $Q/06-product-ia-and-flows.md

# §28 — the read-only inputs that price three sittings
sed -n '1301,1315p' $P/01-existing-state-inventory.md    # U-1…U-8
```

---

## 33. Limits

1. **Static and corpus-grounded.** No request issued, no browser used, no live database queried, no test
   suite, typecheck, or build run. The only file written by this phase is this document.
2. **No decision is answered, and no recommendation is originated.** Every recommendation in §25 and §27 is
   **[carried]** from its owning document. Where this part appears to argue — sittings, ordering, cost of
   deferral — it is arranging existing arguments, and each is cited to the source that made it. A reader who
   disagrees with a recommendation should take it up with the owning document, not with §25.
3. **The `AD-n` numbering is proposed, not applied.** No source document was renumbered, and no source
   document was edited by this phase. Until a Director ratifies §26.2, `AD-n` exists only in this section and
   the legacy IDs remain canonical. Citing `AD-n` elsewhere before ratification would create the seventh
   register this part exists to prevent.
4. **Completeness is bounded by two searches**, not by a reading of all eight documents end to end: a heading
   sweep for decision sections and a regex over defining sites (§32). A decision stated in prose without a
   bolded `**Dn —**` opener or a "Decisions" heading would not have been found. `00`, `05` and the
   `authority-path-inventory` yielded no decision section under either search, and were not read in full this
   pass.
5. **`04`, `06`, `07` and the current `03` were read at their QA-folder paths.** Per `X-2` they are absent
   from the product-source folder this document lives in (`01…:1256-1266`), so every `04…`/`06…`/`07…`
   citation here is to `docs/platform/planning/vacilando-os/qa/access-identity-v2/`. Part III therefore adds
   to the 91 dangling shorthand citations `X-2` counts. That is unavoidable while `X-2` is open, and it is
   recorded rather than worked around.
6. **`03`'s decision gates are cited from the QA copy**, which `X-3` establishes is the fresher one by 455
   lines (`01…:1268-1274`). The stale copy in this folder carries the same §12 gates but not the wave
   execution records that make "needed by wave 4" meaningful.
7. **Line citations are as of `852f93ff8` plus the uncommitted working tree.** Part II of this file is
   uncommitted (`X-5`) and Part III is appended to it, so both are one `git checkout` from deletion, and every
   `§10`/`§20` cross-reference here resolves only in the working tree.
8. **Read-only.** No source, schema, migration, or UI was modified. The frozen QA copies are untouched.

---

## 34. Provenance — Part III

- **Inputs (reused, not re-derived):** Parts I and II of this file (§10, §20 — decisions `D9`ᴬ…`D12`ᴬ);
  the frozen `02-canonical-access-identity-model.md` §14 (mission `msn_e9133cdade883793d2`) for `D1`–`D4`;
  `04-authentication-model.md` §4 and §7 (`D5`–`D8`, `D11`ᴮ–`D13`ᴮ, and the `D6 ≡ D10` coupling);
  `06-product-ia-and-flows.md` §8 and its preserved §5 (`D-IA0`–`D-IA4`, and the two closures);
  `01-existing-state-inventory.md` §19 (`D13`ᴬ, `D14`), §26 (GAP register), §30 (decision coverage), §32
  (`X-2`–`X-5`), §33 (`U-1`–`U-8`); `03-implementation-qa-sequence.md` §12 (decision gates);
  `07-director-acceptance-rubric.md` (binding census).
- **Read this pass, in full:** every "Decisions" section named above; `07-director-acceptance-rubric.md`
  decision-citation sites (`:117`, `:127`, `:182`).
- **Corpus-wide searches:** decision defining sites (`^\*\*D(-IA)?[0-9]+ —`) across both folders; decision-ID
  citations in `03` and `07` (counted, §32); `D9` occurrences in `04` (4 hits, all citations of `02`).
- **Originated by this part:** the `AD-1…AD-21` register (§25), the renumbering rule (§26.2), the six sittings
  (§27), the approval order (§28), findings `X-6`–`X-8` (§30), and checks `CR-1`–`CR-5` (§31). Nothing else.
- **Verified at** `852f93ff8` in `wt6-vacilando-os-product-def`.
