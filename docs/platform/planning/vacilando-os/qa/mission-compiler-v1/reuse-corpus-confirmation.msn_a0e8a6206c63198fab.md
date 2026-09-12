---
owner: platform
status: findings
last_reviewed: 2026-09-11
supersedes: []
---

# Confirm reused specification corpus — second dispatch, same brief

**Mission.** `msn_a0e8a6206c63198fab` v1, contentHash `282eace8ea5a991546ba9e8b1c19fc7e`, titled
"Brief Spine Mission". Assignment `asg_f0efd2008f12f1`, phase `p_reuse_only`.

**Companion to** [`reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md`](./reuse-corpus-confirmation.msn_beb2e9e462cdce6513.md)
(`e27cf37f6`, 2026-09-11). That report's C1, F1, F2 and F4 were re-derived independently here and
are **confirmed**; they are not restated. This report records what the first dispatch could not
know, and one downstream consequence it did not reach.

**Verdict.** Unchanged: clause one ("no new discovery deliverables remain") is confirmed; clause two
("accepted artifacts cover the Mission Brief") is not confirmable as posed and is false for the
brief that generated this phase. **What is new is that the phase will be accepted anyway, without
an operator, and that it has now been dispatched twice.**

---

## G1 — The phase does not merely lack a gate; it passes automatically (blocking)

The prior report recommends *"do not record this phase as mission closeout."* That is the right
disposition, but it requires someone to intervene: **left alone, the runtime records it as passed.**
The full downstream path, none of which depends on what a worker produces:

1. `createAssignmentsFromCompiled` sets `expectedDeliverables = outputs`, and `outputs` resolves to
   `[]` — the synthesized phase carries no `requiredOutputs`, and the fallback filters deliverables
   for `status === "to_execute"`, of which there are none
   ([`worker-assignment.mjs:108-111, 128`](../../../../../scripts/local-dev/lib/vacilando/worker-assignment.mjs)).
2. `validateAssignmentCompletion` short-circuits its deliverable check on exactly that emptiness —
   `deliverablesOk = (a.expectedDeliverables || []).length === 0 || …` (`:609`). **It never reads
   `acceptanceCriteriaIds` at all**, so the orphaned `AC_reuse_confirmed` is not merely unattached,
   it is outside the code path.
3. The assignment declares `requiredEvidence: ["log", "document"]` (`:138`), and the Claude dispatch
   path *fabricates* `log`, `notes` and `document` evidence whenever the session produced none —
   with `fileUri` falling back to `expectedDeliverables[0]`, i.e. `null`
   ([`assignment-dispatch.mjs:418-431`](../../../../../scripts/local-dev/lib/vacilando/assignment-dispatch.mjs)).
   `missingRequiredEvidence` ([`evidence.mjs:206-213`](../../../../../scripts/local-dev/lib/vacilando/evidence.mjs))
   therefore returns `[]`.
4. `passed = missing.length === 0 && deliverablesOk && completionReport.status === "complete"`
   (`worker-assignment.mjs:613`) reduces to **"a completion report exists"**, and the assignment is
   set to `complete` (`:627`). Since `p_reuse_only` is the mission's only phase, that is the mission.

And had F1's criterion been attached rather than orphaned, it would not have helped:
`assignment-dispatch.mjs:442-447` and `:473` map every entry of `acceptanceCriteriaIds` to
`status: "met"` unconditionally on completion. `AC_reuse_confirmed` reads *"**Operator** confirms
accepted Access & Identity artifacts satisfy the Mission Brief"* — **no path in dispatch, session or
validation ever asks the operator**, and the criterion would have been auto-marked met on the
worker's behalf. The orphaning is the only reason that did not happen.

This is `00-mission-intake-and-coverage.md` §8's defect **M3** in mirror image. There, a criterion
with `evidenceType: null` meant the phase could *never* close, and the assignment was re-issued
forever. Here, the absence of any attached criterion means the phase closes **vacuously**. Same root
cause — a generated acceptance criterion no checker can evaluate — opposite failure, and this one is
the more dangerous, because the first mode was loud.

## G2 — The same brief has now been dispatched as two missions

| | First dispatch | This dispatch |
|---|---|---|
| Mission | `msn_beb2e9e462cdce6513` | `msn_a0e8a6206c63198fab` |
| Assignment | `asg_b306e5ed73e6f0` | `asg_f0efd2008f12f1` |
| Version / contentHash | v1 / `282eace8ea5a991546ba9e8b1c19fc7e` | v1 / **`282eace8ea5a991546ba9e8b1c19fc7e`** |
| Title · phase | Brief Spine Mission · `p_reuse_only` | identical |
| Objective · constraint · empty Scope/AC | identical | identical |

Identical content hashes alone would not prove identity — the same hash is known to ride unrelated
briefs — but title, phase id, objective, the single `C1` constraint and the empty scope/criteria
tuple all match as well. This is the same brief ingested twice under fresh mission ids, roughly an
hour apart, each consuming a worker session to re-derive the same findings.

That escalates the prior report's recommendation 2 from a question about one mission to a live loop:
**whatever is creating these missions will keep creating them**, and per G1 each one is on track to
self-accept. Withdrawing `msn_beb2e9e462cdce6513` alone does not stop it.

## G3 — The compiled mission carries twelve dangling acceptance-criterion references

Reused deliverables are written with `acceptanceCriteriaIds: ["AC_<catalog_id>"]`
([`mission-compiler.mjs:336, 342`](../../../../../scripts/local-dev/lib/vacilando/mission-compiler.mjs)),
but the criteria loop emits criteria only for `to_execute` deliverables (`:474-481`). In the
reuse-only case it emits exactly one, `AC_reuse_confirmed`.

The committed reference compilation
[`compiled-mission.msn_2d054741a54698fa4c.json`](./compiled-mission.msn_2d054741a54698fa4c.json)
shows the result directly: twelve deliverables cite `AC_d1_existing_state` …
`AC_d12_qa_evidence`, while `acceptanceCriteria` contains only `AC_reuse_confirmed`, and
`evidenceRequirements` therefore covers one criterion instead of twelve. Twelve references resolve
to nothing.

This matters beyond tidiness because `executionPlanFromCompiled` (`:738-741`) attaches criteria to
phases by matching `c.deliverableId` — and `AC_reuse_confirmed` is constructed without that field
(`:483-487`). So the only criterion that exists cannot bind, and the twelve ids that would bind do
not exist. Both halves of the mapping are broken, in opposite directions.

## G4 — Method note: this compilation was not reproduced either

As in the first report, the compiler was **not executed**: `node` is refused by this session's Bash
permission gate, and `compileMissionBrief()` persists (`saveCompiledMission`, `updateMission`,
`appendTimelineEvent`, `:605-633`), so it must not be run against live mission state regardless.
Runtime mission state was additionally unreadable here — the session is sandboxed to the worktree,
and `vac scoreboard` reports zero lanes and no episode from this root.

Every claim above is sourced to committed code, the committed compiled-mission fixture, or the
dispatched assignment text. One inference is worth naming as an inference: that this brief does
**not** forbid implementation is deduced from the dispatched assignment's `Prohibited changes`
carrying no `Out of scope:` line, which implies `compiled.exclusions` is empty and therefore
`forbidsImplementation()` returned false (`:325-328`, `worker-assignment.mjs:123-127`). That is
consistent with — and independently corroborates — the prior report's F2 trace of the fixture brief.

---

## Recommended disposition

Carries forward the prior report's recommendations unchanged, and adds:

1. **Stop the source of the dispatch before fixing the compiler.** Two missions with an identical
   v1 brief and contentHash arrived an hour apart (G2). Identify and halt whatever ingests this
   brief; withdrawing individual missions will not keep up with it.
2. **Treat G1 as the priority compiler/runtime fix, ahead of F1.** A validation phase with zero
   expected deliverables must not pass on `length === 0`, and `validateAssignmentCompletion` must
   evaluate `acceptanceCriteriaIds` rather than ignore them. This defect is not specific to Access &
   Identity — any `kind: "validation"` phase reaching that code path self-accepts.
3. **Stop auto-marking criteria `met`.** `assignment-dispatch.mjs:442-447, :473` should record what
   the worker actually claimed, not assert every criterion satisfied. A criterion whose subject is
   the operator should be routed to the operator, not answered on their behalf.
4. **Repair G3's mapping in whichever direction is intended** — emit `AC_<deliverable>` criteria for
   reused deliverables (marked as previously accepted), or stop writing ids onto deliverables that
   have none. Today neither end of the reference resolves.
5. **This phase is not accepted by its worker.** `AC_reuse_confirmed` is an operator act. This
   report and its predecessor are the evidence for that confirmation; the confirmation itself remains
   Kelly's, and per G1 it must be made deliberately, because the runtime will otherwise record it
   unasked.
