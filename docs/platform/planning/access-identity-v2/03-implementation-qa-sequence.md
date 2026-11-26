---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

# 03 — Sequenced implementation & QA plan

> **Delivery plan — Mission 2 revision.** The order in which Access & Identity V2 is built, and how each
> step is proven. The accepted plan (waves 0–5, `W-0`…`W-22`) was sequenced on 2026-07-31 against a
> three-document corpus. **Four documents have landed since, and the plan did not move.** `01…§29`
> established the consequence mechanically: the accepted plan names `C1`…`C11` and `G1`…`G6` and **none**
> of the 53 finding IDs created after it. This revision closes that.
>
> **What this revision is.** A re-sequencing, not a rewrite. Waves 0–5 are **carried** — they shipped or
> they remain the right work — and §§0–15 keep their numbers so existing citations resolve (`01…§33` cites
> `§1.2`, `§4` and `§13.1`; `02…§27` cites `§12`). Seven new waves (**6–12**, `W-23`…`W-53`) are added in
> §§16–22, and §23 is the artifact `01…§29` asked for: **every finding ID in the corpus, bound to a
> workstream or declared unassigned with a reason.**
>
> **Specification only.** No code, schema, migration, or UI is changed by this phase. Nothing here asserts
> that Access & Identity UI exists or is complete, and no decision is answered.
>
> **[Output #12 — Part III, 2026-08-04.]** Part III (§§30–42) is the **QA and evidence plan**: a
> verification tier and exit gate for every workstream Part II added, the fixture matrix as a buildable
> module, the two-process harness as a design, the preflight-evidence contract — and `QE-1`…`QE-9`, nine
> mechanically-verified findings about **what actually decides "met" in this programme**. Parts I and II
> are unmodified except this note and §0's table.
>
> **[Part IV — the reopen re-sequence, 2026-08-06.]** Five documents were reopened on 2026-08-06 against the
> operator's two directives — *reduce the role hierarchy to four layers* and *simplify the role editor without
> changing the access architecture* — and created roughly sixty identifiers. **This plan named none of them**
> (`01…§58`, `§61`; re-verified at `03efba377`: a search for every reopen register returns **8 lines, all of
> them `AD-15`** matched on the `D-15` substring — §58). Part IV (§§43–59) is the re-sequence: **waves 13 and
> 14**, `W-54`…`W-62`, the merge `GAP-16` says no artifact performs, the schedule form of the four-layer
> reduction `GAP-15` says has no definition of done, and §52 — **every reopen ID bound to a workstream or
> declared unassigned with a reason.** Parts I–III are unmodified except this note and §0's table.
>
> **Part IV's sharpest finding is a correction to this plan, not to the product.** `W-0` Q2 returned zero and
> §9 concluded the legacy fallback was *"unreachable for everyone alive in the database."* That is true of the
> **lockout** question Q2 was written to answer and false of `T-19`, the corpus's only **S1**: removal is what
> *creates* the zero-membership condition Q2 measured the absence of. `W-20` is therefore the cheapest S1
> closure in the corpus and it is currently scheduled in the long tail (§48).
>
> **A second premise re-check corrects the reopen rather than the plan.** `T-21`/`S-10` rest on *"no FK
> constrains `role_key`."* **Two do** — `role_permission_grants_role_definitions_fkey` and
> `role_permission_grants_role_fk`, both `(org_id, role_key) → role_definitions`, both in the production
> baseline **[verified this pass]**. `T-21`'s stated mechanism cannot occur, its severity is overstated, and
> `S-10`'s remediation is not the migration it asks for — it is an API check, an end to read-time
> fabrication, and a widened `M15`. The pair is also still `ON DELETE CASCADE`, which is the hazard Phase 0
> fixed on the neighbouring column and left on this one. §56 states both corrections; §47's `W-61` is sized
> against the corrected finding, not the recorded one.
>
> **[Part V — the reopen's QA and evidence plan, 2026-08-06.]** Part IV *scheduled* the reopen; Part V
> (§§60–73) says **how each of its nine workstreams is proven**: `F17`/`F18` and the fault-injection
> harness as buildable artifacts, a seven-screen tier-D record for the one wave whose deliverable is a
> **screen**, a discharge rule for the `EA-7` red run with a per-lock assignment for `RL-47`…`RL-56`,
> preflights for `M19`–`M21`, and the census fields that make `Q15`–`Q17` say in advance what a zero
> licenses. **And `QE-10`…`QE-17`** — what deciding "met" looks like *after a reopen*: the criterion
> verdict is the worker's own, copied verbatim (thirteen reviews now carry a failing check and no verdict
> moved); `within_scope` is the literal `true`; the reopen keeps a `validation.passed` its own validator
> could not produce; and **the three implementation assignments are scoped to the frozen QA-folder copy of
> this plan**, which contains neither Part III nor Part IV. **And `QE-17`: an operator resume reset this
> assignment without terminating the worker it declared silent, so two sessions wrote this file at once.**
> Parts I–IV are unmodified except this note and §0's table.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Sequenced implementation / QA plan* · assignment `asg_fccd7bdedcab5b`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `73f459dae`
**Date** 2026-08-04
**Supersedes** the 2026-07-30 plan (mission `msn_e9133cdade883793d2`, assignment `asg_c505e1d0d76acd`,
contentHash `a48a454dc1a5a25a537a345999d982dc`), whose text is carried in §§0–15 with amendments marked
**[M2 amendment]**. Execution records for waves 0 and 1 are **[carried]** verbatim from that plan.
**Status** Proposed — a plan to be scheduled, not a record of work done. **Exceptions: Wave 0 (§4) is
executed and complete**; its live counts are recorded and applied throughout. **Wave 1 (§5) is complete —
W-1, W-2, W-3 and W-4 are implemented and green**; their execution records are in §5 and their locks are
live in §13. **Every other wave remains a proposal, and seven of the twelve waves are new.**

**Method.** Static and corpus-grounded. This phase **reuses the accepted and delivered corpus as input and
re-derives nothing**: every finding, requirement, invariant and decision below is **[carried]** from the
document that owns it. What is new is the *sequencing* — waves, dependencies, exit criteria, locks and
coverage. Six load-bearing premises were re-verified mechanically at `73f459dae` (§28) because this
corpus's own recurring failure is *not checking that a plan's premises still hold at execution time*
(`01…§8`, `§18`). One new finding is recorded, and it is documentary, not a product defect: **`X-9`** (§26).

---

## 0. How to read this

| Section | Contents | State |
|---|---|---|
| §1 | The sequencing constraints that determine the order. Read this before disagreeing with the order. | carried + `§1.4` new |
| §2 | **Lockout class** — the changes that can lock every operator out, and the ritual they all use. | carried + `L5` new |
| §3 | Wave map and critical path — now **thirteen waves**. | rewritten |
| §4–§9 | Wave 0 through Wave 5, workstream by workstream: change, dependency, QA, exit criteria. | carried, amended |
| §10 | The QA architecture — four tiers, and why a grep-based check is not one of them. | carried + `§10.5` new |
| §11 | Migration register and the shared-apply preflight gate. | carried + `M11`…`M18` |
| §12 | Decision gates. **`D1`–`D4` are 4 of 21 open decisions**; §12 is superseded by §24. | carried, superseded |
| §13 | Regression locks `RL-1`…`RL-15`. Extended to `RL-42` in §25. | carried |
| §14 | Scope boundary, risks, and limits — **of the accepted plan**. §27 states this revision's. | carried |
| §15 | Provenance of the accepted plan and its execution records. | carried |
| **§16–§22** | **Waves 6–12** — revocation, delegation, authentication, tenancy, resolver, truthfulness, audit. | **new** |
| **§23** | **Coverage** — every finding, requirement and invariant ID → workstream, or declared unassigned. | **new** |
| **§24** | Decision gates, all 21, by sitting; what each releases. | **new** |
| **§25** | Regression locks `RL-16`…`RL-42`. | **new** |
| **§26** | Corpus-integrity items `X-1`…`X-9` — Director-owned, and `X-9` is new. | **new** |
| **§27–§29** | The Part II revision's limits, reproduce commands, and provenance. | **new** |
| **§30–§32** | **QA and evidence plan** — why §10 is not enough, **what actually decides "met"** (`QE-1`…`QE-8`), and the evidence contract `EA-1`…`EA-7`. | **new** |
| **§33–§37** | Verification tier per workstream `W-23`…`W-53` · per-wave exit gates 6–12 · the fixture module · the two-process harness · preflight evidence. | **new** |
| **§38–§42** | The evidence ledger, decisions `DR-8`…`DR-12`, and this part's limits, reproduce and provenance. | **new** |
| **§43–§45** | **Part IV.** What the re-sequence is · the trigger rule `GAP-17` asks for (`DR-13`) · **what "four layers" means as a schedule** (`GAP-15` in the plan's own unit). | **new** |
| **§46–§47** | **Wave 13 — the role editor** (`W-54`…`W-59`), the one buildable description `GAP-16` says is missing · **wave 14 — the depth reduction** (`W-60`…`W-62`) and the **six** amendments to existing workstreams. | **new** |
| **§48–§51** | `W-20` re-priced against `T-19` · census questions `Q15`…`Q17` · the four new ordering constraints (§1.6–§1.9) · the amended wave map and execution order. | **new** |
| **§52–§56** | **Coverage of the reopen** — every ID bound or unassigned · the decision register at **25** · locks `RL-47`…`RL-56` and migrations `M19`…`M21` · tiers and exit gates for waves 13–14 · `X-14`. | **new** |
| **§57–§59** | Part IV's limits, reproduce and provenance. | **new** |
| **§60–§62** | **Part V.** Why Part III and §55 do not cover the reopen · **what decides "met" after a reopen** (`QE-10`…`QE-17`) · the two evidence classes the reopen requires (`EA-8`, `EA-9`). | **new** |
| **§63–§67** | `F17`/`F18` and the fault-injection harness · **tier D for wave 13 — the screen record** · the `EA-7` discharge rule for `RL-47`…`RL-56` · preflights for `M19`–`M21` · census evidence for `Q15`–`Q17`. | **new** |
| **§68–§73** | The evidence ledger extended to the reopen · decisions `DR-14`…`DR-19` · **three** corrections (Part III's limit 1; `W-59`'s reachability premise; the count of redirected URLs, wrong in both earlier sections) · Part V's limits, reproduce and provenance. | **new** |

Workstreams are `W-n` and continue the accepted series without renumbering: `W-0`…`W-22` are the accepted
plan's, `W-23`…`W-53` are Part II's, **`W-54`…`W-62` are Part IV's** (§§46–47). Sizing is **S** ≤ 2 engineer-days · **M** 3–8 · **L** 9–20. These are
estimates on a codebase of **559** API route files and 289 migrations, not commitments.

> **[M2 amendment] The route count moved: 539 → 559.** The accepted plan sized `W-14` and `W-15` against
> 539 route files; `01…§4`'s refreshed census reports 559, and `git ls-files 'web/app/api/**/route.ts'`
> returns **559** at `73f459dae` **[verified this pass]**. Twenty routes were added while this corpus was
> being written, none of them declared. That is a 3.7% drift in eight days against the largest item in the
> plan, and it is the concrete argument for `W-14` landing before the sweep rather than after: **the
> denominator of `W-15` grows while `W-15` is unscheduled.**

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

### 1.4 A live fail-open outranks a design gap **[M2 amendment]**

The three constraints above are all about *dependency*. They produced a wave order in which the sharpest
defect in the corpus would have been scheduled nowhere, because it had not been found yet. A fourth
constraint is therefore stated explicitly, and it is a **priority** rule rather than a dependency rule. It
is what §3.2's execution order encodes, and it is the only place this revision overrides the accepted plan's
ordering logic rather than extending it:

> **A defect that is live in the product now outranks a defect that is latent, and both outrank a design
> gap — regardless of which wave the dependency graph would put them in.**

`02…§28` makes this argument against the accepted plan's own framing. `03…§12` says *"None blocks the
model; each blocks specific work"* — true of `D1`–`D4`, and **false** of the revocation sitting:
*"`AD-11` does not block work, it describes a defect that is live in the product now"* (`02…:1485-1488`)
**[carried]**. Three consequences bind the schedule in §6:

1. **Wave 6 (revocation) executes first among the unshipped waves**, ahead of wave 2, even though wave 2's
   `G4` fail-open is also confirmed. `T-1` and `T-2` are the corpus's only **S1** entries (`01…§14`), and
   `T-1` is the only recorded defect that lets a principal act *after* an operator was told revocation
   worked.
2. **Cheap truthfulness work is not held behind its wave.** `06…§7` calls `IA-R1`, `IA-R3` and `IA-R6`
   *"the cheapest items in this document and the highest-value"*, and `04…§6.2` says the show/hide baseline
   *"should not be sequenced behind auth-method work"* **[carried]**. §3.2 pulls `W-30`, `W-45` and `W-47`
   forward out of waves 8 and 11.
3. **A one-line fix with a live consequence does not wait for the design question it sits beside.**
   `01…§30` is explicit that `AD-9`'s fix *"is independent of `AD-3` and should not wait"* (`01…:1187`)
   **[carried]** — hence `W-29` in wave 7 while `W-18` stays in wave 5.

### 1.5 A decision whose cost compounds is scheduled by its clock, not by its wave **[M2 amendment]**

Two decisions get more expensive every week they stay open, and neither is on the critical path:

- **`AD-2`** (`regional_lead` / `school_director`) — *"cost compounding: now seeded per org on insert"*
  (`02…§10`) **[carried]**. Answering it after wave 4 costs a second grant migration (§12).
- **`AD-13`** (public-surface tenancy) — *"small **now**, and becomes a migration once a second tenant has
  a public surface"* (`01…:766-767`) **[carried]**.

Neither is a dependency; both are a clock. They appear in §24's approval order for that reason and not
because work is blocked behind them, and §3.2 schedules the *sitting* early even where the *workstream* is
late.

---

## 2. The lockout class

~~Four~~ **Eight** workstreams can deny every operator access to the product if they land wrong:

| # | Workstream | Failure mode if it lands wrong | Census gate |
|---|---|---|---|
| **L1** | W-7 — absent scope denies | Any membership without a profile row is denied all rows | W-0 Q4 |
| **L2** | W-13 — portal admission becomes a capability | Any principal not granted `portal.access` is redirected to `/unauthorized` | W-0 Q5 |
| **L3** | W-16 — FK on `user_roles.role` | Migration fails, or existing memberships become unwritable | W-0 Q3 |
| **L4** | W-20 — legacy fallback removed | Principals authorizing via `user_profiles`/`app_users` lose all authority | W-0 Q2 |
| **L5** **[new]** | W-26 — account state enforced in the resolver | Any principal whose account-state row is absent or not `active` loses every org, on every request | W-23 Q9 |
| **L6** **[new]** | W-25 — role deactivation revokes | Every principal holding a role currently marked `is_active = false` loses that role's capabilities at the switch | W-23 Q10 |
| **L7** **[new]** | W-29 — the users-and-roles gate is repointed | If no role in an org is granted `admin.users.write` / `admin.roles.write`, **user and role management becomes unreachable through the product** — and unreachable by the only path that could grant the key | W-23 Q11 |
| **L8** **[new]** | W-49 — surfaces gate on the capability they present | Any principal lacking a chapter's declared capability loses the surface, including the Access chapters themselves | W-23 Q12 |

All eight are the same shape — *a widening default is replaced by an explicit source of truth* — so all eight
use one ritual rather than eight bespoke plans.

> **[M2 amendment] `L7` is the one that can be self-locking, and it is the reason the census is re-run.**
> `L1`–`L6` and `L8` deny *some* principals; `L7` can deny *every* principal the one surface that could undo
> the denial. `02…§10` recommends the repoint precisely because the seed already withholds those two keys
> from `ops` — but `01…§14` records that `admin.users.write` and `admin.roles.write` have **zero repo
> matches** (`T-4`) **[carried]**, which means nothing reads them *and* nothing has ever been observed to
> grant them. `W-23` Q11 must confirm that at least one role per org holds the key **before** the gate moves,
> and `W-29`'s step 4 must ship with a documented break-glass path. This is the one lockout-class workstream
> where "revert the commit" is not sufficient recovery, because the operator who would revert it may be the
> one locked out.

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

## 3. Wave map and critical path **[rewritten — M2]**

### 3.1 Thirteen waves

Waves 0–5 are **[carried]** with their workstream numbers unchanged. Waves 6–12 are new and are specified in
§§16–22. The `Gap` column is `01…§26`'s register; the `Sitting` column is `02…§27`'s.

| Wave | Theme | Workstreams | Gaps closed | Gated on | State |
|---|---|---|---|---|---|
| **0** | Facts before changes — read-only live verification | W-0 | — | — | **DONE 2026-07-31** |
| **0b** | **Facts, round 2 — the eight questions the corpus cannot answer** | **W-23** | prices GAP-1, 6, 9, 10 | — | **new** |
| **1** | Fail-closed quick wins, no schema | W-1 … W-4 | GAP-9 (part) | — | **DONE 2026-07-31** |
| **2** | The scope invariant (the confirmed fail-open) | W-5 … W-8 | GAP-3 (2 of 4 legs) | ~~W-0~~ **satisfied** | carried |
| **3** | One catalog, one vocabulary | W-9 … W-12 | GAP-5 | — (parallel with 2) | carried |
| **4** | Admission and declaration | W-13 … W-15 | GAP-4, GAP-9 | W-3, **AD-2** | carried |
| **5** | Role-model coherence and the long tail | W-16 … W-22 | GAP-6, GAP-7 (part), GAP-11 (1 of 3) | **AD-3**, **AD-4** | carried |
| **6** | **Revocation and credential lifecycle** | **W-24 … W-28** | **GAP-1**, GAP-10 (atomicity) | **sitting 1** (AD-6, AD-10, AD-11, AD-16) | **new** |
| **7** | **The delegation gradient** | **W-29** | **GAP-8** | **AD-9** — *not* AD-3 | **new** |
| **8** | **Authentication** | **W-30 … W-37** | **GAP-2** | **sitting 3** (AD-5, 7, 8, 14, 17, 18) | **new** |
| **9** | **Tenancy and the unauthenticated surface** | **W-38 … W-40** | GAP-11 (the 2 unplanned holes) | **sitting 4** (AD-13, AD-15) | **new** |
| **10** | **One resolver, one normal form** | **W-41 … W-44** | **GAP-7**, GAP-3 (read-error leg), GAP-6 (residue) | **AD-12**; AD-4 for W-44's SQL half | **new** |
| **11** | **Truthfulness at the surface** | **W-45 … W-52** | **GAP-12**, GAP-3 (render leg) | AD-18, AD-20, AD-21 for 3 of 8 | **new** |
| **12** | **Audit** | **W-53** | GAP-10 (audit) | **W-23 Q7** — discovery precedes the workstream | **new** |

Two waves have no workstreams and are recorded so their absence is a conclusion, not an oversight:

- **GAP-13** (person ↔ principal) *needs none by design* — `03…§13.1` and `02…§25` both state the absence is
  the correct design and only the decision (`AD-1`) is missing. **[carried]**
- **GAP-14** (corpus integrity) is **Director-owned**, not engineering work. It is §26, not a wave.

### 3.2 Execution order — the schedule

The wave map is a *grouping*; this is the *order*. It applies §1.4 (live before latent) and §1.5
(compounding cost) across the grouping, so several waves interleave rather than running end to end.

| # | Batch | Contents | Why here |
|---|---|---|---|
| **1** | **Evidence** | `W-23` (read-only) | Eight unknowns gate the sizing of four waves and every lockout switch. It is one authorized read, and `W-0` proved this buys more than it costs (§1.2). |
| **2** | **The live-defect batch** | `W-24`, `W-25`, `W-29`, `W-30`, `W-45`, `W-47` | The only **S1** defect (`T-1`), the `ops`≈`admin` gradient, and the three cheapest truthfulness items. Nothing here waits on a migration; `W-30`, `W-45` and `W-47` wait on no decision at all. |
| **3** | **Scope** | Wave 2 (`W-5`…`W-8`) + `W-43` | The confirmed fail-open. `W-43` (read errors deny) joins it because `M2-12` is the *same* fail-open reached by a different route, and fixing one without the other leaves `I-19` half-met. |
| **4** | **Lifecycle** | `W-26`, `W-27`, `W-28`, `W-53`-discovery | The credential half of revocation. `L5` makes this the most dangerous batch; it runs after the census and with tier D evidence. |
| **5** | **Vocabulary** | Wave 3 (`W-9`…`W-12`) + `W-42`, `W-44` | Disjoint from batches 3–4. `W-42` (one normalization) and `W-44` (retire role literals) belong with the vocabulary work, not after it. |
| **6** | **Resolver** | `W-41`, `W-48` | One resolution function, then the preview renders from it. `W-48` replaces `W-21`'s scope and must follow `W-8` and `W-20` (§9). |
| **7** | **Authentication** | Wave 8 remainder (`W-31`…`W-37`) | Six decisions gate it; until sitting 3 is held it *cannot be sized*, which is why only `W-30` is in batch 2. |
| **8** | **Admission and declaration** | Wave 4 (`W-13`…`W-15`) + `W-49`, `W-50` | `W-14`'s mechanism is the critical path's long pole. `W-49`/`W-50` are the surface twins of `W-14`/`W-11` and must use the same declaration. |
| **9** | **Tenancy and the public surface** | Wave 9 (`W-38`…`W-40`) | `W-40` carries `W-4`'s five frozen `book-v2` routes — **live exposure today** (§5). Scheduled here only because it needs `W-23` Q14's handler-level census; if that slips, `W-40` moves to batch 2. |
| **10** | **The long tail** | Wave 5 remainder (`W-16`…`W-22`), `W-46`, `W-51`, `W-52` | Large, mechanical, parallelizable. |
| **11** | **Audit** | `W-53` | Needs the transition model (`W-28`) to have something to record, and `W-23` Q6 to know what exists. |

**Critical path** (longest dependency chain, unchanged in shape and lengthened at both ends):

```
W-23  →  W-9        →  W-11          →  W-13           →  W-14          →  W-15            →  W-49
 S      one catalog    one vocabulary    portal.access     route table      enforcement       surface gates
         M                M                 M                 M               L                 M
```

The **revocation chain** runs beside it and is shorter, which is why it finishes first:

```
W-23  →  W-24            →  W-26                →  W-28              →  W-53
 S      revocation now      credential disable      atomic + retire      audit
          M                    L                       M                   L
```

`W-15` remains the single largest item and the one most amenable to being split across contributors once
`W-14`'s mechanism exists. **`W-26` is the largest new item**, and unlike `W-15` it cannot be split: `04…§2.1`
establishes that no credential-disable call exists anywhere, so it is a build, not a sweep.

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

**Exit criteria.** [`qa/access-identity-v2/wave0-authority-census.json`](../vacilando-os/qa/access-identity-v2/wave0-authority-census.json)
committed, with counts and the query text for each of Q1–Q6. Every one of L1–L4 cites it before proceeding.

**If Q2, Q3, Q4 or Q5 is non-zero**, the corresponding workstream gains a *remediation* step ahead of its
switch, and that step is scheduled explicitly rather than absorbed. A non-zero Q1 (trigger attached) promotes
G1 from latent to live and moves W-20 into wave 2. A non-zero Q6 makes W-8 a behaviour change for a named
population rather than a no-op.

### W-0 execution record

| Field | Value |
|---|---|
| Evidence file | [`wave0-authority-census.json`](../vacilando-os/qa/access-identity-v2/wave0-authority-census.json) — **counts recorded; exit criteria met** |
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

### 4.1 Wave 0b — W-23, the second census *(S · read-only · no product change)* **[new — M2]**

`01…§33` records **eight questions no document in the corpus has answered** (`U-1`…`U-8`) and proposes
*"a second read-only census, scoped to `U-2`, `U-3`, `U-5` and `U-7`"* as *"the cheapest thing that would
move several gaps from reasoned to established"* (`01…:1312-1315`) **[carried]**. `02…§28` prices three of
the six decision sittings against the same set (`01…:1479-1483`) **[carried]**. This workstream schedules it,
and folds in the four new lockout-class gates §2 introduced — because each one needs a live count *before*
its switch, and asking for live access four separate times is the mistake `W-0` Q6 already avoided once.

Eight queries, continuing `W-0`'s numbering so a single evidence file can hold both runs.

| # | Question | Source | Gates |
|---|---|---|---|
| **Q7** | **Is any authority change recorded anywhere?** Enumerate tables, triggers and columns that could constitute an audit trail for writes to `user_roles`, `role_definitions`, `role_permission_grants` and the three scope tables | `U-2` | **W-53** — the whole of wave 12 |
| **Q8** | **Does the deployment run more than one server process?** Instance count and whether any warm process is long-lived | `U-7` | `AD-11` pricing; **W-24**'s mechanism choice |
| **Q9** | How many `auth.users` rows would a per-`(user, org)` account-state table have to seed, and how many have no membership at all? | `L5` | **W-26** (L5) |
| **Q10** | How many principals hold a role whose `role_definitions.is_active` is `false`? | `L6` | **W-25** (L6) |
| **Q11** | **Per org: does any role hold `admin.users.write` or `admin.roles.write`?** Report orgs where the answer is *no* | `L7` | **W-29** (L7) — the self-locking one |
| **Q12** | Per org and per access chapter, how many principals hold the capability each chapter would declare? | `L8` | **W-49** (L8) |
| **Q13** | **The RLS policy inventory** — every policy on every table touching the authority graph, with its `USING`/`WITH CHECK` expression and the role vocabulary it names | `U-3` | `AD-4`; **W-19** sizing (the S–M / order-of-magnitude split) |
| **Q14** | **The handler-level gate census** — per exported HTTP method, not per file | `U-5`, `T-10` | **W-14**, **W-15**, **W-40** sizing |

**Q14 is the odd one and is stated as such.** `U-1`…`U-8` are mostly questions about the deployed database;
`U-5` is a question about the *repository*, and `05…§9` deliberately declines to answer it: *"'Ungated' was
not established, and is deliberately not reported as a number… Any 'N unprotected routes' claim from this
corpus should be treated as unverified until checked per handler"* **[carried]**. It is folded in here
because it is the same *kind* of act — establish a number before sizing work against it — and because
`W-15` is the largest item in the plan and is currently unsized. It must be built as an **AST walk in the
`W-4` shape** (§10.2), not a grep; `W-4`'s check is the working precedent and its export-table bug (§5) is
the specific trap.

**Re-run Q1–Q6.** Not optional. `§4`'s own record says the counts *"are a snapshot and every switch must
re-run the census rather than cite this one"*, and Q4 *"will keep growing until `W-5` lands"* **[carried]**.
Nine days have passed.

**Channel.** The Vacilando trusted host action `database.read_census`, exactly as `W-0` used it. `§4`'s
execution record states the reusable lesson: *"Every remaining live-evidence step in this programme…
should use this channel. The unblock never required an operator to paste anything"* **[carried]**. Q13 and
Q14 need no elevated access at all — Q13 reads `pg_policies`, Q14 reads the repository.

**Exit criteria.** A committed evidence file carrying counts **and query text** for Q1–Q14, in the
`wave0-authority-census.json` shape. Every one of `L1`–`L8` cites it before proceeding, and `W-19`, `W-53`
and `W-15` cite it before they are sized.

**If a rule fires.** Q10 or Q12 non-zero makes `W-25`/`W-49` a behaviour change for a named population —
identify and announce, as `W-0` Q6 required of `W-8`. **Q11 returning "no" for any org blocks `W-29`
outright** until a grant migration precedes it; that migration is `M17` (§11) and is conditional on this
answer. Q7 returning "nothing" moves `W-53` from *extend the audit* to *build one*, which is a different
size and a different rubric claim (§25, `07/AD-1`…`07/AD-5`).

**Cost of skipping it.** Four lockout-class switches proceed on assumption, `W-19` stays sized at
"S–M or an order of magnitude larger", `W-15` stays unsized, and wave 12 cannot start. `W-0` cost five
`SELECT`s and struck a migration, emptied three of four remediation sets, and was *"the single largest
de-risking of the programme"* (§4) **[carried]**. This is the same bet at twice the scope.

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
| Check | [`web/scripts/checkServiceClientPrincipal.mjs`](../../../../web/scripts/checkServiceClientPrincipal.mjs) — AST walk over TypeScript's own parser |
| Register | [`web/scripts/serviceClientPrincipal.allowlist.json`](../../../../web/scripts/serviceClientPrincipal.allowlist.json) — three lists, each entry reasoned |
| Lock | `web/tests/access/serviceClientPrincipalCheck.test.ts` — **15 tests, all green** (RL-15, §13) |
| CI | `web/package.json` → `prebuild` runs `check:service-client-principal`; the check exits 1 on any violation or stale entry, so `next build` cannot proceed past it |
| Evidence | [`w4-service-client-principal-baseline.json`](../vacilando-os/qa/access-identity-v2/w4-service-client-principal-baseline.json) — full counts, per-route rows omitted; regenerate with `npm run check:service-client-principal:evidence` |

##### The baseline

| Measure | Count |
|---|---|
| API route files | **539** |
| …hold a service-role client by direct import | **520** |
| …of those, resolve a principal | **494** |
| …of those, resolve none — **the exception baseline** | **26** |
| — reviewed exceptions, each with a named authorization model | **21** |
| — frozen W-15 remediation baseline, no model | **5** |
| Reach a service client transitively (through a helper) | 536 |
| …transitive-only *and* unresolved — advisory, not enforced | **3** |

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
  emptied by fixing them and cannot be extended by adding a sixth.
- `advisory_transitive_only` — must match the computed set exactly, in both directions.

A **stale** entry is itself a failure — if a route is deleted, stops holding a service client, or starts
resolving a principal, the check goes red until the list is updated. That is what stops the register
decaying into residue, which is the failure mode the exit criterion names.

---

## 6. Wave 2 — The scope invariant

The one *confirmed, fail-open* defect in the system, and the L1 lockout. Depends on W-0 Q4.

> **[M2 amendment] Wave 2 closes two of GAP-3's four legs, not all four.** `01…§26` records GAP-3 as
> *"scope fails open at every layer that touches it"* with four constituent legs, and states that
> `W-5`/`W-6`/`W-7` *"do not cover the read-error leg (`M2-12`) or the render leg (`IA-3`)"* (`01…:1014`)
> **[carried]**. The two uncovered legs are now `W-43` (§20 — a failed profile read is indistinguishable
> from an absent one and resolves the same way) and `W-47` (§21 — *"All locations · All departments"*
> renders identically to *no profile was ever created*, which `06…§6` upgrades from a design gap to a
> **verified impossibility**: the members route cannot emit the distinction). **`I-19` is not met when
> wave 2 closes.** §3.2 schedules `W-43` inside batch 3 for that reason, and `W-47` in batch 2 because it
> costs nothing to stop the UI asserting a reassurance the resolver cannot support.

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

> **[M2 amendment] The invite path is a membership writer, and it is the one the operator uses.**
> `06…` IA-5 establishes that the invite modal is the specified flow *"with the load-bearing steps marked
> Planned"*, and that it *"creates no access profile"* (`G4`) **[carried]**. `IA-R9` states the requirement
> in testable form: *"The invite flow MUST create the access profile in the same transaction as the
> membership. Scope MUST NOT be deferred to a later step"* (`06…§7`) **[carried]**. `W-5`'s atomic RPC is
> the mechanism; **the invite path must route through it, and the modal's scope step must stop being
> Planned**, or `W-5` closes the API leg and leaves the operator-facing leg open. `IA-R9`'s check is
> `W-5`'s tier C test with the invite route as the subject, so this costs a fixture, not a design.

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

> **[M2 amendment] W-11 now carries C13, and the drift is measured rather than estimated.** Two things
> changed under this workstream since it was written. First, `05…§2.1` measured the drift: **32 seeded keys,
> 18 grantable, 11 of the 18 inert, and 4 of the 9 grid rows inert in both columns** **[carried]** — so
> "13 enforced keys have no grid row" above is the *other* direction of a gap whose first direction is now
> a hard number. Second, `W-3` removed the `workflows.*` grid row and a migration seeds `ops.workflows.*`
> into `permission_keys` only — `01…§2.3` records this as **C13**, the residue of closing `C5` twice
> **[carried]**. `W-11` is where C13 resolves: **the workflows row returns iff `W-11` seeds a workflows key
> that something enforces**, which is the order `W-3`'s execution record already argued for. If nothing
> enforces one, the key is deleted with the rest of the unenforced catalog and the row does not return —
> and that outcome must appear in the enumerated deletion list, not be reached silently.
>
> `M2-9` also lands here: closing `I-12` enlarged `I-15`, because the blanket grant in `seed_default_rbac()`
> now sweeps the **unioned** catalog (`02…§6.2`) **[carried]**. `W-12` fixes the seed; `W-11` decides what
> the seed will be enumerating over. **Sequence `W-11` before `W-12`**, or the enumeration is written twice.

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

> **[M2 amendment] The unusable population grows per org, and the invariant now has a number.**
> `04…§3.4` records this as **A2-6** — *"two seeded personas per org can hold a credential they cannot
> use — **admission is not authentication**, and Phase 0 now grows the population"* **[carried]**. That is
> `AD-2`'s compounding cost (§1.5) stated from the authentication side: every org seeded since Phase 0 adds
> two more principals who can sign in and reach `/unauthorized`. `04…§6.3` states the invariant form as
> **`I-32`** — *"Admission MUST be a capability (`portal.access`) evaluated after authentication, and
> refusal MUST produce a distinct, actionable outcome"* **[carried]** — which adds one clause `W-13` does
> not currently carry: **the refusal must be actionable**, not a bare redirect to `/unauthorized`.
> `06…`'s F4 fixture is the refusal path; the tier D pass must record what the refused principal is told.
>
> `M2-7` also bears on the exit criterion. The accepted text names three special-casing sites
> (`PORTAL_ROLES`, `ALLOWED_ROLES`, `PORTAL_DEPARTMENT_SCOPE_BYPASS_ROLES`); `02…§8` enumerates **at least
> 14** authority-deciding role-literal sites, including a *second* `PORTAL_ROLES` in
> `resolveAdminPortalOrgCore.ts:7` (`M2-5`) **[carried]**. `W-13` must delete that one too, or the switch
> leaves a third hard-coded admission set live. The remaining eleven are `W-44` (§20).

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
**Exit.** The route table builds, covers ~~539~~ **559** routes, and the tier census is replaced by a lookup.

> **[M2 amendment] The denominator moves, so the exit criterion is stated as a property, not a number.**
> 559 route files at `73f459dae` **[verified this pass]**, against 539 when this workstream was written —
> **twenty new routes in eight days, none of them declared.** An exit criterion phrased as a count is
> already stale when it is read. Restate it: *every file matching `web/app/api/**/route.ts` appears in the
> declared table, and a file that does not fails the build.* That is `RL-10`, and it is the only form that
> survives the drift.
>
> **`W-14` must declare per exported method, not per file.** `05…§9`'s first limit: *"One `route.ts` may
> export `GET`, `POST`, `PATCH`, `DELETE` with different gates. A file counts as gated if any recognized
> helper appears in it. **A gated file does not mean every method in it is gated.** This is the single
> largest weakness of a static census"* **[carried]**. A file-grained declaration table inherits that
> weakness and would make it structural. `W-23` Q14 establishes the handler-level baseline; `W-14` declares
> at the same grain.

#### W-14 execution record — **DONE 2026-08-10, committed `ff3b1f88d`, not promoted**

| Field | Value |
|---|---|
| Check | [`web/scripts/checkRouteCapabilities.mjs`](../../../../web/scripts/checkRouteCapabilities.mjs) — discovers routes and exported handlers from disk; declarations are read, never inferred |
| Table | [`web/scripts/routeCapabilities.declared.json`](../../../../web/scripts/routeCapabilities.declared.json) — `declared` \| `none` (reason ≥ 40 chars) \| `pending` (ratcheted) |
| Lock | `web/tests/access/routeCapabilityDeclaration.test.ts` — **11 tests, all green** (RL-10, §13), of which five are negative fixtures |
| CI | `web/package.json` → `prebuild` runs `check:route-capabilities`; exits 1 on any undeclared handler, so `next build` cannot proceed past it |
| Retired | `web/scripts/auditAuthorityPaths.mjs` **deleted**, and `audit:authority-paths` removed from `package.json`, per §8. Its two surviving mentions are prose recording why it was wrong |
| Evidence | [`w14-declared-route-capability-table.json`](../vacilando-os/qa/access-identity-v2/w14-declared-route-capability-table.json) |

##### The baseline

| Measure | Count |
|---|---|
| API route files | **572** |
| Exported HTTP handlers — **the real denominator** | **751** |
| …`declared`, requiring a seeded catalog capability | **25** |
| …`none`, reviewed and reasoned | **1** |
| …`pending`, W-15's backlog | **725** |

**The exit criterion held as a property, and it had to.** This workstream was sized against 539 routes,
the M2 amendment re-measured 559, and there were **572** on the day it was built. No count-phrased
criterion would have survived the eight days between them.

**The file grain is blind to 31% of the surface.** 751 handlers across 572 files: a file-grained table
asserts one answer for an average of 1.31 handlers. `05…§9`'s warning is now a measurement, and the
first thing the method grain found was `app/api/admin/users/route.ts` — **`POST` requires
`settings.users_roles`; `GET` returns every org member's email address behind portal admission alone.**
The census counts that file as gated. It is declared `pending` with the finding recorded inline rather
than `none`, because asserting that roster read needs no capability is `W-15`'s product decision to make,
not this workstream's. Registered as `W14-F1`.

**`W-11`'s tier A check landed here.** §7 records it as inexpressible until `W-14` supplied the declared
set — *"W-11 lands the data change and W-14 lands the check that keeps it true."* RL-10 joins every
declared capability to `discoverCatalog()`; all 25 resolve. A route gating on a capability the catalog
does not seed is a permanent 403 that reads like a gate, and that class is now closed.

**Sequencing note.** §4's chain puts `W-13` before `W-14`. `W-14` was built first because it consumes no
`portal.access` and is not blocked by `D2`/`AD-2`, which decides only *which roles receive the grant* —
and because `W-13`'s own tier A conformance is a lookup against this table, so building the table first
removes a blocker rather than creating one.

### W-15 — Enforcement sweep *(L · I-17, I-23 · the long tail)*

Bring every route to the G-A…G-D gate contract, using W-14's declarations and W-4's exception baseline.
~500 admin routes currently gate on portal eligibility alone; 17 consult a capability.

Split by route family, one contributor per family, each family independently mergeable. **Publish the per-family
count in the plan of record as it lands** — a sweep that reports "mostly done" is how C1 happened.

**QA.** Tier A: the declared table shows zero routes with an unreviewed `null`. Tier C: per-family gate-order
tests at the boundary, asserting 401 before 403 before scope filtering — order matters, because a route that
checks capability before tenancy leaks the existence of other orgs' rows.
**Exit.** Every route's gate matches its declaration; the residual `null` set is reviewed and named.

> **[M2 amendment] `W-15` also owns the command layer, and that half is not a route sweep.**
> `05…§6.3` establishes that **the action registry carries no authorization metadata at all**: nine
> canonical registered actions, zero `requiredPermission`/role/scope fields, and `actionExecutor.ts` +
> `actionEligibility.ts` contain **zero** occurrences of `permission|authorize|access|canManage|role`
> **[carried]**. `01…§14` frames it as `T-8` — *"command authority is a property of transport, not of the
> command"* — and `05…§7.2` states the remedy: *"`RegisteredAction` gains a required permission and scope
> requirement; `actionExecutor` enforces it before dispatch"* **[carried]**. This is the brief's own
> rejection condition (*"every registered command verifies authorization independently of UI placement"*)
> and the rubric's `AE-2`. It is **nine actions, not 559 routes** — a small, well-bounded piece of work
> hiding inside the plan's largest item. **Split it out and land it first within `W-15`**, because it is the
> half that can be finished, and `05…§7.2`'s second clause is what makes `actionEligibility` safe:
> eligibility becomes *"a pure display concern derived from the same declaration."*
>
> **Also inside `W-15`: the five frozen `book-v2` routes** `W-4` named (§5). They are **live exposure
> today** — caller-supplied row ids read and written with a service-role client, no token, no principal.
> §3.2 pulls them into `W-40` (§19) with the rest of the unauthenticated-surface work rather than leaving
> them at the end of the largest workstream in the plan.

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

> **[M2 amendment] The absent FK sits beside a redundant one, and `W-16` should remove both asymmetries in
> one migration.** `02…§8` records **`M2-2`**: `role_permission_grants` carries **two identical foreign
> keys** onto `role_definitions` (`remote_schema.sql:6512-6518`) while `user_roles.role` carries **none**
> (`:2915-2920`) — *"redundancy beside an absence"* **[carried]**. `M9` adds the missing constraint; a
> second statement in the same migration drops the duplicate. Registered as **`M15`** (§11) rather than
> folded silently into `M9`, because dropping a constraint and adding one have different rollback
> characteristics and §11's repoint-before-drop rule applies to both.

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

> **[M2 amendment] Two things make `W-19` bigger and better-evidenced than it was written.**
>
> 1. **The dead vocabulary is no longer confined to SQL.** `02…§8` records **`M2-6`**: the never-seeded
>    `owner`/`manager` terms have **leaked out of RLS into live application gates** —
>    `DOCUMENT_READ_ROLES = ["owner","admin","ops","manager"]` (`assertDocumentAccess.ts:76`) and
>    `configurationProposalAccess.ts:53`, each mirroring a policy whose premise `C10` already falsified.
>    *"Remediating `C10` in SQL alone would now leave the leak behind"* **[carried]**. Under `AD-4(b)` the
>    exit criterion must therefore cover application code as well as `remote_schema.sql`, and the static
>    check belongs with `W-44` (§20), which owns role literals generally.
> 2. **The decision it waits on is being made from evidence the corpus flags as insufficient.** `U-3`:
>    *"no policy-by-policy RLS review has ever been done… GAP-6 and `D4` are being decided from secondary
>    evidence"* (`01…:1305`), and `02…§27` calls `AD-4` *"the one decision in this register whose
>    recommendation rests on evidence the corpus itself flags as insufficient"* **[carried]**. **`W-23` Q13
>    is that review**, and it should precede the sitting, not the workstream. The order-of-magnitude spread
>    between `AD-4(a)` and `AD-4(b)` is exactly what Q13 collapses.
>
> `AD-4` is also **the one decision a delivered artifact already binds to**: `07…§3.4` makes `AE-3`
> satisfiable two ways, *"and one of them **is** this decision"* (`02…§27`) **[carried]**.

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

> **[M2 amendment] The fallback path carries a database-enforced fourth role vocabulary, and deleting the
> fallback is what makes it removable.** `02…§8` records **`M2-8`**: `app_users.role` has a `CHECK`
> constraint enumerating a fourth role vocabulary — including `vendor_owner` and `vendor_worker` —
> *"vocabulary on the fallback authority path"* (`remote_schema.sql:1018`) **[carried]**. `W-16`'s FK
> constrains `user_roles.role`; it does nothing about this one, because the column is on a different table
> that only the fallback reads. **`W-20`'s exit criterion should add: no authority path reads a column
> whose CHECK constraint enumerates roles.** That is `RL-12` extended, and it is free once the fallback is
> gone.
>
> **`M2-5` is the reason the deletion is not one file.** `resolveAdminPortalOrgCore.ts` *"re-implements the
> legacy fallback and its own `PORTAL_ROLES`"* (`02…§8`) **[carried]** and serves `requireAdminOrOps` — 147
> route files (`02…§16`). Deleting the fallback from `resolveAdminAccessCore` and leaving the copy is the
> failure mode `RL-12` must catch; it is stated as a static check over *every* module, not over the one the
> workstream started in. `W-41` (§20) is where the duplication itself is removed.

### W-21 — Preview renders from the enforcing code *(S–M · I-22 · closes C11)* — **[M2: split into `W-41` + `W-48`]**

> **[M2 amendment] `W-21` as written closes one of four divergences, and `01…§26` says so.** GAP-7 —
> *"there is no single resolver, and no defined normal form for a role key"* — records that `W-21`
> *"closes preview-vs-runtime only; silent on the third and light resolvers and on normalization"*
> (`01…:1018`) **[carried]**. Since it was written, `02…` found: a **third** resolver (`M2-5`), a **light**
> path serving 147 route files that resolves differently (`M2-13`), and a normalization divergence that lets
> the preview show capabilities every runtime gate denies (`M2-11`). `W-21`'s text below describes the two
> divergences it knew about and remains correct about those.
>
> **This workstream is therefore superseded in place by three:** `W-41` (one resolution function — `M2-5`,
> `M2-13`, `AD-12`), `W-42` (one normalization — `M2-11`, `I-28`ᴬ), and `W-48` (the preview renders from the
> enforcing resolver — `C11`, `IA-4`, `IA-R4`). All three are in §20/§21. `W-21` is **retained, not
> deleted**, because `RL-13` and `01…§26` cite it; treat it as the name of the outcome those three produce.
> Its scheduling advice below — *after `W-8` and `W-20`* — carries forward to `W-48` unchanged.

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
| **F11** **[new]** | any | any | any | **`I-29`ᴬ — revoked between two resolutions, with a warm cache entry in a second process** |
| **F12** **[new]** | a role with `is_active = false` | that role's grants | any | `I-26` — deactivation revokes (`W-25`, `L6`) |
| **F13** **[new]** | any | any | any | **account state** — one principal per lifecycle state (`invitation_pending`, `active`, `suspended`, `locked`, `deactivated`) (`W-26`, `L5`, `07/AI-4`, `07/AI-5`) |
| **F14** **[new]** | `"admin "`, `"Admin"`, `"admin"` | full | any | `I-28`ᴬ — one normal form; preview ≡ runtime on whitespace and case (`M2-11`, `W-42`) |
| **F15** **[new]** | `admin` | full | profile read **errors** | `I-30`ᴬ — every resolver read error denies (`M2-12`, `W-43`); one variant per resolver read |
| **F16** **[new]** | — (unauthenticated) | — | — | `S-1` — one caller per unauthenticated side-effect route family (`W-40`) |

F6, F7 and F10 encode *defects* — they must resolve to denial after their workstream lands, and each is a
regression lock (§13). ~~Build the matrix in **wave 1**~~ **[M2 amendment: wave 1 closed without it.]**
§14.3.6 records that `F1`–`F10` *"do not yet exist as a shared artifact, and waves 2–5 cannot inherit what
was not built"*; `ls web/tests/access/` returns four suites and **no fixture module** at `73f459dae`
**[verified this pass]**. It is now **sixteen** fixtures, and it is the **first item of batch 2** in §3.2 —
ahead of `W-24`, which cannot be tested without `F11`.

> **`F11` is the fixture that changes the QA architecture, not just the matrix.** `02…§19`'s `I-29` check
> and `06…`'s `IA-R5` were written independently and arrived at the same test: *"revoke, then assert denial
> on the next request **in a second process**"* (`01…:1160-1161`) **[carried]**. Nothing in this repository's
> test conventions runs two server processes: `02…§18` establishes the cache is a module-level `Map` — per
> process — so a single-process test **passes for the wrong reason** and would certify `M2-10` as fixed
> while it is live. See §10.5.

### 10.4 Per-wave exit gates

No wave closes without: its tier A checks in CI · its tier B suite green · its tier C suite run and recorded ·
lockout-class workstreams carrying tier D evidence (route, steps, expected vs observed, console errors,
evidence path) · migrations accounted per §11 · regression locks registered.

**[M2 amendment]** Two clauses are added, both because wave 1 closed while satisfying the gate above:

- **A wave does not close while a fixture it was supposed to build is unbuilt.** §14.3.6 records that wave 1
  closed without `F1`–`F10` and that this *"is no longer a scheduling slip but a debt waves 2–5 inherit."*
  The gate is: the fixtures a wave's exit criteria name exist as a shared artifact, not inline in one suite.
- **A wave that ships a check must show the check going red.** `W-4` established the standard —
  *"the lock runs the check against an empty allow-list and asserts it goes red… A check that cannot be
  shown to fail is not evidence"* (§5) **[carried]**. It is promoted here from one workstream's practice to
  the wave gate, because every tier A check in waves 6–12 is vulnerable to the same vacuity.

### 10.5 Two processes — the one new QA capability this plan requires **[new — M2]**

Everything else in §§10.1–10.4 is a matter of writing more of what this codebase already writes. **One
requirement is not**, and it is stated separately so it is not absorbed as a detail of `W-24`.

`I-29`ᴬ — *revocation is effective on the next request* — cannot be verified in one process. `02…§18`
establishes why with three compounding properties **[carried]**: the authority cache is read
unconditionally and written only for portal-eligible principals; `invalidateAdminShellContextCache` has
**zero production callers** (re-verified at `73f459dae` — the only references are its own module and its
own test **[verified this pass]**); and the backing store is a module-level `Map`, so *"an invalidation call
in the process that served the write cannot reach the entry in any other process that served a read."*

Three consequences for the QA architecture:

| # | Consequence | Where it binds |
|---|---|---|
| 1 | **A single-process revocation test passes for the wrong reason.** It exercises a code path that is correct within one process and silent about the mechanism that is broken across processes | `RL-16`; `W-24` exit |
| 2 | **`U-7` decides the shape of the harness, not whether it is needed.** *"Does the platform run more than one server process?"* — `01…§33` says it *"decides whether `AD-11` has a cheap answer or an architectural one"*, and `02…§27` adds: *"Do not let `AD-11` wait on `U-7`; let the **implementation** wait on it"* **[carried]** | `W-23` Q8 |
| 3 | **Tier C gains a two-process mode; it is not a fifth tier.** The harness runs the resolver in two Node processes against one database, warms one, mutates through the other, and asserts denial. It is a fixture and a runner, not a new mechanism | §10.1 tier C |

**If `W-23` Q8 shows a single long-lived process**, the two-process harness is still required — because the
deployment can grow to two without the test noticing, and `S-2` makes the same point about the rate limiter's
per-process `Map` (`01…§17`) **[carried]**. **Both of this platform's security-relevant in-process maps fail
in the permissive direction** (`01…§14.3`), and a test suite that cannot see across processes cannot see
either failure.

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
| M10 | W-19 | Remove dead `owner`/`manager` RLS grants *(if `AD-4`=b)* | shared | No policy loses its only grant |
| **M11** **[new]** | W-33 | Per-org `auth_policy` record — enabled methods, password rules, MFA-by-role, session and trusted-device windows, invitation validity | shared | Table only; every existing org receives the current behaviour as its seeded row, so the migration is behaviour-preserving by construction |
| **M12** **[new]** | W-26 | Account lifecycle state — per `AD-5`, state per `(user, org)` with `locked` per credential | shared | **`L5`.** Row count == `W-23` Q9; every existing `(user, org)` seeds to `active`, or the migration locks the platform out |
| **M13** **[new]** | W-53 | Authority audit store — append-only, actor / timestamp / subject / before / after | shared | Append-only enforced by policy or trigger, not convention (`07/AD-3`); no `UPDATE`/`DELETE` grant to the application role |
| **M14** **[new]** | W-28 | Membership retirement replaces deletion — status column plus backfill | shared | Every existing membership backfills to its current effective state; **no row is deleted by the migration** |
| **M15** **[new]** | W-16 | Drop the duplicate FK on `role_permission_grants.permission_key` (`M2-2`) | shared | Exactly two identical constraints exist before; exactly one after; no grant row loses referential cover |
| **M16** **[new]** | W-20 | Drop `handle_new_user()` — or record why it is retained | shared | `W-0` Q1 re-run: still unattached. **A dropped function cannot be re-attached by a one-line migration; that is the point** |
| **M17** **[conditional]** | W-29 | Grant `admin.users.write` / `admin.roles.write` to the administrator role in every org | shared | **`L7`.** Runs **only if `W-23` Q11 returns any org without a holder.** Must precede the gate repoint, never follow it |
| **M18** **[conditional]** | W-41 / scope | Expiry attribute on the scope record (`AD-21`) and the reusable policy object (`AD-20`) | shared | Runs only if sitting 6 answers (a). `02…§27`: both are *"specify now, build after the resolver"* — so this is registered, not scheduled |

**Every one targets `shared`.** Per [`MIGRATION-APPLY-GATE.md`](../vacilando-os/MIGRATION-APPLY-GATE.md), each therefore
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

~~**Nine migrations remain, not ten.**~~ **[M2 amendment] Seventeen scheduled, two conditional.** Nine from
the accepted plan (`M8` struck) plus `M11`–`M16`; `M17` and `M18` run only on a stated trigger. Each still
requires its own read-only preflight against the target immediately before the authorization ask — W-0's
counts are a 2026-07-31 snapshot, not a standing warrant, and they are now nine days old. The trusted host
action (`database.read_census`) is the channel for those preflights; none of them needs an operator to
handle a credential.

> **[M2 amendment] Three of the new migrations are lockout-class and one is self-locking.** `M12` seeds the
> account-state table that `W-26` will then *enforce*: an incomplete seed denies every principal it missed,
> on every request, in every org (`L5`). `M14` converts deletion to retirement, and a partial backfill leaves
> memberships in no state at all. **`M17` is the one to read twice**: it exists to prevent `L7`, so it must
> run *before* `W-29`'s gate moves — and if `W-23` Q11 shows the grant is already universal, `M17` does not
> run at all. **A migration that is conditional on a census must not be written before the census answers**,
> or it acquires a `WHERE` clause nobody can justify. §2's four-step ritual applies to `M12` and `M14`
> unchanged: seed, dual-read, prove zero, switch.
>
> **`M13`'s preflight is different in kind.** Every other preflight asks *"will this migration apply
> safely?"* `M13`'s asks *"is there already an audit store?"* — which is `W-23` Q7, and `U-2` records that
> **no document in this corpus has ever assessed whether authority changes are audited at all**
> (`01…§26`, GAP-10) **[carried]**. `M13` cannot be sized, let alone written, before Q7 answers.

**This phase applies no migration and writes no SQL.** The register is a plan.

---

## 12. Decision gates — **[M2: superseded by §24]**

> **[M2 amendment] These four are 4 of 21, and the framing below is true of them and false of the others.**
> `02…` Part III consolidates the corpus's decisions into one register of **twenty-one open questions**
> across six documents, grouped into six sittings (`AD-1`…`AD-21`) **[carried]**. `D1`–`D4` below are
> `AD-1`–`AD-4`, unchanged in number under `02…§26.2`'s rule, so **every citation in this section still
> resolves.** Read §24 for the full register, the sittings, and what each releases.
>
> The one sentence below that does not generalize is *"None blocks the model; each blocks specific work."*
> `02…§28` says so directly: *"It is **not** true of sitting 1: `AD-11` does not block work, it describes a
> defect that is live in the product now"* (`02…:1485-1488`) **[carried]**. §1.4 makes that a sequencing
> rule.

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
| **RL-1** | No route gates on `access.ok` alone | A + B | G2 / W-1 | **LIVE** — `web/tests/access/analyticsRouteGates.test.ts` (tier B; the tier A half lands with W-14) |
| **RL-2** | Every grid key exists in the catalog *(superseded by RL-3)* | B | C5 / W-3 | **LIVE** — `web/tests/admin/permissionGrid.test.ts` |
| **RL-3** | The grid is generated; no literal key list in UI source | A | I-14 / W-10 | proposed |
| **RL-4** | Membership creation writes a profile row atomically | C | G4 / W-5 | proposed |
| **RL-5** | Absent profile denies; never `all` | C | I-19 / W-7 | proposed |
| **RL-6** | No role literal appears in `accessScope.ts` | A | C8 / W-8 | proposed |
| **RL-7** | Exactly one FK on `role_permission_grants.permission_key` | A | C3 / W-9 | proposed |
| **RL-8** | No `SELECT` over the catalog in a grant seed | A | G5 / W-12 | proposed |
| **RL-9** | No hard-coded portal role set (`PORTAL_ROLES`, `ALLOWED_ROLES`) | A | C6 / W-13 | proposed |
| **RL-10** | Every exported **handler** appears in the declared capability table | A | C1 / W-14 | **LIVE** — `web/tests/access/routeCapabilityDeclaration.test.ts` (11 tests, five of them negative fixtures) + `prebuild`. Subject is the handler, not the file: §8's execution record measures the file grain as blind to 31% of the surface |
| **RL-11** | A principal cannot modify its own authority | B + C | G3 / W-2 | **LIVE (tier B)** — `web/tests/access/selfAuthorityMutation.test.ts`, covering all three self-authority paths |
| **RL-12** | No authority path reads `user_profiles.role` or `app_users.role` | A | §2.1 / W-20 | proposed |
| **RL-13** | Preview and runtime resolve identically across the fixture matrix | C | C11 / W-21 | proposed |
| **RL-14** | No `sort()` over `org_id` on an authority path | A | I-7 / W-22 | proposed |
| **RL-15** | No route holds a service-role client without resolving a principal or a reviewed exception; the exception lists only shrink | A | G6 / W-4 | **LIVE** — `web/scripts/checkServiceClientPrincipal.mjs` in `prebuild`, locked by `web/tests/access/serviceClientPrincipalCheck.test.ts` |

RL-2 is listed *because* it is temporary: W-3 adds it and W-10 replaces it. An assertion that becomes
structurally unnecessary should be replaced deliberately, not quietly deleted when it starts failing.

> **[M2 amendment] Four of fifteen are live, and the register continues at `RL-16` in §25.** `01…§27` scores
> output #12 as *"stale with #10 — 4 of 15 regression locks live"* **[carried]**; all four
> (`RL-1`, `RL-2`, `RL-11`, `RL-15`) were confirmed present at `73f459dae` **[verified this pass]**. §25 adds
> `RL-16`…`RL-42` for waves 6–12, the `IA-R` requirements, the `S-n` security invariants, and — `S-7` — the
> controls that currently **hold**.
>
> **Read `RL-16` before writing any lock against an `I-` number.** `01…§18` (`X-1`) establishes that
> `I-28`…`I-31` each denote **two** invariants: *"a lock written against `I-29` is currently ambiguous
> between revocation latency and password step-up — two different tests, in two different waves"*
> **[carried]**. §25 uses the ᴬ/ᴮ superscripts throughout and §26 escalates the renumbering. **No lock in
> this document cites a bare colliding number.**

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

> **[M2 amendment] The claim "all 21 rows of phase 2's divergence register are assigned above" was true and
> is no longer sufficient.** The register grew: `01…§29` establishes that **53 finding IDs** were created
> after this section was written and **none of them is named anywhere in this plan** — the very sentence
> above is what makes the omission invisible, because it reads as a completeness claim. §23 replaces it with
> a coverage table over the whole corpus.
>
> Two of the four rows below have moved:
>
> - **`I-4` is now verified met.** `01…§14.1` re-derived the delegated-link token properties end to end —
>   unguessable (256-bit CSPRNG), SHA-256 at rest, revocable, expiring, tenant-bound, fails closed on read
>   error, non-enumerating — and calls it *"the only end-to-end authorization path in the platform that
>   this pass could not fault… the internal standard V2 should be held to"* **[carried]**. It closes `I-4`,
>   which had been carried unverified since acceptance. **Two residuals**, both S4: `token_prefix` stores 12
>   plaintext characters at mint (`S-3` — declare it or stop storing it), and `timingSafeEqualHex` is
>   defined and used nowhere on this path. Both attach to `W-40` (§19).
> - **`I-21` is still carried unverified**, through a third pass. `01…§33` lists it as `U-8` — *"one of two
>   invariants never re-derived"* **[carried]**. It stays attached to `W-15`.
>
> **`S-7` is the new obligation this subsection implies.** *"Every control this matrix records as **holding**
> MUST have a regression lock before V2 ships. The public surface is currently the platform's
> best-implemented boundary **and its least-tested one**"* (`01…§17`) **[carried]**. `I-4`'s newly verified
> properties and the two webhook signature families (`T-15`) are exactly that: things that work, and that
> nothing prevents from degrading. `RL-32` (§25) is the lock.

---

## 14. Scope, risks, limits — **of the accepted plan**

> **[M2 amendment]** §§14.1–14.3 are the accepted plan's scope boundary, risk register and limits, carried
> unchanged. **This revision's own limits are §27**, and they are different in kind: the accepted plan's
> limits are about the product it could not see, while this revision's are about the corpus it is
> sequencing. Two rows below have been overtaken by later documents and are annotated in place: §14.1's
> *"shipping Access & Identity UI"* boundary (wave 11 changes what four built chapters *say*, which is not
> what that clause excluded) and §14.3.6's fixture-matrix debt (now §10.3, sixteen fixtures, batch 2).

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
3. ~~**Wave 0 is a plan for queries, not their results.**~~ **RESOLVED 2026-07-31.** Wave 0 executed; its
   counts are in §4 and have been applied. The reordering it produced: W-20 stays in wave 5 (G1 latent), M8 is
   struck, and L2/L3/L4 have empty remediation sets. Waves 2 and 5 are no longer gated by W-0. The counts are
   a snapshot — each lockout-class switch and each §11 preflight must re-run the census rather than cite it.
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
8. **No effort is budgeted for governance-doc reconciliation.**
   `docs/platform/governance/roles-and-permissions.md` is `status: canonical` and states a rule the code does
   not follow, with a dead "Expanded reference" pointer (phase 2 §15.6). It should land with W-15, and is not
   sized here.

---

## 15. Provenance

- **Inputs:** [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (findings and counts),
  [`02-canonical-access-identity-model.md`](./02-canonical-access-identity-model.md) (invariants I-1…I-25,
  divergence register §13, decisions D1–D4), and
  [`MIGRATION-APPLY-GATE.md`](../vacilando-os/MIGRATION-APPLY-GATE.md) (shared-apply protocol).
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

Evidence: [`wave1-execution-evidence.json`](../vacilando-os/qa/access-identity-v2/wave1-execution-evidence.json) — red/green counts, the
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

Evidence: [`w4-service-client-principal-baseline.json`](../vacilando-os/qa/access-identity-v2/w4-service-client-principal-baseline.json) — the
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

---
---

# Part II — Waves 6–12 **[new — Mission 2]**

> Everything above this line is the accepted plan, carried with amendments. Everything below is new work,
> sequenced from the material that landed after the accepted plan was written: `01…` Parts II and III
> (threat matrix, gap analysis), `02…` Parts II and III (resolution model, decision register), `04…`
> (authentication model), `05…` (surface & capability catalog) and `06…` (product IA & flows).
>
> **Every finding, requirement, invariant and decision cited below is [carried] from its owning document.**
> No product defect is asserted here that an earlier document did not establish. Sizings are this phase's.

---

## 16. Wave 6 — Revocation and the credential lifecycle

**Closes GAP-1** — *"revocation is not a capability this platform has"* — and GAP-10's atomicity half.
**Both of the corpus's `S1` threats live here** (`T-1`, `T-2`). Sitting 1 (`AD-6`, `AD-10`, `AD-11`,
`AD-16`) gates four of the five workstreams; `W-28` is gated by nothing.

`01…§29` describes this wave before it existed, including its exit test: *"a coherent wave with a single
exit test — **revoke, then assert denial on the next request in a second process** — which `02…§19` and
`06…` (`IA-R5`) independently arrived at"* (`01…:1158-1161`) **[carried]**. That sentence is this wave's
specification, and §10.5 is the harness it requires.

**Why this wave is first among the unshipped** (§1.4): `01…§20` — *"an access-control product in which
'remove this person' does not remove them fails at its stated purpose, independently of any attacker"*
**[carried]**.

### W-24 — Revocation is effective on the next request *(M · `I-25`, `I-29`ᴬ · lockout-adjacent · needs `AD-11`)*

`loadAdminAccessBundleOnce` reads a module-level `Map` before it touches the database; the write happens
only for portal-eligible principals; `invalidateAdminShellContextCache` has **zero production callers**
(`02…§18`, `M2-10`) **[carried]**, re-verified at `73f459dae` — the only two references in the repository
are its own module and its own unit test **[verified this pass]**. A removed principal passes every gate
built on `loadAdminAccessBundleCached` for **up to 120 seconds**, in each process holding a warm entry,
*after* the operator has been told the removal succeeded.

Under `AD-11`'s recommendation — *zero latency; drop the cross-request cache from the authority path*
(`02…§20`) **[carried]** — this workstream is a **deletion**, and that is what makes it `M` rather than `L`:
the per-request React `cache()` memo already collapses repeated resolution within a request, which is where
the measured cost was. Under the alternative reading it is a build: a shared store, keyed on every authority
input, invalidated synchronously by every authority write, and **never read by a mutation gate**.

**The mutation-gate clause is not optional under either reading.** `02…§18` establishes that the cache is
read by `requireUsersRolesManageAuth` and therefore by every Settings/RBAC **mutation** route, while the
module's own header says *"Mutations must not rely on this cache for authorization"* — *"Nothing enforces
that sentence"* **[carried]**. Whatever `AD-11` decides, the enforcement of that sentence is a static check.

**QA.**
- Tier C, **two processes** (§10.5, fixture `F11`): resolve a principal in process A (warming it), revoke
  through process B, resolve again in **both** — assert both deny. `02…§19`: *"it must run in two processes,
  or it passes for the wrong reason"* **[carried]**.
- Tier C: the same, for demotion (`role/route.ts`) and scope narrowing (`access-scope/route.ts`) — `02…§18`
  records the window applies to all three.
- Tier A: no authority decision reads a cross-request in-process store; every authority-write route appears
  in a list of routes that invalidate (or the store does not exist).
- Tier B: `IA-R5` — the removal endpoint's success response is not returned before the effect holds.

**Exit.** A revocation performed in one process denies in every process on the next request. `RL-16`,
`RL-17`.

### W-25 — Role deactivation revokes *(M · `I-26` · lockout class `L6` · needs `AD-10`)*

`role_definitions.is_active` is honoured on assignment (`role/route.ts:33`) and **ignored on resolution**
(`resolveAdminAccessCore.ts:89-94`) — `02…§4.4`, `M2-3` **[carried]**. Deactivating a role blocks new
assignments and leaves every existing holder fully capable. `02…§10`'s recommendation: *"revoke. An operator
toggling a role inactive is making a security decision, and the current behaviour makes it a documentation
decision"* **[carried]**.

**`L6`, and `W-23` Q10 sizes it.** Every principal holding a currently-inactive role loses those
capabilities at the switch. If Q10 is zero this is a no-op today and a lock for tomorrow; if it is non-zero
it is a behaviour change for a named population — identify and announce, exactly as `W-0` Q6 required of
`W-8` (§6).

**The alternative reading has a cost the product must pay.** `02…§10`: *"'inactive means unassignable, not
revoked' is defensible only if the UI says so at the point of the toggle, which it does not"* **[carried]**.
Under `AD-10(b)`, this workstream becomes a copy change on the Roles chapter — and `IA-R1` then applies to
it, because the toggle would be asserting a meaning the system does not implement.

**One enforcement point, not two.** `04…§7`: `AD-6` and `AD-10` *"should be decided in one sitting, and
`I-26` and `I-30` implemented against one enforcement point, or the platform will acquire a second
inactive-means-nothing flag"* **[carried]**. `W-25` and `W-26` therefore share the resolver-side check.

**QA.** Tier C (`F12`): deactivate a role held by a fixture principal; assert its capabilities disappear
from the next resolve, in both processes. Tier B: the resolver consults `is_active` on the grant path.
**Exit.** No capability resolves from an inactive role. `RL-18`.

### W-26 — The account lifecycle, and the credential-disable command *(L · `I-30`ᴮ · lockout class `L5` · needs `AD-5`, `AD-6`)*

**The largest new item in the plan, and the one that cannot be split.** `04…§2.1` establishes that
`auth.admin.deleteUser`, `auth.admin.updateUserById` and `ban_duration` return **zero** occurrences across
`web/` — re-verified at `73f459dae` **[verified this pass]**. *"Alloy can mint a credential and mail a
recovery link. It has no code path that disables one"* **[carried]**. `04…§2.2` adds that non-revocation is
now *documented in code as intended behaviour*, and `01…§14`'s `T-2` rates the consequence **`S1`**: any
live session may re-key the credential, and the platform cannot then disable it.

Three parts, in order:

1. **The state machine** — `04…§5`'s, carried unchanged in shape: `draft → invitation_pending → active`;
   `active ⇄ suspended`; `active → locked → active`; `active|suspended|locked → deactivated`. Per `AD-5`,
   state lives per `(user, org)` and `locked` is per-credential and short-circuits every org, *"so an org
   admin cannot lock a credential they do not own"* **[carried]**. Migration `M12`.
2. **The credential-level effect of each state**, which is what makes this more than a status column
   (`04…§5.2`) **[carried]**:

   | State | Membership effect | Credential effect | Live sessions |
   |---|---|---|---|
   | `suspended` | capabilities suppressed | retained | **must stop resolving** |
   | `locked` | capabilities suppressed | retained, sign-in refused | **must stop resolving** |
   | `deactivated` (this org) | membership retired | retained if other orgs remain | stop resolving for this org |
   | `deactivated` (last org) | — | **credential disabled — an explicit revocation call** | all sessions invalidated |

   *"The last row is the one with no implementation today, in either direction… It must be built as a
   command, not inferred from a row deletion"* **[carried]**.
3. **Enforcement per request, in the resolver** (`04…§5.1`): *"a session is valid only when account state is
   `active`, checked server-side on every authenticated request, not at sign-in"*, and it belongs beside
   org/role resolution *"so UI paths and API routes inherit it."* This is load-bearing for a second reason —
   with `/api/*` unmatched by middleware, **the resolver is the only place a state check reaches the API
   surface at all** **[carried]**.

**`L5`, and it is the most dangerous switch in the plan.** Step 3 denies any principal whose state is not
`active` — including any principal `M12` failed to seed. `W-23` Q9 sizes the seed; the §2 ritual runs in
full; tier D evidence is mandatory.

**QA.** Tier C (`F13`, one principal per state): each non-`active` state denies on the next request in both
processes. Tier C: last-org deactivation disables the credential — assert sign-in fails afterwards, which is
the rubric's `07/AI-5`, *"the highest-value single test in this rubric"* (`07…§3.1`) **[carried]**.
Tier B: the disable command exists, is called exactly once per last-org deactivation, and is not reachable
by a principal acting on itself (`W-2`'s guard extends here). Tier D: one browser pass per transition.
**Exit.** Every lifecycle transition has a credential-level effect that is exercised by a test. `RL-19`,
`RL-20`.

### W-27 — Step-up on credential change *(M · `I-29`ᴮ · needs `AD-16`)*

`/reset-password` admits on **any** session (`:22-27`) and calls `updateUser({ password })` (`:50`) with no
current-password proof and no re-authentication — `04…§3.2`, `A2-4` **[carried]**. `01…§14` rates the
composite **`S1`** (`T-2`): *"session possession → permanent account ownership"*, because the platform
cannot then disable the credential.

`AD-16`'s recommendation is a **split**: a recovery-type session for the reset flow, the current password
for an in-session change — *"because `/reset-password` currently serves both from one unverified session
check"* (`04…§7`) **[carried]**. The split is the work; neither half is large.

`I-34` travels with it: *"password policy MUST be enforced server-side. A policy expressed only in a submit
handler is advisory and MUST NOT be cited as a control"* (`04…§6.3`) **[carried]** — today's `length >= 6`
lives in a submit handler (`reset-password:42-45`). That is `W-31`, and `W-27` must not ship a step-up that
gates a password the server would accept at any strength.

**QA.** Tier C: a plain authenticated session cannot re-key; a recovery-type session can; an in-session
change without the current password is refused. Tier B: the two paths are distinct functions with distinct
preconditions.
**Exit.** Session presence alone does not authorize re-keying. `RL-21`.

### W-28 — Atomic authority writes; removal becomes a transition *(M · `I-31`ᴬ · closes GAP-10's atomicity half)*

Two defects, one fix, and neither needs a decision:

- **`M2-14`** — role reassignment is `delete` then `insert` with no transaction; *"a failed insert leaves the
  principal with **zero** memberships"* (`02…§18`, `role/route.ts:44-50`) **[carried]**. `01…§14` rates it
  `T-13`.
- **`04…§5.3`** — *"removal must become a transition, not a delete."* `remove/route.ts:26-30` deletes the
  membership row, *"which destroys the audit trail of the relationship along with the access. A lifecycle
  that ends in a `DELETE` cannot answer 'was this person ever an operator here, and who ended it?' — which
  is the first question asked after any incident"* **[carried]**.

`W-5`'s atomic RPC is the mechanism for the first; `M14` is the schema for the second. **Do them together**:
retirement-instead-of-deletion is what gives `W-53` something to audit, and an untransacted retirement has
the same failure mode as an untransacted reassignment.

`IA-6` is the operator-facing half — *"one lifecycle action exists, it is a delete, and it reports success
inside a window where it has not taken effect"* (`06…§4.6`) **[carried]**. The window is `W-24`'s; the
delete is this workstream's; the report is `IA-R5`. **All three must land before the toast is true.**

**QA.** Tier C: fail the `insert` in `PATCH /users/[userId]/role`; assert memberships are unchanged
(`02…§19`'s `I-31` check). Tier C: retire a membership; assert the row persists with a terminal state and
that authority no longer resolves. Tier A: no authority path issues a bare `DELETE` on a membership table.
**Exit.** No authority write can leave a principal in a state no operator chose. `RL-22`.

---

## 17. Wave 7 — The delegation gradient

**Closes GAP-8.** One workstream, one decision, and it ships without the design question beside it.

### W-29 — The users-and-roles gate reads the key the seed withholds *(S · `I-11` · lockout class `L7` · needs `AD-9`)*

In any default-seeded org, `ops` holds `settings.users_roles` and can therefore invite users, change any
other principal's role **including to `admin`**, create roles and rewrite grants. The seed's only attempt to
prevent this withholds two keys — `admin.users.write` and `admin.roles.write` — that **nothing reads**:
zero repo matches (`02…§4.5`, `M2-4`; `01…§14`, `T-4`) **[carried]**. `01…§14` rates it `S2` and names the
consequence plainly: *"`ops` is `admin`."*

`AD-9`'s recommendation: point `requireUsersRolesManageAuth` at `admin.users.write` / `admin.roles.write`,
and keep `settings.users_roles` for read and lesser settings management — *"a small change that makes an
existing seed decision effective"* (`02…§10`) **[carried]**.

**Why it is its own wave rather than part of `W-18`.** `01…§30` and `02…§27` both state it: `AD-9`'s fix
*"is independent of `AD-3` and should not wait"* **[carried]**. `W-18` encodes the subset rule and needs
`AD-3`; `W-29` moves one gate to a key that already exists. They are decided in one sitting and shipped
apart.

**`L7` — the self-locking one.** See §2. Nothing currently reads these keys, which means nothing has ever
been observed to *grant* them either. **`W-23` Q11 must confirm a holder in every org before the gate
moves**; if any org has none, `M17` grants it first. `W-29` ships with a documented break-glass path,
because the surface that would repair a mistake here is the surface the mistake disables.

**Residual, stated so it is not assumed shut.** `W-2`'s execution record (§5) notes that
`PUT /api/admin/rbac/grants` can still widen the caller's **own role's** grants — *"self-elevation by a
different route (role-level rather than membership-level)"* **[carried]**. `W-29` does not close it;
`W-18` does. A principal repointed away from `settings.users_roles` can still hold `admin.roles.write` and
rewrite its own role's grants until the ceiling exists.

**QA.** Tier B (`F9`): a principal holding `settings.users_roles` but not `admin.users.write` is denied
every user- and role-management route; a principal holding the new key is allowed. Tier C: an `ops`
principal in a default-seeded org cannot promote anyone to `admin`. Tier A: `canManageUsersAndRoles.ts`
contains no role literal — `02…§19` records that `canManageUsersAndRoles.ts:16` fails the `§15.3`
composition rule today **[carried]**.
**Exit.** The seed's privilege gradient is effective; `ops` cannot promote itself or anyone else to `admin`.
`RL-11` extended.

---

## 18. Wave 8 — Authentication

**Closes GAP-2** — *"the gap with no workstream at all"*, and the brief's single largest ask. `01…§29`:
*"the whole of `04…§6`, which has no workstream because `03` was sequenced before `04` existed"*
**[carried]**. Sitting 3 (`AD-5`, `AD-7`, `AD-8`, `AD-14`, `AD-17`, `AD-18`) gates six of eight
workstreams; **`W-30`, `W-31` and `W-32` wait on nothing.**

The state, from `01…§28.1`, scored against the brief's eleven named capabilities **[carried]**:
**1 implemented · 2 test-only · 1 partial · 1 default-only · 6 absent** — plus the brief's stated baseline,
the show/hide control, at *three password inputs and zero reveal toggles*, re-verified at `73f459dae`
**[verified this pass]**.

> **Until sitting 3 is held, this wave cannot be sized** — `02…§28`: *"six decisions gate an entire
> unplanned wave; until they are answered `03` cannot even size it"* **[carried]**. `W-30`–`W-32` are sized
> here because they depend on no decision. `W-33`–`W-37` carry a size **band**, and the band is honest
> rather than a placeholder.

### W-30 — The show/hide baseline *(S · `IA-R10` · `07/AU-2` · no decision)*

Three password inputs (`login/page.tsx:203`, `reset-password/page.tsx:157`, `:175`), **zero** reveal
toggles — **[verified this pass]** at exactly those three lines. The brief calls it *"a straightforward
required baseline"*; `04…§6.2` calls it *"the cheapest item in the corpus"* and says it *"should not be
sequenced behind auth-method work"*; `06…§7` carries `IA-R10` unchanged **[carried]**.

Build one shared password input: defaults hidden; the toggle is a real button with an accessible label,
keyboard reachable; never auto-reveals; revealed state never persisted or logged (`04…§6.2`) **[carried]**.

**QA.** Tier A: no bare `type="password"` outside the shared component — the check `07/AU-2` names. Tier B:
the component's toggle behaviour, including that the revealed state is not persisted.
**Exit.** Every password field in the product offers show/hide, from one component. `RL-37`.

> **This is the single cheapest item in the corpus and it is in batch 2 for that reason.** It is also the
> clearest instance of §1.4: it was unscheduled for eight days not because it was hard or blocked, but
> because the wave it belonged to did not exist.

### W-31 — Password policy is enforced server-side *(S–M · `I-34` · `07/AU-3` · no decision)*

`length >= 6`, client-side only, in a submit handler (`reset-password:42-45`) **[carried]**; the server
accepts anything. `07…§3.3` pairs it with `W-30`: *"`AU-2` and `AU-3` are cheap and should land first…
`AU-3` closes a real hole"* **[carried]**.

Policy fields belong on `W-33`'s per-org record (min length, complexity, reuse, expiry); **the enforcement
point does not wait for the record.** Ship a server-side validator with the current values as defaults, and
let `W-33` make them configurable.

**QA.** Tier C, the check `07/AU-3` names: a direct API call with a weak password is rejected. Tier B: the
validator, including the boundary values.
**Exit.** A policy expressed only in a submit handler no longer exists. `RL-38`.

### W-32 — Authentication error text stops leaking the provider *(S · `I-33`, `S-4` · no decision)*

`04…§6.3` `I-33`: *"authentication error text MUST NOT surface provider strings verbatim; the sign-in path
MUST match the anti-enumeration discipline already applied at `send-password-reset:35-37`"* **[carried]**.
The raw provider error is rendered to the user at `login/page.tsx:80` **[carried]**.

`S-4` is the same rule at the unauthenticated boundary: *"an unauthenticated response MUST NOT contain
provider or exception strings"*, failing today at `field-definitions/route.ts:133` and
`booking-config/route.ts:129` (`01…§17`) **[carried]**. **The discipline exists in this codebase and is
unevenly applied** (`01…§14.2`) — which makes this a consistency fix, not a design.

**QA.** Tier A: no `catch` on a publicly reachable route serializes `e.message`; the sign-in path renders a
fixed string. Tier B: the sign-in error mapper.
**Exit.** One anti-enumeration discipline, applied at both boundaries. `RL-29`. *(`W-39` carries the two
public routes; `W-32` carries the sign-in path.)*

### W-33 — The per-org authentication policy record *(M–L · `07/AU-1` · needs `AD-5`, `AD-7`, `AD-8`)*

`04…§6.1`: a per-org `auth_policy` record selects from a **code-owned catalog** — *"configuration steers,
code owns which methods can exist and how each is verified"* **[carried]**. Fields: enabled methods,
password rules, MFA requirement by role, session lifetime and idle timeout, trusted-device window,
invitation validity window and resend limits.

`01…§0` records that **no `supabase/config.toml` is in version control** (`A2-5`) **[carried]**, so today's
policy is an unversioned hosted default. `M11` is the record; seeding every org with current behaviour makes
the migration behaviour-preserving.

`AD-8` bounds the scope: *"specify the policy shape so it is not precluded; do not build it"* for SSO/SAML,
which `04…§7` calls *"the one method here that materially changes tenancy and provisioning"* **[carried]**.

**QA.** Tier C, per `07/AU-1`: change a policy field for one org; assert the change is enforced for that org
and not another. Tier A: no authentication decision reads an environment variable the policy record owns.
**Exit.** Authentication methods are organization-configurable, from one record, with the code owning the
catalog.

### W-34 — The request-identity verification mode is asserted *(S–M · `I-31`ᴮ · needs `AD-17`)*

`cachedAuthSession.ts:22-27` prefers a JWT-claims fast path whose verification strength *"depends on
unversioned hosted signing-key configuration"* (`04…§3.3`, `A2-5`; `01…§14`, `T-18`, rated **`S?`**)
**[carried]**. `U-4` records that the repository cannot answer what the current mode is, and `01…§33` notes
*"every session-security statement in `07` depends on it"* **[carried]**.

`AD-17`: assert **local JWKS verification with asymmetric signing keys**, *"and add a test that fails if the
posture changes"* (`04…§7`) **[carried]**. The workstream is the assertion and the test; the decision is
which posture is being asserted.

**QA.** Tier C: a token signed by the wrong key is rejected on the fast path. Tier A: the verification mode
is read from a declared constant, and the test fails if it changes.
**Exit.** `T-18`'s `S?` rating resolves to a stated, tested contract. `RL-39`.

### W-35 — Abuse control becomes a declared property *(M · `S-2` · needs `AD-14`)*

There is **no authentication rate limit, no attempt counter and no lockout anywhere in application code**
(`04…§2.1`; `01…§14`, `T-17`) **[carried]**. The one limiter that exists covers three tour routes, is
per-process — *"serverless: not global across instances"*, its own comment — and keys its bucket on
`kind:ip:hash(token)`, so **each candidate token gets a fresh bucket**: it does not rate-limit token guessing
at all (`01…§14.3`) **[carried]**. The public **forms** family has no limiter.

`S-2` is the invariant: *"abuse control MUST be a declared property of a route, not an ad-hoc helper, and
MUST NOT rely on per-process state where the deployment runs more than one process"* **[carried]**.

`AD-14` decides scope. Its recommendation — *"yes for credential and unauthenticated surfaces; explicitly
out of scope elsewhere, **in writing**"* — makes the *"in writing"* clause part of the deliverable
(`01…§19`) **[carried]**. **The asymmetry to fix first** is `T-12`: Alloy can mail a reset link to an
arbitrary address with no rate limit *and* no membership check. `W-35` supplies the volume bound; `W-38`
supplies the membership bound; *"neither alone closes the asymmetry"* (`02…§27`) **[carried]**.

**QA.** Tier A: every unauthenticated route declares a limit; no limiter's backing store is a module-level
`Map`. Tier C: the credential surfaces refuse after the declared threshold, across processes (§10.5).
**Exit.** Abuse control is a declared, cross-process property with a written scope boundary. `RL-31`.

### W-36 — MFA policy by role *(M–L · `07/AU-4` · needs `AD-7`)*

`mfa.` returns **zero** occurrences (`04…§6.1`) **[carried]**. `AD-7`: *"operators first, policy-by-role; do
not couple to parent/guardian"*, because that coupling pulls in SMS OTP, itself absent (`04…§7`)
**[carried]**. Depends on `W-33`'s record and on `W-26`'s state — `04…§6.1` notes MFA policy *"depends on §5
state and role."*
**QA.** Tier C, per `07/AU-4`: a role required to hold a factor cannot complete a session without one.
**Exit.** MFA is a policy field with an enforcement point, not a capability list.

### W-37 — Session and trusted-device policy *(M · `07/AU-5` · needs `AD-5`)*

Provider defaults today, **unversioned** (`04…§6.1`, `A2-5`) **[carried]**. Session lifetime, idle timeout
and trusted-device window become `W-33` fields with server-side enforcement.
**QA.** Tier C, per `07/AU-5`: an idle session past the configured timeout is refused; a trusted-device
window expires.
**Exit.** Session policy is configurable and enforced, not inherited.

---

## 19. Wave 9 — Tenancy and the unauthenticated surface

**Closes GAP-11's two unplanned holes** and takes `W-4`'s frozen baseline off the shelf. Sitting 4
(`AD-13`, `AD-15`). `01…§26` records that `W-22` covers `I-7` only, and *"the other two have none"*
**[carried]**.

> **This wave inherits the corpus's best-defended boundary and its least-tested one.** `01…§15`: **B6 — the
> boundary facing the open internet, with no session, no role and no membership — is the only column in the
> enforcement matrix without an `N`.** B2, which every operator command crosses, has seven **[carried]**.
> Three of this wave's four jobs are therefore *locks on things that work* (`S-7`), and one is a real hole.

### W-38 — The credential-mail primitive is bounded by the caller's org *(S · `I-28`ᴮ · needs `AD-15`)*

`POST /api/admin/send-password-reset` takes an arbitrary email as a raw body string, performs **no
membership lookup**, and gates on the legacy literal `ctx.role !== "admin"` (`04…§3.1`, `A2-3`; `01…§14`,
`T-12`) **[carried]**. `AD-15`: resolve the target to a principal with a membership in `access.orgId` and
404 otherwise, and move the gate to the capability helper every sibling route uses — *"small, independent
of `AD-5`–`AD-8`, and should not wait for the lifecycle work"* (`04…§7`) **[carried]**.

Two fixes in one route: the tenancy bound (`AD-15`) and the role literal (`M2-7` site 5). Both are one line.

**QA.** Tier B: a target outside the caller's org returns 404, indistinguishable from a target that does not
exist. Tier C: the mail primitive is not reachable for a cross-org address. Tier A: the route names no role
literal.
**Exit.** No credential command takes an unbounded target. `RL-27`.

### W-39 — The public surface is inside the tenancy model *(M · `S-6`, `S-4`, `S-5` · needs `AD-13`)*

`GET /api/public/field-definitions` and `GET /api/public/booking-config` run with the service-role client
and take their org from `process.env.ALLOY_PUBLIC_ORG_ID` (`01…§14.2`, `T-16`) **[carried]**. The org is
**not attacker-controllable**, which is why this is `S4` and not a cross-tenant read — but *"the public
surface is single-tenant by environment variable… the only tenancy mechanism in the platform that is not a
request property"* **[carried]**.

Three fixes, all in `01…§14.2`, all small **[carried]**:

| # | Fix | Invariant |
|---|---|---|
| 1 | Derive the org from the request — host, public-surface token, or an explicit path segment — and delete the env coupling | `S-6` |
| 2 | Apply the visibility predicate to **every** projection in the response: `field_definitions` is filtered by `is_visible_in_public_booking`; the `field_section_definitions` query beside it has **no such predicate**, so every section label and description reaches an unauthenticated caller | `S-5` |
| 3 | Stop serializing raw exception messages to unauthenticated callers (`:133`, `:129`) | `S-4` |

`AD-13`'s cost clock (§1.5): *"small **now**, and becomes a migration once a second tenant has a public
surface"* **[carried]**. Under `AD-13(b)` — single-tenant by design — fixes 2 and 3 still ship, and the
constraint becomes something *"the product should say so and… should be visible to operators"* (`01…§19`).

**QA.** Tier A: no request handler reads an org identifier from `process.env`; no `catch` on a public route
serializes `e.message`. Tier C: two orgs with public surfaces resolve independently.
**Exit.** Tenancy is a property of the request everywhere. `RL-28`, `RL-29`.

### W-40 — Every unauthenticated side-effect route authenticates its sender *(M · `S-1`, `S-3` · no decision)*

`S-1`: *"any endpoint that accepts a request from an unauthenticated party and produces a side effect MUST
authenticate the sender before the side effect — by signature, by hashed token, or by an explicit, reviewed
exemption. **Held today** by both webhook families and the delegated-link family; V2 must make it a
property, not a pattern"* (`01…§17`) **[carried]**.

**It is not held by five routes, and they are named.** `W-4`'s frozen baseline (§5): five `book-v2`
public-funnel routes that accept a caller-supplied row id from the request body and then read or write
**that row** with a service-role client — *"no token, no principal, and no binding of the id to anything the
caller has proven… The id is unguessable, which is **obscurity, not authorization**"* **[carried]**. `W-4`'s
own record calls it *"a larger live exposure than anything wave 1 closed."*

The remedy is stated and is already this codebase's pattern: a bearer capability for the in-progress quote —
the `action_links` model the other 21 exceptions rest on — or re-deriving the ids server-side **[carried]**.

**Plus the `S-7` locks on what holds.** `01…§14.1` verified the delegated-link token end to end and
`§14`'s `T-15` verified both webhook signature families. Both must acquire regression locks here
(`RL-30`, `RL-32`), and `T-14`'s two S4 residuals resolve: **`S-3`** — `token_prefix` stores 12 plaintext
characters at mint, *"declared, bounded, and justified against the remaining entropy"* or removed — and the
note that `timingSafeEqualHex` is defined and used nowhere on this path, *"a reader may conclude a
constant-time compare is in force when the actual defence is the lookup shape"* **[carried]**.

**QA.** Tier A: enumerate routes reachable without a session; assert each verifies a signature, resolves a
hashed token, or appears in a reviewed exemption list — the `W-4` allow-list shape, and its ratchet
(*"all three lists may only shrink"*). Tier C (`F16`): per family — token expiry, replay, cross-subject,
cross-org; webhook signature rejection before any side effect.
**Exit.** The `baseline` list in `serviceClientPrincipal.allowlist.json` is **empty**, and the controls that
hold are locked. `RL-30`, `RL-32`.

---

## 20. Wave 10 — One resolver, one normal form

**Closes GAP-7**, GAP-3's read-error leg, and GAP-6's application-code residue. `AD-12` gates `W-41`;
nothing gates `W-42` or `W-43`; `AD-4` gates only `W-44`'s SQL half.

`02…§16` establishes the shape of the problem: **one resolver, one-and-a-half copies, five entry points**
**[carried]**. `01…§26` records what `W-21` alone would not reach.

### W-41 — One resolution function; entry points project, never compute *(M · `I-22` · needs `AD-12`)*

Three resolvers plus a light path:

| Path | What it is | Finding |
|---|---|---|
| `resolveAdminAccessCore` | the enforcing resolver | — |
| `resolveAdminAccessDimensionsForOrgMember` | the operator preview, recomputing everything | `C11` |
| `resolveAdminPortalOrgCore` | *"re-implements the legacy fallback and its own `PORTAL_ROLES`"* | `M2-5` |
| `requireAdminOrOps` → `getAdminOrgContextLight` | reads no grants, no scope, does not use the cache — **147 route files** | `M2-13` |

`M2-13`'s consequence: *"two gates in one request can disagree about the same principal"* **[carried]**.
`AD-12`'s recommendation: *"optimization, not a resolver. Keep one resolution function and let entry points
differ only in what they **project** from it — never in what they **compute**. Concretely: have the light
path call the same core and skip the grant/scope reads, rather than re-implementing the selection and
fallback logic"* (`02…§20`) **[carried]**. That *"subsumes `I-22` and `M2-5` into a single structural rule
and removes the `P2` violation as a side-effect."*

**Order.** `W-41` after `W-20` (the fallback the third resolver duplicates is deleted first) and after
`W-24` (so "differ in freshness" stops being one of the ways they differ).

**QA.** Tier A: exactly one module defines an admission set or a fallback query — `02…§9`'s `I-22` check.
Tier C (`P2`): for a fixture principal, every entry point in `02…§16` returns the same `orgId` and
`roleKeys`, *"including when one is served from cache and another is not"* **[carried]**.
**Exit.** One resolution function; entry points differ only in projection. `RL-25`.

### W-42 — One normalization, applied at the boundary *(S–M · `I-28`ᴬ)*

The enforcing resolver builds `roleKeys` **raw** (`:35`); the preview builds them **trimmed** (`:230`); the
grant lookups differ accordingly (`02…§18`, `M2-11`) **[carried]**. For a membership row holding `"admin "`,
the enforcing path yields `portalEligible: false` and an **empty** capability set while the preview yields
`portalEligible: true` and the **full** `admin` grant set. *"Settings → Users & Roles shows a working portal
administrator; every runtime gate returns 401/403."*

**Bounded honestly, and the bound is the reason this is `S–M` and not urgent:** the product's own assignment
path trims the submitted role, *"so this state is not reachable through the UI. It is reachable through the
writers that `M2-2` shows are unconstrained — seeds, imports, direct SQL"* **[carried]**. `W-16`'s FK
narrows that population; it does not define a normal form. **The finding is that the model has no defined
normal form**, not that padded rows exist.

**QA.** Tier A: one exported `normalizeRoleKey`; no other module trims, lowercases or raw-compares a role
key. Tier B, property (`F14`): the enforcing and preview resolvers return identical `roleKeys` and
`permissionKeys` for the same fixture rows, *"including whitespace and case variants"* (`02…§19`)
**[carried]**.
**Exit.** One normal form, applied once, at the boundary. `RL-24`.

### W-43 — Every resolver read error denies *(S–M · `I-30`ᴬ · GAP-3's read-error leg)*

`resolveAdminAccessCore` handles a failed read **four different ways**, and the one whose error is *silently
dropped* is the one whose failure default is maximal (`02…§18`, `M2-12`; `01…§14`, `T-9`) **[carried]**:

| Read | On error | Direction |
|---|---|---|
| `user_roles` | `return null` → 403 | **closed** |
| `role_permission_grants` | log, return `[]` | **open** for the 131-of-132 surfaces that gate on admission alone |
| `user_access_profiles` | **error not destructured at all** | **open — widest possible**: indistinguishable from "no row" ⇒ both scopes `all` |
| `user_department_access` / `user_site_access` | log, allow-list `[]` | **closed** |

*"`I-19` already required that absent scope deny; this pass finds that a transient read failure is
indistinguishable from absence and resolves the same way — so the fix must cover both, which is why `I-30`
is stated in terms of failure, not absence"* **[carried]**. **This is why `W-7` alone does not close
`I-19`**, and why §3.2 schedules `W-43` inside batch 3 with wave 2.

**QA.** Tier C fault injection (`F15`): force each of the resolver reads to error in turn; assert every case
denies. Tier A: no Supabase call in the resolution path destructures `data` without `error` — `02…§19`'s
check **[carried]**.
**Exit.** No read failure widens authority. `RL-23`.

### W-44 — Authority-deciding role literals are retired *(M · `I-9` · GAP-6's residue · `AD-4` for the SQL half)*

`02…§8` enumerates **at least 14** sites where a role literal directly decides allow/deny or portal
admission — *"not the three the accepted model named"* — and states the bound honestly: *"thirteen-plus is a
**lower bound**… produced by a literal search that by construction cannot see role checks written any other
way. `web/app` was not swept"* (`M2-7`) **[carried]**. Two of those sites carry the **never-seeded**
`owner`/`manager` vocabulary that has *"leaked from RLS into application code"* (`M2-6`) **[carried]**.

Other workstreams remove five of the sites — `W-8` (site 6), `W-13` (sites 1, 3, 4), `W-38` (site 5). **This
workstream owns the remainder**, plus the two display-only collapse sites `02…§8` lists separately —
`userRolesMembership.ts:24-25` and `adminPortalRolePick.ts:2-4` — which *"are not gates, but they are where
the union semantics of §4.1 are silently discarded on the way to the operator's screen"* **[carried]**.
Those two are `W-17`'s and `IA-7`'s concern and are noted here so the sweep does not delete them blindly.

**Sweep `web/app`.** `M2-7` says it was not swept. This workstream's first step is to sweep it, in the
`W-4` AST shape rather than by literal search.

**QA.** Tier A, `02…§9`'s check: *"role literals in application code appear only in the declared break-glass
module; no literal names a key absent from `role_definitions` seeds"* **[carried]**. Tier A, `02…§19`'s
`§15.3` check: no capability composer contains a role literal on either side of a disjunction.
**Exit.** One break-glass module; every other authority decision reads a capability. `RL-26`.

---

## 21. Wave 11 — Truthfulness at the surface

**Closes GAP-12** — *"the product tells the operator things that are not true"* — and GAP-3's render leg.
Eight mechanisms across five documents, *"no single owner"* until `01…§31` assembled them **[carried]**.

`01…§13` states why this is a security wave and not a UX one: asset **A6** is *"operator trust in the
product's own statements"*, and *"an access-control product whose reports are wrong is a security defect,
not a UX one."* Three of the eight mechanisms (`T-1`, `IA-3`, `IA-6`) are rated `S1`/`S2`.

> **Mechanisms 1, 6 and 7 are the same underlying defect at three layers** — cache, resolver, UI — *"which
> is precisely why fixing one layer will not close GAP-12"* (`01…§31`) **[carried]**. `W-24` fixes the cache,
> `W-43` the resolver, `W-45`/`W-47` the UI. **GAP-12 closes when all three land, and not before.**

### W-45 — No surface renders a state it did not read *(S · `IA-R1`, `IA-R6` · no decision)*

`Active` is a **string literal** in four places in the Users chapter; no status is fetched at all — the
member row type has no status field and the members route never selects one (`06…§4.1`, `IA-1`)
**[carried]**. *"A user who was invited an hour ago and has never signed in renders as `Active`, in four
places, in the product's own voice."* The same applies to *"Password sign-in"* and *"Authentication —
Password"*, correct today only because password is the single implemented method — *"and silently wrong on
the day a second one ships"*, i.e. the day `W-33` lands.

**The comparison that makes this a defect rather than a shortcut is internal**: *"the Roles chapter reads
its status from data… Same workspace, same authors, same sprint. Roles read; Users assert"* **[carried]**.

`IA-R1`: *"a value the system did not compute **MUST** render as Planned or Unknown."* `IA-R6`: *"unbuilt
capability MUST be marked, never simulated"* — and `06…§4.10` records that the `data-capability="planned"`
discipline is *"this surface's best property, and one place breaks it"* **[carried]**.

**QA.** Tier A, the check `06…§7` names: no literal `Active` / `Password` in a status position under
`components/adminV2/settings/access/**`; every placeholder carries `data-capability="planned"`.
**Exit.** The Users chapter reads what the Roles chapter reads. `RL-33`.

### W-46 — The member projection carries the lifecycle *(S–M · `IA-R2` · sequence with `W-26`)*

`members/route.ts:109-118` **already calls** `supabase.auth.admin.getUserById` and keeps two fields; *"the
`User` object it discards carries `invited_at`, `confirmed_at`…"* and the ban state (`06…§4.2`, `IA-2`)
**[carried]**. **The data is fetched and thrown away** — which is why this is `S–M` and why `W-45` cannot
simply render "Unknown" forever.

`IA-R2`: the projection *"MUST carry invitation state, last sign-in, lock state, and MFA-factor presence,
or state per field why it cannot"* **[carried]**. The per-field escape hatch matters: MFA presence has no
source until `W-36`.

**QA.** Contract test on `GET /api/admin/settings/users-roles/members`, per `IA-R2`.
**Exit.** Every state the Users chapter displays has a source. Sequenced **after** `W-26`, whose state
machine is the authority for what "status" means (`AD-18`).

### W-47 — Absent scope is distinguishable from org-wide, at every layer *(S · `IA-R3` · GAP-3's render leg)*

*"All locations · All departments"* is **indistinguishable from *no access profile was ever created*** —
`06…§4.3` (`IA-3`), and `01…§31` row 6 calls it *"the fail-open in GAP-3, rendered as a reassurance"*
**[carried]**. `06…§6` upgrades it *"from a design gap to a verified impossibility: the members route cannot
emit the distinction, so no rendering can show it."*

`IA-R3`: *"absent scope MUST be distinguishable from org-wide scope at every layer that renders it. No
projection may default a missing access profile to `all`"* **[carried]**.

**Why it is in batch 2, ahead of its own wave and ahead of `W-7`.** It is a projection change plus a
rendering change; it needs no migration, no decision and no resolver work. And it is the only one of GAP-3's
four legs that can land before the others — **the product can stop asserting a reassurance it cannot
support, months before it can enforce the scope.**

**QA.** The fixture `06…§7` names (`F6`): a member with no profile row renders *"No access configured"*,
never *"All locations"*. Tier A: no projection defaults a missing profile to `all`.
**Exit.** `Empty` becomes representable — one of the brief's six required-visible states, and per `01…§28.3`
*"one of six is representable today."* `RL-34`.

### W-48 — Effective access is produced by the enforcing resolver *(S–M · `C11`, `IA-R4` · after `W-41`, `W-42`)*

`06…§4.4` (`IA-4`): the effective-access panel *"is a placeholder, and the one preview that exists disagrees
with runtime"* **[carried]**. `IA-R4`: it *"MUST be produced by the enforcing resolver, in the same
normalized form (`I-28`), and MUST NOT have a second implementation"* **[carried]**.

This is `W-21`'s outcome (§9), and after `W-41` and `W-42` it is *close to a deletion*: the preview stops
recomputing and starts projecting. **Do not schedule it before them** — `W-21`'s own advice was to wait
until the resolver stops changing, and `W-41`/`W-42` are exactly that change.

**QA.** Tier C (`§10.3` matrix, and `F14`): preview and runtime resolve identically across every fixture —
*"the same matrix, asserted twice"* — including whitespace and case variants.
**Exit.** One resolver; the preview has no independent implementation. `RL-13`.

### W-49 — A surface gates on the capability it presents *(M · `IA-R7` · lockout class `L8` · after `W-14`)*

**1 of 132 admin pages is gated on anything finer than "has a role"**, and that one is *a display prop, not
an access decision* (`05…§1`, `§3.3`) **[carried]**. `01…§14`'s `T-7` rates it `S2`. `05…§7.7`: *"let each
surface declare the capability it presents, have the layout enforce it, and have navigation **filter from
the same declaration** — so that 'blocked from seeing the Billing workspace' becomes true, and true for the
same reason the billing commands are blocked"* **[carried]**.

`IA-R7` is the requirement form; `07/AE-4` (*"hidden surfaces cannot be reached directly by URL"*) is the
acceptance form. **The declaration must be `W-14`'s**, not a second one — that is the whole content of
*"true for the same reason."*

**`L8`, and `W-23` Q12 sizes it.** Every principal lacking a chapter's capability loses that chapter,
**including the Access chapters themselves**, which is how `L8` compounds with `L7`.

**QA.** Tier A: each surface declares its capability; navigation filters from the same declaration; no page
is reachable by URL without it. Tier C: a principal without a chapter's capability gets 403 at the route and
no nav entry. Tier D: browser pass per §10.4.
**Exit.** Surface access and command access derive from one declaration. `RL-36`.

### W-50 — No inert capability is presented as a control *(S · `IA-R8` · after `W-11`)*

**11 of 18 grantable keys are consulted by nothing; 4 of 9 grid rows are inert in both columns**
(`05…§2.1`) **[carried]**. `01…§14`'s `T-6` names it *"revocation theatre"*: an operator sets a capability
to *None* and nothing changes. `IA-R8`: *"a grid row whose keys have no enforcement site MUST NOT render as
a setting"*, checked at build time — *"every catalog key resolves to ≥1 enforcement site"* **[carried]**.

`W-11` reconciles the catalog; `W-10` makes the grid a projection of it. **`W-50` is the check that keeps
both true**, and it is what converts `W-11`'s one-time reconciliation into a standing property. It is also
the direct answer to the brief's first rejection condition (`05…§8`, `01…§20`).

**QA.** Tier A build check: every catalog key has at least one enforcement site; a key that loses its last
site fails the build.
**Exit.** The grid states only what the platform enforces. `RL-35`.

### W-51 — The three IA cleanups *(S · `IA-7`, `IA-8`, `IA-9`)*

Three small, independent items, grouped because none justifies a workstream alone **[carried from `06…§4`]**:

| # | Item | Fix |
|---|---|---|
| `IA-7` | The product states a one-role model the schema does not have | The UI collapses a multi-role membership to one literal. Sequence with `W-17`, which makes multi-role reachable; until then the display is *"discarding union semantics on the way to the operator's screen"* (`02…§8`) |
| `IA-8` | One workspace, **two live rendering routes** | *"A cleanup rather than a decision"* (`02…§29`) — the residue of the closed navigation question. Delete the duplicate |
| `IA-9` | The Overview *"exists and is a chooser"* — `summaryCards: []` | The brief's first section. `01…§28.2` scores the workspace **2 built · 1 shell · 1 partial · 3 absent-or-planned**; this is the shell |

**`IA-9` is the one that needs the rest of the wave first.** An overview of access is a summary of states
the product cannot currently compute — which is `W-45`, `W-46` and `W-47`. Building it earlier would
fabricate counts, which is precisely `IA-R6`.

**QA.** Tier A: one rendering route per workspace. Tier B: the Overview's cards are computed, not literal.
**Exit.** The workspace's seven brief-named sections each exist or are marked Planned, truthfully.

### W-52 — Documentation reconciliation *(S · `M2-15`)*

`README_ADMIN_AUTH.md` — *"the repository's canonical description of this model"* — asserts a **single
resolver**, misdescribes `requireAdminOrOps`, and *"cites an **archived** doc as canonical product
semantics"* (`02…§18`, `M2-15`) **[carried]**. `01…§31` row 8 counts it among the eight truthfulness
mechanisms and notes it is one of the two that *"mislead the engineer who would fix the other six."*

Also here: `docs/platform/governance/roles-and-permissions.md` is `status: canonical` and *"states a rule
the code does not follow, with a dead 'Expanded reference' pointer"* — §14.3.8 records that no effort was
budgeted for it. **Budget it here.**

**QA.** Tier A, `02…§19`'s check: *"`README_ADMIN_AUTH.md` asserts a resolver and entry-point set; assert it
matches the exports actually present"* **[carried]**.
**Exit.** The repository's own description of the authority model is true, and locked. `RL-41`.

---

## 22. Wave 12 — Audit

**Closes GAP-10's audit half.** Gated on `W-23` Q7 and on `W-28` (there must be transitions to record).

`01…§26` states the position precisely: whether an authority change is durably recorded is
**"unassessed by every document in this corpus"** — GAP-10 is rated *"S3 · audit unrated"*, and `U-2` lists
it among the questions the corpus cannot answer **[carried]**. `01…§15`'s enforcement matrix leaves the row
*"audit of authority change"* as **not assessed**. This is the only wave in the plan whose **first step is
discovery**, and that is why it is last.

### W-53 — Authority changes are durably recorded *(L · `07/AD-1`…`07/AD-5` · after `W-23` Q7)*

The rubric already specifies the criteria; this workstream builds to them **[carried from `07…§3.5`]**:

| Criterion | Requirement | Lands as |
|---|---|---|
| `07/AD-1` | Audit events exist for consequential access changes | one event per mutation class |
| `07/AD-2` | Records actor, timestamp, subject, and **before/after** | `M13`'s columns |
| `07/AD-3` | **Append-only** — `UPDATE`/`DELETE` rejected | enforced by policy or trigger, not convention |
| `07/AD-4` | **A failed audit write rejects the mutation** | the transactional clause — it makes audit a control, not a log |
| `07/AD-5` | Change history is viewable per role and org-wide | `06…§3.3`'s *"one store, three views"*, all currently Planned |

**Two dependencies that are not scheduling niceties.** `07/AD-4` requires the mutation and the audit write
to share a transaction — which does not exist until `W-28` makes authority writes atomic. And `07/AD-2`'s
*before/after* requires a *before* — which does not exist for removal until `W-28` makes it a retirement
rather than a `DELETE` (`04…§5.3`: *"a lifecycle that ends in a `DELETE` cannot answer 'was this person ever
an operator here, and who ended it?'"*) **[carried]**. **`W-53` after `W-28` is a hard ordering.**

**`06…§3.3` is the surface half**: audit is *"one store with three views"*, all three marked Planned. Under
`IA-R6` they must stay marked until this workstream lands — **an audit view that fabricates events is the
worst instance of GAP-12 the product could ship**, because it is the surface an operator would consult to
detect the other seven.

**QA.** Tier C per `07…§3.5`: one test per mutation class; forced audit-write failure rolls back the
mutation; `UPDATE`/`DELETE` on the store are rejected. Tier A: no authority-mutating route can commit
without an audit write on the same transaction.
**Exit.** An incident can be reconstructed from the store. `RL-40`.

> **If `W-23` Q7 finds an existing audit store**, this workstream becomes *extend and constrain* rather than
> *build*, and its size drops from `L`. That is a large enough swing that **`W-53` must not be sized before
> Q7 answers** — recorded here rather than guessed, per `U-2`.

---

## 23. Coverage — every ID, bound or declared unassigned **[new — M2]**

This is the artifact `01…§29` established was missing. Its finding was mechanical and this section is its
answer, in the same form: **a search over this plan for every finding-ID pattern in the corpus should now
return every register, not two of them.**

The test §29 applied is stated here as a standing check, `CV-1`, and §28 reproduces it:

> For each register `R` in {`C`, `G`, `M2`, `A2`, `IA`, `IA-R`, `T`, `S`, `I`, `U`, `X`, `AD`, `07`}, every
> ID defined in the corpus appears in this section exactly once, bound to a workstream or to a stated
> reason for having none.

**Read the `Workstream` column as a claim about what is *scheduled and exit-tested*.** §14.3's fourth limit
applies unchanged: *"'no workstream' means the plan does not name the finding. It does not mean no planned
work would incidentally touch it"* — the converse also holds, and is why every row below names an exit
criterion's owner rather than "wave N would probably encounter this."

### 23.1 The fourteen gaps

| Gap | Was (`01…§26`) | Now | Workstreams |
|---|---|---|---|
| **GAP-1** — revocation is not a capability | **none** — *proposed: a revocation wave* | **wave 6** | `W-24`, `W-25`, `W-26`, `W-27` |
| **GAP-2** — authentication is one method, unversioned | **none** — `03` predates `04` | **wave 8** | `W-30`…`W-37` |
| **GAP-3** — scope fails open at every layer | partial — 2 of 4 legs | **complete** | `W-5`, `W-6`, `W-7` + **`W-43`** (read-error leg), **`W-47`** (render leg) |
| **GAP-4** — admission is a role check | covered | covered + surface leg | `W-13`, `W-14`, `W-15` + **`W-49`** |
| **GAP-5** — the vocabulary is decorative | covered | covered + standing check | `W-10`, `W-11`, `W-12` + **`W-50`** |
| **GAP-6** — four role vocabularies, one leaked | partial — nothing removed the 13+ literals | **complete** | `W-16`, `W-19`, `W-11` + **`W-44`** |
| **GAP-7** — no single resolver, no normal form | partial — preview only | **complete** | **`W-41`**, **`W-42`**, **`W-48`** (`W-21` split) |
| **GAP-8** — no delegation ceiling; `ops` ≈ `admin` | partial — `AD-9` had no workstream | **complete** | `W-18` (`AD-3`) + **`W-29`** (`AD-9`) |
| **GAP-9** — enforcement is a convention | covered | covered + command layer | `W-4` ✅, `W-14`, `W-15` (incl. the action registry), **`W-40`** |
| **GAP-10** — writes neither atomic nor audited | **none** | **`W-28`** + **wave 12** | `W-28` (atomicity), `W-23` Q7 → `W-53` (audit) |
| **GAP-11** — three tenancy holes, two unplanned | `W-22` covered `I-7` only | **complete** | `W-22` + **`W-38`**, **`W-39`** |
| **GAP-12** — the product misinforms the operator | **none** — no `IA-R` appeared in `03` | **wave 11** | `W-24`, `W-43`, `W-45`…`W-48`, `W-52` |
| **GAP-13** — the person↔user edge | needs none, by design | needs none | — · `AD-1` only (§24) |
| **GAP-14** — the corpus cannot be cited by number | **none** — Director-owned | **Director-owned** | §26 — `X-1`…`X-9` |

**Twelve of fourteen gaps now have workstreams; one needs none by design; one is not engineering work.**
At `cd24874cb` the score was *3 covered · 5 partial · 5 with no workstream at all*.

### 23.2 Findings

`C`/`G` bindings are the accepted plan's own, quoted from each workstream header. Everything else is new.

| Register | Finding | Workstream | Note |
|---|---|---|---|
| `C1` | census over-reports enforcement ~30× | `W-14` | the declared table replaces the census |
| `C2` | `user_roles.role` unconstrained | `W-16` | + `M2-2`'s duplicate FK, `M15` |
| `C3` | three catalog tables | `W-9` | **closed by Phase 0** — `01…§2.4` **[carried]** |
| `C4` | catalog ≠ enforced | `W-11` | |
| `C5` | unsavable grid row | `W-3` ✅ / `W-10` | closed twice, incompatibly — `C12` |
| `C6` | portal admission is a role set | `W-13` | |
| `C7` | multi-role unreachable | `W-17` | |
| `C8` | department-scope bypass | `W-8` | 1 named principal (`W-0` Q6) |
| `C9`, `C10` | RLS position and vocabulary | `W-19` | sized by `W-23` Q13 |
| `C11` | preview ≠ enforcement | `W-48` | was `W-21` |
| `C12` | `C5` closed twice | — | **closed defect**; present only through `C13` |
| `C13` | `ops.workflows.*` seeded, grid row removed | `W-11` | the row returns iff a key is enforced |
| `G1` | `handle_new_user()` | `W-20` + `M16` | latent (`W-0` Q1); must get an explicit disposition |
| `G2` | analytics routes gate on `access.ok` | `W-1` ✅ | 3 real, 3 false positives |
| `G3` | no delegation ceiling | `W-2` ✅ (self-ban) · `W-18` · `W-29` | |
| `G4` | no profile row on create | `W-5`, `W-6` | + `W-5`'s invite leg (`IA-R9`) |
| `G5` | blanket grant seed | `W-12` | |
| `G6` | service-role client everywhere | `W-4` ✅ · `W-15` · `W-40` | |
| `M2-1` | role/scope are siblings, not a chain | — | **specification clarification, not a defect** **[carried]** |
| `M2-2` | duplicate FK beside an absent one | `W-16` / `M15` | |
| `M2-3` | `is_active` ignored on resolve | **`W-25`** | |
| `M2-4` | the withheld keys are inert | **`W-29`** | |
| `M2-5` | a third resolver | **`W-41`** | |
| `M2-6` | `owner`/`manager` leaked into app code | **`W-44`** | `W-19` alone would leave it |
| `M2-7` | ≥13 authority-deciding role literals | **`W-44`** | 5 removed by `W-8`/`W-13`/`W-38` |
| `M2-8` | `app_users.role` CHECK — a fourth vocabulary | `W-20` | |
| `M2-9` | blanket grant over the unioned catalog | `W-11` → `W-12` | order matters |
| `M2-10` | the cache is never invalidated | **`W-24`** | the corpus's sharpest finding |
| `M2-11` | normalization differs, preview vs runtime | **`W-42`** | |
| `M2-12` | four error dispositions; scope read discards its error | **`W-43`** | |
| `M2-13` | the light resolver disagrees | **`W-41`** | |
| `M2-14` | delete-then-insert, untransacted | **`W-28`** | |
| `M2-15` | `README_ADMIN_AUTH.md` is wrong | **`W-52`** | |
| `A2-1` | no credential-disable call exists | **`W-26`** | |
| `A2-2` | non-revocation documented as intended | **`W-26`** | |
| `A2-3` | reset trigger unbounded, legacy literal | **`W-38`** | |
| `A2-4` | no step-up on password change | **`W-27`** | |
| `A2-5` | verification mode unversioned | **`W-34`** | `U-4` |
| `A2-6` | admission is not authentication | `W-13` | `I-32`'s actionable-refusal clause |
| `A2-7` | who may mint a credential | **`W-29`** | = `AD-9` |
| `IA-1` | status asserted, not read | **`W-45`** | |
| `IA-2` | lifecycle data fetched then discarded | **`W-46`** | |
| `IA-3` | "All locations" ≡ "no row" | **`W-47`** | |
| `IA-4` | effective access is a placeholder | **`W-48`** | |
| `IA-5` | invite modal's load-bearing steps Planned | `W-5` | `IA-R9` |
| `IA-6` | removal reports success too early | `W-24` + `W-28` | `IA-R5` |
| `IA-7` | a one-role model the schema lacks | `W-17` + **`W-51`** | |
| `IA-8` | two live rendering routes | **`W-51`** | *"a cleanup rather than a decision"* |
| `IA-9` | the Overview is a chooser | **`W-51`** | after `W-45`…`W-47` |
| `IA-10` | the Planned discipline breaks once | **`W-45`** | |
| `T-1`…`T-13`, `T-16`…`T-18` | — | via their owners | `01…§22.2`: threat entries mostly **re-frame** findings owned elsewhere |
| `T-14`, `T-15` | **controls that hold** | **`W-40`** | not defects — they become locks (`S-7`, `RL-32`) |
| `X-1`…`X-9` | corpus integrity | — | **Director-owned** — §26 |

**Every `T-n` is bound through its owning finding**, per `01…§22.2`'s own deflation. The three that are not
re-framings — `T-14`, `T-15` (controls that hold) and `T-17` (abuse control, which `01…§16` records as
having no `I-` invariant and introduces `S-2` for) — are bound directly: `W-40`, `W-40`, `W-35`.

### 23.3 Requirements

**Ten `IA-R` requirements, none of which appeared in the accepted plan** (`01…§31`, **[verified this pass]**
against this copy: zero occurrences before this revision). **Seven `S-n` security invariants**, likewise.

| # | Requirement | Workstream | Lock |
|---|---|---|---|
| `IA-R1` | no rendered state that was not read from data | `W-45` | `RL-33` |
| `IA-R2` | the member projection carries the lifecycle | `W-46` | — (contract test) |
| `IA-R3` | absent scope distinguishable from org-wide | `W-47` | `RL-34` |
| `IA-R4` | effective access from the enforcing resolver | `W-48` | `RL-13` |
| `IA-R5` | no transition reports success before it is effective | `W-24`, `W-28` | `RL-16` |
| `IA-R6` | unbuilt capability marked, never simulated | `W-45`, `W-53` | `RL-33` |
| `IA-R7` | a surface gates on the capability it presents | `W-49` | `RL-36` |
| `IA-R8` | no inert capability rendered as a control | `W-50` | `RL-35` |
| `IA-R9` | invite creates the profile in one transaction | `W-5` | `RL-4` |
| `IA-R10` | show/hide on every password field | `W-30` | `RL-37` |
| `S-1` | unauthenticated side effects authenticate the sender | `W-40` | `RL-30` |
| `S-2` | abuse control is declared, not per-process | `W-35` | `RL-31` |
| `S-3` | a client secret is stored only as a hash | `W-40` | `RL-32` |
| `S-4` | no provider strings in unauthenticated responses | `W-32`, `W-39` | `RL-29` |
| `S-5` | one visibility predicate governs every projection | `W-39` | `RL-28` |
| `S-6` | tenancy is a property of the request | `W-39` | `RL-28` |
| `S-7` | every holding control gets a lock before V2 ships | `W-40` | `RL-32` |

`06…§7` names `IA-R1`, `IA-R3` and `IA-R6` *"the cheapest items in this document and the highest-value"*,
and `IA-R10` *"the cheapest item in the corpus"* **[carried]**. All four are in §3.2's **batch 2**.

### 23.4 Invariants

`I-1`…`I-25` keep the accepted plan's assignments. Numbers with a **collision** (`X-1`) carry
`01…§16`'s superscripts throughout: **ᴬ = `02…` Part II · ᴮ = `04…§6.3`**.

| Invariant | Status (`02…§7`) | Workstream |
|---|---|---|
| `I-1`, `I-2` | open | `W-20` |
| `I-3` | open, narrowed | `W-4` ✅, `W-15` |
| `I-4` | **met — verified** (`01…§14.1`) | none · **lock** `RL-32` (`S-7`) |
| `I-5`, `I-6` | met | none — §13.1 |
| `I-7` | open | `W-22` |
| `I-8` | worse | `W-16`, `W-11` |
| `I-9` | worse | **`W-44`** |
| `I-10` | open | `W-17` |
| `I-11` | partial | `W-2` ✅, `W-18`, **`W-29`** |
| `I-12` | **met** | `W-9` (closed by Phase 0) |
| `I-13` | worse | `W-11`, **`W-50`** |
| `I-14` | open | `W-10` |
| `I-15` | worse | `W-12` |
| `I-16` | open | `W-13` |
| `I-17` | open, first crack | `W-1` ✅, `W-15`, **`W-49`** |
| `I-18` | open | `W-5` |
| `I-19` | open | `W-7` **+ `W-43` + `W-47`** |
| `I-20` | open | `W-8` |
| `I-21` | carried unverified (`U-8`) | `W-15` — §13.1 |
| `I-22` | worse | **`W-41`**, `W-48` |
| `I-23` | open | `W-14`, `W-15` |
| `I-24` | open | `W-14` |
| `I-25` | worse | `W-22`, **`W-24`** |
| `I-26` | open (new) | **`W-25`** |
| `I-27` | open (new) | `W-8` — scope takes no role input |
| `I-28`ᴬ one normalization | open | **`W-42`** |
| `I-28`ᴮ credential command org-bounded | open | **`W-38`** |
| `I-29`ᴬ revocation effective next request | open | **`W-24`** |
| `I-29`ᴮ password change requires step-up | open | **`W-27`** |
| `I-30`ᴬ every read error denies | open | **`W-43`** |
| `I-30`ᴮ retiring a principal revokes | open | **`W-26`** |
| `I-31`ᴬ authority writes are atomic | open | **`W-28`** |
| `I-31`ᴮ verification mode is asserted | open | **`W-34`** |
| `I-32` admission is a capability | open | `W-13` |
| `I-33` no provider strings in auth errors | open | **`W-32`** |
| `I-34` password policy server-side | open | **`W-31`** |

**Four numbers, eight invariants — and eight different workstreams.** That is `X-1`'s cost made concrete:
each colliding pair lands in a different wave, so a lock written against a bare `I-29` would be run in the
wrong one. §26 escalates the renumbering; §25 works around it.

### 23.5 The eight unanswered questions

| # | Question | Where it lands |
|---|---|---|
| `U-1` | is any of this true of a deployed environment? | `W-23` re-runs Q1–Q6; **it remains partly unanswerable** — §27 |
| `U-2` | is authority audited at all? | **`W-23` Q7** → wave 12 |
| `U-3` | what do the RLS policies actually say? | **`W-23` Q13** → `W-19`, `AD-4` |
| `U-4` | what is the request-identity verification mode? | **`W-34`** — asserted rather than discovered (`AD-17`) |
| `U-5` | how many routes are genuinely ungated? | **`W-23` Q14** → `W-14`, `W-15` sizing |
| `U-6` | do the `action-links` handlers match `T-14`'s discipline? | **`W-40`** — enumerated, not read (`01…§22.3-22.4`) |
| `U-7` | does the platform run more than one process? | **`W-23` Q8** → `W-24`'s mechanism, §10.5's harness |
| `U-8` | is `I-21` actually met? | `W-15` — carried unverified through three passes |

**Seven of eight are now scheduled**; `U-1` is bounded rather than answered, because "is the repo true of
production" is not a question one census closes.

### 23.6 Rubric coverage

`07…` scopes per phase — *"a phase declares which IDs it claims; unclaimed criteria are not evaluated"*
**[carried]**. Which wave can claim what:

| Criteria | Wave | Notes |
|---|---|---|
| `07/AI-1`…`AI-3` | 6 (`W-26`) + `AD-19` | `AI-3` (*"binds to exactly one canonical person"*) depends on `AD-1`/`AD-19` — see §24 sitting 6 |
| `07/AI-4`, `AI-5` | **6** (`W-26`) | `07…§3.1`: *"`AI-5` is the highest-value single test in this rubric"* **[carried]** |
| `07/AR-1` | 4 + 11 (`W-15`, `W-49`) | four layers: surfaces, actions, records, fields |
| `07/AR-2`, `AR-3` | 10–11 (`W-41`, `W-42`, `W-48`) | `AR-3` is `IA-R4` |
| `07/AR-4`, `AR-5`, `AR-7` | 11 | **Review, not Auto** — *"the criteria the brief cares most about and the ones no checker can decide"* |
| `07/AR-6` | 3 (`W-11`) | preset → Custom → keys |
| `07/AR-8` | 11 (`W-47`) | **1 of 6 states representable today** (`01…§28.3`) |
| `07/AU-1`…`AU-5` | **8** | `AU-2` = `W-30`, `AU-3` = `W-31` — *"cheap and should land first"* |
| `07/AE-1` | 4 (`W-14`) | *"must be a static property, not a sampled test"* |
| `07/AE-2` | 4 (`W-15`, action registry) | |
| `07/AE-3` | 5 (`W-19`) | *"satisfiable two ways"* — and one of them **is** `AD-4` |
| `07/AE-4` | 11 (`W-49`) | |
| `07/AE-5` | 4–5 (`W-15`, `W-22`) | one test per boundary |
| `07/AE-6` | 7 (`W-29`), 5 (`W-18`) | `W-2` ✅ covers the self-edit half |
| `07/AD-1`…`AD-5` | **12** (`W-53`) | see `X-9` (§26) before citing these by number |

---

## 24. Decision gates — all twenty-one **[new — M2]**

§12's four are `AD-1`…`AD-4` and are unchanged in number. This section is the whole register, from
`02…` Part III, arranged by what each sitting **releases in this plan**. **No decision is answered here**,
and every recommendation is **[carried]** from its owning document.

> **Citation convention.** `AD-n` is `02…§25`'s **proposed** canonical numbering, generated by three clauses
> under which *"eighteen of twenty-one keep the number they are cited by today"* and *"no existing citation
> in `03` or `07` points at a number that moves"* **[carried]**. Until a Director ratifies it, the legacy
> IDs remain canonical and `AD-n` exists only in `02…§25` and here. **This plan cites `AD-n` deliberately**,
> because a sequencing document that cited three ambiguous numbers (`D11`, `D12`, `D13`) would create
> exactly the failure `X-1` describes for invariants. `X-7` records that no downstream artifact had yet
> bound to a colliding number; **this document is the first that would have**, which is why §26 escalates
> ratification as a prerequisite rather than a tidy-up.

### 24.1 The six sittings, and what each releases

| # | Sitting | Decisions | Releases | Why here **[carried from `02…§28`]** |
|---|---|---|---|---|
| **1** | **Revocation** | `AD-6`, `AD-10`, `AD-11`, `AD-16` | **wave 6** — `W-24`, `W-25`, `W-26`, `W-27`; **GAP-1**; 3 of the 8 truthfulness mechanisms | *"The only recorded defect that lets a principal act **after** an operator was told revocation worked. It is a live fail-open, not a design gap"* |
| **2** | **Delegation** | `AD-3`, `AD-9` | `W-18`; **`W-29` ships without `AD-3`** | *"`ops` self-promotion is available in any default-seeded org today"* |
| **3** | **Authentication** | `AD-5`, `AD-7`, `AD-8`, `AD-14`, `AD-17`, `AD-18` | **wave 8** — `W-33`…`W-37`; **GAP-2** | *"Six decisions gate an entire unplanned wave; until they are answered `03` cannot even size it"* |
| **4** | **Tenancy** | `AD-13`, `AD-15` | wave 9 — `W-38`, `W-39` | *"Both are small today and one becomes a migration on the second tenant"* |
| **5** | **Vocabulary & resolver** | `AD-2`, `AD-4`, `AD-12` | `W-13` (grants), `W-19` (sizing), `W-41` | *"`AD-2` compounds per org seeded; `AD-4` should be preceded by the `U-3` review"* — i.e. by `W-23` Q13 |
| **6** | **Person, policy, scope shape** | `AD-1`, `AD-19`, `AD-20`, `AD-21` | `W-46` (`AD-18`'s twin), `M18` | *"Specify-now/build-later by their own recommendations; nothing waits on them"* |

**One sentence from `02…§28` governs the ordering and is worth repeating**: *"Sitting 1 is first… **not**
because more is blocked behind it"* but because `AD-11` describes a live defect. Sittings 3 and 5 block the
most *work*; sitting 1 blocks the least and goes first.

### 24.2 Which workstreams are blocked, and which are not

The distinction that matters operationally: a workstream **blocked** by a decision cannot start; a
workstream **informed** by one can start and would be rewritten if the answer surprises.

| Decision | Blocks (cannot start) | Informs |
|---|---|---|
| `AD-2` | — | `W-13`'s grant set, `W-17` |
| `AD-3` | **`W-18`** | — |
| `AD-4` | **`W-19`** (order of magnitude) | `W-44`'s SQL half, `07/AE-3` |
| `AD-5` | **`W-26`** (state grain), `W-37` | `W-33`, `W-46` |
| `AD-6` | **`W-26`** (is there a disable call at all) | `W-25` |
| `AD-7` | `W-36` | `W-33` |
| `AD-8` | — (*"specify the shape; do not build it"*) | `W-33` |
| `AD-9` | **`W-29`** | — |
| `AD-10` | **`W-25`** | `W-26` |
| `AD-11` | **`W-24`** (drop the cache, or make it shared) | §10.5's harness |
| `AD-12` | **`W-41`** | `W-42`, `W-48` |
| `AD-13` | `W-39` (fix 1 only; fixes 2–3 ship regardless) | — |
| `AD-14` | `W-35` (scope) | `W-38` |
| `AD-15` | — (recommendation is unambiguous and small) | `W-38` |
| `AD-16` | **`W-27`** | — |
| `AD-17` | **`W-34`** (which posture is asserted) | `07`'s session-security criteria |
| `AD-18` | `W-46` (what "status" means) | `W-45` |
| `AD-1`, `AD-19` | — | `W-51`, `07/AI-3` |
| `AD-20`, `AD-21` | `M18` | scope model |

**Eleven workstreams cannot start until a decision is made, and ten of the eleven are in waves 6, 8 and
10.** That is the shape of the programme's remaining risk: the newly-sequenced work is decision-bound to a
degree the accepted plan's work never was.

### 24.3 The three read-only inputs that improve three sittings

*"None of the three blocks a decision; all three improve one"* (`02…§28`) **[carried]**:
**`U-7`** prices sitting 1 (`W-23` Q8) · **`U-3`** grounds `AD-4` in sitting 5 (Q13) · **`U-4`** is the
evidence `AD-17` in sitting 3 asserts a contract about (`W-34`).

**Do not let sitting 1 wait on `U-7`.** `02…§27`: it *"decides whether `AD-11` has a cheap answer or an
architectural one. It does not decide **whether** revocation must be immediate. Do not let `AD-11` wait on
`U-7`; let the **implementation** wait on it"* **[carried]**.

### 24.4 What is not a decision

**Closed by the corpus:** what a conflict is and how it resolves — settled normatively by `02…§15.3`
(capability unions, scope intersects, no conjunct may widen another). **Closed by implementation:** where
Access lives in navigation — `/organization/access`; the residue is `IA-8`, *"a cleanup rather than a
decision"* (`W-51`). **Superseded:** time-boxed access carries forward as `AD-21`; only its ID moved.
**Director housekeeping, not product decisions:** `X-1`…`X-9` — *"approving a decision does not close one
and closing one does not answer a decision"* (`02…§29`) **[carried]**. **Worker-resolvable: none.**

---

## 25. Regression locks `RL-16` … `RL-42` **[new — M2]**

Continuing §13 without renumbering. **Four of `RL-1`…`RL-15` are live** (`RL-1`, `RL-2`, `RL-11`, `RL-15`) —
confirmed present at `73f459dae` **[verified this pass]**. Every lock below is `proposed`.

Tiers are §10.1's. **No lock cites a bare colliding `I-` number** (`X-1`); superscripts are `01…§16`'s.

| Lock | Asserts | Tier | From | Workstream |
|---|---|---|---|---|
| **RL-16** | A revocation performed in one process denies in **every** process on the next request | C **(2-process)** | `I-29`ᴬ / `M2-10` / `IA-R5` | `W-24` |
| **RL-17** | No authority decision reads a cross-request in-process store; every authority write invalidates, or no such store exists | A | `I-25` / `AD-11` | `W-24` |
| **RL-18** | Deactivating a role removes its capabilities from the next resolve | C | `I-26` / `M2-3` | `W-25` |
| **RL-19** | A non-`active` account cannot use an existing session | C | `I-30`ᴮ / `07/AI-5` | `W-26` |
| **RL-20** | Last-org deactivation disables the credential — sign-in fails afterwards | C | `A2-1` / `A2-2` | `W-26` |
| **RL-21** | Session presence alone does not authorize re-keying; reset and in-session change have distinct preconditions | C | `I-29`ᴮ / `A2-4` | `W-27` |
| **RL-22** | A failed authority write leaves memberships unchanged; no authority path issues a bare `DELETE` on a membership | C + A | `I-31`ᴬ / `M2-14` | `W-28` |
| **RL-23** | Every resolver read error denies; no resolution-path call destructures `data` without `error` | C + A | `I-30`ᴬ / `M2-12` | `W-43` |
| **RL-24** | One exported `normalizeRoleKey`; preview ≡ runtime across whitespace and case variants | A + property | `I-28`ᴬ / `M2-11` | `W-42` |
| **RL-25** | Exactly one module defines an admission set or a fallback query; entry points project, never compute | A | `I-22` / `M2-5`, `M2-13` | `W-41` |
| **RL-26** | Role literals appear only in the declared break-glass module; no literal names a key absent from `role_definitions` seeds | A | `I-9` / `M2-6`, `M2-7` | `W-44` |
| **RL-27** | A credential command's target resolves to a membership in the caller's org | B + C | `I-28`ᴮ / `A2-3` | `W-38` |
| **RL-28** | No request handler reads an org identifier from `process.env`; one visibility predicate governs every projection in a response | A | `S-6`, `S-5` | `W-39` |
| **RL-29** | No `catch` on a publicly reachable route serializes `e.message`; the sign-in path renders a fixed string | A | `S-4` / `I-33` | `W-32`, `W-39` |
| **RL-30** | Every unauthenticated side-effect route verifies a signature, resolves a hashed token, or is a reviewed exemption — and the lists only shrink | A | `S-1` | `W-40` |
| **RL-31** | Every unauthenticated route declares a limit; no limiter's backing store is a module-level `Map` | A | `S-2` / `T-17` | `W-35` |
| **RL-32** | **The controls that hold, stay holding** — token expiry, replay, cross-subject, cross-org; webhook signature rejection before any side effect; no undeclared plaintext secret fragment | C + A | `S-7`, `S-3` / `T-14`, `T-15`, `I-4` | `W-40` |
| **RL-33** | No literal status or method string in a status position under the access surfaces; every placeholder carries `data-capability="planned"` | A | `IA-R1`, `IA-R6` | `W-45` |
| **RL-34** | No projection defaults a missing access profile to `all`; a member with no profile renders "No access configured" | A + C | `IA-R3` / `IA-3` | `W-47` |
| **RL-35** | Every catalog key resolves to ≥1 enforcement site | A | `IA-R8` / `T-6` | `W-50` |
| **RL-36** | Every access chapter declares its capability; navigation filters from the same declaration; no page is URL-reachable without it | A | `IA-R7` / `07/AE-4` | `W-49` |
| **RL-37** | No bare `type="password"` outside the shared component | A | `IA-R10` / `07/AU-2` | `W-30` |
| **RL-38** | A direct API call with a weak password is rejected server-side | C | `I-34` / `07/AU-3` | `W-31` |
| **RL-39** | The request-identity verification mode is a declared constant, and the test fails if the posture changes | A + C | `I-31`ᴮ / `A2-5` | `W-34` |
| **RL-40** | Audit is append-only, and a failed audit write rolls back the mutation | C | `07/AD-3`, `07/AD-4` | `W-53` |
| **RL-41** | `README_ADMIN_AUTH.md` matches the exports actually present | A | `M2-15` | `W-52` |
| **RL-42** | **The corpus stays citable** — `CR-1`…`CR-5` (`02…§31`) plus `CV-1` (§23) run as a docs lint | A | `X-1`…`X-9` | §26 |

**Three locks deserve a note.**

- **`RL-16` is the one this whole revision turns on.** `02…§19`: *"the `I-29` check is the one that would
  have caught `M2-10`: it asks not 'is the cache correct' but 'does revocation take effect' — and it must
  run in two processes, or it passes for the wrong reason"* **[carried]**. A single-process version of
  `RL-16` is worse than no lock, because it certifies the defect as fixed.
- **`RL-32` is the lock nobody will ask for.** `S-7`: *"the one most likely to be skipped and the one whose
  absence would be least visible"* **[carried]**. It locks the three things that currently *work* — which
  means it will never go red in review and will look like wasted effort until the day it doesn't.
- **`RL-42` is a lint on this corpus, not on the product**, and it is the cheapest item in §25. `02…§31`:
  *"`CR-2` is the one that would have prevented GAP-14's decision half, and it must run **before** the first
  rubric row is written against `AD-15`…`AD-17` — because after that, it stops being a check and starts
  being a migration"* **[carried]**.

---

## 26. Corpus integrity — `X-1` … `X-9` **[new — M2]**

**Director-owned. None is worker-resolvable, and none is a product defect.** They are in this plan because
**this plan is the artifact that binds to the registers they concern**: §23 cites every finding ID, §24
every decision ID, §25 every invariant ID. `02…§29`: *"approving a decision does not close one and closing
one does not answer a decision."*

| # | Finding | Owner | State at `73f459dae` |
|---|---|---|---|
| `X-1` | **The invariant register has collided** — `I-28`…`I-31` each denote two invariants (`02…` Part II vs `04…§6.3`) | `01…§18` | **open.** §23.4 and §25 use superscripts throughout; eight workstreams across four waves depend on the distinction |
| `X-2` | The corpus is split across two folders with no rule; the canonical folder holds 3 of 8 numbered documents | `01…§32` | **open, and this document changes its shape** — see below |
| `X-3` | **The delivery plan in the canonical folder is 455 lines staler than the one in the evidence folder** | `01…§32` | **CLOSED by this deliverable** — see below |
| `X-4` | `04…`'s finding register is internally inconsistent three ways (*"Five new findings"*, six rows, seven defined) | `01…§32` | **open.** §23.2 binds `A2-1`…`A2-7`, reading the body rather than the table, as `01…§23` did |
| `X-5` | Required output #5 existed only as an uncommitted working-tree change | `01…§32` | **CLOSED.** `02…` Parts II and III are committed at `HEAD`; 22 occurrences of *"Part II"*/*"Part III"* at `73f459dae` **[verified this pass]** |
| `X-6` | `D-IA0` overstates the `D9` collision by one entry | `02…§30` | open — a correction, not a rebuttal |
| `X-7` | No downstream artifact had yet bound to a colliding decision number | `02…§30` | **superseded by this document.** §24 binds to all 21. The window `X-7` describes is now closed by use, not by ratification |
| `X-8` | The ᴬ/ᴮ convention is a per-row assignment, not a rule a reader can apply | `02…§26.3` | open — §23.4 states the assignment inline for that reason |
| **`X-9`** | **The `AD-n` namespace now denotes two different registers** | **this document** | **new — see below** |

### 26.1 `X-9` — `AD-n` is both a decision and an audit criterion **[new finding]**

**Recorded as a corpus-integrity defect, not a product defect**, continuing the `X-n` series.

> `07-director-acceptance-rubric.md:136-140` defines **`AD-1`…`AD-5`** as the **Audit** acceptance criteria
> (*"Audit events exist for consequential access changes"*, *"Audit is append-only"*, …).
> `02-canonical-access-identity-model.md:1280-1300` proposes **`AD-1`…`AD-21`** as the **canonical decision
> register**. Both are live, both are cited by this plan, and they overlap on five numbers
> **[verified this pass]**.

`AD-1` today denotes *"Does a person ever become a principal?"* **and** *"Audit events exist for
consequential access changes."* Those are a product decision and an acceptance criterion — different kinds
of object, decided by different people, at different times.

**Why this is worth recording rather than absorbing.** It is the same failure as `X-1` and `D-IA0`, arriving
one document later and from the opposite direction: `02…` Part III was written to *solve* the decision
collision and chose a prefix that `07…` had already used four days earlier. Neither document is careless —
`02…§30` even notes that *"a register whose own defect report is off by one is the argument for having
exactly one register."* **Nothing reconciled them**, which is `01…§32`'s conclusion about all five earlier
`X` findings, verbatim.

**This document is where it becomes expensive**, because §23.6 binds waves to rubric criteria and §24 binds
workstreams to decisions. A sentence like *"wave 12 satisfies `AD-3`"* is ambiguous between *audit is
append-only* and *what is the delegation ceiling* — two different waves.

**Interim convention, used throughout this plan:** decisions are cited as `AD-n`; **rubric criteria are
cited with an explicit `07/` prefix** — `07/AD-1`, `07/AE-3`, `07/AI-5`. Every rubric citation in §23.6 and
§25 carries it.

**Recommendation, escalated not performed** — per the mission's document-authority rule and `01…§18`'s
precedent, renumbering across documents is not a worker act:

| Option | Cost | Note |
|---|---|---|
| **(a) Rename `07…`'s audit block to `AX-1`…`AX-5`** *(recommended)* | Five IDs in one document; **`07…` is cited by no other artifact by criterion ID** — `02…§24` verified it cites only `D4`, and nothing cites its criteria back | `AI`/`AR`/`AU`/`AE` are all initialisms of their section; `AD` for *Audit* was the odd one, and `AX` keeps the shape |
| (b) Renumber the decision register away from `AD-` | 21 IDs, but they are **proposed and unratified**, so nothing has bound to them except this document | Would also require re-deriving `02…§26.2`'s three-clause rule |
| (c) Keep both, mandate the `07/` prefix | Zero now, and a permanent reading tax | `X-8` is the precedent for why a convention that needs a lookup does not hold |

**A readability hazard, recorded without a recommendation:** `07…` uses `AI-n` for identity criteria while
`06…` uses `IA-n` for its findings. Not a collision — different namespaces — but a transposition a reader
will make at least once. `RL-42`'s lint should flag `AI-`/`IA-` proximity in prose.

### 26.2 `X-3` is closed by this deliverable, and `X-2` changes shape

`X-3` recorded that the canonical copy of this plan was **799 lines**, knew nothing of the wave 0/1
execution records, and *"a reader following the README to the canonical location gets a delivery plan that
does not know four of its workstreams have already landed."* **This revision is written at the
product-source path, carries all four execution records, and adds waves 6–12.** The canonical copy is now
the complete one, and `X-3` closes.

**It does not close `X-2`, and it inverts one clause of it.** `PRODUCT-SOURCE.md`'s rule is that accepted
deliverables are *copied* from the QA folder to the product-source folder, with the QA path remaining
*"runtime certification evidence."* This deliverable was written to the product-source folder because
**that is the path the assignment scopes**, and the QA copy is left untouched as the frozen record of the
2026-07-30 plan and its 2026-07-31 executions. So:

- The evidence folder's `03` is now the **historical** artifact — correct, frozen, and 1254 lines about
  waves 0–5.
- The product-source `03` — this file — is the **plan of record**.
- **Which is canonical is still a Director decision**, and `01…§32` says so: where the Director's canonical
  artifacts live *"is not a worker act."* This document does not assert a folder rule; it records that it
  followed its assignment's scope, and that doing so closed `X-3` as a side effect.

Four of the corpus's eight numbered documents (`00`, `04`, `05`, `06`, `07`) remain absent from this folder,
so the shorthand citations in this plan to `04…`, `05…`, `06…` and `07…` **dangle in the folder they live
in** — this document adds to the count `X-2` tracks, unavoidably and knowingly. Every such citation in this
plan resolves at
`docs/platform/planning/vacilando-os/qa/access-identity-v2/`.

---

## 27. Limits — read before citing **[new — M2]**

These bound **this revision**. §14 bounds the accepted plan and is carried unchanged.

1. **No product defect is asserted here.** Every finding, requirement, invariant and threat in §§16–23 is
   owned, evidenced and rated by an earlier document and is marked **[carried]**. If a constituent finding
   is wrong, this plan inherits the error. **The only original finding is `X-9`** (§26), which is
   documentary and was verified mechanically (§28).
2. **This is a re-sequencing, not a re-derivation.** No application source, schema, migration or UI was read
   in order to *establish* anything. Six load-bearing premises were **re-checked** (§28) because they gate
   the critical path; everything else is transitive through the owning document. **Do not treat a
   `path:line` reached through this plan as freshly confirmed** — `04…` records four line-number drifts
   already, and this plan's own route count moved 539 → 559 in eight days.
3. **Sizings for waves 6–12 are weaker than for waves 0–5.** The accepted plan's sizings were calibrated
   against a codebase the author had read; several here are calibrated against a *description* of it.
   `W-26` (`L`), `W-33` (`M–L`), `W-36` (`M–L`) and `W-53` (`L`) have the widest error bars, and `W-53`
   **should not be sized at all until `W-23` Q7 answers** (§22).
4. **Wave 8 cannot be sized until sitting 3 is held**, and this plan says so rather than producing a number.
   `02…§28`: *"until they are answered `03` cannot even size it"* **[carried]**. `W-30`–`W-32` are sized
   because they depend on no decision.
5. **The wave *grouping* and the execution *order* are different claims, and only the second is
   opinionated.** §3.1 groups by subject; §3.2 orders by §1.4 and §1.5. A Director who accepts the grouping
   may reject the order — batches 2 and 9 are the two most arguable, since both pull live-exposure work
   ahead of its dependency wave.
6. **`W-23`'s query set is a plan for queries, not their results** — the same limit `W-0` carried before it
   executed (§14.3.3). Four lockout-class workstreams (`L5`–`L8`) are specified against counts that do not
   yet exist, and their remediation steps are conditional by construction (`M17`).
7. **The `AD-n` numbering this plan cites is proposed, not ratified.** `02…§33`: *"citing `AD-n` elsewhere
   before ratification would create the seventh register this part exists to prevent."* This document does
   cite it, deliberately and with the reason stated in §24 — but that makes ratification a **prerequisite**
   for this plan being safely quotable, not a nicety. It is escalated in §26, not performed.
8. **The coverage claim in §23 is a claim about *naming*, not about *sufficiency*.** A finding bound to a
   workstream is scheduled and exit-tested; it is not thereby closed, and a Director may judge any
   workstream inadequate to its finding. This is the same caveat `00…§3` attached to output coverage and
   `01…§27` repeated — *"presence, not sufficiency."*
9. **Fifty-three IDs is register arithmetic, not a defect count.** `01…§29` deflates it to *"roughly 34
   distinct new findings"* because `T-1`…`T-13` and `T-18` mostly re-frame findings owned elsewhere.
   Neither number should be quoted as "defects found," and §23.2 binds threats through their owners for
   exactly that reason.
10. **Nothing here is a demonstrated vulnerability.** No request was issued, no browser opened, no database
    queried, no test suite, typecheck or build run. `05…§9`'s limits apply to every count this plan
    inherits: file-level not handler-level, *"grep cannot see intent"*, and no route was executed.
11. **Read-only, except this file.** No source, schema, migration or UI was modified by this phase. The
    frozen QA copies are untouched. §11 remains a register; **no migration was written and none applied.**
12. **No decision is answered and no ID is renumbered.** `X-1`, `X-9` and the `AD-n` ratification are
    escalated. Where this plan needed an unambiguous citation it used a **convention** (superscripts, the
    `07/` prefix) rather than changing anyone's numbers.

---

## 28. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ 73f459dae
P=docs/platform/planning/access-identity-v2
Q=docs/platform/planning/vacilando-os/qa/access-identity-v2

# --- CV-1 (§23): the coverage check this revision exists to satisfy -----------
# Before: the canonical plan named zero post-acceptance IDs (01…§29's finding).
git show HEAD:$P/03-implementation-qa-sequence.md |
  rg -o 'M2-[0-9]+|A2-[0-9]+|IA-R ?[0-9]+|IA-[0-9]+|T-[0-9]+|S-[1-7]\b|AD-[0-9]+|X-[0-9]+|GAP-[0-9]+'
# expect: no output
# After: every register is named.
rg -o 'M2-[0-9]+|A2-[0-9]+|IA-R[0-9]+|IA-[0-9]+|T-[0-9]+|S-[1-7]\b|AD-[0-9]+|X-[0-9]+|GAP-[0-9]+' \
  $P/03-implementation-qa-sequence.md | sort -u | wc -l

# --- §26 X-9 (new): AD-n denotes two registers -------------------------------
rg -n '^\| AD-[0-9]' $Q/07-director-acceptance-rubric.md          # :136-140, audit criteria
rg -n '^\| \*\*AD-[0-9]+\*\*' $P/02-canonical-access-identity-model.md | head -5   # decisions

# --- §26 X-3 closed / X-5 closed ---------------------------------------------
wc -l $P/03-implementation-qa-sequence.md $Q/03-implementation-qa-sequence.md
git show HEAD:$P/02-canonical-access-identity-model.md | rg -c 'Part II|Part III'  # 22 — X-5 closed

# --- Premise re-checks (§27.2) — six claims this plan's critical path rests on -
# 1. M2-10 / W-24: the cache is never invalidated in production
rg -n 'invalidateAdminShellContextCache' web   # only its own module + its own test

# 2. A2-1 / W-26: no credential-disable verb exists; no OAuth/OTP sign-in
rg -n 'auth\.admin\.deleteUser|ban_duration|auth\.admin\.updateUserById|signInWithOAuth|signInWithOtp' web
# expect: no matches

# 3. IA-R10 / W-30: three password inputs, zero reveal toggles
rg -n 'type="password"' web    # login:203, reset-password:157, :175

# 4. §0 / W-14 / W-15: the route count moved 539 → 559
git ls-files 'web/app/api/**/route.ts' | wc -l

# 5. §5 / §13: which regression locks are actually live
ls web/tests/access/ web/scripts/checkServiceClientPrincipal.mjs

# 6. §10.3: the F1–F10 fixture matrix was never built (§14.3.6)
ls web/tests/access/          # four suites, no fixture module
```

---

## 29. Provenance — Mission 2 revision

- **Inputs (reused, not re-derived).** `01-existing-state-inventory.md` Parts I, II and III — the refreshed
  census, the threat and enforcement matrix (`T-1`…`T-18`, `S-1`…`S-7`, `X-1`), and the gap analysis
  (`GAP-1`…`GAP-14`, `U-1`…`U-8`, `X-2`…`X-5`, the plan-coverage finding this revision answers).
  `02-canonical-access-identity-model.md` Parts I, II and III — the invariant register `I-1`…`I-31`, the
  divergences `M2-1`…`M2-15`, the normative resolution model and its conformance checks, and the decision
  register `AD-1`…`AD-21` with its six sittings and approval order. `04-authentication-model.md` — the
  credential lifecycle, `A2-1`…`A2-7`, the state machine and its credential-level effects, the method
  catalog, and `I-28`ᴮ…`I-34`. `05-command-enforcement-census.md` — the capability catalog, the surface
  catalog, the gate families, the action registry, and §7's seven consequences for V2.
  `06-product-ia-and-flows.md` — the workspace as built, `IA-1`…`IA-10`, `IA-R1`…`IA-R10`, and the states
  that must be visible. `07-director-acceptance-rubric.md` — the criteria §23.6 binds waves to.
  `00-mission-intake-and-coverage.md` §3 — the twelve required outputs.
  [`MIGRATION-APPLY-GATE.md`](../vacilando-os/MIGRATION-APPLY-GATE.md) — the shared-apply protocol.
- **Carried in full.** §§0–15 of the 2026-07-30 plan, including the `W-0`, `W-1`…`W-3` and `W-4` execution
  records and their evidence files, from the QA-folder copy — which `X-3` established was the fresher of
  the two by 455 lines. Amendments to that text are marked **[M2 amendment]** and never overwrite a record.
- **Read in full this pass.** `01…` Parts II and III; `02…` Parts I, II and III; the QA-folder `03…` end to
  end; `04…§§0–7`; `05…§§1–2.1, 6–9`; `06…§§4, 6–7`; `07…§§3–4`; `00…§3`; both folder READMEs and
  `PRODUCT-SOURCE.md`.
- **Mechanically verified at `73f459dae`** (§28): the `X-9` collision at both defining sites; the canonical
  plan's zero post-acceptance IDs before this revision; both copies' line counts; `02…` Parts II and III
  committed at `HEAD` (`X-5` closed); `invalidateAdminShellContextCache`'s production-caller count;
  the absence of every credential-disable verb and of OAuth/OTP sign-in; the three password inputs and zero
  reveal toggles; the 559 API route files; the four live wave-1 lock artifacts; the absent fixture matrix.
- **Not consulted.** Any application source beyond the six premise re-checks; the deployed database; the
  Director's live mission state; `wave0-authority-census.json` and `wave1-execution-evidence.json` beyond
  what §§4–5 already record.
- **New findings by this phase:** `X-9` (§26.1) — documentary. **No product defect is asserted.**
- **Method:** static and corpus-grounded. **No code, schema, migration, or UI was changed by this phase**,
  no request was issued, no browser used, and no decision answered. The only file written is this one.

---
---

# Part III — QA and evidence plan **[new — Mission 2, required output #12]**

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *QA and evidence plan* · assignment `asg_ae2d65e739f71c`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `hotfix/vacilando-ui-freshness-flash`
**Date** 2026-08-04
**Base** `a89a19625` — the corpus at `b7cfc3653` (`03…` Part II) plus `bd760ffa7` (`07…` Mission 2 refresh)
**Method** static and file-grounded. The acceptance runtime, the evidence runtime, this mission's compiled
objective, its brief, its package register, its acceptance ledger and its 59-artifact evidence gallery were
read this pass. **No code, schema, migration or UI changed. No test ran, no browser opened, no request
issued, no decision answered.**

> **What this part is.** §10 is the QA *architecture* for waves 0–5. This is the QA and evidence *plan* for
> everything the corpus now contains: a verification tier and an exit gate for each of the thirty-one new
> workstreams, the fixture matrix as a buildable artifact, the two-process harness as a design, the
> preflight-evidence contract for the migration register — and, because a plan that produces evidence nobody
> grades is not a plan, **an account of what actually decides "met" in this programme today.**
>
> The second half was not anticipated when §10 was written, and it is the more consequential half.

**Registers used.** Findings new this pass are `QE-1`…`QE-9` — a fresh namespace, per `07…§6`'s rule that
Mission 2 must not add a fourth colliding register. Evidence classes are `EA-1`…`EA-7`. Decisions continue
`07…§10`'s `DR-` register from `DR-8` **without renumbering anything**, on §25's precedent. **No existing ID
in this corpus is renumbered, merged or retired by this part.**

---

## 30. Why §10 does not already cover this

§10 was written on 2026-07-30 against waves 0–5 and amended in Part II. Three gaps remain, and each is the
reason for a section below.

| # | Gap | Closed by |
|---|---|---|
| 1 | **Thirty-one workstreams have no verification tier.** §10.1 tiers `I-1`…`I-25`; §§16–22 introduced `W-23`…`W-53` against `I-26`…`I-34`, `S-1`…`S-7`, `IA-R1`…`IA-R10` and `07/AU-1`…`AU-5`. §25 assigns each *lock* a tier; **no section assigns each *workstream* one**, and eight workstreams have no lock at all (`QE-9`) | §33 |
| 2 | **§10.4's exit gate is one paragraph for thirteen waves.** It is correct and it is generic. Waves 6–12 add four lockout classes (`L5`–`L8`), five migrations that are behaviour-preserving only if seeded correctly, and one wave that cannot be sized until a census answers | §34 |
| 3 | **There is no evidence contract.** §10 says what to *test*. Nothing says what artifact a workstream produces, in what schema, at what path, or what makes an artifact admissible rather than decorative. §4 and §5 each improvised one — well, and differently | §32, §37 |

And one gap that did not exist when §10 was written: **`07…` re-read the acceptance runtime line by line
(`bd760ffa7`) and established that most of its checkers are unavailable to a specification mission.** That
finding has a consequence for the evidence side of this plan which `07…` did not pursue, because it was
grading the mission and this document is planning the evidence. §31 pursues it.

**Two audiences, two clocks.** This part serves both and keeps them apart:

- **The product** — waves 0–12. Evidence is produced by tests, checks, censuses and browser runs, and is
  graded by the wave exit gates in §34. This is engineering evidence and it outlives the mission.
- **The mission** — the twelve specification deliverables. Evidence is produced by reproduce blocks,
  premise re-checks and coverage arithmetic, and is graded by the Vacilando runtime. §31 is about this one.

Confusing them is how a mission accumulates 59 evidence artifacts that no grader reads.

---

## 31. What actually decides "met" — four graders, four answers **[`QE-1`…`QE-8`]**

`07…§2` established what `acceptance.mjs` verifies. This section establishes something narrower and more
uncomfortable: **`acceptance.mjs` is not in the path for this mission at all**, and three other mechanisms
are. All eight findings below were verified mechanically this pass (§41) and **none is a product defect** —
they are defects of the evidence apparatus, in the same class as `X-1`…`X-9`.

### 31.1 The four mechanisms

| # | Mechanism | Source | Reads | Verdict for Mission 2 |
|---|---|---|---|---|
| **G1** | `evaluateMission` — the acceptance gate | `acceptance.mjs:257-273` | a *package*'s `acceptance_criteria[].evidence_required` | **never ran** — no package exists (`QE-3`) |
| **G2** | `acceptanceEvidenceCoverage` — the coverage view | `evidence.mjs:183-200` | the *brief*'s `acceptanceCriteria`, matched against artifact `acceptanceCriteriaIds` | **`AC1` = `missing`**, on 59 artifacts (`QE-2`) |
| **G3** | `vacilando.deliverable_review.v1` — the per-assignment review | `deliverable-reviews/<msn>.json` | the *objective*'s `acceptance_criteria`, plus seven automatic checks | **7 of 7 pass, `met`** — for all eleven accepted deliverables (`QE-4`) |
| **G4** | The operator | — | the document | the only one that read a word of it |

**Three registers of acceptance criteria exist for this mission, and no two agree.** The brief holds one
criterion; the compiled objective holds twelve; the assignment cards and the evidence gallery cite the
objective's twelve. G1 grades the first, G2 grades the first, G3 grades the second.

### 31.2 The findings

**`QE-1` — `evidenceType: "document"` is not an evidence kind.** All twelve of the objective's criteria
carry `"evidenceType": "document"` (`objectives/msn_f74ed02c126c88d7ff.json:231-303` **[verified]**).
`document` is a member of `EVIDENCE_TYPES` in the *evidence* runtime (`evidence.mjs:19-23` — `screenshot`,
`video`, `test`, `build`, `typecheck`, `browser`, `database`, `migration`, `diff`, `log`, `performance`,
`security`, `commit`, `notes`, `document`). It is **not** a member of the *acceptance* runtime's kind
vocabulary (`07…§2.1`'s ten: `file_exists`, `sections_present`, `git_clean_outside_docs`, `source_changed`,
`tests_pass`, `qa_evidence`, `migration_accounted`, `intent_fidelity`,
`rejected_patterns_not_reintroduced`). `checkEvidence("document", …)` matches no branch and reaches the
terminal `operator_review` at `acceptance.mjs:249`.

> **Two vocabularies share one field name.** `evidenceType` on a criterion is read by `checkEvidence` as a
> *kind*; the compiler fills it from the *artifact-type* enum. Every one of Mission 2's twelve criteria is
> therefore unautopassable by construction — **not because a specification is unverifiable, but because the
> field was filled from the wrong list.** This is `X-9`'s failure mode — one namespace, two registers — in
> code rather than in prose, and it is `DR-8`.

**`QE-2` — the graded register and the evidenced register are disjoint.** The brief holds exactly one
criterion: `AC1`, `evidenceType: null`, `phaseIds: []` (`mission-briefs/msn_f74ed02c126c88d7ff.json:20-27`
**[verified]**) — `07…§3`'s finding, re-confirmed. `acceptanceEvidenceCoverage` iterates
`getBrief(missionId).acceptanceCriteria` and links artifacts by
`(a.acceptanceCriteriaIds || []).includes(c.id)` (`evidence.mjs:186-188`). **Zero of the gallery's 59
artifacts name `AC1`**; all 59 name one of `AC_d1_existing_state`…`AC_d11_acceptance_rubric`. So the
coverage view reports the mission's only graded criterion as `missing` while the gallery holds 59 artifacts
attesting to eleven completed deliverables.

**`QE-3` — the acceptance gate never ran.** `missions/packages.jsonl` contains no package for
`msn_f74ed02c126c88d7ff`, and `acceptance/ledger.jsonl` contains no entry for it **[verified — zero matches
in both]**. `evaluateMission` persists a ledger row on every evaluation (`acceptance.mjs:276+`), so an
empty ledger is proof of absence, not of silence. **Everything `07…§§2–3` established about the gate is
correct and, for this mission, unexercised.** It matters anyway — `07…§9` tells the Director to apply it,
and Phase 5's implementation missions *will* be packaged.

> **What a package would have decided, had one existed.** The implement-mode template
> (`mission-package-compiler.mjs:124-130`) binds `AC1→source_changed`, `AC2→tests_pass`,
> `AC3→qa_evidence`, `AC4→rejected_patterns_not_reintroduced`, `AC5→migration_accounted`. Against a
> specification deliverable: `source_changed` **unmet** (no application source, and satisfying it would
> violate the brief); `tests_pass` **unmet** (a spec has no suite); `qa_evidence` **unmet** — the deliverable
> path is a `.md` file, `walkImages` (`acceptance.mjs:145`) reads it as a directory, fails, and returns
> zero images. Three unmet → `gate: "fail"` (`:273`). **A correctly-executed specification phase would have
> failed the gate outright**, which is a sharper version of `07…§4`'s point: the mismatch is not merely
> unhelpful, it inverts. All twelve of this mission's phases carry `"kind": "implement"`
> (`objectives/…json`, twelve occurrences **[verified]**) against a brief that forbids production code.

**`QE-4` — the review that did accept the work passes seven checks, none of which reads the document.**
The eleven `vacilando.deliverable_review.v1` records each report `"passed": 7, "total": 7`, every check
`"source": "automatic"`. The three load-bearing ones, quoted from the `AC_d1_existing_state` review
**[verified]**: `deliverables_exist` — *"Verified on disk"*; `acceptance_criteria` — *"Criteria in scope:
`AC_d1_existing_state`. Evidence references them"*; `evidence_present` — *"4 meaningful evidence item(s); 4
total attached."* **`met` in this programme means: the file exists at the declared path, the worker's
reported files were in scope, and the worker attached artifacts naming the criterion.** The
`acceptance_criteria` check is satisfied by the evidence *citing* the criterion — the worker supplies both
sides. That is not a criticism of the reviews; it is the honest reading of what they assert, and the
Director should read them as such.

**`QE-5` — any artifact marks a criterion passed.** `evidence.mjs:189-192`:

```js
const hasFail = linked.some((a) => a.exitCode != null && a.exitCode !== 0);
const status = !linked.length ? "missing" : hasFail ? "failed" : "passed";
```

There is no content predicate. A single `notes` artifact containing arbitrary prose yields `passed`.
**`exitCode` is `null` on all 59 artifacts** (`QE-6`), so `hasFail` is structurally unreachable for this
mission: the only way to fail coverage is to attach nothing.

**`QE-6` — no artifact in the gallery is reproducible.** Across 59 artifacts, six fields are `null` on every
one: `command`, `exitCode`, `repositorySha`, `branch`, `environment`, `verifiedBy` **[verified — 59/59 on
each]**. The `commit` artifacts carry their SHA in a free-text `description`, not in `repositorySha`. So no
artifact records what was run, whether it succeeded, or against which tree — the three things that
distinguish evidence from assertion. The runtime *has* the channel: `recordValidationRun`
(`evidence.mjs:129-169`) writes `{command, exitStatus, ok, branch, commitSha}` to `validation-runs.jsonl`.
**No `validation-runs.jsonl` exists for any mission on this host** **[verified — zero files]**.

**`QE-7` — the `diff` artifact is the working tree, not the deliverable.** Every criterion has exactly one
`diff` artifact, and its description is a cumulative `--stat` of the *uncommitted tree at report time*. Two
consequences, both visible in the gallery **[verified]**: `AC_d4_authentication`, `AC_d5_effective_access`,
`AC_d6_product_ia` and `AC_d7_security_matrix` each attribute four files under
`scripts/local-dev/apps/vacilando/` — **work belonging to a different branch's UI hotfix, not to Access &
Identity** — and `01-existing-state-inventory.md` appears in the diff for six criteria after the one it
belongs to. A deliverable's diff should be its own commit's; this is whatever happened to be dirty.

**`QE-8` — there is no evidence profile for specification work.** `EVIDENCE_PROFILES`
(`evidence.mjs:25-33`) defines seven: `code_only`, `execution_v1`, `execution_session_v1`, `ui`,
`migration`, `security`, `performance`. Mission 2's assignments used `execution_session_v1 = ["log",
"notes", "document"]` — which is why each criterion carries a `log`, a `notes` and a `document` artifact
**whose `description` fields are byte-identical**, the worker's completion summary repeated three times.
**59 artifacts carry roughly eleven distinct facts.** A specification profile — reproduce block, premise
re-check, citation lint, coverage count — does not exist, and §32 is the specification for one (`DR-10`).

### 31.3 What this means for the plan

Not that the accepted deliverables are bad — this document has read six of them closely and they are
strong. It means something narrower and load-bearing:

**No mechanism in this programme has yet distinguished a good deliverable from a file at the right path.**
`07…§9` already told the Director that `gate: "pass"` *"will not distinguish a phase that did excellent
work from one that did none."* `QE-1`…`QE-8` show the same is true of the three mechanisms that actually
ran. `07…§4`'s **`Count` mode** is the corpus's answer, and §32 is its evidence half: the artifact classes
that make a `Count` criterion checkable by someone who was not there.

---

## 32. The evidence contract — `EA-1` … `EA-7`

What a deliverable in this programme attaches so that its acceptance can be wrong. Each class states what
it is, who produces it, where it lives, and — the point — **what it lets a reader falsify.**

| # | Class | Produced by | Path / form | Makes falsifiable |
|---|---|---|---|---|
| **EA-1** | **Reproduce block** — the commands that establish the document's load-bearing claims, with expected output stated | the authoring worker | a `## Reproduce` section in the deliverable | every mechanical claim in the document. §28 and `07…§11` are the working examples |
| **EA-2** | **Premise re-check record** — the claims inherited from another document that this one *re-ran* rather than carried | the authoring worker | a table in the deliverable, marked **[verified this pass]** vs **[carried]** | the difference between "this document checked it" and "this document repeated it". §27.2's rule |
| **EA-3** | **Citation resolution** — every cross-document ID and `path:line` in the deliverable resolves | `RL-42` lint (`CR-1`…`CR-5`, `CV-1`) | CI check; failures listed in the deliverable | dangling citations, the failure `X-2`/`X-3` describe |
| **EA-4** | **Coverage arithmetic** — the `Count` predicate for each criterion the phase claims, with its expected number | the authoring worker | a table binding criterion → count → where counted | `07…§9.3`: *"a `Count` row that has not been counted is not `met`"* |
| **EA-5** | **Validation run record** — command, exit status, branch, commit SHA | `recordValidationRun` (`evidence.mjs:129`) | `validation-runs.jsonl` | that a check was run at all, and against which tree. **Currently unused by every mission on this host** (`QE-6`) |
| **EA-6** | **Provenance block** — inputs reused, text carried, what was read in full, what was *not* consulted | the authoring worker | a `## Provenance` section | scope claims, and the "reuse, do not re-derive" instruction the assignment carries |
| **EA-7** | **Negative control** — the check, run against a state it must reject, shown red | the workstream shipping the check | recorded in the wave evidence file | **vacuity.** `W-4`'s standard, promoted to a gate in §10.4 |

**Three rules govern the set.**

1. **An artifact nobody could have failed is not evidence.** `EA-7` is the general form of §10.4's
   *"a wave that ships a check must show the check going red"*, and §10.2's disqualification of the
   grep census is the same rule applied to a measurement. It applies to documents too: a coverage table
   that counts what was written, by the person who wrote it, against a target they chose, is `EA-4` in
   form and nothing in substance unless the target is the brief's.
2. **Prose is one artifact however many times it is attached.** `QE-8` is the concrete case. Three
   artifacts with identical `description` fields are one claim; the `evidence_present` check counts three
   (`QE-4`).
3. **An artifact carries what was run and against what.** `command`, `exitStatus`, `commitSha` — the
   `EA-5` fields. This is the single cheapest repair available to the apparatus, because the channel
   already exists and is called by nothing.

**Which classes apply.** Specification deliverables (Mission 2's twelve): `EA-1`, `EA-2`, `EA-3`, `EA-4`,
`EA-6` — and `EA-5` for any command the reproduce block actually ran. Implementation workstreams
(waves 0–12): `EA-5`, `EA-7`, plus §34's per-wave file. **`EA-7` is required of every workstream that ships
a check and of no workstream that does not** — which is the distinction §33's last column records.

---

## 33. Verification tier and lock, per workstream — `W-23` … `W-53`

§10.1's tiers, applied to Part II. `Fixture` cites §10.3/§35. `Lock` cites §25. **`EA-7`** marks a
workstream that ships a check and therefore owes a red-run; **`—`** marks one that ships behaviour only.

| Workstream | Tier | Fixture | Lock | `EA-7` | Note |
|---|:--:|---|---|:--:|---|
| `W-23` census | — (read-only) | — | **none** | — | Evidence *is* the deliverable: `wave0-authority-census.json` shape, Q1–Q14 with query text (§4.1) |
| `W-24` revocation effective | **C (2-proc)** + A | `F11` | `RL-16`, `RL-17` | ✅ | §36. A single-process pass is a false certification |
| `W-25` deactivation revokes | C | `F12` | `RL-18` | — | `L6` — needs `W-23` Q10 first |
| `W-26` account lifecycle | C + **D** | `F13` | `RL-19`, `RL-20` | — | `L5`. Largest new item; tier D required |
| `W-27` step-up on re-key | C | `F13` | `RL-21` | — | |
| `W-28` atomic authority writes | C + A | `F1`, `F5` | `RL-22` | ✅ | The A half is "no bare `DELETE` on a membership" |
| `W-29` delegation gate key | B + **D** | `F9` | **none** — see `QE-9` | — | `L7`, and **unlocked**. `M17` conditional on Q11 |
| `W-30` show/hide baseline | A | — | `RL-37` | ✅ | Cheapest in the plan; batch 2 |
| `W-31` server-side password policy | C | — | `RL-38` | — | The lock must call the API directly, not the form |
| `W-32` auth error text | A | — | `RL-29` | ✅ | Shared with `W-39` |
| `W-33` per-org auth policy record | C | — | **none** — `QE-9` | — | `M11`. Behaviour-preserving **only if** every org seeds to current behaviour |
| `W-34` request-identity mode | A + C | — | `RL-39` | ✅ | The lock exists to fail when the posture changes |
| `W-35` declared abuse control | A | `F16` | `RL-31` | ✅ | Includes "no limiter backed by a module-level `Map`" — the `S-2` twin of `QE`'s cache problem |
| `W-36` MFA by role | C | `F13` | **none** — `QE-9` | — | Unsizable until sitting 3 |
| `W-37` session / trusted device | C | `F13` | **none** — `QE-9` | — | Unsizable until sitting 3 |
| `W-38` credential-mail org bound | B + C | `F8` | `RL-27` | — | |
| `W-39` public surface tenancy | A + C | `F16` | `RL-28`, `RL-29` | ✅ | |
| `W-40` unauth side-effects | A + C | `F16` | `RL-30`, `RL-32` | ✅ | `RL-32` is the lock on what already works (§25) |
| `W-41` one resolver | A | `F1`–`F10` | `RL-25` | ✅ | The A check is "exactly one module computes an admission set" |
| `W-42` one normal form | A + property | **`F14`** | `RL-24` | ✅ | Property test over whitespace/case is the right shape here |
| `W-43` read errors deny | C + A | **`F15`** | `RL-23` | ✅ | One `F15` variant per resolver read |
| `W-44` retire role literals | A | — | `RL-26` | ✅ | |
| `W-45` no unread state | A | — | `RL-33` | ✅ | Batch 2; no decision |
| `W-46` member lifecycle projection | B | `F13` | **none** — `QE-9` | — | Sequence with `W-26` |
| `W-47` absent scope distinguishable | A + C | `F6` | `RL-34` | ✅ | Batch 2; `GAP-3`'s render leg |
| `W-48` effective access from resolver | B + C | `F1`–`F10` | **none** — `QE-9` | — | Closes `C11`/`IA-R4`; **unlocked, and it is the claim `W-21` failed to make** |
| `W-49` chapter gates on capability | A + **D** | `F3`, `F4` | `RL-36` | ✅ | `L8` — needs Q12 |
| `W-50` no inert capability | A | — | `RL-35` | ✅ | |
| `W-51` three IA cleanups | B | — | **none** — `QE-9` | — | Cosmetic; the absence is correct |
| `W-52` doc reconciliation | A | — | `RL-41` | ✅ | |
| `W-53` audit | C | `F1` | `RL-40` | ✅ | Do not size before Q7 (§27.3) |

### 33.1 `QE-9` — eight of thirty-one new workstreams carry no regression lock

`W-23`, `W-29`, `W-33`, `W-36`, `W-37`, `W-46`, `W-48`, `W-51` **[verified: §25 names 23 of the 31]**.
Four of the eight are benign — `W-23` is a census, `W-51` is cosmetic, `W-36`/`W-37` cannot be specified
before sitting 3. **Four are not:**

- **`W-29` is lockout class `L7` and has no lock.** It repoints the users-and-roles gate at a key the seed
  withholds. §2's ritual and `M17` protect the *switch*; nothing protects the *regression*.
- **`W-48` closes `C11`** — *effective access is computed by code that does not enforce* — which is the
  finding `W-21` was supposed to close and did not (§9). A second attempt at a finding that already
  escaped once is exactly where a lock belongs.
- **`W-33` ships `M11`**, whose safety claim is *"behaviour-preserving by construction"* (§11). A claim of
  that shape is a lock, unwritten.
- **`W-46`** projects the lifecycle `W-26` creates; if it drifts, the surface lies about account state —
  which is the `IA-R2` failure the workstream exists to fix.

**Proposed, not minted here.** Four locks continuing §25 (`RL-43`…`RL-46`, for `W-29`, `W-33`, `W-46`,
`W-48`) are the obvious repair, and this plan **records the gap rather than numbering it**, because §25 is
Part II's register and this is the same document — minting into it silently is how `X-1` happened. The
Director should either accept the four numbers or accept the gap knowingly.

---

## 34. Per-wave exit gates, waves 6–12

§10.4 applies unchanged and is not restated. Each wave below adds what is specific to it. **Every wave
produces one evidence file**, `waveN-execution-evidence.json`, in the `wave1-execution-evidence.json`
shape — which already carries the right fields (`method.red_before_green_after`, per-suite `red_before`,
the brokered `typecheck` block with its `request_id` and `rc`) and is the closest thing this programme has
to `EA-5` and `EA-7` in one artifact.

| Wave | Additional exit conditions |
|---|---|
| **0b** (`W-23`) | Q1–Q14 answered **with query text**, committed. Q6 re-run, not cited from 2026-07-31. **A wave that answers 12 of 14 does not close** — `W-19`, `W-15` and `W-53` are each sized against exactly one question |
| **6** (`W-24`…`W-28`) | The two-process harness exists and `RL-16` runs in it (§36). `M12`'s seed count **equals** Q9 — not "approximately", and re-counted at preflight, because `L5` denies every principal it missed. `W-26` carries tier D evidence for one principal per lifecycle state |
| **7** (`W-29`) | Q11 answered for **every** org. If any org lacks a holder, `M17` applied and re-verified **before** the gate moves. Tier D evidence from an `ops` principal *and* an `admin` principal — the gradient is the point |
| **8** (`W-30`…`W-37`) | `W-30`–`W-32` may close independently. **`W-33`–`W-37` do not open before sitting 3**, and the wave does not close on a partial: `07/AU-1`…`AU-5` are claimed together or not at all (§23.6) |
| **9** (`W-38`…`W-40`) | Q14's handler-level census exists and `W-40`'s exemption list is enumerated, reviewed and **shrinking** (`RL-30`). `RL-32` green *before* `W-39` and *after* — it locks what already works |
| **10** (`W-41`…`W-44`) | One module computes admission (`RL-25`) proven by the check going red against the pre-`W-41` tree. `F14` and `F15` built. **`W-42` before `W-48`** — a preview that matches a runtime with two normal forms matches by luck |
| **11** (`W-45`…`W-52`) | `W-49` carries tier D per access chapter (`L8`). `W-48` demonstrates preview ≡ runtime across the **whole** fixture matrix, not a sample — §2's "prove zero divergences" is a universal claim |
| **12** (`W-53`) | Q7 answered first. If Q7 returns nothing, the wave is *build an audit store*, `W-53` is re-sized, and the rubric claim changes from "extend" to "establish" (§4.1) |

### 34.1 Tier D — the only place a screenshot is both required and consumed

Four lockout classes in Part II demand browser evidence: `L5` (`W-26`), `L6` (`W-25`), `L7` (`W-29`),
`L8` (`W-49`). The worktree contract's format is the required one — **route, steps, expected vs observed,
console errors, failed requests, evidence path** — on `http://localhost:3020` with the slot-6 QA identity,
never production, and never claimed from code inspection.

**And it is the one artifact the acceptance runtime actually reads.** `qa_evidence` walks a *directory* for
`.png`/`.jpg`/`.jpeg`/`.gif`/`.webp` (`acceptance.mjs:30`, `:145`). So for implementation phases the
evidence path declared on the package must be **a directory containing images** — which is precisely what
tier D produces and precisely what a specification phase cannot (`QE-3`). Wave 6's and wave 11's
lockout-class workstreams are the phases where `qa_evidence` becomes a real check rather than a category
error, and the plan should let it be one.

---

## 35. The fixture matrix, as a buildable artifact

§10.3 lists sixteen fixtures and §14.3.6 records that ten of them were never built. Listing them again
would repeat the debt. This specifies the module.

**Path** `web/tests/access/fixtures/principals.ts` — one module, imported by tiers B, C and D. Not inline
in a suite; §10.4's amended gate turns on "exists as a shared artifact."

**Shape** each fixture exports a builder returning the `AdminAccessContextSuccess` shape the existing
convention already uses (`web/tests/admin/usersRolesAuth.test.ts:6-19` **[carried]**), plus, for tier C,
the SQL to materialize the same principal against a real database. **One definition, two materializations**
— because a fixture that means one thing to a unit test and another to an integration test is how a
preview diverges from a runtime, which is `C11`.

| Batch | Fixtures | Why then |
|---|---|---|
| **2** | `F1`–`F10`, **`F11`**, `F12` | §10.3 already places the matrix first in batch 2: `W-24` cannot be tested without `F11`, `W-25` without `F12` |
| **4** | `F13` | Five lifecycle states; cannot be defined before `AD-5` fixes the state grain |
| **5** | `F14` | With the vocabulary work, not after it |
| **3** | `F15` | With `W-43`; one variant per resolver read |
| **9** | `F16` | With the unauthenticated surface |

**Three fixtures encode defects and must invert.** `F6` (membership, no profile), `F7` (`user_profiles.role`
only) and `F10` (service-role client, no principal) resolve to *access* today and must resolve to *denial*
after their workstream lands (§10.3). Each is therefore an `EA-7` in fixture form: **built before the fix,
asserting the current wrong behaviour, then inverted with the diff shown.** A fixture written after its fix
proves the fix agrees with itself.

**`F13` is the one that cannot be written yet**, and it is stated here so its absence is a scheduling fact
rather than an oversight: `AD-5` decides whether account state is per `(user, org)` or per credential
(§24.2). `F13` is five principals under the first reading and a different object under the second.

---

## 36. The two-process harness — a design, not a requirement

§10.5 establishes *that* `I-29`ᴬ needs two processes and why a single-process test *"passes for the wrong
reason."* This specifies the harness, and corrects one clause of §10.5 in the process.

**§10.5 says nothing in this repository's test conventions runs two processes. That is very nearly true,
and the exception is the design.** `web/tests/processing/processingIdentityLocalPostgres.test.ts:10-31`
**[verified this pass]** runs `execSync('node <certScript>')` from inside a Vitest case, against
`DATABASE_URL` on port 54322, under `describe.skipIf(!localDbConfigured)`. **The test process is process A;
the spawned script is process B; both talk to one database.** That is the entire mechanism `RL-16` needs.
It is one file out of 2380 **[verified: exactly one test file in `web/tests/` imports `node:child_process`]**
— so §10.5's conclusion stands, but the harness is a **generalization of an existing pattern, not a new
capability**, which changes its cost and should change its scheduling.

**The shape.**

| Step | Process | Action |
|---|---|---|
| 1 | **A** (the Vitest process) | Resolve the fixture principal. Assert access granted. **The cache is now warm in A** |
| 2 | **B** (spawned) | Perform the revocation through the real write path — the same call the product makes |
| 3 | **A** | Resolve again. **Assert denial** |
| 4 | **A** | Assert the denial came from a re-read, not a restart: A's PID is unchanged across steps 1 and 3 |

**Step 4 is not ceremony.** Without it the harness can be satisfied by a fresh process, which is the
single-process failure wearing two hats. Gate it on an explicit env opt-in in the `*.live.test.ts`
convention (`web/tests/runtime/d1ProvisioningBudget.live.test.ts:14-24` **[carried]**) so CI never depends
on a local stack.

**What else it certifies.** `S-2`'s rate limiter has the same defect — a module-level `Map`, per process,
failing permissive (`01…§17`, `§14.3`) **[carried]**. `RL-31` asserts *"no limiter's backing store is a
module-level `Map`"* statically; the harness can assert it behaviourally, from the same fixture. **Both of
this platform's security-relevant in-process maps are testable by one runner**, which is the argument for
building it as a runner rather than as a test.

**`W-23` Q8 prices it; it does not gate it.** §10.5 consequence 2, `02…§27`'s rule, and §24.3 all say the
same thing and it is repeated here because this is where an implementer would be tempted to wait: **if Q8
reports one long-lived process, build the harness anyway.** The deployment can grow to two without the
suite noticing.

---

## 37. Preflight evidence for the migration register

§11 registers seventeen migrations and two conditionals and states the apply gate. This states the
*evidence*, because `acceptance.mjs` enforces a specific shape and §11 does not name it.

**Verified this pass** (`acceptance.mjs:193-219`): for a migration whose `status` is
`awaiting_authorization` and whose `target` matches `/^(shared|live|staging|production)$/i`, a missing or
non-object `preflight` returns **`unmet`** — not `operator_review` — and `preflight.ok !== true` returns
`unmet` with the summary quoted back. Only `preflight.ok === true` reaches `operator_review`. **Every one of
`M1`–`M18` targets `shared`** (§11), so every one is subject to this.

**The artifact.** `migrations[].preflight = { ok, summary, evidence_path }` in the vacilando report, with
the JSON evidence at `evidence_path` under the QA directory, produced by the trusted host action
`database.read_census` — the channel `W-0` established and `§4`'s execution record recommends for *"every
remaining live-evidence step in this programme"* **[carried]**.

**Preflight query, per migration.** §11's `Preflight focus` column is the specification; four need naming
here because their query is not obvious from the column:

| Migration | The preflight must establish | Why it is not obvious |
|---|---|---|
| `M12` (`W-26`, `L5`) | Row count **equals** `W-23` Q9, and every existing `(user, org)` seeds to `active` | An incomplete seed denies every principal it missed, on every request, in every org |
| `M13` (`W-53`) | **Whether an audit store already exists** | It is Q7, not a safety check — §11 says so, and `M13` *"cannot be sized, let alone written, before Q7 answers"* |
| `M14` (`W-28`) | Every membership backfills to its current effective state; **the migration deletes no row** | A partial backfill leaves memberships in no state at all |
| `M17` (`W-29`, `L7`) | Q11 returns an org without a holder — **the trigger, not the safety check** | A conditional migration written before its census acquires a `WHERE` clause nobody can justify |

**Two rules carried from the apply gate** and repeated because §11 says a phase shipped against them once:
preflight `ok: true` **does not auto-apply**, and **accept ≠ authorize-apply** — a gate of `needs_operator`
must not complete a phase or advance the spine, even in autonomous mode.

**This phase applies no migration, writes no SQL, and runs no preflight.** §11 remains a register.

---

## 38. The evidence ledger — what proves what

Two tables. The first is the product; the second is this mission. Neither asserts sufficiency —
`07…§12.3`'s *"presence, not sufficiency"* governs both, as it governs §23.

### 38.1 Product — rubric criterion → wave → evidence

Rows are `07…§14`'s implementation criteria, bound to waves by §23.6 and to evidence by §§33–34. The
`07/` prefix is `X-9`'s interim convention (§26.1).

| Criteria | Wave | Tier | Evidence artifact |
|---|---|:--:|---|
| `07/AI-1`…`AI-3` | 6 | C | `wave6-execution-evidence.json` + `AD-19` ratification |
| `07/AI-4`, `AI-5` | 6 | C + **D** | tier D per lifecycle state; `07…§3.1` calls `AI-5` *"the highest-value single test in this rubric"* **[carried]** |
| `07/AR-1` | 4, 11 | A + D | `W-14`'s declared table + `W-49`'s chapter gates — four layers, four counts |
| `07/AR-2`, `AR-3` | 10–11 | A + C | `RL-24`, `RL-25`; `AR-3` is `IA-R4` and is `W-48`'s claim |
| `07/AR-4`, `AR-5`, `AR-7` | 11 | **Review** | no checker decides these — `07…` says so and this plan does not pretend otherwise |
| `07/AR-6` | 3 | A | catalog reconciliation (`M5`) with its enumerated deletion list |
| `07/AR-8` | 11 | A + C | `RL-34`. **1 of 6 states representable today** (`01…§28.3`) **[carried]** |
| `07/AU-1`…`AU-5` | 8 | A + C | `RL-37`, `RL-38`, `RL-39` + `M11`'s preflight. **Claimed together** (§34) |
| `07/AE-1` | 4 | A | *"must be a static property, not a sampled test"* **[carried]** — `W-14`'s table, not `W-15`'s sweep |
| `07/AE-2` | 4 | A | action registry |
| `07/AE-3` | 5 | A + C | `W-19`; satisfiable two ways, one of which **is** `AD-4` |
| `07/AE-4` | 11 | A + D | `RL-36` |
| `07/AE-5` | 4–5 | C | one test per boundary |
| `07/AE-6` | 5, 7 | B + D | `W-2` ✅ covers the self-edit half; `W-29` the delegation half |
| `07/AD-1`…`AD-5` | 12 | C | `RL-40`. **Read `X-9` before citing these by number** |

### 38.2 Mission — specification criterion → evidence class

`RB-` is `07…§6`'s register. The `EA-` column is this plan's contribution: what a phase attaches so its
`Count` is checkable by someone who was not there.

| Criterion | Mode | `EA` classes | The count, and where it comes from |
|---|:--:|---|---|
| `RB-24` all 18 deliverables reachable | Count | `EA-3`, `EA-4` | 18 from **one** index. `README.md` is the candidate and it currently indexes 4 of 8 numbered documents (`X-2`) |
| `RB-25` each states provenance | Count | `EA-6` | 18 rows, each **new** / **refreshed** / **carried** with a base commit |
| `RB-26` no unfalsifiable criterion | Count | `EA-4` | zero criteria with a null evidence type. **`QE-1` shows the roadmap would inherit twelve** if the compiler is not fixed first |
| `RB-27` implementation-readiness | **Review** | `EA-1`, `EA-2` | operator judgment; `EA-1`/`EA-2` are what the operator reads *instead of* re-deriving |
| `PG-1`…`PG-12` | gates | `EA-3`, `EA-6` | every phase, every time — *"a principle preserved in four phases and broken in the fifth is broken"* **[carried]** |

**`RB-26` is where `QE-1` bites.** The criterion asks that no acceptance criterion the roadmap proposes be
unfalsifiable. The roadmap is produced by a mission whose own twelve criteria are unfalsifiable by the
runtime (`QE-1`) and whose brief-level criterion has been unfalsifiable for three consecutive missions
(`07…§3`, `M3`). **A roadmap that propagates that pattern satisfies its own criterion only by not being
checked**, which is `DR-7` and now also `DR-8`.

---

## 39. Decisions this part raises — `DR-8` … `DR-12`

Continuing `07…§10` without renumbering, on §25's precedent. **None is worker-resolvable**; each is
recorded with a recommendation and **not performed**.

| # | Decision | Recommendation |
|---|---|---|
| `DR-8` | **`evidenceType` is filled from the artifact-type enum, not the checker-kind enum** (`QE-1`). All twelve of this mission's criteria therefore reach the terminal `operator_review` | Constrain the field to the checker vocabulary at compile time and fail loudly on an unknown kind. A criterion that silently means "ask a human" is indistinguishable from one that was never specified |
| `DR-9` | **Which criterion register is authoritative — the brief's `AC1`, or the objective's twelve?** (`QE-2`) The coverage view grades the first, the deliverable reviews grade the second, and 59 artifacts cite the second | The objective's. It is well-formed, per-deliverable, and already used by everything that runs. Then `AC1` should be derived from it, not authored beside it |
| `DR-10` | **Should a `specification` evidence profile exist?** (`QE-8`) `execution_session_v1` emits the same prose three times; there is no profile for reproduce-block / premise-recheck / coverage-count work | Yes — `EA-1`…`EA-4`, `EA-6` (§32). It is a one-line addition to `EVIDENCE_PROFILES` and it is the difference between 59 artifacts and eleven facts |
| `DR-11` | **Should coverage require one attributable artifact?** (`QE-5`, `QE-6`) Any artifact with a null `exitCode` marks a criterion `passed`; all 59 have null `exitCode`, `command` and `repositorySha` | Yes — at least one artifact per criterion carrying `command` + `exitStatus` + `commitSha`, i.e. one `recordValidationRun` call. The channel exists and **no mission on this host has ever used it** |
| `DR-12` | **Should the four `RL-43`…`RL-46` locks be minted?** (`QE-9`) Four workstreams with no regression lock, including one lockout-class (`W-29`) and one re-attempt at an escaped finding (`W-48`) | Yes, and by the Director rather than by a worker appending to §25 — which is how `X-1` happened |

**`DR-8` and `DR-11` are the two that change what "accepted" means.** The others improve the record;
those two make it possible for an acceptance to be wrong.

---

## 40. Limits — read before citing

§14 bounds the accepted plan; §27 bounds the Part II re-sequencing. These bound **Part III**.

1. **No product defect is asserted here.** `QE-1`…`QE-10` concern the *evidence apparatus* — the compiler,
   the acceptance runtime, the evidence runtime and this mission's own records. Not one is a finding about
   Access & Identity. The product findings in §§33–38 are **[carried]** from their owning documents.
2. **Nothing in §31 was executed.** `evaluateMission`, `acceptanceEvidenceCoverage` and
   `recordValidationRun` were **read**, and this mission's on-disk state was **read**. The verdicts in
   §31.1 are derived from source plus state, not observed. `QE-3`'s *"never ran"* is inferred from an empty
   ledger and an absent package — strong, but it is an absence.
3. **§33's tiers are assignments, not estimates of effort.** A tier says where an invariant is cheapest to
   assert. It does not say the assertion is easy, and for `W-26`, `W-33` and `W-53` the sizing caveat in
   §27.3 governs — those workstreams are calibrated against a *description* of the codebase.
4. **§34's exit gates cannot be complete for wave 8.** Six decisions gate it and *"until they are answered
   `03` cannot even size it"* **[carried]**. The wave-8 row states a rule about closing, not a set of
   conditions to satisfy.
5. **§35 specifies a module that does not exist**, and §36 a harness that does not exist. Neither was
   written this pass. The `execSync` precedent is real and verified; the generalization is a design.
6. **§37 ran no preflight and §33 ran no test.** No query was issued against any database, no suite
   executed, no browser opened. `M13`'s preflight in particular *cannot* be specified further until
   `W-23` Q7 answers.
7. **The `QE-` register is nine findings, not a defect count.** `QE-1`…`QE-8` are eight readings of one
   underlying condition — *the evidence apparatus has three vocabularies and no content predicate* — and
   quoting "eight defects in the acceptance runtime" would repeat the arithmetic error `01…§29` deflates
   (§27.9). `QE-9` is independent and is about this plan, not the runtime.
8. **§38.2 does not claim Mission 2 satisfies `RB-24`…`RB-27`.** It says what evidence would make each
   checkable. `07…§6.6` records five partials and one thin row; nothing here closes any of them.
9. **`DR-8`…`DR-12` are escalations.** No code was changed to fix `QE-1`, no register renumbered to fix
   `QE-2`, no profile added for `QE-8`. Each would be a change to `scripts/local-dev/lib/vacilando/` —
   application source, which this phase's brief forbids and this document did not touch.
10. **This part is written to the product-source folder**, which `07…§2.4` establishes is **outside**
    `ALLOWED_CHANGE_PREFIX`. That is `X-2`/`DR-4` and it is unresolved; this deliverable follows its
    assignment's scope, exactly as §26.2 records `03`'s Part II doing, and adds one more file to the count
    `DR-4` tracks. **Knowingly, and it is not a worker's call to fix.**

---

## 41. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ a89a19625
V=$HOME/.local/state/alloy-dev/vacilando
A=scripts/local-dev/lib/vacilando/acceptance.mjs
E=scripts/local-dev/lib/vacilando/evidence.mjs

# --- QE-1: evidenceType is filled from the ARTIFACT enum, not the CHECKER enum
rg -n '"evidenceType"' $V/objectives/msn_f74ed02c126c88d7ff.json | head    # 12 x "document"
rg -n 'EVIDENCE_TYPES = new Set' -A 5 $E                                   # :19-23 — "document" is here
rg -n 'if \(kind === "' $A                                                 # the checker kinds — it is not
rg -n 'evidence kind .* is not auto-verifiable' $A                         # :249 terminal operator_review

# --- QE-2: the graded register and the evidenced register are disjoint
rg -n '"id": "AC' $V/mission-briefs/msn_f74ed02c126c88d7ff.json            # exactly one: AC1
G=$V/evidence/msn_f74ed02c126c88d7ff/gallery.json
rg -c '"evidenceId"' $G                                                    # 59 artifacts exist
# the criterion IDs the artifacts actually cite — 59 lines, AC_d1..AC_d11, no AC1.
# (a bare `rg AC1` returns 3, all inside prose descriptions — match the array element.)
rg -o '^\s+"AC[A-Za-z0-9_]*"' $G | rg -o 'AC[A-Za-z0-9_]*' | sort -u | tr '\n' ' '; echo

# --- QE-3: no package, no ledger entry — the acceptance gate never ran
rg -c 'msn_f74ed02c126c88d7ff' $V/missions/packages.jsonl                  # 0
rg -c 'msn_f74ed02c126c88d7ff' $V/acceptance/ledger.jsonl                  # 0
rg -n '"kind": "implement"' $V/objectives/msn_f74ed02c126c88d7ff.json | wc -l   # 12 phases + 1
rg -n 'evidence_required' -B 1 scripts/local-dev/lib/vacilando/mission-package-compiler.mjs | head -20
rg -n 'IMAGE_EXTS|walkImages\(qaAbs\)' $A                                  # :30, :145 — qa_evidence wants images

# --- QE-4 / QE-5: what "met" asserts
rg -n '"passed": 7|"source": "automatic"|Evidence references them' \
   $V/deliverable-reviews/msn_f74ed02c126c88d7ff.json | head
rg -n 'const hasFail|const status = !linked.length' $E                     # :189-192 — no content predicate

# --- QE-6: no artifact is reproducible; the channel that would fix it is unused
for f in command exitCode repositorySha branch environment verifiedBy; do
  printf '%s: ' "$f"; rg -c "\"$f\": null" $G; done                        # 59 each
ls $V/evidence/*/validation-runs.jsonl                                     # no such file, any mission
rg -n 'export function recordValidationRun' $E                             # :129 — the unused channel

# --- QE-7: the diff artifact is the working tree, not the deliverable
rg -n 'apps/vacilando/public/app.js' $G                                    # 4 Access criteria, foreign files

# --- QE-8: no specification evidence profile
rg -n 'EVIDENCE_PROFILES' -A 9 $E                                          # 7 profiles; none for specs

# --- QE-9: eight of the 31 new workstreams carry no lock in §25
# §25's rows name 23 distinct workstreams; W-23..W-53 is 31. The 8 absent are
# W-23, W-29, W-33, W-36, W-37, W-46, W-48, W-51.
P=docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
rg '^\| \*\*RL-' $P | rg -o 'W-[0-9]+' | sort -u -V | tr '\n' ' '; echo

# --- §36: the two-process precedent that already exists
rg -ln 'node:child_process' web/tests/                 # exactly 1 file
rg -n 'execSync|skipIf' web/tests/processing/processingIdentityLocalPostgres.test.ts   # :2, :15, :17

# --- §35: the fixture matrix still does not exist
ls web/tests/access/                                   # four suites, no fixtures module
```

---

## 42. Provenance — Part III

- **Inputs (reused, not re-derived).** `03…` Parts I and II — the wave map, `W-0`…`W-53`, the lockout
  classes, §10's QA architecture, §11's migration register, §25's locks, §23's coverage and §26's
  integrity findings. `07-director-acceptance-rubric.md` at `bd760ffa7` — §2's checker vocabulary, §2.3's
  first-deliverable rule, §2.4's allowed path, §4's `Count` mode, §6's `RB-` criteria, §10's `DR-1`…`DR-7`.
  `01…` Parts II and III, `02…` Parts II and III, `04…`, `05…`, `06…` — through `03…`'s bindings, not
  re-read end to end this pass. [`MIGRATION-APPLY-GATE.md`](../vacilando-os/MIGRATION-APPLY-GATE.md).
- **Read this pass, in source.** `scripts/local-dev/lib/vacilando/acceptance.mjs` (`:1-280`),
  `evidence.mjs` (`:1-200`), `mission-package-compiler.mjs` (`:75-131`);
  `web/tests/processing/processingIdentityLocalPostgres.test.ts`; `ls web/tests/access/`.
- **Read this pass, in runtime state.** `objectives/`, `mission-briefs/`, `compiled-missions/`,
  `deliverable-reviews/`, `evidence/…/gallery.json`, `missions/packages.jsonl`,
  `acceptance/ledger.jsonl` for `msn_f74ed02c126c88d7ff`. **Read-only. Nothing in
  `~/.local/state/alloy-dev/` was written by this phase.**
- **Mechanically verified** (§41): the twelve `evidenceType: "document"` values and their absence from the
  checker vocabulary; the brief's single `AC1`; 59 artifacts, zero naming `AC1`; the empty package and
  ledger; twelve `"kind": "implement"` phases; `qa_evidence`'s image-only walk; the seven automatic review
  checks and their details; the coverage status expression; six fields null on 59 of 59 artifacts; the
  absent `validation-runs.jsonl`; the foreign files in four criteria's diff artifacts; the seven evidence
  profiles; the eight unlocked workstreams; the single `child_process` test and its shape; the still-absent
  fixture module.
- **New findings by this phase:** `QE-1`…`QE-9` — **all documentary or apparatus-level. No product defect
  is asserted.** New decisions escalated, not answered: `DR-8`…`DR-12`.
- **Not consulted.** The deployed database; any application source under `web/app` or `web/lib`; the
  running Director; the frozen QA copies, which are untouched.
- **Method.** Static and file-grounded. **No code, schema, migration or UI was changed. No test ran, no
  typecheck, no build, no browser, no request, no query. No decision was answered and no ID renumbered.
  The only file written is this one.**

---
---

# Part IV — The reopen re-sequence **[new — 2026-08-06]**

> **Trigger.** Five documents were reopened on 2026-08-06 against the operator's two directives — *reduce
> the role hierarchy to four layers* and *simplify the role editor without changing the access
> architecture*. They created roughly sixty identifiers, one of them the corpus's only **S1**. **This plan
> named none of them** (`01…§58`, `§61`). Part IV is the re-sequence that `GAP-17` says nothing in the
> process performs.
>
> **Parts I–III are unmodified.** Part IV extends them: waves **13** and **14**, workstreams
> **`W-54`…`W-62`**, four ordering constraints (§1.6–§1.9), census questions `Q15`…`Q17`, locks
> `RL-47`…`RL-56`, migrations `M19`…`M21`, decision `DR-13`, and §52 — every reopen ID **bound to a
> workstream or declared unassigned with a reason**. Six existing workstreams are amended in place.

---

## 43. What this part is, and what it refuses to be

`01…§67` states the position this part inherits, and it is the reason Part IV is a *schedule* and not a
sixth specification:

> *"the corpus has now spent five reopen passes on two directives and produced ~60 identifiers, four
> counts and zero scheduled work… a sixth documentary pass would produce a seventh register rather than a
> built screen"* (`01…:2535-2538`) **[carried]**.

**So Part IV mints no finding.** Every product claim below is carried from the document that owns it, with
its evidence. Part IV's own new material is confined to the four things a plan of record is for:

| | What Part IV adds | Why it is this document's job and not another's |
|---|---|---|
| **1** | **Workstreams** — `W-54`…`W-62`, in two waves, sized, gated, exited | `GAP-16`: five documents specify the role editor and *"no workstream builds it"* (`01…:2411`) **[carried]** |
| **2** | **The merge `GAP-16` says no artifact performs** — §46 is one buildable description of the editor, assembled from `01…§40-42`/`§52`, `02…§4.6`/`§17.8`, `04…§6.4`, `05…§5A.4-5A.6` and `06…§15` | `01…§63.2`: *"An execution phase handed this assignment today would have to perform that merge itself, **unreviewed**"* (`01…:2418-2419`) **[carried]**. Performing it in the plan is what makes it reviewable |
| **3** | **The depth reduction in the plan's own unit** — §45 says which workstreams move which count, and what "done" is for each | `GAP-15`: the reduction *"has no agreed baseline, and therefore no definition of done"* (`01…:2373`) **[carried]** |
| **4** | **Coverage** — §52 binds every reopen ID or declares it unassigned | `GAP-17`, and the discipline §23 established for Mission 2 |

**Three refusals, each of them a document-authority boundary.**

1. **Part IV does not author the four-count reconciliation table.** `01…§62` proposes it *"in `02…` where the
   canonical model lives"* (`01…:2376-2377`) **[carried]**. §45 gives the **schedule** form of the reduction
   — which workstream moves which layer — and cites the four counts without arbitrating between them. If
   `02…` later publishes the reconciliation, §45 binds to it and does not compete with it.
2. **Part IV does not answer `D-RM1` / `AD-25`.** It sequences *both* readings: §46 is the wave that is
   correct under either, §47 is the wave that exists only under the architecture reading, and §51 schedules
   them so that the decision arrives before the first workstream that depends on it — not before the wave.
3. **Part IV renumbers nothing outside its own citations.** `01…§18`'s rule stands. Where a collision makes
   a binding ambiguous, §56 states the disposition, applies it **inside Part IV only**, and escalates the
   source-document fix.

> **One consequence of refusal 2 is worth stating plainly, because it is the difference between this
> re-sequence and a sixth specification.** `01…§67` finds the cheap work *"real and unblocked… **None is
> scheduled**."* §46's first three workstreams — `W-54`, `W-55`, `W-56` — need **no decision, no migration,
> no resolver change, and no answer to `AD-25`**. They are scheduled into batch 2 by §51. That is the whole
> of Part IV's claim to have moved the directive forward.

---

## 44. `DR-13` — the trigger rule `GAP-17` asks for

Continuing Part III's `DR-8`…`DR-12`; `DR-12` is the high-water mark **[verified this pass]**.

`GAP-17` is not a product defect and not a knowledge gap. It is a **process defect with a mechanical form**:

> *"`03` can only ever be current as of its last sequencing pass, and the corpus reopens per-document on
> operator guidance. **Nothing in the mission's process makes a reopen trigger a re-sequence.** Until
> something does, every reopen produces exactly this gap, and the gap analysis discovers it one phase
> later"* (`01…:2326-2330`) **[carried]**.

It has now happened twice — Mission 2's thirty-four findings, then the reopen's sixty — with *"a careful
pass on each side of it"* (`01…:2323`) **[carried]**. A defect that recurs at scale is a property of the
system, and the repair is not diligence.

> **`DR-13` — does a reopen of any corpus document oblige a re-sequence of this plan before its findings
> may be built?**
>
> - **(a) Yes, mechanically.** `RL-56` (§54) fails the docs lint when any register ID exists in a corpus
>   document and is named nowhere in `03…`. A reopen then cannot be *merged* without either binding its IDs
>   here or declaring them unassigned. **Recommended.** It is the same instrument `RL-42` already applies to
>   `CR-1`…`CR-5` and `CV-1`, extended by one check, and it is the only option that does not depend on the
>   next pass remembering.
> - **(b) Yes, by convention.** The reopening phase writes its own coverage row into §52. Cheaper to adopt,
>   and it is precisely what did not happen on 2026-08-06 across five documents.
> - **(c) No.** The plan is re-sequenced when the Director commissions a sequencing phase. Then §52 is a
>   snapshot with a date on it, `GAP-17` stays open by decision rather than by omission, and every
>   acceptance rubric must state which pass it was written against.

**Why this is `DR-` and not `AD-`.** `02…§37`'s clause 4 requires new *access-model* decisions to be minted
into `AD-n`. `DR-13` decides nothing about access: it is a delivery-process decision about this artifact,
which is the register `DR-8`…`DR-12` were created for (§39). **The distinction is load-bearing** — minting
it as `AD-26` would put a documentation-process question into a sitting alongside revocation.

**Cost, stated so the recommendation can be refused knowingly.** Option (a) makes `RL-56` red on the day it
lands, because §52 is complete only as of this pass. Every subsequent reopen pays a coverage row. That is
the intended cost: it converts `GAP-17` from a discovery into a build-time failure.

---

## 45. What "four layers" means as a schedule — `GAP-15` in this plan's unit

`GAP-15` is the measurement gap the operator's instruction turns on: four counts of one chain, two of them
reconciled, no artifact holding them side by side, therefore *"no defined starting number and no defined
completion"* (`01…:2350`) **[carried]**.

**This plan's unit is the workstream, not the layer.** So the question Part IV can answer — and the one an
execution phase actually needs — is not *which count is right* but **which workstreams move which count, and
what evidence closes each**. That is stated below without arbitrating between the counts.

### 45.1 The four counts, and the workstream set each names

All four are **[carried]** from their owners; the divergence is `01…§62`'s **[carried]**.

| Count | Owner | Unit | Today | The workstreams that move it | Complete when |
|---|---|---|:--:|---|---|
| **Stores and mappings a grant traverses** | `01…§38` (`RM-2`) | derivation steps | **8** | `W-20` (L2 legacy) · `W-13` (L8 bypass) · `W-9`/`W-10` (L6 grid) · **`W-60`** (L5 views) | `W-62`'s enumeration returns four **[new]** |
| **Layers of derivation in the canonical model** | `02…§1.3` | model layers | **4** (+2 branches) | **none — already met.** `W-8` and `W-17` protect it (`02…§15.6`) | Already met; `W-62` locks it |
| **Schema chain vs runtime chain** | `04…§3.6`, `§12.1` | enforcement points | **4 / 5** | **`W-13`**, and only if `AD-22` answers both halves | No admission predicate satisfies a capability gate (`I-35`ᴮ) |
| **Everything the resolver consults** | `05…§5A.2` | 9 stores + 3 derivations | **14** | `W-20` (rows 4–6) · `W-13` (row 7) · `W-9`/`W-10` (rows 10–11) · `W-60` | 14 rows fold to the four nouns without a legacy read |
| **Operator nouns** | `05…§5A.5`, presented `06…§15` | authoring layers | **4** | `W-54`…`W-59` (wave 13) | Capability has a home; navigation depth ≤ 4 (`IA-R12`) |

**Read the "today" column and the reason the instruction reads as contradictory becomes arithmetic.** Two of
the five counts are *already four*. `01…§62`'s second consequence says the same thing from the other side:
*"the directives read as contradictory only under one count"* (`01…:2364`) **[carried]**.

### 45.2 The two reductions are different work, and this plan now says so in workstream numbers

| | **The operator's four layers** | **The chain's depth** |
|---|---|---|
| Count moved | `05…§5A.5` / `06…§15` — nouns | `01…§38` / `05…§5A.2` — stores |
| Wave | **13** (§46) | **14** (§47), plus `W-20`, `W-13`, `W-9`/`W-10` amended |
| Architecture? | **No** — `05…§5A.6` items 1–4; `01…§42`'s first five | **Yes, by any reading** — `01…§37` `RM-1` |
| Gated on `AD-25`? | **No.** Correct under both readings | **Yes**, for its scope; `AD-22` for the L8 half |
| Security effect | Three of five items need a control attached (`RM-11`) | Closes one **S1** and two **S2** (`RM-9`) |
| Hard constraint | `H2` — a grant save preserves the 14 keys the grid cannot display | `RM-10` — L8 must not go before L4 is seeded **and** enforced |

`RM-7` is the recommendation both halves rest on: *"the two directives are separable, and separating them is
the recommendation… Attempting both under one instruction is how a phase ends up changing a gate while
believing it changed a screen"* (`01…:1623-1626`) **[carried]**. **Waves 13 and 14 are that separation,
executed.**

### 45.3 The definition of done `GAP-15` asks for

> **`W-62` (§47) is the acceptance criterion.** *"Four layers"* is met when a single declared enumeration of
> the resolution layers exists in code, the resolver reads no store absent from it, and a check fails when a
> ninth appears. **Under `RM-2`'s count that enumeration has four rows; under `02…§1.3`'s it has four with
> two branches; under `05…§5A.2`'s the fourteen rows map onto it with no unmapped row.** One artifact, three
> counts satisfied, one grader.

**This does not close `GAP-15`.** `GAP-15` asks for a reconciliation *table* in `02…`, and that remains
`02…`'s to write (§43, refusal 1). What §45 supplies is the part `GAP-15` says is missing downstream — *"The
acceptance criterion cannot be written… No grader can mark it"* (`01…:2362-2363`) **[carried]**. `W-62` is
markable without the reconciliation, and better with it.

---

## 46. Wave 13 — the role editor · `W-54` … `W-59`

**Closes `GAP-16`.** Five documents specify this screen and none builds it. This section is the merge
`01…§63.2` says the corpus does not contain, performed here so that it is reviewed rather than improvised by
whoever picks the work up.

**The wave is correct under both readings of `AD-25`.** Every workstream below is presentation, projection or
copy; none moves a layer. That is `05…§5A.6`'s architecture boundary, `01…§42`'s first five rows, and
`02…§4.6`'s `I-32` — *"Simplification is a surface operation. A role-administration surface MUST NOT be where
the access model acquires or loses structure"* (`02…:427-430`) **[carried]**.

**Five constraints bind the whole wave** and are not restated per workstream. Each is **[carried]**:

| Bound | Source | The specific thing it forbids |
|---|---|---|
| `RA-1`…`RA-5`, `I-32` | `02…§4.6` | offering an inactive role; presenting scope as a role attribute; an all-or-nothing role write; a role control that is not a capability grant |
| `I-33`ᴬ, `I-34`ᴬ | `02…§17.8` (numbering per §56) | a surface that computes authority instead of projecting the resolver's; a write narrower than the read |
| `R6`…`R9` | `04…§6.4` | copy that calls removal *revocation*; a per-user security control gated on admission |
| `IA-R11`…`IA-R17` | `06…§17` | the four nouns as an ordered list; nested tab bars; a placeholder owning navigation; folding Scopes into Roles |
| `H2` | `01…§48` | a grant save that strips the 14 keys the grid cannot display |

> **`W-54`, `W-55` and `W-56` are the three items the corpus unanimously calls safe and unscheduled.** They
> need no decision, no migration and no resolver change; in two of the three the data is **already in the
> response the component receives** (`06…§17`) **[carried]**. §51 puts them in batch 2.

### W-54 — The role control shows what it read, and refuses to write less *(S · `I-34`ᴬ, `IA-R14` · no decision)*

The round trip on the Users chapter is lossy inbound and destructive outbound: the roster collapses a
membership set to one `primary_role`, the editor is seeded from that one value, and the write **deletes every
role row for the pair** before inserting one (`02…§17.7`, `M2-17`; `role/route.ts:44-47`) **[carried]**. An
operator who changes the visible role of a principal holding `{admin, regional_lead}` *"silently destroys
`regional_lead`* — having never been shown it" (`02…:1282-1284`) **[carried]**.

**The one guard present makes it worse.** Save is disabled while the value is unchanged (`:576`), so *"every
submission that reaches the destructive path is one where the operator changed the value they were shown"*
(`02…:1287-1290`) **[carried]**.

**This is not `W-17`, and that is the point.** `RA-3` — add and remove one `(principal, org, role)` row
without disturbing the others — *cannot* be satisfied while the endpoint replaces, so `02…§4.6` makes `W-17`
a sequencing constraint on any Roles-chapter redesign. `I-34`ᴬ asks for something **narrower and cheaper**:
*"until `W-17` lands, the editor must not be able to reach the destructive path with a partial view"*
(`02…:1339-1345`) **[carried]**. Two changes, both local:

1. **Render every key the projection returned.** `GET …/members` already returns `role_keys` beside
   `primary_role` (`members/route.ts:133`) **[verified this pass]**. **This is not a fetch change.**
2. **Refuse, do not drop.** `PATCH /users/[userId]/role` rejects a submission that would remove a role the
   request did not carry. Rejection is the correct verb: a surface that cannot express a fact **MUST NOT** be
   able to delete it (`I-34`ᴬ).

**QA.** Tier C (`F17`): edit a multi-role member; assert the unshown role survives **or** the write is
refused with an error the surface renders. Tier A: no authority-write handler issues an unqualified `DELETE`
over the `(user, org)` pair without echoing the full prior set. Tier B: the control renders `role_keys.length`
controls, not one.
**Exit.** No edit through the product removes a role the operator was not shown. `RL-50`.

### W-55 — Membership is counted from the membership, not from the picker *(S · `IA-12`, `IA-R13` · no decision)*

The Roles chapter buckets members by `primary_role` for both the rail count and the selected role's user list
(`AccessRolesConfigurationPage.tsx:104-110`, `:249-251`, rendered `:368-369`) **[carried]**. `primary_role` is
`displayRoleForAdminPicker` — `admin`, else `ops`, else first key lexicographically
(`userRolesMembership.ts:22-27`) **[carried]**. So a member holding `{admin, regional_lead}` is **absent from
`regional_lead`'s count and from its user list**, while the same component holds both keys and discards them
at its type boundary: `MemberRow` declares `primary_role: string` and no `role_keys` field (`:37`)
**[carried]**.

**`A role's "who holds this" is the one question a role editor exists to answer`** (`06…:1166`) **[carried]**.

**This workstream also unblocks a simplification item.** `05…§5A.6` item 3 folds *"Users with this role"* into
the role header; `06…§15.4` finds that item *"blocked — the count it would promote is wrong for every
multi-role member"* (`06…:1111`) **[carried]**. Promoting a wrong number into a header is what converts a
defect nobody opens into one every operator reads. **`W-57` may not take item 3 until `W-55` has landed** —
§1.7.

**QA.** Tier C (`F17`): a member holding `{admin, regional_lead}` appears in **both** counts and **both**
lists. Tier A: no component computes a membership count or list from a single-role value.
**Exit.** Every membership question is answered from `role_keys`. `RL-51`.

### W-56 — A read failure is visible, and it disables the write *(S · `T-22`, `S-11` · no decision)*

Both the `!res.ok` and `catch` paths of the grants read call `setGrantKeys(new Set())` and return **without
setting an error** (`AccessRolesConfigurationPage.tsx:128-135`); the Permissions tab then renders a
legitimate-looking all-*None* state, and Save `PUT`s the empty set (`:231`), which deletes every grant for the
role (`grants/route.ts:70-74`) **[carried]**. *"A failed read becomes a silent total revocation on the next
save"* — `T-22`, **S3**.

**Seven lines, in the file the rest of this wave rewrites.** `01…§52`: it is *"the only S3 in this pass that
the simplification pass can close incidentally, and leaving it in place while rewriting the surface around it
would be the worst outcome"* (`01…:1983-1986`) **[carried]**.

**QA.** Tier C: fault-inject the grants read; assert an error renders and Save is disabled. Tier A: every
`catch`/`!res.ok` path that clears an authority set also sets an error and a disabled-save flag — stated over
**every** authority surface, not only this one (`S-11`).
**Exit.** No authority editor renders an unknown state as an empty one. `RL-49`.

### W-57 — The one-page role editor *(M · `IA-R11`, `IA-R12`, `IA-R15`, `IA-13` · needs the capability-home decision)*

The merge. Six levels become four, and the four are the operator's four nouns.

| Level today | Control | Disposition | Source |
|---:|---|---|---|
| 1 | Access workspace | keep | — |
| 2 | Chapter tab bar (4) | keep, **re-presented as trunk-then-branches** — scope is a sibling of capability, never its successor | `IA-11`/`IA-R11`, `M2-16` |
| 3 | Role collection rail | keep | — |
| 4 | Role sub-tab bar (5) | **removed** — Overview becomes the page head, Permissions becomes a named capability section, Users folds into the header **after `W-55`**, the two placeholders leave navigation | `06…§15.2`, `05…§5A.6` 1–4 |
| 5 | Permission grid row (9) | becomes the capability section's content | `06…§15.2` L3 |
| 6 | Level control (3) | keep | — |

**Three things this workstream must not do**, each a prohibition the corpus states by name:

- **It MUST NOT fold the Scopes chapter into the role editor.** *"the single change in this whole area that
  **would** change the access architecture — it would put scope inside the role object and encode the
  category error `I-27` exists to forbid"* (`06…:1096-1099`) **[carried]**; `RA-2`, `IA-R16`.
- **It MUST NOT present the four nouns as a left-to-right sequence.** *"A four-item list read left to right
  is a five-link chain with one link hidden. The count is right and the topology is wrong"* (`06…:992-994`)
  **[carried]**.
- **It MUST NOT let the radio collapse strip out-of-grid keys.** `H2` holds today only because
  `applyGridRowSelection` deletes just the edited row's keys and Save `PUT`s the union
  (`permissionGrid.ts:65,74-76`) **[carried]**. The seed grants `admin` **every active key**, of which the
  grid represents 18 of 32 — so without `H2`, opening Permissions and pressing Save deletes 14 grants.
  **`H2` is not currently protected by a test** (`01…§48`, `§54`) **[carried]**.

**The one decision.** `06…§18.2` asks whether capability gets a fifth chapter or a named section of the
role's page, and recommends **a section** — *"a capability set with no role holding it grants nothing to
nobody and has no row to live in"* (`06…:1272-1275`) **[carried]**. It is proposed, not minted; §53 records
its number as contested. **`W-57` is sized against the section reading**; the chapter reading adds a route, a
navigation entry and a second authoring surface, and would need `RA-4` re-checked.

**`IA-13`'s caveat travels with the section, and bounds what it may claim.** `PERMISSION_GRID_ROWS` is a
9-row literal and `levelFromGrantedKeys` derives a level per row, so a grant set that is not None/Read/Write
has no representation. *"Naming the capability layer therefore promotes a lens to the status of a layer…
**The four-layer editor is legible before `W-10` and true after it**"* (`06…:1183-1190`) **[carried]**.
**`W-57`'s copy must not assert the capability section is the vocabulary until `W-10` lands** (§47, amendment 4).

**QA.** Tier A: no element carrying `data-capability="planned"` is the sole content of a tab panel; at most
one tab-bar component in the Access chapter tree; navigation depth to a grid control ≤ 4; no role-editing
component reads or writes `user_access_profiles`, `user_department_access` or `user_site_access`. Tier C
(`F18`): save a role whose grant set includes out-of-grid keys; assert all 32 survive. Review-time: chapter
and section ordering places scope as a sibling of capability.
**Exit.** Four levels, one page per role, `H2` locked. `RL-48`, `RL-52`, `RL-53`.

### W-58 — One submit for the role page *(M · `RM-11`, `S-12` · **after `W-28`**)*

`01…§40` records the defect this closes: three independent save paths — role meta (`:200`), grants (`:222`),
creation (`:176`) — with no dirty-state tracking among 18 hooks, so *"an operator who edits the label and the
grid and presses one button silently discards the other edit"* (`01…:1558-1560`) **[carried]**.

**And `01…§52` records why it is the one item on the "architecture-free" list that is not safe as written:**

> *"It composes a PATCH with `T-23`'s untransacted delete-then-insert into one operator action with **three
> failure points and no compensation**. A partial failure would leave the label changed and the grants empty.
> **Must land with `S-12` (atomicity), not before it**"* (`01…:1978`) **[carried]**.

`W-28` — *atomic authority writes; removal becomes a transition* — is the workstream that supplies `S-12`, and
§47's amendment 5 extends it to `role_permission_grants`. **`W-58` is therefore the only wave-13 item with a
hard predecessor outside its wave**, and §51 schedules it accordingly.

**QA.** Tier C: fault-inject the grant insert mid-submit; assert the label change did not persist and the
grant set is unchanged. Tier A: the role page issues exactly one authority-mutating request per submit.
**Exit.** One submit, one transaction, no partial state. `RL-22` (extended).

### W-59 — Retire the four non-canonical role-editing surfaces *(S–M · `RM-6`, `H1` · no decision)*

Role editing is reachable from **five** surfaces and **1,155 lines of it are legacy** —
`/legacy-admin/system/roles` (416), `/legacy-admin/system/access-control` (369),
`/legacy-admin/system/customer-person-roles` (370), plus two adminV2 aliases into the same component
(`01…§41`) **[carried]**.

**`H1` is what makes this safe, and it is the corpus's first positive structural finding about authority
location:** all five surfaces call the **same four** `/api/admin/rbac/*` routes, so the legacy clients *"hold
no authority the canonical surface does not… **deleting them is security-neutral and safe**"* (`01…:1812-1819`)
**[verified by its owner]**. It is also the direct counter-example to `T-8`.

**Two constraints.**

- **`customer-person-roles` is a different concept sharing a word** — the family/household relationship
  vocabulary, not operator authority (`01…§41`) **[carried]**. It must be dispositioned on its own terms, not
  swept up in an authority cleanup. **If in doubt, leave it and say so**; `W-59`'s claim is about the four
  authority surfaces.
- **Reachability was never established.** `01…§44.1` is explicit that no browser was opened and *"no claim is
  made about how any of this renders or behaves for a live operator — including whether the three legacy
  surfaces in §41 are reachable"* (`01…:1655-1657`) **[carried]**. `W-59` opens with that check.

**Why it belongs in this wave rather than the long tail.** *"'simplify the role editor' has five plausible
referents, and an execution phase that simplifies the canonical one while four others remain has not
simplified what the operator sees"* (`01…:1589-1591`) **[carried]**.

**QA.** Tier A: exactly one component in the tree renders a role-permission grid; the retired routes return
404 or redirect to the canonical href. Tier B: the canonical chapter is reachable and unchanged.
**Exit.** One role editor. `RL-54` covers the copy that survives the deletion.

---

## 47. Wave 14 — the depth reduction · `W-60` … `W-62`, and six amendments

**This wave exists only under `AD-25`'s architecture reading.** Under the other reading it is not descoped —
it is *unscheduled*, and the operator should be told that the depth they reacted to remains (`01…§43`)
**[carried]**.

`RM-9` is the security input: the reduction *"closes one `S1` and two `S2` threats and weakens no control
that this pass could find… The 'no access-architecture change' constraint attached to the role-editor work is
**not protecting any enforcement control**"* (`01…:1951-1954`) **[carried]**.

`RM-10` is the hard constraint, and it is not negotiable: **L8 must not be removed before L4 is seeded and
enforced**, or the platform fails closed with no grants — *"a total operator lockout, not a security
improvement"* (`01…:1956-1961`) **[carried]**. `W-13`'s existing position after the capability work is what
satisfies it, and §51 does not move it.

### W-60 — Retire the two compatibility views *(S–M · `T-25`, `S-13` · after a base-grant audit)*

Phase 0 executes `GRANT SELECT ON public.permissions, public.permission_keys TO "anon"`
(`…phase0…sql:163-164`) on two `security_invoker` views over the permission catalog — **L5**. It is closed
today **by ordering alone**: `20260804180000_platform_anon_privilege_revocation.sql:105` revokes six days
later (`01…§50`) **[carried]**.

**Two reasons the views still go, and one reason the order matters.**

1. Forward protection is `ALTER DEFAULT PRIVILEGES`, which governs objects created *without* an explicit
   grant. *"It does not prevent a future migration from executing an explicit `GRANT … TO anon`, which is
   precisely what Phase 0 did. The pattern is live; only this instance is closed"* (`01…:1926-1928`)
   **[carried]**. `S-13` is the static form and is free.
2. The views are migration residue, not a model concept (`01…§39` `RM-4`) **[carried]**.
3. **But they currently carry a disagreement that is resolving correctly.** The base table still holds
   `GRANT ALL … TO anon` while its SELECT policy is scoped `TO authenticated` — *"Two controls disagreed and
   the stricter one held. That is the correct outcome by luck of layering, not by design — and it is one of
   the four layers `RM-4` proposes to delete, which would remove the object carrying the contradiction"*
   (`01…:1929-1934`) **[carried]**.

> **So `W-60` opens by auditing the base-table grant, not by dropping the views.** Dropping the object that
> carries a contradiction is not the same as resolving it. **Audit `permission_definitions`' own grants
> first; then `M20` drops the views.**

**QA.** Tier A (`S-13`): no migration grants any privilege on an access-control object to `anon`. Tier C: an
`anon` client cannot read the catalog by any path after the drop. Tier A: zero readers of either view.
**Exit.** L5 is one table with one grant posture. `RL-55`, `M20`.

### W-61 — `role_key` integrity: the API check, and the end of read-time fabrication *(M · `T-21` corrected, `S-10` · no decision)*

**Sized against the corrected finding, not the recorded one (§56.2).** `T-21`'s stated mechanism — grants
authored for a role that does not exist, *"written and live"* — **cannot occur**: two foreign keys constrain
`(org_id, role_key)` to `role_definitions`, both present in the production baseline **[verified this pass]**.
`S-10`'s remediation is therefore *not* the migration it asks for. Three things remain, and each is real:

1. **The API still fabricates roles at read time.** `mergeRoleDefinitionsWithDefaults` adds any missing member
   of a hard-coded four-role constant as `is_system: true, is_active: true`
   (`defaultRoleDefinitions.ts:34-47`), applied to every `GET /api/admin/rbac/roles` response
   (`roles/route.ts:31`) **[carried]** — against Phase 0's own header, *"Role definitions are seeded by the
   database, never fabricated at read time"* (`…phase0…sql:167-168`) **[carried]**. That constant is a
   **fifth role vocabulary** (`01…§50`) **[carried]**. The editor lists a role that has no row; the operator
   authors grants for it; **the FK rejects the write**. The defect is a fabricated vocabulary and an opaque
   failure — not a phantom grant.
2. **`PUT /rbac/grants` validates `permission_key` and not `role_key`** (`grants/route.ts:60-68`)
   **[carried]**. `H3` — the same handler rigorously validating one column of a composite key and not the
   other (`01…§48`) **[carried]** — is unchanged by the FK's existence: the check belongs in the handler so
   the operator gets a stated rejection instead of a constraint error.
3. **Both `role_key` FKs are `ON DELETE CASCADE`, and they are duplicates of each other**
   (`role_permission_grants_role_definitions_fkey`, `role_permission_grants_role_fk`) **[verified this
   pass]**. **This is the exact hazard Phase 0 fixed on the neighbouring column and left on this one**: its
   own comment records that the legacy `permission_key` pair *"disagreed: one RESTRICT, one CASCADE —
   meaning deleting a catalog key could silently delete grants"*, and replaced them with a single
   `ON DELETE RESTRICT` (`…phase0…sql:125-141`) **[verified this pass]**. Deleting a `role_definitions` row
   today silently deletes every grant it held, with no record that authority was destroyed.

**And the asymmetry `T-21` describes is real but points the other way.** `user_roles.role` has **no** FK —
only `org_id` and `user_id` are constrained (`prod_baseline.sql:6453,6458`) **[verified this pass]**. Grants
are doubly constrained; **membership is unconstrained**, which is exactly what `02…§4.2` records as `M2-2`
**[carried]** and what `W-16` closes. `W-61` does not duplicate `W-16`; it widens **`M15`** (§54).

**QA.** Tier A: no API response contains a role definition without a persisted row. Tier C: a grant write
naming an undefined `role_key` is rejected by the handler with a stated error, before the database sees it.
Tier C: deleting a role definition that holds grants is **refused**, not cascaded.
**Exit.** One role vocabulary, referentially enforced, and no authority deleted by cascade. `M21`, `M15`
widened.

### W-62 — The layer enumeration, declared and locked *(S · `GAP-15`'s definition of done · after `W-20`, `W-13`, `W-60`)*

The acceptance criterion §45.3 specifies. One declared enumeration of the resolution layers, in code, beside
the resolver; a check that the resolver reads no store absent from it; a check that fails when a ninth
appears.

**Why it is a workstream and not only a lock.** The enumeration is the artifact three counts are graded
against, and it does not exist. `01…§54`'s bottom row is the reason it is worth building: **every control in
the eight-layer enforcement matrix — including `H1`, `H2` and `H3`, the three that hold — is currently
locked by no test**, and *"the simplification work is exactly the kind of change that degrades unlocked
controls silently"* (`01…:2056-2058`) **[carried]**.

**It runs last in its wave by construction:** an enumeration authored before `W-20`, `W-13` and `W-60` land
would enumerate the layers this plan intends to delete.

**QA.** Tier A: the resolver's reads are a subset of the declared enumeration; the enumeration has four
entries; a test fails if a read is added without an entry. Tier B: the enumeration is what the effective-access
surface projects (`W-48`).
**Exit.** *"Four layers"* is a graded claim rather than an argued one. `RL-47` carries its membership half.

### 47.1 Six amendments to existing workstreams

Each is a reopen finding landing on a workstream that predates it. **No workstream is renumbered and none
changes owner.**

| # | Workstream | Amendment | From |
|---|---|---|---|
| **1** | **`W-20`** — remove the legacy fallback | **Closes `T-19`, the corpus's only `S1`.** Re-priced and re-scheduled — §48 | `T-19`, `S-8`, `D-15`/`AD-24` |
| **2** | **`W-13`** — portal admission becomes a capability | Gains `I-35`ᴮ as its exit clause: **an admission predicate MUST NOT satisfy a capability gate**. `AD-22` must answer *both* halves or *"the fifth layer survives under a new name"* (`04…:752`) **[carried]**. Adds `T-24`'s unlisted site — `canManageUsersAndRoles.ts:16` returns true on the `"admin"` literal *before* consulting any capability, and `:58` admits whole-authority-graph reads on `portalEligible` | `A2-8`, `I-35`ᴮ, `T-24`, `AD-22` |
| **3** | **`W-25`** — role deactivation revokes | **Must carry the roster projection with it.** The roster is correct today *only because the resolver is wrong*: neither joins `role_definitions`. *"The agreement is accidental, and closing `M2-3` breaks it: the moment `D10`/`AD-10` is decided as revoke and `I-26` lands, the roster becomes the only place still asserting the old authority"* (`02…:1272-1277`) **[carried]**. Sequence with `W-46` and `W-55` | `M2-18`, `T-20`, `S-9` |
| **4** | **`W-10`** — the grid becomes a projection | Gains `H2` as a **precondition**, not a consequence — a regenerated grid covering all 32 keys changes what Save writes (`01…§51`) **[carried]** — and gains `IA-13`: `W-57`'s capability section is *legible* before `W-10` and *true* after it | `H2`, `IA-13`, `S-11` corollary |
| **5** | **`W-28`** — atomic authority writes | **Extended to `role_permission_grants`.** `PUT /rbac/grants` deletes every grant for the role then inserts; an insert failure leaves the role with **zero** grants and returns 500 (`grants/route.ts:70-91`) **[carried]** — `T-23`, the same defect class as `T-13` on a second authority table. **`W-58` depends on this** | `T-23`, `S-12` |
| **6** | **`W-22`** — explicit org, no lexicographic tiebreak | **Extended from the read path to the authority-write path.** The role editor writes to `access.orgId` — the lexicographically smallest org among the caller's `admin`/`ops` memberships, *"not an operator selection, and named on no surface"* — consumed at `roles/route.ts:10`, `grants/route.ts:9,39`, `remove/route.ts:13` (`T-26`) **[carried]** | `T-26`, `S-14` |

> **Amendment 3 is the sharpest sequencing consequence in the reopen** (`02…§17.7`) **[carried]**, and it is
> the kind that only appears when two documents are read together: `W-25` was sequenced in wave 6 against a
> resolver defect, and the reopen found that fixing the resolver **creates** a surface defect that did not
> exist before. A wave-6 execution phase working from Part II alone would ship it.

---

## 48. `W-20` re-priced — this plan's own conclusion was right about the wrong question

**The correction Part IV owes before it schedules anything.** §9's `W-20` block reads:

> *"**Q2 = 0.** Every auth user has at least one `user_roles` row, so the fallback — which fires only for
> principals with zero membership rows — is **unreachable for everyone alive in the database**… **The L4
> lockout population is empty**"* (`03…:1200-1203`) **[verified this pass, in file]**.

**That is true, and it answers a different question than the one `T-19` asks.**

| | `W-0` Q2 | `T-19` |
|---|---|---|
| Question | *Who would be **locked out** if the fallback were removed?* | *Who is **admitted** by the fallback after the product says they were removed?* |
| Population | principals with **zero** `user_roles` rows **today** | principals with a legacy `admin`/`ops` row who are **removed tomorrow** |
| Measured | **0** | **not measured — the census never asked** |

**Removal is what creates the condition Q2 measured the absence of.** `remove/route.ts:26-30` deletes the
principal's only `user_roles` row and nothing else — its own comment says *"Does not delete auth.users"*;
resolution then calls `fetchLegacyAdminOpsOrgAndRole`, which reads `user_profiles.role`, then `app_users.role`
by `id`, then by `auth_user_id`; those reads accept **only** `admin` and `ops`, and a match sets
`portalEligible = true` — the primary API gate (`01…§49`) **[carried]**.

> **So Q2 = 0 does not mean the fallback is inert. It means the fallback is *dormant*, and the product ships
> a button that wakes it.** `01…§49`: *"The failure mode is not 'removal is slow' — it is 'removal is
> inverted.' … Removing a `school_director` who has an old `app_users.role = 'admin'` row **promotes
> them**"* (`01…:1854-1857`) **[carried]**. The product reports `{ ok: true }`.

**Three consequences for the schedule.**

1. **`W-20` moves out of the long tail.** §3.2 batch 10 was correct when `W-20` closed a latent `G1` and an
   empty lockout class. It now closes the corpus's **only `S1`**, and §1.4 — *a defect that is live in the
   product now outranks a defect that is latent* — puts it in **batch 2**. `01…§60` names it *"the cheapest
   S1 closure in the corpus"* (`01…:2288`) **[carried]**.
2. **Its lockout class is unchanged and its ritual is not.** §9 collapsed `W-20` from the four-step ritual to
   *"a straight deletion"* on Q2 = 0. **That collapse stands** — deleting a dormant path cannot lock out a
   population that is empty — but it is now conditional on **`Q15`** (§49), which asks the question Q2 did
   not. If `Q15` is non-zero, the ritual returns and `M19` precedes the deletion.
3. **It stops waiting on `AD-25`.** `W-20` is architecture work under `RM-1`'s reading, which would place it
   behind the unanswered directive-scope decision. **It should not wait**, and the reason is `D-15`/`AD-24`,
   not `AD-25`: *"This is the cheapest S1 closure in the corpus and it needs one database question answered,
   not a design"* (`01…:2078-2079`) **[carried]**. `02…§38` places `AD-24` in sitting 1 — revocation — whose
   exit test already covers it, and sitting 1 keeps its first position (`02…§39`) **[carried]**.

**What does not change.** `W-20`'s existing content is intact: the `handle_new_user()` disposition (§9), the
`M2-8` fourth-vocabulary clause, and `M2-5`'s reason the deletion is not one file —
`resolveAdminPortalOrgCore.ts` re-implements the fallback and serves `requireAdminOrOps` across 147 route
files, so `RL-12` is stated over **every** module. `RL-47` (§54) adds `S-8`'s form of the same check.

**`T-19`'s precondition remains unverified, and Part IV does not pretend otherwise.** `01…§49` is explicit:
*"**No database was queried** — whether any live tenant holds such rows is **not established here** and is
the first thing an execution phase must check"* (`01…:1860-1862`) **[carried]**. What is established is
structural: the current creation path writes only `user_roles`, so **the exposed population is exactly the
pre-migration one** — the longest-tenured accounts, which are also the most likely to have held `admin`
before `user_roles` existed.

---

## 49. Census questions `Q15` … `Q17` — the second census, extended

`W-23` (§4.1) is the wave-0b census carrying `Q6`…`Q14`. **Three questions are added to it rather than to a
third census**, because all three are read-only, all three gate a wave-13 or wave-14 workstream, and
`01…§67` is right that *"Discovery on this subject should stop"* (`01…:2533`) **[carried]** — one more read
is not a sixth documentary pass.

| # | Question | Reads | Sizes / gates |
|---|---|---|---|
| **Q15** | **How many principals hold a `user_profiles.role` or `app_users.role` of `admin`/`ops`?** Broken out by whether they currently hold a `user_roles` row in any org, reproducing the resolver's precedence (`user_profiles`, then `app_users` by `id`, then by `auth_user_id`) | `user_profiles`, `app_users`, `user_roles` | **`W-20`, `M19`, `AD-24`.** Q2 counted the *zero-membership* population; Q15 counts the population `T-19` exposes **when removal runs**. Non-zero ⇒ `M19` precedes the deletion and §2's ritual returns |
| **Q16** | **Which orgs are missing one or more of the four default `role_definitions` rows** — i.e. which orgs' role lists are served by read-time fabrication? | `orgs`, `role_definitions` | **`W-61`.** Sizes the fabrication defect. Zero ⇒ removing `mergeRoleDefinitionsWithDefaults` is a no-op today and a lock for tomorrow; non-zero ⇒ a backfill precedes it |
| **Q17** | **How many principals hold more than one role in one org, and how many distinct `(user, org)` pairs are affected?** | `user_roles` | **`W-54`, `W-55`, `W-17`.** This is the one question that prices wave 13. Non-zero ⇒ the destructive round trip (`M2-17`) and the under-counted rail (`IA-12`) are **live**, not latent |

> **`Q17` is the question that decides whether wave 13 is a correctness fix or a usability fix**, and it has
> never been asked. `C7` records that the schema permits multi-role membership and the resolver honours it;
> no document establishes whether any tenant *uses* it. **If `Q17` is zero, `W-54` and `W-55` are locks
> against a defect no operator has hit yet — still worth building, and cheaply, but not `S1`-adjacent. If it
> is non-zero, `M2-17` means ordinary edits have been destroying authority silently.**

**Same discipline as `W-0` and `W-23`.** Read-only; one authorized read; produces
`wave0b-authority-census.json` with the query text beside each answer (§4.1). **A census answer is a
snapshot, not a standing warrant** — `W-0`'s counts were nine days old when Part II re-cited them (§11), and
Q15 in particular must be **re-run at `M19`'s preflight**, not inherited.

**Q15 is the only one of the three that could reasonably be argued into a preflight instead of the census.**
It is placed in the census because `AD-24` needs it to be *decidable* — `D-15`'s recommendation is *"out"*,
conditional on exactly this count (`01…§55`) **[carried]** — and a decision cannot wait on a preflight for a
migration that the decision authorizes.

---

## 50. Four ordering constraints — §1.6 … §1.9

§1.1–§1.5 are unchanged. These four continue them and are numbered into §1 because that is where this plan's
ordering logic lives; they are stated here because Part IV is where their evidence is.

### 1.6 A read change that closes a defect outranks the write change that makes it structural **[Part IV]**

> **Where a defect can be closed by showing more and refusing more, that fix is scheduled ahead of the
> architectural fix that would make it impossible — and it MUST NOT be deferred into it.**

`02…§17.8` is the case that produced the rule: `RA-3` cannot be satisfied while the write path replaces, so
`W-17` is a precondition of any Roles-chapter *redesign* — but `I-34`ᴬ asks for something narrower that is
satisfiable now, *"by showing the full `role_keys` set the roster already returns rather than `primary_role`,
and by having the write reject a submission that would remove a role the operator was not shown. Neither
needs a migration, a decision, or the multi-role write path"* (`02…:1339-1345`) **[carried]**.

**The failure this prevents is specific.** A simplified single-select role control shipped before `W-17`
*"does not merely reflect `C7`, it hardens it into the product as an intended design"* (`02…:436-437`)
**[carried]**. §1.6 is how `W-54` lands without doing that: it is additive to the read and restrictive to the
write, so `W-17` remains free to arrive later and remove the restriction.

### 1.7 A simplification MUST NOT promote a value it has not corrected **[Part IV]**

> **Where a simplification would move a computed value into a more prominent position, the workstream that
> corrects that value is a hard predecessor.**

`06…§15.4`: item 3 — folding *"Users with this role"* into the header — is presentation-only *and unsafe*,
because the count it promotes *"is **wrong for every multi-role member**"* (`06…:1111`) **[carried]**.
*"Promoting a number into a role's header is exactly the move that converts a wrong number in a tab nobody
opens into a wrong number every operator reads"* (`06…:1115-1117`) **[carried]**.

Two applications in this plan: **`W-55` precedes `W-57`'s item 3**, and **`W-57` may not describe the
capability section as the vocabulary before `W-10`** (`IA-13`). The general form is `01…§52`'s verdict on
folding the Overview cards — *"Safe, but do not promote it. Folding a lossy summary into the tab that owns
the truth makes the omission harder to notice"* (`01…:1979`) **[carried]**.

### 1.8 A layer is removed only after its replacement is seeded **and** enforced **[Part IV]**

> **`RM-10`, adopted as an ordering constraint.** Removing an admission layer before the layer that replaces
> it is both seeded and enforced converts a fail-open platform into a fail-closed one with no grants.

*"`03…`'s `W-13` sequences the L8 replacement after the capability work; **that ordering must be preserved
and is the one hard constraint on this instruction**"* (`01…:1956-1961`) **[carried]**. §51 does not move
`W-13`, and `W-62` — the enumeration that asserts the reduction happened — runs **after** the removals, not
beside them.

**The second clause is `W-20`'s.** A layer whose removal is gated on a data question is scheduled by the
**census**, not by its wave (§48, `Q15`). This is §1.2 applied to a finding §1.2 predates.

### 1.9 A reopen re-sequences this plan before its findings are built **[Part IV]**

> **`GAP-17`, adopted as a constraint rather than left as an observation.** No workstream derived from a
> reopen may be scheduled until the reopen's registers are bound in §52 or declared unassigned.

This is the ordering form of `DR-13` (§44) and `RL-56` (§54). It is stated as a constraint because the
alternative has now failed twice with a careful pass on each side of it (`01…§61`) **[carried]** — and
because Part IV is itself the evidence that the repair is affordable: **one section per reopen, not one
mission per reopen.**

---

## 51. The wave map and execution order, amended

### 51.1 Fifteen waves

§3.1's table, extended. Waves 0–12 are unchanged in content; only the two new rows and two amended `Gated on`
cells are shown as changed.

| Wave | Theme | Workstreams | Gaps closed | Gated on | State |
|---|---|---|---|---|---|
| **0 … 12** | *(unchanged — §3.1)* | `W-0`…`W-53` | — | — | carried |
| **13** | **The role editor** | **`W-54` … `W-59`** | **`GAP-16`**, GAP-12 (part) | **nothing for `W-54`–`W-56`**; the capability-home decision for `W-57`; **`W-28`** for `W-58` | **new** |
| **14** | **The depth reduction** | **`W-60` … `W-62`** | **`GAP-15`**'s definition-of-done half; GAP-5 (part) | **`AD-25`** for scope; **`AD-22`** for `W-13`'s half; `Q15`, `Q16` | **new** |

**One wave is recorded as deliberately absent.** `GAP-17` gets **no wave**: `DR-13` and `RL-56` are a lint and
a decision, not engineering work — the same disposition §3.1 gives `GAP-14`.

### 51.2 Execution order, amended

§3.2's batches, with the four changes this part makes. **Everything not named below is unchanged.**

| # | Batch | Change | Why |
|---|---|---|---|
| **2** | The live-defect batch | **+ `W-20`** · **+ `W-54`, `W-55`, `W-56`** | `W-20` closes the only `S1` (§48). The three editor items need no decision, no migration and no resolver change, and two of them read data already on the wire. §1.4 |
| **6** | Resolver | **+ `W-57`** *(after `W-55`)* | The one-page editor is a projection change; it belongs with the resolver-truthfulness work, not with the architecture wave. §1.7 binds it behind `W-55` |
| **10** | The long tail | **− `W-20`** · **+ `W-59`, `W-58`** | `W-20` promoted out. `W-58` sits here because `W-28` (batch 4) is its hard predecessor; `W-59` is bulk deletion and parallelizable |
| **12** | **Depth reduction** *(new batch)* | `W-60`, `W-61`, `W-62`, and `W-13`'s `I-35`ᴮ clause | Runs after batch 8 (admission) by `RM-10`/§1.8. `W-62` runs last within it, by construction |

**The critical path is unchanged in shape and gains one terminal node**, because `W-62` asserts what the
existing path delivers:

```
W-23  →  W-9        →  W-11          →  W-13           →  W-14        →  W-15         →  W-49  →  W-62
 S      one catalog    one vocabulary    portal.access    route table    enforcement     gates    enumeration
         M                M                 M                M              L              M         S
```

**The role-editor chain is short, wide and almost entirely off the critical path** — which is the finding
`GAP-16` implies and never states:

```
W-54 ─┐
W-55 ─┼─→  W-57  ─→  W-59              W-28  ─→  W-58
W-56 ─┘     M         S–M               M          M
 S          (one page)  (retire 4)     (batch 4)  (one submit)
```

Only `W-58` has a predecessor outside its own wave. **Five of wave 13's six workstreams could start the day
they are approved**, and three of those need no approval beyond the wave itself.

> **The one scheduling claim Part IV makes that the corpus does not already contain.** `01…§67` finds the
> cheap work *"real and unblocked… **None is scheduled**"* and the expensive work *"one decision away, not
> one discovery away"* (`01…:2529-2533`) **[carried]**. §51 schedules the first and gates the second. **After
> this pass, the reopen's remaining cost is `AD-25` and `AD-22` — not another document.**

---

## 52. Coverage of the reopen — every ID bound, or unassigned with a reason

§23's discipline, applied to `01…§60`'s delta. **An ID with no workstream is stated as such and given a
reason; silence is not a disposition.** This is the section `RL-56` (§54) checks.

### 52.1 `01…` Parts IV and V — role-model depth, and the threat model

| ID | Binding | Note |
|---|---|---|
| `RM-1` | **unassigned — decision input** | It *is* `AD-25`'s question. Scheduling it would be answering it |
| `RM-2` | §45.1, **`W-62`** | The eight-layer count is one of the four §45.1 reconciles by workstream |
| `RM-3` | §45.1 | The four-authorable / four-interposed split is wave 13 vs wave 14's dividing line |
| `RM-4` | **`W-20`, `W-13`, `W-9`/`W-10`, `W-60`** | The four removals, one workstream each; `W-60` is the one that had none |
| `RM-5` | **`W-57`** | 607 lines, 18 hooks, 5 tabs, 27 radios — the measurement wave 13 acts on |
| `RM-6` | **`W-59`** | Five surfaces, 1,155 legacy lines |
| `RM-7` | §45.2 | *Separate the two directives* — adopted as the wave split, not as a finding to close |
| `RM-8` | **`W-62`** | The enforcement-point cut is what the enumeration must be checkable against |
| `RM-9` | **unassigned — decision input** | The security half of `AD-25`. §47 carries it as the wave's rationale |
| `RM-10` | **§1.8** | Adopted as an ordering constraint |
| `RM-11` | **`W-56`, `W-57`, `W-58`**, and **`W-53`** for the audit debt | Three of five items need a control; each control is now a named workstream |
| `T-19` **S1** | **`W-20`** (batch 2) | §48 |
| `T-20` | **`W-25`** | + amendment 3 |
| `T-21` | **`W-61`** | **Corrected — §56.2.** Sized against the correction |
| `T-22` | **`W-56`** | |
| `T-23` | **`W-28`** | Amendment 5 |
| `T-24` | **`W-13`** | Amendment 2 |
| `T-25` | **`W-60`** | |
| `T-26` | **`W-22`** | Amendment 6 |
| `H1` | **`W-59`** | A control that holds, and the reason `W-59` is safe |
| `H2` | **`W-57`, `W-10`** | Locked by `RL-48` — it was unlocked |
| `H3` | **`W-61`** | The asymmetry it sharpens is `W-61`'s handler check |
| `S-8` | **`W-20`** · `RL-47` | |
| `S-9` | **`W-25`** | `RL-18` already exists |
| `S-10` | **`W-61`** | **Corrected — §56.2.** Not the migration it asks for |
| `S-11` | **`W-56`** · `RL-49`; corollary on **`W-57`** · `RL-48` | |
| `S-12` | **`W-28`** · `RL-22` extended | |
| `S-13` | **`W-60`** · `RL-55` | |
| `S-14` | **`W-22`** | Amendment 6 |
| `D-15` | **`AD-24`**, sitting 1 | Gates `W-20`'s remediation shape; needs `Q15` |
| `D-RM1` | **`AD-25`**, sitting 0 | Gates wave 14's scope |

### 52.2 `02…` — the model reopen

| ID | Binding | Note |
|---|---|---|
| `M2-16` | §45.1, **`W-62`**, `IA-R11` | The four-layer restatement, in three places it has consequences |
| `M2-17` | **`W-54`** | The destructive round trip |
| `M2-18` | **`W-25`** (amendment 3), **`W-55`** | The roster as an eighth resolution site |
| `M2-19` | §56 | Numbering; no product work |
| `RA-1` | **`W-57`**, **`W-61`** | Only defined, active roles are offerable — which needs the fabrication to stop |
| `RA-2` | **`W-57`** · `RL-53` | |
| `RA-3` | **`W-17`** (existing), **`W-54`** | The narrow form now, the full form at `W-17`. §1.6 |
| `RA-4` | **`W-57`** | Bounds the capability-home decision |
| `RA-5` | **`W-25`** | The copy at the toggle is `AD-10(b)`'s cost |
| `I-32` | **wave 13, as a whole** | The bound on the wave, not a workstream |
| `I-33`ᴬ | **`W-48`**, **`W-55`** | Numbering per §56.1 |
| `I-34`ᴬ | **`W-54`** · `RL-50` | Numbering per §56.1 |
| `X-12`, `X-13` | **Director** — §26's class | Not worker-resolvable; not product defects |
| `CR-6`…`CR-8` | **`RL-42`**, extended | The mechanical forms of §37's clauses 4 and 5 belong in the docs lint that already runs `CR-1`…`CR-5` |
| `AD-24`, `AD-25` | §53 | Registered; **`AD-24` is contested** — §53.2 |

### 52.3 `04…` — the authentication reopen

| ID | Binding | Note |
|---|---|---|
| `A2-8` | **`W-13`** | Amendment 2 |
| `A2-9` | **`W-38`**, **`W-13`** | The credential commands under the Access surface are org-scoped by the surface and not by the endpoint |
| `I-35`ᴮ | **`W-13`** | Its exit clause: admission may deny, never authorize |
| `R6` | **`W-54`/`W-57`** copy · `RL-54` | *Removed from this organization* stays honest while §2.1 holds |
| `R7` | **`W-38`** | The org bound must hold when the endpoint is called directly |
| `R8` | **`W-33`** | The method catalog derives, or is not presented as org-level |
| `R9` | **`W-13`** | A per-user security control gated on admission is the same defect as `T-24` |
| `AD-22` | §53, sitting 5 | Gates `W-13`'s half of wave 14 |
| `AD-23` | §53, sitting 3 | Gates `W-33`; liftable alone (`02…§38`) |

### 52.4 `06…` — the IA reopen · and `05…§5A`

| ID | Binding | Note |
|---|---|---|
| `IA-11` | **`W-57`** · `IA-R11` | The ordered-list hazard |
| `IA-12` | **`W-55`** | |
| `IA-13` | **`W-57`**, **`W-10`** | §1.7 binds the claim, not the section |
| `IA-14` | **`W-57`** · `RL-52` | |
| `IA-R11` … `IA-R12` | **`W-57`** | |
| `IA-R13` | **`W-55`** · `RL-51` | |
| `IA-R14` | **`W-54`** · `RL-50` | |
| `IA-R15`, `IA-R16` | **`W-57`** · `RL-52`, `RL-53` | |
| `IA-R17` | **`W-54`/`W-57`** · `RL-54` | |
| `05…§5A.2` | §45.1 | The 14-row count, reconciled by workstream |
| `05…§5A.4` | **`W-57`** | Editor depth |
| `05…§5A.5` | §45.1, **wave 13** | The four nouns |
| `05…§5A.6` items 1–4 | **`W-57`** (item 3 after **`W-55`**) | §1.7 |
| `05…§5A.6` item 5 | **`W-20`** | The one item `05` correctly classes as architecture |

### 52.5 Gaps, and what has no workstream by decision

| Gap | Disposition |
|---|---|
| **`GAP-15`** | **Partially closed.** §45 supplies the schedule form and `W-62` the definition of done. **The reconciliation table remains `02…`'s** (§43, refusal 1), and `GAP-15` does not close until it exists |
| **`GAP-16`** | **Closed as a plan gap** by §46 — one buildable description, six workstreams, five of them startable on approval. *"Which of five surfaces"* is answered by `W-59`: **all of them, by deletion of four** |
| **`GAP-17`** | **No wave, by decision.** `DR-13` + `RL-56`. Director-owned, like `GAP-14` |
| `X-10`, `X-11`, `X-12`, `X-13`, **`X-14`** | **Director-owned**, §26's class. None is worker-resolvable and none is a product defect |

**Six IDs are unassigned, and all six are the same kind of thing:** `RM-1`, `RM-9` (inputs to a decision, not
work), `RM-3`, `RM-7` (framings this plan adopted rather than closed), and `M2-19` (numbering). **No finding
about the product is unassigned.**

---

## 53. The decision register — twenty-five, and one contested number

### 53.1 The state

`01…§64` measures it: **25 open decisions** — `AD-1`…`AD-21`, `AD-22`, `AD-23`, `D-15`, `D-RM1` — and
*"No single document lists them"* (`01…:2450`) **[carried]**. `02…§37`'s clause 4 supplies the rule that was
missing and proposes `D-15` → **`AD-24`** and `D-RM1` → **`AD-25`**, applied *"only inside this file"*
(`02…:2414-2416`) **[carried]**.

**§24 of this plan gates its waves on 21 of the 25.** Part IV adds the remaining four to the gating, at the
numbers `02…§37` proposes:

| Decision | Sitting | Gates in this plan | Status |
|---|---|---|---|
| **`AD-22`** | 5 — vocabulary & resolver | **`W-13`**'s `I-35`ᴮ half; therefore wave 14's L8 removal | open |
| **`AD-23`** | 3 — authentication | **`W-33`**; liftable from sitting 3 alone | open |
| **`AD-24`** *(= `D-15`)* | 1 — revocation | **`W-20`**'s remediation shape and `M19`; needs `Q15` | open |
| **`AD-25`** *(= `D-RM1`)* | **0 — directive scope** | **Wave 14's existence.** Gates nothing in wave 13 | open |

**`02…§39`'s amended approval order is adopted as this plan's gating order**, unchanged: sitting 0 first
alongside or immediately before sitting 5, because *"`AD-22` and `AD-25` are one question split across two
sittings"* (`02…:2490-2492`) **[carried]**; sitting 1 keeps its first position.

> **The scheduling consequence Part IV can state and `02` could not.** Sitting 0 gates **wave 14 only**.
> Wave 13's first three workstreams are gated by nothing, and `W-57` is gated by a decision that is not in
> any sitting (§53.2). **So the answer to *"what does an unanswered `AD-25` cost this week"* is: three
> workstreams can start now, one more after a small product decision, and only the depth reduction waits.**
> `02…§38` observes that every reopen adds specification against an unchosen reading and that *"this pass is
> one more instalment of it"* (`02…:2439-2442`) **[carried]**. §46 is the instalment that converts into work.

### 53.2 `AD-24` names two different questions, and this plan needs the other one

**Verified this pass, in file:**

- `06…§18.2` proposes **`AD-24` — *does capability get a chapter, or a section?*** — *"`AD-22` and `AD-23`
  are taken by `04…§7.1`; this is the next free number under `§26.2`'s appending rule"* (`06…:1259-1262`).
  **Committed** at `207cd5322`.
- `02…§37`–`§38` assigns **`AD-24` = `D-15`**, the legacy-identity-tables question, and places it in sitting
  1. **Uncommitted** working-tree material at `03efba377`.

**Both applied the same rule correctly to different snapshots.** Under clause 4 — *"the raising document owns
the question… **§25 owns the list**"* (`02…:2382-2387`) **[carried]** — `02…` holds the register, so its
assignment governs and `06…`'s question must move. **Part IV does not renumber it** (§43, refusal 3); it
cites it as **the capability-home decision** and records the disposition for the Director:

> **Disposition, escalated not performed:** `AD-24` = `D-15` (sitting 1); `06…§18.2`'s capability-home
> question becomes **`AD-26`** at the next pass that touches `02…§25`. It gates `W-57` only, its
> recommendation is on file (*a section, not a chapter*), and **`W-57` is sized against that
> recommendation** — so a decision either way changes the workstream's shape, not its position.

**This is `X-12`'s prediction, one document later, and it is the reason `RL-56` is worth its cost.** `X-12`
records that §26.2 *"was applied as if it were a register maintenance rule"* by three documents on one day.
It was four.

---

## 54. Locks `RL-47` … `RL-56`, and migrations `M19` … `M21`

### 54.1 Regression locks

Continuing §25. **`RL-43`…`RL-46` are deliberately skipped**: §33.1 proposed those four numbers for `W-29`,
`W-33`, `W-46` and `W-48` and *recorded the gap rather than minting them*, on the ground that silently
minting into another part's register is how `X-1` happened. **Part IV honours that** — it mints from
`RL-47` and leaves the four reserved. Every lock below is `proposed`.

| Lock | Asserts | Tier | From | Workstream |
|---|---|---|---|---|
| **RL-47** | Authority resolves from exactly one membership store — no resolver reads a table that no operator surface writes and none displays | A + C | `S-8` / `T-19` | `W-20`, `W-62` |
| **RL-48** | **`H2`** — a grant save preserves every key the surface cannot display; `admin`'s 32 keys survive an untouched save | C | `H2` / `S-11` corollary | `W-57`, `W-10` |
| **RL-49** | A read failure on an authority surface is visible and disables the write; no `catch` or `!res.ok` path clears an authority set silently | A + C | `S-11` / `T-22` | `W-56` |
| **RL-50** | A role control renders every key the projection returned; a write that would remove an unshown role is **refused**, not applied | C | `I-34`ᴬ / `IA-R14` / `M2-17` | `W-54` |
| **RL-51** | No membership count or member list is computed from a collapsed single-role value | A + C | `IA-R13` / `IA-12` | `W-55` |
| **RL-52** | No `data-capability="planned"` element is the sole content of a tab panel; at most one tab-bar component in the Access tree; depth to a capability control ≤ 4 | A | `IA-R12`, `IA-R15` / `IA-14` | `W-57` |
| **RL-53** | No role-editing component reads or writes `user_access_profiles`, `user_department_access` or `user_site_access` | A | `IA-R16` / `RA-2` / `I-27` | `W-57` |
| **RL-54** | Lifecycle copy names what the command performs — removal copy says *removed from this organization*, never *revoked*, *deactivated* or *disabled*, while §2.1 holds | A | `R6` / `IA-R17` | `W-54`, `W-57`, `W-59` |
| **RL-55** | No migration grants any privilege on an access-control object to `anon` | A | `S-13` / `T-25` | `W-60` |
| **RL-56** | **The plan stays current** — no register ID exists in a corpus document that this plan names nowhere | A (docs lint) | `GAP-17` / `DR-13` | §44 |

**Two notes.**

- **`RL-48` locks a control that currently holds and has never been tested.** `01…§54`'s bottom row: every
  control in the eight-layer matrix is unlocked, *"and the simplification work is exactly the kind of change
  that degrades unlocked controls silently"* (`01…:2056-2058`) **[carried]**. `RL-48` is `RL-32`'s shape —
  it will never go red in review and will look like wasted effort until the day it doesn't.
- **`RL-56` is red on the day it lands**, because §52 is complete only as of this pass. That is `DR-13`'s
  intended cost (§44), and it should be adopted knowingly or not at all.

### 54.2 Migrations

Continuing §11; `M18` is the high-water mark **[verified this pass]**. **Every one targets `shared`** and
therefore requires a read-only preflight under [`MIGRATION-APPLY-GATE.md`](../vacilando-os/MIGRATION-APPLY-GATE.md)
before any authorization ask.

| # | Workstream | Migration | Target | Preflight focus |
|---|---|---|---|---|
| **M19** **[conditional]** | `W-20` | Reconcile legacy `user_profiles.role` / `app_users.role` shadow rows into `user_roles`, then the reads are deleted in `W-20` | shared | **Runs only if `Q15` is non-zero.** Row count == `Q15`, re-run at preflight; **no membership is widened** — a legacy `admin` row must not become an `admin` membership without an operator naming it (`AD-24`) |
| **M20** | `W-60` | Drop the `permissions` and `permission_keys` compatibility views | shared | Zero readers proven; **and the base-table `anon` grant audited first** — the views currently carry a contradiction that is resolving correctly (§47 `W-60`) |
| **M21** | `W-61` | `role_permission_grants` FK hygiene — collapse the duplicate `(org_id, role_key)` pair to one constraint, and change `ON DELETE CASCADE` to `RESTRICT` | shared | Exactly two identical constraints before, exactly one after; **no grant row loses referential cover**; a role definition holding grants cannot be deleted after the change — confirm no seed or teardown path relies on the cascade |

> **`M21` is `M15`'s missing twin, and Phase 0 wrote the argument for it.** `M15` drops the duplicate FK on
> `permission_key` (`M2-2`). The `role_key` pair is the same defect on the neighbouring column, with the
> worse `ON DELETE` posture: Phase 0's own comment records that the legacy `permission_key` pair *"disagreed:
> one RESTRICT, one CASCADE — meaning deleting a catalog key could silently delete grants"* and replaced them
> with a single `ON DELETE RESTRICT` (`…phase0…sql:125-141`) **[verified this pass]**. **Both `role_key`
> constraints are `CASCADE`** (`prod_baseline.sql:6348,6353`) **[verified this pass]** — so deleting a role
> definition silently deletes every grant it held, and nothing records that authority was destroyed.
> **`M15` should be widened to name both pairs**, or the fix lands on one column and not the other for the
> second time.

**`M19` is the only conditional-on-census migration Part IV adds**, and §11's rule applies to it verbatim:
*"A migration that is conditional on a census must not be written before the census answers, or it acquires a
`WHERE` clause nobody can justify."*

---

## 55. Verification tier and exit gate — waves 13 and 14

§10.1's tiers and §10.4's gate discipline apply unchanged. `EA-7` marks a workstream that ships a check and
therefore owes a red-run.

| Workstream | Tier | Fixture | Lock | `EA-7` | Note |
|---|:--:|---|---|:--:|---|
| `W-54` lossless role write | **C** + A + B | **`F17`** | `RL-50` | ✅ | `F17` is the multi-role member; **`Q17` sizes whether it is live or latent** |
| `W-55` count from membership | C + A | **`F17`** | `RL-51` | ✅ | Same fixture; batch 2 |
| `W-56` visible read failure | C + A | — | `RL-49` | ✅ | Fault injection; the A half is stated over every authority surface |
| `W-57` one-page editor | A + **B** | **`F18`** | `RL-48`, `RL-52`, `RL-53` | ✅ | `F18` = a role holding out-of-grid keys. **B is required** — this is a user-visible surface change |
| `W-58` one submit | C + A | `F18` | `RL-22` extended | — | Fault-inject mid-submit; **after `W-28`** |
| `W-59` retire four surfaces | A + B | — | `RL-54` | — | Opens with a reachability check (`01…§44.1`) |
| `W-60` retire the views | A + C | — | `RL-55` | ✅ | `M20`; base-grant audit precedes |
| `W-61` `role_key` integrity | A + C | — | **none** — see below | ✅ | `M21`, `M15` widened |
| `W-62` layer enumeration | A + B | `F1`–`F10` | `RL-47` | ✅ | Runs last in wave 14, by construction |

**`W-61` carries no lock of its own, and that is a `QE-9` instance, not an oversight.** Its three parts are
each locked elsewhere — the handler check by `RL-26`'s vocabulary discipline, the fabrication by `RL-35`'s
catalog rule, and the cascade by `M21`'s preflight. **A reviewer who wants a tenth lock should mint `RL-57`
for *"no authority row is deleted by a cascade"*, and Part IV records the gap rather than minting into its
own register a second time** — the same restraint §33.1 exercised.

### 55.1 Exit gates

| Wave | Exit |
|---|---|
| **13** | One role editor, reachable by one route. Four navigation levels. Every membership question answered from `role_keys`. No authority write narrower than its read. No authority surface renders an unknown state as an empty one. `H2` locked. **Evidence:** `wave13-execution-evidence.json` in the `wave1-execution-evidence.json` shape, plus browser evidence per §10.4 — this is the first wave in the plan whose deliverable is a **screen** |
| **14** | One declared layer enumeration, four entries, and the resolver reads nothing absent from it. No legacy membership store on the authority path. No compatibility view over the permission catalog. No admission predicate satisfying a capability gate. No authority deleted by cascade. **Evidence:** `wave14-execution-evidence.json`, plus `M19`–`M21` preflights and the `Q15`/`Q16` census answers they were sized against |

> **Wave 13 is the first wave in this plan that cannot be exited from a terminal.** Every prior wave's
> evidence is static analysis, fixtures and API-level tests. `W-57` and `W-59` change what an operator sees,
> and the managed-sprint contract requires real browser verification for user-visible change — route, steps,
> expected vs observed, console errors, failed requests, evidence paths. **`EA-7`'s red-run obligation does
> not substitute for it**, and a wave-13 completion claim without browser evidence should be rejected.

---

## 56. Two corrections, and `X-14`

### 56.1 `X-14` — `02…§17.8`'s new invariants collide with numbers this plan already binds

**Verified this pass, in file.** `02…§17.8` mints `I-33` and `I-34` unsuperscripted, with the explicit
rationale *"Deliberately no new letter series — each is an invariant, for the reason `M2-19` records"*
(`02…:1315`). But both numbers were already taken, and **this plan already binds them**:

| Number | Prior reading — bound here | New reading — `02…§17.8` |
|---|---|---|
| `I-33` | *authentication error text MUST NOT surface provider strings verbatim* — `04…§6.3`; bound at §19 **`W-32`**, §23, and `RL-29` | *the screen resolves through the resolver* |
| `I-34` | *password policy MUST be enforced server-side* — `04…§6.3`; bound at §18 **`W-31`**, §23, and `RL-38` | *read-modify-write is lossless* |

> **`X-14` — a document avoided minting a new letter series and collided instead with two numbers the plan of
> record had already bound to workstreams and locks.** `04…§6.3` had avoided this in the other direction by
> choosing `I-35`ᴮ *"above `02…`'s current ceiling"* (`04…:654`) **[carried]**; `02…`'s reopen minted
> **below** it. This is `X-1`'s collision arriving a fourth time, and the first time it lands on IDs that a
> **workstream, a lock and a coverage row** already cite.

**Disposition, applied inside Part IV only.** The corpus already has the instrument — `01…§16`'s ᴬ/ᴮ
superscripts, which §25 uses (`I-28`ᴬ, `I-30`ᴬ, `I-31`ᴬ/ᴮ). `02…` owns the ᴬ reading and `04…` the ᴮ. So
**Part IV cites `02…§17.8`'s as `I-33`ᴬ and `I-34`ᴬ**, and every bare `I-33`/`I-34` in Parts I–III continues
to mean `04…`'s, unchanged. **Nothing in Parts I–III is edited, and no source document is renumbered**
(§43, refusal 3). The Director's cheapest fix is for `02…§17.8` to adopt the superscripts at its next pass;
`CR-6`/`CR-7` (§52.2) are the mechanical form.

### 56.2 `T-21` and `S-10` are overstated — the constraint they say is missing exists twice

**Verified this pass, against `supabase/baselines/prod_baseline.sql` and the migration history.**

`T-21` rests on *"no FK constrains `role_key`"*, and concludes that capabilities *"can be authored for a role
that does not exist — and are live for anyone whose membership row carries that string"*, rated **S2**
(`01…:1793`) **[carried]**. **Two foreign keys constrain it**, both `(org_id, role_key) → role_definitions
(org_id, role_key)`:

```
role_permission_grants_role_definitions_fkey   ON DELETE CASCADE
role_permission_grants_role_fk                 ON DELETE CASCADE
```

Present in `prod_baseline.sql:6348,6353` and in `20260329165048_remote_schema.sql:6513,6518` **[verified this
pass]**. **So the grant write against a fabricated role does not succeed and go live — it is rejected by the
database.** `T-21`'s stated mechanism cannot occur, and its severity is overstated.

**Three real defects survive the correction, and `W-61` is sized against them** (§47): read-time fabrication
of a fifth role vocabulary; a handler that validates one column of a composite key and not the other, so the
operator gets a constraint error instead of a stated rejection; and **both constraints being `ON DELETE
CASCADE`**, which is the hazard Phase 0 fixed on the neighbouring column and left on this one (§54.2).

**And the asymmetry is real but inverted.** `user_roles.role` has no FK — only `org_id` and `user_id` are
constrained (`prod_baseline.sql:6453,6458`) **[verified this pass]**. **Grants are doubly constrained;
membership is unconstrained** — which is exactly what `02…§4.2` records as `M2-2` and what `W-16` closes.
`01…` Part V and `02…` Part I disagree on this point, and `02…` is right.

> **Recorded as a correction to the reopen, not to the product**, and stated here rather than in `01…`
> because Part IV is what sizes `W-61` and a workstream sized against an overstated finding is how a plan
> spends a migration on a constraint that already exists. `01…§44.5` invited exactly this re-check: the
> `role_key` row is *"the one 'yes' in that table a sceptic should re-check."*

### 56.3 `X-11` has a second instance

`X-11` records that `05…§5A` — the corpus's most-cited new depth measurement — exists only as an uncommitted
working-tree change (`01…§66`) **[carried]**. **The same is now true of `02…`'s Part III reopen**: §37–§40,
which carry clause 4, clause 5, `X-12`, `X-13`, the sitting placements and the `AD-24`/`AD-25` assignments,
are uncommitted at `03efba377` **[verified this pass]** — and §53 of this plan binds to them.

**Recorded, not resolved.** Committing is not a worker decision about content. It is stated because a
re-sequence that bound its decision register to uncommitted material without saying so would repeat exactly
what `X-5` and `X-11` record.

---

## 57. Limits — read before citing

1. **Static and file-grounded.** No database was queried, no browser opened, no request issued, no test run,
   no typecheck, no build. **No claim is made about how anything renders or behaves for a live operator.**
2. **Part IV mints no product finding.** Every defect claim is carried from its owning document with that
   document's evidence marker. The four things verified in source this pass are named in §59 and are
   confined to schema constraints, one API response field, and register high-water marks.
3. **`T-19`'s precondition is still unverified, and it gates the plan's most-promoted workstream.** `W-20`
   moves to batch 2 on a **structural** argument (§48). If `Q15` returns zero, `T-19` is latent rather than
   live, and `W-20`'s promotion should be re-argued — not silently kept.
4. **Wave 13's sizes assume the merge in §46 is complete.** It is assembled from five documents' worth of
   constraints; if a sixth constraint exists that no reopen recorded, `W-57` is the workstream that absorbs
   it, and it is sized `M` with no margin for a new prohibition.
5. **`W-57` is sized against `06…§18.2`'s recommendation** (*a section, not a chapter*). The chapter reading
   adds a route, a navigation entry and an authoring surface for an object the model does not have, and
   would need `RA-4` re-checked. **Do not read `W-57`'s `M` as covering both readings.**
6. **The `AD-24` collision is recorded, not resolved** (§53.2), so a reader citing `AD-24` must say which
   question they mean until the Director settles it. Part IV always means `D-15`.
7. **§45 does not close `GAP-15`.** It supplies the schedule form and the definition of done. The
   reconciliation table remains `02…`'s, and citing §45 as having closed `GAP-15` would be wrong.
8. **`RL-56` is a proposal with a known cost** — red on arrival, one coverage row per reopen forever. It is
   the mechanical form of `DR-13(a)` and falls if the Director takes `(b)` or `(c)`.
9. **Two of this part's inputs are uncommitted** — `05…§5A` and `02…§37`–`§40` (§56.3). Line citations into
   them will drift when they are committed, exactly as `04…§12.3` warned.
10. **No decision was answered, no ID renumbered outside this part's own citations, no workstream renamed or
    renumbered, and no section of Parts I–III was edited.** The only file written is this one.

---

## 58. Reproduce

```bash
# --- §56.2: the two role_key FKs T-21 says do not exist ----------------------
rg -n 'role_permission_grants_role' supabase/baselines/prod_baseline.sql
#   → :6348 role_permission_grants_role_definitions_fkey  (org_id, role_key) ON DELETE CASCADE
#   → :6353 role_permission_grants_role_fk                (org_id, role_key) ON DELETE CASCADE
rg -n 'role_permission_grants_role' supabase/migrations/20260329165048_remote_schema.sql   # :6513, :6518

# …and the argument Phase 0 wrote for M21, on the neighbouring column
sed -n '125,141p' supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql
#   → "the legacy pair disagreed: one RESTRICT, one CASCADE — meaning deleting a
#      catalog key could silently delete grants"; replaced by ONE fkey ON DELETE RESTRICT

# --- §56.2: membership is the unconstrained column (M2-2 is right) -----------
rg -n 'ADD CONSTRAINT "user_roles_' supabase/baselines/prod_baseline.sql   # org_id, user_id — no role FK

# --- §46 W-54: role_keys is already on the wire ------------------------------
rg -n 'role_keys' web/app/api/admin/settings/users-roles/members/route.ts  # :12, :103, :133

# --- §48: what W-0 Q2 actually answered --------------------------------------
P=docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
rg -n 'Q2 = 0|unreachable for everyone alive' $P                           # §9, §4.1's execution record

# --- §56.1 X-14: I-33 / I-34 are already bound to workstreams and locks ------
rg -n 'I-33|I-34' $P            # W-31, W-32, §23's rows, RL-29, RL-38 — all 04…'s readings
rg -n 'I-33 \(new\)|I-34 \(new\)' docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md

# --- §53.2: AD-24 names two questions ----------------------------------------
rg -n 'AD-24' docs/platform/planning/vacilando-os/qa/access-identity-v2/06-product-ia-and-flows.md   # capability: chapter or section
rg -n 'AD-24' docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md        # = D-15, sitting 1

# --- §56.3: which inputs are uncommitted -------------------------------------
git diff --numstat -- docs/platform/planning
#   → 02-canonical-access-identity-model.md and 05-command-enforcement-census.md both dirty

# --- §54: the register high-water marks this part mints above ----------------
rg -o 'RL-[0-9]+' $P | sort -uV | tail -3      # RL-42 minted; RL-43..RL-46 proposed, not minted (§33.1)
rg -o 'DR-[0-9]+' $P | sort -uV | tail -1      # DR-12
rg -o '\bF1[0-9]\b' $P | sort -uV | tail -1    # F16
rg -o '\bM1[0-9]\b' $P | sort -uV | tail -1    # M18

# --- §52: the coverage check RL-56 would run ---------------------------------
# BEFORE (the plan as it stood at 03efba377, which is the state §58 of 01… measured):
git show 03efba377:$P | grep -cE 'RM-[0-9]+|T-2[0-6]|S-(8|9|1[0-4])|M2-1[6-9]|RA-[1-5]|IA-1[1-4]|IA-R1[1-7]|A2-[89]|D-15|D-RM1|AD-2[2-5]'
#   → 8
git show 03efba377:$P | grep -oE 'RM-[0-9]+|T-2[0-6]|…|.D-15|D-RM1|AD-2[2-5]' | sort | uniq -c
#   → 8 AD-15   — every "match" is the substring D-15 inside AD-15. Add word
#     boundaries and the count is ZERO: the plan named no reopen register at all.
git show 03efba377:$P | grep -cE '\bRM-[0-9]+\b|\bT-2[0-6]\b|\bD-15\b|\bD-RM1\b|\bAD-2[2-5]\b'
#   → 0

# AFTER: every register below is named.
rg -c '\bRM-[0-9]+\b|\bT-2[0-6]\b|\bS-(8|9|1[0-4])\b|\bH[1-3]\b|\bM2-1[6-9]\b|\bRA-[1-5]\b|\bIA-1[1-4]\b|\bIA-R1[1-7]\b|\bA2-[89]\b|\bR[6-9]\b|\bAD-2[2-5]\b' $P
```

> **The `8` is worth reading twice, because it is `X-10`'s failure mode in the check written to detect it.**
> A reader who greps for `D-15` without word boundaries is told the plan covers it eight times over. **It
> covered it zero times.** `RL-56`'s lint must anchor every ID on word boundaries or it will certify the gap
> it exists to find — the same way `01…§65` found `R6`…`R9` returning *"21 matching lines, every one of them
> inside `IA-R6`…`IA-R9`."*

---

## 59. Provenance — Part IV

- **Inputs (reused, not re-derived).** `01-existing-state-inventory.md` Parts IV, V and VI at `03efba377` —
  `RM-1`…`RM-11`, `T-19`…`T-26`, `H1`…`H3`, `S-8`…`S-14`, `D-RM1`, `D-15`, `GAP-15`…`GAP-17`, `X-10`,
  `X-11`, §60's reopen delta and §67's cost table. `02-canonical-access-identity-model.md` at `c6e43be5f`
  plus its uncommitted Part III reopen — §1.3, §4.6 (`RA-1`…`RA-5`, `I-32`), §15.6, §17.7–§17.8
  (`M2-16`…`M2-19`, `I-33`ᴬ, `I-34`ᴬ), §37–§39 (clauses 4–5, `AD-24`/`AD-25`, the sittings).
  `04-authentication-model.md` at `288a51b7b` — §3.6–§3.7, §6.4 (`R6`–`R9`), §7.1 (`AD-22`, `AD-23`),
  `I-35`ᴮ, §12.1. `05-command-enforcement-census.md` §5A **(uncommitted)** — the 14-row depth table, the
  four-noun target, the presentation/architecture split. `06-product-ia-and-flows.md` at `207cd5322` — §14,
  §15 (the IA specification), §16 (`IA-11`…`IA-14`), §17 (`IA-R11`…`IA-R17`), §18.2. This plan's Parts I–III
  in full.
- **Read this pass, in source.** `supabase/baselines/prod_baseline.sql` (the `role_permission_grants` and
  `user_roles` constraint blocks); `supabase/migrations/20260329165048_remote_schema.sql:6498-6518`;
  `supabase/migrations/20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql:125-145`;
  `web/app/api/admin/settings/users-roles/members/route.ts`.
- **Mechanically verified this pass.** The two `(org_id, role_key)` foreign keys and their `ON DELETE
  CASCADE` posture, in both the baseline and the migration history; the absence of any FK on
  `user_roles.role`; Phase 0's own `RESTRICT`/`CASCADE` argument on `permission_key`; `role_keys` present in
  the members response; `W-0` Q2's wording and scope in §9 and §4.1; `I-33`/`I-34`'s existing bindings to
  `W-32`/`W-31`, §23 and `RL-29`/`RL-38`; the `AD-24` double assignment across `06…` and `02…`; the
  uncommitted state of `02…` and `05…`; and the `RL`/`DR`/`F`/`M`/`W`/`Q`/`X`/`CV` high-water marks.
- **New this part.** Workstreams `W-54`…`W-62` · waves 13–14 · ordering constraints §1.6–§1.9 · census
  questions `Q15`…`Q17` · locks `RL-47`…`RL-56` · migrations `M19`…`M21` · fixtures `F17`, `F18` · decision
  `DR-13` · corpus finding `X-14` · six amendments to existing workstreams · §52's coverage of the reopen.
  **Two corrections are made to prior conclusions** — this plan's own reading of `W-0` Q2 (§48) and the
  reopen's `T-21`/`S-10` (§56.2). **`RL-43`…`RL-46` are left reserved, not minted** (§54.1).
- **Escalated, not answered.** `AD-22`, `AD-23`, `AD-24`, `AD-25`, the capability-home question, `DR-13`,
  `X-14`'s renumbering, and `X-11`'s second instance. **No decision was answered.**
- **Not consulted.** The deployed database; any application source under `web/app` beyond the one route file
  named above; the running Director; `07-director-acceptance-rubric.md` beyond its bindings already carried
  in Parts II–III.
- **Method.** Static and file-grounded. **No code, schema, migration or UI was changed. No test ran, no
  typecheck, no build, no browser, no request, no query. No ID was renumbered outside this part's own
  citations, and no section of Parts I–III was edited. The only file written is this one.**

---

# Part V — The reopen's QA and evidence plan **[new — 2026-08-06]**

> **Trigger.** Part IV scheduled the reopen: waves 13 and 14, `W-54`…`W-62`, locks `RL-47`…`RL-56`,
> migrations `M19`…`M21`, census questions `Q15`…`Q17`, fixtures `F17` and `F18`. §55 gave each workstream a
> tier and each wave an exit gate. **None of those artifacts is specified**, no red run is scheduled, no
> preflight query is written, and the one wave in this plan whose deliverable is a **screen** has an exit
> gate that names browser evidence without saying what it must contain.
>
> **Parts I–IV are unmodified.** Part V extends Part III to the reopen — and reports what this pass found
> when it re-read the runtime that grades this work: **`QE-10`…`QE-17`, eight findings, all of them about
> the evidence apparatus, one of them about the reopen that produced this assignment — and one (`QE-17`)
> about the resume that put a second worker on this very file while it was being written.**

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *QA and evidence plan* · assignment `asg_ae2d65e739f71c`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-director-experience-dx5-5-continuation` @ `agent/cursor/6-vacilando-v3-4-conversational-director`
**Date** 2026-08-06 · **Base** `d6436ddb5` (Part IV)
**Method** Static and file-grounded. The assignment store, the evidence gallery, the deliverable-review
store, the package register and the acceptance ledger for this mission were read this pass, together with
the runtime source that writes them. **No code, schema, migration or UI changed. No test ran, no browser
opened, no request issued, no query executed, no decision answered, and no ID renumbered.**

**Registers used.** Findings continue Part III's `QE-` register from `QE-10`. Evidence classes continue
`EA-` from `EA-8`. Decisions continue `DR-` from `DR-14` — `DR-13` is Part IV's high-water mark
**[verified this pass]**. Fixtures `F17`/`F18` were minted by Part IV and are specified, not renumbered,
here. **No existing ID in this corpus is renumbered, merged or retired by this part.**

---

## 60. Why Part III and §55 do not already cover this

| # | Gap | Closed by |
|---|---|---|
| 1 | **`F17` and `F18` are named in a tier column and specified nowhere.** §35 specifies `F1`–`F16` as a buildable module — path, shape, batch, and which fixtures encode a defect and must invert. Part IV added two more in a table cell | §63 |
| 2 | **Wave 13's exit gate says "browser evidence" and stops.** §55.1 is right that it is *"the first wave in this plan that cannot be exited from a terminal"*, and does not say which route, which principal, which state, or what the artifact is — while the acceptance runtime's only content-reading checker wants **a directory of images** (`QE-3`, §34.1) | §62, §64 |
| 3 | **Ten locks carry an `EA-7` obligation and two of them cannot go red.** §54.1 says so of `RL-48` and `RL-56` in prose. An obligation that is unsatisfiable for two members of its own set needs a stated discharge rule, or it will be discharged by assertion | §65 |
| 4 | **`M19`–`M21` have a "preflight focus" column, not a preflight.** §37 established what `acceptance.mjs` enforces on a `shared`-target migration and wrote the query for four of `M1`–`M18`. Part IV's three inherit the enforcement and not the specification | §66 |
| 5 | **`Q15`–`Q17` gate a decision, a migration and a wave, and no artifact shape is stated.** `Q17` decides whether wave 13 is a correctness fix or a usability fix (§49) — which changes what `F17`'s red run *means* | §67 |

And one gap that did not exist when Part III was written, because it is the reopen itself: **this
assignment is the second pass on `AC_d12_qa_evidence`, and nothing in the record says so.** §61 is what
that turned into when it was checked.

---

## 61. What decides "met" after a reopen — `QE-10` … `QE-17`

Part III established that four mechanisms decide "met" and that three of them ran. This pass re-read all
four **after** a mission-wide reopen. Two of Part III's findings re-confirm at larger n; **eight** are new;
and **none is a product defect** — they are defects of the evidence apparatus, in `X-1`…`X-14`'s class.
**`QE-17` was found by the mechanism it describes** and is the last of the eight.

### 61.1 What changed since Part III, in numbers

| | Part III (2026-08-04) | This pass (2026-08-06) |
|---|---|---|
| Artifacts in the gallery | 59 | **141** **[verified]** |
| Artifacts with a null `command` **and** a null `exitCode` | 59 / 59 | **141 / 141** **[verified]** — `QE-6` holds at 2.4× the sample |
| Packages compiled for this mission | 0 | **0** **[verified]** — `QE-3` holds |
| Rows in `acceptance/ledger.jsonl` | 0 | **0** **[verified]** |
| Deliverable reviews | 11 | **28** **[verified]** |
| Reviews at `passed: 7, total: 7` | 11 | 15 |
| Reviews at `passed: 6, total: 7` | 0 | **13** **[verified]** |
| Criterion results not `met` | 0 | **0 of 28** **[verified]** |
| Assignments | 12 | **15** — `p1`…`p12`, plus `impl_w0`, `impl_w1`, `impl_w1b` **[verified]** |

**The row that matters is the last three together.** Thirteen reviews now record a **failing** automatic
check, and the criterion verdict moved for none of them.

### 61.2 The findings

**`QE-10` — a criterion's `met` is the worker's own claim, copied verbatim; a failing check does not move
it.** `deliverable-review.mjs:366` reads `const acResults = report.acceptanceCriteriaResults || []` — the
*worker's completion report* — and `:584` writes it into the review as `acceptance_criteria_results`
**[verified in source]**. The seven automatic checks are assembled beside it and never consulted by it. The
`acceptance_criteria` check is itself satisfied when `acResults.length > 0` (`:367-368`) — that is, when
the worker claimed something. Concretely, review `drev_c82fea64afbe` (`asg_fccd7bdedcab5b`, this plan's
Part II pass) records `tests_passed: "fail"`, detail *"Test run incomplete"*, `passed: 6, total: 7` — and
`AC_d10_sequence: "met"` **[verified]**. **Thirteen of twenty-eight reviews are in that state and
twenty-eight of twenty-eight criteria are `met`.**

> Part III's `QE-4` said `met` means *"the file exists at the declared path, the worker's reported files
> were in scope, and the worker attached artifacts naming the criterion."* At n=11, with seven passing
> checks, that was the honest reading. At n=28, with thirteen failures on the record and no verdict moved,
> **the checks are not a weak grader — they are not the grader.** The verdict is the worker's, and the
> Director's review is the envelope it travels in.

**`QE-11` — the two checks that would catch a scope violation are constants.** `validateAssignmentCompletion`
(`worker-assignment.mjs:574-601`) **[verified in source]**:

```js
const deliverablesOk = (a.expectedDeliverables || []).length === 0
  || (a.completionReport?.changesMade || []).length > 0
  || artifacts.length > 0;                 // :579-581 — any artifact satisfies it
const withinScope = true; // Phase tranche: structural check; deeper diff scan later   // :582
```

`within_scope` is the literal `true`, and `deliverables_ok` is satisfied by **attaching anything**, without
reading the declared deliverable path. All fifteen of this mission's assignments therefore record
`within_scope: true` **[verified]** — a value carrying no information. **This is why `QE-7` was never
caught**: four criteria whose diff artifact attributed files under `scripts/local-dev/apps/vacilando/` to
Access & Identity passed a scope check that cannot fail.

**`QE-12` — the reopen preserves the verdict it invalidates.** `reopenAssignmentsForMoreWork`
(`worker-assignment.mjs:697-718`) **[verified in source]** clears `dispatch`, `completionReport`,
`contextAcknowledgement`, `workerId` and both pause reasons, sets `reopen_reason`, and **does not touch
`validation`**. But `validation.passed` is computed as
`missing.length === 0 && deliverablesOk && a.completionReport && a.completionReport.status === "complete"`
(`:583`). So after a reopen the record asserts a verdict its own validator could not produce. `impl_w0`
today, in one object **[verified]**:

```
"status": "ready", "completionReport": null, "contextAcknowledgement": null, "progress": [],
"validation": { "passed": true, "missing_evidence": [], "deliverables_ok": true,
                "within_scope": true, "validated_at": "2026-08-04T17:06:16.682Z" }
```

The `startReport` survives too, carrying its own nested `contextAcknowledgement` dated 2026-08-04 while the
top-level acknowledgement is `null` — **so the reopen erases the evidence that context was acknowledged and
keeps the acknowledgement**, one field deeper.

**`QE-13` — the reopen is mission-wide, unattributed and unnumbered.** Three consequences, each verified:

1. **One reason string on all fifteen assignments.** The reopen matches every assignment whose status is
   `complete`, `paused` **or `ready`** (`:704`) and stamps the same `reopen_reason`. `"reopen_reason"`
   occurs **15 times** in this mission's assignment store **[verified]** — including on `impl_w0`,
   `impl_w1` and `impl_w1b`, which were `ready` and had produced nothing to review. **The record cannot say
   which deliverable the operator was looking at.** This assignment's card carries *"Operator requested
   more work after reviewing the outcome"* for the same reason every other card does.
2. **No attempt or revision is incremented.** No counter is written by the reopen path, and the store's
   `attempt` values remain `1` **[verified]**.
3. **The gallery has no revision dimension.** An artifact carries
   `{evidenceId, assignmentId, missionId, type, title, description, createdAt, createdBy, fileUri,
   externalUri, command, exitCode, repositorySha, branch, environment, acceptanceCriteriaIds, verifiedBy}`
   — **and no field naming the pass it belongs to** **[verified]**. `AC_d1_existing_state` …
   `AC_d11_acceptance_rubric` are each cited by two disjoint blocks of artifacts, one per pass, and
   `acceptanceEvidenceCoverage` links them by criterion (`evidence.mjs:186-188`).

> **Therefore coverage cannot fall after a reopen.** Status is `passed` unless *zero* artifacts link, and
> `hasFail` needs a non-null non-zero `exitCode`, which 141 of 141 artifacts do not have (`QE-5`, `QE-6`).
> **A reopen adds artifacts to a criterion that was already `passed` and can only make it more so.** The
> operator's judgement that the work was insufficient is the one input the coverage view cannot represent.

**`QE-14` — the implementation-stage evidence upgrade is inert.** Three declarations of required evidence
sit on every assignment and one wins:

| Where | Value on `impl_w1` | Effect |
|---|---|---|
| `requiredEvidence` — hard-coded in the factory (`worker-assignment.mjs:124`) | `["log", "document"]` | **governs** |
| `evidenceProfile` — rewritten for impl phases (`mission-advance.mjs:243`) | `"code_only"` = `["diff","test","typecheck","build","commit"]` | inert |
| `completionContract.evidenceProfile` (`:244-247`) | `"code_only"` | inert |

`missingRequiredEvidence` prefers `requiredEvidence` whenever it is non-empty (`evidence.mjs:206-212`)
**[verified in source]**, and the factory sets it unconditionally for every phase of every compiled mission
— **it is not derived from the phase's kind**. `mission-advance.mjs` upgrades the profile for `impl_`
phases and never clears `requiredEvidence`, so the upgrade changes nothing. **Wave 1 can complete with a
log and a prose document and no test artifact**, against an exit gate that demands red-before /
green-after per suite (§10.4).

> **And the profile wave 13 needs exists and is used by nothing.** `ui = ["diff","test","typecheck",
> "build","commit","screenshot","browser"]` (`evidence.mjs:29`) is the only profile carrying `screenshot`
> or `browser`. No assignment in this mission declares it **[verified]**. §55.1 requires browser evidence
> for wave 13; the mechanism that would *require* it is one string.

**`QE-15` — the implementation assignments execute against a frozen copy of this plan.** All three name
`docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` in `scope` and
`expectedDeliverables` **[verified]**. That file is the **2026-07-30 plan of a different mission** — its
header reads `msn_e9133cdade883793d2` · `asg_c505e1d0d76acd` · contentHash `a48a454dc1a5a25a537a345999d982dc`
**[verified]** — and a search for `W-54`…`W-62`, `Part III` or `Part IV` in it returns **zero matches**
**[verified]**. **So the only execution vehicles this mission has point at a document containing neither
the QA plan nor the reopen re-sequence.** This is `X-2`/`DR-4` — *where the canonical artifacts live* —
arriving as an execution defect rather than a documentation one, and it is the first time it can cost work
rather than tidiness.

**`QE-16` — waves 2 through 14 have no execution vehicle.** Fifteen assignments exist: twelve specification
phases and `impl_w0`, `impl_w1`, `impl_w1b` **[verified]**. There is no phase for waves 2–12, and none for
the two waves the operator's directives produced. Additionally **`impl_w1b`'s only declared deliverable is
a markdown file** — its objective is *"build-time check that service-role routes resolve a principal"*, and
neither its `scope` nor its `expectedDeliverables` names any source or test path **[verified]**. Under
`QE-11`, nothing will notice.

**`QE-17` — a resume can put two workers on one deliverable, and the deliverable is the only place it
shows.** This assignment's record carries **both** `reopen_reason` and
`"stalled_reset_reason": "Operator resumed after worker went silent"` **[verified in the store this
pass]** — the second string is produced verbatim by `mission-reopen.mjs:137` on the `actor: "operator"`
branch, so it records a click, not a Director inference. Three things follow, each read in source:

1. **The resume does not require the worker to be silent.** `resumeStalledMission` refuses only when
   `posture.id !== "worker_silent"` **and** no assignment is `running`/`verification` (`:126-133`)
   **[verified]**. When a worker *is* live the posture is not `worker_silent`, `claimed` is non-empty, and
   the guard passes on the second clause. The reset list then falls back to *every* claimed-running
   assignment (`:120-124`).
2. **Nothing terminates the process it declares stalled.** `resetStalledRunningAssignments`
   (`worker-assignment.mjs:724-749`) **[verified]** sets `status: "ready"` and nulls `dispatch`,
   `completionReport`, `contextAcknowledgement`, `workerId` and `provider` — a **store** operation. No
   signal is sent, no PID is read. Its docstring is *"Reset claimed-running assignments that have **no live
   worker**"*, and that premise is asserted by the caller, not checked. `resumeStalledMission`'s own
   docstring — *"Does not pretend the old process is still live"* (`:106-107`) — is true of the record and
   is not true of the machine.
3. **It clears `validation` no more than the reopen does.** This record holds
   `validation.passed: true, validated_at: "2026-08-04T16:42:25.372Z"` beside `completionReport: null`
   **[verified]** — `QE-12` again, reached through the second door.

> **What that cost, here.** While this session was reading, the deliverable grew **5,223 → 5,436 lines at
> 15:36:22 local**, and this session held no edit **[verified: `git diff --numstat` moved from 407 to 601
> added lines across two reads]**. Two `claude -p` processes carrying the Vacilando worker allowlist were
> alive, started **15:31** and **15:34**; the acknowledgement in the store is stamped **22:34:46.666Z**
> **[verified]**. **Two sessions were executing `asg_ae2d65e739f71c` at once.** The output was not lost —
> the second pass at this section is a correction to work the first pass had already written (§70.3) — but
> that is a property of what the two happened to be doing, not of anything the runtime guarantees.

**And the store cannot say any of it.** `workerId` is `"claude-6"` — the **slot**, not the session;
`dispatch.sessionId` holds one value; `dispatch.attempt` is `1`; `progress` is `[]` **[all verified]**.
`QE-13` said a reopen is unattributed and unnumbered. **A resume is the same defect with a race attached**:
the reopen duplicates *claims* about one deliverable, the resume duplicates *writers* of it.

### 61.3 What this means for waves 13 and 14

Not that the plan is unbuildable. Three things, each of which the sections below act on:

1. **A wave-13 completion claim will be graded by the mechanism `QE-10` describes** — the worker's own
   criterion result, in an envelope of checks that do not gate it. The counter is §62's `EA-9`: an evidence
   form a reader who was not there can *falsify* by looking at it. That is the only lever this plan owns.
2. **`qa_evidence` is the one checker that reads content, and wave 13 is the first phase that can satisfy
   it** (§34.1, `acceptance.mjs:30`, `:145`). It wants a **directory of images**. §64 declares one.
3. **The reopen that produced this assignment is invisible in the record** (`QE-13`). Part V therefore
   marks its own pass explicitly (`EA-8`) and recommends the mechanism, rather than relying on the next
   worker doing the same by disposition (`DR-14`).

---

## 62. Two evidence classes the reopen requires — `EA-8`, `EA-9`

`EA-1`…`EA-7` (§32) are unchanged and are not restated. Two classes are added because two of this part's
findings have no artifact that could express their repair.

| # | Class | Produced by | Path / form | Makes falsifiable |
|---|---|---|---|---|
| **EA-8** | **Pass marker** — every artifact and every deliverable section states the pass it belongs to: assignment, base commit, and *which* reopen instruction it answers | the authoring worker, until the runtime carries it | a `**[pass N — <base sha>]**` marker in the deliverable's part header, and the same string in each artifact `description` | **which pass produced which claim.** Without it, coverage sums two passes of one criterion and cannot fall (`QE-13`) |
| **EA-9** | **Screen record** — for a user-visible change: a directory of images plus a `screens.json` binding each image to route, principal, precondition, action, expected, observed, console errors and failed requests | the workstream shipping the surface | `docs/platform/planning/vacilando-os/qa/access-identity-v2/wave13-screens/` — **a directory, so `qa_evidence` can walk it** | that the screen was seen, in a state, by a principal — and, uniquely in this plan, it is readable by the acceptance runtime (§34.1) |

**Two rules govern the additions**, continuing §32's three.

4. **An artifact that cannot name its pass is not evidence for a reopened criterion.** It may be evidence
   for the criterion in general; it cannot be evidence that the reopen was answered.
5. **A screen record is a record of observation, not of intent.** The `observed` field is written from the
   image, and an `observed` that merely restates `expected` is `EA-7`'s vacuity in a screenshot: the
   worktree contract's *route, steps, expected vs observed, console errors, failed requests* is the
   required shape, and *"as expected"* fails it.

---

## 63. `F17`, `F18`, and the fault-injection harness

§35 specifies the fixture module — `web/tests/access/fixtures/principals.ts`, one definition with two
materializations, batched to the wave that needs it. **It still does not exist**: `web/tests/access/` holds
four suites and no `fixtures/` directory **[verified this pass]**. Part IV's two fixtures are specified
here in the same terms.

| Fixture | Principal / object | Batch | Encodes a defect? | Used by |
|---|---|:--:|---|---|
| **`F17`** | A member holding **two roles in one org** — `{admin, regional_lead}` — with `role_keys` returning both and `primary_role` collapsing to `admin` | **2**, with `W-54`/`W-55` | **Yes — and it must invert.** Today the editor writes one role and deletes the other (`M2-17`), and the rail counts the member under `admin` only (`IA-12`). Built first asserting *that*, then inverted | `W-54`, `W-55`, and `W-17` when it lands |
| **`F18`** | A role whose grant set includes **keys the 9-row grid cannot represent** — the `admin` seed's 32 active keys against 18 grid-representable ones | **6**, with `W-57`; needed by `W-58` | **No — it asserts a control that holds.** `H2` is true today and untested (`01…§48`, `§54`) | `W-57`, `W-58`, `W-10` |

**`F17` is the fixture whose meaning depends on a census.** If `Q17` returns zero multi-role members, `F17`
is a synthetic principal asserting a defect no tenant has hit; if non-zero, it is a reproduction of live
authority loss (§49). **The fixture is identical either way and the red run is not**: under a zero `Q17`
the `EA-7` red is a mutation red (§65) and the wave-13 claim is *"this cannot happen"*, not *"this stopped
happening."* **State which, in the wave evidence file.**

**`W-56` needs a harness, not a fixture**, and §55's `—` in its fixture column is correct. Its defect is
that a **failed read** renders as an empty grant set and Save then persists it (`T-22`, **S3**). Proving
that requires the read to fail on demand:

> **The fault-injection shape.** Mock the grants `GET` at the fetch boundary to return `!res.ok`, then to
> throw — the two paths `AccessRolesConfigurationPage.tsx:128-135` handles identically. Assert, in both:
> an error renders, the grant set is not silently emptied, and **Save is disabled**. Then remove the
> injection and assert Save re-enables. **The second half is the `EA-7`** — a Save that is disabled
> unconditionally is not a fix.

This is the same category as §36's two-process harness: a **runner**, generalizable beyond its first
workstream. `S-11` states the invariant over *every* authority surface, so the injection point belongs in
the shared fixture module, not in one suite.

---

## 64. Tier D for wave 13 — the screen record

§34.1 established tier D's format and that `qa_evidence` walks a directory for images. §55.1 established
that wave 13 cannot be exited from a terminal. This states the run.

**The route is `/organization/access`, not the internal path.** `web/next.config.ts:248` rewrites
`/organization/access` → `/adminV2/settings/organization/access` **[verified this pass]**. Evidence
captured at the internal path is evidence about a URL operators do not use; the managed-sprint contract's
"real browser verification" means the operator's URL. **The slot's assigned port, the slot's QA identity,
never production** — the worktree contract governs and is not restated further.

| # | Screen | Principal | Precondition | The assertion the image must settle | Workstream |
|---|---|---|---|---|---|
| **S1** | Users chapter → role control | `admin` | An `F17` member exists | **Both** role keys are rendered before any edit | `W-54` |
| **S2** | Users chapter → save a changed role for the `F17` member | `admin` | as S1 | The unshown role survives, **or** the write is refused with a rendered error. Not a silent success | `W-54` |
| **S3** | Roles chapter rail + the selected role's user list | `admin` | as S1 | The `F17` member appears under **both** roles, in the count **and** the list | `W-55` |
| **S4** | Roles chapter → Permissions, with the grants read failing | `admin` | fault injection (§63) | An error is visible and **Save is disabled**. The failure mode is a legitimate-looking all-*None* grid | `W-56` |
| **S5** | Role page, top to bottom | `admin` | `F18` role | One page, no sub-tab bar, no placeholder panel; depth to a capability control ≤ 4 | `W-57` |
| **S6** | The four retired URLs | `admin` | — | Each lands on `/organization/access` or 404s; none renders a second grid. For the two `adminV2` aliases the assertion is that the **three-hop chain terminates** there (§70.2) | `W-59` |
| **S7** | Role page as a non-admin operator | `ops` | `Q11`'s holder question answered | The gradient: what an `ops` principal may edit is narrower and **stated**, not silently disabled | `W-57`, `W-29` |

**S6 is smaller than `W-59` assumes, and §70.2 records why.** **All four** URLs already redirect — two
directly, two through a three-hop chain. S6 confirms the chain; it no longer discovers reachability (§70.3).

**The artifact.** `wave13-screens/` — one image per row, named `s<N>-<workstream>.png`, plus `screens.json`
with one object per row: `{id, route, principal, precondition, action, expected, observed, consoleErrors,
failedRequests, image, at, commitSha}`. `commitSha` and `at` are `EA-5`'s fields and `EA-8`'s marker in one
place. **The directory path is what the package's `qa_evidence` criterion declares** — this is the first
phase in the programme where that checker is not a category error (§34.1, `QE-3`).

> **One reading of the evidence apparatus makes this concrete.** `evidence_present` counts *"meaningful"*
> artifacts by excluding titles matching `^(log|notes|document)\s*[—-]` (`deliverable-review.mjs:356-362`)
> **[verified in source]** — a title filter, not a content test. A screen record passes it for the right
> reason: it is not prose, and a reader can open the image and disagree.

---

## 65. Red-run feasibility for `RL-47` … `RL-56`

§54.1 minted ten locks; §55 marks eight of the nine wave-13/14 workstreams `EA-7` — *ships a check,
therefore owes a red run*. **Two of the ten cannot go red against the pre-fix tree**, and §54.1 says so of
`RL-48` and `RL-56` in prose. An obligation with unsatisfiable members needs a discharge rule.

> **The rule. `EA-7` is discharged in one of three ways, and the wave evidence file states which:**
> **(a) pre-fix red** — the check run against the tree before its workstream, shown failing;
> **(b) mutation red** — the check run against a deliberately broken copy of the fixed code, shown failing,
> with the mutation quoted; **(c) unsatisfiable** — stated, with the reason, and the lock marked as
> protecting a control that already holds. **(c) is a legitimate outcome and an undeclared (c) is not.**

| Lock | Discharge | The red state |
|---|:--:|---|
| `RL-47` one membership store | **(a)** | Pre-`W-20`: `fetchLegacyAdminOpsOrgAndRole` reads `user_profiles.role` — the check names it and fails |
| `RL-48` `H2` grant preservation | **(b)** | `H2` holds today (`permissionGrid.ts:65,74-76`). Mutate `applyGridRowSelection` to replace rather than merge; 14 of `admin`'s 32 keys vanish on an untouched save |
| `RL-49` visible read failure | **(a)** | `AccessRolesConfigurationPage.tsx:128-135` — both paths clear the set and set no error |
| `RL-50` lossless role write | **(a)** | The `F17` edit through `PATCH …/role` destroys the unshown role today |
| `RL-51` count from membership | **(a)** | The rail under-counts `F17`'s second role today |
| `RL-52` one tab bar, depth ≤ 4 | **(a)** | Five sub-tabs and two placeholder panels exist today |
| `RL-53` no scope tables in the role editor | **(b)** | No role-editing component reads them today. Mutate one to import `user_department_access` |
| `RL-54` lifecycle copy | **(a)** | `04…§6.4` `R6` — the copy that names removal as revocation is in the tree |
| `RL-55` no `anon` grant on access objects | **(a)** | Phase 0's `GRANT SELECT … TO "anon"` is in the migration history and the check must see it **there**, not only in new migrations |
| `RL-56` the plan stays current | **(c)**, declared | Red on arrival by construction (§54.1). Its first green is the coverage row of the next reopen |

**`RL-55`'s row is the one worth arguing with.** A lint over *new* migrations goes green on the day it
lands and never sees the grant that motivated it. A lint over the *whole* history is red until the
migration is amended or the check is given an explicit, dated exemption. **The second is the check `S-13`
asks for**, and it is the same argument §34 makes for `RL-30`'s shrinking exemption list.

---

## 66. Preflight evidence for `M19` – `M21`

§37's contract applies verbatim: every migration in this register targets `shared`, so
`acceptance.mjs:193-219` returns **`unmet`** — not `operator_review` — for a missing or non-object
`preflight`, or for `preflight.ok !== true`. The artifact is
`migrations[].preflight = { ok, summary, evidence_path }` with JSON at `evidence_path`.

| Migration | The preflight must establish | Channel | Why it is not obvious |
|---|---|---|---|
| **`M19`** (`W-20`, conditional) | The `Q15` population, **re-counted at preflight, not inherited**; and that the reconciliation **widens no membership** — a legacy `admin` row must not become an `admin` membership without an operator naming it | `database.read_census` | `Q15` is a decision input for `AD-24` and a preflight input for `M19`, and §49 is explicit that a census answer is *"a snapshot, not a standing warrant"* — `W-0`'s counts were nine days old when Part II re-cited them |
| **`M20`** (`W-60`) | **Two things, in this order**: (1) the base table `permission_definitions`' own grant posture, audited and recorded; (2) zero readers of either view, in application source **and** in migrations | repository search **+** `database.read_census` | §47 is explicit that the views *carry a contradiction that is resolving correctly*. Dropping the object that carries a contradiction is not resolving it, and a preflight that only counts readers would let the drop proceed with the base grant intact |
| **`M21`** (`W-61`) | Exactly two `(org_id, role_key)` constraints before and one after; **no grant row loses referential cover**; and **no seed, teardown or test path relies on the cascade** | **repository search, not a database read** | The last clause can fail silently. Changing `CASCADE` → `RESTRICT` turns any code path that deletes a `role_definitions` row holding grants from a silent success into an error, and that path lives in the repository, not in the database |

> **`M21`'s third clause is a preflight that `database.read_census` cannot answer**, and stating that is the
> point: §37's channel is a *read* channel for live data. A preflight whose risk is in the code is
> discharged by an enumerated search over the code, recorded in the same evidence file, with the search
> string quoted. **A preflight artifact that names a query it did not run is `EA-7`'s vacuity in JSON.**

**`M19` is conditional and §11's rule governs it verbatim**: it must not be written before `Q15` answers,
*"or it acquires a `WHERE` clause nobody can justify."* **This phase runs no preflight and writes no SQL.**

---

## 67. Census evidence for `Q15` – `Q17`

`W-23` produces `wave0b-authority-census.json` in `wave0-authority-census.json`'s shape — **the query text
beside each answer** (§4.1). Part IV's three questions inherit it, with three added fields.

| Field | Why |
|---|---|
| `question`, `sql`, `answer`, `ran_at`, `by` | §4.1's existing shape. `sql` is the text that ran, not a description of it |
| **`gates`** | Which workstream, migration or decision this answer releases — `Q15` → `W-20`, `M19`, `AD-24`; `Q16` → `W-61`; `Q17` → `W-54`, `W-55`, `W-17`. **A census answer with no consumer should not have been asked** |
| **`expires`** | `Q15`: **at `M19`'s preflight** — re-run, never inherited (§49, §66). `Q16`, `Q17`: at their workstream's start |
| **`zero_means`** | What a zero answer changes. `Q17 = 0` means wave 13's first two workstreams are locks against a latent defect and their `EA-7` becomes a mutation red (§63, §65). `Q15 = 0` means `T-19` is latent and **`W-20`'s promotion to batch 2 must be re-argued, not silently kept** (§57 limit 3) |

**`zero_means` is the field this corpus has repeatedly needed and never had.** `W-0` Q2 returned zero, and
the plan drew a conclusion from it that §48 had to correct two missions later — not because the count was
wrong, but because **nothing recorded what the zero licensed.** A census that states in advance what each
answer will change is the cheapest available guard against reading it as the answer to a different
question.

---

## 68. The evidence ledger, extended

§38's two tables stand. These are the rows the reopen adds. Neither table asserts sufficiency —
`07…§12.3`'s *"presence, not sufficiency"* governs both.

### 68.1 Product — the reopen's claims → wave → evidence

| Claim | Owner | Wave | Tier | Evidence artifact |
|---|---|:--:|:--:|---|
| *"Four layers"* is graded, not argued | `GAP-15` / §45.3 | 14 | A + B | `W-62`'s declared enumeration + the check that fails on a ninth read. **One artifact, three counts satisfied** (§45.3) |
| One role editor, one route | `GAP-16` / `RM-6` | 13 | A + **D** | `RL-54` + the S6 screen record; the tier-A check *"exactly one component renders a role-permission grid"* is the load-bearing half |
| No authority write is narrower than its read | `I-34`ᴬ / `M2-17` | 13 | C + **D** | `F17` + `RL-50` + screens S1, S2 |
| Every membership question answered from `role_keys` | `IA-R13` / `IA-12` | 13 | C + A | `F17` + `RL-51` + screen S3 |
| No authority surface renders unknown as empty | `S-11` / `T-22` | 13 | C + A | The fault-injection harness (§63) + `RL-49` + screen S4 |
| `H2` — a grant save preserves what it cannot display | `01…§48` | 13 | C | `F18` + `RL-48`, discharged by mutation (§65) |
| No authority deleted by cascade | `W-61` / §56.2 | 14 | C | `M21`'s preflight, including the repository half |
| L5 is one table with one grant posture | `T-25` / `S-13` | 14 | A + C | `M20`'s two-part preflight + `RL-55` over the **whole** migration history |

### 68.2 Mission — this deliverable, under a reopen

| Criterion | Mode | `EA` classes | The count, and where it comes from |
|---|:--:|---|---|
| `AC_d12_qa_evidence`, pass 1 | Count | `EA-1`, `EA-2`, `EA-4`, `EA-6` | Part III: 31 workstreams tiered, 7 waves gated, 16 fixtures batched, 9 findings verified |
| **`AC_d12_qa_evidence`, pass 2** | Count | **`EA-8`** + the above | **This part:** 9 wave-13/14 workstreams' artifacts specified, 2 fixtures + 1 harness, 7 screens, 10 locks given a discharge, 3 preflights written, 3 census answers shaped, 8 findings verified, 3 corrections. **The pass marker is what distinguishes this row from the one above** (`QE-13`) — **and this row was itself written by two concurrent sessions** (`QE-17`), which is the sharpest available argument for `DR-14`'s pass field |
| `RB-24`…`RB-27` | — | — | Unchanged by this part. §38.2 stands, and `QE-10` sharpens why `RB-26` matters: the roadmap will inherit whatever the runtime lets it inherit |

---

## 69. Decisions this part raises — `DR-14` … `DR-19`

Continuing §44's `DR-13`. **None is worker-resolvable**; each is recorded with a recommendation and **not
performed**. All five would be changes to `scripts/local-dev/lib/vacilando/` — application source this
phase's brief forbids and this document did not touch.

| # | Decision | Recommendation |
|---|---|---|
| `DR-14` | **Should a reopen be per-deliverable and revision-numbered?** (`QE-12`, `QE-13`) Today it resets fifteen assignments with one reason string, keeps a `validation.passed: true` its validator cannot derive, increments nothing, and adds artifacts to criteria that can only become more `passed` | **Yes.** Target the reopen at the phases the operator names; clear `validation` when the completion report it rests on is cleared; increment `attempt`; stamp the pass on each artifact. **The last is one field and it is the one that makes coverage able to fall** |
| `DR-15` | **Should `requiredEvidence` derive from the phase kind — and should wave 13 run under `ui`?** (`QE-14`) It is a hard-coded `["log","document"]` on every assignment; the profile upgrade for implementation phases is inert; the only profile carrying `screenshot`/`browser` is used by nothing | **Yes to both.** Either derive `requiredEvidence` from the profile or stop writing it. Wave 13 is the case that proves it: its deliverable is a screen and its evidence contract currently asks for prose |
| `DR-16` | **Which copy of `03…` do implementation assignments execute against?** (`QE-15`) All three are scoped to the frozen QA-folder copy — a different mission's 2026-07-30 plan, containing neither Part III nor Part IV | **Re-scope them to the product-source copy**, or make the QA copy a pointer to it. This is `X-2`/`DR-4` with a cost attached: an execution phase reading its declared scope would build the accepted plan of a superseded mission |
| `DR-17` | **Should a criterion's `met` be computed rather than copied?** (`QE-10`, `QE-11`) It is the worker's own report, echoed into the Director's review; thirteen reviews carry a failing check and no verdict moved; `within_scope` is the literal `true` | **Yes, and narrowly**: a criterion may not be `met` while a `source: "automatic"` check on the same deliverable is `fail` — the verdict becomes `needs_operator`, not `unmet`. **This is the smallest change that makes an acceptance capable of being wrong**, which is `DR-8`/`DR-11`'s test applied to the mechanism that actually ran |
| `DR-18` | **Do waves 2–14 get execution phases, and which tranche is next?** (`QE-16`) Three implementation assignments exist, for waves 0 and 1; `impl_w1b` declares no source deliverable | **Yes, and the next tranche is `W-54`, `W-55`, `W-56` + `W-20`** — §51's batch 2. Five of wave 13's six workstreams could start on approval and three need no decision at all (§51.2). **Whatever is decided, declare the source paths in `scope`** |

| `DR-19` | **Must a resume prove the worker is gone before it relaunches?** (`QE-17`) `resumeStalledMission` passes its guard whenever any assignment is `running`, whether or not the posture is `worker_silent`; `resetStalledRunningAssignments` is a store write that signals no process; and this assignment ran two sessions at once against one file | **Yes, and the cheap half first.** Before relaunching, require either a `worker_silent` posture **or** an explicit operator override that says *"I know a worker may be live."* Then terminate the recorded session, or refuse and say why. **The one-line version — refuse the silent-path reset when the posture is not `worker_silent` — closes the race without any process management**, and `dispatch.attempt` should increment either way so the record can say a second worker existed |

**`DR-14` and `DR-17` are the two that change what a reopen means.** The others improve the record; those
two make it possible for a second pass to be judged against the first. **`DR-19` is the one that can
destroy work rather than misdescribe it** — the others produce a record that cannot say what happened;
this one produces two writers on one file, and only the file records that.

---

## 70. Three corrections

### 70.1 Part III's limit 1 cites a register that did not exist

§40 limit 1 reads *"`QE-1`…`QE-10` concern the evidence apparatus"*; the register minted in Part III is
`QE-1`…`QE-9`, and limit 7 of the same section says *"nine findings"* **[verified in file]**. A citation
defect in the part that exists to make citations checkable.

**Recorded, not edited.** Parts I–IV are unmodified by this part (§43, refusal 3, adopted). And the honest
note is this: **Part V mints `QE-10`…`QE-17`, so the citation is now true.** A citation that becomes
correct one pass later was still wrong when it was written, and `RL-42`'s lint — the `CR-1`…`CR-5`
citation check — is the instrument that would have caught it at the time.

### 70.2 `W-59`'s reachability premise is answerable statically, and the answer changes its size

`01…§44.1` records that no browser was opened and *"no claim is made about … whether the three legacy
surfaces in §41 are reachable"*, and §46 makes that check `W-59`'s first step. **Part of it is answered by
the redirect table, without a browser** — `web/next.config.ts` **[verified this pass]**:

```
:203  /legacy-admin/system/access-control        → /organization/access
:204  /legacy-admin/system/roles                 → /organization/access
:226  /admin/system/access-control               → /organization/access
:227  /admin/system/roles                        → /organization/access
:208  /legacy-admin/system/customer-person-roles → /settings/relationships
:248  /organization/access                       → /adminV2/settings/organization/access   (rewrite)
```

**Three consequences.**

1. **Two of the four authority surfaces `W-59` retires are redirected *directly*.** Their page files
   still exist (`web/app/legacy-admin/system/roles/page.tsx`,
   `web/app/legacy-admin/system/access-control/page.tsx` **[verified]**), so `W-59` is largely **deleting
   dead code behind existing redirects**, not withdrawing live surfaces. `H1` — *deleting them is
   security-neutral* — is strengthened, and the size drops toward **S** for the URL half. The tier-A check
   (*exactly one component renders a role-permission grid*) is unchanged and remains the real work.
2. **The platform's own redirect table already agrees with `01…§41` about `customer-person-roles`**: it
   routes to `/settings/relationships`, not to the access surface. That is independent corroboration that
   it is *"a different concept sharing a word"*, and it supports §46's instruction to disposition it on its
   own terms.
3. **The two `adminV2` aliases are answered too — by a three-hop chain, which is a different kind of
   answer.** Both alias page files exist — `web/app/adminV2/settings/user-access/page.tsx` and
   `web/app/adminV2/settings/users-roles/page.tsx` **[verified]** — and the table routes both without a
   browser: `:108 /adminV2/:path* → /admin/:path*`, then `:116 /admin/settings/:path* → /settings/:path*`,
   then `:142`/`:144 /settings/users-roles`, `/settings/user-access → /organization/access` **[verified]**.
   **So all four authority surfaces are already unreachable by URL** — two directly, two through three
   redirects. What S6 settles is therefore no longer *"is it reachable"* but **"does the chain terminate at
   the canonical surface"**, and that is worth an image precisely because a chain is the fragile form: each
   hop is an independent request re-matched against the table, and **no single row asserts the chain.**

**This corrects a premise, not a finding.** `RM-6`'s five surfaces and 1,155 legacy lines are unchallenged;
what changes is that the *reachability* question `W-59` opens with is already answered in the
repository for all four URLs, and an execution phase should read `next.config.ts` before opening a browser.

### 70.3 Both earlier counts of `W-59`'s redirected URLs were wrong, in different directions

§64 said *"Three of the four URLs already redirect"* and §70.2 said *"Two of the four."* **Neither is the
count.** The redirect table answers **four of four** — the two `legacy-admin` rows directly, the two
`adminV2` aliases through `:108 → :116 → :142`/`:144`. Both statements are corrected above and at §64.

**This is `RL-42`'s case a second time, inside one part.** Two sections of the same document, written in one
pass, disagreed about a number that a single `rg` over `next.config.ts` settles — which is exactly the
citation-lint argument §70.1 makes about Part III's limit 1. **A number repeated in two places is a claim
made twice, and this corpus has now been wrong about one three times.**

---

## 71. Limits — read before citing

1. **No product defect is asserted by this part.** `QE-10`…`QE-17` concern the assignment store, the
   evidence gallery, the deliverable-review store and the runtime source that writes them. The product
   claims in §§63–68 are **[carried]** from the documents that own them, through Part IV's bindings.
2. **Nothing was executed.** `reopenAssignmentsForMoreWork`, `validateAssignmentCompletion`,
   `missingRequiredEvidence`, the review builder, **`resumeStalledMission` and
   `resetStalledRunningAssignments`** were **read**; this mission's on-disk state was **read**. No function
   was called, no assignment mutated, no artifact written to any gallery, **and no worker process was
   signalled** — including the second one `QE-17` reports.
3. **§72's two halves were run differently, and the block says which.** Every repository claim was
   established by a ripgrep-backed search or a file read over this worktree, and every cited line number
   above was re-confirmed with `grep -n` in this shell **[verified]**. The **state** half was read with the
   session's file reader: this session's shell is confined to the worktree and cannot reach
   `~/.local/state/alloy-dev/`, so those commands are **transcriptions of reads, not executed shell
   lines** — and `rg` itself is **not on this shell's PATH**, so the block's literal `rg` forms follow the
   corpus's convention (§28, §41, §58) rather than this pass's invocation. This is the `EA-5` distinction
   the whole part is about, applied to itself.
4. **`QE-12`'s `impl_w0` example is one record.** The mechanism (`:697-718` never touches `validation`) is
   general; the illustration is not a survey of how many assignments are currently in that state.
5. **§64's screen list is a specification, not a run.** No browser was opened, no route loaded, no image
   captured. Whether `/organization/access` renders for this slot's QA identity is **not established here**.
6. **§65's discharge assignments are predictions about a tree that does not exist yet.** Each says where a
   check *should* be able to go red; an execution phase that finds a pre-fix red impossible should record
   **(b)** or **(c)** and say so, not force **(a)**.
7. **§66 ran no preflight and §67 ran no census.** `Q15`, `Q16` and `Q17` are unanswered, and `M19` remains
   conditional on a question nobody has asked.
8. **§70.2 is a static reading of a redirect table.** Redirect precedence, middleware, and whether a legacy
   component still renders through some other entry point are **not** established by it. It shrinks
   `W-59`'s URL half and leaves its component half exactly where Part IV put it. **The three-hop `adminV2`
   chain is read row by row, not executed**: that each hop re-matches the table is how Next.js redirects
   are understood here, and it is the assertion screen S6 exists to settle. §70.3's *four of four* is a
   claim about the table; it is not yet a claim about a browser.
9. **`QE-17`'s process observation is external to the runtime.** The two live sessions were seen with `ps`
   in this shell and by watching this file's size and `git diff --numstat` change while this session held
   no edit. **Which session wrote which line is not established, and cannot be** — that absence is the
   finding. The *mechanism* (`:126-133`, `:724-749`) is read in source and does not depend on the
   observation.
10. **`DR-14`…`DR-19` are escalations.** No runtime code was changed to fix `QE-14`, no assignment
    re-scoped to fix `QE-15`, **no process was signalled or killed to act on `QE-17`**, no `attempt`
    incremented, and no evidence profile added. `scripts/local-dev/lib/vacilando/` was **read only**.
11. **This part is written to the product-source folder**, which `07…§2.4` establishes is outside
    `ALLOWED_CHANGE_PREFIX`. That is `X-2`/`DR-4`, unresolved, and now also `QE-15` — the same split
    reaching the execution assignments. **Knowingly, and it is not a worker's call to fix.**
12. **Parts I–IV are unmodified**, except the header note and §0's table rows that name Part V.
13. **This part was written across two sessions of one assignment** (`QE-17`). §§60–69 and §§70.1–70.2 were
    written first; `QE-17`, §70.3, `DR-19` and the corrections at §64 and §70.2 came second, from a session
    that could read the first's output but not its reasoning. **That is `EA-8`'s pass marker, applied to a
    split the runtime did not intend and does not record.**

---

## 72. Reproduce

```bash
# Repository half — executed this pass, from the worktree, @ d6436ddb5.
W=scripts/local-dev/lib/vacilando

# --- QE-10: the criterion verdict is the worker's, copied ---------------------
rg -n 'acResults = report.acceptanceCriteriaResults|acceptance_criteria_results' $W/deliverable-review.mjs
#   → :366 read from the worker's completion report; :584 written into the review
rg -n 'meaningful = artifacts.filter' -A 6 $W/deliverable-review.mjs        # :356-362 — a title filter

# --- QE-11: the two constants ------------------------------------------------
rg -n 'const deliverablesOk|const withinScope|const passed =' $W/worker-assignment.mjs   # :579-583

# --- QE-12 / QE-13: what a reopen does and does not clear --------------------
rg -n 'export function reopenAssignmentsForMoreWork' -A 20 $W/worker-assignment.mjs      # :697-718
#   → clears completionReport, contextAcknowledgement, workerId, dispatch, pause reasons
#   → does NOT clear validation; does NOT touch startReport; increments nothing

# --- QE-14: which evidence declaration governs -------------------------------
rg -n 'requiredEvidence: \[|evidenceProfile:' $W/worker-assignment.mjs      # :124-125, :129, :194-195, :199
rg -n 'export function missingRequiredEvidence' -A 8 $W/evidence.mjs        # :206-212 — requiredEvidence wins
rg -n 'evidenceProfile = a.phaseId' -B 3 -A 4 $W/mission-advance.mjs        # :243-247 — never clears it
rg -n '  ui: \[' $W/evidence.mjs                                            # :29 — screenshot + browser

# --- QE-15: the frozen copy the implementation assignments are scoped to -----
Q=docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md
sed -n '11,13p' $Q                     # msn_e9133cdade883793d2 / asg_c505e1d0d76acd / a48a454d…
rg -c 'W-5[4-9]|W-6[0-2]|^# Part (III|IV)' $Q                               # 0
wc -l $Q docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md

# --- §63: the fixture module still does not exist ----------------------------
ls web/tests/access/                   # four suites, no fixtures/

# --- §70.2: W-59's reachability, from the redirect table ---------------------
rg -n 'system/roles|system/access-control|customer-person-roles|organization/access' web/next.config.ts
ls web/app/legacy-admin/system/roles/page.tsx web/app/legacy-admin/system/access-control/page.tsx

# --- §70.3: the count is four, not two and not three -------------------------
# The adminV2 aliases resolve through three hops, each an independent request:
rg -n 'adminV2/:path\*|admin/settings/:path\*|settings/user-access|settings/users-roles' web/next.config.ts
#   → :108  /adminV2/:path*          → /admin/:path*
#   → :116  /admin/settings/:path*   → /settings/:path*
#   → :142  /settings/users-roles    → /organization/access
#   → :144  /settings/user-access    → /organization/access
ls web/app/adminV2/settings/user-access/ web/app/adminV2/settings/users-roles/   # page.tsx in both

# --- QE-17: the resume path, and what it does not do -------------------------
rg -n 'export async function resumeStalledMission' -A 35 $W/mission-reopen.mjs
#   → :106-107 docstring "Does not pretend the old process is still live"
#   → :126     refuses only when posture is not worker_silent AND nothing is claimed-running
#   → :137     "Operator resumed after worker went silent" — the exact string in the store
rg -n 'export function resetStalledRunningAssignments' -A 26 $W/worker-assignment.mjs
#   → :724-749 a store write: status/dispatch/workerId/provider/ack/report cleared
#   → no signal, no PID, no liveness check; `validation` untouched (QE-12 again)
#   → docstring asserts "no live worker"; nothing verifies it

# --- §70.1: Part III's limit 1 cites QE-1…QE-10; the register is QE-1…QE-9 ----
P=docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
rg -n 'QE-1`…`QE-10|nine findings' $P

# Runtime-state half — READ this pass with the session file reader, NOT executed
# in a shell (the shell is confined to the worktree). Stated so the reads are
# repeatable by anyone whose shell is not.  V=~/.local/state/alloy-dev/vacilando
#
#   rg -c '"evidenceId"' $V/evidence/msn_f74ed02c126c88d7ff/gallery.json      → 141   (was 59)
#   rg -c '"command": null'   … same file                                     → 141
#   rg -c '"exitCode": null'  … same file                                     → 141
#   rg -c '"review_id"'  $V/deliverable-reviews/msn_f74ed02c126c88d7ff.json   → 28
#   rg -c '"passed": 6,'      … same file                                     → 13
#   rg -c '"status": "met"'   … same file                                     → 28   (and 0 not-met)
#   rg -c '"reopen_reason"' $V/assignments/msn_f74ed02c126c88d7ff.json        → 15
#   rg -c 'msn_f74ed02c126c88d7ff' $V/missions/packages.jsonl                 → 0
#   rg -c 'msn_f74ed02c126c88d7ff' $V/acceptance/ledger.jsonl                 → 0
#   rg -n '"phaseId": "' $V/assignments/msn_f74ed02c126c88d7ff.json           → p1…p12,
#                                                     impl_w0, impl_w1, impl_w1b
#   the impl_w0 record: "status": "ready", "completionReport": null,
#   "contextAcknowledgement": null, "validation": { "passed": true, … }
#
#   the asg_ae2d65e739f71c record (QE-17), read the same way:
#     "reopen_reason": "Operator requested more work after reviewing the outcome"
#     "stalled_reset_reason": "Operator resumed after worker went silent"
#     "status": "running", "workerId": "claude-6", "progress": [],
#     "dispatch": { "sessionId": "exs_8126d8ce11f3b02b", "attempt": 1 },
#     "validation": { "passed": true, "validated_at": "2026-08-04T16:42:25.372Z" }
#     "contextAcknowledgement": { "acknowledgedAt": "2026-08-06T22:34:46.666Z" }
```

> **One number in this block deserves the second look §58 gave its `8`.** The gallery went 59 → 141 and
> **`command` and `exitCode` are null on all 141**. The growth is not evidence accumulating; it is the same
> three prose artifacts per criterion, twice. `QE-8`'s *"59 artifacts carry roughly eleven distinct facts"*
> is now 141 artifacts carrying roughly twenty-three.

---

## 73. Provenance — Part V

- **Inputs (reused, not re-derived).** This plan's Parts I–IV in full — §10's tiers, §11's register, §25's
  and §54's locks, §34's exit gates, §35's fixture module, §36's harness, §37's preflight contract, §38's
  ledger, §§46–47's workstreams, §49's census questions, §55's tiers and gates. `07…§2`'s checker
  vocabulary, `§2.4`'s allowed path, `§4`'s `Count` mode and `§12.3`'s presence-not-sufficiency rule,
  through Part III's bindings. `01…§41`, `§44.1`, `§48`, `§52`, `§54`; `02…§17.7`–`§17.8`; `06…§15`, `§17`
  — through Part IV's bindings, not re-read end to end this pass.
- **Read this pass, in source.** `scripts/local-dev/lib/vacilando/worker-assignment.mjs` (`:100-152`,
  `:186-210`, `:300-330`, `:540-620`, `:690-740`), `evidence.mjs` (`:20-40`, `:180-232`),
  `deliverable-review.mjs` (`:340-380`, `:495-590`), `deliverable-evidence.mjs` (`:185-320`, `:400-420`),
  `mission-advance.mjs` (`:220-260`), `acceptance.mjs` (`:85-135`); `web/next.config.ts` (the access,
  legacy-admin and organization redirect and rewrite blocks); `ls web/tests/access/`;
  `web/app/legacy-admin/system/roles/page.tsx` and `…/access-control/page.tsx` (existence); the QA-folder
  copy of this plan (header and register search).
- **Read this pass, in runtime state.** `assignments/`, `evidence/…/gallery.json`, `deliverable-reviews/`,
  `missions/packages.jsonl`, `acceptance/ledger.jsonl` for `msn_f74ed02c126c88d7ff`. **Read-only. Nothing
  under `~/.local/state/alloy-dev/` was written by this phase.**
- **Mechanically verified.** 141 artifacts and 141 nulls on `command` and `exitCode`; 28 reviews, 13 at
  6/7 with a failing `tests_passed`, 28 of 28 criteria `met`; 15 assignments carrying one identical
  `reopen_reason`; `p1`…`p12` plus three `impl_` phases and no others; `impl_w0`'s `validation.passed: true`
  beside a null completion report and a null acknowledgement; the three implementation assignments' scope
  pointing at the QA-folder copy; that copy's foreign mission header and its zero matches for `W-54`…`W-62`
  or Parts III–IV; `impl_w1b` declaring no source deliverable; the precedence of `requiredEvidence` over
  the profile and the inertness of the implementation-stage upgrade; the `ui` profile's contents and its
  zero users; `within_scope`'s literal `true`; the review builder's source for
  `acceptance_criteria_results`; the six redirect rows and one rewrite row in `next.config.ts`; the absent
  fixture module; and Part III §40's `QE-1…QE-10` citation against its own nine-finding register.
- **New this part.** Findings `QE-10`…`QE-17` · evidence classes `EA-8`, `EA-9` · the `F17`/`F18`
  specification and the fault-injection harness · the seven-screen tier-D record for wave 13 · the `EA-7`
  discharge rule and its per-lock assignment · preflights for `M19`–`M21` · the census artifact fields
  `gates`, `expires`, `zero_means` · the ledger's reopen rows · decisions `DR-14`…`DR-19` · **three**
  corrections (§70). **No lock, migration, workstream, fixture, census question or decision minted by
  Parts I–IV was renumbered, and `RL-43`…`RL-46` remain reserved** (§54.1).
- **Escalated, not answered.** `DR-14`…`DR-19`, and every decision Parts I–IV escalated. **No decision was
  answered.**
- **Written across two sessions of one assignment.** `QE-17` records the mechanism and §71 limit 13 records
  the split. The second session read `mission-reopen.mjs` (`:105-160`), `worker-assignment.mjs`
  (`:720-749`), `mission-posture.mjs` (`:290-305`), `silent-worker-recover.mjs` (`:85-99`), the
  `asg_ae2d65e739f71c` record in the assignment store, `web/next.config.ts` (`:104-172`, `:203-249`) and
  the two `adminV2` alias page files. **It changed no runtime code and signalled no process.**
- **Not consulted.** The deployed database; the running Director; any application source under `web/app` or
  `web/lib` beyond the redirect table and the two page files named above; the frozen QA copies, which are
  untouched.
- **Method.** Static and file-grounded. **No code, schema, migration or UI was changed. No test ran, no
  typecheck, no build, no browser, no request, no query. The only file written is this one.**
