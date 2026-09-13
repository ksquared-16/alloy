---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Governed Artifact Filing Contract V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `9619b8992`, with Migration Execution Outcome
(`70068fd5e`, carrying DevOps 10–1) merged in.

---

## 1. The defect: two fields, one ignored

Traced end to end:

```
readRequestShape          artifact_refs ← input.artifact_refs / artifactRefs / artifact
                          (never looks at inputs.queryArtifactPath)
validateAgainstRegistry   validateInputs({ ...inputs,
                            queryArtifactPath: artifactPathFrom(artifactRefs) })
                          ← OVERWRITES whatever the caller put in inputs
executeGovernedAction     queryArtifactPath: artifactPathFrom(rec.artifact_refs)
```

So a census filed with a correct `inputs.queryArtifactPath` and empty
`artifact_refs` had its supplied path **overwritten with null**, and was refused
`missing_query_artifact` — *"queryArtifactPath required"* — **naming the single
field the filer had in fact set.**

Measured:

```
gar_ba8bf10667c02e   artifact_refs []                 inputs.queryArtifactPath correct   → failed
gar_23153a44c824cb   artifact_refs []                 inputs.queryArtifactPath correct   → failed
gar_53dffb1fdeffcb   artifact_refs ["certification/…"] same path                         → complete
```

**Filing contract ≠ execution contract.** Not lane scoping — DevOps 6 had
already ruled that out, and nothing here contradicted it.

## 2. The fix, at the earliest canonical boundary

Two changes, both small.

**The registry declares what execution reads.** `database.read_census` now
carries `requiresArtifactRef: true` and `artifactInputKeys: ["queryArtifactPath",
"query_artifact_path"]`. Before this, nothing connected the field the executor
resolves from to the field a caller is most likely to set.

**The filer normalises once, before persistence.** If an action requires an
artifact reference and `artifact_refs` is empty, the declared input spelling is
promoted into `artifact_refs`. If neither exists, filing **refuses** with
`missing_canonical_artifact_reference` and a message naming the canonical field.

The fix is deliberately **not** in the executor. Teaching execution to search
alternate input fields would preserve the ambiguity and give the policy evaluator
and the executor two places to disagree about which artifact is being run.

> **This is a promotion, not a default.** It carries forward a path the caller
> explicitly named and invents nothing when none was given. That distinction is
> load-bearing: an earlier fallback at this very boundary silently substituted
> the Q15 authority census for requests naming no query at all
> (`gar_a1d647be39e8b6`), and a privileged read whose subject is guessed is not a
> governed action. A control asserts no default artifact can reappear here.

## 3. Fail-closed, before execution scheduling

A request that cannot execute is **never persisted as executable** — `out.request`
is undefined on refusal — so there is no record for an approval to accept later.
Empty and whitespace paths do not normalise. Paths escaping the worktree and
paths that do not exist still refuse on their own merits, *after* normalisation,
through the guards that already existed.

## 4. Census gates: scoped to what this base actually has

> **A correction I had to make to my own test.** I first asserted the named
> `census_is_read_only_mode` / `census_artifact_validates` delegation gates. They
> do not exist on this base — they ship with the Governance V1 candidate
> `16601e54f`, which `git merge-base --is-ancestor` confirms is **not** in this
> chain. Asserting another mission's unmerged work would have been a test that
> passed for the wrong reason or failed for a reason unrelated to this fix.

What this base applies to a census artifact is the registry's own set, and those
are what the control now pins: a named artifact is required, it must exist, it
must be inside the originating worktree, it must carry SQL, and it is **pinned by
hash** — *"Committed query hash does not match artifact contents."* The control
additionally proves those gates evaluate the **same persisted path** the executor
resolves, so there is no policy/executor split-brain. Normalisation is proven not
to change the mode or the target the gates bind to.

## 5. Other artifact-bearing actions

`database.read_census` is the **only** action whose execution resolves from
`artifact_refs` — verified by grepping the executor dispatch. The migration
actions carry `migrations: [{version, path}]` resolved from the git object store,
not from artifact refs.

The structural control does not hard-code that. It finds the executor's
artifact-consuming dispatch, and for each consumer asserts the definition
declares `requiresArtifactRef` with input spellings — so a future artifact-bearing
action cannot be registered with the filer writing one field and the executor
reading another. It also asserts it found at least one consumer, so the control
cannot quietly go to sleep.

## 6. Durability and async acceptance

`artifact_refs` are worktree-relative paths, and the guards require the artifact
to resolve **inside the originating worktree**. The interaction with DevOps 3
worktree reclamation is therefore real but bounded: retirement requires the
worktree to be idle with no active run, and a filed-but-unexecuted governed
action belongs to a run. That protection is documented here rather than
redesigned — no evidence yet shows an accepted census outliving its worktree, and
converting refs to durable attachments is a storage change this mission's
evidence does not justify.

The async-acceptance ordering is satisfied structurally: normalisation and
validation happen at filing, before any record exists to accept, so an approval
can never outrun the artifact reference.

## Certification

`artifact-filing-contract` — **19 passed, 0 failed**, covering the real incident
shape, both input spellings, canonical refs winning over input paths, refusal at
filing with a message naming the canonical field, empty/whitespace rejection,
boundary and existence guards, policy/executor agreement on one identity, the
census gates on this base, the structural contract guard, a non-artifact action
unaffected, and async acceptance.

Regression green: `governed-action-handoff` 15/0, `development-governed-approval`
38/0, `development-exact-authorization` 6/0, `census-fail-closed` 9/0,
`development-census-fail-closed` 6/0, `migration-execution-outcome` 24/0,
`development-production-apply-owner` 28/0, `development-migration-parity` 37/0,
`control-plane-resilience` 46/0, `toolchain-canary` 49/0, `host-maintenance`
50/0, `promotion-train` 63/0, `agent-configuration` 31/0, `development-health`
30/0, `critical-invariants` 23/0, `lane-knowledge` 22/0.

`governed-action-request` is **15 passed / 5 failed on the pristine tree too**,
the same five tests — verified by setting this work aside and re-running. This is
the known baseline recorded in DevOps 5's `MEASURED_BASELINE` (14/6 then; staging
has since moved).

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No toolkit installed, no Gateway
restarted, no live database touched, soak evidence untouched.

## Remaining debt

- **`artifact_refs` remain worktree-relative pointers, not durable attachments.**
  Proven adequate under current lifecycle guarantees rather than redesigned. If a
  future path lets an accepted action outlive its worktree, this becomes real and
  the owner is the attachment store.
- **Normalisation provenance is recorded but not surfaced.**
  `artifactNormalizedFrom` is carried on the request shape; no evidence surface
  renders "this reference was promoted from an input" yet.
- **The other two failed census records were never re-filed.** This fixes the
  contract; `gar_ba8bf10667c02e` and `gar_23153a44c824cb` remain failed records
  and would need re-filing by their lanes after this candidate is installed.
