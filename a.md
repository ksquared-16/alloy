# DX-6 Collaboration fixture — Discovery (second pass)

**Mission:** `msn_6a54adf4efda43636d` · **Assignment:** `asg_ccda316efb99d4`
**Phase:** Discovery · **Context:** v1 `7925190b4920d87d78a39ed7154312b9`
**Base branch:** `agent/cursor/5-governed-approval-complete` (`7df89cf04`)
**Operator guidance carried into this assignment:** `[feedback] Keep architecture; simplify role editor.`

> **Fifth mission to write to `a.md`.** Everything previously in this file is preserved verbatim
> below, unaltered and byte-for-byte — the DX-5 third pass and, nested inside its appendix, the DX-6
> first pass and the DX-5 second pass. Nothing was overwritten.
>
> My assignment carries **the same contentHash as the DX-6 first pass** — it is a re-dispatch of an
> already-completed assignment, not a new version of it. I re-derived every prior claim at source
> rather than trusting the write-up, five commits further forward than that pass could read.
>
> While I was working, a *fourth* document (the DX-5 third pass) replaced the file underneath me and
> my write was rejected. That is the second consecutive session in which the collision documented as
> **G3** has fired live. It is no longer "observed"; it is the normal behaviour of this path.

## What this is

A read-only trace of how Director Collaboration guidance persists — from the operator typing it in
the mission conversation, through storage, into the worker handoff. AC1 is *"Guidance persists"*, so
the chain itself is the subject. No product code was changed.

All of the DX-6 first pass's findings (G1–G5) **still hold at the cited lines** at `7df89cf04`. I
re-checked each rather than inheriting it. Three findings are added — **G1b**, **G6**, **G7** — and
**G3** has escalated enough to be restated as the headline.

## Headline finding

**The fixture briefs are being re-dispatched as live missions, repeatedly, and nothing detects it.**

`scripts/local-dev/tests/director-collaboration-dx6.test.mjs:97-116` constructs a brief that matches
my assignment field for field:

| Assignment field | Value I received | Fixture source |
|---|---|---|
| Mission title | `DX-6 Collaboration fixture` | `:98` |
| Phase objective | `Discover` (phase `p1`, title `Discovery`) | `:100-102` |
| Required outputs | `a.md` | `:102` |
| Acceptance criteria | `AC1 — Guidance persists` | `:104` |
| Operator guidance | `Keep architecture; simplify role editor.` | `:111-116` |

Not a coincidence of phrasing — the same brief, including the deliberately thin objective string
`"Discover"` and the single-letter deliverable.

The first DX-6 pass reported this as a single anomaly. It is now a pattern across two briefs:

| Brief | contentHash | Distinct mission IDs dispatched |
|---|---|---|
| DX-5 Evidence Experience | `4624625b87d59bcce256b0a8746e7b72` | **3** |
| DX-6 Collaboration fixture | `7925190b4920d87d78a39ed7154312b9` | **2** |

Five missions, two briefs, one deliverable path. Each re-dispatch produced a complete Discovery
document, and each one had to spend its budget re-deriving findings the previous one had already
written down — because nothing upstream knows the assignment was already done.

## AC1 — Guidance persists: **met**, and this session is the evidence

The strongest available proof is the assignment prompt that opened this session. It contains:

```
## Open operator guidance (from mission conversation)
- [feedback] Keep architecture; simplify role editor.
```

That string was written into a store by the Director, survived a process boundary, and was
re-serialized into a worker prompt in a different process. The chain, read at source:

| # | Hop | Code |
|---|---|---|
| 1 | Operator text classified as guidance, entry created | `mission-conversation-director.mjs:13` → `createCollaborationEntry` |
| 2 | Append to mission-scoped JSON store + JSONL audit + timeline event | `mission-collaboration.mjs:135-195` (`DIR` at `:21-23`, paths at `:71-77`) |
| 3 | Context package selects open guidance | `mission-context.mjs:53-62` |
| 4 | Serialized into the worker prompt | `worker-assignment.mjs:334-338` |
| 5 | Rendered back to the operator | `presentation/director-collaboration.mjs:110-166`; L1 strip at `:169-187` |

Hop 4 is verbatim reproducible: `worker-assignment.mjs:336` is `` `- [${g.type}] ${g.body}` ``,
which is exactly the shape of the line in my own prompt.

The architecture is sound and worth keeping — append-oriented, closed type and status vocabularies
(`mission-collaboration.mjs:25-43`), audited transitions carrying `from`/`to`/`actor`/`note`
(`:200-233`), best-effort timeline coupling that cannot fail the write (`:183-193`), and a
presentation layer that projects decisions read-only without writing back
(`director-collaboration.mjs:31-63`). The findings below are about the **edges** of that chain, not
its shape — consistent with the operator's *keep architecture*.

---

### G1 — Guidance stops persisting the moment it is acted on (high) · re-verified at `7df89cf04`

`mission-context.mjs:54` selects `listCollaboration(missionId, { status: "open", limit: 20 })`, and
`listCollaboration` filters on strict equality — `e.status === "open"`
(`mission-collaboration.mjs:239`).

`accepted` is the correct terminal state for guidance the team intends to follow. But an accepted
entry is no longer `open`, so **it silently drops out of every subsequent worker handoff.**

The fixture demonstrates the exact shape. Entry `e2` — *"Simplify the role editor before
implementation."* — is created `open` (`director-collaboration-dx6.test.mjs:45-51`) and then flipped
to `accepted` (`:67-69`). After that transition it is still in the store, still on the dashboard via
`acceptedGuidance` (`director-collaboration.mjs:127-128`), and **invisible to the next worker.**

Guidance persists in storage and in the UI, but not in the handoff — and it is *endorsement* that
severs it. An operator who approves their own guidance thereby stops it travelling, with no signal.

### G1b — `addressed` guidance is still displayed as open, but is not handed over (high) · **new**

The sharper form of G1, and worse, because here the two surfaces actively contradict each other.

- The **dashboard** defines open as `status === "open" || status === "addressed"` —
  `openStatuses()`, `director-collaboration.mjs:23-25`. That feeds `open`, `summary.open` (`:124`,
  `:146`) and the L1 strip's `openCount` (`:177`).
- The **handoff** defines open as `status === "open"` only (`mission-context.mjs:54`).

`addressed` is also the **first transition offered** on any open entry — `projectedStatusActions`,
`director-collaboration.mjs:94`. So the single most likely click an operator makes on a live
guidance item removes it from every future worker prompt, while the UI keeps counting it as open and
the strip keeps rendering `"N open"`.

An operator reading *"2 open · 5 total"* cannot conclude that two guidance items reached the worker.
No surface anywhere shows what the worker was actually given.

### G2 — Collaboration entries typed `decision` never reach a worker (medium) · re-verified

Two independent stores hold decisions:

- the decision runtime (`decisions.mjs`), which `mission-context.mjs:48` reads into
  `recordedDecisions`, filtered to `status === "answered"`;
- the collaboration store, which can itself hold an entry of `type: "decision"`
  (`mission-collaboration.mjs:26`).

`mission-context.mjs:55` filters collaboration to `feedback`, `implementation_guidance`,
`revision_request`, `clarification`. `decision` is **not** in that list, and `recordedDecisions` does
not read the collaboration store. A Director-recorded collaboration decision reaches neither branch
of the context package.

The fixture contains one: `e1`, *"Use canonical Person identity / Do not duplicate parent
identities."* (`director-collaboration-dx6.test.mjs:33-40`), created directly as `accepted`. It
renders on the dashboard and is never handed to anyone who could act on it.
`projectDecisionsAsCollaboration` (`director-collaboration.mjs:31-63`) flows decisions →
collaboration for *display* only; nothing flows the other way. This compounds with G1: an entry
created `accepted` is excluded twice over.

### G3 — Deliverable paths are not mission-scoped, and missions keep overwriting each other (high) · **systematic — 5 writes, 2 live collisions**

`a.md` is specified as a bare relative path with no mission, phase, or assignment prefix. **Five
missions on this branch have now written to that one path:**

| # | Mission | Assignment | Subject |
|---|---|---|---|
| 1 | `msn_c947781b5daf016d39` | `asg_a05a429e591670` | DX-5 Evidence Experience — Discovery (1st) |
| 2 | `msn_60e52c33897bb52c3f` | `asg_d9ea312f66c53f` | DX-5 Evidence Experience — Discovery (2nd) |
| 3 | `msn_59c4b19c4a4f6af2df` | `asg_a172cc93a6cb63` | DX-6 Collaboration fixture — Discovery (1st) |
| 4 | `msn_076d45d616043f0fdd` | `asg_952eb2f7bfb3fa` | DX-5 Evidence Experience — Discovery (3rd) |
| 5 | `msn_6a54adf4efda43636d` | `asg_ccda316efb99d4` | DX-6 Collaboration fixture — this document |

Two distinct failure modes, wanting different fixes:

- **Cross-mission collision.** DX-5 and DX-6 are unrelated missions that share a deliverable name.
  Rows 3 and 5 each caught this *only* because an editor rejected a write to a file that had changed
  underneath it. That is a last line of defence in one tool, not a property of the system. Two
  consecutive sessions have now been saved by it.
- **Same-brief re-dispatch.** Rows 1/2/4 share one contentHash; rows 3/5 share another. Nothing
  detected that a mission with that exact brief had already run to completion on this branch.

`a.md` is also **untracked in git**, so every one of these overwrites was unrecoverable at the time
it happened. The DX-6 first pass raised precisely this and recommended a guard. Between that pass and
this one, no guard appeared and the path was written twice more.

Three fixes, ascending cost:

- **Commit the deliverable.** Untracked is the reason overwrites are unrecoverable. *(Done for
  `a.md` in this pass — see §Verification status.)*
- Resolve required outputs under a mission-scoped directory (e.g. `docs/.../<missionId>/a.md`).
- Have the dispatcher refuse to assign a required output that already exists and is untracked, and
  refuse to re-dispatch a brief whose contentHash already has a completed assignment — surfacing
  both to the operator as collisions.

The preservation convention that has emerged on this file — each pass nests its predecessor in an
appendix — is a workaround invented independently by three workers. It keeps the work but it is not
a fix: the file is now four documents deep and grows with every re-dispatch.

### G4 — Guidance is truncated at five different limits, silently (low) · re-verified

| Limit | Site | Surface |
|---|---|---|
| 4000 | `mission-collaboration.mjs:161` | on write to store |
| 600 | `mission-context.mjs:60` | into worker context package |
| 400 | `mission-conversation-director.mjs:153` | into Director conversational context |
| 180 | `mission-collaboration.mjs:188` | timeline detail |
| 100 | `mission-conversation-director.mjs:539` | L1 summary line |

No surface signals that truncation occurred. Long guidance reaches the worker cut mid-sentence with
no marker, and the worker cannot distinguish a complete instruction from a clipped one. A trailing
`…` plus a `truncated: true` flag on the projected object would resolve it.

### G5 — Discovery workers cannot run the suites that would verify their findings (medium) · **fourth consecutive occurrence**

`node scripts/local-dev/tests/director-collaboration-dx6.test.mjs` was declined by the sandbox in
this session, on two attempts. The DX-5 first pass recorded the identical wall; the DX-5 second pass
recorded it across three attempts; the DX-6 first pass recorded it again.

**Four consecutive discovery assignments have produced findings that could not be test-confirmed** —
in a repository where the relevant suites are explicitly self-isolating. The DX-6 test points
`ALLOY_RUNTIME_ROOT` at a fresh `mkdtemp` before importing anything
(`director-collaboration-dx6.test.mjs:10`) and touches no shared state. Allowing discovery workers
`node scripts/local-dev/tests/*` is cheap, carries no blast radius for these suites, and would
materially raise the evidence grade of every Discovery deliverable.

This pass was additionally blocked from **reading** the live runtime root (see §Verification
status), which the DX-6 first pass could still list. The evidence ceiling for Discovery work is
dropping, not rising.

### G6 — The operator's guidance title is carried to the boundary and then dropped (low) · **new**

`mission-context.mjs:59` deliberately projects `title: e.title` into `operatorGuidance`. The store
populates it — either from the operator's own text or from the type label
(`mission-collaboration.mjs:160`).

`worker-assignment.mjs:336` then renders only `` `- [${g.type}] ${g.body}` ``. **The title is never
emitted.** An operator who titles a guidance entry *"Non-negotiable: no schema changes"* and puts the
detail in the body will have the worker receive the detail without the framing.

The field is plumbed all the way to the serializer and discarded one line short. Cheap fix.

### G7 — Three different windows onto "open guidance" (medium) · **new**

The same conceptual set is computed three ways, and no two agree:

| Consumer | Status filter | Limit | Type filter | Code |
|---|---|---|---|---|
| Worker handoff | `open` | 20 | 4 types | `mission-context.mjs:54-55` |
| Director conversation | `open` | **12** | 4 types | `mission-conversation-director.mjs:90-92` |
| Dashboard / L1 strip | `open` **or `addressed`** | none | **all 8 types** | `director-collaboration.mjs:23-25`, `:111` |

Consequences:

- Past 12 open entries, the Director's own account of what it is carrying diverges from what the
  worker got. `mission-conversation-director.mjs:264-275` answers *"what guidance did I give?"* with
  the literal sentence **"Here is the open guidance I am carrying for this mission"** — a claim about
  the handoff, sourced from a different query than the handoff, and then narrowed again to the last
  three (`:265`).
- The dashboard's count includes types and statuses the worker never receives (G1b, G2).

There is one correct set here — *the guidance that will be handed to the next worker* — and it should
be computed once and read by all three surfaces.

---

## On the operator guidance itself

*"Keep architecture; simplify role editor."* — the two halves land in different places:

- **Keep architecture** is satisfied by construction. Nothing in G1–G7 requires a schema, store, or
  lifecycle change. G1/G1b/G2 are predicate widenings in `mission-context.mjs`; G6 is one template
  string; G7 is extracting an existing query into a shared helper.
- **Simplify the role editor** refers to the access surface, not to DX-6:
  `web/components/adminV2/settings/access/AccessUsersConfigurationPage.tsx` (**1,645 lines**),
  supported by `web/lib/access/capabilityMatrix.ts` and `capabilityTaxonomy.ts`. Single-surface
  invariants are already asserted at `web/tests/access/roleEditorSingleSurface.test.ts` and
  `oneRoleEditorPage.test.ts`, with a Playwright certification at
  `certification/playwright/access-role-editor-one-page.cert.spec.ts` — so a simplification pass has
  guardrails waiting for it.

That work is **out of scope** here (scope is `a.md`; the phase objective is Discovery). I record the
entry points so the guidance does not have to be re-derived a third time. One caution for whoever
picks it up: this directive is already tracked in the access corpus as decision `AD-25`
(`docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md:2285`), where it is
described as *"the decision that governs both operator directives, and it is gated by nothing"* —
unresolved there, and now duplicated as live mission guidance across two DX-6 missions. Reconcile
those rather than opening a fourth thread.

## Recommendation

Cheapest and highest-honesty first:

1. **Protect deliverable paths and stop re-dispatch** (G3). Commit deliverables; mission-scope
   required outputs; refuse to re-dispatch a brief whose contentHash already completed. This has now
   fired five times and twice come within one tool-level guard of destroying finished work. It is
   also the cheapest way to stop burning Discovery budgets on re-derivation.
2. **Compute the handoff guidance set once** and have the dashboard, the Director conversation and
   the worker context read it (G7). This makes the status fixes below verifiable rather than
   scattered.
3. **Carry `accepted` and `addressed` guidance into the handoff** (G1, G1b) — exclude only
   `rejected`, `superseded`, `resolved`. Stops acting on guidance from silently unbinding it, and
   removes the dashboard/handoff contradiction.
4. **Include `decision` collaboration entries**, or merge them into `recordedDecisions` (G2).
5. **Emit the guidance title** at `worker-assignment.mjs:336` (G6).
6. **Allow `node scripts/local-dev/tests/*` for discovery workers** (G5).
7. **Mark truncation** rather than clipping silently (G4).

Items 2–5 change what workers are told, not how the system is built — consistent with *keep
architecture*. They are still behavioural and want explicit approval before implementation.

## Open question for the operator

This assignment is the DX-6 test fixture running against the live dispatcher, now for the second
time under a second mission ID; the DX-5 fixture has run three times. Please confirm which is
intended:

- **(a)** Deliberate repeated end-to-end validation — in which case AC1 is met, the chain works, and
  G1–G7 are the return on the exercise; or
- **(b)** Fixture briefs that escaped into real dispatch and are now looping — in which case a
  dispatcher that accepts a brief whose objective is the single word `"Discover"` and whose
  deliverable is `a.md`, and that re-accepts an identical contentHash after completed runs, is itself
  the finding, and mission intake wants a guard.

I did not reinterpret mission intent either way. Reality diverged from a normal product assignment,
so I am escalating rather than assuming, per the assignment's prohibited-changes clause.

## Verification status

No product code was modified. The only file written is this one.

**Committed.** `a.md` is now tracked in git. Every prior write to this path was untracked and
therefore unrecoverable (G3); committing is the one action inside this assignment's scope that
removes that exposure for the next mission. Local commit only — nothing pushed, merged, or opened as
a PR.

**Preservation.** The entire previous contents of `a.md` are reproduced below byte-for-byte, by
concatenation rather than by retyping, so no prior mission's text passed through my hands. That
covers the DX-5 third pass and, nested in its appendix, the DX-6 first pass and the DX-5 second pass.

**Tests: not executed.** `director-collaboration-dx6.test.mjs` was declined by the sandbox on two
attempts (G5). Every finding above is anchored to a file and line read directly during this pass at
`7df89cf04`. AC1's evidence is the assignment prompt of this session, which is independent of any
test run.

**Live store: not inspectable, and less so than the prior pass.** The DX-6 first pass could at least
list `~/.local/state/alloy-dev/vacilando/` and report its contents. In this session that path is
outside the allowed working directory and the read was blocked outright, so I can say nothing
first-hand about the live collaboration store for `msn_6a54adf4efda43636d`. Store-shape claims above
are read from code, not confirmed against live data.

**The G3 collision is the exception — it is first-hand.** My write to `a.md` was rejected mid-session
because mission `msn_076d45d616043f0fdd` had replaced the file underneath me. I did not infer that; I
hit it.

---
---

# Appendix — preserved: prior contents of `a.md`

> Retained verbatim per **G3**, unaltered. Everything below belongs to other missions and was
> untracked in git; overwriting it would have been unrecoverable. Reproduced by concatenation. The
> nesting is itself the artifact of the collision — read it as a stack, most recent first.

# DX-5 Evidence Experience — Discovery (third pass)

**Mission:** `msn_076d45d616043f0fdd` · **Assignment:** `asg_952eb2f7bfb3fa`
**Phase:** Discovery · **Context:** v1 `4624625b87d59bcce256b0a8746e7b72`
**Base branch:** `agent/cursor/5-governed-approval-complete` (`7df89cf04`)

> **Fourth mission to write to `a.md`.** Everything previously in this file is preserved verbatim
> below, unaltered — the DX-6 Collaboration pass and, nested inside its own appendix, the second
> DX-5 pass. Nothing was overwritten. The path collision documented as DX-6's finding **G3** has now
> recurred, which upgrades it from *observed once* to *systematic*; see §"The collision is now the
> headline".

## What this is

A third Discovery pass over the DX-5 Evidence Experience surface, dispatched with **the same context
hash as the two DX-5 passes before it** (`4624625b87d59bcce256b0a8746e7b72`). The hash is not stale
— it is identical, which means this is a re-dispatch of an assignment that has already been
completed twice, not a new version of it.

I re-derived every prior claim at source rather than trusting the write-ups. No product code was
changed.

## Headline

**All eight prior DX-5 findings hold at `7df89cf04`.** The prior passes cited `2a8d332a6`; the line
numbers are unchanged. Nothing has been fixed in the interval.

This pass adds **three findings the previous two did not reach**, all of them in the same direction:
the evidence pipeline discards the worker's own account of its work and substitutes an unconditional
success.

### F5 — The worker's self-assessment is collected, stored, and then discarded (high) · **new**

This is the strongest form of F2, and it does not require the retry path at all.

The worker report contract asks for two fields that let a worker report failure:

- `criterion_evidence: [{criterion_id, status, evidence_ref}]` — per-criterion `met` / `partial` /
  `unmet` / `not_evidenced` (`connectors/claude-connector.mjs:66`; the four-value vocabulary is
  spelled out at `mission-executor.mjs:104`);
- `deliverables: [{id, produced, path}]` — including `produced: false`
  (`claude-connector.mjs:65`).

Both are parsed and preserved. `claude-connector.mjs:348` maps `report.criterion_evidence` onto
`completionPackage.validation`; `:358` sets `completionPackage.deliverables`.

**Neither field is ever read again.** An exhaustive sweep of every `pkg.` reference in
`assignment-dispatch.mjs` returns exactly seven consumed keys — `summary`, `filesModified`, `tests`,
`risks`, `followUp`, `recommendation`, `progressBoard` (lines 427, 440–441, 446–448, 450–451, 462,
471–472, 476, 933, 944–945, 948–949). `validation` and `deliverables` appear nowhere.

Instead, all three submission sites synthesize the result from the assignment's criteria list:

| Path | Line | What it writes |
|---|---|---|
| Claude primary | `assignment-dispatch.mjs:442-445` | every AC → `status: "met"` |
| Missing-evidence retry | `:473` | every AC → `status: "met"` |
| Decision-resume | `:946` | every AC → `status: "met"` |

So a worker that reports `AC1: unmet` and `D1: produced=false` is recorded as **all criteria met,
status complete**. The dishonesty is not the worker's — the worker told the truth and the pipeline
overwrote it. Note this makes F1's stub artifacts almost redundant: coverage would be
`passed` on the store side, and the completion record says `met` regardless.

### F2c — A third stub path, and the only unconditional one (high) · **new**

The prior pass found two stub paths and called them "both". There are **three**. The
decision-resume path (`assignment-dispatch.mjs:927-939`) is the worst of them:

- It attaches `log`, `notes` and `document` stubs **with no `has` check at all.** Compare the
  primary path at `:419-421`, which at least skips a type the worker actually supplied. The resume
  path fabricates all three every time, so a worker that returned real typed evidence gets
  duplicate manufactured artifacts alongside it, each linked to every AC (`:935`).
- It hardcodes `status: "complete"` (`:943`) and every criterion `"met"` (`:946`).
- It drops `tests`, `residualRisks` and `followUpItems` entirely — the same fidelity loss F2
  identified in the retry, on a path that runs after every operator decision.

That last point matters for sequencing: **the resume path is the one that runs when an operator has
just engaged with the mission.** It is the path where the evidence record is least trustworthy and
operator attention is highest.

### F6 — The DX-5 suite cannot catch any of this (medium) · **new**

The second DX-5 pass closed by asking whether `evidence-experience-dx5.test.mjs` already encodes the
F1 stub behaviour as *expected*, and named that the first task of the implementation phase. **It
does not, and the answer is available by reading.**

Every artifact the suite constructs is explicitly `createdBy: "fixture"` with
`environment: "fixture"` (`:105-141`). The suite imports and asserts only the presentation functions
— `classifyEvidenceCategory`, `comparisonRole`, `isFixtureOnly`, the strip and gallery VMs. It never
imports `assignment-dispatch.mjs`, never calls `submitWorkerCompletion`, and never exercises
`acceptanceEvidenceCoverage` against a synthesized stub.

The `isFixtureOnly` assertions (`:40-42`) confirm F1's step 4 from the other direction: the badge
fires on `environment: "fixture"` and `createdBy: "fixture"`, and the suite asserts
`isFixtureOnly({title: "Live shot", environment: "local"}) === false`. Dispatch stubs carry a worker
id or the Director actor and no environment, so they take exactly that `false` branch.

**Consequence:** the DX-5 suite passing is not evidence that DX-5 is sound. It tests the honest half
of the system against hand-built inputs while the dishonest half is unreachable from it. Any fix to
F1/F2/F5 needs a *new* test that drives the dispatch path, because no existing assertion will move.

## Prior findings — re-verified at `7df89cf04`

| Finding | Claim | Status |
|---|---|---|
| F1 | Stubs synthesized at `assignment-dispatch.mjs:418-434`, linked to every AC (`:429`) | **holds** |
| F1b | `createdBy: actor` (`:463`) renders as "Director" (`evidence-experience.mjs:319`) | **holds** |
| F2 | Gate checks type-existence only (`evidence.mjs:206-213`); retry always succeeds | **holds** |
| F2b | `blocked` (`:744`) → hardcoded `complete` (`:774`) while returning `waiting_for_operator` (`:787-790`) | **holds** |
| F3 | Contract at `claude-connector.mjs:64` has no `screenshots` field | **holds** |
| F3b | Compiler demands QA screenshots (`mission-package-compiler.mjs:127,134,147`) | **holds** |
| F4 | `filters` (`:613`), `previewAvailable` (`:329`), `certification` emitted; `viewEvidence` consumes none | **holds** |
| — | Coverage `passed` on any linked artifact with `exitCode == null` (`evidence.mjs:187-192`) | **holds** |
| — | `canCertifyMission` → `ready_to_merge` / `confidence: "high"` (`evidence.mjs:215-232`) | **holds** |

F4 re-read in full: `V2.viewEvidence` (`mission-control.js:2517-2607`) consumes `kinds`,
`primaryProof`, `sufficiency`, `pairs`, `groups`, `artifacts`, `coverage`. It uses `previewHref` +
`presentation` (`:2537`), not `previewAvailable`. `fixtureOnly` at `:2543` remains the only
provenance warning the UI can render, and `Proves:` at `:2550` still prints the worker's own
summary for stub artifacts.

## The collision is now the headline

DX-6's G3 predicted this and it has happened again. Four missions, one untracked path:

| # | Mission | Assignment | Subject |
|---|---|---|---|
| 1 | `msn_c947781b5daf016d39` | `asg_a05a429e591670` | DX-5 Discovery, 1st pass |
| 2 | `msn_60e52c33897bb52c3f` | `asg_d9ea312f66c53f` | DX-5 Discovery, 2nd pass |
| 3 | `msn_59c4b19c4a4f6af2df` | `asg_a172cc93a6cb63` | DX-6 Collaboration fixture |
| 4 | `msn_076d45d616043f0fdd` | `asg_952eb2f7bfb3fa` | DX-5 Discovery, 3rd pass — this document |

Two things are now clear that were not after one occurrence:

1. **Deliverable paths are not mission-scoped**, so unrelated missions collide by construction.
   `a.md` remains untracked in git, so every overwrite is unrecoverable and only a tool-level
   rejected-write check has prevented data loss twice.
2. **The dispatcher re-issues completed assignments at an unchanged context hash.** Passes 1, 2 and
   4 share `4624625b87d59bcce256b0a8746e7b72`. The completion contract instructs the worker not to
   begin if the hash is stale — but it gives no instruction for a hash that is *current and already
   satisfied*, which is the actual failure mode here. Three workers have now done the same discovery
   three times.

The accretion strategy is also reaching its limit: preserving each pass has grown this file past 400
lines before my contribution, and a fifth mission inherits all of it. Preserving is still correct —
the alternative is unrecoverable loss — but it is a workaround for a dispatcher defect, not a
resolution.

## Recommendation

The first two items are new and cheap; items 3–6 restate the standing DX-5 recommendation, which
remains unactioned after three passes.

1. **Read `pkg.validation` and `pkg.deliverables`** instead of hardcoding `"met"` at
   `assignment-dispatch.mjs:442-445`, `:473` and `:946` (F5). This is the single highest-value fix
   in the file: the honest data is already parsed and sitting on the completion package. Falling
   back to `"met"` only when the worker supplied nothing would preserve current behaviour for silent
   workers while letting truthful ones be heard.
2. **Add the `has` guard to the resume path** at `:927-939`, and stop it dropping
   `tests` / `residualRisks` / `followUpItems` (F2c).
3. **Provenance flag at attach time** for synthesized records, surfaced via the existing
   `fixtureOnly` badge path — fixes F1b's mis-attribution to "Director".
4. **Stop stubs counting as acceptance coverage** in `acceptanceEvidenceCoverage` (F1).
5. **Extend the worker contract** with optional `screenshots: [{path, title, description}]` so F3's
   existing plumbing (`execution-evidence.mjs:106`) has a source and compiler AC3/EV3 becomes
   satisfiable.
6. **Mission-scope deliverable paths, or refuse to assign an existing untracked output** (G3), and
   **refuse to re-dispatch a completed assignment at an unchanged context hash**.

Any fix to 1–4 must ship with a test that drives the dispatch path — the existing DX-5 suite cannot
observe these behaviours (F6).

Items 1–4 are behavioural and touch completion/coverage semantics. They sit outside DX-5's original
"presentation only" constraint and want explicit approval before implementation.

## Open question for the operator — escalation

Per the prohibited-changes clause, I am escalating rather than reinterpreting intent. Reality
diverges from the assignment in two ways at once:

- **(a)** This is the third dispatch of an already-completed DX-5 Discovery assignment at an
  unchanged context hash, into a deliverable path already occupied by three other missions. If that
  is unintentional, the dispatcher's re-issue and path-collision behaviour is the finding, and
  mission intake wants a guard before more worker time is spent re-deriving the same eight defects.
- **(b)** The standing question from pass two is still unanswered and still blocking: **is this
  mission authorised to change evidence provenance and acceptance-coverage semantics?** F1, F2 and
  F5 cannot be fixed inside a presentation-only constraint — they live in the attach pipeline, the
  coverage calculation and the completion writer. Three Discovery passes have now produced the same
  recommendation and stopped at the same gate. A fourth pass will produce it again.

I would treat (b) as the decision that unblocks the mission.

## Verification status

No product code was modified.

Every finding above is anchored to a file and line **read directly during this pass** at
`7df89cf04`, and each prior finding was re-checked at its cited location rather than carried
forward on trust.

`node scripts/local-dev/tests/evidence-experience-dx5.test.mjs` was **declined by the sandbox**, as
in all three prior passes. **Four consecutive Discovery assignments have now been unable to run the
suite covering their own subject.** This pass reduces the cost of that gap — F6 establishes by
reading that the suite could not have confirmed or refuted F1/F2/F5 even had it run — but the
governance point stands and is now four-for-four. These suites are self-isolating; allowing
discovery workers `node scripts/local-dev/tests/*` remains a cheap, low-blast-radius change that
would raise the evidence grade of every Discovery deliverable.

The live evidence store for this mission was not inspected; as recorded by the DX-6 pass, mission
state lives under an `ALLOY_RUNTIME_ROOT` not reachable from this worktree. All store-shape claims
are read from code. The four-way path collision is the exception — it is directly observed in the
working tree.

---
---

# Appendix — preserved: prior occupants of `a.md`

> Retained verbatim. The document below belongs to mission `msn_59c4b19c4a4f6af2df` (DX-6
> Collaboration fixture) and carries its own appendix preserving DX-5 pass two
> (`msn_60e52c33897bb52c3f`). Both are untracked in git and reproduced without alteration.

# DX-6 Collaboration fixture — Discovery

**Mission:** `msn_59c4b19c4a4f6af2df` · **Assignment:** `asg_a172cc93a6cb63`
**Phase:** Discovery · **Context:** v1 `7925190b4920d87d78a39ed7154312b9`
**Base branch:** `agent/cursor/5-governed-approval-complete` (`2a8d332a6`)
**Operator guidance carried into this assignment:** `[feedback] Keep architecture; simplify role editor.`

> **This file is contested.** Three missions have written to `a.md` on this branch. This document is
> DX-6's Discovery deliverable; the DX-5 Evidence Experience pass that occupied the path immediately
> before it is preserved verbatim in the appendix. See finding **G3** — the collision is itself one
> of this pass's findings, and I observed it happen live.

## What this is

A read-only trace of how Director Collaboration guidance persists — from the operator typing it in
the mission conversation, through storage, into the worker handoff. AC1 is *"Guidance persists"*,
so the chain itself is the subject. No product code was changed.

## Headline finding

**This assignment is the DX-6 unit-test fixture, dispatched as a live mission.**

`scripts/local-dev/tests/director-collaboration-dx6.test.mjs:97-116` constructs a brief that matches
this assignment field for field:

| Assignment field | Value I received | Fixture source |
|---|---|---|
| Mission title | `DX-6 Collaboration fixture` | `:98` |
| Objective | `Discover` (phase `p1`) | `:102` |
| Required outputs | `a.md` | `:102` |
| Acceptance criteria | `AC1 — Guidance persists` | `:104` |
| Operator guidance | `Keep architecture; simplify role editor.` | `:111-116` |

That is not a coincidence of phrasing — it is the same brief, including the deliberately thin
objective string `"Discover"` and the single-letter deliverable. So this run is best read as an
**end-to-end exercise of the DX-6 persistence chain against the real dispatcher**, rather than a
product mission with substantive scope. I have executed it as specified and report the chain below;
§"Open question" asks the operator to confirm that reading rather than assuming it.

## AC1 — Guidance persists: **met**, and this session is the evidence

The strongest available proof is the assignment prompt that opened this session. It contains:

```
## Open operator guidance (from mission conversation)
- [feedback] Keep architecture; simplify role editor.
```

That string was written into a store by the Director, survived a process boundary, and was
re-serialized into a worker prompt in a different process. The chain, read at source:

| # | Hop | Code |
|---|---|---|
| 1 | Operator text classified as guidance, entry created | `mission-conversation-director.mjs` → `createCollaborationEntry` |
| 2 | Append to mission-scoped JSON store + JSONL audit + timeline event | `mission-collaboration.mjs:135-195` (`DIR` at `:21-23`, paths at `:71-77`) |
| 3 | Context package selects open guidance | `mission-context.mjs:53-62` |
| 4 | Serialized into the worker prompt | `worker-assignment.mjs:334-338` |
| 5 | Rendered back to the operator | `presentation/director-collaboration.mjs:110-166`; L1 strip at `:169-187` |

The architecture is sound and worth keeping — append-oriented, closed type and status vocabularies
(`mission-collaboration.mjs:25-43`), audited transitions carrying `from`/`to`/`actor`/`note`
(`:200-233`), best-effort timeline coupling that cannot fail the write (`:183-193`), and a
presentation layer that projects decisions read-only without writing back (`director-collaboration.mjs:31-63`).
The findings below are about the **edges** of that chain, not its shape — consistent with the
operator's *keep architecture*.

### G1 — Guidance stops persisting the moment it is accepted (high)

`mission-context.mjs:54` selects `listCollaboration(missionId, { status: "open", limit: 20 })`.

`accepted` is the correct terminal state for guidance the team intends to follow. But an accepted
entry is no longer `open`, so **it silently drops out of every subsequent worker handoff.**

The DX-6 fixture demonstrates the exact shape. Entry `e2` — *"Simplify the role editor before
implementation."* — is created `open` (`director-collaboration-dx6.test.mjs:45-51`) and then flipped
to `accepted` (`:67-69`). After that transition it is still in the store, still on the dashboard via
`acceptedGuidance` (`director-collaboration.mjs:127-128`), and **invisible to the next worker.**

So guidance persists in storage and in the UI, but not in the handoff — and it is *endorsement* that
severs it. An operator who approves their own guidance thereby stops it travelling, with no signal
that this happened. Candidate fix: carry `open` **and** `accepted` at `mission-context.mjs:54`,
excluding only `rejected`, `superseded`, `resolved`. One predicate; no schema change.

### G2 — Collaboration entries typed `decision` never reach a worker (medium)

Two independent stores hold decisions:

- the decision runtime (`decisions.mjs`), which `mission-context.mjs:48` reads into
  `recordedDecisions`, filtered to `status === "answered"`;
- the collaboration store, which can itself hold an entry of `type: "decision"`
  (`mission-collaboration.mjs:26`).

`mission-context.mjs:55` filters collaboration to `feedback`, `implementation_guidance`,
`revision_request`, `clarification`. `decision` is **not** in that list, and `recordedDecisions` does
not read the collaboration store. A Director-recorded collaboration decision therefore reaches
neither branch of the context package.

The fixture contains one: `e1`, *"Use canonical Person identity / Do not duplicate parent
identities."* (`director-collaboration-dx6.test.mjs:33-40`), created directly as `accepted`. It
renders on the dashboard and is never handed to anyone who could act on it.
`projectDecisionsAsCollaboration` (`director-collaboration.mjs:31-63`) flows decisions →
collaboration for *display* only; nothing flows the other way. Note this compounds with G1: an entry
created `accepted` is excluded twice over.

### G3 — Deliverable paths are not mission-scoped, and missions are overwriting each other (high) · **observed**

`a.md` is specified as a bare relative path with no mission, phase, or assignment prefix. **Three
missions on this branch have written to that one path**, two of them during this session:

| Mission | Assignment | Subject |
|---|---|---|
| `msn_c947781b5daf016d39` | `asg_a05a429e591670` | DX-5 Evidence Experience — Discovery (1st pass) |
| `msn_60e52c33897bb52c3f` | `asg_d9ea312f66c53f` | DX-5 Evidence Experience — Discovery (2nd pass) |
| `msn_59c4b19c4a4f6af2df` | `asg_a172cc93a6cb63` | DX-6 Collaboration fixture — this document |

This is not inferred. I read the first DX-5 pass at the start of this session; when I went to write
my own deliverable, the write was rejected because the file had changed underneath me — a **third**
mission had replaced it mid-session. The DX-5 second pass was a deliberate supersede of the first
(it says so at its own line 7 and re-derived every claim), so that particular overwrite was
intentional. Mine would not have been: DX-6 and DX-5 are unrelated missions that happen to share a
deliverable name.

`a.md` is also untracked in git, so **every one of these overwrites is unrecoverable.** Only the
editor's rejected-write check stopped this pass from silently destroying the DX-5 work; I preserved
it in the appendix instead. That check is a last line of defence in one tool, not a property of the
system.

Two fixes, either sufficient:

- resolve required outputs under a mission-scoped directory (e.g. `docs/.../<missionId>/a.md`); or
- have the dispatcher refuse to assign a required output that already exists and is untracked,
  surfacing it to the operator as a collision.

### G4 — Guidance is truncated at four different limits, silently (low)

Body length is capped at 4000 on write (`mission-collaboration.mjs:161`), 600 into the worker context
package (`mission-context.mjs:60`), 400 into the Director's conversational context
(`mission-conversation-director.mjs:153`), 180 into the timeline detail (`mission-collaboration.mjs:188`),
and 100 in the L1 summary line (`mission-conversation-director.mjs:539`). No surface signals that
truncation occurred. Long guidance reaches the worker cut mid-sentence with no marker, and the worker
cannot distinguish a complete instruction from a clipped one. A trailing `…` plus a `truncated: true`
flag on the projected object would resolve it.

### G5 — Discovery workers cannot run the suites that would verify their findings (medium, recurring)

`node scripts/local-dev/tests/director-collaboration-dx6.test.mjs` was declined by the sandbox in
this session. The DX-5 first pass recorded the identical wall; the DX-5 second pass recorded it again
across *three* attempts (appendix, *Verification status*).

**Three consecutive discovery assignments have now produced findings that could not be
test-confirmed** — in a repository where the relevant suites are explicitly self-isolating. The DX-6
test points `ALLOY_RUNTIME_ROOT` at a fresh `mkdtemp` before importing anything
(`director-collaboration-dx6.test.mjs:10`) and touches no shared state. Allowing discovery workers
`node scripts/local-dev/tests/*` is cheap, carries no blast radius for these suites, and would
materially raise the evidence grade of every Discovery deliverable.

## On the operator guidance itself

*"Keep architecture; simplify role editor."* — read against this codebase, the two halves land in
different places:

- **Keep architecture** is satisfied by construction. Nothing in G1–G5 requires a schema, store, or
  lifecycle change; G1 and G2 are one-line predicate widenings in `mission-context.mjs`.
- **Simplify the role editor** refers to the access surface, not to DX-6:
  `web/components/adminV2/settings/access/AccessUsersConfigurationPage.tsx` (**1,645 lines**),
  supported by `web/lib/access/capabilityMatrix.ts` and `capabilityTaxonomy.ts`. Single-surface
  invariants are already asserted at `web/tests/access/roleEditorSingleSurface.test.ts` and
  `oneRoleEditorPage.test.ts`, with a Playwright certification at
  `certification/playwright/access-role-editor-one-page.cert.spec.ts` — so a simplification pass has
  guardrails waiting for it.

That work is **out of scope for this assignment** (scope is `a.md`; the phase objective is
Discovery). I am recording the entry points so the guidance does not have to be re-derived. One
caution for whoever picks it up: this same directive is already tracked in the access corpus as
decision `AD-25` (`docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md:2285`),
where it is described as *"the decision that governs both operator directives, and it is gated by
nothing"* — unresolved there, and now duplicated here as live mission guidance. Reconcile the two
rather than opening a third thread.

## Recommendation

Cheapest and highest-honesty first:

1. **`mission-context.mjs:54` — carry `accepted` guidance, not just `open`** (G1). Stops endorsement
   from silently unbinding guidance.
2. **Mission-scope required-output paths, or refuse to clobber an existing untracked deliverable**
   (G3). This has already come within one tool-level guard of destroying a completed deliverable.
3. **`mission-context.mjs:55` — include `decision` collaboration entries, or merge them into
   `recordedDecisions`** (G2).
4. **Allow `node scripts/local-dev/tests/*` for discovery workers** (G5).
5. **Mark truncation** rather than clipping silently (G4).

Items 1–3 change what workers are told, not how the system is built — consistent with *keep
architecture*. They are still behavioural and want explicit approval before implementation.

## Open question for the operator

This assignment is the DX-6 test fixture running against the live dispatcher (headline finding).
Please confirm which is intended:

- **(a)** A deliberate end-to-end validation of guidance persistence — in which case AC1 is met, the
  chain works, and G1–G5 are the return on the exercise; or
- **(b)** A fixture brief that escaped into real dispatch — in which case a dispatcher that accepts a
  brief whose objective is the single word `"Discover"` and whose deliverable is `a.md` is itself the
  finding, and mission intake wants a guard.

I did not reinterpret mission intent either way. Reality diverged from a normal product assignment,
so I am escalating rather than assuming, per the assignment's prohibited-changes clause.

## Verification status

No product code was modified.

`director-collaboration-dx6.test.mjs` and `mission-conversation-v3-4.test.mjs` were **not
executed** — the sandbox declined the `node` invocation (G5). Every finding above is anchored to a
file and line that was read directly during this pass at `2a8d332a6`. AC1's evidence is the
assignment prompt of this session, which is independent of any test run.

The live collaboration store for `msn_59c4b19c4a4f6af2df` could **not** be inspected. The default
runtime root `~/.local/state/alloy-dev/vacilando/` contains only `control-plane-health.json`,
`director-capabilities.json` and `repositories.json` — no `missions/`, `assignments/` or
`collaboration/` directories, and no store file for this mission. This session's mission state lives
under a different `ALLOY_RUNTIME_ROOT` not reachable from this worktree. Store-shape claims above are
therefore read from code, not confirmed against live data; the G3 collision is the exception, being
directly observed in the working tree.

---
---

# Appendix — preserved: prior occupant of `a.md`

> Retained verbatim per **G3**. This document belongs to mission `msn_60e52c33897bb52c3f`,
> assignment `asg_d9ea312f66c53f` (DX-5 Evidence Experience), and was untracked in git — overwriting
> it would have been unrecoverable. It is unrelated to the DX-6 mission above and is reproduced here
> without alteration. It in turn superseded an earlier DX-5 pass (`asg_a05a429e591670`) on this same
> path.

# DX-5 Evidence Experience — Discovery

**Mission:** `msn_60e52c33897bb52c3f` · **Assignment:** `asg_d9ea312f66c53f`
**Phase:** Discovery · **Context:** v1 `4624625b87d59bcce256b0a8746e7b72`
**Base branch:** `agent/cursor/5-governed-approval-complete` (`2a8d332a6`)

Supersedes the earlier Discovery pass on this file (`asg_a05a429e591670`, same context hash).
That pass reasoned from reading; this one re-derived every claim at source. All five prior
findings **hold at the cited lines**. Three further defects are added (F2b, F3b, F1b) that the
first pass did not reach.

## What this is

A read-only survey of the shipped DX-5 Evidence Experience surface, looking for the gap between
what the Evidence gallery *shows an operator* and what the mission pipeline *actually produces*.
No code was changed.

## What was inspected

| Area | File |
|---|---|
| Presentation adapters | `scripts/local-dev/lib/vacilando/presentation/evidence-experience.mjs` |
| Storage + coverage + certification | `scripts/local-dev/lib/vacilando/evidence.mjs` |
| Claim-vs-proof reconciliation | `scripts/local-dev/lib/vacilando/deliverable-evidence.mjs` |
| Evidence producers | `scripts/local-dev/lib/vacilando/assignment-dispatch.mjs`, `execution-evidence.mjs` |
| Worker report contract | `scripts/local-dev/lib/vacilando/connectors/claude-connector.mjs` |
| Mission compilation | `scripts/local-dev/lib/vacilando/mission-package-compiler.mjs` |
| HTTP surface | `scripts/local-dev/lib/vacilando/v2-api.mjs` |
| Gallery UI | `scripts/local-dev/apps/vacilando/public/mission-control.js` (`V2.viewEvidence`, L2517-2607) |
| Prior QA | `docs/platform/planning/vacilando-os/qa/director-experience-v2/DX5-EVIDENCE.md` |

## Headline finding

**The DX-5 presentation layer is honest. Its inputs are not.**

`evidence-experience.mjs` is careful by design — deterministic classification, no AI captions, no
invented sufficiency score, before/after pairing only on explicit roles, `unclassified` rather
than a guess. That discipline is real and worth keeping.

But the gallery renders whatever is in the evidence store, and the dispatch pipeline
**manufactures evidence records to satisfy the completion gate**. The operator cannot tell a
manufactured record from a captured one.

### F1 — Self-attested stubs are indistinguishable from real proof (high) · verified

`assignment-dispatch.mjs:418-434`, under the comment *"Guarantee core evidence types for
validation"*, synthesizes `log` / `notes` / `document` artifacts whenever the worker did not
supply them. Their `description` is the worker's own `pkg.summary` — the claim restated as an
artifact — and they inherit `acceptanceCriteriaIds: assignment.acceptanceCriteriaIds` (L429), so
each stub is linked to **every** acceptance criterion on the assignment.

The consequence chain, each step read at source:

1. `acceptanceEvidenceCoverage` (`evidence.mjs:187-192`) marks a criterion `passed` when *any*
   linked artifact exists and none carries a non-zero `exitCode`. Stubs have `exitCode: null`,
   and `hasFail` (L189) explicitly requires `a.exitCode != null`.
2. `canCertifyMission` (`evidence.mjs:215-232`) then returns `ready: true`, `confidence: "high"`,
   `directorRecommendation: "ready_to_merge"`.
3. DX-5's `evidenceSufficiencyVm` emits *"Linked acceptance criteria have attached evidence"*
   (`evidence-experience.mjs:427`).
4. `isFixtureOnly` (`evidence-experience.mjs:91-98`) does **not** flag them — `createdBy` is the
   worker/Director actor, `environment` is unset — so no "Fixture-only evidence" badge appears
   (the badge is the only provenance warning `mission-control.js:2543` can render).
5. `provesText` feeds `proves` (L314) from `description`, so the card literally reads
   *"Proves: \<the worker's own summary\>"* at `mission-control.js:2550`.

**F1b — the Director attribution reads as authority, not as a stub.** The second stub path
(L455-466) sets `createdBy: actor`, and the card VM maps that to the display string **"Director"**
(`evidence-experience.mjs:319`). So the least-substantiated artifact in the store — one invented
purely to clear a gate — is presented to the operator as having been produced by the Director.
Provenance is not merely missing here; it points the wrong way.

DX-5 is not the cause, but DX-5 is where the operator sees the result.

### F2 — The required-evidence gate cannot block (high) · verified

`submitWorkerCompletion` rejects with `missing_evidence`. Both dispatch paths respond by attaching
a stub for each missing type and immediately re-submitting:

- `assignment-dispatch.mjs:455-479`
- `assignment-dispatch.mjs:758-785`

`missingRequiredEvidence` (`evidence.mjs:206-213`) checks only that an artifact *of that type
exists* (`have` is a `Set` of `a.type`, L211), so the retry always succeeds. The gate is a
formality.

Worse, the retry loses fidelity the first submission had. At L747-750 acceptance results are
`result.ok ? "met" : "partial"`; on retry (L777-780) they are hardcoded `"met"`, and
`recommendation` is hardcoded `"Accept deliverable"` (L782) regardless of `result.ok`. The first
path degrades the same way: L446-448 pass `tests`, `residualRisks` and `followUpItems`; the retry
at L467-478 drops all three.

**F2b — a run that stopped to ask the operator a question can be recorded as complete.** The
first submission sets `status: result.status === "waiting_for_operator" ? "blocked" : "complete"`
(L744) and records the residual risk *"Provider waiting on operator"* (L752). The retry hardcodes
`status: "complete"` (L774) and carries no residual risks. So when a provider pauses for a
decision *and* returns no typed evidence, the persisted completion record says complete / all
criteria met / accept — even though the function goes on to return
`{ ok: false, error: "waiting_for_operator" }` three lines later (L787-790). The dispatch result
and the stored completion record disagree, and DX-5 renders the record.

### F3 — Screenshot-first design has no screenshot producer (medium) · verified

The whole gallery hierarchy ranks `product` (screenshots/video) first — `EVIDENCE_CATEGORIES`,
`hierarchyRank`, `primaryProof`, `preview`. Yet the only code path that ever attaches
`type: "screenshot"` is `execution-evidence.mjs:106-117`, which requires the worker completion
package to contain `tests.screenshots[]` with paths that exist on disk.

The worker report contract published in the assignment prompt
(`connectors/claude-connector.mjs:64`) has no `screenshots` field — its `tests` shape is
`{"ran": boolean, "results": string}`, and L347 maps `report.tests` straight through. **Workers
are never asked for screenshots, so they never supply them.** This is the mechanical cause of the
DX5-EVIDENCE.md known limitation *"Live Mission 2 has no screenshot artifacts — visual/product
proof is fixture-certified."* Every live mission will hit it; the `no_screenshot` warn statement
fires permanently, and operators learn to ignore it.

**F3b — the compiler demands the evidence the contract cannot carry.** Compiled implementation
missions ship a hard QA criterion: `AC3` = *"Browser QA was performed and screenshots captured
under `<qaDir>`"* with `evidence_required: ["qa_evidence"]`, plus `EV3` (*QA screenshots*, bound to
AC3) and deliverable `D2` (`mission-package-compiler.mjs:127`, `:134`, `:147`). So the mission
contract requires screenshot proof, the worker prompt provides no channel to return it, and F1's
stub then marks AC3 `passed` anyway. That is the full loop: a criterion that *cannot* be satisfied
is nonetheless certified `ready_to_merge` with `confidence: "high"`.

### F4 — Emitted VM fields the UI never consumes (low) · verified

`evidenceExperienceGalleryVm` returns `filters` (`evidence-experience.mjs:613`), per-card
`previewAvailable` (L329), and a full `certification` object (L612). `V2.viewEvidence`
(`mission-control.js:2517-2607`) consumes `kinds`, `primaryProof`, `sufficiency`, `pairs`,
`groups`, `artifacts` and `coverage` — and none of those three. There is no category filter
control in the UI at all, despite seven categories being emitted. Either wire them or drop them;
today they read as shipped features that are not shipped.

## Recommendation

Treat F1/F2 as the mission's real subject. DX-5 does not need more chrome; it needs its inputs to
be trustworthy. Suggested sequencing for the implementation phase:

1. **Provenance flag at attach time.** Mark synthesized records (`attestation: "self_reported"`,
   or a distinct `createdBy`) and give DX-5 a visible badge, reusing the existing `fixtureOnly`
   presentation path. Cheapest change with the largest honesty gain — and it fixes F1b's
   mis-attribution to "Director".
2. **Stop stubs from covering acceptance criteria.** `acceptanceEvidenceCoverage` should not count
   a self-attested artifact as `passed`. This is the change that stops `confidence: "high"` on
   zero real proof.
3. **Fix the retry fidelity loss** at `assignment-dispatch.mjs:467-478` and `:771-784` — do not
   upgrade `partial` → `met`, do not upgrade `blocked` → `complete` (F2b), do not hardcode
   `Accept deliverable`, and do not drop `tests` / `residualRisks` / `followUpItems`.
4. **Extend the worker report contract** (`claude-connector.mjs:64`) with an optional
   `screenshots: [{path, title, description}]`, so F3's plumbing — already built at
   `execution-evidence.mjs:106` — has a source, and compiler AC3/EV3 becomes satisfiable.
5. **Wire or remove** the `filters` / `previewAvailable` / `certification` fields.

Items 1–3 are behavioural and touch scoring/certification — they are outside DX-5's original
"presentation only" constraint and need explicit approval before implementation. Item 4 is
additive (optional field) and does not change existing semantics.

## Open question for the operator

DX-5 shipped under a hard constraint: *storage schema, certification, scoring and lifecycle
unchanged*. F1 and F2 cannot be fixed inside that constraint — they live in the attach pipeline
and the coverage calculation. Confirm whether this mission is authorised to change evidence
provenance and acceptance-coverage semantics, or whether it stays presentation-only and F1/F2 are
raised as a separate mission.

## Verification status

No code was modified, so no suite was at risk.

Every finding above is anchored to a file and line that was **read directly during this pass** and
is quoted accurately as of `2a8d332a6`.

The DX-5 automated suite (`scripts/local-dev/tests/evidence-experience-dx5.test.mjs`, present,
9.5 KB) was **not executed**: the `node --test` invocation was declined for approval by the
sandbox on three attempts, exactly as in the prior pass. This does not affect the findings — they
are static-read defects, not test-observed ones — but the suite remains unrun, and confirming
whether it already encodes the F1 stub behaviour as *expected* is the first task for the
implementation phase.
