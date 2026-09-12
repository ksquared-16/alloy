# 08 — Reuse corpus confirmation

> **Confirmation record** for a `Confirm reused specification corpus` assignment. Answers the
> phase question (*do the accepted artifacts cover the Mission Brief?*) mechanically, and records
> where the dispatch that asked it came from, so the next worker to receive it does not repeat
> this investigation.
>
> Read [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) first — it is the
> substantive coverage audit. This file does not restate it.

**Assignment** `asg_7427151c543fa0` · **Mission** `msn_83dbd2706970c833d6` v1 · phase
`Confirm reused specification corpus` · **contentHash** `282eace8ea5a991546ba9e8b1c19fc7e`
**Worktree** `/Users/vacilando/Code/alloy-worktrees/attendance` @ `runtime/migration-target-resolution`
**Date** 2026-09-11
**Method** static, file-grounded. No code executed, no database, no browser. Mission state was
**not** reachable from this session (§5).

---

## 1. Verdict

**Corpus coverage: confirmed.** All twelve entries of
`ACCESS_IDENTITY_DELIVERABLE_CATALOG` (`scripts/local-dev/lib/vacilando/mission-compiler.mjs:74-181`)
resolve to a present accepted artifact in this worktree. Zero deliverables remain `to_execute`, so
the compiler's reuse-only precondition holds and **no new discovery work is warranted**.

**Dispatch provenance: not an operator brief.** Every field of this assignment is reproducible from
the unit-test fixture `sampleBriefBody()` (`scripts/local-dev/tests/mission-runtime.test.mjs:1569-1586`)
compiled through the Access & Identity reuse-only branch (§4). The confirmation above is true on its
own merits; the mission that asked for it is fixture-derived.

**The phase's acceptance criterion is not worker-closable.** `AC_reuse_confirmed` reads
*"**Operator** confirms accepted Access & Identity artifacts satisfy the Mission Brief without new
discovery"* (`../mission-compiler-v1/compiled-mission.msn_2d054741a54698fa4c.json:204-210`). A worker
can assemble and present the document evidence — this file — but the criterion is satisfied by
operator confirmation, not by the worker's claim.

## 2. Catalog resolution

Resolution follows `artifactPresent()` (`mission-compiler.mjs:183-196`): first listed path that
exists with `size > 200` bytes, resolved against the worktree root.

| # | Catalog deliverable | Resolved artifact | Bytes |
|---|---|---|---|
| d1 | Existing-state inventory | `docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d2 | Surface and capability access catalog | `…/vacilando-os/qa/access-identity-v2/05-command-enforcement-census.md` | 48,992 |
| d3 | Person ↔ user ↔ role ↔ scope model | `docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d4 | Authentication model | `…/vacilando-os/qa/access-identity-v2/04-authentication-model.md` | 78,307 |
| d5 | Effective-access resolution model | `docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d6 | Product IA and principal flows | `…/vacilando-os/qa/access-identity-v2/06-product-ia-and-flows.md` | 88,243 |
| d7 | Security threat and enforcement matrix | `docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d8 | Gap analysis | `docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` | 201,334 |
| d9 | Decisions requiring approval | `docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md` | 200,740 |
| d10 | Sequenced implementation / QA plan | `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |
| d11 | Director acceptance rubric | `…/vacilando-os/qa/access-identity-v2/07-director-acceptance-rubric.md` | 94,044 |
| d12 | QA and evidence plan | `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` | 424,091 |

**12 of 12 resolved · 0 remaining · 7 distinct artifacts** (`01`, `02`, `03`, `04`, `05`, `06`, `07`).
The catalog is a 1:1 restatement of the twelve outputs the operator brief names
([`00` §1](./00-mission-intake-and-coverage.md)), so catalog coverage is brief coverage.

## 3. What this confirms, and what it does not

`artifactPresent()` is a **presence test** — file exists, over 200 bytes. It is not a sufficiency
test, and the confirmation in §1 inherits that limit. Three consequences worth stating plainly:

- **A `reused` status cannot express "partial."** `partialOk: true` is declared on d2 and d7
  (`mission-compiler.mjs:93,137`) and **read nowhere in the toolkit** — a repo-wide search finds
  only those two declarations. Both deliverables are therefore emitted as fully `reused`.
- **So the one genuinely partial output is invisible here.** [`00` §3](./00-mission-intake-and-coverage.md)
  judges output #7 (security threat & enforcement matrix) **Partial** — enforcement is mapped and
  censused, but the threat model is excluded by `02…:674` and RLS policy review by `02…:676`, both
  deliberate non-goals of the brief. §2 above shows d7 `reused` regardless, because
  `01-existing-state-inventory.md` exists.
- **The substantive judgment is `00` §3, not this table.** Against that audit the corpus stands at
  **11 covered · 1 partial-by-design**. Nothing in this session re-verified the corpus's claims;
  this is a documentation audit of a documentation audit.

Coverage was assessed against these two directories only. Related material in other worktrees was
outside this session's reachable scope.

## 4. Where this dispatch came from

The assignment reproduces the test fixture exactly. Each fingerprint is verbatim and located:

| # | Assignment field | As received | Source |
|---|---|---|---|
| 1 | Mission title | `Brief Spine Mission` | the string's **only** occurrence in the repository is `tests/mission-runtime.test.mjs:1639` |
| 2 | Constraints | `No push without approval` | the fixture's sole constraint `C1`, `tests/mission-runtime.test.mjs:1581`; copied by `worker-assignment.mjs:61` |
| 3 | Prohibited changes | boilerplate line only, **no** implementation exclusion | the fixture objective is *"Ship Access & Identity V2 from the operator-owned plan"*, which fails `forbidsImplementation()` (`mission-compiler.mjs:203-206`). The real brief says *"Do not materially implement"* and would have carried `Out of scope: Implementation beyond disposable investigation tooling` (`mission-compiler.mjs:325-328`) |
| 4 | Phase title + objective | `Confirm reused specification corpus` / `No new discovery deliverables remain…` | `synthesizeAccessIdentityPhases()` reuse-only branch, `mission-compiler.mjs:251-261`, reachable because `isAccessIdentityBrief()` matches *"Access & Identity"* in the fixture objective |
| 5 | Scope + Acceptance criteria | both empty | structural, not truncation: `scope` filters deliverables to `status === "to_execute"` and every one is `reused` (`worker-assignment.mjs:108-111`); the reuse-only phase carries no `acceptanceCriteriaIds`, so `worker-assignment.mjs:129` yields `[]` |
| 6 | Required outputs | `- (document findings in the mission notes)` | the connector placeholder for an empty `expectedDeliverables`, `connectors/claude-connector.mjs:40` |

Fingerprint 3 is the discriminating one: a dispatch compiled from the operator's actual Access &
Identity brief **must** carry the implementation exclusion. This one carries the opposite — an
objective whose verb is *"Ship."*

Fingerprint 5 is worth separating from the fixture question, because it is a defect either way:
the compiled mission defines exactly one acceptance criterion, `AC_reuse_confirmed` with
`evidenceType: "document"`, and **the assignment builder never delivers it to the worker.** The
worker is asked to confirm coverage while being shown no criterion to confirm it against.

## 5. No filing channel existed for this assignment

The assignment carries no `run_id` and no lane, and the runtime offered nothing to bind to:

- `vac scoreboard` — `lanes 0 · executing 0`, `control plane no episode`,
  `idle: no_authorized_work — no schedulable candidate exists`.
- `alloy-worker-status` — all twelve slots free; no sprint holds this worktree.
- `vac reconcile` (read-only) — this worktree is among the unregistered ones
  (`adopt_live_unregistered_worktree`).
- `msn_83dbd2706970c833d6` appears nowhere in the repository.

So `vac run-report`, `vac checkpoint-create` and `vac governed-action` all require a run this
session does not have. Mission state itself was unreadable from here: the Gateway API on
`127.0.0.1:3030` returns `401 unauthorized` for `GET /api/missions/brief`, `alloy-ro` exposes no
mission verb, and direct reads of the runtime state tree are outside this session's sandbox. **The
fixture provenance in §4 is proven from source; the absence of a real brief behind the mission id
is inferred, not read.** That distinction matters and is not closed by this file.

## 6. Open items — none worker-resolvable

Carried from [`00` §8](./00-mission-intake-and-coverage.md), unchanged and still open:

1. **Recompile or close the Access & Identity mission** (operator decision). Leaving it dispatched
   keeps re-issuing confirmation assignments against a corpus that is already closed.
2. **Repair brief ingestion (M1/M2/M3)** — a phase objective must never be a truncated title, a
   multi-stage brief must not collapse to one unscoped phase, and a generated acceptance criterion
   must never carry `evidenceType: null`.
3. **Approve or amend D1–D8** — `02…` §14 and `04…` §4; implementation sequencing depends on them.
4. **Decide whether output #7 stays a non-goal.** If a true threat model is wanted, it is the one
   remaining discovery item.

New, from this session:

5. **Stop test fixtures from reaching dispatch.** A brief whose title, constraints and objective are
   a unit-test fixture body was compiled and dispatched to a worker seat (§4).
6. **Deliver `AC_reuse_confirmed` to the worker.** `synthesizeAccessIdentityPhases()` should set
   `acceptanceCriteriaIds: ["AC_reuse_confirmed"]` on the reuse-only phase, so the assignment is not
   shipped with an empty acceptance section (`mission-compiler.mjs:252-260`).
7. **Make `partialOk` mean something, or delete it.** As written it is dead metadata that lets a
   partially-covered deliverable report as fully reused (§3).

Items 5–7 are platform fixes in `scripts/local-dev/lib/vacilando/`; none were made by this phase.
**No source, schema, migration, or UI was changed.**
