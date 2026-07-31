# 03 — Sequenced implementation & QA plan

> **Delivery plan.** The order in which Access & Identity V2 is built, and how each step is proven.
> Phase 1 established what is true ([`01-existing-state-inventory.md`](./01-existing-state-inventory.md));
> phase 2 established what must be true ([`02-canonical-access-identity-model.md`](./02-canonical-access-identity-model.md)).
> This document turns the divergence register (§13 of phase 2) into sequenced, testable work.
>
> **Specification only.** No code, schema, migration, or UI is changed by this phase. Nothing here asserts
> that Access & Identity UI exists or is complete.

**Mission** `msn_e9133cdade883793d2` v1 · phase *Sequenced implementation & QA plan* · assignment `asg_c505e1d0d76acd`
**contentHash** `a48a454dc1a5a25a537a345999d982dc`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30 · **W-0 executed 2026-07-31** (mission `msn_2d054741a54698fa4c`, assignment `asg_708252478f6fdd`)
**Status** Proposed — a plan to be scheduled, not a record of work done. **Exception: Wave 0 (§4) is
executed and complete**; its live counts are recorded and have been applied to §3, §6, §8, §9, §11 and §14.
Every other wave remains a proposal.

---

## 0. How to read this

| Section | Contents |
|---|---|
| §1 | The three sequencing constraints that determine the order. Read this before disagreeing with the order. |
| §2 | **Lockout class** — four changes that can lock every operator out, and the ritual all four use. |
| §3 | Wave map and critical path. |
| §4–§9 | Wave 0 through Wave 5, workstream by workstream: change, dependency, QA, exit criteria. |
| §10 | The QA architecture — four tiers, and why a grep-based check is not one of them. |
| §11 | Migration register and the shared-apply preflight gate. |
| §12 | Decision gates D1–D4 mapped to the workstreams they block. |
| §13 | Regression locks: what must never silently reopen. |
| §14 | Scope boundary, risks, and limits. |

Workstreams are `W-n`. Invariants `I-n` and divergences (`C-n`, `G-n`) are phase 2 and phase 1 references.
Sizing is **S** ≤ 2 engineer-days · **M** 3–8 · **L** 9–20. These are estimates on a codebase of 539 API
routes and 289 migrations, not commitments.

---

## 1. What determines the order

Phase 2 §13 offered a suggested order. This plan keeps its logic and adds the three constraints that actually
bind — each of which reorders work relative to a naive severity ranking.

### 1.1 Fail-open cannot be closed before the invariant it depends on holds

The tempting first move is I-19 — *absent scope denies*. Shipping it first would deny **every membership
created through the product since the backfill migration**, because G4 confirms none of them has a profile row
(`web/app/api/admin/users/route.ts:102-106` inserts into `user_roles` only). A fail-open default cannot be
flipped to fail-closed until the data it reads exists. That is three ordered steps, not one:

```
  create path writes a profile   →   backfill the existing gap   →   flip the default to deny
        (W-5, I-18)                      (W-6, migration)                (W-7, I-19)
```

The same shape recurs: **make the new source of truth true, prove it is true, then depend on it.** It governs
W-13 (portal capability), W-16 (role FK) and W-20 (legacy fallback) identically.

### 1.2 Evidence about live data gates four changes, so it comes first

Four workstreams have an unknown blast radius that only the deployed database can resolve:

- **G1** — whether the `handle_new_user()` trigger is attached at all is *not visible in version control*
  (phase 1 G1). Its answer changes whether the legacy fallback is a live escalation path or dead code.
- **W-20** — how many principals authorize *only* through the legacy fallback. If non-zero, deleting it locks
  them out.
- **W-16** — how many `user_roles.role` values have no matching `role_definitions` row. Since that column is
  unconstrained text (C2), the FK will reject them.
- **W-13** — whether every org holding an `admin`/`ops` membership also has the corresponding
  `role_definitions` row. If not, granting `portal.access` per role definition silently misses that org and
  locks it out.

None of these is answerable statically, and each is cheap to answer read-only. **Wave 0 is five SELECT
statements**, and it is the highest-leverage step in the programme.

**It proved so.** Executed 2026-07-31, Wave 0 emptied the remediation set for three of the four lockout-class
workstreams, struck a migration (M8), kept W-20 in wave 5 by showing G1 is latent, and sized the one real
remediation at two rows. Three of those four answers were *not* the conservative assumption the plan carried.

### 1.3 Declaring a capability per route is worthless until the vocabulary is settled

I-24's declared `(route → capability)` table is the mechanism that converts I-17 from an audit into a build
check, and it is the largest single item here (539 routes). Building it before I-13 settles which keys exist
means declaring keys that are then renamed or deleted — the sweep would be done twice. Vocabulary first,
declaration second, enforcement sweep third.

The corollary is that the **big** work is late and the **risky** work is early. That is deliberate: the early
waves change behaviour in ways that can lock people out and must be done under close attention; the late waves
are large but mechanical and safely parallelizable.

---

## 2. The lockout class

Four workstreams can deny every operator access to the product if they land wrong:

| # | Workstream | Failure mode if it lands wrong |
|---|---|---|
| **L1** | W-7 — absent scope denies | Any membership without a profile row is denied all rows |
| **L2** | W-13 — portal admission becomes a capability | Any principal not granted `portal.access` is redirected to `/unauthorized` |
| **L3** | W-16 — FK on `user_roles.role` | Migration fails, or existing memberships become unwritable |
| **L4** | W-20 — legacy fallback removed | Principals authorizing via `user_profiles`/`app_users` lose all authority |

All four are the same shape — *a widening default is replaced by an explicit source of truth* — so all four
use one ritual rather than four bespoke plans.

### The four-step switch ritual

1. **Seed.** Write the new source of truth for all existing subjects, in its own migration, under the §11
   preflight gate. This migration changes no behaviour: nothing reads the new data yet.
2. **Dual-read and observe.** Ship the resolver computing *both* the old and new answers, enforcing the **old**
   one, and recording every divergence with the `(principal, org)` pair and both results. Divergences are a
   defect list, not noise.
3. **Prove zero.** The switch is authorized only on evidence of **zero unexplained divergences** across a
   stated observation window and the full fixture matrix (§10.3). A non-zero count means step 1 was incomplete
   — return to it; do not add an exception.
4. **Switch and remove.** Enforce the new answer. Delete the old path and its constant in the *same* commit —
   a dormant fallback is what phase 1 §2.1 is about.

Steps 2–3 are what make these changes ordinary instead of frightening. The cost is one extra deploy per
workstream; the alternative is discovering the gap from a locked-out operator.

**Revert path.** Each of L1–L4 must be revertible by a single feature-flag flip or a one-line revert of the
step-4 commit, without a migration rollback. Step 1's migration is additive precisely so that reverting the
code never requires reverting data.

---

## 3. Wave map and critical path

| Wave | Theme | Workstreams | Gated on |
|---|---|---|---|
| **0** | Facts before changes — read-only live verification | W-0 | — · **DONE 2026-07-31** |
| **1** | Fail-closed quick wins, no schema | W-1 … W-4 | — |
| **2** | The scope invariant (the confirmed fail-open) | W-5 … W-8 | ~~W-0~~ **satisfied** |
| **3** | One catalog, one vocabulary | W-9 … W-12 | — (parallel with 2) |
| **4** | Admission and declaration | W-13 … W-15 | W-3, D2 |
| **5** | Role-model coherence and the long tail | W-16 … W-22 | ~~W-0~~ **satisfied** · D3, D4 |

Waves 2 and 3 touch disjoint surfaces — scope tables and route handlers versus catalog tables and the grid —
and can run concurrently by different people. Waves 4 and 5 both depend on wave 3.

**Critical path** (longest dependency chain):

```
W-0  →  W-9 (one catalog)  →  W-11 (one vocabulary)  →  W-13 (portal.access)  →  W-14 (route table)  →  W-15 (enforcement sweep)
 S            M                      M                        M                        M                       L
```

Everything else fits beside it. W-15 is the single largest item and the one most amenable to being split
across contributors once W-14's mechanism exists.

---

## 4. Wave 0 — Facts before changes

### W-0 — Live authority census *(S · read-only · no product change)*

Five read-only queries against the deployed database. Produces a JSON evidence file; changes nothing.

| # | Question | Query | Gates |
|---|---|---|---|
| Q1 | Is `handle_new_user()` attached? | `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;` | G1, W-20 |
| Q2 | How many principals authorize *only* via the legacy fallback? | memberships in `user_profiles`/`app_users` with role, having **no** `user_roles` row | W-20 (L4) |
| Q3 | How many `user_roles.role` values have no `role_definitions` row for that org? | anti-join `user_roles` → `role_definitions` on `(org_id, role_key)` | W-16 (L3) |
| Q4 | How many memberships lack an access profile? | anti-join `user_roles` → `user_access_profiles` on `(user_id, org_id)` | W-6 (L1) |
| Q5 | Does every org with an `admin`/`ops` membership have the matching `role_definitions` row? | per-org anti-join | W-13 (L2) |
| Q6 | How many `admin`/`ops` principals hold an explicit `department_scope = 'restricted'` profile? | `user_access_profiles` ∩ `user_roles` | W-8 (C8) |

Q3 and Q5 are the same anti-join read two ways, and together they are the reason W-13 is not a one-line
change: `user_roles.role` is unconstrained text, so a membership can name a role the org never defined.

**Q6 is the sixth query §6/W-8 anticipated.** W-8 is scheduled in wave 2, so it is folded in here rather than
requiring a second live-access authorization later. It costs one more `SELECT`.

**Exit criteria.** [`qa/access-identity-v2/wave0-authority-census.json`](./wave0-authority-census.json)
committed, with counts and the query text for each of Q1–Q6. Every one of L1–L4 cites it before proceeding.

**If Q2, Q3, Q4 or Q5 is non-zero**, the corresponding workstream gains a *remediation* step ahead of its
switch, and that step is scheduled explicitly rather than absorbed. A non-zero Q1 (trigger attached) promotes
G1 from latent to live and moves W-20 into wave 2. A non-zero Q6 makes W-8 a behaviour change for a named
population rather than a no-op.

### W-0 execution record

| Field | Value |
|---|---|
| Evidence file | [`wave0-authority-census.json`](./wave0-authority-census.json) — **counts recorded; exit criteria met** |
| Queries | Q1–Q6 written and schema-verified against `supabase/migrations`, plus one combined single-statement form returning all answers as one JSON row |
| Executed | **Yes** — 2026-07-31T15:48:45Z, read-only, against the deployed database |
| Channel | Vacilando **trusted host action** `database.read_census` (`tha_1e353138da1197`, auth `tha_auth_d8394598adbe`, query hash `743cd63b…`). The Director executed host-side and returned results only; no privileged credential reached the worker. |
| Target | `alloy_deployed_primary`, fingerprint `b15dad2c6d030ed4`. Note `current_database()` = `postgres` on every Supabase project, so the project ref is **asserted by the channel, not proven by the output** — see the census file's `target.improvement_for_next_run`. |
| Prior blockage | Two sessions and seven routes failed first. `DATABASE_URL` is on the toolkit's denylist twice — secret-like substring (`lib/verify.sh:202`) and named privileged variable (`:210`) — and its only reader exists solely to spawn the `alloy-dev-start` Next process. The refusal was working as designed; the trusted host action is the right resolution because it satisfies the read **without weakening the denylist**. Retained as `execution.blocker_history`. |
| Reusable lesson | Every remaining live-evidence step in this programme — re-running this census before each lockout-class switch, and all ten §11 migration preflights — needs read-only queries against this same database. All of them should use this channel. **The unblock never required an operator to paste anything.** |

**W-0 has met its exit criteria.** Counts and query text for Q1–Q6 are committed, so L1–L4 can now cite it and
**waves 2 and 5 are no longer gated by Wave 0.**

#### Results

| # | Answer | Rule fires? | Consequence |
|---|---|---|---|
| **Q1** | `handle_new_user()` is **defined but not attached**. All 54 triggers on `auth.users` are internal FK triggers; **zero** application triggers. | No | **G1 stays latent. W-20 stays in wave 5.** But the function still exists unreferenced — W-20 must give it an explicit disposition, because attaching it is a one-line migration away from restoring the default-to-`ops` path. |
| **Q2** | **0** principals authorize only via the legacy fallback. Every auth user has a `user_roles` row. | No | **L4 population is empty.** W-20 needs no remediation and collapses from the four-step ritual to a straight deletion plus RL-12. |
| **Q3** | **0** `user_roles.role` values lack a `role_definitions` row. | No | **L3 population is empty. M8 is removed from the §11 register**; M9's FK applies directly. |
| **Q4** | **2** of **6** `(user, org)` pairs lack an access profile (from **8** membership rows). | **Yes** | **The only real remediation in the programme.** M1 is sized at exactly **2** rows. W-7 cannot precede it. |
| **Q5** | **0** admin/ops `(org, role)` pairs lack a definition; **0** are defined-but-inactive. | No | **L2 population is empty.** M7 grants `portal.access` per `role_definitions` and misses no org. |
| **Q6** | **1** principal holds admin/ops *and* an explicit `department_scope = 'restricted'` profile. | **Yes** | **W-8 is a behaviour change for 1 named principal**, not a no-op. Identify and announce before deleting the bypass. |

**Four of six rules did not fire.** Three of the four lockout-class workstreams — L2 (W-13), L3 (W-16) and
L4 (W-20) — have an **empty** remediation set. Only L1 has real work, and it is two rows. This is the
single largest de-risking of the programme, and it is exactly what §1.2 predicted Wave 0 would buy.

**Two things this does *not* license.** First, the defects are no less real: the same code ships to any tenant
that grows, and Q4 will keep growing until W-5 lands, so **the counts are a snapshot and every switch must
re-run the census rather than cite this one**. Second, Q3 and Q5 returning zero proves M9 and M7 safe against
*today's* data — `user_roles.role` stays unconstrained text until M9 actually lands, so its preflight must
re-run Q3 rather than trust this result.

**A recommendation for the §2 ritual, for the workstream owners to accept or reject.** The four-step ritual's
step 3 — *prove zero divergences across a stated observation window* — was designed for an unknown blast
radius. At six pairs the population is not merely known, it is exhaustively enumerable, and this tenant has
too little traffic for an observation window to mean much: "zero divergences observed" would mostly be
evidence that nobody logged in. Satisfying step 3 by **enumerating all six pairs** and computing both answers
for each is both stronger and cheaper, and it dissolves the unspecified-observation-window limit at §14.3.5.

Three things were fixed while writing and re-verifying the queries, each of which would have produced a wrong
number or a failed run:

1. **Q4's grain.** `user_roles` is per `(user, org, role)`; `user_access_profiles` is `UNIQUE (user_id, org_id)`.
   M1's preflight rule "row count == W-0 Q4" means **distinct `(user, org)` pairs**, not membership rows. The
   census reports both, and names which one M1 must equal.
2. **Q2's scope.** The legacy fallback fires **only** when the principal has *zero* `user_roles` rows
   (`resolveAdminAccessCore.ts:111-140`), and `user_profiles` has no `org_id` — the org is recovered from
   `app_users` by `id`, then `auth_user_id`. Q2 reproduces that precedence rather than counting "anyone with a
   legacy role", which would overstate the L4 population.
3. **Q1's `tgenabled` cast** (found on re-verification, 2026-07-31). `pg_trigger.tgenabled` is type `"char"`,
   not `text`, and inside `jsonb_build_object` it was relying on `to_jsonb`'s fallback for a non-JSON-native
   builtin. It is now cast explicitly. This was the likeliest first-contact failure and it sat in Q1 — the
   first query the run would hit. **The run executed clean on the first attempt.**

Every table and column the census names was re-verified against `supabase/migrations` before execution
(`orgs`, `user_roles`, `role_definitions`, `user_profiles`, `app_users`, `user_access_profiles` — see the
census file's `method.schema_reverification_2026_07_31`). Execution then confirmed it live: all six queries
resolved every table and column, which also **proves `20260504103000_user_access_scope_tables_v1.sql` is
applied on the target**. It says nothing about the wider 28-migration Processing/Identity backlog, which
remains an open concern for every §11 migration.

One access note, recorded for whoever re-runs this: **Q1 and Q2 read `auth.users`**, and Q1 reads `pg_trigger`
over it. A read-only role scoped to `public` would fail or silently under-report. The trusted host action has
the necessary access; a hand-provisioned read-only role would need an explicit `SELECT` grant on `auth.users`.

---

## 5. Wave 1 — Fail-closed quick wins

No schema, no migration, small blast radius, each independently revertible. This wave exists to close the one
*confirmed* exposure and the two operator-visible defects while wave 0's evidence is being gathered.

### W-1 — Gate the six analytics routes *(S · I-17, I-23 · closes G2)*

Six routes gate on `access.ok` alone, making org-wide metrics readable by any authenticated member of the org
— including `regional_lead` and `school_director`, the two personas the portal refuses to admit:

```
web/app/api/admin/intelligence/operational/route.ts:26-29
web/app/api/admin/metrics/resolve/route.ts:83-84
web/app/api/admin/metrics/trends/route.ts:47-48
web/app/api/admin/analytics/metrics/[id]/trend/route.ts:40-41
web/app/api/admin/analytics/metrics/[id]/preview/route.ts:31-32
web/app/api/admin/analytics/metrics/[id]/snapshot/route.ts:23-24
```

Add the portal gate each already implies, and declare the capability each requires. `configuration/programs/route.ts:54-55,65`
is the reference shape — it is the seventh route in the raw difference and is correctly gated by permission.

**QA.** Tier B unit, per route: an access context that is `ok` but not `portalEligible` receives 403. Extend
the fixture idiom in `web/tests/admin/usersRolesAuth.test.ts:6-19`. New file
`web/tests/access/analyticsRouteGates.test.ts`.
**Exit.** Six tests red before the change, green after. Regression lock RL-1 (§13).

### W-2 — Self-elevation ban *(S · I-11 · partially closes G3)*

`PATCH /api/admin/users/[userId]/role` applies no self-assignment guard. The full subset rule is D3-dependent
and deferred to W-18; **the self-elevation ban is not** — no reading of D3 permits a principal to modify its
own authority.

**QA.** Tier B: caller `userId` === target `userId` → 403, for every role value including the caller's current
one. Tier C: an integration case asserting the row is unchanged after the denial.
**Exit.** A principal cannot alter its own membership through any product path.

### W-3 — Repair the unsavable grid row *(S · I-14 precursor · closes C5)*

`permissionGrid.ts:23` offers `workflows.read`/`workflows.write`, seeded into no catalog table, so toggling it
returns HTTP 400 and **takes the operator's other valid selections on that screen with it**
(`grants/route.ts:61-67`, validation before the delete-all-then-insert at `:70-89`).

The keys exist one namespace away — `ops.workflows.read`/`ops.workflows.write` (`remote_schema.sql:731-732`).
Two candidate fixes: point the grid row at the legacy keys, or seed the bare keys. **Point the grid row at the
existing keys** — seeding new keys adds a fourth vocabulary variant to the problem W-11 exists to remove, and
W-10 deletes this hand-maintained list entirely.

This is a stop-the-bleeding fix with a two-week life. It is worth doing anyway: it is one line, and the failure
it prevents destroys operator input.

**QA.** Tier B: every key named by `PERMISSION_GRID_ROWS` exists in the catalog seed. Extend
`web/tests/admin/permissionGrid.test.ts`. This assertion becomes structurally unnecessary at W-10 and must be
*replaced*, not deleted, by the projection test.
**Exit.** No grid row names an unseeded key; a full-grid save round-trips.

### W-4 — Service-client principal check *(M · I-3 · addresses G6)*

517 of 539 route files hold a service-role client. I-3 requires every one to resolve and gate a principal
separately. This workstream builds the **check**, not the remediation: a static verification that every file
importing a service-role client also resolves a principal, plus a reviewed, named allow-list for the legitimate
exceptions (health checks, webhooks, public intake — the 28 tier-0 routes phase 1 classified by family).

Remediation of whatever the check finds is W-15's sweep, sized there.

**QA.** Tier A build-time check. Fails on any new file that imports `supabaseAdmin` without resolving a
principal and without an allow-list entry carrying a reason.
**Exit.** The check runs in CI and the exception list is a reviewed artifact rather than a residue. **The
initial count of exceptions is recorded as the baseline for W-15 and is expected to be large** — this
workstream's value is that the number stops growing silently.

---

## 6. Wave 2 — The scope invariant

The one *confirmed, fail-open* defect in the system, and the L1 lockout. Depends on W-0 Q4.

### W-5 — Create a profile row with every membership *(M · I-18 · closes G4)*

`POST /api/admin/users` inserts into `user_roles` and references no scope table
(`web/app/api/admin/users/route.ts:102-106`). Every membership the product has created since the backfill
migration is unscoped.

Membership creation and profile creation **MUST** be one transaction. Doing this in application code across
two Supabase inserts is not a transaction; this workstream therefore introduces an RPC (or equivalent) that
writes both atomically, and routes every membership-creating path through it.

Audit for *other* membership writers before implementing — the phase 1 inventory audited the create route, not
the full set of writers. Any path found gets the same RPC.

**QA.**
- Tier B: the create handler calls the atomic path; a failure in the profile write fails the whole call.
- Tier C integration (`web/tests/access/membershipProfileInvariant.integration.test.ts`, guarded with
  `describe.skipIf(!hasEnv)` per `web/tests/admin/verticalBootstrap.integration.test.ts:12-18`): create a
  membership through the product path, assert exactly one profile row exists; simulate profile-write failure,
  assert no orphan membership row.

**Exit.** Q4's count cannot grow. This is the precondition for W-6 being a bounded, one-time job.

### W-6 — Backfill profiles for existing memberships *(S · migration · shared → preflight)*

One additive migration creating a profile row for every membership lacking one, at the scope the resolver
currently infers — both dimensions `all` — so **behaviour is unchanged by construction**. This is step 1 of the
ritual for L1.

Preflight per §11: count of rows to be created must equal W-0 Q4; zero memberships left uncovered afterwards;
no existing profile row modified.

**W-0 answered this: 2 rows.** Of 6 distinct `(user, org)` pairs — across 8 membership rows — exactly **2**
lack a profile. Note the three distinct numbers: the preflight rule means **2** (`pairs_without_profile`), not
8 and not 6. W-0 also found **0 orphan profile rows**, so "no existing profile row modified" has nothing to
collide with. **This is the only non-empty remediation population in the whole programme.**

Because W-5 is still open, this count **grows with every membership the product creates**. Re-run the census
immediately before M1 rather than citing 2; the number is a snapshot taken 2026-07-31.

**QA.** Tier A: post-apply anti-join returns zero. Evidence file per §11.
**Exit.** Every membership has exactly one profile row, and W-0 Q4 re-run returns 0.

### W-7 — Absent scope denies *(M · I-19 · lockout class L1)*

Flip `resolveAdminAccessCore.ts:152-161` from "missing profile ⇒ both scopes `all`" to deny, and delete the
comment that calls it a legacy transition.

Full ritual: W-6 seeds (done), then dual-read — resolve both answers, enforce the old, log every principal for
whom they differ. **A divergence after W-5 and W-6 means a membership was created outside the atomic path**,
which is exactly the defect worth finding before the switch, not after.

**QA.**
- Tier C: delete a profile row for a fixture principal, assert denial rather than `all`.
- Tier C: the same principal with a profile row present is unaffected.
- Tier D: one authenticated browser pass on `:3020` confirming a normally-configured operator is unaffected.
**Exit.** Zero divergences across the observation window; switch commit removes the fallback branch.

### W-8 — No role widens a scope dimension *(M · I-20 · closes C8)*

`portalAdminBypassesDepartmentScope` forces `departmentScope = "all"` for `admin`/`ops`
(`accessScope.ts:45,51-53`). Since only `admin`/`ops` reach the portal, **every principal who can use the
product bypasses department scope** — the dimension is configurable, displayed, and inert.

Deleting the bypass without preparation would restrict administrators who are configured as restricted but
have never experienced it. W-6 has already written `all` for every backfilled membership, so for those the
removal is a no-op. The exposed set is principals with an explicit `department_scope = 'restricted'` profile
*and* an `admin`/`ops` role — today those principals are silently unrestricted. ~~That count is a sixth Wave 0
query in practice; add it to W-0 if W-8 is scheduled.~~

**W-0 Q6 answered this: 1 principal.** One `(user, org)` pair is configured department-restricted while
holding `admin`/`ops`, so **W-8 is a behaviour change for exactly one named person, not a no-op**. Identify
them and announce the change before the bypass is deleted.

Corroborating: **2** pairs carry `site_scope = 'restricted'`, and site scope *is* enforced today. This operator
demonstrably configures scope restriction and expects it to hold — which makes the department-scope bypass a
live gap between configured and actual authority rather than a dormant setting nobody uses. That strengthens
the case for W-8.

**QA.** Tier B: `effectiveDepartmentScopeDimensions` returns the stored scope for every role, with the
existing suite in `web/tests/admin/adminAccessScope.test.ts` extended rather than replaced. Tier C: an `admin`
with `department_scope = restricted` sees only allowed departments.
**Exit.** No role literal appears in `accessScope.ts`; department scope is enforced for all roles.

---

## 7. Wave 3 — One catalog, one vocabulary

Disjoint from wave 2; runs in parallel. This is where the permission model stops being three models.

### W-9 — Consolidate to one catalog *(M · migration · I-12 · closes C3)*

Three catalog tables — `permission_keys`, `permissions`, `permission_definitions` — and
`role_permission_grants.permission_key` carrying **two foreign keys on the same column with different
`ON DELETE` semantics** (`remote_schema.sql:6503,6508`), while the write API validates against the third
(`grants/route.ts:61-67`).

Choose one survivor, migrate grants to a single FK, retire the others. Which survives is an implementation
choice; that only one survives is not. Sequence the retirement as *stop writing* → *verify no reader* →
*drop*, with the drop in a later migration than the repoint.

**Preflight is mandatory and non-trivial** — per §11 item 3, every grant row must satisfy the surviving FK
*after* any preparatory inserts, and per item 4 the dropped tables must have no unexpected incoming FKs or
dependent views. Phase 1 records that migrations already hand-maintain all three
(`20260505120100_settings_users_roles_permission.sql:4-7`); the union across them is the preflight's subject.

**QA.** Tier A schema assertion: `pg_constraint` shows exactly one FK on `role_permission_grants.permission_key`
and exactly one catalog table. Tier C: grant, revoke, and read-back round-trip through the API.
**Exit.** One table, one FK, and the API validates against the same table the FK names.

### W-10 — The grid becomes a projection *(M · I-14 · closes C5 structurally)*

`PERMISSION_GRID_ROWS` (`permissionGrid.ts:12-24`) is an independent hand-maintained list. Derive it from the
catalog so a row naming a non-existent key is **impossible by construction** rather than caught by review.

This modifies an existing operator surface to be truthful. It is explicitly **not** a rebuild of the
Users/Roles settings experience (§14.1).

**QA.** Tier A: no literal permission-key list exists in UI source. Tier B: the projection over a fixture
catalog produces the expected rows, and W-3's assertion is replaced by a generation test.
**Exit.** Adding a key to the catalog surfaces it in the grid with no UI change; removing one removes the row.

### W-11 — One vocabulary *(M · I-13 · closes C4)*

Three disjoint vocabularies: the legacy `ops.*`/`fin.*` seed set, the grid's `crm.*`/`settings.*` set, and the
per-feature keys that are actually enforced. **4 of the grid's 20 keys are enforced; 13 enforced keys have no
grid row.** An operator cannot grant most of what the platform enforces, and most of what the UI offers changes
nothing.

Two directions, both required: enforced-but-ungrantable keys gain catalog rows (and therefore grid rows, via
W-10); catalog-but-unenforced keys are **deleted, not left in the grid** (phase 2 §7.2's deletion rule).

Deletion is the contentious half. A key that nothing checks is not a permission — but an operator may have
toggled it and believe it means something. **Deletions must be enumerated and shown to the operator before the
migration runs**, not discovered afterward. That list is an exit artifact.

**QA.** Tier A: set difference between catalog keys and keys named in declared route capabilities is empty in
both directions. This check is only meaningful after W-14 supplies the declared set — so W-11 lands the data
change and W-14 lands the check that keeps it true. State this dependency rather than claiming W-11 is
self-verifying.
**Exit.** Enumerated deletion list reviewed; catalog and enforced set reconciled; the residual gap is a written
number, not an unknown.

### W-12 — Seeds enumerate their grants *(S · I-15 · closes G5)*

`seed_default_rbac()` grants `admin` *every active row* in `permission_keys` and `ops` all but two
(`remote_schema.sql:748-760`). Because that table holds every vocabulary, the blanket widens whenever any
migration seeds a key — including keys added by W-11.

Rewrite to enumerate. Per §11 item 5, preflight must confirm **catalog width vs live**: a new tenant must not
receive a thinner set than today without that narrowing being the intended, reviewed change.

**QA.** Tier A: no `SELECT` over the catalog inside a grant seed. Tier C: a freshly seeded org has exactly the
enumerated grants.
**Exit.** Grant seeds are a readable list; adding a catalog key grants nothing implicitly.

---

## 8. Wave 4 — Admission and declaration

### W-13 — Portal admission becomes a capability *(M · I-16 · lockout class L2 · closes C6 · needs D2)*

`PORTAL_ROLES = {admin, ops}` (`resolveAdminAccessCore.ts:18`) is consumed as a boolean by every tier-2 gate.
The platform seeds four system roles per org and can admit two of them; a `regional_lead` is redirected to
`/unauthorized` (`web/app/adminV2/layout.tsx:23-30`) no matter what it is granted.

Introduce `portal.access` as a catalog key, granted to the roles that hold admission today. Seeding it to
`admin` and `ops` reproduces current behaviour **exactly**, which is what makes this a behaviour-preserving
refactor rather than a policy change. What D2 decides is whether `regional_lead` and `school_director` also
receive it — that is a grant, not a code change, which is the entire point of I-16.

**The L2 hazard is W-0 Q5.** Granting per `role_definitions` row misses any org whose memberships name
`admin`/`ops` without a corresponding definition row — possible because `user_roles.role` is unconstrained text
(C2). Such an org would lose portal access entirely at step 4. Q5 must be zero, or remediated first.

**W-0 Q5 answered this: zero — the hazard did not materialize.** All 3 admin/ops `(org, role)` pairs have a
matching definition, and **0** are defined-but-inactive. M7 needs no remediation step and its §11 preflight
should pass unchanged. The inactive count being zero also moots the open question of whether M7's `WHERE`
should include inactive definitions — but **M7 must still state its choice**, because the answer changes if a
definition is deactivated between now and the migration.

Full ritual: seed grants (migration, preflight) → dual-read `portalEligible` from both the constant and the
capability, enforcing the constant, logging divergence → prove zero → switch and delete `PORTAL_ROLES`.

Phase 2 §6.2 notes `admin`/`ops` are special in at least three unrelated places — `PORTAL_ROLES`,
`ALLOWED_ROLES` (`web/lib/adminAuth.ts`), and `PORTAL_DEPARTMENT_SCOPE_BYPASS_ROLES` (`accessScope.ts:51-53`).
W-8 removes the third. **W-13 must remove the second as well as the first**, or the switch leaves a second
hard-coded admission set live.

**QA.**
- Tier B: `portalEligible` is true iff the capability is present, across a role matrix including a custom role
  granted `portal.access` and an `admin` denied it.
- Tier C: grant/revoke `portal.access` and assert admission changes without a deploy.
- Tier D: browser pass on `:3020` for an admitted and a refused principal — route, expected vs observed,
  console errors, evidence path per the slot's UI verification rules.
**Exit.** No role literal governs admission; `PORTAL_ROLES` and `ALLOWED_ROLES` are deleted.

### W-14 — Declared route capability table *(M · I-24 · the mechanism)*

Every route declares the capability it requires as a **value**, not a condition in its body, so the
`(route → capability)` set is enumerable by a build-time check rather than by grep. Routes legitimately
requiring none declare `capability: null` **with a stated reason**, making "no gate" an auditable assertion.

This is the direct answer to C1: a grep census over-reported enforcement by ~30× because *mentioning*
`permissionKeys` and *branching on* it are indistinguishable to a text search. `auditAuthorityPaths.mjs:37,103`
is the artifact — its `/permissionKeys\b/` primitive credited 440 routes to a module that only resolves and
returns the bundle.

Deliver the mechanism plus a pilot slice (the 17 genuinely gating routes and W-1's six), not the full sweep.

**QA.** Tier A build check: the table covers every route file under `web/app/api`; any route absent from it
fails the build. **Retire `auditAuthorityPaths.mjs` in this workstream** — leaving a known-30×-wrong census in
the repo invites someone to cite it.
**Exit.** The route table builds, covers 539 routes, and the tier census is replaced by a lookup.

### W-15 — Enforcement sweep *(L · I-17, I-23 · the long tail)*

Bring every route to the G-A…G-D gate contract, using W-14's declarations and W-4's exception baseline.
~500 admin routes currently gate on portal eligibility alone; 17 consult a capability.

Split by route family, one contributor per family, each family independently mergeable. **Publish the per-family
count in the plan of record as it lands** — a sweep that reports "mostly done" is how C1 happened.

**QA.** Tier A: the declared table shows zero routes with an unreviewed `null`. Tier C: per-family gate-order
tests at the boundary, asserting 401 before 403 before scope filtering — order matters, because a route that
checks capability before tenancy leaks the existence of other orgs' rows.
**Exit.** Every route's gate matches its declaration; the residual `null` set is reviewed and named.

---

## 9. Wave 5 — Role-model coherence

Independent of each other; schedule against W-0's evidence and the decisions.

### W-16 — FK on `user_roles.role` *(M · migration · I-8 · lockout class L3 · closes C2)*

Governance already claims this FK exists (`roles-and-permissions.md:20`); the constraint actually lives in one
application write path (`.../role/route.ts:27-30`). Make the claim true.

~~**Blocked on W-0 Q3.**~~ **UNBLOCKED.** W-0 Q3 returned **0** — no `user_roles` row names an undefined role,
and the set of distinct undefined roles is empty. **M8 (remediation) is not required and is struck from the
§11 register.** M9 applies directly.

Two cautions before treating this as free. Q3 deliberately ignores `role_definitions.is_active`, because a
foreign key does not — **M9's preflight must keep using Q3's form, not Q5's.** And `user_roles.role` remains
unconstrained text until M9 actually lands, so a violating row can appear between the census and the
migration: **re-run Q3 as the preflight rather than citing this result.**

**QA.** Tier A schema: the FK exists. Tier C: inserting an undefined role fails at the database, not only in
the API.
**Exit.** Q3 re-runs to 0 at preflight and the constraint is enforced by the schema.

### W-17 — Multi-role write path *(M · I-10 · closes C7 · informed by D2)*

The composite PK exists specifically to allow "ops + regional_lead"
(`20260505120000_user_roles_composite_primary_key.sql:4`) and the resolver unions role keys into a set — but
the only assignment API deletes every row for `(user, org)` and inserts one (`.../role/route.ts:38-44`), as its
own docstring admits. The modelled capability is unreachable through the product.

Add and remove individual `(principal, org, role)` rows. Effective capability is the **union** — never
intersection, or role assignment stops being compositional.

**QA.** Tier B: union semantics over a multi-role fixture. Tier C: add a second role, assert both persist and
capability is the union; remove one, assert the other survives. Extend
`web/tests/admin/userRolesMembership.test.ts`.
**Exit.** A multi-role membership is reachable through the product.

### W-18 — Delegation ceiling *(M · I-11 · closes G3 · needs D3)*

W-2 shipped the self-elevation ban. This is the subset rule: when *A* assigns role *R* to *B*, *R*'s capability
set must be a subset of *A*'s. Without it, any `settings.users_roles` holder can mint an `admin` and every
permission model collapses to `admin`.

**QA.** Tier C: attempt to grant a capability the caller lacks → denied; grant one the caller holds → allowed.
Tier B: the subset computation over fixture capability sets, including the empty and identical cases.
**Exit.** D3 answered and encoded; no path grants authority the caller lacks.

### W-19 — RLS position *(S–M · closes C10, C9 · needs D4)*

Under D4(b) — the phase 2 recommendation — RLS is documented as defence-in-depth only, no new policy is
written as though it gates the product, and the dead `owner`/`manager` grants (85 occurrences, never seeded)
are removed. Under D4(a) it adopts `role_definitions` as its vocabulary and one privilege function, retiring
two of the three current definitions of "is this user privileged" (`has_org_role`, `is_admin`, and the
`user_profiles.role` policies at `remote_schema.sql:6795,6801,6807`).

The sizes differ by an order of magnitude. **D4 must be answered before this is scheduled, not before it
starts.**

**QA.** Under (b): a documented position plus a static check that no new policy references an unseeded role
literal. Under (a): coverage tests, sized separately.
**Exit.** One written position; the vocabulary in RLS matches the platform's, or is documented as not
authoritative.

### W-20 — Remove the legacy fallback *(M · I-1, I-2 · lockout class L4)*

Three tables can make someone `admin`/`ops`, and `app_users` is joined on either of two columns because the
linkage is itself ambiguous (`resolveAdminAccessCore.ts:44-68`, `remote_schema.sql:1010-1019`). Under the model
exactly one source is legal.

~~**Blocked on W-0 Q1 and Q2.**~~ **UNBLOCKED, and smaller than planned.**

- **Q2 = 0.** Every auth user has at least one `user_roles` row, so the fallback — which fires *only* for
  principals with zero membership rows — is unreachable for everyone alive in the database. **The L4 lockout
  population is empty.** No remediation migration. Because it is zero rather than merely small, W-20 collapses
  from the four-step ritual to a **straight deletion** plus its RL-12 lock.
- **Q1: `handle_new_user()` is defined but NOT attached.** All 54 triggers on `auth.users` are internal FK
  constraint triggers; there are zero application triggers. **G1 stays latent, so W-20 stays in wave 5.**

**But W-20 gains one item.** The function still exists with nothing referencing it — an unattached trigger
function named `handle_new_user` is one migration away from silently restoring the default-to-`ops` escalation
path, and no static check would catch it. **W-20 must give it an explicit disposition: drop it, or document
why it is retained.** This is a finding only a live census could produce — version control shows the function,
never its attachment.

**QA.** Tier B: a principal with no `user_roles` row resolves to no authority regardless of
`user_profiles`/`app_users` content. Tier A: no authority-path module reads either table.
**Exit.** One principal source; the fallback and its three queries are deleted.

### W-21 — Preview renders from the enforcing code *(S–M · I-22 · closes C11)*

`resolveAdminAccessDimensionsForOrgMember` (`resolveAdminAccessCore.ts:209-290`) recomputes the whole access
result for the operator-facing preview, and differs from runtime in both directions: no legacy fallback (shows
nothing for exactly the principals whose authority comes from it) and no department-scope bypass (shows an
`admin` as restricted when at runtime they are not).

**Schedule this after W-8 and W-20**, which delete both divergences at the source. Doing it earlier means
unifying against a resolver that is still changing; doing it after makes it close to a deletion.

**QA.** Tier C: preview and runtime resolve identically across the §10.3 fixture matrix — the same matrix,
asserted twice.
**Exit.** One resolver; the preview has no independent implementation.

### W-22 — Explicit org, no lexicographic tiebreak *(M · I-7)*

A principal with memberships in several orgs is collapsed to one — admin/ops rows win, else the
lexicographically smallest `org_id` (`resolveAdminAccessCore.ts:26-37`); roles in every other org are
discarded. Sorting UUIDs is a silent, unexplainable authority decision.

Authority resolves for an explicit `(principal, org)` pair, determined by the request. "Primary org" may
survive as a presentation default; it must not survive as an authority input.

Also covers **I-25**: any cross-request authority cache is keyed on `(principal, org)` and invalidated by any
write to membership, role, grant, or scope.

**QA.** Tier A: no `sort()` over `org_id` on an authority path. Tier B: extend
`web/tests/admin/resolveAdminAccessCore.chooseOrg.test.ts` — the existing suite encodes the behaviour being
removed and must be rewritten deliberately, not deleted. Tier C: write an authority row, assert the next
request reflects it.
**Exit.** No authority decision depends on UUID ordering.

---

## 10. QA architecture

### 10.1 Four tiers

| Tier | Mechanism | Runs | Covers |
|---|---|---|---|
| **A — static / build** | Build-time checks over the declared route table and schema assertions | Every build | I-1, I-3, I-5, I-6, I-7, I-8, I-9, I-12, I-13, I-14, I-15, I-16, I-17, I-24 |
| **B — unit** | Vitest over pure resolvers and gates, fabricated access contexts | Every commit | I-2, I-9, I-10, I-11, I-16, I-17, I-20 |
| **C — integration** | Vitest against a real database, `describe.skipIf(!hasEnv)` | Scheduled / pre-promotion | I-4, I-10, I-11, I-18, I-19, I-20, I-21, I-22, I-23, I-25 |
| **D — live / browser** | Authenticated Playwright on `:3020` | Lockout-class switches only | L1–L4 admission and scope behaviour |

The tiering is deliberate: **most invariants are cheapest at tier B**, because the codebase already has the
right shape for it. `web/tests/admin/usersRolesAuth.test.ts:6-19` builds an `AdminAccessContextSuccess` by hand
and asserts a pure function over it. Every capability, admission, and scope-dimension rule can be tested that
way in milliseconds. Tier C is reserved for what genuinely needs a database — transactional invariants
(I-18), fail-closed on absent data (I-19), and gate ordering (I-23).

Existing conventions to follow rather than reinvent, out of 2380 test files:

- Integration gating — `describe.skipIf(!hasEnv)` with an env-var guard, per
  `web/tests/admin/verticalBootstrap.integration.test.ts:12-18`.
- Live/perf tests — `*.live.test.ts` with an explicit `X_LIVE=1` opt-in so CI never depends on a local stack,
  per `web/tests/runtime/d1ProvisioningBudget.live.test.ts:14-24`.
- Heavy checks go through the broker: `alloy-validate wt6-vacilando-os-product-def typecheck|test|build|playwright`.
  Focused runs: `npx vitest run tests/access/<file>` from `web/`.

### 10.2 What is not a QA tier

**A grep or import-walk census is not verification.** `auditAuthorityPaths.mjs` reports 507 permission-gated
routes; 17 are. 490 of 507 are false positives, because `/permissionKeys\b/` cannot distinguish resolving a
permission set from consulting it, and `if (best.tier === 3) return best` stops the walk at the first mention
(`auditAuthorityPaths.mjs:37,103`).

No exit criterion in this plan is satisfied by a grep count. W-14's declared table exists precisely so that
conformance is a lookup. **W-14 retires the script**; until then, its output may not be cited as evidence in
any workstream.

Second methodological rule, carried from phase 2 §12: **a passing route census proves nothing about scope.**
G-C and G-D are independent — a route can gate capability correctly and read the whole org. Capability
coverage and scope coverage are reported as two numbers, never one.

### 10.3 The fixture matrix

One shared matrix of principals, defined once and reused by tiers B, C and D. It is what "prove zero
divergences" in §2 is measured against, and what W-21 asserts twice.

| Fixture | Roles | Grants | Scope | Exercises |
|---|---|---|---|---|
| F1 | `admin` | full | dept `all`, site `all` | the common case; regression baseline |
| F2 | `ops` | partial | dept `all`, site `restricted` | site enforcement (the leg that works) |
| F3 | `regional_lead` | `portal.access` granted | dept `restricted` | D2; I-16 admitting a non-legacy role |
| F4 | `school_director` | no `portal.access` | dept `restricted` | refusal path; W-1's exposure |
| F5 | `ops` + `regional_lead` | union | dept `restricted` | I-10 union semantics |
| F6 | membership, **no profile row** | any | — | I-19 deny-on-absent |
| F7 | `user_profiles.role` only, no `user_roles` | — | — | I-2; W-20's Q2 population |
| F8 | memberships in two orgs | differing | differing | I-7; no lexicographic tiebreak |
| F9 | `settings.users_roles`, not `admin` | that key | any | I-11 ceiling and self-elevation |
| F10 | service-role client, no principal | — | — | I-3 |

F6, F7 and F10 encode *defects* — they must resolve to denial after their workstream lands, and each is a
regression lock (§13). Build the matrix in **wave 1**, before it is needed, so waves 2–5 inherit it. It is the
single highest-reuse artifact in the plan.

### 10.4 Per-wave exit gates

No wave closes without: its tier A checks in CI · its tier B suite green · its tier C suite run and recorded ·
lockout-class workstreams carrying tier D evidence (route, steps, expected vs observed, console errors,
evidence path) · migrations accounted per §11 · regression locks registered.

---

## 11. Migration register and the apply gate

Migrations introduced by this plan, against `supabase/migrations/` (289 files today):

| # | Workstream | Migration | Target | Preflight focus |
|---|---|---|---|---|
| M1 | W-6 | Backfill access profiles for memberships lacking one | shared | Row count == W-0 Q4 (**= 2** at census time, re-run before applying); no existing profile modified (**0 orphan profiles exist**) |
| M2 | W-5 | Atomic membership+profile RPC | shared | Function only; no data effect |
| M3 | W-9 | Catalog consolidation — repoint grants to one FK | shared | Every grant satisfies the surviving FK; no unexpected incoming FKs or dependent views |
| M4 | W-9 | Drop retired catalog tables (**separate, later**) | shared | Zero readers proven since M3 |
| M5 | W-11 | Catalog reconciliation — add enforced keys, delete unenforced | shared | Enumerated deletion list reviewed by the operator first |
| M6 | W-12 | `seed_default_rbac()` enumerates grants | shared | Catalog width vs live — a new tenant must not silently get a thinner set |
| M7 | W-13 | Seed `portal.access` and grant it | shared | Every org with an `admin`/`ops` membership receives the grant (**W-0 Q5 = 0**, so no org is missed) |
| ~~M8~~ | ~~W-16~~ | ~~Remediate undefined `user_roles.role` values~~ **STRUCK — W-0 Q3 = 0, nothing to remediate** | — | — |
| M9 | W-16 | FK `user_roles.role` → `role_definitions` | shared | Zero violating rows — re-run Q3 at preflight (M8 no longer precedes it) |
| M10 | W-19 | Remove dead `owner`/`manager` RLS grants *(if D4=b)* | shared | No policy loses its only grant |

**Every one targets `shared`.** Per [`MIGRATION-APPLY-GATE.md`](../../MIGRATION-APPLY-GATE.md), each therefore
requires a **read-only preflight on the target database before the operator is asked to authorize anything**,
with `migrations[].preflight = { ok: true, summary, evidence_path }` and JSON evidence under this QA directory.
A bare `awaiting_authorization` row is not a valid ask.

Two rules from that document bear directly on this plan:

- **Preflight `ok: true` does not auto-apply.** It unlocks the honest question — authorize, or keep deferred.
- **Accept ≠ authorize-apply.** A gate of `needs_operator` must not complete a phase or advance the spine, even
  in autonomous mode. That bug shipped once on Access & Roles Phase 0 (2026-07-29).

M3/M4 are deliberately split across migrations: repoint before drop. ~~M8/M9 likewise — remediate before
constrain~~ — **M8 is struck, so M9 stands alone**; the remediate-before-constrain rule survives as a
principle, and would return the moment Q3 becomes non-zero. Combining M3/M4 produces a migration that cannot
be applied safely and cannot be reverted cleanly.

**Nine migrations remain, not ten.** Each still requires its own read-only preflight against the target
immediately before the authorization ask — W-0's counts are a 2026-07-31 snapshot, not a standing warrant.
The trusted host action (`database.read_census`) is the channel for those preflights; none of them needs an
operator to handle a credential.

**This phase applies no migration and writes no SQL.** The register is a plan.

---

## 12. Decision gates

Phase 2 §14 raises four decisions. None blocks the model; each blocks specific work.

| Decision | Question | Blocks | Needed by | Phase 2 recommendation |
|---|---|---|---|---|
| **D1** | Does a person ever become a principal? | Nothing in this plan | Not on the critical path | "Not yet" — adopt §4's rules now; they cost nothing and make an implicit link impossible later |
| **D2** | What are `regional_lead` and `school_director` for? | W-13 grants, W-17 | Before wave 4 | Grant them `portal.access`; under I-16 admitting them is configuration |
| **D3** | What is the delegation ceiling? | W-18 (**not** W-2) | Before wave 5 | No — subset rule plus self-elevation ban |
| **D4** | Is RLS an authority layer? | W-19 sizing | Before wave 5 scheduling | (b) not an authority layer, with (a) as a stated goal |

**D1 is genuinely not blocking**, which is worth stating plainly: phase 2 §4 specifies the rules that hold
whether or not the surface ships, so no workstream waits on it.

**D2 is on the critical path.** W-13 can ship behaviour-preserving without it — seed `portal.access` to
`admin` and `ops` only — but the workstream's *value* is admitting a third persona, and doing that later means
a second grant migration. Answering D2 before wave 4 costs one conversation; answering it after costs a
migration.

**D3 is deliberately split.** The self-elevation ban (W-2, wave 1) is not D3-dependent — no reading of D3
permits a principal to modify its own authority. Only the subset rule waits.

---

## 13. Regression locks

Each closed divergence gets one test that fails if it reopens. These are the locks, named, so a future
contributor deleting one has to do it on purpose.

| Lock | Asserts | Tier | From |
|---|---|---|---|
| **RL-1** | No route gates on `access.ok` alone | A + B | G2 / W-1 |
| **RL-2** | Every grid key exists in the catalog *(superseded by RL-3)* | B | C5 / W-3 |
| **RL-3** | The grid is generated; no literal key list in UI source | A | I-14 / W-10 |
| **RL-4** | Membership creation writes a profile row atomically | C | G4 / W-5 |
| **RL-5** | Absent profile denies; never `all` | C | I-19 / W-7 |
| **RL-6** | No role literal appears in `accessScope.ts` | A | C8 / W-8 |
| **RL-7** | Exactly one FK on `role_permission_grants.permission_key` | A | C3 / W-9 |
| **RL-8** | No `SELECT` over the catalog in a grant seed | A | G5 / W-12 |
| **RL-9** | No hard-coded portal role set (`PORTAL_ROLES`, `ALLOWED_ROLES`) | A | C6 / W-13 |
| **RL-10** | Every route file appears in the declared capability table | A | C1 / W-14 |
| **RL-11** | A principal cannot modify its own authority | B + C | G3 / W-2 |
| **RL-12** | No authority path reads `user_profiles.role` or `app_users.role` | A | §2.1 / W-20 |
| **RL-13** | Preview and runtime resolve identically across the fixture matrix | C | C11 / W-21 |
| **RL-14** | No `sort()` over `org_id` on an authority path | A | I-7 / W-22 |

RL-2 is listed *because* it is temporary: W-3 adds it and W-10 replaces it. An assertion that becomes
structurally unnecessary should be replaced deliberately, not quietly deleted when it starts failing.

### 13.1 Invariants with no workstream

All 21 rows of phase 2's divergence register are assigned above. Four invariants are not, because no phase 1
finding contradicts them. They are listed so that "unassigned" is a stated conclusion rather than an oversight:

| Invariant | Why no workstream | Still verified by |
|---|---|---|
| **I-4** — delegated-link tokens are expiring, single-use, org/subject/action-bound | `action_links` carries `expires_at` and `consumed_at`, and the consume route checks both, returning 410 for each (`web/app/api/action/[token]/consume/route.ts:24-29`, verified this phase). Phase 2 §3.4 states the properties as *required* so a future token type cannot ship with four of six | Tier C token tests (expiry, replay, cross-subject, cross-org) added alongside wave 1's fixture matrix |
| **I-5** — no implicit `persons` ↔ principal relation | The absence is the correct design (phase 2 §4.1), not a defect. Adopting §4.2's five rules costs nothing today | Tier A: no FK or join between `persons` and `auth.users`; no email/phone-based principal lookup |
| **I-6** — every authority decision is made against one explicit org | The one link of the chain enforced everywhere today (phase 1 §5). The model's only requirement is that it stay that way | Tier A: every authority query filters `org_id` |
| **I-21** — scope enforced symmetrically on reads and writes | `accessScope.ts` already provides all three families (list-filter, mutation assert, drawer-read assert). No finding shows asymmetry | Tier C integration matrix, per scoped entity, landing with W-15 |

I-4 and I-21 carry real test work even without a workstream; that work attaches to wave 1 (fixture matrix) and
W-15 (per-family sweep) respectively rather than standing alone.

---

## 14. Scope, risks, limits

### 14.1 Explicitly out of scope

Per the assignment constraints:

1. **Shipping Access & Identity UI.** An Access product surface already exists — four chapters at
   `/organization/access` (`users`, `roles`, `scopes`, `security`;
   `web/tests/access/accessProductUi.test.ts:22-35`). W-10 and W-21 modify existing surfaces so they tell the
   truth about the model. Neither ships a new experience.
2. **Rebuilding Users/Roles settings.** W-10's projection and W-17's multi-role write path change what those
   screens are backed by, not what they are.
3. **No product UI completeness claim.** Nothing in this document asserts that any Access & Identity UI is
   complete.
4. **No push, merge, or PR**, and **no migration applied**. §11 is a register, not an apply log.

### 14.2 Risks

| Risk | Where | Mitigation |
|---|---|---|
| Operator lockout | L1–L4 | The §2 ritual — seed, dual-read, prove zero, switch — plus tier D evidence |
| Shared-DB migration damages grants | M3, M5, M9 | §11 preflight before the authorization ask; repoint-before-drop, remediate-before-constrain |
| W-15 stalls half-done and gets reported as complete | Wave 4 | Per-family counts published as they land; RL-10 makes incompleteness a build failure |
| Deleting unenforced keys surprises an operator | W-11 / M5 | The deletion list is reviewed **before** the migration, as an exit artifact |
| Waves 2 and 3 collide | Parallelism | Disjoint surfaces — scope tables and handlers vs catalog tables and the grid. If either widens, serialize. |
| The plan's own verification repeats C1 | Everywhere | §10.2 — no exit criterion is a grep count; W-14 retires the census script |

### 14.3 Limits

1. **Static and file-grounded** when written, like phases 1 and 2 — no request issued, no browser used, no
   source file modified. **Superseded in one respect on 2026-07-31:** W-0 has since been executed read-only
   against the deployed database via a trusted host action, so §4 now carries live counts. Everything else in
   this plan remains static analysis.
2. **Sizings are estimates**, calibrated to 539 routes and 289 migrations, not measured. W-15 (L) has the
   widest error bar; W-4's exception baseline will sharpen it.
3. ~~**Wave 0 is a plan for queries, not their results.**~~ **RESOLVED 2026-07-31.** Wave 0 executed; its
   counts are in §4 and have been applied. The reordering it produced: W-20 stays in wave 5 (G1 latent), M8 is
   struck, and L2/L3/L4 have empty remediation sets. Waves 2 and 5 are no longer gated by W-0. The counts are
   a snapshot — each lockout-class switch and each §11 preflight must re-run the census rather than cite it.
4. **Membership writers beyond `POST /api/admin/users` were not enumerated.** W-5 carries that audit as its
   first step; if other writers exist, W-5 grows.
5. **The observation window for dual-read is not specified.** It depends on real traffic to the authority path,
   which is a deployment fact this phase cannot see. Each lockout-class workstream sets its own and states it.
   **W-0 largely dissolves this:** at 6 `(user, org)` pairs the population is exhaustively enumerable, so
   step 3 is better satisfied by enumerating all six and computing both answers for each than by waiting on
   traffic that may not come. The limit would return at a larger tenant — the recommendation is scale-bound,
   not permanent.
6. **No effort is budgeted for governance-doc reconciliation.**
   `docs/platform/governance/roles-and-permissions.md` is `status: canonical` and states a rule the code does
   not follow, with a dead "Expanded reference" pointer (phase 2 §15.6). It should land with W-15, and is not
   sized here.

---

## 15. Provenance

- **Inputs:** [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (findings and counts),
  [`02-canonical-access-identity-model.md`](./02-canonical-access-identity-model.md) (invariants I-1…I-25,
  divergence register §13, decisions D1–D4), and
  [`MIGRATION-APPLY-GATE.md`](../../MIGRATION-APPLY-GATE.md) (shared-apply protocol).
- **Verified for this phase** in `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`:
  `web/vitest.config.ts`, `web/playwright.config.ts`, `web/package.json` scripts (`test` and `typecheck` route
  through `scripts/local-dev/vac-run` to the validation broker), `web/scripts/auditAuthorityPaths.mjs`
  (primitive list and early-return), `web/app/api/admin/users/route.ts:95-110` (G4 re-confirmed independently —
  the insert names `user_roles` only), and the test conventions in `web/tests/admin/usersRolesAuth.test.ts`,
  `web/tests/admin/verticalBootstrap.integration.test.ts`, `web/tests/runtime/d1ProvisioningBudget.live.test.ts`,
  `web/tests/access/accessProductUi.test.ts`.
- **Counts reproduced this phase:** 2380 test files under `web/tests`; 289 migrations; existing access-adjacent
  suites (`adminAccessScope`, `accessScopeFingerprint`, `adminPortalRolePick`, `permissionGrid`,
  `resolveAdminAccessCore.chooseOrg`, `userRolesMembership`, `getAdminAccessContext`) identified as extension
  points rather than new files.
- **Method:** static and file-grounded. No code, schema, migration, or UI changed.
