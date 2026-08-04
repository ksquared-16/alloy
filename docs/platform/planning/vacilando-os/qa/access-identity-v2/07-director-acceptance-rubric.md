# 07 — Director acceptance rubric

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
