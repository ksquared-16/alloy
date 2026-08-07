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
· **W-1…W-3 executed 2026-07-31** (same mission, assignment `asg_d77353d7377647`)
· **W-4 executed 2026-07-31** (same mission, assignment `asg_d203f547736c16`)
· **W-0 re-run 2026-08-04, zero drift** (mission `msn_f74ed02c126c88d7ff`, assignment `asg_2a1f4d9dc80899`)
· **W-1…W-3 re-verified 2026-08-04** (same mission, assignment `asg_e9308076173af6`) — locks hold; W-3's
recorded *reasoning* is superseded by a migration from another track (§5, §14.3.10)
· **W-4 re-verified 2026-08-04** (same mission, assignment `asg_91e144a61569e4`) — check green across a
20-route expansion; baseline 26 → 17, entirely the `book-v2` retirement; a slack ratchet ceiling was
found and tightened (§5)
· **W-0 query amended 2026-08-06 under the Mission 2 reopen** (same mission and assignment) — the
self-identifying target column is authored and grounded; **run 3 is not executed** and awaits one
authorization (§4)
· **W-0 re-issued 2026-08-07** (mission `msn_e7894cb7225bae3c2b`, assignment `asg_86eb0e4a95142e`) — the run-3
*preparation* was audited and two plumbing defects found: the insertion anchor does not match the query it
anchors to under `JSON.parse`, and the obvious execution route fails closed on a stale `query_hash` (§4)
· **W-0 made executable 2026-08-07** (mission `msn_bc33a72e3138ebc215`, assignment `asg_f34761f0f418ee`) — the
amended SQL was **promoted into `combined_query`** and the stale top-level `query_hash` renamed to
`runs_1_2_query_hash`. Until this landed the improvement was authored but **unreachable**, sitting in a key
nothing reads. The alternative route — a dedicated run-3 artifact — is **unexecutable**: `queryArtifactPath` is
a default parameter and none of its three call sites passes it, so it would have failed *silently*, spending
the authorization on a byte-identical run. **That rename must not be reverted** (§4)
· **W-0 run 3 EXECUTED 2026-08-07T17:24:16Z** (`tha_67f9c69f628d1a`) — **zero drift for the third consecutive
run** across all of Q1–Q6, and the census **identifies its own target for the first time**: org fingerprint
`ab7e5dde…`. Query hash `743cd63b…` → `a3982ca5…`, which is the added key, not drift. The Supabase project ref
is still unproven, so `target.confirmed_against_live` stays `false` (§4)
· **W-1…W-3 re-executed 2026-08-06 under the reopen** (same mission and assignment) — 55 suites green
on arrival across a 192-commit interval; RL-1 widened from three directories to the whole of
`web/app/api` and hardened against comment-only gates; **W-2's exit criterion is not met — two
self-authority paths its enumeration could not see are live and latent, and W-8 arms one of them** (§5)
**Status** Proposed — a plan to be scheduled, not a record of work done. **Exceptions: Wave 0 (§4) is
executed and complete**; its live counts are recorded and have been applied to §3, §6, §8, §9, §11 and §14.
**Wave 1 (§5) is complete — W-1, W-2, W-3 and W-4 are implemented and green**; their execution records
are in §5 and their locks are live in §13. Every other wave remains a proposal.

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
| **1** | Fail-closed quick wins, no schema | W-1 … W-4 | — · **DONE 2026-07-31** (W-1…W-4) |
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
| Evidence file | [`wave0-authority-census.json`](./wave0-authority-census.json) — **counts recorded; exit criteria met**. Holds two runs: `run_history` and `drift_since_previous_run`; `results` carries the current (2026-08-04) run |
| Queries | Q1–Q6 written and schema-verified against `supabase/migrations`, plus one combined single-statement form returning all answers as one JSON row |
| Executed | **Yes, twice** — 2026-07-31T15:48:45Z and re-run 2026-08-04T17:00:21Z, read-only, against the deployed database. Same query hash, same target fingerprint, identical counts |
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

#### W-0 re-run under Mission 2 — **DONE 2026-08-04**, assignment `asg_2a1f4d9dc80899`

Mission 2 re-issued W-0 against an evidence file that was already executed and complete. Re-asserting it would
have been the cheap answer and the wrong one: §4's own rule is that **the counts are a snapshot and every
consumer re-runs rather than cites**. The census was therefore re-executed rather than re-read.

| Field | Value |
|---|---|
| Channel | Trusted host action `database.read_census` — `tha_8defba3adcee6a`, auth `tha_auth_eec51323ab20` |
| Query | **Unchanged**, hash `743cd63b…` — byte-identical to run 1, so the two runs are directly comparable |
| Target | `alloy_deployed_primary`, fingerprint `b15dad2c6d030ed4` — same as run 1 |
| Executed | 2026-08-04T17:00:21Z, read-only, Director host-side; no credential reached the worker |
| Base | This worktree has since merged `origin/staging` (`5118940f7`); the migration tree grew 289 → 302 |

**Result: zero drift.** Every consequence-bearing count returned exactly what it returned on 2026-07-31 —
Q1 (0 application triggers), Q2 (0), Q3 (0), Q4 (**2** of 6 pairs, from 8 rows), Q5 (0 / 0), Q6 (1 / 2).
All six §4 rules therefore stand **re-confirmed against live data** rather than carried forward on a snapshot.
The lockout-class picture is unchanged: L2, L3 and L4 remediation sets are empty; L1 is 2 rows.

**One observable difference, with no consequence.** Triggers on `auth.users` rose 54 → 62. All 62 are
`tgisinternal = true` FK triggers — the new ones created by migrations that added foreign keys referencing
`auth.users`. **Application triggers are still 0**, which is the only figure Q1's rule reads, so
`handle_new_user()` remains defined-but-unattached, G1 stays latent, and W-20 stays in wave 5.

**Do not read stability as safety.** Q4 was the count expected to move, because W-5 has not landed —
`POST /api/admin/users` still inserts into `user_roles` alone (`web/app/api/admin/users/route.ts:101-105`).
It held at 2 because `q4_membership_rows` also held at 8: **no membership was created through the product in
this window.** That is an absence of activity, not a repaired defect. Two identical runs four days apart are
*not* evidence that the number is stable under load, and §11's preflights still each re-run the census.

**A schema fact both runs predate, outside W-0's scope.** Migration
`20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql` went live on the target via the
Supabase dashboard on 2026-07-30 (as version `20260730000602`) and was vendored into the repo on 2026-07-31
(`555fa056a`). It **drops `public.permissions` and `public.permission_keys` as tables and recreates them as
views** over `permission_definitions`, collapses `role_permission_grants` onto a single
`role_permission_grants_permission_definitions_fkey`, and adds an `orgs_seed_default_role_definitions` trigger
on `public.orgs`. The census reads none of these, so **both runs' counts are unaffected**. But **§7/W-9 still
describes three catalog tables carrying two FKs on one column, and §5/W-3's reasoning rests on that same
three-table picture — a premise now false on the deployed target.** Recorded as a follow-up for the W-9 owner;
deliberately **not** edited into §7 by this assignment, whose scope is W-0.

**Still outstanding: the census cannot identify its own target.** `target.improvement_for_next_run` — add a
self-identifying column so the output evidences which database it hit — was carried into a second run
unadopted, because run 2 deliberately reused the committed query. `current_database()` is `postgres` on every
Supabase project, so "we queried the right database" still rests on the channel's assertion. It should land
with whichever census next changes the query.

#### W-0 under the Mission 2 reopen — **query amended 2026-08-06, run 3 NOT executed**

The reopen re-issued W-0 a third time, against exit criteria already met and re-confirmed four days earlier.
**W-0's counts were not re-asserted and no third identical run was requested** — the paragraph directly above
names that outcome as the wrong one. The reopen was instead spent on the single item still open *inside W-0's
own scope*: the census cannot identify its own target.

| Field | Value |
|---|---|
| Change | One added key, `target_identity`, carrying the org `id`/`slug` set, an `md5` fingerprint over the org ids, and `server_addr`/`server_version`/`cluster_name` as weak corroboration. Authored at the census file's `next_run_prepared` |
| Q1–Q6 | **Byte-identical.** Only a new key is added, so run 3's counts stay directly comparable to runs 1 and 2 and the drift comparison stays valid |
| Grounding | `public.orgs(id, name, slug, status, created_at, industry_id)` — `remote_schema.sql:2284-2291`. Only `id` and `slug` are read. `current_setting(name, true)` is the missing-ok form, so an unset parameter yields `NULL` rather than raising |
| Read-only | Checked **by inspection** against `trusted-host-sql-readonly.mjs`: no forbidden keyword or phrase, still one statement, no new CTE. (`'cluster_name'` is a string literal and is stripped before the `CLUSTER` keyword scan.) Not run through `validateReadOnlySql()` — `node` and `shasum` are both permission-walled in the worker. The Director re-validates at execution, which is the real gate |
| Hash | **Deliberately not recorded.** The worker cannot compute `sha256` here, and a guessed hash fails the run with `query_hash_mismatch`. The registry derives it; the executing Director records it |
| Committed artifact | `combined_query` and `query_hash` (`743cd63b…`) are **unchanged**, so runs 1 and 2 stay verifiable against them |
| State | **Awaiting one operator authorization** for `database.read_census`. Nothing was executed |

**What this does not do.** Authoring the fix is not evidence. Until run 3 runs, the target is still *asserted
by the channel, not proven by the output*, and `residual_risks[1]` stands undiminished. Q1–Q6 are also now
**six days older** than the counts every §11 preflight is required to re-derive rather than cite.

**Why this stopped short of executing.** Two reasons, and the second is the load-bearing one. First, the read
is privileged: the trusted host action requires an operator authorization decision, and the worker never holds
the credential — by design. Second, **§4.1's W-23 (Wave 0b) already schedules a re-run of Q1–Q6 on this same
channel**, alongside Q7–Q17. Spending an authorization on Q1–Q6 alone, when a second census will re-run them
anyway, is exactly the mistake §4.1 warns against: *"asking for live access four separate times is the mistake
`W-0` Q6 already avoided once."* Whether run 3 goes alone or folds into W-23 is an operator decision, and it
is recorded here rather than taken unilaterally — W-23 produces a **different** artifact
(`wave0b-authority-census.json`) under a **different** workstream, and this assignment's scope is W-0.

#### W-0 re-issued a fourth time — **2026-08-07**, assignment `asg_86eb0e4a95142e`: auditing the run-3 preparation

W-0 was re-issued a fourth time against exit criteria met on 2026-07-31 and re-confirmed on 2026-08-04. **The
counts were not re-asserted and no fourth identical run was requested.** Run 3 was the only item open inside
W-0's own scope, and at the start of this pass it was blocked on the single operator authorization outstanding
since 2026-08-06 — the trusted host action runs Director-side and no worker-side channel to it exists, by design.

The pass was therefore spent auditing the run-3 *preparation* for defects that would have wasted that
authorization when it arrived. It found two, both in the plumbing rather than the SQL. **The authorization then
arrived mid-pass and run 3 executed** — recorded below at *W-0 run 3*.

**1. The insertion anchor does not match the query it anchors to.** `next_run_prepared.insertion_anchor` is
written with a doubled escape while `combined_query` uses a single one, so after `JSON.parse` the anchor ends in
a literal backslash-`n` and the query ends in a real newline. `combined_query.includes(insertion_anchor)` is
therefore **false** — an executor assembling run 3 programmatically finds *zero* matches for an anchor the file
tells it occurs exactly once. The adjacent `inserted_sql` field uses the opposite (correct) convention, which is
how this survived two authoring passes. **This is measured, not argued:** `jq` is allowlisted in the worker even
though `node` is not, and it parses the file with the same JSON semantics the registry uses — `contains(anchor)`
= false, `contains(anchor_parsed)` = true, occurrences = **1**. The original value is deliberately **left
unchanged** (re-escaping it would fix a parsed-string executor and break a raw-source-text one); a new
`insertion_anchor_parsed` field carries the unambiguous form.

**2. The obvious execution route fails closed on a stale hash.** `execution_mechanics` offered two routes without
distinguishing them. Reading `trusted-host-action-registry.mjs:86-106`, they are not equivalent. `validateInputs`
falls back to the artifact's own `query_hash` whenever no `expectedQueryHash` is supplied, then compares it to
`sha256(sql)`. So **promoting the amended text into this file's `combined_query` while leaving `query_hash` at
`743cd63b…` fails the run with `query_hash_mismatch`** — and correcting that hash in the same edit would destroy
runs 1 and 2's verifiability against this file. The route that works is a **dedicated run-3 artifact carrying no
`query_hash` key at all**: the comparison is then skipped and the registry computes the hash itself, so no
precomputed `sha256` is needed — which matters, because the worker still cannot compute one.

**That trap was resolved the same day, by a different route than the one recommended.** Assignment
`asg_f34761f0f418ee`, running concurrently in this worktree, promoted the amended SQL into `combined_query`
*and* renamed the top-level `query_hash` to `runs_1_2_query_hash` in the same edit — reaching the safe
end-state without a third file. Verified against the live artifact: `combined_query` now carries the
`target_identity` block, and at the moment of execution neither `query_hash` nor `combined_query_hash` existed
at top level, so the registry computed the hash itself. Runs 1 and 2 stay verifiable against the git blob
recorded in `runs_1_2_query_provenance`, which is a stronger anchor than an in-file copy would have been.

**Post-execution, a top-level `query_hash` has reappeared — and that is correct.** The Director's merge-back
writes one back holding **run 3's** hash, `a3982ca5…`. It matches the amended `combined_query`, so it validates
rather than traps. **Do not confuse it with `743cd63b…`**, which is runs 1/2's and now lives at
`runs_1_2_query_hash`. The standing hazard is the inverse of the original one: writing `743cd63b…` back into a
top-level key named `query_hash` would silently re-arm the mismatch and fail every future run. That key must
not be "restored".

**3. The dedicated-artifact route cannot execute at all — and this is the finding that settles the choice.**
Recorded by `asg_f34761f0f418ee`. The two paragraphs above treat the two routes as alternatives, one tidier than
the other. They are not alternatives. **`queryArtifactPath` is not selectable through any Director or operator
path in the codebase.** It is a *default parameter* of `fulfillDatabaseCensusForMission`
(`trusted-host-actions.mjs:489`), pinned to `wave0-authority-census.json`, and **all three of its call sites
invoke it without that argument**:

```
trusted-host-director.mjs:70   the worker-decision path — the only path a paused worker can reach
v2-api.mjs:329                 POST /api/v2/trusted-host/census
v2-api.mjs:461                 the operator's authorize_mission_census decision handler
```

A dedicated `wave0-run3-census.json` would therefore never be opened by anything. The failure mode is the bad
one: not a refusal, but a **silent success returning the wrong answers**. The census would run, validate, report
green, and hand back the runs 1/2 counts — a fourth byte-identical run, carrying **no `target_identity` at all**
— having spent the single operator authorization this workstream has been waiting on since 2026-08-06. The write
side confirms the same pinning independently: `trusted-host-actions.mjs:379-383` hard-codes the census evidence
path to this same file regardless of which artifact was read. **Read and write are both pinned to
`wave0-authority-census.json`; only that file can be run 3.** Promotion was not the tidier option — it was the
only executable one.

This also re-dates the gap. Between 2026-08-06 and 2026-08-07 the improvement was authored but **unreachable**,
sitting in `next_run_prepared.inserted_sql`, a key nothing reads. An authorization granted in that window would
have produced the byte-identical run the plan explicitly names as the wrong outcome. That gap was closed by the
promotion — and the authorization then arrived the same day, so run 3 executed against the amended query and
returned `target_identity` as designed. Had the authorization landed one day earlier, it would have been spent
on a fourth identical run.

Consequently the run-3 *anchor* fields are now historical rather than pending — the insertion has been applied,
and re-applying it would duplicate the `target_identity` key. They are retained because the encoding defect
above remains a live trap for any future amendment.

**Worker tooling, re-tested and refined.** The 2026-08-06 claim that `node` and `shasum` are permission-walled
**holds**, with one correction worth having: `node --version` *is* allowed (v22.21.1) while `node -e` and
`node --input-type=module` are *not*, and `shasum -a 256` is not. Node is present but not executable for
arbitrary code, so `readonly_validation` stays **by inspection** and the run-3 `query_hash` stays genuinely
uncomputable in-worker. Neither is an authoring shortcut. The Director discharges both at execution —
`validateReadOnlySql` is called unconditionally on every run (`registry.mjs:111`).

**W-0's exit criteria were unaffected throughout and remain met.** Q1–Q6 counts and query text stay committed;
L1–L4 may cite them, subject to the standing rule that every consumer re-derives rather than cites. The counts
were eight days old when this audit began — run 3, below, made them current.

#### W-0 run 3 — **EXECUTED 2026-08-07T17:24:16Z**, and the census finally identifies its own target

The authorization that had been outstanding since 2026-08-06 was granted, and run 3 executed against the
promoted `combined_query`. Executed under mission `msn_e7894cb7225bae3c2b` / assignment `asg_86eb0e4a95142e`
(trusted host action `tha_67f9c69f628d1a`); the artifact it ran was made executable by `asg_f34761f0f418ee`.
The full record — `run_history[3]`, `target_identity_resolved`, and the rewritten `residual_risks[1]` — is in
[`wave0-authority-census.json`](./wave0-authority-census.json); this section records only what it means for §4.

| Field | Value |
|---|---|
| Query hash | `743cd63b…` → **`a3982ca5…`**. The hash *changes* here, and that is correct rather than drift: the sole difference is the added `target_identity` key. **Every Q1–Q6 expression is byte-identical**, so the counts stay directly comparable to runs 1 and 2 |
| Target | `alloy_deployed_primary`, channel fingerprint `b15dad2c6d030ed4` — and now, for the first time, **self-evidenced** |
| Org fingerprint | **`ab7e5dde2e229d5c46e251456e4d9534`** over org ids `7803388d…` / `93667019…` (slugs `alloy-bend`, `demo-childcare-co-…`), `server_version` 17.6, `cluster_name` `main` |

**Zero drift, for the third consecutive run.** Every consequence-bearing count returned exactly what it returned
on 2026-07-31 and 2026-08-04 — Q1 (**0** application triggers of 62 total; `handle_new_user()` still defined
and unattached), Q2 (0), Q3 (0, and `q3_distinct_undefined_roles` empty), Q4 (**2** pairs without a profile, of
6 distinct pairs from 8 membership rows, 0 orphan profiles), Q5 (3 admin/ops pairs, 0 undefined, 0 inactive),
Q6 (1 restricted admin/ops, 2 restricted site-scope). **All six §4 rules stand re-confirmed against live data
for the third time.** L2, L3 and L4 remediation sets are empty; L1 is still exactly 2 rows.

**What the target column bought, stated precisely.** Org UUIDs are globally unique, so `ab7e5dde…` is a
fingerprint of the data the census actually read, computed by the database rather than asserted by the channel.
Any future run returning it is *provably* against the same target; any run that does not is provably against a
different one. **It does not prove the Supabase project ref** — nothing in the output names
`ikaxilmwmrmbagoidedu`, so `target.confirmed_against_live` stays `false` deliberately. The residual is now much
narrower than it was: the *identity* of the database queried is self-evidenced, and only its *name in Supabase's
console* is still taken on trust. Runs 1 and 2 returned no org ids, so this run **establishes** that baseline
rather than confirming it backwards — their target remains inferential; every run from here forward does not.

**Two mechanical facts for whoever runs the next census**, both observed rather than predicted:

1. **The Director's merge-back does not append to `run_history`.** It rewrites `status`, `query_hash`,
   `execution` and `results` only (`trusted-host-actions.mjs:385-406`), spreading every other key through
   untouched. The run-3 history entry was written by hand afterwards, and the next one will have to be too.
2. **It overwrites `results` in place**, so the prior run's raw result block does not survive in the file.
   Run 2's is recoverable from git blob `f95f89302bbd92f3e24e8c4a93dbb0231f0a664e` (this file's content at
   commit `7dc06920a`), which is also where runs 1 and 2's exact query text lives now that `combined_query`
   carries the amendment.

**W-0's counts are no longer eight days old — they are current as of this run.** The standing rule is
unchanged and still governs: Q4 is the count that grows, and every §11 preflight must re-derive it rather than
cite this one. Per the census file's `now_also_serves_w6_m1_preflight`, this run is *also* the fresh Q4 that
W-6/M1 requires immediately before apply, and its `q4_pairs_without_profile = 2` is the number M1 must equal.

**W-6's pre-apply rules pass on this run — with one that decays.** Rule 1 (sizing) is satisfied at 2; rule 2
(grain) is satisfied because that figure is `q4_pairs_without_profile`, not the 8 membership rows or the 6
distinct pairs, all three still distinct; rule 4 is clean because `q4_profiles_without_membership` = 0, so there
are no orphan profiles to collide with. Neither abort condition fired — the 2 pairs are the same pre-existing
ones, not newly created, so nothing suggests a sixth membership writer. Rule 3 (post-apply anti-join = 0) cannot
be discharged before the apply. **Rule 5 — immediacy — is the one that expires:** these are a preflight only if
the apply follows closely, and *an aged preflight is not a preflight*. W-0 supplies the numbers; **`preflight.ok`
is W-6's to flip and is deliberately not set by the census file.** If time has passed, the correct move is
another census — now a single authorization on a proven channel. Full rule-by-rule evaluation lives at the
census file's `w6_m1_preflight.preflight_run_3_outcome`.

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

#### W-1 execution record — **DONE 2026-07-31**

**The exposure is three routes, not six.** Three of the six were already portal-gated at their first
statement, and the plan cited the wrong line in each:

| Route | Plan's citation | What that line actually is |
|---|---|---|
| `analytics/metrics/[id]/trend/route.ts` | `:40-41` | a **second** access resolution, inside an `else` branch, used only to build scope dimensions. The gate is `requireAnalyticsV2AdminContext()` at `:18-19`. |
| `analytics/metrics/[id]/preview/route.ts` | `:31-32` | same shape. Gate is `requireAnalyticsV2AdminMutate()` at `:15-16` — **admin-only**, stricter than portal. |
| `analytics/metrics/[id]/snapshot/route.ts` | `:23-24` | same shape. Gate is `requireAnalyticsV2AdminMutate()` at `:14-16`. |

`requireAnalyticsV2Admin*` (`lib/metrics/platform/adminApiHelpers.ts`) resolves `getAdminContextCached`,
which returns 403 unless `portalEligible`. So those three never had the G2 exposure.

**This is a C1-class false positive inside the plan itself** — the §10.2 failure mode, in a document
that names it. A route holding *two* access resolutions is indistinguishable by line-grep from a route
holding one, and the second one is the one that looks unguarded. Recorded rather than quietly corrected,
because the same reading error would recur in W-15's sweep across ~500 routes.

The three genuinely exposed routes — `intelligence/operational:26-29`, `metrics/resolve:82-85`,
`metrics/trends:46-49` — now gate through `requireAnalyticsReadAccess` (`web/lib/admin/canReadAnalytics.ts`):
portal-eligible, **or** granted `reports.read` / `reports.write`. That is the `canReadProgramPublication`
shape exactly, and it is behaviour-preserving for every `admin`/`ops` operator. The declared capability is
`reports.read`, already seeded by `20260505164000_permission_grid_keys.sql` and already the `reports` grid
row — so the gate is grantable through the product today, not permanently closed. The `portalEligible`
leg of that predicate is what W-13 replaces with `portal.access`.

**Evidence.** `web/tests/access/analyticsRouteGates.test.ts` — 31 tests. **9 red before the change, all
green after** (verified by reverting the three route files against the committed tests). The three
already-gated routes contribute 9 further tests that were green both before and after: they are
regression locks, not fixes. Each route is also asserted to deny *before* reaching its data layer, so a
403 cannot be a late failure after a query has run.

**Not six red, and that is the honest number.** The exit criterion said six; three of the six were never
broken. Nine tests went red because each fixed route carries three denial assertions.

### W-2 — Self-elevation ban *(S · I-11 · partially closes G3)*

`PATCH /api/admin/users/[userId]/role` applies no self-assignment guard. The full subset rule is D3-dependent
and deferred to W-18; **the self-elevation ban is not** — no reading of D3 permits a principal to modify its
own authority.

**QA.** Tier B: caller `userId` === target `userId` → 403, for every role value including the caller's current
one. Tier C: an integration case asserting the row is unchanged after the denial.
**Exit.** A principal cannot alter its own membership through any product path.

#### W-2 execution record — **DONE 2026-07-31**

**Three product paths, not one.** The plan named the role PATCH; its exit criterion says *any* product
path. Auditing the writers of `user_roles` and `user_access_profiles` under `web/app/api` found three
routes that mutate `(principal, org)` authority, and all three are reachable from the same live Access
screen (`components/adminV2/settings/access/AccessUsersConfigurationPage.tsx`), none of them disabled
for self:

| Path | Self-mutation it allowed |
|---|---|
| `PATCH /api/admin/users/[userId]/role` | assign yourself any role — the named defect |
| `PATCH /api/admin/users/[userId]/access-scope` | widen your own department/site scope to `all` |
| `POST /api/admin/users/[userId]/remove` | delete your own membership (self-lockout, not elevation) |

The second is a genuine self-elevation vector the plan did not name, and it matters more than it looks:
W-8 exists to make department scope enforceable, and a principal who can widen their own scope defeats
W-8 in advance. The third is not elevation, but it is *altering your own membership*, and with W-0 Q2 = 0
(every auth user has exactly their `user_roles` rows) deleting your own last row is unrecoverable without
another operator. All three are guarded.

`web/lib/admin/selfAuthorityMutation.ts` compares the caller id **from the resolved access context**
against the route param — never a body value, which the caller controls. The guard returns before
`createAdminClient()` is constructed in every path, so no statement can reach the database.

**Evidence.** `web/tests/access/selfAuthorityMutation.test.ts` — 14 tests, **7 red before the change,
all green after**. Includes the plan's "every role value including the caller's current one" case, and,
as the tier-B form of *"the row is unchanged after the denial"*, an assertion that the admin client is
never constructed. That is stronger than the proposed tier-C integration check and needs no database:
tier C cannot prove *no write was attempted*, only that one particular row still looks the same.

**Residual.** This is the self-elevation ban only. The subset rule — *A* may not grant *B* authority *A*
lacks — remains W-18 and remains D3-dependent. A `settings.users_roles` holder can still mint an `admin`
*other than themselves*, and `PUT /api/admin/rbac/grants` can still widen the caller's **own role's**
grants, which is self-elevation by a different route (role-level rather than membership-level) and is
**not** closed here. It belongs with W-18's ceiling; recorded so it is not assumed shut.

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

#### W-3 execution record — **DONE 2026-07-31, by a different fix than the one recommended above**

**The recommended fix does not work.** The text above says to point the grid row at
`ops.workflows.read` / `ops.workflows.write` because they already exist at `remote_schema.sql:731-732`.
They do exist — **but only in `permission_keys`**, seeded inside `seed_default_rbac()`. They are absent
from `permissions` and from `permission_definitions`. That breaks the repoint twice over:

1. `PUT /api/admin/rbac/grants:61-67` validates the submission against **`permission_definitions`**, so
   the save would still return 400 and still destroy the operator's other selections — the exact defect
   C5 describes, unchanged.
2. Even bypassing that validation, `role_permission_grants_permissions_fkey` (`remote_schema.sql:6508`)
   points at **`permissions`**, so the insert would fail at the database.

The plan's own §7/W-9 finding is what makes this true: `role_permission_grants.permission_key` carries
two FKs to two different tables while the write API validates against a third. A key that satisfies one
of the three satisfies neither of the others. Verified against `supabase/migrations` — see the RL-2 test,
which parses every `permission_definitions` INSERT in the migration tree rather than trusting a list.

**What shipped instead: the row is removed.** The plan's other candidate — seed the bare keys — is a
migration, which this wave excludes by definition, and would need the §11 preflight and an operator
authorization. Removal is the only remedy that satisfies the exit criterion inside wave 1's constraints,
and it costs no authority: **no route enforces `workflows.read` or `workflows.write`.** The only
references in the codebase are three comments saying the key is explicitly *insufficient* for operational
-expectations authoring. The row granted nothing and could only destroy input.

This does not lose the capability. W-10 makes the grid a projection of the catalog, so the row returns on
its own the moment W-11 seeds a workflows key that something enforces — which is the correct order, and
the reason not to seed a fourth vocabulary variant now.

**Evidence.** `web/tests/admin/permissionGrid.test.ts` — RL-2 added, **2 red before the change, green
after**. Before: `['workflows.read', 'workflows.write']` were the *only* two of the grid's 20 keys absent
from `permission_definitions`, reproducing C5 exactly and confirming the parser is not vacuous. The
full-grid round-trip assertion covers the plan's second exit clause.

**This deviates from an accepted plan; it was raised as a decision rather than absorbed, and the operator
ratified the removal on 2026-07-31** (option (a) — confirm removal; the alternatives were a migration
seeding `workflows.*` into all three catalog tables, or a visible-but-disabled row). **The W-3 remedy of
record is therefore removal, not the repoint written above** — a future contributor reading only the
recommendation would reintroduce the 400.

#### Wave 1 re-verification under Mission 2 — **DONE 2026-08-04**, assignment `asg_e9308076173af6`

Mission 2 re-issued W-1…W-3 against records that were already executed and green. §4's rule for W-0 applies
here for the same reason: **re-execute rather than re-assert**. The three suites were re-run on the current
base, and each lock's *subject* was re-enumerated — a lock naming six files cannot notice a seventh arriving.

| Field | Value |
|---|---|
| Base | `9e19c8736`, after this worktree merged `origin/staging` (`5118940f7`); migrations 289 → **302**, API routes 539 → **559** |
| Branch | `hotfix/vacilando-ui-freshness-flash` — **not** the slot's nominal `agent/claude/6-vacilando-os-product-def`. All three Wave 1 artifacts are present on it; recorded, not changed |
| Suites | 50 tests green, matching the 2026-07-31 record exactly (31 + 14 + 5). **55** after this assignment's addition |
| Evidence | [`wave1-reverification-evidence.json`](./wave1-reverification-evidence.json) |

**W-1 / RL-1 — holds, and the lock was widened.** All six routes still carry their gates. The three families
W-1 owns were re-enumerated at **26 route files**; every one references a gate that denies a principal the
portal refuses to admit. The one new route resolving the raw G2 primitive
(`metrics/snapshots/write/route.ts:47,89`) gates through `requireAdminOrOps()` at `:45` first — which
qualifies via `bundle.portalEligible` (`lib/adminAuth.ts:43-45`) — so it is the *two access resolutions*
shape W-1 documented, not a new exposure.

That census was done by hand this run, which is precisely the thing §10.2 says not to leave as a number in a
document. It is now a test: `analyticsRouteGates.test.ts` walks the three family directories and asserts each
route references a sufficient gate, with an empty reviewed exception list in W-4's ratchet idiom. **This is
not RL-1's tier-A half** — that remains W-14's 559-route declared table. It proves a gate is *referenced*,
never that its result is honoured, which is the same limit W-4's record states, and W-1's own two-resolution
finding is exactly the error it cannot catch. Four tests added, two of them non-vacuity proofs (the predicate
rejects a synthetic G2 shape; an empty gate list flags all 26 real files, so a silently-empty scan fails).

**W-2 / RL-11 — holds; the writer set did not grow.** Routes touching `user_roles` / `user_access_profiles`
were re-enumerated: still exactly the four writers W-2 guarded, plus two readers. The one new file in that set,
`app/api/admin/access-scope-debug/route.ts`, is a read-only `GET` gated by `loadAdminRouteGate` and scoped to
the caller's own row (`:22-23`) — not a membership writer, so it needs no self-authority guard.

**W-3 / RL-2 — test green, but its recorded reasoning is now false.** This is the substantive finding of the
re-run, and it is why re-executing beat re-asserting.

W-3 removed the `workflows.*` grid row on the grounds that the plan's recommended repoint to `ops.workflows.*`
could not work — those keys lived only in `permission_keys`, and a grant would violate
`role_permission_grants_permissions_fkey`. **Both grounds are now false.** Migration
`20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`, vendored at `555fa056a` *hours
after* W-3 shipped at `41610954c`, seeds `ops.workflows.read`/`ops.workflows.write` into
`permission_definitions` (`:106-113`) and drops that FK (`:134`) in favour of a single
`role_permission_grants_permission_definitions_fkey` (`:137`).

The W-0 re-run flagged this migration's catalog collapse as a follow-up for the W-9 owner and noted it also
undercuts W-3's premise. Confirmed here, and it is sharper than "a premise is stale":

- That migration comes from a **different planning track** (`vertical-slice-v1/access-roles-v2-proposal.md`
  §3.1) which independently implements C5 *and* most of W-9. It is already applied to the deployed target.
- Its header asserts **"The grid now writes `ops.workflows.*`"** (`:16`) and it grants those keys to every
  org's `admin` role (`:116-122`) — to back a grid row that this repo deleted. The two tracks closed the same
  defect by opposite remedies, and neither is aware of the other.
- The exit criterion is nonetheless **met**: no grid row names an unseeded key, and a full-grid save
  round-trips. It is met vacuously, because the row is gone.
- RL-2 does not adjudicate this. It parses `permission_definitions` INSERTs, and `ops.workflows.*` now parses
  as seeded — so the lock passes under *either* remedy and blocks neither.

The `permissionGrid.ts` comment has been corrected in place: the ratified decision (row removed) stands, its
two dead justifications are marked dead, and the surviving reason — **no route enforces `workflows.*`, so the
row grants nothing** — is stated as the one that never depended on the catalog. Whether to now restore and
repoint the row is a product decision, raised rather than absorbed, and recorded in §14.3.10.

**Not re-verified: typecheck.** Both `npm run typecheck` and a direct `tsc -p tsconfig.build.json` were
unavailable behind a command-approval wall in this session, so the 2026-07-31 `rc=0` was **not** reproduced.
The change is confined to one test file using only `node:fs`, `node:path` and vitest, and it executes green —
but that is not a typecheck, and this record does not claim one.

#### Wave 1 under the Mission 2 reopen — **DONE 2026-08-06**, assignment `asg_e9308076173af6`

The reopen re-issued W-1…W-3 a third time. §4's rule holds a third time: **re-execute rather than re-assert.**
This is the first re-execution across a *large* interval, and it is the run in which the locks held and their
**subject enumeration** did not.

| Field | Value |
|---|---|
| Base | `c66d57305` @ `agent/cursor/6-vacilando-v3-4-conversational-director` — **192 web commits** since the 2026-08-04 base `9e19c8736`; API routes 559 → **570**; migrations 302 → **312** |
| Suites on arrival | **55 green**, matching the 2026-08-04 record exactly (36 + 14 + 5). **61** after this assignment's six additions |
| Changed | `web/tests/access/analyticsRouteGates.test.ts` only. **No route handler, library, schema or migration was modified**, so nothing in this record is a behaviour change |
| Evidence | [`wave1-reopen-evidence.json`](./wave1-reopen-evidence.json) |

**W-1 / RL-1 — holds, and the family lock caught its first real arrival.** The analytics families grew 26 → 27:
`metrics/oi-config/route.ts`, added since 2026-08-04. It gates through `getAdminContextCached` on both verbs
(`:88`, `:107`), with `PATCH` additionally requiring `ctx.role === "admin"` (`:111-113`) — verified by hand as
well as by the lock, because the lock alone proves only that a gate is named. **This is the first evidence the
family census does the thing it was added for**; on 2026-08-04 it was asserted against a family that had not
moved.

**Two defects in the lock itself, both found and both fixed here.**

1. **It credited a gate named in a comment.** The 2026-08-04 predicate was `source.includes(gate)` over the raw
   file, so a route whose only mention of `requireAdminOrOps` was a `// TODO:` passed. That is the §10.2
   failure mode — *mention* versus *branch* — reappearing **inside the lock that was added to retire a hand
   census.** Comments are now stripped and the gate must be **called** (`gate(`), not named. Proved by a
   red run: a probe route carrying the G2 shape *and* a `// TODO: gate this with requireAdminOrOps()` comment
   is flagged; the old predicate credited it. The test asserts that fact about the same source rather than
   claiming it in prose.
2. **Its subject was three hand-listed directories, and G2 is not a property of a directory.** G2 is a *shape*
   — resolve an access context that is `ok` for any authenticated org member, then gate on nothing else. An
   analytics-shaped route landing under a fourth directory reopens it unseen; the 2026-08-04 record's own
   limit ("a lock naming six files cannot notice a seventh") applies one level up, to the folder list. The
   lock's subject is now **all of `web/app/api`, selected by the primitive**: **92 of 570** route files
   resolve a raw access context, and every one calls a portal-enforcing gate or the reviewed capability
   predicate `canReadProgramPublication` — this plan's own named reference shape (§5/W-1). Proved by a second
   red run: a new ungated route added anywhere under `app/api` is flagged **by path**.

The family floor was also ratcheted 20 → 27 to follow the live count, per W-4's lesson that a ratchet left
below its floor hands out free slack. **The honest limit is unchanged and still governs:** this proves a
sufficient gate is *called*, never that its result is honoured. W-1's own two-resolution finding remains the
error it cannot catch, and RL-1's tier-A half is still W-14's declared table.

**W-2 / RL-11 — the guard holds; its *subject* was wrong.** This is the finding of the run, and it is why the
rule is re-execute rather than re-assert.

Both prior enumerations asked *which route files name `user_roles` or `user_access_profiles`*. That question
cannot see a membership write performed in a helper, and cannot see an authority table it did not name. Both
misses are in the tree today and **both were already present on 2026-08-04**:

1. **A fifth membership writer.** `POST /api/admin/dev/create-org` upserts `user_roles` through
   `lib/dev/createOrgAndAssignAdmin.ts:71-78`. Its route file names `user_roles` only in a doc comment
   (`:18`), so a route-file text census misses it **by construction**. It takes `admin_user_id` from the
   **request body**, so a caller may name themselves; it is gated on `DEV_TENANT_SPINUP_ENABLED === "true"`
   and `ctx.role === "admin"` (`:22-30`), which bounds the exposure to environments that set the flag. It is
   also a **second instance of G4/W-5** — it writes a membership and no access-profile row, so it can grow
   W-0 Q4, the count §6 requires re-derived immediately before M1.
2. **A sixth authority table.** `user_department_access` is read by `resolveAdminAccessCore.ts:166` to build
   `allowedDepartmentIds` — it *is* the restricted-department allow-list. Two product paths insert into it
   **for the caller**, with a caller-supplied `department_id`: `POST /api/admin/lifecycle-catalog/repair`
   (`repairLifecycleWorkspaceVisibility.ts:64-70` → `ensureLifecycleDepartmentWorkspaceAccess.ts:165`) and
   `POST /api/admin/departments` (`:151-158`, for the department the caller just created). Neither carries
   W-2's guard. W-2's own record counted *"widen your own department/site scope"* as a self-elevation vector
   and guarded it on `PATCH …/access-scope`; this is the same vector on a table the enumeration never named.

**Both are latent today — and W-8 arms the second.** `ensureLifecycleDepartmentWorkspaceAccess` returns before
its insert whenever `portalAdminBypassesDepartmentScope(roleKeys)` holds (`:122-124`), and both routes admit
`admin` only, so no principal who can reach them can currently execute the insert. **W-8 deletes exactly that
bypass.** Its exit criterion — *"department scope is enforced for all roles"* — would be **false on the day it
lands**: a department-restricted principal could restore access to any department carrying a lifecycle process
by calling repair with its id. W-13 arms it from the other side, by admitting a persona that is not
`admin`/`ops`. This is the same shape as W-0 Q1's finding about `handle_new_user()` — *defined, unattached,
one change away from live* — and it is recorded, **not absorbed**: the remedy is W-8's scope, not W-1…W-3's.

**W-2's exit criterion is therefore not met.** It reads *"a principal cannot alter its own membership through
any product path"*, and two further paths exist. The three the workstream named are guarded and re-proved
green; the criterion as written is not satisfied, and this record does not claim it is.

The durable repair is a change of **question**, not of grep: enumerate authority writers **by table across
`web/lib` and `web/app`**, not by name across route files. Run this pass, that set is — `user_roles` /
`user_access_profiles`: the four guarded routes plus `lib/dev/createOrgAndAssignAdmin.ts:71`;
`user_department_access`: `ensureLifecycleDepartmentWorkspaceAccess.ts:165` and
`lifecycleActivationOwned.ts:111` (a delete). RL-11's subject should be that set. **It was not widened here**
— RL-11's lock is `selfAuthorityMutation.test.ts`, outside this assignment's stated scope, and the widened
lock should land with the guard it implies rather than as a silent test edit that goes green by naming
paths nobody fixed.

**W-3 / RL-2 — green, and its dangling decision now has a home.** RL-2 still parses every
`permission_definitions` INSERT across a tree that grew 302 → 312 migrations, and still reports every grid key
as seeded. §14.3.10 left *"restore and repoint the `workflows.*` row, or leave it removed"* open as a product
decision; the plan of record has since bound it — `C13` → **W-11**, *"the row returns iff `W-11` seeds a
workflows key that something enforces"*. Nothing for Wave 1 to do; recorded so the next reader does not
re-raise a question that has been answered elsewhere.

**Where this record is written, and where the plan actually lives.** This assignment's `scope` and
`expectedDeliverables` name **this file**, which is the 2026-07-30 plan of a different mission
(header: `msn_e9133cdade883793d2` · `asg_c505e1d0d76acd`). The live plan of record is
`docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` — Parts I–V, waves 0–14,
`W-0`…`W-62` — and contains none of the reopen's re-sequence. That divergence is already registered as
`X-2` / `DR-4` and, as an execution defect, as `QE-15`. **Wave 1's execution record now exists in two
documents with different contents.** This run deliberately did not copy itself into the other file: which
document is canonical is a Director decision, and a worker resolving it by duplication makes it harder, not
easier.

**Not verified this run.** No live database query — W-0's counts are now **six days old**, and finding 1 above
means Q4 can grow through a path §6 does not name, so M1 must re-derive it rather than cite 2. No tier D, per
§14.3.7 and because the only change is a test file. The typecheck result is recorded in the evidence file
rather than claimed here.

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

#### W-4 execution record — **DONE 2026-07-31**

| Field | Value |
|---|---|
| Check | [`web/scripts/checkServiceClientPrincipal.mjs`](../../../../../web/scripts/checkServiceClientPrincipal.mjs) — AST walk over TypeScript's own parser |
| Register | [`web/scripts/serviceClientPrincipal.allowlist.json`](../../../../../web/scripts/serviceClientPrincipal.allowlist.json) — three lists, each entry reasoned |
| Lock | `web/tests/access/serviceClientPrincipalCheck.test.ts` — **15 tests, all green** (RL-15, §13) |
| CI | `web/package.json` → `prebuild` runs `check:service-client-principal`; the check exits 1 on any violation or stale entry, so `next build` cannot proceed past it |
| Evidence | [`w4-service-client-principal-baseline.json`](./w4-service-client-principal-baseline.json) — full counts, per-route rows omitted; regenerate with `npm run check:service-client-principal:evidence` |

##### The baseline

| Measure | 2026-07-31 | 2026-08-04 |
|---|---|---|
| API route files | **539** | **559** |
| …hold a service-role client by direct import | **520** | **537** |
| …of those, resolve a principal | **494** | **520** |
| …of those, resolve none — **the exception baseline** | **26** | **17** |
| — reviewed exceptions, each with a named authorization model | **21** | **17** |
| — frozen W-15 remediation baseline, no model | **5** | **0** |
| Reach a service client transitively (through a helper) | 536 | 556 |
| …transitive-only *and* unresolved — advisory, not enforced | **3** | **3** |

**The 2026-08-04 column is the live one.** The prose below was written against the 2026-07-31 column and is
preserved as the reasoning of record; where it says 26, 21 or 5, the current figures are 17, 17 and 0. The
entire delta is the retirement of the `book-v2` funnel — see the re-verification record at the end of this
workstream, which reconciles it route by route.

**The number is 26, not "large".** The exit criterion above predicted a large baseline; it is 26 of 520, and
**only 5 of those are actual remediation work.** The prediction was wrong for a specific and checkable
reason: the phase-1 figure it rested on ("517 of 539 route files hold a service-role client") counted
*holding a client*, which is nearly universal in this codebase, and silently implied that holding one means
gating nothing. In fact 494 of the 520 holders do resolve a principal — through wrappers four binding hops
deep, which is exactly what a file-level or text-level census cannot see. Recount: **520** hold one directly,
not 517.

##### Why this is not the census C1 destroyed

§10.2 forbids citing a grep count, and this check is built to survive that rule rather than route around it:

1. **AST, not text.** Every edge is a real TypeScript binding, parsed by the compiler's parser. No regex
   decides anything about authority. `auditAuthorityPaths.mjs` credited 440 routes to a module that only
   *returns* the permission bundle, because `/permissionKeys\b/` cannot tell mention from branch.
2. **Binding-level, not file-level.** A route is credited only through symbols it actually imports, and only
   if *that symbol's own declaration* reaches the terminal primitive. Importing one function from a module
   that also happens to export a resolver credits nothing. This is the specific over-credit that produced
   the 30× error.
3. **One terminal primitive, structurally defined.** The base case is `…auth.getUser()` / `.getClaims()` /
   `.getSession()` — the only way this codebase turns a request into a principal
   (`lib/admin/cachedAuthSession.ts:17-48`). Wrappers (`getAdminContextCached`, `loadAdminRouteGate`,
   W-1's own `requireAnalyticsReadAccess`) are **discovered by the walk, never hand-listed**, so the check
   does not rot as wrappers are added or renamed. The lock asserts this directly.
4. **Proven non-vacuous.** The lock runs the check against an *empty* allow-list and asserts it goes red on
   exactly 26 + 3 routes, asserts a gated route is credited through a four-hop wrapper, asserts an
   unauthenticated public route is *not* credited, and asserts a stale entry fails. A check that cannot be
   shown to fail is not evidence.

One structural bug was found and fixed while building it: a **bare re-export route**
(`export { GET } from "…"`, e.g. `admin/v2/view-models/drawer/person/[id]/route.ts`) carries no identifier
reference in its module body, so the subtree walk missed it entirely and three correctly-gated admin routes
read as ungated. The export table and star-re-export edges are now walked as well. That is a false *positive*
this check would have produced — the same class of error as W-1's, found before it was published rather than
after.

##### The honest limit — read this before citing the number

**This check proves a principal is *resolved*. It does not prove the result *gates* the handler.** W-1 found
routes holding two access resolutions where only the first gated anything; a resolution whose result is
discarded passes here. Proving the gate is W-14's declared capability table and W-15's sweep. Two further
bounds, stated so the number is not over-read:

- **The enforced subject is direct holding only.** Routes that reach a service client transitively are
  *advisory*, because the transitive import graph over-credits in exactly the way §10.2 describes — 536 of
  539 routes reach one. The 3 transitive-only unresolved routes are recorded in
  `advisory_transitive_only` with reasons so the set cannot grow silently, but they do not fail the build.
  Two are Twilio webhooks whose signature check lives in the helper; one is a legacy public intake route.
- **`SUPABASE_SERVICE_ROLE_KEY` as a text marker** is the one non-AST predicate, used to catch a client
  constructed inline rather than imported. It can only *widen* the subject set, never narrow it, so it
  cannot cause a route to be missed.

##### What the 5 baseline routes actually are

> **Closed 2026-08-04 by deletion, not by remediation.** All five routes below were removed from the tree
> with the GoHighLevel / legacy-cleaning retirement (`ea3eaf377`, PR #294, reaching this branch via the
> staging merge `5118940f7`). The frozen baseline is now empty and **W-15 inherits no work from it.** The
> finding is kept in full because the exposure was real while it shipped, and because the *shape* — a public
> funnel that accepts a caller-supplied row id and acts on it with a service-role client — is the pattern
> W-15 must recognise if it reappears. The `lib/book-v2/**` helpers survive the retirement; no route reaches
> them without a principal.

The frozen baseline is not a residue of unclassified routes — it is a **named finding**. All five are
`book-v2` public-funnel routes that accept a caller-supplied row id (`opportunity_id`, `customer_id`,
`person_id`) from the request body and then read or write **that row** with a service-role client, with no
token, no principal, and no binding of the id to anything the caller has proven:

| Route | The unguarded operation |
|---|---|
| `book-v2/confirm` | reads and updates the named opportunity, customer and person (`:787`, `:818`, `:855`) |
| `book-v2/quote-refine` | updates the named opportunity and its typed field values (`:334`, `:380`) |
| `book-v2/service-details` | reads and updates the named opportunity (`:84`, `:191`) |
| `book-v2/opportunity-discount` | writes discount fields to the named opportunity (`:84`, `:142`) |
| `book-v2/ensure-customer` | materializes a customer for an arbitrary supplied `person_id` (`:32`) |

The id is unguessable, which is **obscurity, not authorization**. The org is env-pinned in several of them;
the *subject* is not. The remedy in all five is the same and is already the shape this codebase uses
elsewhere — a bearer capability for the in-progress quote, i.e. the `action_links` model that the 21
exceptions rest on — or re-deriving the ids server-side. **This is W-15 work by the assignment's scope, and
it is recorded here rather than fixed.** It is called out because it is a larger live exposure than anything
wave 1 closed, and a reader skimming "26 exceptions" would not see it.

The other 21 are exceptions on stated grounds, in four models: **capability-token** (12 — the row is selected
*by* the bearer token, per I-4; two of them additionally bind a caller-supplied `submissionId` to the
embed before use), **webhook-signature** (1 — Svix `verify` returns 400 *before* `createAdminClient()` is
constructed), **public-catalog-read** (5 — no org-scoped or personal data, org pinned to
`ALLOY_PUBLIC_ORG_ID` where one is needed), and **public-intake-create** (3 — create-only, no caller-supplied
id selects a pre-existing row). Two were re-verified line-by-line for this record
(`api/verticals/route.ts`, `api/webhooks/resend/route.ts:69,91`); the rest carry their citation in the
register.

##### The ratchet

Three lists, three meanings, and **all three may only shrink**:

- `exceptions` — a verified orthogonal authorization model. Adding one is a security decision: the entry
  must name the model and cite the enforcing line, and the lock requires both.
- `baseline` — **frozen 2026-07-31**. The lock pins its contents to the five routes above, so it can be
  emptied by fixing them and cannot be extended by adding a sixth. **Emptied 2026-08-04** when those five
  were retired; the pin is now the empty set, so no baseline entry can ever be added.
- `advisory_transitive_only` — must match the computed set exactly, in both directions.

The `exceptions` list is the one that is **not** frozen — by design, since a new route with a genuine
authorization model must be addable. What bounds it is a numeric ceiling on the unresolved count, and that
ceiling must be re-tightened whenever the floor drops, or a shrink hands out free exceptions. It was
**26 → 17 on 2026-08-04**; see the re-verification record below.

A **stale** entry is itself a failure — if a route is deleted, stops holding a service client, or starts
resolving a principal, the check goes red until the list is updated. That is what stops the register
decaying into residue, which is the failure mode the exit criterion names.

#### W-4 re-verification under Mission 2 — **DONE 2026-08-04**, assignment `asg_91e144a61569e4`

Mission 2 re-issued W-4 against a record already executed and green. §4's rule applies: **re-execute rather
than re-assert**. This is the fourth leg of the Wave 1 re-verification recorded under §5's W-3 heading
(assignment `asg_e9308076173af6` covered W-1…W-3 and scoped W-4 out).

| Field | Value |
|---|---|
| Base | `9e19c8736`, after this worktree merged `origin/staging` (`5118940f7`); API routes 539 → **559** |
| Branch | `hotfix/vacilando-ui-freshness-flash` — same anomaly the W-1…W-3 leg recorded; all W-4 artifacts are present on it |
| Lock | `web/tests/access/serviceClientPrincipalCheck.test.ts` — **15 tests green**, matching the 2026-07-31 record exactly |
| Wave 1 total | **70 tests green** across all four Wave 1 suites (15 + 36 + 14 + 5) |
| Evidence | [`w4-reverification-evidence.json`](./w4-reverification-evidence.json); snapshot [`w4-service-client-principal-baseline.json`](./w4-service-client-principal-baseline.json) regenerated and **byte-identical** to the committed copy |

**The check holds: `ok: true`, zero violations, zero stale entries, across a 20-route expansion.** This is the
first evidence that the workstream does the thing it was built to do. 20 new route files arrived with the
staging merge, 17 of them holding a service-role client directly, and **every one resolves a principal** — the
unresolved count did not rise. The exit criterion's promise was that the number stops growing silently; it was
untested until the surface actually grew.

**The −9 delta is entirely `book-v2`, and it reconciles exactly.** The baseline fell 26 → 17 between the two
runs, which is the kind of movement that should be assumed suspicious until it is accounted for route by route:

| Removed | Count | List it was on |
|---|---|---|
| `confirm`, `quote-refine`, `service-details`, `opportunity-discount`, `ensure-customer` | 5 | frozen `baseline` |
| `availability`, `validate-promo` | 2 | `exceptions` (public-catalog-read) |
| `quote-start`, `specialty-quote-start` | 2 | `exceptions` (public-intake-create) |

9 routes, all `book-v2`, all deleted by `ea3eaf377` (retire GoHighLevel and the legacy cleaning product).
21 − 4 = 17 exceptions and 26 − 9 = 17 unresolved, which is what the check reports. **No route was quietly
moved off a list, and no unresolved route was reclassified as an exception.** The intermediate commit
`2ec3d322d` that emptied the lists is a *consequence* of the deletion — the shrink-only rule made the stale
entries fail Vercel's prebuild, which is the register working as designed rather than being worked around.

**One defect found and fixed: the ratchet had gone slack.** The lock capped `subject_unresolved` at the
2026-07-31 figure of 26 while the live floor had fallen to 17. Because `exceptions` is deliberately *not*
frozen — only `baseline` is — that ceiling was the only thing bounding exception growth, so **9 new
service-role routes with no principal could have been added and the build would have stayed green.** A
retirement had silently bought the codebase nine free exceptions. The ceiling is now 17, equal to the floor,
so any addition goes red. This is the ratchet's whole purpose and it had quietly stopped applying: *a ratchet
is only a ratchet if it follows the floor down.*

**The register was re-reviewed, not re-asserted.** All 17 entries still exist, still hold a service client and
still resolve no principal — the lock asserts each directly, so a route that got fixed or deleted cannot sit
there unnoticed. Two citations were re-checked line-by-line this run, chosen as the register's strongest
claim: the subject-binding pair `public/forms/[token]/submissions/[submissionId]` (`:58`, `:144`) and
`…/submit` (`:114`) still call `verifySubmissionBelongsToPublicEmbed` before the read/update, and
`public/tour-booking/[token]/book` still resolves its link by token at `:30`. The four authorization models
now stand at capability-token **12**, webhook-signature **1**, public-catalog-read **3**,
public-intake-create **1**.

**The honest limit above is unchanged and still governs**: this check proves a principal is *resolved*, never
that the result *gates* the handler. Nothing in this re-run narrows it. W-14 and W-15 still own that proof.

**Not re-verified: typecheck, and the check's own CLI.** `node`, `npx node` and `npm run` were each blocked
behind a command-approval wall in this session, so `npm run check:service-client-principal` was not executed
as a command and the prior record's `prebuild` `rc=0` was **not** reproduced. The check was instead run
through `runServiceClientPrincipalCheck()` — the exported function the CLI is a thin wrapper over
(`checkServiceClientPrincipal.mjs`, CLI block) — via vitest, which is what the lock itself does. The evidence
snapshot regenerated through that path is byte-identical to the committed one, so the check's *result* is
verified at this base; its *CI wiring* is carried forward on the 2026-07-31 record and is not re-proven here.

#### W-4 re-execution under the reopen — **DONE 2026-08-06**, assignment `asg_91e144a61569e4`

Third leg. §4's rule applied again: **re-execute rather than re-assert** — and this time re-execution was not
a formality, because **the lock was RED at this base.**

| Field | Value |
|---|---|
| Base | `a3e01ddb5` on `agent/cursor/6-vacilando-v3-4-conversational-director` — the reopen's Wave 1 branch, not the `hotfix/…` branch the first two legs ran on. API routes 559 → **570** |
| Lock | `web/tests/access/serviceClientPrincipalCheck.test.ts` — **15 tests, 1 FAILING on arrival**; **18 green** after the fix |
| Wave 1 total | **84 tests green** across all four suites (18 + 42 + 14 + 10) |
| CLI | `npm run check:service-client-principal` executed as a command this run — the approval wall the 2026-08-04 record noted did not recur. Green, and **shown red**, both at the CLI |
| Typecheck | `vac run typecheck:tests` → **rc=0** |
| Evidence | [`w4-reopen-evidence.json`](./w4-reopen-evidence.json); snapshot [`w4-service-client-principal-baseline.json`](./w4-service-client-principal-baseline.json) regenerated |

##### The baseline, third column

| Measure | 2026-07-31 | 2026-08-04 | 2026-08-06 |
|---|---|---|---|
| API route files | 539 | 559 | **570** |
| …hold a service-role client by direct import | 520 | 537 | **541** |
| …of those, resolve a principal | 494 | 520 | **526** |
| …of those, resolve none — **the exception baseline** | 26 | 17 | **15** |
| — reviewed exceptions, each with a named authorization model | 21 | 17 | **15** |
| — frozen W-15 remediation baseline, no model | 5 | 0 | **0** |
| Reach a service client transitively | 536 | 556 | **567** |
| …transitive-only *and* unresolved — advisory | 3 | 3 | **10** |

**The lock was red, and the reason is the workstream's own failure mode.** The advisory ratchet capped the
transitive-only set at 3; ten routes qualified. The set had grown on 2026-08-03 in `e7e585010`
(*"record scoped public tour routes against the W-4 service-client gate"*) and again on 2026-08-04 in
`9187ae81a`, and **neither commit moved the ceiling.** `e7e585010` touched exactly one file — the allow-list.

The mechanism that let it through is worth stating precisely, because the 2026-08-04 record diagnosed the
same defect class and fixed only that instance:

1. The **check** enforces set membership exactly, in both directions. A route that appears without an entry is
   a violation; an entry with no route is stale. That stops a list growing *without an edit*.
2. It does **not** stop the edit. The only thing bounding a deliberate addition was a numeric ceiling — and
   the ceilings lived **solely in the vitest lock**, never in `prebuild`.
3. So an allow-list-only commit could add entries with `next build` staying green, and the breach stayed
   latent until someone ran the lock on a base containing both lines of work. That base is this one, eleven
   commits and three days later.

**Fixed at the root, not at the instance.** The ceilings now live in the register under `ratchet` and the
**check** enforces them, so a breach stops `prebuild`. Both directions are enforced, which is the 2026-08-04
lesson made mechanical rather than remembered:

- **over** the ceiling → a `ratchet-exceeded` **violation** — the bounded count grew;
- **under** the ceiling → a `ratchet-slack` **stale** entry — the floor dropped and nobody followed it, which
  is precisely the state that silently handed out nine free exceptions between 08-01 and 08-04;
- **absent** → a `ratchet-missing` violation, so the bound cannot be deleted to make the build pass.

The lock now asserts `ceiling === live floor` rather than `floor ≤ ceiling`. Under the old assertion the
2026-08-04 slack was *green*; under the new one it is red the moment it appears.

**Shown red, per §10.4.** Not only in-process: the ceilings were temporarily set to 24/3, `npm run
check:service-client-principal` was run as a command, and it printed one `ratchet-exceeded` breach and one
`ratchet-slack` entry (*"ceiling is 24 but the live floor is 15 — re-tighten it to 15, or it hands out 9 free
exception(s)"*) and exited non-zero. The true ceilings were then restored. Three further red states are
locked as tests: breach, slack, and missing.

##### The −2 exception delta, and a route class leaving the enforced set

The unresolved count fell 17 → 15. It reconciles exactly, and **it is not a fix**:

| Route | Was | Now | Why |
|---|---|---|---|
| `public/tour-booking/[token]/resolve` | `exceptions` | `advisory_transitive_only` | Stopped importing a service client; `guardTourActionRoute` holds it |
| `public/tour-booking/[token]/slots` | `exceptions` | `advisory_transitive_only` | Same |

Plus five genuinely new routes on the advisory list — `decline`, `confirm`, `reschedule`, `cancel`,
`cancel-intent`. 2 moved + 5 new + 3 original = 10.

**This is a coverage escape, and it should be recorded as one.** W-4's enforced predicate is *direct import*.
When Slice C moved the service client into `guardTourActionRoute`
(`web/lib/tours/public/tourActionRouteGuard.ts:76`), two routes left the enforced set without any change in
their authority, and landed on the advisory list — which is *weaker*, being bounded only by a count. The
substance here is fine and arguably better: the guard returns the client only after `authorizeTourAction`
proves token hash, link↔invitation recipient binding, and action kind (`:89`), and `requiredActions` is a
module constant in all seven routes, never request-derived — verified this run. But the general shape holds:
**a helper refactor is an exit from W-4's enforced predicate.** It cannot be closed inside W-4 without
rebuilding the predicate on reachability rather than import, which would change what the number means. It is
handed to **W-15** as a named property to preserve, not left implicit.

##### The register was re-reviewed, and four entries were wrong

All 15 exceptions still exist, still hold a service client, still resolve no principal — asserted per-entry by
the lock. The advisory entries were then checked against the tree line by line, which the lock cannot do,
since a reason is prose. **Four of the ten were inaccurate:**

- three drifted line citations — `slots` `:20`→`:26`, `reschedule` `:21`→`:24`, `resolve` `:16`→`:27-35`;
- one **substantive**: `resolve`'s reason claimed the route constant was `[view_tour_slots,
  view_tour_details]` *"so a decline- or cancel-only token cannot read context."* The constant now lists **all
  seven** action kinds, including `decline_tour` and `cancel_tour`
  (`web/app/api/public/tour-booking/[token]/resolve/route.ts:27-35`). **The stated security property was
  false.**

The widening itself is deliberate and argued in the route header (`:18-25`) — any credential on the same
invitation may re-read what that invitation already disclosed to that same recipient, and the authorizer still
proves recipient binding, expiry and revocation. So the *code* is defensible; the *register* had silently
stopped describing it. All four were corrected in place, marked `CORRECTED 2026-08-06` rather than rewritten
to look as though they had always been right.

**This is a limit of the check, newly evidenced.** The check enforces membership and now counts; **nothing
binds a reason to the line it cites.** A reviewed exception can decay into an inaccurate one with the build
green throughout — which is the exit criterion's *"reviewed artifact rather than a residue"* eroding by a
route the ratchet does not cover. Periodic human re-reading is currently the only control, and this run is the
evidence that it finds things.

**The honest limit above is unchanged and still governs**: this check proves a principal is *resolved*, never
that the result *gates* the handler. W-14 and W-15 still own that proof.

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

#### W-5 execution record — 2026-08-07

**The audit ran first, and by table.** Asking *which route files name `user_roles`* is the question that missed
`createOrgAndAssignAdmin` twice (§5). This pass enumerated `.insert` / `.upsert` / `.update` against
`user_roles` across `web/app` **and** `web/lib`. The membership-**writing** set is three, not one:

| Writer | Was | Now |
|---|---|---|
| `app/api/admin/users/route.ts:102` — invite | `user_roles` insert, no profile | `create_membership_with_access_profile` |
| `app/api/admin/users/[userId]/role/route.ts:44-47` — role change | **delete-then-insert, two statements** | `replace_membership_with_access_profile` |
| `lib/dev/createOrgAndAssignAdmin.ts:71` — dev org spinup | `user_roles` upsert, no profile | `create_membership_with_access_profile` |

Two writers that the earlier enumeration listed are **not** membership creators and were left alone:
`users/[userId]/remove` deletes only, and `users/[userId]/access-scope` writes the profile side.
`lib/admin/userRolesMembership.ts` is read-only helpers despite its name — it writes nothing.

**A second defect was found in the role route, and fixed with the same change.** `PATCH …/role` deleted every
membership row for the pair and then inserted the replacement as a *separate statement*. A failure between them
left the principal with **no membership at all** — not a fail-open, a lockout, and one no test covered. Both
statements are now inside `replace_membership_with_access_profile`. This is recorded rather than absorbed: it
is a W-5-adjacent find, not something W-5 predicted.

**Migration.** `supabase/migrations/20260807090000_membership_profile_atomic_create.sql` (M2). Two
`SECURITY INVOKER` functions — every caller already holds `service_role`, so `SECURITY DEFINER` would add an
escalation surface for no benefit. `EXECUTE` is revoked from `PUBLIC` before being granted, because Postgres
grants `EXECUTE` on new functions to `PUBLIC` by default and revoking from `anon` alone is a no-op. Profiles
are created at **both dimensions `all`** — identical to the W-6 backfill and to what the resolver infers today
when the row is absent, so **no principal's effective access changes**. Function only; no data effect.

**QA.**
- Tier B — `web/tests/access/membershipAtomicWiring.test.ts`, **14 tests, green**. Half of it is a source-level
  lock: no product membership writer may call `.insert`/`.upsert`/`.update` on `user_roles`. That is the half
  that catches a *sixth* writer added later, which a behavioural test cannot. The regex was verified live — it
  still matches three files (two seed scripts and a cert fixture), so it is not passing vacuously.
- Tier C — `web/tests/access/membershipProfileInvariant.integration.test.ts`, 6 tests, `describe.skipIf(!hasEnv)`,
  **skipped cleanly with no env; not yet executed against a live tenant** (see below).
- `vac run typecheck` rc=0 · `vac run typecheck:tests` rc=0.

**Not verified this run — the honest limit of this record.** The tier C test has **never been run green**;
it needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `MEMBERSHIP_INVARIANT_INTEGRATION_ORG_ID`, and it
creates and deletes real `auth.users` rows in a tenant every managed worktree shares. Running it was not
authorized by this assignment. **Until it runs, RL-4's tier C half is authored, not proven**, and the exit
criterion below is argued from the transaction boundary rather than demonstrated. No live database query was
made, so Q4's count is not re-derived here — it remains M1's job to re-derive rather than cite.

**One writer outside the product path is left uncovered, deliberately.**
`tests/processing/cert/processingIdentityCertFixtures.ts:115` upserts `user_roles` with no profile row, so it
can grow Q4 **in a certification tenant**. It is a fixture, not a product path, and W-5's mandate is product
paths; fixing it inside this assignment would be a silent widening. Recorded for W-6's preflight, which must
not be surprised by a cert-tenant count it cannot explain. The two seed scripts do write profiles of their own
(`seedAccessValidationDemo.ts:550`, `seedRealisticChildcareDemoData.ts:2257`) and do not grow Q4.

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
immediately before M1 rather than citing 2; the number is a snapshot, last taken 2026-08-04.

**The 2026-08-04 re-run returned 2 again — and that is not reassurance.** `q4_membership_rows` also held at 8,
so no membership was created in the interval; the count was stable because the tenant was idle, not because
the fail-open path was fixed. M1 still sizes itself from a fresh census, never from this line.

**M1 is authored, not applied — `20260807140000_backfill_membership_access_profiles.sql` (2026-08-07).**
The insert is `SELECT DISTINCT ur.user_id, ur.org_id, 'all', 'all' FROM user_roles … ON CONFLICT (user_id,
org_id) DO NOTHING` — additive, idempotent, never `DO UPDATE`. Around it, a `DO` block measures the pre-state,
snapshots **every** pre-existing profile row into a temp table, and after the insert enforces four
post-conditions in-transaction: created count == the anti-join measured microseconds earlier · zero pairs left
uncovered · zero pre-existing rows differing under an `EXCEPT` comparison · table total grew by exactly the
created count with the orphan population unmoved. Any failure `RAISE`s and the migration transaction rolls
back, so **a wrong-sized apply aborts instead of landing**. "No existing profile row modified" is therefore
evidenced by comparison, not argued from `ON CONFLICT` semantics.

The in-transaction sizing check is a *backstop*, not the preflight. §11 still requires the live Q4 re-run
before the operator is asked to authorize anything; the migration only guarantees that a stale number cannot
silently size a wrong apply.

**Preflight is EXECUTED — 2026-08-07T17:24:15Z.** It rode run 3 of the W-0 census artifact, exactly as
designed: run 3's query already computes `q4_pairs_without_profile`, `q4_membership_rows`,
`q4_distinct_user_org_pairs` and `q4_profiles_without_membership`, so binding W-6's preflight to it meant **one
operator authorization discharged both obligations** rather than paying twice for a subset query.

**The numbers, re-derived and not cited:** **2** pairs without a profile, of **6** distinct pairs across **8**
membership rows, with **0** orphan profiles. M1 is sized at **2**. That coincides with the 2026-08-04 figure,
and the coincidence is precisely why the rule forbids citing — a cited 2 and a re-derived 2 look identical in
the record and prove entirely different things. RULES 1, 2 and 5 pass; both abort conditions are clear; RULE 4's
precondition is clean; RULES 3 and 4's post-apply halves are unreachable until the apply. Evidence:
[`w6-m1-preflight.json`](w6-m1-preflight.json).

**How it unblocked is the reusable lesson — and it was not worker effort.** Two dispatches diagnosed the
blocker correctly and could not move it: the census channel is the Director-side trusted host action
`database.read_census`, and **no worker-side channel to it exists by design**. It cleared when the operator
authorized run 3 and the Director executed it host-side. For the eight remaining §11 preflights this means the
gating resource is *the authorization*, not worker availability — dispatching a worker at a preflight-blocked
workstream cannot move it, while **binding that workstream's preflight to a census already queued makes one
authorization do two jobs**, which is what W-6 did and what saved a second round trip here.

**Gate position — moved.** Per [`MIGRATION-APPLY-GATE.md`](../../MIGRATION-APPLY-GATE.md), M1 was
`awaiting_authorization` with `preflight` **absent** — unexecuted rather than `ok: false` — which that
document's table scores **`unmet`**. It is now `awaiting_authorization` with **`preflight.ok: true`** and an
`evidence_path`, which is that table's condition for **`operator_review`** on a shared target. `ok` is scoped
to the **pre-apply** rules and says so explicitly: RULES 3 and 4's post-apply halves sit on the far side of the
authorization in the gate's own sequence (preflight → authorize → apply → `applied`), so withholding `ok` for
them would make the gate unsatisfiable by construction — the worker would have to prove a post-apply fact to
earn permission to apply.

**What has not changed.** `preflight.ok: true` does **not** auto-apply and does **not** complete W-6. The
migration's status is still `awaiting_authorization`, never `applied`; the exit criterion (post-apply anti-join
= 0) is still unmet; the acceptance gate is still `needs_operator`. Per the gate's hard rule, **Accept must not
run and must not advance the objective spine** — that exact bug shipped once on Access & Roles Phase 0.

**W-6 was dispatched twice, and the second dispatch authored nothing.** Assignment `asg_5b1ea3f9a620c6` arrived
a second time on 2026-08-07 at the same `contentHash` `3c36b58117e46b2363ef602b385409e7`, same objective, same
scope, against the same base commit `7dc06920a` that its own first dispatch produced. The migration and this
section were verified intact and left byte-unchanged; regenerating identical content would only reset the
record's dates. The one real delta it closed was four uncommitted keys in `wave0-authority-census.json`
(the `insertion_anchor` encoding trap authored by `asg_86eb0e4a95142e`), which were committed rather than left
at risk in a dirty tree. **A re-dispatch cannot move W-6** — the blocker is a channel a worker does not have,
not effort — so the loop is recorded here in `w6_m1_preflight.redispatch_2026_08_07` to stop the next dispatch
paying for the same discovery.

**The third dispatch broke the loop, because the world had changed rather than the effort.** The same
assignment arrived again on 2026-08-07 at the same `contentHash` — but census run 3 had executed in the
interim, so for the first time the preflight's input existed. That dispatch evaluated the live numbers against
the pass rules, wrote the evidence file, set `preflight.ok` and moved the gate. It again found real prior work
**uncommitted in a dirty tree** — this time the Director's own merge-back of run 3's results — and committed it
unmodified before authoring anything. **That is two consecutive dispatches finding unpushed work at risk**,
which is worth fixing at the dispatch level rather than rediscovering a third time. A separate hazard surfaced
alongside it: `asg_86eb0e4a95142e` was editing the same JSON artifact concurrently and committed mid-edit. The
two assignments happened to touch different keys, so it was survivable — but concurrent writers on one
artifact is a live collision risk in this worktree, not a hypothetical one.

**The migration has never been parsed by a PostgreSQL.** No local stack was running on either dispatch, and the
shared local stack is not the shared target §11 means, so applying there would prove little while mutating a
resource other slots share. A syntax error in the `DO` block would therefore surface *after* the operator
authorizes the apply. The four in-transaction post-conditions keep that failure safe — the migration
transaction rolls back — but it would cost the authorization round trip. Recorded as residual risk, not
discharged.

**QA.** Tier A: post-apply anti-join returns zero. Evidence file per §11 —
`w6-m1-preflight.json`, carrying the preflight census output and the migration's post-apply `NOTICE` block
verbatim (membership rows, distinct pairs, pairs-without-profile before/after, rows created, profile totals,
orphans before/after, pre-existing rows mutated).
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

**W-4's check is the counter-example, and it is worth stating why it qualifies where the census does not.**
It is an AST walk over real TypeScript bindings, credited symbol by symbol rather than file by file, with one
structurally-defined terminal primitive — and its lock runs it against an empty allow-list to prove it goes
red. An import-walk is disqualified by *how it credits*, not by being static. See the W-4 execution record
in §5, including its stated limit: it proves a principal is resolved, never that the result gates the handler.

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
| M1 | W-6 | Backfill access profiles for memberships lacking one — **authored 2026-08-07**, `20260807140000_backfill_membership_access_profiles.sql` (**not applied**) | shared | **PREFLIGHT EXECUTED 2026-08-07** on census run 3 → `preflight.ok: true`, evidence [`w6-m1-preflight.json`](w6-m1-preflight.json) → **`operator_review`** (was `unmet`). Row count re-derived at **2** on the `pairs_without_profile` grain — not the 8 membership rows, not the 6 distinct pairs; **0 orphan profiles**. Post-apply rules (zero pairs uncovered, no existing profile modified) **pending the apply**; `status` stays `awaiting_authorization` until then |
| M2 | W-5 | Atomic membership+profile RPC — **authored 2026-08-07**, `20260807090000_membership_profile_atomic_create.sql` (**not applied**) | shared | Function only; no data effect. `EXECUTE` revoked from `PUBLIC` before grant; `SECURITY INVOKER` |
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
immediately before the authorization ask — W-0's counts are a snapshot (last refreshed 2026-08-04), not a
standing warrant. The trusted host action (`database.read_census`) is the channel for those preflights; none
of them needs an operator to handle a credential, and it has now been exercised twice.

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

| Lock | Asserts | Tier | From | Status |
|---|---|---|---|---|
| **RL-1** | No route gates on `access.ok` alone | A + B | G2 / W-1 | **LIVE** — `web/tests/access/analyticsRouteGates.test.ts` (tier B; the tier A half lands with W-14). **Widened 2026-08-06**: subject is now every route under `web/app/api` that resolves a raw access context (92 of 570), not three hand-listed directories, and a gate named only in a comment no longer credits |
| **RL-2** | Every grid key exists in the catalog *(superseded by RL-3)* | B | C5 / W-3 | **LIVE** — `web/tests/admin/permissionGrid.test.ts` |
| **RL-3** | The grid is generated; no literal key list in UI source | A | I-14 / W-10 | proposed |
| **RL-4** | Membership creation writes a profile row atomically | **A + B + C** | G4 / W-5 | **LIVE (tier A+B), TIER C AUTHORED-NOT-RUN** — `web/tests/access/membershipAtomicWiring.test.ts` (14 green): a source-level lock that no product membership writer calls `.insert`/`.upsert`/`.update` on `user_roles`, plus outcome-mapping tests. Tier C is `web/tests/access/membershipProfileInvariant.integration.test.ts` — **6 tests, never executed**; needs a live tenant this assignment was not authorized to write. Do not read this row as "atomicity is proven" until it runs |
| **RL-5** | Absent profile denies; never `all` | C | I-19 / W-7 | proposed |
| **RL-6** | No role literal appears in `accessScope.ts` | A | C8 / W-8 | proposed |
| **RL-7** | Exactly one FK on `role_permission_grants.permission_key` | A | C3 / W-9 | proposed |
| **RL-8** | No `SELECT` over the catalog in a grant seed | A | G5 / W-12 | proposed |
| **RL-9** | No hard-coded portal role set (`PORTAL_ROLES`, `ALLOWED_ROLES`) | A | C6 / W-13 | proposed |
| **RL-10** | Every route file appears in the declared capability table | A | C1 / W-14 | proposed |
| **RL-11** | A principal cannot modify its own authority | B + C | G3 / W-2 | **LIVE (tier B), SUBJECT INCOMPLETE** — `web/tests/access/selfAuthorityMutation.test.ts` covers the three routes W-2 guarded. **2026-08-06:** two further self-authority paths exist that its enumeration could not see (a helper-mediated `user_roles` writer, and `user_department_access` — a sixth authority table). Both latent; **W-8 arms one.** See §5 |
| **RL-12** | No authority path reads `user_profiles.role` or `app_users.role` | A | §2.1 / W-20 | proposed |
| **RL-13** | Preview and runtime resolve identically across the fixture matrix | C | C11 / W-21 | proposed |
| **RL-14** | No `sort()` over `org_id` on an authority path | A | I-7 / W-22 | proposed |
| **RL-15** | No route holds a service-role client without resolving a principal or a reviewed exception; the exception lists only shrink | A | G6 / W-4 | **LIVE** — `web/scripts/checkServiceClientPrincipal.mjs` in `prebuild`, locked by `web/tests/access/serviceClientPrincipalCheck.test.ts`. Re-verified 2026-08-04: green across a 20-route expansion; ceiling ratcheted 26 → 17. **Re-executed 2026-08-06: found RED** — the advisory ratchet had been breached 3 → 10 by an allow-list-only commit that `prebuild` could not see. Ceilings moved into the register and enforced by the check, over *and* under; unresolved re-tightened 17 → 15; **18 tests** |

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
   source file modified. **Superseded three times on 2026-07-31:** W-0 has since been executed read-only
   against the deployed database via a trusted host action, so §4 now carries live counts; W-1…W-3 have
   since been implemented, so §5 records shipped code and green tests; and W-4 has since shipped a
   build-time check whose counts are *measured* rather than estimated. Everything else in this plan remains
   static analysis.
2. **Sizings are estimates**, calibrated to 539 routes and 289 migrations, not measured. W-15 (L) has the
   widest error bar; ~~W-4's exception baseline will sharpen it~~ — **W-4 has now measured one axis of it.**
   Of 520 routes holding a service-role client, 494 already resolve a principal and 5 have no authorization
   model at all, so the *service-client* half of W-15 is 5 routes, not ~500. This does **not** resize W-15
   overall: its main body is bringing ~500 routes from "gates on portal eligibility" to a declared
   capability, which W-4 does not measure and cannot — W-4 proves resolution, never gating.
3. ~~**Wave 0 is a plan for queries, not their results.**~~ **RESOLVED 2026-07-31, re-confirmed 2026-08-04.**
   Wave 0 executed; its counts are in §4 and have been applied. The reordering it produced: W-20 stays in
   wave 5 (G1 latent), M8 is struck, and L2/L3/L4 have empty remediation sets. Waves 2 and 5 are no longer
   gated by W-0. A second independent run four days later returned every count unchanged, so the findings are
   twice-measured. The counts remain a snapshot — each lockout-class switch and each §11 preflight must re-run
   the census rather than cite it, and the zero-drift result does **not** relax that, because the interval
   contained no membership activity.
4. **Membership writers beyond `POST /api/admin/users` were not enumerated.** W-5 carries that audit as its
   first step; if other writers exist, W-5 grows. **Partially answered by W-2 on 2026-07-31:** the routes
   under `web/app/api` that write `user_roles` or `user_access_profiles` are `users/route.ts` (create),
   `users/[userId]/role`, `users/[userId]/remove` and `users/[userId]/access-scope` — four, not one.
   `settings/users-roles/members/route.ts` reads only. **W-5's audit is not discharged by this**: it was
   scoped to API routes, and says nothing about server actions, scripts, seeds, RPCs or migrations, which
   is where W-5's atomic path must also reach. It narrows the search, it does not end it.
   **W-4 narrows it once more, on a different axis:** its AST walk enumerates every `web/app/api` route
   that imports a service-role client, so any membership writer among the 539 routes is now mechanically
   findable rather than grep-findable. It still says nothing about server actions, scripts, seeds, RPCs or
   migrations.
   **DISCHARGED 2026-08-07 by W-5's audit, with one carve-out.** The enumeration was re-run *by table* across
   `web/app` and `web/lib` — the question change §5 asked for, not another grep over route files. Three
   product writers exist, all now routed through the atomic RPC; the fourth and fifth "writers" this note
   listed turn out to be a delete and a profile-side write. The carve-out: one **cert fixture**
   (`tests/processing/cert/processingIdentityCertFixtures.ts:115`) still writes a membership with no profile
   and can grow Q4 in a certification tenant. It is out of W-5's product-path mandate and was left in place
   deliberately; **W-6's preflight must expect it.** Server actions and migrations were not separately swept —
   the by-table sweep covers `web/lib` and `web/app`, which is where both live, but no migration authors a
   membership today and that is a property nothing yet locks.
5. **The observation window for dual-read is not specified.** It depends on real traffic to the authority path,
   which is a deployment fact this phase cannot see. Each lockout-class workstream sets its own and states it.
   **W-0 largely dissolves this:** at 6 `(user, org)` pairs the population is exhaustively enumerable, so
   step 3 is better satisfied by enumerating all six and computing both answers for each than by waiting on
   traffic that may not come. The limit would return at a larger tenant — the recommendation is scale-bound,
   not permanent.
6. **The §10.3 fixture matrix was not built with wave 1.** §10.3 asks for it "in wave 1, before it is
   needed", but it is not W-1, W-2 or W-3 and was outside the executing assignment's scope. W-1's and W-2's
   suites build their own fixtures inline, in the `usersRolesAuth.test.ts` idiom §10.1 names — so the
   conventions are consistent and the matrix can absorb them — but **F1–F10 do not yet exist as a shared
   artifact, and waves 2–5 cannot inherit what was not built.** It remains the highest-reuse unbuilt item.
   The same applies to the I-4 token tests §13.1 attaches to wave 1.
   **Wave 1 has now closed without it** (W-4 was the last workstream and did not build it either), so this
   is no longer a scheduling slip but a debt waves 2–5 inherit. The one partial exception is **F10**
   — *service-role client, no principal* — which W-4 does not fixture but does enumerate exhaustively and
   lock as a build check, so the population F10 was meant to exercise is at least named and frozen.
7. **Wave 1 carries no tier D evidence, by design.** §10.4 requires browser evidence only for
   lockout-class switches; W-1…W-4 are none of L1–L4. W-1 narrows three JSON data endpoints with no UI of
   their own, W-3's grid-row removal is visible in the Roles screen but changes no authority, and W-4 adds
   a build-time check that changes no runtime behaviour at all. None was verified in a browser on `:3020`.
9. **W-4 changes no route.** It measures and freezes; it remediates nothing. The five unauthorized
   `book-v2` routes it names are live exposure today and remain so until W-15. Wave 1 being "complete" is a
   statement about the wave's scope, not about the system being safe.
10. **A second planning track has been closing the same defects, and this plan did not know.** Migration
    `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql` implements
    `vertical-slice-v1/access-roles-v2-proposal.md` §3.1; it is **applied to the deployed target** and
    vendored here at `555fa056a`. It independently closes C5 (by repointing the grid to `ops.workflows.*`
    and seeding those keys into `permission_definitions`) and performs most of **W-9** — collapsing
    `permissions` and `permission_keys` into views over `permission_definitions` and replacing the dual FK
    with one. Consequences this plan has **not** absorbed, listed so no owner assumes their section is current:
    - **§7/W-9 describes a three-table catalog with two FKs on one column. That picture is false on the
      target.** W-9's owner must re-derive scope before starting; much of it may already be done.
    - **W-3 and that migration closed C5 by opposite remedies** — this repo deletes the grid row, the
      migration grants `ops.workflows.*` to every org's `admin` to back it. Nothing is broken (no route
      enforces `workflows.*`), but the two are incoherent and one of them should yield. Restoring and
      repointing the row would now validate, where on 2026-07-31 it would not.
    - **RL-2 adjudicates neither**, since `ops.workflows.*` now parses as seeded.
    - The general lesson is the one W-0 already recorded about `current_database()`: **this programme's
      documents describe a target that other work is changing underneath them.** Every remaining wave should
      re-verify its premises against the migration tree at start, not cite this plan's §5–§9 as current.
10. **§7/W-9's premise is stale against the deployed target, and this plan has not been corrected.** Migration
   `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql` is live on the target (dashboard
   -applied 2026-07-30, vendored 2026-07-31 in `555fa056a`): `public.permissions` and `public.permission_keys`
   are now **views** over `permission_definitions`, `role_permission_grants` carries a **single**
   `…_permission_definitions_fkey`, and `orgs` has an `orgs_seed_default_role_definitions` trigger. W-9 is
   written against "three catalog tables" and "two foreign keys on the same column with different `ON DELETE`
   semantics", and §5/W-3's execution record reasons from the same three-table picture. **Neither was rewritten
   — the W-0 re-run that found this was scoped to W-0.** W-9's owner must re-derive its scope (much of it may
   already be done) before scheduling wave 3, and W-3's record should be annotated rather than silently left to
   read as current. Found 2026-08-04.
8. **No effort is budgeted for governance-doc reconciliation.**
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

### 15.1 Wave 1 execution (2026-07-31, assignment `asg_d77353d7377647`)

Evidence: [`wave1-execution-evidence.json`](./wave1-execution-evidence.json) — red/green counts, the
typecheck broker request id, the regression baseline and its stated limit, and the three deviations.

Changed, on commit `41610954c` (local only — not pushed):

| File | Workstream |
|---|---|
| `web/lib/admin/canReadAnalytics.ts` *(new)* | W-1 |
| `web/app/api/admin/intelligence/operational/route.ts` | W-1 |
| `web/app/api/admin/metrics/resolve/route.ts` | W-1 |
| `web/app/api/admin/metrics/trends/route.ts` | W-1 |
| `web/lib/admin/selfAuthorityMutation.ts` *(new)* | W-2 |
| `web/app/api/admin/users/[userId]/role/route.ts` | W-2 |
| `web/app/api/admin/users/[userId]/access-scope/route.ts` | W-2 |
| `web/app/api/admin/users/[userId]/remove/route.ts` | W-2 |
| `web/lib/admin/permissionGrid.ts` | W-3 |
| `web/tests/access/analyticsRouteGates.test.ts` *(new)* · `web/tests/access/selfAuthorityMutation.test.ts` *(new)* · `web/tests/admin/permissionGrid.test.ts` · `web/tests/metrics/metricsResolveRoute.test.ts` · `web/tests/metrics/metricsTrendsRoute.test.ts` | QA |

**No migration was written and none was applied.** §11 remains a register.

### 15.2 W-4 execution (2026-07-31, assignment `asg_d203f547736c16`)

Evidence: [`w4-service-client-principal-baseline.json`](./w4-service-client-principal-baseline.json) — the
measured counts, the 26 unresolved routes with their list membership, and the 3 advisory transitive-only
routes. Regenerate with `npm run check:service-client-principal:evidence` from `web/`.

Changed (local only — not pushed):

| File | Role |
|---|---|
| `web/scripts/checkServiceClientPrincipal.mjs` *(new)* | the tier A check |
| `web/scripts/serviceClientPrincipal.allowlist.json` *(new)* | the reviewed register — 21 exceptions, 5 frozen baseline, 3 advisory |
| `web/tests/access/serviceClientPrincipalCheck.test.ts` *(new)* | RL-15 — 15 tests, including the empty-allow-list red state |
| `web/package.json` | `prebuild` gains the check; `check:service-client-principal` and `…:evidence` scripts |

**Verification run** in `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`:
`npm run check:service-client-principal` → exit 0, `ok: true`, 0 violations, 0 stale, across 539 routes ·
`vitest run tests/access/serviceClientPrincipalCheck.test.ts` → **15 passed**.

**Method:** static, AST-grounded. No route handler, schema, migration or UI was modified, and no request was
issued. The two exceptions spot-verified line-by-line for this record are `api/verticals/route.ts` and
`api/webhooks/resend/route.ts`.

### 15.3 Wave 1 re-execution under the reopen (2026-08-06, assignment `asg_e9308076173af6`)

Evidence: [`wave1-reopen-evidence.json`](./wave1-reopen-evidence.json) — the suite counts, the two red runs
and how each was staged, the re-enumerated subjects, and the typecheck result.

Changed (local only — not pushed):

| File | Role |
|---|---|
| `web/tests/access/analyticsRouteGates.test.ts` | RL-1 widened to the G2 *class* across `web/app/api`; comment-only gate names no longer credit; family floor ratcheted 26 → 27. **+6 tests, 36 → 42** |
| `docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` | §5 execution record, §13 RL-1 and RL-11 status, this entry |

**Two red runs, both staged against the real tree rather than a synthetic string**, then reverted: a probe
route under `app/api/admin/` carrying the G2 shape (flagged by path), and the same probe naming a sufficient
gate in a `// TODO:` comment (still flagged — the case the previous predicate credited). No probe survives in
the tree; the suite is green with it removed.

**Method:** static and file-grounded, plus the three Wave 1 suites executed. **No route handler, library,
schema, migration or UI was modified**; no request was issued, no browser opened, and no live query run. The
findings recorded against W-2 are reported, not remediated — see §5 for why.
