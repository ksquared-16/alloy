# 08 — Reuse confirmation for the Access & Identity corpus

> **Confirmation report** for the `p_reuse_only` phase. Answers the one question the phase
> asks — *do the accepted artifacts cover the Mission Brief?* — and records why that answer
> cannot currently be recorded by the phase that asked for it.
>
> Successor to [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md),
> which answered the same question for `msn_2d054741a54698fa4c` before the Mission Compiler
> existed. Read that report first; this one does not restate its evidence.
>
> **Two claims below are corrected by
> [`08a-reuse-confirmation-runtime-addendum.md`](./08a-reuse-confirmation-runtime-addendum.md),
> written from a third concurrent dispatch of this same phase. Read the two together.**
> §1.2 reads the byte-count difference as the corpus *growing*; 08a §2 shows it is a **fork**
> between the two `access-identity-v2` roots that exist side by side, which is worse. §6 records
> runtime mission state as unreadable; 08a §1 reads it — and finds **this mission is not in it**.
> 08a §3 also adds a second dead catalog field alongside §1.3's. The coverage finding in §1 is
> unaffected and was reached independently by both passes.
>
> A parallel record of the first dispatch of this phase, under a different mission id, is
> [`../mission-compiler-v1/reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md`](../mission-compiler-v1/reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md).

**Mission** `msn_a0e8a6206c63198fab` v1 · phase `p_reuse_only` · assignment `asg_f0efd2008f12f1`
**contentHash** `282eace8ea5a991546ba9e8b1c19fc7e`
**Worktree** `alloy-promotions/devops-8-config-hygiene` @ `promote/devops-8-config-hygiene`
**Base** `origin/staging` @ `8ccf4988b` · ahead 14 / behind 0
**Date** 2026-09-11
**Method** static and file-grounded. No code was executed — `node` is refused by this session's
Bash permission gate, and `compileMissionBrief()` persists, so it must not be run against live
mission state regardless. Every claim is sourced to repository source, the committed
compiled-mission fixture, or the dispatched assignment text.

---

## 0. Headline

**The phase's premise is correct, and its recording mechanism is not.**

1. **Coverage holds.** All twelve catalog deliverables resolve to present, substantial artifacts,
   and against the operator's own twelve named outputs the corpus stands at **eleven covered, one
   partial** — the partial (#7, threat model) being an explicit non-goal the operator would have to
   re-scope in. **No new discovery deliverable remains.** (§1)
2. **The phase cannot record that.** `p_reuse_only` was dispatched with an **empty scope, empty
   expected deliverables, and an empty acceptance-criteria list**. The compiled mission's single
   acceptance criterion, `AC_reuse_confirmed`, is orphaned — structurally unable to attach to the
   only phase that exists. Validation for this phase therefore checks nothing. (§2, §3)
3. **And its criterion is not a worker's to discharge.** `AC_reuse_confirmed` reads *"**Operator**
   confirms accepted Access & Identity artifacts satisfy the Mission Brief."* A worker can assemble
   the evidence for that confirmation. It cannot be the operator. (§4)

This is the mirror image of defect **M3** recorded in `00…` §8. There, a tautological criterion with
`evidenceType: null` meant the phase could *never* close, and the assignment was re-dispatched
forever. Here, the absence of any attached criterion means the phase closes **vacuously** — on
evidence-type presence alone, with nothing verified. Same root cause, opposite failure.

---

## 1. Coverage — what was confirmed

### 1.1 The compiler's twelve deliverables

`ACCESS_IDENTITY_DELIVERABLE_CATALOG` (`mission-compiler.mjs:74-181`) declares twelve deliverables.
Each is marked `reused` when `artifactPresent()` finds the first of its candidate paths existing and
larger than 200 bytes (`mission-compiler.mjs:183-196`). All twelve resolve in this worktree:

| # | Deliverable | Resolved artifact | Bytes |
|---|---|---|---|
| d1 | Existing-state inventory | `access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d2 | Surface and capability access catalog | `…/qa/access-identity-v2/05-command-enforcement-census.md` | 48,992 |
| d3 | Person ↔ user ↔ role ↔ scope model | `access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d4 | Authentication model | `…/qa/access-identity-v2/04-authentication-model.md` | 79,634 |
| d5 | Effective-access resolution model | `access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d6 | Product IA and principal flows | `…/qa/access-identity-v2/06-product-ia-and-flows.md` | 88,243 |
| d7 | Security threat and enforcement matrix | `access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d8 | Gap analysis | `access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d9 | Decisions requiring approval | `access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d10 | Sequenced implementation / QA plan | `access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |
| d11 | Director acceptance rubric | `…/qa/access-identity-v2/07-director-acceptance-rubric.md` | 94,044 |
| d12 | QA and evidence plan | `access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |

**Twelve deliverables are carried by seven distinct documents.** d1/d7/d8 share
`01-existing-state-inventory.md`; d3/d5/d9 share `02-canonical-access-identity-model.md`;
d10/d12 share `03-implementation-qa-sequence.md`. The count of "reused artifacts" that drives the
compiler's confidence score is therefore a count of catalog rows, not of independent evidence.

### 1.2 The operator's twelve required outputs

This is the question that actually matters, and `00…` §3 already answered it against the same
corpus. That assessment is re-confirmed as still current: **11 covered · 1 partial**. Output #7's
threat-model half remains an explicit, carried non-goal —
`02-canonical-access-identity-model.md:834` and `:1664` both still read *"Not a threat model, not an
RLS policy review, no product UI claim"*, the first annotated **[carried]**.

The corpus has also moved since that assessment (2026-07-30): the committed compiled-mission fixture
records `01-existing-state-inventory.md` at 34,402 bytes; the path the catalog resolves is 201,334
bytes today, and the directory has since accumulated waves W-0 through W-13 certification evidence.
Nothing in that movement reopens a discovery output.

> **Corrected by 08a §2.** That byte difference is not growth along one path. Both files exist right
> now, in two forked roots — 34,402 is today's **qa-copy** size, and the fixture recorded it against
> the **non-qa** path. Eight of the twelve deliverables therefore reuse documents that are not the
> ones the fixture certified, and the root workers actually write findings into is the one the
> compiler does not read for those deliverables. The coverage conclusion stands; the explanation
> here does not.

**Conclusion: the objective's premise — "No new discovery deliverables remain" — is true.**

### 1.3 One coverage claim the compiler gets right by accident

The catalog declares `partialOk: true` on d2 and d7 (`mission-compiler.mjs:93`, `:137`).
**`partialOk` is never read anywhere in the codebase** — those are its only two occurrences. So the
compiler reports d7 as fully reused, while the corpus itself classifies half of output #7 as an
explicit non-goal. The end state is the same (nothing the operator asked for is outstanding), but the
compiler is not the thing that established it.

08a §3 finds the same is true of the catalog's `patterns:` regex lists — twelve declarations, zero
consumers. With both dead, `artifactPresent()` is the whole of "coverage": a file exists at this path
and is larger than 200 bytes. Nothing tests whether a document is *about* the deliverable it covers.

---

## 2. How this phase was compiled, verbatim

The path is fully determined and reproducible from source:

1. The brief matched `isAccessIdentityBrief()` (`mission-compiler.mjs:198-201`) on title + objective.
2. All twelve catalog artifacts resolved, so every deliverable was marked `reused` and
   **zero** were `to_execute` (`mission-compiler.mjs:333-370`).
3. Because `ai` is true, `synthesizeAccessIdentityPhases()` **replaced** the brief's plan
   (`mission-compiler.mjs:520-521`). With `execute.length === 0` it returned exactly one phase
   (`:251-261`):

   ```js
   { phaseId: "p_reuse_only", order: 1,
     title: "Confirm reused specification corpus",
     objective: "No new discovery deliverables remain — confirm accepted artifacts cover the Mission Brief.",
     deliverableIds: [...twelve reused ids], dependencies: [], kind: "validation" }
   ```

   Note what is **absent**: no `requiredOutputs`, no `acceptanceCriteriaIds`.
4. Acceptance criteria are built only from `to_execute` deliverables (`:473-481`). There are none, so
   the fallback fired (`:482-488`), producing one criterion **with no `deliverableId` field**:

   ```js
   { id: "AC_reuse_confirmed", statement: "Operator confirms accepted Access & Identity artifacts
     satisfy the Mission Brief without new discovery.", evidenceType: "document" }
   ```
5. `createAssignmentsFromCompiled()` then built this assignment (`worker-assignment.mjs:74-165`):
   - `outputs = phase.requiredOutputs || deliverables.filter(… && d.status === "to_execute")` — the
     phase has no `requiredOutputs` and no deliverable is `to_execute`, so **`outputs = []`** (`:108-111`).
   - `scope: outputs` → `[]`; `expectedDeliverables: outputs` → `[]` (`:123`, `:128`).
   - `acceptanceCriteriaIds: phase.acceptanceCriteriaIds || []` → **`[]`** (`:129`).
6. `serializeAssignmentPrompt()` rendered `## Scope` and `## Acceptance criteria` as empty headings
   (`worker-assignment.mjs:314-324`), and `buildClaudeSessionPrompt()` substituted its placeholder
   `"- (document findings in the mission notes)"` for the empty deliverable list
   (`connectors/claude-connector.mjs:40`) — the same placeholder `00…` §2 flagged in July.

The committed fixture `…/qa/mission-compiler-v1/compiled-mission.msn_2d054741a54698fa4c.json` is a
real instance of every one of these shapes and can be read without executing anything.

**Scope note.** Per 08a §1, no record of this compilation exists in the local Vacilando runtime —
this mission, its assignment and its contentHash are absent from the mission, brief and run stores,
and no assignment store exists on this host at all. The trace above remains sound as a reading of the
source (it is the only path that emits this phase), but it describes the designed path, not an
observed execution. §3's consequences should be read the same way.

---

## 3. Defects

| # | Defect | Cause | Consequence |
|---|---|---|---|
| **C1** | The compiled mission's only acceptance criterion cannot attach to its only phase | `AC_reuse_confirmed` is created without `deliverableId` (`mission-compiler.mjs:483-487`); `p_reuse_only` is created without `acceptanceCriteriaIds` (`:252-260`). `createAssignmentsFromCompiled` reads `phase.acceptanceCriteriaIds \|\| []` directly (`worker-assignment.mjs:129`), and the `executionPlanFromCompiled` fallback matches on the missing `c.deliverableId` (`mission-compiler.mjs:738-741`), so neither route can bind it. | The mission displays one acceptance criterion that no assignment references and nothing will ever mark met. |
| **C2** | Validation of this phase is vacuous | `expectedDeliverables` is `[]`, so `deliverablesOk` short-circuits true on `length === 0` (`worker-assignment.mjs:609`). `validateAssignmentCompletion` never reads `acceptanceCriteriaIds` at all. `assignment-dispatch.mjs:418-431` fabricates `log`/`notes`/`document` evidence when the worker produced none, so `missing_evidence` is empty too. | `passed` reduces to *"a completion report exists"*. Any `kind: "validation"` phase reaching this path self-accepts — and since `p_reuse_only` is this mission's only phase, that is the whole mission. Not observed here (§2 scope note); this is what the code does wherever it runs. |
| **C3** | Operator-authored acceptance criteria and plan phases are discarded for any A&I brief | For `ai` briefs the compiler synthesises criteria from the catalog and never copies `brief.acceptanceCriteria` (`mission-compiler.mjs:473-488`); `mission-kickoff.mjs:386-388` then *replaces* rather than merges (`compiled.acceptanceCriteria?.length ? compiled : brief`), and `AC_reuse_confirmed` alone makes that length 1. `mission-compiler.mjs:520-521` likewise replaces `brief.plan` whenever `ai` is true, however well-formed that plan was. | This is **M2 re-introduced on a new path**: a multi-phase brief collapses to one unscoped phase — no longer because ingestion truncated it, but because a title regex matched. It is also what makes this deliverable unanswerable as written: the phase asks whether the corpus covers *the Mission Brief*, but the compiled mission it was dispatched from no longer contains the brief's criteria or plan. The coverage target was deleted during compilation. |
| **C4** | Deliverables cite acceptance criteria that do not exist | Reused deliverables are given `acceptanceCriteriaIds: ["AC_<id>"]` (`mission-compiler.mjs:336, 342`), but the criteria loop only emits criteria for `to_execute` deliverables (`:474-481`). | In the committed fixture, twelve deliverables reference `AC_d1_existing_state` … `AC_d12_qa_evidence` while `acceptanceCriteria` contains only `AC_reuse_confirmed`, and `evidenceRequirements` covers one criterion instead of twelve. Both ends of the mapping are broken, in opposite directions: the criterion that exists cannot bind, and the twelve ids that would bind do not exist. |

Confidence is scored at **90%** for this shape (`mission-compiler.mjs:561-568`: 55 base + 25 reuse cap
+ 5 no-remaining-work + 5 `ai && !truncated`, with no warnings or errors to subtract). A mission that
verifies nothing reports high confidence because reuse count is the dominant term.

---

## 4. Why the worker does not claim `AC_reuse_confirmed` as met

`AC_reuse_confirmed` is worded as an **operator** act: *"Operator confirms accepted Access & Identity
artifacts satisfy the Mission Brief without new discovery."* Nothing in the dispatch, session, or
validation path ever asks the operator — and per **C2** the phase completes without asking.

This report is the evidence for that confirmation, not the confirmation. §1 establishes that the
corpus covers the brief; the decision that it *satisfies* the brief remains Kelly's, and is the
recommended disposition in §5.

The distinction matters because of `assignment-dispatch.mjs:442-447` and `:473`, which map every
`acceptanceCriteriaIds` entry to `status: "met"` unconditionally on completion. Had the criterion been
attached, it would have been auto-marked met without the operator being consulted. The orphaning in
**C1** is the only reason that did not happen here.

---

## 5. Recommendation

**Accept the coverage finding; do not accept the phase as self-validating.**

1. **Operator disposition on `AC_reuse_confirmed`** — confirm, on the evidence in §1 and in
   `00…` §3/§8, that the accepted corpus satisfies the discovery brief. This is the one thing the
   mission is actually waiting on, and it is not worker-resolvable. Per 08a §1 there is currently no
   mission record on this host to attach that disposition to.
2. **Repair C2 first** — a `kind: "validation"` phase with zero expected deliverables must not pass on
   `length === 0`, and `validateAssignmentCompletion` must evaluate `acceptanceCriteriaIds` rather
   than ignore them. Widest blast radius, and not specific to Access & Identity.
3. **Repair C1** — either give `AC_reuse_confirmed` a `deliverableId`, or (better) give
   `p_reuse_only` an explicit `acceptanceCriteriaIds: ["AC_reuse_confirmed"]` at synthesis.
4. **Stop auto-marking criteria `met`** (`assignment-dispatch.mjs:442-447`, `:473`) — record what the
   worker claimed. A criterion whose subject is the operator must be routed to the operator.
5. **Repair C3** — merge, do not replace: compiled acceptance criteria should extend the brief's, and
   an operator plan should not be discarded because a regex matched the title. Until then, any brief
   whose title mentions access, identity, or roles silently loses its plan and its criteria.
6. **Repair C4** — emit the `AC_<deliverable>` criteria for reused deliverables (marked as previously
   accepted), or stop writing ids onto deliverables that have none.
7. **From 08a §6** — de-fork the two `access-identity-v2` roots, or make the catalog name one of them
   authoritatively; and either read `patterns`/`partialOk` or delete them.
8. **Carry forward from `00…` §8, still open and still not worker-resolvable** — approve or amend
   decisions **D1–D8**, and decide whether output **#7** stays a non-goal. Implementation of
   Access & Identity V2 should not begin until D1–D8 are settled.

---

## 6. Limits

- **Static and file-grounded.** No database, no browser, no test execution, and no code executed at
  all — `node` is blocked by this session's Bash permission gate. §2's compilation trace is read from
  source and corroborated by a committed compiled-mission fixture; it was not observed live.
- **Runtime mission state was not consulted by this pass.** Bash access outside the worktree is
  blocked, and this report wrongly concluded from that that the runtime was unreadable. **08a §1
  closes this limit** — the Read/Glob/Grep tools are not worktree-sandboxed, and reading
  `~/.local/state/alloy-dev/gateway` shows this mission, its assignment and its contentHash are
  **absent**, with no assignment store on the host and no run bound to any mission.
- **The brief was not read directly.** That the brief classifies as Access & Identity is *deduced*,
  not observed: `p_reuse_only` is reachable only via `synthesizeAccessIdentityPhases` with zero
  `to_execute` deliverables, and the non-`ai` branches cannot produce that state — a truncated
  non-`ai` plan yields exactly one `to_execute` deliverable (`mission-compiler.mjs:396-405`). The
  dispatched assignment carrying no `Out of scope:` prohibition also implies `compiled.exclusions` is
  empty and therefore `forbidsImplementation()` returned false (`:325-328`,
  `worker-assignment.mjs:123-127`) — which independently corroborates the first dispatch's F2 finding
  that a brief asking to *ship* compiled to a documentation phase with no conflict recorded.
- **Reuse resolves against whichever root answers first.** `resolveRepoPath` searches `process.cwd()`
  then `ALLOY_REPO_ROOT`/`VACILANDO_CHECKOUT` (`mission-compiler.mjs:44-71`). This report framed that
  as a risk from a stale Director checkout; **08a §2 shows the divergence is inside a single
  checkout**, which no amount of keeping the Director current resolves.
- **§1 states presence and prior acceptance, not re-verification.** As in `00…` §6, "covered" means an
  accepted, evidence-cited artifact addresses the output. This report did not re-audit the corpus's
  internal claims.
- **No Vacilando source was modified.** C1–C4 are located and unfixed.

---

## 7. Provenance

- **Cited Vacilando source:** `mission-compiler.mjs:44-71, 74-181, 183-196, 198-201, 247-280,
  325-328, 333-370, 396-405, 473-488, 520-521, 561-568, 726-744`; `worker-assignment.mjs:74-165,
  301-346, 604-650`; `mission-kickoff.mjs:380, 386-388, 450`; `assignment-dispatch.mjs:412-431,
  442-447, 473`; `evidence.mjs:206-213`; `connectors/claude-connector.mjs:39-40`.
- **Cited fixture:** `docs/platform/planning/vacilando-os/qa/mission-compiler-v1/compiled-mission.msn_2d054741a54698fa4c.json`.
- **Cited corpus:** [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §3, §6, §8;
  `02-canonical-access-identity-model.md:834, :1664`;
  [`08a-reuse-confirmation-runtime-addendum.md`](./08a-reuse-confirmation-runtime-addendum.md) §1–§4;
  [`../mission-compiler-v1/reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md`](../mission-compiler-v1/reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md).
- **No source, schema, migration, or UI changed by this phase.**
