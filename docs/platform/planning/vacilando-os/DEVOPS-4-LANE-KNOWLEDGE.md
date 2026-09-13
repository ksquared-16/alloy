---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# DevOps 4 — Lane Knowledge Base V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `f61185c25`, with DevOps 3 (`f59c0fca5`, carrying
DevOps 2 `db0033e12` and DevOps 1 `2eb5c3f27`) merged in as the first commit.

---

## 1. The audit: the store already existed and is good

`lane-memory.mjs` is the canonical lane-scoped durable store, and it was already
well built:

- `identity` is explicitly *"a POINTER SET"* because development-lane owns the
  lane — the exact no-second-authority discipline this mission demands.
- `mission`, `authorization`, `progress` (completed, decisions, **references not
  copies**), `dependencies`, `next_step`, `blockers`.
- `promotion_checkpoints`, bounded to 10, because *"full narratives live in the
  incident and findings owners and are referenced by id, never copied"*.
- `laneContextProjection` clips every list and reports what it clipped, because
  *"a projection that dumps the whole store is the transcript problem with extra
  steps"*.

Other authorities audited and left alone: `knowledge.mjs` (capability-scoped
document retrieval for product packages — a different concern), `decisions.mjs`,
`evidence.mjs`, `director-evidence.mjs`, the timeline and findings stores, run
completion/handoff reports, and `docs/platform/planning/vacilando-os/*`.

**No second store, registry or documentation system was created.**

## 2. What was actually missing

1. **Facts have no kind.** `progress.current_state` is a bare string;
   `identity.branch` and `identity.worktree_path` are bare values. Nothing
   records *when* a fact was observed, *what* observed it, or whether it can go
   stale — so every fact reads as eternally true.

   That is precisely the failure the brief names, and DevOps 3 measured the live
   version of it: a lane record claiming slot 8 that the registry had long since
   given to another worktree.

2. **No certification shape.** Evidence existed only as opaque refs, so "this was
   certified" could not say against *which* candidate, in *which* environment,
   running *which* suites.

3. **No contradiction check.** Nothing compared the record against what canonical
   owners currently say.

4. **Coverage.** Measured: **12 of 13 lanes have no record at all**, and the one
   that does predates any knowledge contract.

## 3. The fact model

| Kind | Rots? | Meaning |
|---|---|---|
| `DURABLE_DECISION` | no | What was decided and why, with alternatives rejected |
| `CURRENT_OBSERVATION` | **yes** | True when looked at; carries age, source, `requires_revalidation` |
| `EVIDENCE` | no | A claim about a moment — candidate, environment, suites, pre-existing failures |
| `PLANNED` | — | Intent, not fact |
| `CARRY_FORWARD` | — | Known remaining work, deferred deliberately |

`OBSERVATION_TTL_MS` is 12h — not a cache TTL, since nothing expires or is
deleted. It is the line past which a fact stops being *"what is true"* and becomes
*"what was true at 14:32 on Tuesday"*, which is a different claim and should read
as one. It matches the freshness boundary DevOps 2 measured.

An **unsourced** observation always requires revalidation: it is kept — losing a
fact silently is worse than carrying it with a caveat — but never trusted, because
nobody can be asked about it.

`pre_existing_failures` on the certification record exists because every mission
in this sequence has had to prove a red suite was already red on staging.
Recording them *with* the evidence means the next reader does not repeat that
work, and a **new** failure shows against a known baseline instead of
disappearing into it.

## 4. Location: two halves, one rule

```
REPOSITORY  docs/platform/planning/vacilando-os/lanes/<lane_id>.md
            DURABLE_DECISION · EVIDENCE · CARRY_FORWARD
            reviewable, diffable, travels with history

STATE ROOT  vacilando/lane-memory/lanes.json   (already exists)
            CURRENT_OBSERVATION · PLANNED
            machine-written, changes constantly, noise in a diff

RULE        Never both.
```

Both halves are keyed by **lane id** — the one identifier that outlives the
branch, the worktree, the slot and the session — and **neither touches the lane's
checkout**. A control asserts no path in the index contains `alloy-worktrees`,
because DevOps 3 certified that a durable lane survives worktree reclamation, so
knowledge anchored to a checkout is knowledge with an expiry date.

## 5. Canonical truth wins, visibly

`detectKnowledgeContradictions` compares recorded observations against what the
live owners say now. Every contradiction row carries
`resolution: "canonical_wins"` so no consumer has to remember the rule.

**Decisions are deliberately not compared.** A decision is a claim about what was
chosen and why, not about what is true now; "the state moved" is not evidence a
past decision was wrong, and auto-rewriting decisions when state changes would
erase exactly the reasoning worth keeping.

One subtlety the tests pin down: a canonical value of `null` — *"the registry
gives it to nobody"* — is **not** a contradiction. Absence of a canonical value is
not a competing claim.

## 6. Migration without fabrication

`seedLaneKnowledge` reads only what canonical owners can answer right now,
records each as a **sourced observation**, and marks everything else the string
`"UNKNOWN"` — not `[]`, because an empty list reads as *"there were none"*.

A reader can then tell *"this lane made no decisions"* from *"nobody has written
them down yet"*, which is what makes an incomplete knowledge base usable rather
than misleading. A fabricated decision is worse than a gap, because a gap is
obviously a gap.

## 7. Health

`lane.knowledge`, in the existing framework. **Severity is chosen so the check
survives being true**: 12 of 13 lanes have no record today, and a check that is
red from birth is a check nobody reads.

- `MISSING` / `SEEDED` / `STALE_OBSERVATIONS` → **watch**. Work to do, not damage.
  A fact needing revalidation is the model working as designed.
- **Contradiction** → **problem**. A written fact disagreeing with a canonical
  owner right now is the exact failure this subsystem exists to prevent.

Live: `watch · lanes 13 · MISSING 12 · UNCLASSIFIED 1 · contradictions 0`.

No polling loop was added. The module has **no writer of its own** — a control
asserts there is no `record*`/`write*`/`save*` export, and none of `setInterval`,
`writeFileSync`, `execFileSync` or `spawnSync` appears anywhere in it. It records
and reads; lane-memory's existing writer persists, at the lifecycle seams that
already exist.

## 8. Certification

`lane-knowledge` — **22 passed, 0 failed**, covering all sixteen required proofs:
deterministic index; survives worktree removal *and* a missing lane record;
mutable observations marked and revalidated; durable decisions surviving state
movement; certification bound to exact SHA/environment/evidence; compaction
preserving durable history; bounded resume (30 decisions → 8, 40 completed steps
clipped and reported); canonical truth winning with the contradiction visible;
unknown staying `UNKNOWN`; lanes unable to reach each other's knowledge; health
detecting missing and stale with survivable severities; and no new authority,
writer or loop.

Regression green across the DevOps 1/2/3 contracts, lane-memory, health,
durable-lane, worktree-retirement, branch-reconcile, slot-topology, placement,
control-plane, browser-auth, QA-slot-preflight and admission suites.

## 9. DevOps 5 — the invariant seam

DevOps 5 (Critical Invariants Pack) needs somewhere to record platform truths
that unrelated code must not break. It should use, and must not rebuild:

- **`durableDecision`** — an invariant *is* a durable decision with rationale and
  rejected alternatives. It does not rot when state moves, which is exactly the
  property an invariant needs.
- **`certificationRecord`** — an invariant pack is a named suite bound to a
  candidate and environment, with `pre_existing_failures` already modelled.
- **The repository half of the index** — invariants belong in the reviewable,
  diffable half that travels with code, not in machine-written runtime state.
- **`detectKnowledgeContradictions`** — the mechanism for "a written truth
  disagrees with the live system", which is what a violated invariant *is*.

**Not implemented here:** no invariant vocabulary, no pack definition, no
enforcement, no required-check wiring. The seam is exposed; the policy is DevOps
5's.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched,
and no lane's knowledge was written to the live store. Held with `16601e54f`,
`25c85997d`, `2eb5c3f27`, `db0033e12` and `f59c0fca5`; lands after DevOps 3 or
with the chain.
