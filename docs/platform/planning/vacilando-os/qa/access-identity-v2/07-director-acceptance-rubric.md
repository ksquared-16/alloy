---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

# 07 — Director acceptance rubric

> **Reopen, 2026-08-06 — read §15 first if you are here for the operator's guidance.** The reopen
> produced six document passes, two new waves, nine workstreams, six amendments and ten locks, and
> **binds to no criterion in this rubric**. `01…§62` names this document as the thing the corpus is missing —
> *"The acceptance criterion cannot be written… No grader can mark it"* — and `03…§45.3` has since
> supplied the artifact that makes it markable. **§§15–22 accept that handoff**: §16 corrects four
> things the reopen falsifies in §§1–14, §17 adds the two directives as gates `PG-13`/`PG-14`,
> §18 adds `RB-28`–`RB-41`, §19 states what the Director may tell the operator, and §20 raises
> `DR-14`–`DR-17`. **§§0–14 are unchanged** and anchored at `b7cfc3653`; the reopen is anchored at
> `d6436ddb5`. Adding this banner moved §14's audit block — `02…§40` cites it as `07…:776-780`;
> it is now `:787-791` (§21).

> **Required output #11, refreshed for Mission 2.** The accepted rubric (2026-07-30) grades the
> *implementation* of Access & Identity V2. Mission 2 ships **no implementation** — it is, in its own
> words, *"a product architecture and specification sprint"* and *"No production code should be written
> except disposable investigation tooling."* A rubric whose criteria are 30 × `tests_pass` cannot grade it.
> This pass adds the specification rubric, corrects four claims the accepted rubric makes about the
> acceptance runtime, and preserves the accepted artifact verbatim in §14.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Director acceptance rubric* · assignment `asg_369a39f4ec709e`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `hotfix/vacilando-ui-freshness-flash`
**Date** 2026-08-04
**Base** `b7cfc3653` — *"re-sequence the implementation / QA plan for Mission 2 (output #10)"*
**Method** static and file-grounded. `acceptance.mjs` re-read line by line this pass; mission brief read
read-only from the running Director on `127.0.0.1:3021`. No code executed, no test run, no browser opened.

---

## 0. Headline — the accepted rubric grades a product this mission does not build

Three findings, each reproducible (§11):

1. **The accepted rubric is not applicable to Mission 2 as written.** Of its 28 criteria, **24 bind to
   `tests_pass`, `qa_evidence` or `source_changed`** (§14 §§3.1–3.5). Mission 2 produces specifications.
   Applied to a Mission 2 phase, those criteria do not merely fail to help — `source_changed` **rewards
   violating the brief's own constraint**, because the only way to satisfy it is to write production code
   the brief forbids.
2. **The accepted rubric misdescribes two of the ten checkers it binds to**, and its §2 recommendation is
   built on one of them. `rejected_patterns_not_reintroduced` does **not** verify that a rejected pattern
   has not returned; it returns `operator_review` whenever patterns exist and `met` when the list is
   **empty** (`acceptance.mjs:239-240`). Binding the seven rejection gates to it, as §14 §1 recommends,
   yields either an operator prompt or a **vacuous auto-pass**. `sections_present` does not check "required
   headings" — it checks a **hardcoded list of six strings** (`:101`) that no document in this corpus
   contains. §2.2.
3. **`AC1` is defective for the third consecutive mission, in exactly the same way.** Mission 2's
   `acceptanceCriteria[0]` is the truncated title plus *"is complete with evidence"*, `evidenceType: null`,
   `phaseIds: []`. The mechanism is now pinned: an empty `evidence_required` defaults to
   `["operator_review"]` (`:262`), which falls through every branch of `checkEvidence` to the terminal
   `operator_review` return (`:249`), so `gate` (`:273`) can reach `needs_operator` but **never `pass`**. §3.

**What this deliverable therefore is.** Not a re-derivation of the accepted rubric — that artifact stands
and is preserved. It is (a) the corrections the accepted rubric needs to be *true*, and (b) a second rubric,
`PG-1`…`PG-12` and `RB-1`…`RB-27`, that grades a **specification** rather than a build.

**The one structural idea.** The accepted rubric has two modes, `Auto` and `Review`, and forced ~24
criteria into `Auto` that no checker decides. Mission 2's scope is **self-enumerating** — the brief names 28
audit areas, 35 model concepts, 16 IA areas, 17 integration points, 10 slice fields, 12 principles and 18
deliverables. Those are *countable*. So this rubric adds a third mode, **Count**: falsifiable by arithmetic
over the deliverable, decidable by a Director or a lint, and honestly **not** decided by the runtime. Most
of Mission 2 lands there. §4.

---

## 1. Re-anchor — the accepted artifact against `b7cfc3653`

The accepted rubric was written on 2026-07-30 against mission `msn_2d054741a54698fa4c`. Five things have
changed under it. None invalidates it; two make it cite into a moved register.

| # | What moved | Bearing on the accepted rubric |
|---|---|---|
| 1 | **`03…` became the plan of record** and now binds waves to rubric criteria on **48 lines** using the `07/` prefix (`03…§§16–25`) | The rubric is now a **cited** artifact, not a leaf. §8 — this falsifies `X-9`'s recommended option |
| 2 | **`X-9` was raised against this document** (`03…§26.1`) — `AD-1`…`AD-5` here collide with `AD-1`…`AD-21` in `02…` Part III | Recorded and **not** resolved here; renumbering across documents is not a worker act. §8 |
| 3 | **`01…` Part II re-scoped output #7 in** — the threat model the accepted rubric's §5 lists as an open limit now exists | §14 §5 bullet 4 is **stale**; `01…§§10–23` is the threat model, and `01…§20` scores the brief's rejection conditions directly |
| 4 | **`01…§27` re-graded output #11** as *"Covered, at risk — binds to colliding IDs"* | The "at risk" is `X-9`. This pass does not remove it; it stops adding to it (§6 uses a fresh namespace) |
| 5 | **Mission 2 was compiled** with a different objective, five phases, and 18 deliverables | The reason for this pass |

**What is carried unchanged.** Every criterion in §14 remains the rubric for **implementing** Access &
Identity V2, and `03…§23.6` binds waves 2–12 to it by ID. Nothing here retires a single criterion. When
Mission 2's roadmap reaches implementation, §14 is the gate — `RB-26` exists to keep it that way.

---

## 2. The evidence vocabulary, re-read from source

`acceptance.mjs` was re-read line by line this pass. **The accepted rubric's line numbers are all still
correct** — `:91`, `:97`, `:105`, `:111`, `:126`, `:138`, `:149`, `:227`, `:234` each still land on the
branch it names. The defects are in the *descriptions*, not the pointers.

### 2.1 What each checker actually decides

| Kind | Line | What it actually does | Can it be `met` without a human? |
|---|---|---|---|
| `file_exists` | `:91` | First pathed deliverable exists and `size > 0` | **Yes** |
| `sections_present` | `:97` | Six **hardcoded** strings appear in that file (`:101`) | **Yes**, but see 2.2(b) |
| `git_clean_outside_docs` | `:105` | No *uncommitted* path outside `docs/platform/planning/vacilando-os/qa/` (`:30`) | **Yes**, and near-vacuously — see 2.2(c) |
| `source_changed` | `:111` | Uncommitted app source, **else** the worker's own `changed_files` (`:119`) | **Yes**, on self-report |
| `tests_pass` | `:126` | `report.tests.ran === true` and `results` look like a pass — **read from the worker's report** (`:128`) | **Yes**, on self-report |
| `qa_evidence` | `:138` | ≥1 image file under the declared evidence path | **Yes** |
| `migration_accounted` | `:149` | Every attributed `.sql` appears in `migrations[]`; **shared/live now also require `preflight.ok`** | Partly — `awaiting_authorization` → `operator_review` |
| `intent_fidelity` | `:227` | Nothing. Always `operator_review` | **No, by design** |
| `rejected_patterns_not_reintroduced` | `:234` | `met` if the list is **empty**; `operator_review` + advisory substring scan if not (`:239-240`) | **Only when there is nothing to check** |
| *(any other string)* | `:249` | Terminal `operator_review` | **No** |

### 2.2 Four corrections to the accepted rubric

**(a) `rejected_patterns_not_reintroduced` cannot carry the rejection gates.** §14 §1 says it *"auto-verifies
a previously-rejected pattern has not returned"* and calls it *"the natural binding for §2."* The source
says the opposite in its own comment — *"not reliably machine-verifiable when patterns exist → honest
operator review"* — and the empty-list case returns `met` so that *"implement phases can complete unattended
under evidence-only auto-accept."* So a capability that declares **no** rejected patterns auto-passes the
check named to prevent rejected patterns. This is the exact failure mode the accepted rubric's own §1 warns
about — *"a rubric that claims machine-verifiability it does not have is worse"* — reached from inside.
**The seven rejection gates are `Review`, or they are re-expressed as `Count` predicates.** §5 does the
latter for Mission 2.

**(b) `sections_present` is hardcoded and matches nothing in this corpus.** The list at `:101` is
`["Current-State Analysis", "V2 Scope", "Data Model Changes", "Acceptance Criteria", "QA Plan", "Rollout"]`,
and the comment above it — *"derived from the criteria statement / compiler"* — describes an intention, not
the code. The check is a substring test as well as a heading test, so it can be satisfied by prose. **No
Mission 2 deliverable should bind `sections_present` unless it literally adopts those six headings**, which
would mean naming a Canonical Domain Model chapter *"Rollout"*. Recorded as `DR-2` (§10).

**(c) `git_clean_outside_docs` mostly measures whether the worker committed.** Attribution is
`git status --porcelain` minus `mission.git_baseline` (`:51-55`), so it sees **only the uncommitted tree**.
A worker who commits its work — which the Alloy sprint contract requires — leaves nothing attributable and
the check returns `met` with *"no new changes attributable to the mission."* It catches stray scratch files,
not scope violations. The same mechanism is why `source_changed` needs its `changed_files` fallback (`:119`).

**(d) `tests_pass` is a self-report, not a test run.** It reads `turn-N.report.json` (`:128`) and asks
whether the worker wrote `tests.ran === true` with passing-shaped `results`. Nothing executes. This does not
make it worthless — a worker must make an explicit, durable, false claim to defeat it — but **24 of the
accepted rubric's 28 criteria are marked `Auto` on this basis**, and "Auto" should not be read as
"machine-verified." Recorded as `DR-3` (§10).

### 2.3 One deliverable is checked, however many are declared

`file_exists`, `sections_present` and `qa_evidence` all resolve their target through
`(pkg.expected_deliverables || []).find((d) => d.path)` (`:87`) — **the first pathed deliverable**.
`qa_evidence` prefers one with `kind === "evidence"` (`:139`) but falls back to the same first entry.

**Mission 2 names 18 deliverables.** A phase declaring all 18 has **17 unchecked** by every path-based
checker. This is not a Mission 2 quirk: it is why `RB-24` is a `Count` criterion over an index rather than
an `Auto` criterion over a package, and it is `DR-1` (§10).

### 2.4 The allowed path — `X-2` acquires teeth

`ALLOWED_CHANGE_PREFIX` is `docs/platform/planning/vacilando-os/qa/` (`:30`), and `isAppSource` treats
anything under it as not-source (`:56-58`). **`X-2` recorded that the corpus is split across two folders
with no rule. The acceptance runtime has a rule, and it is the QA folder.**

Mission 2's outputs #7–#10 were written to `docs/platform/planning/access-identity-v2/` — commits
`cd24874cb`, `852f93ff8`, `73f459dae`, `b7cfc3653`. That path is **outside** the only prefix
`git_clean_outside_docs` permits. Uncommitted, those four deliverables would each have failed the check that
was supposed to confirm they stayed in scope; committed, they are invisible to it (2.2c). **The plan of
record currently lives where the acceptance gate would refuse it.**

`03…§26.2` chose that folder deliberately — *"that is the path the assignment scopes"* — and it was right
to. This assignment scopes the QA path, and this deliverable is written there. **Neither worker is wrong;
there is no rule, which is `X-2`.** What is new is that `X-2` is no longer only a citation-hygiene problem:
it is now a **gate** problem, and it is `DR-4` (§10).

---

## 3. `AC1` — the same defect, a third time, now with the mechanism pinned

Mission 2's compiled plan, read from the Director this pass:

```json
{ "phaseId": "p1", "order": 1,
  "title":     "Mission 2 Identity & Access Platform Objective Transform the complete…",
  "objective": "Mission 2 Identity & Access Platform Objective Transform the complete…",
  "requiredOutputs": [], "dependencies": [], "acceptanceCriteriaIds": ["AC1"],
  "approvalGate": "none" }

{ "id": "AC1",
  "statement": "Mission 2 Identity & Access Platform Objective Transform the complete… is complete with evidence",
  "evidenceType": null, "phaseIds": [] }
```

**`M1`, `M2` and `M3` from `00…§2` all recur, unchanged**, against a brief that is 5 phases and 18
deliverables rather than 12 outputs. `requiredOutputs` is again empty; `approvalGate` is again `none`
against a brief that stages five phases; the objective is again the 69-character elision.

`00…§8` concluded that `M3` means the phase *"can never fully pass."* That was right, and the mechanism is
now exact:

1. `AC1.evidenceType` is `null`, so the package's `evidence_required` is empty.
2. `const kinds = c.evidence_required?.length ? c.evidence_required : ["operator_review"]` (`:262`).
3. `checkEvidence("operator_review", …)` matches no branch and reaches the terminal return (`:249`) —
   `{ status: "operator_review" }`.
4. `gate = anyUnmet ? "fail" : anyReview ? "needs_operator" : "pass"` (`:273`).

So the gate is **`needs_operator`, permanently**. Not `fail` — which matters, because it means the defect is
invisible in the failure column and shows up only as a mission that never closes. `phaseIds: []` compounds
it: `AC1` binds to no phase, so even a correct phase-scoped evaluation would not reach it.

**This rubric cannot fix `AC1`** — it is mission state, not a document. `RB-26` prevents Mission 2 from
*propagating* the defect into the roadmap it produces, which is the part a worker can control.

---

## 4. What a specification mission can be graded on

The accepted rubric's two modes are insufficient here, for a reason that is specific and not a matter of
taste: **Mission 2 forbids the artifacts that three of the four objective checkers consume.**

| Checker | Availability under Mission 2 |
|---|---|
| `source_changed` | **Must not be satisfiable.** *"No production code should be written except disposable investigation tooling."* A phase that satisfies it has violated the brief |
| `tests_pass` | Nothing to test. A spec has no test suite |
| `qa_evidence` | Nothing to screenshot. Mission 2 designs screens; it does not build them |
| `migration_accounted` | Vacuously `met` — no `.sql` is attributable |
| `file_exists` | **Available**, for one deliverable of 18 (§2.3) |
| `sections_present` | Available only by adopting six foreign headings (§2.2b) |

That leaves **one** genuinely useful auto-check for an 18-deliverable specification sprint. A rubric that
reported this as "1 Auto, 22 Review" would be honest and useless — it would hand the Director 22
undifferentiated judgment calls.

**The third mode.** Mission 2's brief enumerates its own scope. Every phase names its coverage set, and
every set is finite and listed. So a criterion can be written as an **arithmetic claim over the
deliverable** — *"all 28 named areas have a section and at least one citation"* — which is:

- **falsifiable** — a missing area is a counterexample, not an opinion;
- **checkable without the runtime** — by grep, by a lint, or by a Director with the brief in hand;
- **not fakeable by prose** — unlike `sections_present`, which a paragraph can satisfy;
- **honestly not `Auto`** — no checker in `acceptance.mjs` decides it.

**Mode definitions used in §§5–6:**

| Mode | Who decides | Meaning |
|---|---|---|
| **Auto** | `acceptance.mjs` | A named checker returns `met` |
| **Count** | Director or lint, mechanically | An arithmetic predicate over the deliverable; the expected count is stated in the row |
| **Review** | Operator | Genuine product judgment; never auto-passed |

`Count` is the mode the accepted rubric lacked, and its absence is why 24 criteria there are labelled `Auto`
on the strength of tests that do not exist. **`Count` is not a weaker `Auto`. It is a stronger `Review`** —
it is the subset of judgment that has a right answer someone can be shown to have got wrong.

---

## 5. Rejection gates `PG-1` … `PG-12` — the twelve preserved principles

The accepted rubric's §2 derived seven rejection conditions from Mission 1's brief. **Mission 2 supplies its
own, and they are stronger**: twelve named principles under *"The Director must preserve existing Alloy
principles … These are already established across the platform architecture and should remain unchanged."*

A principle that "should remain unchanged" is precisely a rejection gate: **any one violated → the phase
fails regardless of its criteria.** These are gates, not criteria, and they are evaluated first (§9).

| # | Principle (verbatim) | Violated when the specification… | Mode | Corpus anchor |
|---|---|---|:--:|---|
| `PG-1` | *Persons remain canonical identity.* | introduces an identity record that is not reached through `persons` | Count | `02…§2`; `GAP-13` |
| `PG-2` | *Configuration steers; code owns invariants.* | places an invariant in configuration, or a steering choice in code | Review | `02…` Part I |
| `PG-3` | *Authorization is server-authoritative.* | specifies any authorization decided by the client | Count | `01…§15`; `GAP-9` |
| `PG-4` | *One capability, many placements.* | defines a capability per placement, or a placement with a private key | Count | `GAP-5`; `07/AR-6` |
| `PG-5` | *No duplicate identity systems.* | specifies a second user/person store for any principal class | Count | `07/AI-2`, `07/AI-3` |
| `PG-6` | *No separate Parent RBAC.* | gives the parent/portal experience its own role or permission model | Count | `04…`; `W-13` |
| `PG-7` | *No surface-only authorization.* | gates a capability at the surface with no server-side assertion | Count | `GAP-4`; `07/AE-1`, `07/AE-2` |
| `PG-8` | *Effective access must be explainable.* | specifies a decision the Explainability surface cannot reconstruct | Review | `GAP-7`; `07/AR-3` |
| `PG-9` | *Platform security cannot depend on UI visibility.* | relies on hiding a control as the control | Count | `GAP-4`; `07/AE-4` |
| `PG-10` | *Authentication is separate from authorization.* | couples a credential fact to a permission decision | Count | `04…`; `GAP-2` |
| `PG-11` | *Relationship scope remains relationship-driven.* | derives child access from household or address rather than relationship | Count | `07`§14 `R3` **[carried]** |
| `PG-12` | *Business Process ownership does not move.* | relocates BP ownership into Identity & Access | Count | Phase 4; `RB-20` |

**`PG-11` and `PG-12` are the two that need active checking rather than passive respect.** `PG-11` is the
accepted rubric's `R3` restated as a platform principle — the household-assumption failure — and Phase 3's
portal work is exactly where it would reappear. `PG-12` has no precedent in Mission 1 at all: it exists
because Phase 4 asks Identity to integrate with Business Processes, and *"identify ownership"* for 17
subsystems is an invitation to quietly acquire some.

**Mission 1's seven rejection conditions are not superseded.** They gate the *implementation*, and §14 §2
remains their statement — with the correction that they cannot be carried by
`rejected_patterns_not_reintroduced` (§2.2a). `PG-n` gates the *specification* that precedes it. `01…§20`
already scores five of the seven as **Triggered or Not met against today's product**, which is the baseline
Mission 2's Phase 1 must reproduce rather than rediscover.

---

## 6. Criteria `RB-1` … `RB-27`

**Namespace.** `RB-` is unused across both corpus folders (verified this pass, §11). It is chosen so this
pass **adds nothing to `X-1`/`X-9`/`D-IA0`** — the register-collision class that `01…§32` calls the corpus's
fourteenth gap. Rubric criteria from §14 are cited here with `03…§26.1`'s `07/` prefix throughout.

Expected counts are taken from the brief's own enumerations, counted this pass (§11). Where the brief is
ambiguous, the row says so and §10 records it as a decision.

### 6.1 Phase 1 — Current State Assessment

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-1` | Every named audit area is covered | **28 of 28** areas have a section and ≥1 `path:line`, query, or `[carried]` citation | Count |
| `RB-2` | Nothing accepted is silently re-derived | Every carried claim marked `[carried]` with its owning document; the assignment's *"do not re-derive covered outputs"* is checkable, not trusted | Count |
| `RB-3` | Unknowns are listed, not omitted | Areas the audit cannot answer appear as explicit unknowns — the `W-23` pattern (`03…§4`), not silence | Count |
| `RB-4` | The audit is anchored to a commit | A base SHA and a `Reproduce` block, per corpus convention | Auto (`file_exists`) + Count |

**`RB-2` is the criterion that protects the mission's own economics.** Eleven of Mission 1's twelve outputs
are covered (`01…§27`), and Phase 1's 28 areas overlap them heavily. Without `RB-2`, the cheapest way to
appear to satisfy `RB-1` is to rewrite `01…` Part I — which is what `00…§8` says a worker *"would rationally
start"* doing, and it is the redo this whole corpus keeps paying for.

**`RB-3` has a precedent worth naming.** `W-0` executed and bought more than it cost (`03…§1.2`); `W-23`
exists because eight questions remain that *"the corpus cannot answer"* and four waves cannot be sized until
they are. An audit that omits its unknowns produces a roadmap with false precision — `03…§27.3` records
exactly that error in its own sizings.

### 6.2 Phase 2 — Canonical Identity & Access Platform

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-5` | Every named concept is defined | **35 of 35** concepts have a definition | Count |
| `RB-6` | Every concept is bound to reality | Each names the table/type carrying it today, or **`none — new`** | Count |
| `RB-7` | The provider triple is resolved | *Authentication Provider*, *Identity Provider* and *Authentication Method* are distinguished, or explicitly merged with a reason | Count |
| `RB-8` | Each concept is scored against the principles | Each names which of `PG-1`…`PG-12` it preserves or pressures | Count |
| `RB-9` | The model is citable by number | One register, non-colliding IDs — `X-1`, `X-9`, `D-IA0` not extended | Count |
| `RB-10` | Person remains the root | Every principal-bearing concept reaches `persons` (`PG-1`) | Count |

**`RB-7` is a real defect in the brief, not pedantry.** The Phase 2 list names *Authentication Provider*
(4th), *Authentication Method* (21st) and *Identity Provider* (22nd) as three separate concepts. They may be
three things — a provider integration, a per-org enabled method, and an external IdP registration — but the
brief does not say, and `04…` models the space with a different vocabulary again. A model that defines all
three without distinguishing them produces `GAP-2`'s successor. **The criterion is satisfied by a merge with
a stated reason as readily as by three definitions**; what it forbids is three undistinguished entries.

**`RB-6` is what makes Phase 5 sizable.** `03…§27.3` records that waves 6–12 have weaker sizings because
they were *"calibrated against a description"* rather than a codebase. A concept marked `none — new` is a
build; a concept bound to an existing table is a change. Without that mark, the roadmap cannot tell them
apart, and `W-26` — *"the largest new item … it is a build, not a sweep"* — is the case that proves the
distinction is worth a column.

**`RB-9` is where this mission stops making the corpus worse.** Three registers have already collided
(`X-1` invariants, `X-9` `AD-n`, `D-IA0` decisions), and Phase 2 mints the most IDs of any phase.

### 6.3 Phase 3 — Identity & Access UX Specification

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-11` | Every IA area is specified | **16 of 16** areas have a section | Count |
| `RB-12` | Every artifact kind is produced per area | **11 kinds** × 16 areas = **176 cells**, each populated or **N/A with a reason** | Count |
| `RB-13` | Every must-be-visible state has a rendering | Each state in `06…§6` / `07/AR-8` has a specified empty, loading, error and restricted form | Count |
| `RB-14` | No screen asserts what the model cannot supply | Every displayed value traces to a Phase 2 concept marked as existing, or the screen is marked Planned | Count |
| `RB-15` | Operator terminology is defined once | One glossary; no permission-key wall as a default view (`07/AR-7`) | Review |
| `RB-16` | The specification is judged as a module | *"feels like a first-class Alloy module rather than a collection of security settings"* | Review |

**`RB-14` is `GAP-12` applied forward, and it is this phase's most valuable row.** `GAP-12` — *"the product
tells the operator things that are not true"* — has **eight distinct mechanisms across five owning
documents and no single owner**, and it is rated **S1/S2** with **no workstream**. Its constituents are all
UX assertions: `IA-1` (account status asserted, not read), `IA-3` (*"All locations"* indistinguishable from
"no row was created"), `IA-4` (effective-access preview disagrees with runtime), `IA-6` (a delete that
reports success before it takes effect). Every one entered the product as a screen showing a value the model
could not supply. **A UX specification is the last cheap moment to prevent the ninth.**

`06…§4.10` records that the built surface's *"best property"* is its Planned discipline — marking unbuilt
things as Planned rather than faking them — *"and one place breaks it."* `RB-14` makes that discipline a
gate instead of a habit.

**`RB-16` is the brief's own success criterion and is irreducibly `Review`.** It is stated here so it is
graded deliberately rather than absorbed into a general impression.

### 6.4 Phase 4 — Platform Integration Specification

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-17` | Every integration point is covered | **17 of 17** subsystems have a section | Count |
| `RB-18` | Every facet is answered per integration | **17 × 5 = 85 cells** — ownership · configuration · runtime · authorization · audit — each populated or N/A with a reason | Count |
| `RB-19` | Ownership is singular | Each integration names **one** owner; shared ownership requires a stated tiebreak | Count |
| `RB-20` | No ownership migrates by omission | No subsystem's owner changes without an explicit decision entry (`PG-12`) | Count |

**`RB-18` carries an interpretation the Director may overturn.** The brief lists the facets as
*"ownership configuration runtime authorization audit"* — unpunctuated, and readable as **five** facets
(ownership · configuration · runtime · authorization · audit) or **four** (ownership · configuration ·
*runtime authorization* · audit). This rubric adopts **five**, giving 85 cells, because `PG-2`
(*configuration steers; code owns invariants*) and `PG-3` (*authorization is server-authoritative*) are
separate principles and collapsing them would make `PG-2` uncheckable per integration. **Under the
four-facet reading the count is 68 and `RB-18` is otherwise unchanged.** Recorded as `DR-5` (§10).

**`RB-20` exists because Phase 4 is where ownership moves quietly.** Asking a mission to *"identify
ownership"* across 17 subsystems, one of which is Business Processes, is the one place `PG-12` is under
live pressure — and an ownership change recorded only as a table cell is not a decision anyone approved.

### 6.5 Phase 5 — Implementation Roadmap

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-21` | Every slice is completely specified | **10 of 10** named fields per slice: Purpose · Dependencies · Migration · Risk · Acceptance Criteria · QA · Rollback · Estimated effort · Operator impact · Platform impact | Count |
| `RB-22` | Every slice binds to the existing plan | Each maps to ≥1 `W-0`…`W-53`, or declares itself new with a reason | Count |
| `RB-23` | Every finding is bound or declared unassigned | The `03…§23` property, carried: no register entry is silently dropped | Count |

**`RB-22` is the anti-fork criterion.** `03…` is the plan of record with 54 workstreams, 13 waves, an
execution order, four execution records, and §23's coverage of every ID. A Phase 5 roadmap that does not
bind to it produces a **second** delivery plan — which is `X-3` (*"455 lines staler"*) recurring, and `X-3`
was closed eight days after it was raised only because one author noticed.

**A note on `RB-21`'s Migration and Rollback fields.** `migration_accounted` (`:149`) now requires
`preflight.ok` for any `shared`/`live` target before an operator is asked to authorize. A slice whose
Migration field does not name its target cannot be evaluated against that gate later. This is the one place
where a Phase 5 field has a **downstream machine consequence**, and it is worth writing the target into the
slice rather than discovering it at apply time.

### 6.6 Cross-cutting — the eighteen deliverables

The brief names 18 deliverables at completion. Most already exist in some form; `01…§27` grades the
Mission 1 twelve, and the mapping below is **presence, not sufficiency** (§12.3).

| ID | Criterion | Predicate | Mode |
|---|---|---|:--:|
| `RB-24` | All 18 deliverables exist and are reachable | **18 of 18** reachable from **one** index; the accepted `README.md` is the candidate | Count |
| `RB-25` | Each states its provenance | Each marked **new** · **refreshed** · **carried**, with its base commit | Count |
| `RB-26` | No acceptance criterion is unfalsifiable | No criterion the roadmap proposes carries a null evidence type or a tautological statement — `M3` not propagated (§3) | Count |
| `RB-27` | Implementation-readiness | *"another engineer can begin implementation without needing additional product discovery"* | Review |

**Indicative mapping — `RB-24`'s starting position, not its answer.** Judged from section headings and the
owning documents' own coverage claims this pass, **not** by re-auditing content:

| Brief deliverable | Existing artifact | Likely state |
|---|---|---|
| Current State Assessment | `01…` Part I | refreshed |
| I&A Platform Specification | `02…` | refreshed |
| Canonical Domain Model | `02…` Part I | refreshed |
| UX Specification | `06…` | **partial** — no empty/loading/error states |
| Screen Inventory | `06…§2` | **partial** |
| User Flows | `06…§5` | carried |
| Data Model | `02…` | **partial** |
| Authorization Model | `02…§§9–10` | carried |
| Authentication Model | `04…` | refreshed |
| Effective Access Resolution | `02…§9`, `06…§4.4` | carried · `GAP-7` open |
| Settings IA | `06…§3` | **partial** |
| Portal Admission Model | `W-13`, `04…` | **partial** |
| Audit Model | `W-53`, `06…§3.3` | **thin** — `GAP-10` audit is *unassessed by every document in this corpus* |
| Security Review | `01…` Part II | new, delivered |
| Gap Analysis | `01…` Part III | new, delivered |
| Decisions Log | `02…` Part III | delivered · **unratified**, `X-9` |
| Implementation Roadmap | `03…` | delivered |
| QA Plan | `03…§10`, `§25` | delivered |

**Five partials and one thin row are where Mission 2's remaining work actually is** — and all six are
Phase 3 and Phase 4 concerns. `Audit Model` is the weakest: `GAP-10` records that whether an authority change
is durably recorded is *"unassessed by every document in this corpus,"* and `W-53` is gated behind `W-23`
Q7, so the assessment does not exist yet. **`RB-24` should not be read as "six documents from done."**

### 6.7 Scope

**A phase declares which `RB-n` it claims; unclaimed criteria are not evaluated** — the accepted rubric's
§4 rule, carried verbatim. Nothing here should be read as "every phase must satisfy all twenty-seven."
`PG-1`…`PG-12`, by contrast, **apply to every phase**, because a principle preserved in four phases and
broken in the fifth is broken.

---

## 7. Corpus reuse — what Mission 2 must not re-derive

The assignment's instruction is *"Reuse accepted corpus as inputs — do not re-derive covered outputs."*
`RB-2` makes it checkable. This is the list it checks against.

| Do not re-derive | Owner | Why it would be re-derived |
|---|---|---|
| The route/service-role census | `01…§4`, `05…` | Phase 1 names *Route protection* and *API enforcement*; the counts exist (559 routes, 534 service-role) and have already drifted once |
| The threat register `T-1`…`T-18` | `01…` Part II | Phase 1 names *RBAC enforcement*; the threat model was re-scoped in and is complete |
| The gap register `GAP-1`…`GAP-14` | `01…§26` | Phase 1's deliverable overlaps it entirely; every corpus finding is already bound exactly once |
| The invariant register `I-n` | `02…`, `04…§6.3` | Phase 2 would mint new ones — and `X-1` means the existing numbers already collide |
| The decision register `AD-1`…`AD-21` | `02…` Part III | Phase 2 names *Policy*, *Delegation*, *Temporary Access*; all have decisions pending. **Unratified — see `X-9`** |
| The wave plan `W-0`…`W-53` | `03…` | Phase 5's deliverable **is** a roadmap; `RB-22` binds it instead |
| The authentication model | `04…` | Phase 2 names 6 authentication concepts; `04…` models them and `GAP-2` scores them |
| The built-surface audit | `06…` | Phase 3 names 16 IA areas; `06…§2` is the as-built reading of four of them |

**The one thing that genuinely does not exist** is the Audit Model (`GAP-10`), and `03…` puts discovery
(`W-23` Q7) before the workstream for exactly that reason. Phase 2 should model it; it should not claim to
have assessed it.

---

## 8. `X-9` — the recommended option has gone stale

`03…§26.1` raised `X-9` against this document and recommended **option (a)**: rename this rubric's audit
block `AD-1`…`AD-5` to `AX-1`…`AX-5`. Its stated cost was *"Five IDs in one document,"* justified by
*"`07…` is cited by no other artifact by criterion ID — `02…§24` verified it cites only `D4`, and nothing
cites its criteria back."*

**That premise was true when `02…§24` checked it and is false at `b7cfc3653`.** `03…` itself now cites this
rubric's criteria by ID on **48 lines**, including all five audit criteria — `03…:435`, `:1389`, `:1836`,
`:1949`, `:1967`, `:1997`, `:2052`, `:2061`, `:2343`, `:2414`, `:2420-2427`, `:2650-2664`. `W-53` is titled
*"`07/AD-1`…`07/AD-5`"* and its exit table is five rows keyed on them.

The correction (reproducible at §11):

| Option | Cost as recorded | Cost at `b7cfc3653` |
|---|---|---|
| (a) Rename `AD-n` → `AX-n` here | *"Five IDs in one document"* | **Five IDs here + 48 citing lines in the plan of record**, including a workstream title and its exit table |
| (b) Renumber the decision register | 21 IDs, *"proposed and unratified"* | Unchanged — still 21, still unratified, and `03…§27.7` makes ratification a prerequisite anyway |
| (c) Keep both, mandate the `07/` prefix | *"Zero now, and a permanent reading tax"* | **Already paid and already load-bearing** — `03…` applies it consistently in every citation above |

**This does not make (c) correct; it makes (c) the status quo.** `X-7`'s resolution is the precedent — a
window *"closed by use, not by ratification."* The same thing has now happened to `X-9` in eight days, and
the honest reading is that the corpus has adopted (c) by writing it, not by deciding it.

**Nothing is renumbered here.** `03…§26` escalated rather than performed, on `01…§18`'s precedent that
renumbering across documents is not a worker act, and this pass holds that line — with `RB-9` and the `RB-`
namespace ensuring Mission 2 does not add a fourth colliding register. The updated costing is `DR-6` (§10).

---

## 9. How the Director applies this

1. **Rejection gates first** — `PG-1`…`PG-12` (§5). Any one violated → the phase fails; do not score
   criteria. These apply to **every** phase.
2. **`Auto` criteria** → the acceptance runtime decides, reading §2.1 for what each checker actually
   verifies. Expect this to be a **thin** layer for a specification mission (§4).
3. **`Count` criteria** → decided mechanically against the stated expected count. **A `Count` row that has
   not been counted is not `met`**; it is unevaluated, and it is the row most likely to be waved through.
4. **`Review` criteria** → surfaced to the operator with evidence attached. Never auto-passed.
5. **A phase is accepted** when its gates are clear, its `Auto` and `Count` criteria are `met`, and the
   operator has signed off every `Review`.

**Two cautions specific to this mission.**

**Do not read `gate: "pass"` as mission acceptance.** `AC1` guarantees `needs_operator` for as long as the
mission runs (§3). The gate verdict will not distinguish a phase that did excellent work from one that did
none — both land in the same bucket. **The `Count` column is the Director's real instrument here**, and this
is the concrete cost of `M3` going unrepaired for a third mission.

**Do not accept Phase 5 before the decisions are ratified.** `03…§27.7` is explicit: citing `AD-n` before
ratification *"would create the seventh register this part exists to prevent,"* which makes ratification
*"a prerequisite for this plan being safely quotable, not a nicety."* `RB-22` binds Phase 5's slices to that
plan, so Phase 5's acceptance inherits the prerequisite.

---

## 10. Decisions this rubric raises

None is worker-resolvable. `DR-` is a fresh namespace, for the reason in §6.

| # | Decision | Recommendation |
|---|---|---|
| `DR-1` | **Should a package be able to declare more than one checked deliverable?** Path-based checkers evaluate only the first (`:87`); Mission 2 declares 18 | Yes — check all pathed deliverables. Small, contained change to `acceptance.mjs`; **not made here** (docs-only phase, and the brief forbids production code) |
| `DR-2` | **Should `sections_present` derive its list from the criterion, as its own comment claims?** Today it is six hardcoded strings (`:101`) matching no corpus document | Yes, or retire the checker. As written it is unusable by any Mission 2 deliverable |
| `DR-3` | **Should `tests_pass` be relabelled?** It reads the worker's self-report (`:128`); 24 accepted-rubric criteria are marked `Auto` on that basis | Relabel as `tests_reported`. The check has value; the name overstates it |
| `DR-4` | **Where is the canonical corpus?** `ALLOWED_CHANGE_PREFIX` (`:30`) says the QA folder; `PRODUCT-SOURCE.md` and outputs #7–#10 say the product-source folder. This is `X-2`, now a gate problem (§2.4) | Director-owned. Whichever is chosen, `ALLOWED_CHANGE_PREFIX` should agree with it — today nothing does |
| `DR-5` | **Four facets or five in Phase 4?** The brief's list is unpunctuated (§6.4) | Five (85 cells). Collapsing *runtime* and *authorization* makes `PG-2` uncheckable per integration |
| `DR-6` | **`X-9`, re-costed.** Option (a) is ~30 citations, not five (§8); option (c) is already in force by use | Ratify (c) explicitly, or pay (a) knowingly. The current state is a convention no one approved |
| `DR-7` | **Should `M1`/`M2`/`M3` be fixed at ingestion before Mission 2's next phase?** Three missions, same three defects; `M3` alone means no phase can close (§3) | Yes. It is the difference between a mission that completes and one that is re-dispatched, which `00…§8` records happening already |

---

## 11. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ b7cfc3653
A=scripts/local-dev/lib/vacilando/acceptance.mjs

# §2.1 — the ten evidence kinds and their line numbers
rg -n 'if \(kind === ' $A

# §2.2a — rejected_patterns_not_reintroduced: met when the list is EMPTY
sed -n '234,246p' $A

# §2.2b — the hardcoded section list
sed -n '100,102p' $A

# §2.2c — attribution is the uncommitted tree only
sed -n '46,55p' $A

# §2.2d — tests_pass reads the worker's report, runs nothing
sed -n '126,137p' $A

# §2.3 — one deliverable is checked, however many are declared
sed -n '87,89p' $A

# §2.4 — the allowed path, and where outputs #7–#10 were written
rg -n 'ALLOWED_CHANGE_PREFIX' $A
git show --name-only --format= cd24874cb 852f93ff8 73f459dae b7cfc3653 | sort -u

# §3 — AC1, and the operator_review default that makes the gate unclosable
curl -s 'http://127.0.0.1:3021/api/missions/brief?mission_id=msn_f74ed02c126c88d7ff' \
  | python3 -c 'import json,sys; b=json.load(sys.stdin)["brief"]; print(b["acceptanceCriteria"], b["plan"])'
sed -n '262p;273p' $A
sed -n '248,250p' $A

# §6 — RB- and DR- are unused namespaces
rg -n '\bRB-[0-9]|\bDR-[0-9]' docs/platform/planning/access-identity-v2\
  docs/platform/planning/vacilando-os/qa/access-identity-v2 || echo 'unused — as expected'

# §8 — ~30 citations of this rubric's criteria in the plan of record
rg -c '07/' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
rg -n '07/AD-' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
```

---

## 12. Limits — read before citing

1. **Nothing here was executed.** `acceptance.mjs` was **read**, not run. No criterion in §§5–6 has been
   evaluated by the runtime, and §14 §5's *"the rubric is untested"* is **carried and still true** — now for
   two rubrics. The §2 corrections are read from source and are the strongest claims in this document; the
   §§5–6 criteria are a design.
2. **The brief's counts are transcriptions.** 28 / 35 / 16 / 11 / 17 / 10 / 12 / 18 were counted this pass
   from an unpunctuated run-on objective (§11). `RB-18`'s facet count is an **interpretation** (`DR-5`), and
   `RB-5`'s 35 includes the three provider concepts `RB-7` may merge. **If the Director re-counts and
   differs, the counts change and the criteria do not.**
3. **§6.6's mapping is presence, not sufficiency.** Judged from section headings and the owning documents'
   own coverage claims — the same caveat `00…§3`, `01…§27` and `03…§27.8` each attached, and the one
   `01…§27` says *"now bites"*: a coverage table that counts documents cannot see a gap between them.
   **No document was re-audited content-by-content this pass.**
4. **No product defect is asserted.** Every `GAP-n`, `T-n`, `IA-n`, `X-n` and `W-n` referenced is owned,
   evidenced and rated by an earlier document and is used here as an anchor. If a constituent is wrong, this
   rubric inherits the error. The original findings are §2's four corrections, §2.3, §2.4 and §8's
   re-costing — all documentary, all mechanically reproducible (§11).
5. **This pass does not resolve `X-1`, `X-2` or `X-9`, and does not renumber anything.** It uses a fresh
   namespace so as not to extend them, and re-costs `X-9` so option (a) is not chosen on a stale premise.
6. **The accepted rubric is corrected, not retired.** §14 remains the implementation gate and `03…§23.6`
   binds waves to it. Where §14 and this part disagree about what a checker does, **§2 is the corrected
   reading**; where they disagree about what to grade, they are grading different things.
7. **`AC1` is not fixed and cannot be fixed here.** It is mission state (§3). `RB-26` prevents propagation;
   it does not close the gate.
8. **Read-only, except this file.** No source, schema, migration or UI was modified. The pre-existing
   modifications in `scripts/local-dev/` at session start belong to another branch's work and were not
   touched. **No test, typecheck, build or browser run** — none is meaningful for a documentation phase, and
   `source_changed` **must not** be satisfiable by this mission (§4).

---

## 13. Provenance — Mission 2 pass

- **Mission state** read read-only via `GET /api/missions/brief?mission_id=msn_f74ed02c126c88d7ff` on the
  running Director (`127.0.0.1:3021`), per the read-only-inspection allowance in
  `DIRECTOR-CONDUCTOR-HANDOFF.md` §7. `contentHash` confirmed `3c36b58117e46b2363ef602b385409e7`.
- **Cited Vacilando source:** `scripts/local-dev/lib/vacilando/acceptance.mjs` — `:30`, `:51-55`, `:56-58`,
  `:87-89`, `:91`, `:97`, `:101`, `:105`, `:111`, `:119`, `:126`, `:128`, `:138-139`, `:149`, `:227`,
  `:234`, `:239-240`, `:249`, `:262`, `:273`. Read line by line this pass.
- **Cited corpus:** `00-mission-intake-and-coverage.md` §§2, 3, 8; `01-existing-state-inventory.md` §§18,
  20, 26, 27, 32; `02-canonical-access-identity-model.md` Parts I–III; `03-implementation-qa-sequence.md`
  §§1, 3, 23, 24, 26, 27; `04-authentication-model.md`; `05-command-enforcement-census.md`;
  `06-product-ia-and-flows.md` §§2, 4, 5, 6; `PRODUCT-SOURCE.md`; `README.md`.
- **Commits inspected:** `b7cfc3653`, `73f459dae`, `852f93ff8`, `cd24874cb`, `a4b6e424f`, `7df17b9b3`.
- **No source, schema, migration, or UI changed by this phase.**

---

## 14. Accepted artifact — preserved verbatim

Everything below is the accepted rubric as delivered on 2026-07-30 under mission
`msn_2d054741a54698fa4c`, unchanged. It remains the gate for **implementing** Access & Identity V2, and
`03…§23.6` binds waves 2–12 to it by criterion ID. **Two claims in its §1 are corrected by §2.2 above**
(`rejected_patterns_not_reintroduced`, `sections_present`); the text is left as written so the correction is
visible rather than silent.

---

# 07 — Director acceptance rubric

> **Required output #11.** The rubric the Director gates Access & Identity V2 on. Each criterion
> binds to an evidence type the acceptance runtime can actually evaluate, so a phase's gate can
> pass or fail on evidence rather than on assertion.
> Also repairs **M3** from [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §2:
> this mission's own AC1 is a tautology with `evidenceType: null`, which no checker can evaluate.

**Mission** `msn_2d054741a54698fa4c` v1 · phase *Director acceptance rubric* · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30

---

## 1. The vocabulary this rubric may use

Criteria must bind to what `scripts/local-dev/lib/vacilando/acceptance.mjs` can evaluate. Inventing
an evidence type produces exactly the unfalsifiable criterion this document exists to prevent.

| Evidence type | Auto-verifies | Source |
|---|---|---|
| `file_exists` | Deliverable exists and is non-empty | `acceptance.mjs:91` |
| `sections_present` | Required headings present in the deliverable | `:97` |
| `git_clean_outside_docs` | Nothing changed outside the allowed docs path | `:105` |
| `source_changed` | Application source actually changed | `:111` |
| `tests_pass` | Report's `tests.ran === true` and results show a pass | `:126` |
| `qa_evidence` | Screenshots exist under the declared QA path | `:138` |
| `migration_accounted` | Every migration appears in `migrations[]` with a status | `:149` |
| `intent_fidelity` | Deliverable answers the operator's stated intent | `:227` |
| `rejected_patterns_not_reintroduced` | A previously-rejected pattern has not returned | `:234` |
| *(anything else)* | **Not faked** → `operator_review` | header `:8-10` |

**`rejected_patterns_not_reintroduced` is the natural binding for §2.** The rejection conditions are
precisely "patterns the operator has already rejected," and the runtime already has a checker for
that shape — the gates below should bind to it rather than to bespoke tests wherever the pattern is
expressible as one.

The last row is the important one. The runtime is explicitly honest: subjective criteria are not
auto-passed, they are surfaced for sign-off. A rubric that marks everything `operator_review` is
useless; a rubric that claims machine-verifiability it does not have is worse. §3 splits them.

## 2. Rejection conditions — automatic fail

The brief names seven conditions under which the Director *"should reject implementation as
incomplete."* These are gates, not criteria: any one true → the phase fails regardless of the rest.

| # | Condition | How it is caught |
|---|---|---|
| **R1** | A UI checkbox added without enforcement evidence | Every new control traces to a server-side check; `tests_pass` covering the deny case |
| **R2** | A permission exists but is not connected to a meaningful operator concept | Every permission key appears in a named access group ([`06`](./06-product-ia-and-flows.md) §3.5) |
| **R3** | Parent access relies on household-wide assumptions instead of relationship scope | `tests_pass`: a guardian scoped to one child cannot read a sibling |
| **R4** | A user account creates duplicate identity | `tests_pass`: account creation writes no person-shaped fields ([`04`](./04-authentication-model.md) §3.1) |
| **R5** | A role controls pages but not actions or data | `tests_pass`: role change alters API/action outcome, not just navigation |
| **R6** | QA validates only the happy path | `qa_evidence` includes denied/empty/expired states |
| **R7** | A mock looks correct but the effective-access matrix disagrees | Preview and enforcement call one resolver ([`06`](./06-product-ia-and-flows.md) §3.1) |

**R7 is the one that needs structural prevention, not testing.** If the preview has its own code
path, no test suite reliably catches drift. The rubric should require that the preview endpoint and
the enforcement path share a resolver — a design constraint the Director can check by reading, once.

## 3. Criteria

Derived from the brief's ~20 measurable criteria, grouped by what they govern. `Auto` = the
acceptance runtime can decide it. `Review` = honest `operator_review`.

### 3.1 Identity & lifecycle

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AI-1 | An administrator can create or link a person and grant login access | `qa_evidence` + `tests_pass` | Auto |
| AI-2 | Staff, parents, guardians, and other supported types receive access without identity duplication | `tests_pass` (R4) | Auto |
| AI-3 | Account creation binds to exactly one canonical person | `tests_pass` | Auto |
| AI-4 | Invitation, suspension, lockout, deactivation, and recovery are complete | `qa_evidence` per transition | Auto |
| AI-5 | A non-`active` account cannot use an existing session | `tests_pass` | Auto |

**AI-5 is the highest-value single test in this rubric.** It is today's most consequential defect
([`04`](./04-authentication-model.md) §2.6): deactivation removes a role row and leaves a working
credential. If V2 ships one enforcement test, it is this one.

### 3.2 Roles, scope & effective access

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AR-1 | Roles control surfaces, actions, records, fields, and administration | `tests_pass` across all four layers (R5) | Auto |
| AR-2 | User-specific scope can be previewed before saving | `qa_evidence` | Auto |
| AR-3 | Preview and enforcement produce identical results | `tests_pass` (R7) | Auto |
| AR-4 | Effective access is understandable in operator language | Reads as the brief's sentence form | Review |
| AR-5 | Common roles can be configured quickly | Walkthrough | Review |
| AR-6 | Advanced granularity remains available progressively | `qa_evidence` (preset → Custom → keys) | Auto |
| AR-7 | No raw permission-key wall as the default role editor | Default view shows groups (R2) | Review |
| AR-8 | Empty, inherited, restricted, conflicting, and expired states are visually clear | `qa_evidence`, one per state ([`06`](./06-product-ia-and-flows.md) §4) | Auto |

AR-4, AR-5 and AR-7 are judgment. They are the criteria the brief cares most about and the ones no
checker can decide — marking them Auto would be the dishonesty the acceptance runtime avoids.

### 3.3 Authentication

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AU-1 | Authentication methods are organization-configurable | `tests_pass` + `qa_evidence` | Auto |
| AU-2 | Password fields include show/hide | `tests_pass`: no bare `type="password"` outside the shared component | Auto |
| AU-3 | Password policy is enforced server-side | `tests_pass`: direct API call rejects a weak password | Auto |
| AU-4 | MFA policy can be set by role | `qa_evidence` | Auto |
| AU-5 | Session and trusted-device policy are configurable and enforced | `tests_pass` | Auto |

**AU-2 and AU-3 are cheap and should land first.** Both are small, both are currently absent
([`04`](./04-authentication-model.md) §2.3, §3.4), and AU-3 closes a real hole — today's `length >= 6`
lives in a submit handler and the server accepts anything.

### 3.4 Enforcement & security

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AE-1 | Every protected route has a server-side access assertion | `tests_pass`: undeclared route fails a static check ([`05`](./05-command-enforcement-census.md) §4.3) | Auto |
| AE-2 | Every registered command verifies authorization independently of UI placement | `tests_pass`: executor denies without permission ([`05`](./05-command-enforcement-census.md) §3) | Auto |
| AE-3 | RLS and API scopes agree | `tests_pass`, or an explicit D4 position | Auto |
| AE-4 | Hidden surfaces cannot be reached directly by URL | `tests_pass` | Auto |
| AE-5 | Cross-location, cross-org, cross-child, cross-household leakage tests pass | `tests_pass`, one per boundary | Auto |
| AE-6 | Privilege escalation and self-role-edit are covered | `tests_pass` | Auto |

**AE-1 must be a static property, not a sampled test.** [`05`](./05-command-enforcement-census.md) §5
shows why: a static census over ten gate families cannot establish coverage, so "we checked the
routes we thought of" is not evidence. The criterion is met when an undeclared route *fails a check*,
which makes coverage structural.

**AE-3 is satisfiable two ways** — make RLS agree, or state that RLS is not an authority layer (D4,
`02-canonical-access-identity-model.md:662-665`). With 94% of the privileged surface on the
service-role client, the second is the honest near-term answer. The criterion fails only if neither
is done.

### 3.5 Audit

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AD-1 | Audit events exist for consequential access changes | `tests_pass` per mutation class | Auto |
| AD-2 | Audit records actor, timestamp, subject, and before/after | `tests_pass` | Auto |
| AD-3 | Audit is append-only | `tests_pass`: UPDATE/DELETE rejected | Auto |
| AD-4 | A failed audit write rejects the mutation | `tests_pass`: forced failure rolls back | Auto |
| AD-5 | Change history is viewable per role and org-wide | `qa_evidence` | Auto |

## 4. How the Director applies this

1. **Rejection gates first** (§2). Any true → fail; do not score criteria.
2. **Auto criteria** for the phase's scope → the acceptance runtime decides.
3. **Review criteria** → surfaced to the operator with the evidence attached. Never auto-passed.
4. **A phase is accepted** when its rejection gates are clear, its Auto criteria are `met`, and the
   operator has signed off every `operator_review`.

**Scope per phase, not the whole rubric.** A phase declares which IDs it claims; unclaimed criteria
are not evaluated. Nothing here should be read as "every phase must satisfy all forty."

### 4.1 What this repairs

Every criterion above has a non-null evidence type and states a condition that can be false. Applied
to this mission's own AC1 — *"…is complete with evidence"*, `evidenceType: null` — the defect is
plain: nothing can make it false, and no checker can read it. Future phases of this mission should
draw their acceptance criteria from §3 rather than generating them from the phase title.

## 5. Limits

- **The rubric is untested.** No criterion here has been run through `acceptance.mjs`. Evidence-type
  bindings are read from the checker source, not exercised; some will need adjustment when a real
  phase declares them.
- **Auto/Review is a judgment.** Several Auto rows assume tests that do not exist yet. Marking a
  criterion Auto asserts it is *machine-decidable in principle*, not that the test is written.
- **Coverage claims inherit [`05`](./05-command-enforcement-census.md) §5's limits.** AE-1 in
  particular is only as good as the static check that backs it.
- **Not a security review.** §3.4 restates the brief's requirements; it does not constitute a threat
  model. Required output #7 remains partial — see
  [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §3.
- **Weighting is absent.** All criteria are pass/fail with no severity ranking; the Director cannot
  currently accept a phase with a minor criterion unmet. Whether that is right is a decision.

## 6. Provenance

- **Evidence vocabulary** read from `scripts/local-dev/lib/vacilando/acceptance.mjs:1-20, 95-160`.
- **Criteria and rejection conditions** derived from brief `msn_2d054741a54698fa4c` (`brief.objective`).
- **Inputs:** [`04-authentication-model.md`](./04-authentication-model.md),
  [`05-command-enforcement-census.md`](./05-command-enforcement-census.md),
  [`06-product-ia-and-flows.md`](./06-product-ia-and-flows.md),
  `02-canonical-access-identity-model.md` (D4).
- **No source, schema, migration, or UI changed by this phase.**

---
---

# Reopen — 2026-08-06

*Everything from here is the reopen pass. §§0–14 above are unchanged and remain anchored at
`b7cfc3653`. This part is anchored at **`d6436ddb5`** — the sixth and last commit of the reopen —
in `wt6-director-experience-dx5-5-continuation`.*

---

## 15. Reopen headline — the corpus named this document as the thing it is missing

### 15.1 The instruction

`01…§62` states the first consequence of `GAP-15` in one sentence, and it is addressed to this file by
name:

> *"**The acceptance criterion cannot be written.** `07…` binds acceptance to IDs. *'The chain is four
> layers'* is satisfied today under `05…§5A.5`'s count and fails under all three others. **No grader can
> mark it**"* — `01…:2362-2363` **[verified]**

At the time that was written it was correct and unactionable: there was no artifact against which any of
the counts could be graded. `03…§45.3` has since supplied one — **`W-62`, one declared enumeration of the
resolution layers, in code, beside the resolver** — and states plainly that it *"is the acceptance
criterion"* (`03…:3823-3827`) **[verified]**.

**So the criterion is now writable, and §18.3 writes it.** What is added here is the acceptance form:
which mode it is graded in, what evidence closes it, who signs it, and what the Director may say when it
is met. **`W-62`'s definition of done is `03…`'s and is not re-derived** — `RB-39` cites it and does not
restate it.

### 15.2 Three findings, each reproducible in §21

1. **The reopen binds to no criterion in this rubric.** `03…` cites `07/…` on **66 lines**, the last at
   `:3510`. **Part IV — `:3699`–`:4816`, 1,118 lines, waves 13 and 14, nine workstreams, six
   amendments, ten locks, three migrations — contains zero** **[verified this pass]**. Waves 2–12 are graded by this instrument
   through `§23.6`'s criterion → tier → evidence table; the reopen's work is graded by nothing. This is
   not a criticism of Part IV: §52 binds every reopen ID to a *workstream*, which is `03…`'s register to
   keep. **Nothing binds those workstreams to an acceptance criterion, because that is this document's
   register, and this document had not been reopened.**

2. **The grading instrument contains a sixth reading of "four layers", and it is bound.** §14 §3.2's
   `AR-1` requires *"`tests_pass` **across all four layers**"* against a criterion that enumerates
   **five** nouns — *surfaces, actions, records, fields, and administration*. `03…§23.6:3498` binds it to
   waves 4 and 11 with the gloss *"four layers, four counts"* **[verified]**. `01…§62` and `03…§45.1`
   each enumerate the corpus's counts of that phrase — eight stores, four model layers, four/five
   schema-vs-runtime, fourteen resolver rows, four operator nouns — and **neither includes this one**
   **[verified this pass]**. The count inside the instrument that grades the reduction was never counted.
   §16.1.

3. **This document's registers have been extended by the plan of record, and continuing them naively
   would have collided.** `03…§39` mints **`DR-8`…`DR-12`** *"continuing `07…§10` without renumbering"*
   (`03…:3535`) and `§44` mints **`DR-13`**; `§38.2` binds **`RB-24`…`RB-27`** and **`PG-1`…`PG-12`** to
   its own `EA-` evidence classes (`03…:3514-3523`) **[verified]**. So this pass continues from
   **`RB-28`, `PG-13`, `DR-14`** — not `DR-8`. A pass that had not measured would have minted the fourth
   instance of the collision `CR-6` was written to lint.

### 15.3 What this pass does not re-derive

Per the assignment's *"reuse accepted corpus as inputs."* Each is cited by ID below and **[carried]**:

| Not re-derived | Owner |
|---|---|
| The wave plan `W-54`…`W-62`, the six amendments, the execution order | `03…§§46–48`, `§51` |
| The locks `RL-47`…`RL-56` and migrations `M19`–`M21` | `03…§54` |
| The wave exit gates and verification tiers | `03…§55` |
| The IA specification of the simplified editor, `IA-11`–`IA-14`, `IA-R11`–`IA-R17` | `06…§§14–18` |
| The model bounds `RA-1`–`RA-5`, `I-32`, `I-33`ᴬ, `I-34`ᴬ, `M2-16`–`M2-19` | `02…§4.6`, `§17.7`, `§17.8` |
| The credential bounds `R6`–`R9`, `I-35`ᴮ, `AD-22`, `AD-23` | `04…§3.6`, `§6.4`, `§7.1` |
| The threat register `T-19`–`T-26`, `S-8`–`S-14`, `H1`–`H3`, `RM-1`–`RM-11` | `01…` Parts IV–V |
| The four counts of the chain, and `GAP-15`/`GAP-16`/`GAP-17` | `01…§62`, `§63` |

**The original work here is §16's four corrections, §17's two gates, §18's fourteen criteria, and §19's
acceptance statements.** Everything else is a citation.

---

## 16. Four corrections the reopen forces on §§1–14

Same discipline as §2.2: the accepted text is left as written and corrected here, so the correction is
visible rather than silent.

### 16.1 `AR-1`'s "four layers" is the sixth count, and it is the one being graded against

`AR-1` reads *"Roles control **surfaces, actions, records, fields, and administration**"* with evidence
*"`tests_pass` across all **four** layers (R5)"* (§14 §3.2). Five nouns, four layers, no mapping.

**Why this is not pedantry, in three steps:**

1. `GAP-15` is defined as *"the depth reduction has no agreed baseline, and therefore no definition of
   done"* over four counts of the word (`01…§62`) **[carried]**.
2. The instrument the Director grades that reduction with contains a **fifth** count of the same word,
   introduced four days before the directive existed, meaning neither the model's layers nor the
   operator's nouns but something closer to *enforcement targets*.
3. `03…§23.6` binds it — waves 4 and 11, tiers A + D, *"`W-14`'s declared table + `W-49`'s chapter
   gates"* — so it is not dormant text. A grader in wave 11 reads *"all four layers"* while wave 14 is
   reducing a different four.

**The corrected reading.** `AR-1` governs **four enforcement targets — surface · action · record ·
field — plus administration as a fifth subject.** That is what `R5` (*"A role controls pages but not
actions or data"*) asks for and what `W-14`'s declared table and `W-49`'s chapter gates supply. **The
word *layers* must not be used for it while the corpus uses *layers* for the authority chain.** The
criterion does not move; its wording does. Whether §14 is amended in place is `DR-16`.

### 16.2 `AR-7` is the one accepted criterion currently **met** that wave 13 can regress

`06…§5.5` verifies the built role editor against the brief's rejection condition and finds it clean:
*"a nine-row grid keyed by operator language with raw `permission_key` strings deliberately absent from
primary UI text… The brief's 'no raw permission-key wall' rejection condition is **not** triggered"*
(`06…:490-493`) **[carried]**.

**Wave 13 rewrites that file.** `W-57` merges five tabs into one page and promotes the grid to a named
capability section; `W-58` unifies three save paths in a 607-line component; `W-59` deletes four sibling
surfaces. Every one of those is a chance to lose a property nobody is currently checking — and
`03…§23.6:3500` records exactly why the loss would be invisible: **`AR-4`, `AR-5` and `AR-7` are
`Review`; no checker decides them, and `03…` correctly *"does not pretend otherwise"*** **[verified]**.

> **A criterion that is met and unlocked is not a criterion that stays met through a rewrite of the file
> that satisfies it.** `01…§54`'s bottom row makes the general form of this point about controls —
> *"the simplification work is exactly the kind of change that degrades unlocked controls silently"*
> (`01…:2056-2058`) **[carried]**. This is its acceptance-criterion twin, and it is the reason `RB-37`
> exists.

`AR-6` and `AR-8` are **not** in this class and should not be claimed as regressions: `06…§5.5` records
that templates and an explicit *Custom* state do not exist (`AR-6` unmet), and `03…§23.6:3502` records
**1 of 6 states representable today** (`AR-8` largely unmet) **[carried]**. Only `AR-7` has something to
lose.

### 16.3 §8's costing of `X-9` option (a) is overstated roughly fourfold

§8 priced option (a) — rename this document's `AD-1`…`AD-5` to `AX-1`…`AX-5` — at *"Five IDs here + 48
citing lines in the plan of record."* **The 48 was `rg -c '07/'`: every rubric citation, of which the
overwhelming majority name `AI-`, `AR-`, `AU-` or `AE-` criteria that a rename of the audit block does
not touch.**

Measured at `d6436ddb5` **[verified this pass]**:

| Quantity | Then (§8, `b7cfc3653`) | Now |
|---|---|---|
| Lines of `03…` citing any `07/` criterion | 48 | **66** |
| Lines of `03…` citing `07/AD-n` — **what option (a) actually touches** | *(not separated)* | **13** — `:473`, `:1427`, `:2452`, `:2458`–`:2462`, `:2464`, `:2465`, `:2702`, `:2821`, `:3510` |
| Further lines discussing the collision itself | — | 5 — `:2864`, `:2886`, `:2894`, `:2896`, `:2977` |
| Option (b): decisions to renumber | *"still 21, still unratified"* | **25**, and **bound on 133 citing lines** of `03…` (`01…:2305`) |

**§8's option (b) cell is superseded**, by `02…§37`'s own re-costing: *"Wrong in both halves: 25, not 21
— and bound, not unbound"* (`02…:2404`) **[verified]**. So the two options have moved in opposite
directions: **(a) is ~18 lines of mechanical edit; (b) is 133 citing lines plus a ratification.**

And the rule that was missing when §8 declined to choose now exists. `02…§37` clause 4 establishes that
*"the raising document owns the question… §25 owns the list"*, and `CR-6` (`02…§31.1`) asserts that
**every ID prefix has exactly one owning register**, failing today on `AD-` by name **[carried]**.
`03…§53.2` has already performed the same disposition for a neighbouring case — `06…§18.2`'s
capability-home question moves to `AD-26` because `02…§25` holds the register.

> **The audit block in §14 is now the corpus's last unowned prefix, its owner has been named, and it is
> the cheapest of the three registers to move.** §8 held the line that renumbering across documents is
> not a worker act, and this pass holds it too — **nothing is renumbered here.** What changes is that
> the recommendation is no longer balanced on a stale number. `DR-14`.

### 16.4 §4's evidence table changes for wave 13 — and `qa_evidence` finally has something to check

§4 concluded that a specification mission leaves *"one genuinely useful auto-check."* **Wave 13 is the
first wave in this corpus whose deliverable is a screen** (`03…§55.1`) **[carried]**, which changes the
availability of two checkers and the meaning of one:

| Checker | Under Mission 2 (§4) | At wave 13 |
|---|---|---|
| `source_changed` (`:111`) | must **not** be satisfiable | **required** — a wave that changes no source has not built the editor |
| `tests_pass` (`:126`) | nothing to test | **available**, and still a self-report (§2.2d) — `RL-48`…`RL-54` are what it should be reporting |
| `qa_evidence` (`:138`) | nothing to screenshot | **available for the first time** |
| `migration_accounted` (`:149`) | vacuously met | vacuous for wave 13; **live for wave 14** — `M19`–`M21` all target `shared` and need `preflight.ok` |

**The correction is about `qa_evidence`, and it is the same shape as §2.2's four.** `:138` counts image
files under the declared evidence path. It does not open them. `03…§55.1` requires *"route, steps,
expected vs observed, console errors, failed requests, evidence paths"* and states that **a wave-13
completion claim without browser evidence should be rejected** **[carried]**.

> **So `qa_evidence` decides *evidence was attached*, and only an operator decides *what it shows*.**
> Marking `RB-35` `Auto` on the strength of `qa_evidence` alone would repeat, on the browser half,
> exactly the error §2.2d records the accepted rubric making on the test half. `RB-38` splits them.

---

## 17. The two directives as rejection gates — `PG-13`, `PG-14`

`PG-1`…`PG-12` (§5) are unchanged and continue to apply to **every** phase. These two are added because
the operator's guidance is, in form, precisely what §5 defines a gate to be: *a property that must remain
true, whose violation fails the phase regardless of its criteria.*

| # | Gate | Violated when a phase… | Mode | Anchor |
|---|---|---|:--:|---|
| `PG-13` | **Simplification is a surface operation.** | claiming the editor directive changes what a gate **permits**, what the resolver **reads**, or what a write **receives** | Count | `I-32` (`02…§4.6`); `03…§46`; `05…§5A.6` |
| `PG-14` | **The two directives are graded separately.** | offers one evidence set for both, or words an editor-completion claim as a claim about depth | Count | `RM-7` (`01…§42`); `03…§45.2` |

### 17.1 `PG-13` is about *permit*, not about *change*

The obvious phrasing of this gate — *"no route, resolver or gate file is modified"* — **would fail the
three items the entire corpus calls safe and unscheduled.** `W-54` changes `PATCH /users/[userId]/role`
so that it **refuses** a submission that would remove a role the operator was not shown (`03…§46`,
`I-34`ᴬ) **[carried]**. That is an endpoint change, and it is the corpus's cheapest correct item.

> **The line is: a simplification may narrow what a write accepts; it may not widen what a gate
> permits.** `I-32` says the same thing from the model's side — the surface *"MUST NOT be where the
> access model acquires or loses structure"* (`02…:427-430`) **[carried]** — and a refusal removes no
> structure, because *"a surface that cannot express a fact MUST NOT be able to delete it"* (`I-34`ᴬ).

Checkable form, which is why the mode is `Count` and not `Review`: for each file the phase touched, the
diff either (i) changes presentation, (ii) changes a projection's completeness, or (iii) adds a refusal.
**A diff that makes any principal able to do something they could not do before is out of scope by
definition, not by judgment.**

### 17.2 `PG-14` exists because the two directives have already been scheduled against different baselines

`01…§62`'s third consequence records three documents answering *one* instruction with three different
kinds of work **[carried]**, and `RM-7` is the recommendation both halves rest on: *"the two directives
are separable, and separating them is the recommendation… Attempting both under one instruction is how a
phase ends up changing a gate while believing it changed a screen"* (`01…:1623-1626`) **[carried]**.

`03…§§46–47` executed that separation in workstream numbers — wave 13 is the nouns, wave 14 is the
stores. **`PG-14` is what stops it being re-merged at acceptance time**, which is the one place left
where it could be: a phase that ships wave 13 and reports *"four layers, done"* has satisfied every
wave-13 criterion and told the operator something false. §19 is the correct wording.

---

## 18. Criteria `RB-28` … `RB-41`

Continuing §6's register. Modes are §4's — **`Auto`** (a checker in `acceptance.mjs` decides),
**`Count`** (an arithmetic predicate, decided by a Director or a lint), **`Review`** (operator judgment,
never auto-passed). `EA-n` are `03…§32`'s evidence classes **[carried]**.

### 18.1 The reopen as a specification pass — `RB-28` … `RB-31`

These grade what the reopen *produced*, and all four are satisfiable from documents that already exist.
They are stated so that the next reopen is graded rather than assumed.

| ID | Criterion | Predicate | Mode | `EA` |
|---|---|---|:--:|---|
| `RB-28` | Every reopen identifier is bound or declared unassigned | Each of `01…§60`'s **≈60** IDs appears in `03…§52` with a workstream, a section, or a stated reason. **Six unassigned, all decision-inputs or framings; no product finding unassigned** (`03…:4458-4460`) | Count | `EA-4` |
| `RB-29` | No reopen workstream is scheduled before its registers are bound | `GAP-17`'s constraint form — `DR-13` and `RL-56` (`03…§1.9`, `§44`) | Count | `EA-3` |
| `RB-30` | The two directives are separate in the plan's own unit | Wave 13 ≠ wave 14; no workstream appears in both; each names which directive it serves (`03…§45.2`) | Count | `EA-4` |
| `RB-31` | The reopen reused the corpus rather than re-deriving it | Every reopen section marks claims **[carried]** vs **[verified this pass]**; §6's `RB-2` applied to the reopen | Count | `EA-2` |

**`RB-28` is met today and is worth stating anyway**, because it is the criterion `GAP-17` predicts will
fail next time. `01…§61` records the mechanism twice-observed: *"`03` can only ever be current as of its
last sequencing pass, and the corpus reopens per-document on operator guidance. **Nothing in the
mission's process makes a reopen trigger a re-sequence**"* (`01…:2326-2329`) **[carried]**. A criterion
that is green on the day it is written is the only kind that can catch that.

### 18.2 Wave 13 — the role editor — `RB-32` … `RB-38`

**This is the first group in this document where `Auto` is not aspirational.** Each row names the
workstream that satisfies it and the lock that keeps it satisfied; neither is re-derived.

| ID | Criterion | Predicate | Mode | Workstream · lock |
|---|---|---|:--:|---|
| `RB-32` | No authority write is narrower than its read | An edit to a multi-role member preserves the unshown role **or** is refused with a rendered error. `I-34`ᴬ | Auto (`tests_pass`) + Count | `W-54` · `RL-50` |
| `RB-33` | Every membership question is answered from `role_keys` | A member holding `{admin, regional_lead}` appears in **both** counts and **both** lists; no component computes membership from a collapsed value | Auto + Count | `W-55` · `RL-51` |
| `RB-34` | No authority surface renders an unknown state as an empty one | Every `catch` / `!res.ok` path that clears an authority set sets an error and disables save — **stated over every authority surface**, not only the one | Auto + Count | `W-56` · `RL-49` |
| `RB-35` | Four navigation levels, one page per role | Depth to a capability control **≤ 4**; at most **one** tab-bar component in the Access tree; **no** `data-capability="planned"` element is the sole content of a tab panel | Count + Auto | `W-57` · `RL-52` |
| `RB-36` | Scope is not an attribute of a role | No role-editing component reads or writes `user_access_profiles`, `user_department_access` or `user_site_access`; chapter/section order places scope as a **sibling** of capability, not its successor | Auto (static) + Review | `W-57` · `RL-53`, `IA-R11` |
| `RB-37` | **The criteria already met survive the rewrite** | `AR-7` re-evidenced, not inherited (§16.2); `AR-4`/`AR-5` re-reviewed on the new surface; `H2` locked — `admin`'s 32 keys survive an untouched save; removal copy still says *removed from this organization* | **Review** + Auto | `W-57`, `W-59` · `RL-48`, `RL-54` |
| `RB-38` | The screen was **observed**, not screenshotted | Browser evidence per `03…§55.1` — route, steps, expected vs observed, console errors, failed requests. `qa_evidence` decides that evidence exists; **the operator decides what it shows** (§16.4) | Auto (existence) + **Review** (content) | wave 13 exit |

**`RB-32` and `RB-33` are the two rows a Director can hold a phase to this week.** `03…§51.2` puts
`W-54`, `W-55` and `W-56` in batch 2 — *"no decision, no migration and no resolver change; in two of the
three the data is **already in the response the component receives**"* (`03…:3857-3859`, `06…§17`)
**[carried]**. `01…§67` had recorded the same work as *"real and unblocked… **None is scheduled**"*
**[carried]**; it is scheduled now, and these are the criteria that close it.

**`RB-37` is the row most likely to be skipped, and it is the reason this section exists.** Every other
row here grades something *new*. `RB-37` grades something **old that must still be true**, on a surface
whose file has been rewritten — and all three of its judgment halves are `Review`, so nothing in the
runtime will raise a hand. `DR-15` asks whether it should be mandatory at wave-13 exit.

**A note on `W-57`'s pending decision.** `03…§53.2` records that the capability-home question
(*chapter or section?*) is `06…§18.2`'s, that its number must move to `AD-26`, and that **`W-57` is sized
against the recommended answer — a section** (`03…:4509-4512`) **[carried]**. `RB-35` and `RB-36` are
written against the section reading. **Under the chapter reading both remain valid and `RA-4` must be
re-checked**; neither criterion changes.

### 18.3 Wave 14 — the depth reduction — `RB-39` … `RB-41`

| ID | Criterion | Predicate | Mode | Workstream |
|---|---|---|:--:|---|
| `RB-39` | **"Four layers" is a graded claim rather than an argued one** | One declared enumeration of the resolution layers exists in code beside the resolver; it has **four** entries; the resolver reads **no** store absent from it; a check **fails** when a ninth appears; and the enumeration satisfies all three counts — `RM-2`'s eight fold to four, `02…§1.3`'s four-with-two-branches is unchanged, `05…§5A.2`'s fourteen rows map on with **no unmapped row** | Count + Auto | `W-62` |
| `RB-40` | No admission predicate satisfies a capability gate | `I-35`ᴮ as `W-13`'s exit clause: `portal.access` exists **and** the `portalEligible` short-circuits at `canReadAnalytics.ts:32` and `canManageUsersAndRoles.ts:58` are gone. **Both halves, or the fifth layer survives under a new name** | Auto | `W-13` (amended) |
| `RB-41` | Wave 14's absence is **decided**, never silent | If `AD-25` is answered so that wave 14 does not run, the operator is told **in those words** that the depth they reacted to remains (`03…§47`, `01…§43`) | **Review** | — |

**`RB-39` is the criterion `01…§62` says cannot be written, written.** It is markable because `W-62`
supplies the artifact and `03…§45.1` supplies the per-count completion conditions — *"One artifact,
three counts satisfied, one grader"* (`03…:3827`) **[carried]**. Two properties are worth stating
explicitly because a grader will otherwise have to rediscover them:

- **It is `Count`, not `Auto`.** No checker in `acceptance.mjs` reads an enumeration. The *lint* `W-62`
  ships is `Auto`-shaped and `EA-7` requires it be shown red against a state it must reject; the
  **criterion** is the arithmetic over the enumeration, and §9.3 governs — *a `Count` row that has not
  been counted is not `met`*.
- **It cannot be claimed before `W-20`, `W-13` and `W-60` land.** `03…§47` states why: *"an enumeration
  authored before `W-20`, `W-13` and `W-60` land would enumerate the layers this plan intends to
  delete"* **[carried]**. A `W-62` claim that arrives early is not partial credit; it is a wrong
  enumeration locked by a passing test.

**`RB-40` is one criterion covering two changes on purpose.** `04…§7.1` is explicit that answering only
the first half *"would satisfy the letter of `I-32`ᴮ and none of `I-35`ᴮ, and the chain would still be
five layers deep at runtime while every document in the corpus said four"* (`04…:755-758`)
**[carried]**. Splitting it into two criteria would make the half-done state markable, which is the
outcome the sentence exists to prevent.

**`RB-41` has no workstream because it is not work.** It is the one criterion in this document that
grades what the Director *says* rather than what a phase *builds*, and it is here because `03…§47`
records the failure mode in its own opening line: under the other reading of `AD-25` wave 14 *"is not
descoped — it is **unscheduled**"* **[carried]**. Descoped and unscheduled are the same artifact and
different sentences, and only one of them is true.

### 18.4 Scope

§6.7's rule is carried unchanged: **a phase declares which `RB-n` it claims; unclaimed criteria are not
evaluated.** `PG-1`…`PG-14` apply to every phase without being claimed.

**One addition specific to the reopen.** `03…§55.1` states wave exits as sets — wave 13 exits on all six
of its properties together, wave 14 on all five. **`RB-32`…`RB-38` are therefore claimed together or not
at all**, on the same footing as `07/AU-1`…`AU-5` in `03…§34` **[carried]**. A wave-13 phase that claims
`RB-32` and `RB-33` alone has not exited wave 13; it has landed batch 2, which is a real and useful thing
to have done and should be reported as that.

---

## 19. What the Director may tell the operator

The operator asked for two things in plain language and will be told, in plain language, when they are
done. **This section is the wording**, because §18's rows are true and none of them is a sentence anyone
would say out loud.

| Directive | Sayable when | And must be said with it |
|---|---|---|
| *"Simplify the role editor without changing the access architecture"* | `RB-32`…`RB-38` all met — wave 13's exit | **(a)** The capability section is *legible* now and *true* after `W-10` — today it is a 9-row lens over a catalog it does not enumerate (`IA-13`) **[carried]**. **(b)** The multi-role guard is the narrow form: the editor can no longer destroy an unshown role, but `RA-3` — add and remove one membership row independently — waits on `W-17`. **(c)** The gate families, the 507 service-role routes and the absent surface gate are untouched, and simplifying the editor *"must not be read as having addressed them"* (`05…§5A.6`) **[carried]** |
| *"Role hierarchy is still too deep — reduce to four layers"* | `RB-39` and `RB-40` met — wave 14's exit | **(a)** Under the operator's own count — Person · Role · Capability · Scope — this was met at wave 13, and **that is not the count carrying the security argument**: `RM-9` records the reduction closing one **S1** and two **S2** (`01…:1951-1954`) **[carried]**. **(b)** Until `W-62`, "four layers" is an argued claim in five documents and a graded claim in none |

**The one sentence that must not be said.** *"Four layers — done"* at the end of wave 13. It is true
under one of the five counts, false under the other four, and it is the exact failure `PG-14` and
`RM-7` were written against: *"how a phase ends up changing a gate while believing it changed a
screen"* — here in its mirror image, a phase that changed a screen and believes it changed the chain.

**And one thing the operator is owed early rather than at an exit.** `03…§53.1` establishes that the
cost of the unanswered decisions is smaller than the corpus's volume suggests: *"three workstreams can
start now, one more after a small product decision, and only the depth reduction waits"*
(`03…:4489-4490`) **[carried]**. `AD-25` and the capability-home question are the whole remaining
decision cost of the reopen. **After `d6436ddb5`, the reopen does not need another document.**

---

## 20. Decisions `DR-14` … `DR-17`

Continuing §10 **from `DR-14`**, because `03…§39` minted `DR-8`…`DR-12` and `§44` minted `DR-13`
(§15.2). None is worker-resolvable; each is recorded with a recommendation and **not performed**.

| # | Decision | Recommendation |
|---|---|---|
| `DR-14` | **`X-9`, re-costed a second time.** Option (a) — rename this document's `AD-1`…`AD-5` to `AX-1`…`AX-5` — is **13 citing lines in `03…` plus five defining rows here**, not the 48 §8 recorded (§16.3). Option (b) is 25 decisions across 133 citing lines. `02…§37` clause 4 and `CR-6` now supply the ownership rule §8 lacked | **Take option (a).** It is the corpus's last unowned prefix, its owner has been named, and it is now measurably the cheapest of the three registers to move. **The Director performs it or authorizes a worker to** — §8's line that renumbering across documents is not a worker act still holds, and this pass did not renumber |
| `DR-15` | **Should wave 13's exit require re-evidencing the accepted criteria it can regress?** `AR-7` is met today and is `Review`, so its loss during `W-57`/`W-58`/`W-59` would be invisible to every check (§16.2) | **Yes** — `RB-37` mandatory at wave-13 exit, not optional. It is one operator judgment on a surface the operator is already reviewing for `RB-38`, so the marginal cost is a paragraph |
| `DR-16` | **Is §14 amended in place for `AR-1`'s wording (§16.1), or corrected only by reference?** The corpus convention is correction-by-reference (§2.2), but §14 is *cited as a live criterion* by `03…§23.6`, and a grader reaching `AR-1` through the plan never reaches §16.1 | **Amend in place, marked as an editorial amendment with its date and this section as authority.** A preserved-verbatim block that a plan of record grades against is not an archive. This is the first time this document's preservation convention and its citation load have pulled in opposite directions |
| `DR-17` | **Does the acceptance runtime get a surface-evidence profile?** `qa_evidence` counts images (`:138`); `03…§55.1` requires route, steps, expected vs observed, console errors, failed requests (§16.4). `DR-10` proposes a `specification` profile for documentation phases; this is its browser twin | **Yes** — a `surface` profile whose artifacts carry route + step list + observed-vs-expected, so a wave-13 claim is checkable by someone who was not there. Same one-line shape as `DR-10`; **not made here**, for §12.8's reason |

**`DR-16` is the one that will be tempting to skip and should not be.** The other three improve the
record. `DR-16` decides whether the sentence a grader reads in wave 11 says *four layers* about a thing
that has five nouns, in the middle of a programme whose operator directive is *reduce to four layers*.

---

## 21. Reproduce — reopen pass

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation   # @ d6436ddb5
P=docs/platform/planning/access-identity-v2
Q=docs/platform/planning/vacilando-os/qa/access-identity-v2

# §15.2(1) — 66 rubric citations in the plan, the last at :3510; Part IV starts at :3699
rg -c '07/' $P/03-implementation-qa-sequence.md            # 66
rg -n  '07/' $P/03-implementation-qa-sequence.md | tail -1 # :3510
rg -n '^## 43\.' $P/03-implementation-qa-sequence.md       # :3699 — Part IV begins
rg -c '' $P/03-implementation-qa-sequence.md               # 4816 — and nothing after :3510 matches

# §15.2(2) — AR-1's "four layers" over five nouns, and the plan binding it
rg -n 'AR-1' $Q/07-director-acceptance-rubric.md
rg -n '07/AR-1' $P/03-implementation-qa-sequence.md        # :3498 "four layers, four counts"
#   …and the two enumerations of the phrase that do not contain it
rg -n '^## 62\.' $P/01-existing-state-inventory.md
rg -n '^### 45\.1' $P/03-implementation-qa-sequence.md

# §15.2(3) — the plan extends this document's registers; DR- runs to 13
rg -n -o '\b(RB|DR|PG)-[0-9]+' $P/03-implementation-qa-sequence.md | sort -u
rg -n '^## 39\. Decisions this part raises' $P/03-implementation-qa-sequence.md
rg -n '^## 44\.' $P/03-implementation-qa-sequence.md

# §16.3 — what option (a) actually touches, vs option (b)
rg -n '07/AD-' $P/03-implementation-qa-sequence.md         # 13 lines
rg -c '\bAD-[0-9]+\b' $P/03-implementation-qa-sequence.md  # option (b)'s surface

# §16.3 / banner — where §14's audit block now sits (02…§40 cites :776-780)
rg -n '^\| AD-[1-5] \|' $Q/07-director-acceptance-rubric.md

# §16.2 — AR-7 is met today
rg -n 'permission-key wall' $Q/06-product-ia-and-flows.md $Q/07-director-acceptance-rubric.md
rg -n '07/AR-4' $P/03-implementation-qa-sequence.md        # :3500 — Review, no checker decides

# §18.2 / §18.3 — the workstreams and locks these criteria bind to (not re-derived)
rg -n '^### W-5[4-9]|^### W-6[0-2]' $P/03-implementation-qa-sequence.md
rg -n '^\| \*\*RL-4[7-9]|^\| \*\*RL-5[0-6]' $P/03-implementation-qa-sequence.md
rg -n '^### 55\.1' $P/03-implementation-qa-sequence.md     # exit gates

# §18.1 — RB-28's count: every reopen ID bound or declared unassigned
rg -n '^## 52\.' $P/03-implementation-qa-sequence.md
rg -n '^## 60\.' $P/01-existing-state-inventory.md
```

---

## 22. Limits and provenance — reopen pass

### 22.1 Limits

§12 applies unchanged and in full. Six are specific to this pass:

1. **Nothing was executed, again.** `acceptance.mjs` was **not** re-read this pass; §2's readings are
   carried at their recorded line numbers and were not re-verified against a newer commit. **If
   `acceptance.mjs` has changed since `b7cfc3653`, §2 and §16.4 inherit the error.** No test, typecheck,
   build, browser or dev server was run, and no mission API was called — unlike the Mission 2 pass,
   which read the Director's brief live (§13).
2. **`RB-32`…`RB-41` have never been evaluated by anything.** They are a design, on the same footing as
   §§5–6 and with the same caveat §12.1 attaches. `RB-39` in particular grades an artifact — `W-62`'s
   enumeration — **that does not exist**; the criterion is written against `03…§45.3`'s specification of
   it, not against a thing anyone has seen.
3. **The counts in §15.2 and §16.3 are `rg` counts over one commit.** 66, 13, 133 and 1,118 are
   mechanical and reproducible (§21), and they will drift with the next commit to `03…` exactly as
   §8's 48 drifted to 66 in six days. **Quote them with their commit or not at all.**
4. **No product defect is asserted.** Every `T-n`, `S-n`, `H-n`, `RM-n`, `M2-n`, `IA-n`, `RA-n`, `R6`–`R9`,
   `W-n`, `RL-n`, `GAP-n` and `AD-n` used here is owned, evidenced and rated by another document and is
   used as an anchor. The original claims are §15.2's three findings, §16's four corrections, §17's two
   gates, §18's fourteen criteria and §19's wording — **all documentary, all reproducible in §21.**
5. **This pass does not renumber anything, and does not resolve `X-2`, `X-9` or `X-14`.** `DR-14`
   re-costs `X-9` and recommends; it does not perform. Citations to `02…§17.8`'s new invariants use
   `I-33`ᴬ / `I-34`ᴬ per `03…§56.1`'s disambiguation, which is `X-14` and is likewise unresolved.
6. **`AC1` is still not fixed** (§3) and `M1`/`M2`/`M3` recur. Nothing in this reopen touches mission
   state, and the gate for this phase will read `needs_operator` whatever the work was worth — which is
   `DR-7`, now four missions old.

### 22.2 Provenance

- **Anchored at** `d6436ddb5` in `wt6-director-experience-dx5-5-continuation`, branch
  `agent/cursor/6-vacilando-v3-4-conversational-director`. The six reopen commits read this pass:
  `107a6217d`, `288a51b7b`, `c6e43be5f`, `207cd5322`, `03efba377`, `d6436ddb5`.
- **Read in full this pass:** `03…` §§43–56 (Part IV); `06…` §§13–19; `02…` §1.3, §4.6, §17.7, §17.8,
  §31, §31.1; `04…` §6.4, §7.1; `05…` §5A.5, §5A.6; `01…` §§60–63.
- **Read in part:** `03…` §23.6, §32, §38.2, §39, §44; `01…` §§64, 67; `02…` §§25, 26, 30, 37, 40.
- **Corpus-wide searches:** `07/` citations in `03…` by line; `07/AD-n` citations; `RB-`/`DR-`/`PG-`/`AX-`
  defining and citing sites across both folders; the two enumerations of the "four layers" counts.
- **Not consulted:** `acceptance.mjs` (see limit 1), the Director API, `README.md`, `PRODUCT-SOURCE.md`,
  and every `*.json` evidence file in this folder.
- **Operator guidance addressed:** *"reduce to four layers"* → `PG-14`, `RB-39`–`RB-41`, §19 row 2;
  *"simplify the role editor without changing the access architecture"* → `PG-13`, `RB-32`–`RB-38`,
  §16.2, §19 row 1.
- **No source, schema, migration, UI, test or document other than this one was changed by this phase.**
