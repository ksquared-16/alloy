---
owner: platform
status: discovery
last_reviewed: 2026-09-06
missions:
  - mission: msn_5d5746423467b1019b
    assignment: asg_e3c569826d786e
    context_hash: 4624625b87d59bcce256b0a8746e7b72
    section: "DX-5 Evidence Experience — Discovery"
  - mission: msn_6aff2414309e409ede
    assignment: asg_9230877ca69cf2
    context_hash: 4624625b87d59bcce256b0a8746e7b72   # identical to msn_5d5746423467b1019b
    section: "DX-5 Evidence Experience — Discovery (second dispatch)"
  - mission: msn_b7040b5174ddeafb79
    assignment: asg_9c9447f0f8a8fc
    context_hash: 7925190b4920d87d78a39ed7154312b9
    section: "DX-6 Collaboration fixture — Discovery"
---

> **This file carries three mission dispatches, covering two distinct subjects.** All
> were dispatched with `requiredOutputs: ["a.md"]`. No dispatch overwrote an earlier one.
> See [Deliverable-path collision](#deliverable-path-collision) — the shared single-letter
> path is fixture scaffolding, not a real deliverable location.
>
> **Two of the three share a `contentHash` (`4624625b…`) but carry different mission and
> assignment ids** — the same compiled brief was dispatched twice. The fixture that
> generates it has now been located; see
> [Second dispatch](#dx-5-evidence-experience--discovery-second-dispatch).

# DX-5 Evidence Experience — Discovery

## Headline

**DX-5 is not greenfield. It shipped.** The Evidence Experience presentation layer
exists, has a dedicated test, has a written evidence record, and is covered by the
Phase 1 completion milestone. Any DX-5 work commissioned now is *extension or
gap-closure against a shipped slice*, not a build.

Two consequences follow, and they should be settled before implementation is
commissioned:

1. The remaining spec gaps are concentrated in **interaction chrome** (lightbox,
   filters, compare), not in data or classification — the view-model layer already
   computes everything those surfaces would need.
2. The spec's own roadmap routes the biggest remaining evidence idea (§8.6 remote
   review) into **DX-9, which is explicitly deferred** pending observed Director
   usage. Reviving it under a DX-5 banner would bypass that deferral.

## Scope note on this assignment

The assignment supplied objective "Discover", scope `a.md`, and acceptance
criterion "Done" — no discovery question. I scoped the work to the mission title
(*DX-5 Evidence Experience*) and produced a state-of-the-world inventory. If the
intended question was narrower (e.g. "why is evidence weak on live missions?"),
this document is the wrong shape and should be reworked against the real question.

## What exists today

### Specification

| Ref | Location | Content |
|---|---|---|
| Spec §8 | `docs/platform/planning/vacilando-os/DIRECTOR-EXPERIENCE-V2.md:415-479` | Evidence specification — principle, emphasis-by-work-type, card, gallery, before/after, future remote review |
| Roadmap | same, `:693` | DX-5 = "Evidence gallery — cards, filters, before/after; UI-primary screenshots; L1 strip", depends on DX-1 |
| Status | same, `:702` | DX-1…DX-8 complete on staging (2026-08-05); DX-9+ deferred |

The governing constraint is stated twice and is unambiguous: **presentation layer
only**. Evidence storage schema, attach API, certification, confidence engine and
mission lifecycle are out of bounds (`qa/director-experience-v2/README.md:23`).

### Implementation

`scripts/local-dev/lib/vacilando/presentation/evidence-experience.mjs` — 650 lines,
shipped in `ee2b99f9f feat(vacilando): DX-5 Evidence Experience presentation`.

Exported surface:

| Function | Role |
|---|---|
| `EVIDENCE_CATEGORIES` | Product / Browser / Certification / Tests / Technical / Supporting / Unclassified |
| `classifyEvidenceCategory` | Deterministic artifact → category adapter |
| `isFixtureOnly` | Fixture labeling from `environment` / `createdBy` |
| `comparisonRole`, `comparisonGroupKey`, `pairBeforeAfter` | Before/after pairing |
| `resolveEvidenceFilePath`, `resolveMissionEvidenceFile`, `resolveMissionEvidenceView` | Allowlisted file resolution |
| `evidenceExperienceCardVm` | Card view-model |
| `evidenceSufficiencyVm` | Sufficiency statements (no invented scores) |
| `executiveEvidenceStripVm` | L1 strip |
| `evidenceExperienceGalleryVm` | Gallery |

Consumers: `v2-api.mjs`, `presentation/operator-views.mjs`,
`presentation/executive-overview.mjs`.

### Wiring

| Layer | Location |
|---|---|
| Gallery API | `scripts/local-dev/lib/vacilando/v2-api.mjs:1550` → `/api/v2/views/mission/evidence` |
| File serve | `v2-api.mjs:1555` → `/api/v2/evidence/file?missionId=&evidenceId=`, path-allowlisted, existing `fileUri` only |
| Gallery fetch (UI) | `scripts/local-dev/apps/vacilando/public/mission-control.js:699` |
| L1 evidence strip (UI) | `mission-control.js:1722`, composed into L1 at `:2154` |

L1 order is Outcome → Summary → Confidence → Journey → **Evidence** → Decision → Depth,
consistent with the spec's 30-second gate.

### Test and evidence record

- `scripts/local-dev/tests/evidence-experience-dx5.test.mjs` (219 lines).
- `docs/platform/planning/vacilando-os/qa/director-experience-v2/DX5-EVIDENCE.md`
  — 9 browser certification scenarios, all recorded Pass; 4 screenshot/JSON artifacts.

## Gap analysis — spec §8 vs. shipped

| Spec requirement | Ref | State | Note |
|---|---|---|---|
| Deterministic card VM, plain-English title, Proves, Kind, Result | §8.3 | **Met** | `evidenceExperienceCardVm`, `provesText`, `resultState` |
| Paths / commands / exit codes behind Details | §8.3 | **Met** | Raw provenance kept under Technical details |
| Grid of cards, grouped | §8.4 | **Met** | 7 categories |
| Empty state — never fake screenshots | §8.4 | **Met** | Sufficiency statements only; no AI captions |
| Before/after pairing | §8.5 | **Partial** | `pairBeforeAfter` computes pairs; **no compare UI** |
| **Lightbox with keyboard next/prev** | §8.4 | **Not found** | Only `lightbox` hits are in `gateway-view.mjs`/`styles.css`, unrelated to evidence |
| **Filters + kind chips** | §8.4 | **Not found** | Grouping is static; no interactive filter located |
| `[Compare]` card action | §8.3 | **Not found** | Data exists, affordance does not |
| Remote review artifact roles | §8.6 | **Deferred** | Routed to DX-9; DX-9 deferred by roadmap |

The pattern is consistent: **the view-model layer is ahead of the interaction
layer.** Pairs, categories, sufficiency and previews are all computed server-side
and then rendered as a static grouped list. The three unmet items are the three
that require client-side interaction state.

## Carried-forward limitations

From `DX5-EVIDENCE.md:66-72`, still applicable:

- Live mission `msn_f74ed02c126c88d7ff` has **no screenshot artifacts** — visual
  proof is fixture-certified, not live-certified. This is the sharpest risk: the
  slice's headline promise (UI-primary screenshots) has never been proven against
  real production evidence.
- Before/after requires **explicit** `comparisonRole` / `pairId` / title markers.
  No silent filename pairing — deliberate, and it means pairing yields nothing
  unless producers cooperate.
- Evidence gallery HTTP is slow under concurrent control-plane load (local VM
  ~20ms; HTTP sometimes multi-second).
- Previews need resolvable `fileUri` under allowlisted roots; missing files
  degrade to card-without-thumbnail.
- No upload pipeline, no annotation.

## Governance observation

`DX5-EVIDENCE.md` carries `status: proposed` (frontmatter, `last_reviewed: 2026-08-05`),
as does the `qa/director-experience-v2/README.md` index — while
`DIRECTOR-EXPERIENCE-V2.md:702` declares DX-1…DX-8 **complete on staging**. The
evidence records for a completed phase are still marked proposed. That is a
documentation-state inconsistency, not a code defect, but it means the DX-5
evidence file cannot currently be cited as an accepted certification record.

## Open questions for the operator

1. **What is the actual DX-5 ask?** The slice is shipped. Is this mission (a)
   closing the three interaction gaps, (b) fixing live-mission evidence poverty,
   or (c) something the thin assignment did not carry?
   **→ Answered by the second dispatch: (c), and the answer is "none of them."**
   The brief is generated by a test fixture and carries no ask. See
   [Fixture origin](#fixture-origin-located).
2. **Does the producer side need work first?** Before/after and screenshot-primary
   evidence are inert unless workers emit `comparisonRole`/`pairId` and screenshot
   artifacts. That is arguably *not* presentation-layer work and would breach the
   DX-5 constraint.
3. **Is the DX-9 deferral still binding?** §8.6 remote review is the largest
   remaining evidence idea and is explicitly parked pending observed usage.

## Recommendation

Do not commission implementation from this discovery as written. Either supply the
real discovery question, or convert this into a scoped DX-5.1 ticket covering the
three interaction gaps (lightbox, filters, compare) — which are genuinely
presentation-layer and sit on top of view-model data that already exists.

## Verification performed

Static inventory only: spec read, module export surface enumerated, consumers and
route wiring located by search, git history checked for the shipping commit.

**`evidence-experience-dx5.test.mjs` was not executed** — the sandbox declined the
command. Its pass state is therefore unverified by this discovery; the Pass results
in the table above are transcribed from `DX5-EVIDENCE.md`, not independently
reproduced.

---
---

# DX-5 Evidence Experience — Discovery (second dispatch)

**Mission:** `msn_6aff2414309e409ede` v1 · **Assignment:** `asg_9230877ca69cf2`
· **contentHash:** `4624625b87d59bcce256b0a8746e7b72` · **Phase:** Discovery

## Headline

**This brief is generated by a test fixture, and it has now been dispatched twice.**
The state-of-the-world inventory above remains accurate and is not superseded — but its
central open question ("what is the actual DX-5 ask?") now has an answer: **there is no
ask.** The mission title, phase, objective, required output and acceptance criterion are
emitted verbatim by a helper in `director-portfolio-dx7.test.mjs`.

This dispatch carries the **same `contentHash` as `msn_5d5746423467b1019b`** but a
different mission id and assignment id. Identical compiled content, two mission
identities, two worker dispatches.

## Fixture origin located

The first DX-5 discovery could not find its own fixture, and reasonably so: **DX-5's
brief is not produced by the DX-5 test.** It comes from the generic `brief()` helper in
the **DX-7** portfolio test, which manufactures a filler mission for any title passed to
it.

`scripts/local-dev/tests/director-portfolio-dx7.test.mjs:26-38`:

```js
function brief(title) {
  return {
    title,
    objective: `Objective for ${title}`,
    plan: [{
      phaseId: "p1", order: 1, title: "Discovery",
      objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
    constraints: [],
    sourceMaterials: [],
  };
}
```

and `:136`:

```js
const midDone = seedMission("DX-5 Evidence Experience");
```

Field-by-field against assignment `asg_9230877ca69cf2`:

| Assignment field | Value | Fixture line | Match |
|---|---|---|---|
| Mission title | DX-5 Evidence Experience | `:136` | Exact |
| Phase / deliverable title | Discovery | `:31` | Exact |
| Objective | Discover | `:32` | Exact |
| Scope / required outputs | `a.md` | `:32` | Exact |
| AC1 | Done | `:34` | Exact |
| Constraints | *(empty)* | `:35` | Exact |

Six of six.

As with the DX-6 fixture, seeding does not stop at ingestion — `:40-45` drives the
mission to an approved, dispatchable state:

```js
function seedMission(title) {
  const ing = ingestMissionBrief(brief(title), { slot: 6, actor: "operator" });
  const missionId = ing.brief.missionId;
  approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });
  return missionId;
}
```

The fixture then marks this particular mission **completed and archived** (`:137-142`,
`archiveClass: "certification"`, reason `"DX-5 certified"`). The dispatched assignment
therefore descends from a mission the fixture itself considers finished.

## Why this one is more dangerous than DX-6

The DX-6 fixture announced itself — the word "fixture" was in the mission title, and a
reader could catch it. **This family cannot be caught that way.** `brief()` is a generic
generator, and the sibling titles seeded by the same helper in the same test are:

| Line | Seeded title | Reads as |
|---|---|---|
| `:103` | Identity & Access | A real programme |
| `:123` | Trust Platform | A real programme |
| `:130` | Communications | A real programme |
| `:136` | DX-5 Evidence Experience | A real roadmap slice |

None of these is self-labelling. Any of them arriving as a worker assignment — objective
"Discover", scope `a.md`, AC "Done" — is indistinguishable from a thin-but-genuine
mission on its face. **The tell is the tuple, not the title:** objective `Discover` +
`requiredOutputs: ["a.md"]` + AC statement `Done` + empty constraints.

`Identity & Access` is the sharpest risk: this repository has a large, live
access-identity programme, so a fixture mission by that name would look entirely
credible and could pull a worker into real code.

## Containment: this machine's test is clean

Same result as the DX-6 analysis, verified independently for the DX-7 test. Runtime state
is redirected to a temp directory at `:10`, before any store module is imported:

```js
process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx7-"));
```

All store imports that follow are dynamic `await import(...)` (`:12-24`), so the env var
is set before any module resolves its root. The static-then-dynamic ordering is correct
and the test is properly contained.

Corroborating: **neither `msn_6aff2414309e409ede` nor `msn_5d5746423467b1019b` appears
anywhere under `~/.local/state/alloy-dev`**, nor does the string `DX-5 Evidence
Experience`. Within this repository the mission ids appear only in this file.

So — as with DX-6 — the fixture reached a control plane that is **not this machine's
default runtime root**. Which one is not observable from this worktree.

## The re-dispatch is itself the finding

Two mission ids, one `contentHash`. That combination says something specific:

- The hash is **content-derived**, so it is stable across runs of the same fixture. It
  cannot distinguish "the same mission re-sent" from "a second, independent mission that
  happens to be identical."
- Dedupe keyed on mission id will therefore **not** collapse these; dedupe keyed on
  contentHash would have. The fixture ran (at least) twice and produced (at least) two
  live assignments.
- Because a worker cannot withdraw a mission, each dispatch consumes a worker slot and
  produces a document. This file is the artifact of that: three dispatches, one file.

The first DX-5 discovery observed that two missions sharing `a.md` "is itself a signal."
It is now three, and the signal is confirmed rather than inferred.

## Open questions for the operator

1. **Which control plane holds these missions?** Not `~/.local/state/alloy-dev`.
   Unchanged from the DX-6 discovery's question 2, and still the prerequisite for
   everything else.
2. **How many fixture missions are live?** If `brief()` seeded them, the same run also
   created `Identity & Access`, `Trust Platform` and `Communications`. Those should be
   swept for using the tuple above, not by title.
3. **Should dispatch dedupe on `contentHash`?** Two identical briefs became two
   assignments. If that is unintended, contentHash is the available key.
4. **Was `Identity & Access` dispatched to a worker?** If so it needs checking before
   anything else here — it is the one that could have reached real access-identity code.

## Recommendation

**Withdraw this mission; do not commission implementation.** It is a fixture, its content
duplicates an already-executed dispatch, and the fixture's own final act is to archive the
mission as certified.

The durable work is unchanged from the DX-6 discovery's recommendation (a) and is now
better specified: find the path by which `approveMissionExecution` in a test fixture
reaches a real dispatch queue. Two independent tests (`director-collaboration-dx6`,
`director-portfolio-dx7`) have now been shown to do this, both correctly contained
locally — so the leak is not in the tests, and is not in this repository.

## Verification performed

Static inventory. Fixture correspondence established by reading
`director-portfolio-dx7.test.mjs:1-169` directly; containment confirmed by tracing
`ALLOY_RUNTIME_ROOT` from `:10` against the dynamic-import block at `:12-24`; runtime
state and repository searched for both mission ids, both assignment ids, and the fixture
title. Existence and size of the DX-5 module, test and evidence record re-confirmed on
disk.

**`evidence-experience-dx5.test.mjs` was again not executed** — the sandbox declined
`node --test` on this run, exactly as it declined for the first dispatch. The Pass results
in the DX-5 table above remain transcribed from `DX5-EVIDENCE.md` and independently
unreproduced. No source code was modified; the only file changed is this one.

---
---

# DX-6 Collaboration fixture — Discovery

**Mission:** `msn_b7040b5174ddeafb79` v1 · **Assignment:** `asg_9c9447f0f8a8fc`
· **contentHash:** `7925190b4920d87d78a39ed7154312b9` · **Phase:** Discovery

## Operator guidance carried forward (AC1)

> **"Keep architecture; simplify role editor."** — operator feedback, mission
> conversation, type `feedback`, status `open`.

This is the guidance AC1 requires to persist. It is recorded here verbatim, and its
provenance and applicability are analysed under [Guidance provenance](#guidance-provenance)
below — the short version is that it is **seed text from a test fixture**, and it
should not be acted on as an engineering instruction without operator confirmation.

## Headline

**This mission's brief is byte-identical to a unit-test fixture.** Every field of the
assignment — mission title, phase, objective, required output `a.md`, acceptance
criterion "Guidance persists", and the operator guidance string itself — appears
verbatim in `scripts/local-dev/tests/director-collaboration-dx6.test.mjs:96-124`,
where it exists to exercise the DX-6 collaboration store.

The DX-6 slice this mission nominally targets **already shipped** (PR #342, complete
on staging 2026-08-05). So this is not a build, and on the evidence it is not a
gap-closure either: it is a fixture that reached a worker dispatch queue.

## The fixture correspondence

`director-collaboration-dx6.test.mjs:96-124` constructs and ingests this brief:

```js
const brief = {
  title: "DX-6 Collaboration fixture",
  objective: "Persist executive guidance.",
  plan: [{
    phaseId: "p1", order: 1, title: "Discovery",
    objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
  }],
  acceptanceCriteria: [{ id: "AC1", statement: "Guidance persists" }],
  constraints: [], sourceMaterials: [],
};
const ing = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

createCollaborationEntry({
  missionId, type: "feedback",
  body: "Keep architecture; simplify role editor.",
  status: "open",
});
```

Field-by-field against assignment `asg_9c9447f0f8a8fc`:

| Assignment field | Value | Fixture line | Match |
|---|---|---|---|
| Mission title | DX-6 Collaboration fixture | `:98` | Exact |
| Phase / deliverable title | Discovery | `:101` | Exact |
| Objective | Discover | `:102` | Exact |
| Scope / required outputs | `a.md` | `:102` | Exact |
| AC1 | Guidance persists | `:104` | Exact |
| Constraints | *(empty)* | `:105` | Exact |
| Operator guidance | Keep architecture; simplify role editor. | `:120` | Exact |

Seven of seven. The word "fixture" is in the mission title.

Note the fixture also calls `approveMissionExecution` — it does not merely create a
brief, it drives the mission to an approved, dispatchable state. That is precisely
the state transition a real mission needs before workers are assigned.

## Containment: the local test is clean

The obvious hypothesis — a test run leaked into the real control plane — **does not
hold on this machine.** The test redirects runtime state to a temp directory *before*
importing any store module:

```js
// director-collaboration-dx6.test.mjs:10
process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx6-"));
```

Every subsequent import is a dynamic `await import(...)` (`:12-24`), so the env var is
set before `mission-collaboration.mjs:21` resolves its root:

```js
const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
```

The static-then-dynamic import ordering is deliberate and correct. This test is
properly contained.

Corroborating: **`msn_b7040b5174ddeafb79` and the string "DX-6 Collaboration fixture"
appear nowhere under `~/.local/state/alloy-dev`.** The mission does not exist in this
machine's default runtime root.

**Therefore the fixture entered a control plane that is not this machine's local
state store** — a hosted/remote Vacilando instance, a non-default `ALLOY_RUNTIME_ROOT`,
or a hand-authored mission that copied the fixture brief. Determining which is
outside what this worktree can observe, and is the first thing the operator should
resolve.

## What DX-6 actually is (state of the world)

DX-6 Director Collaboration is shipped and covered.

| Layer | Location | Size |
|---|---|---|
| Store | `scripts/local-dev/lib/vacilando/mission-collaboration.mjs` | 257 lines |
| Presentation | `scripts/local-dev/lib/vacilando/presentation/director-collaboration.mjs` | 187 lines |
| Test | `scripts/local-dev/tests/director-collaboration-dx6.test.mjs` | 154 lines |
| Evidence | `docs/platform/planning/vacilando-os/qa/director-experience-v2/DX6-EVIDENCE.md` | — |
| Spec | `DIRECTOR-EXPERIENCE-V2.md:695` | roadmap row |
| L1 IA | `mission-control.js:2153` | Continuation → **Collaboration** → Depth |

Store surface: 8 closed types (feedback, decision, question, clarification,
approval_note, implementation_guidance, revision_request, information) × 6 statuses
(open, addressed, accepted, rejected, superseded, resolved), append-oriented with
`statusHistory` and a separate audit log (`listCollaborationAudit`). Presentation
surface: `projectDecisionsAsCollaboration`, `directorCollaborationVm`,
`collaborationStripVm`. API: `POST/GET /api/v2/missions/collaboration`, `POST .../status`.

The governing constraint is the same as DX-5's: **presentation plus a scoped store**;
mission lifecycle, workers, confidence, evidence and certification engines unchanged.

## Guidance provenance

The guidance "Keep architecture; simplify role editor" **does not refer to DX-6.**

In the fixture it is arbitrary seed text, chosen to give the collaboration store a
plausible-looking feedback entry. Its sibling entries in the same test are
"Do not duplicate parent identities.", "Billing should move before Scheduling.", and
"Role hierarchy is still too deep — reduce to four layers." (`:32-62`) — all seed
strings from the **access-identity** domain, borrowed for realism.

There *is* a real role editor, and it is in a different subsystem entirely — the
`web/` access-identity surface, ~35 files including:

- `web/tests/access/oneRoleEditorPage.test.ts`, `roleEditorSingleSurface.test.ts`
- `certification/playwright/access-role-editor-one-page.cert.spec.ts`
- `web/lib/access/capabilityMatrix.ts`, `memberRoleAssignment.ts`
- `docs/platform/planning/access-identity-v2/d2-i10-role-composition-decision.md`

Note that "simplify the role editor" is already a **settled, implemented** direction
there — the tests are literally named `oneRoleEditorPage` and `roleEditorSingleSurface`,
i.e. the one-page consolidation shipped.

So the guidance is simultaneously (a) not about this mission's subsystem, and (b) if
read against the subsystem it *does* name, already done. Per the assignment's own
prohibition — *"Do not reinterpret Compiled Mission intent — escalate if reality
diverges"* — this discovery **escalates rather than reinterprets.** No `web/` code was
touched.

## Deliverable-path collision

`a.md` was already occupied by the DX-5 discovery for mission
`msn_5d5746423467b1019b` (assignment `asg_e3c569826d786e`), untracked and uncommitted
— so an overwrite would have been unrecoverable. That mission's assignment was
similarly thin: objective "Discover", scope `a.md`, acceptance criterion "Done", and
its own discovery flagged the thinness (see *Scope note on this assignment* above).

Two independent missions dispatched with the same single-letter required output is
itself a signal: `a.md` is fixture scaffolding being emitted as a real deliverable
path. Real missions should name a real document under `docs/platform/planning/...`.

## Documentation-state inconsistencies found

1. **`DX6-EVIDENCE.md` carries `status: proposed`** (`last_reviewed: 2026-08-05`)
   while `DIRECTOR-EXPERIENCE-V2.md:702` declares DX-1…DX-8 complete on staging.
   Same inconsistency the DX-5 discovery recorded — it is systemic across the
   `qa/director-experience-v2/` records, not a one-off.
2. **`DX6-EVIDENCE.md` "Recommended next slice" is wrong.** It reads *"DX-7 — Remote
   Review (then DX-8 Mission List Convergence, DX-9 Worker Operations)"*. The roadmap
   (`:695-700`) assigns DX-7 = Director Portfolio, DX-8 = Executive Command Center,
   DX-9 = Remote Review, DX-10 = Mission List Convergence, DX-11 = Worker Operations.
   Every slice name in that sentence is off by the roadmap's own numbering. The same
   stale numbering appears in `DX5-EVIDENCE.md:76` ("DX-6 — Remote Review") and
   `DX4-EVIDENCE.md:69`. These evidence files were written against a superseded
   roadmap and never reconciled.
3. **DX-9+ is deferred** by `:702` pending observed Director usage. Any collaboration
   work framed as remote review would cross that deferral.

## Open questions for the operator

1. **Is `msn_b7040b5174ddeafb79` a real mission?** If it was created by copying the
   fixture brief, it should be withdrawn, not executed. If a control plane ingested it
   automatically, that ingestion path is the actual defect and it is not in this
   worktree.
2. **Which control plane holds it?** It is not in `~/.local/state/alloy-dev`.
   Identifying the runtime root that does is the prerequisite for question 1.
3. **If there is a real DX-6 ask behind this**, what is it? The slice is shipped;
   the fixture brief carries no genuine objective.
4. **Should the evidence-record numbering be reconciled?** Three DX evidence files
   cite a superseded roadmap. Cheap to fix, and it is currently misleading.

## Recommendation

**Do not commission implementation from this mission.** Confirm mission provenance
first (questions 1–2). Nothing in the brief describes real work, and the one concrete
instruction it carries points at a different subsystem where that instruction is
already satisfied.

If the operator wants the durable value from this discovery, the two candidates are
narrow and independent of DX-6: (a) find and close the path by which a fixture brief
reached a dispatch queue, and (b) reconcile the stale slice numbering in the
`qa/director-experience-v2/` evidence records.

## Verification performed

Static inventory. Spec, roadmap and evidence records read; DX-6 store and
presentation export surfaces enumerated; fixture correspondence established by
reading `director-collaboration-dx6.test.mjs:1-124` directly; containment confirmed
by tracing `ALLOY_RUNTIME_ROOT` from test line 10 to `mission-collaboration.mjs:21`
and checking dynamic-import ordering; runtime state searched for the mission id and
fixture title (no matches).

**No test was executed.** `director-collaboration-dx6.test.mjs` was read, not run —
its pass state is transcribed from `DX6-EVIDENCE.md`, not independently reproduced.
Discovery phase; no source code was modified.
