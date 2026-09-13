---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# DevOps 6 — Promotion Train V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `aceef76bb`, with DevOps 5 (`3814d8073`,
carrying DevOps 4, 3, 2 and 1) merged in as the first commit.

Two things are delivered: a train that batches certified work into one staging
integration event, and the repair of a promotion gate that had made every
migration-bearing candidate unpromotable.

---

## Part 1 — Promotion gate correctness

### 1.1 The measured shape

Taken live on 2026-09-12 from the running toolkit `14b0e01dcd06` and the
Gateway's own evidence store:

```
PROMOTED_STAGING   413 identities   head 20260912010000
HOSTED  (census gar_970336346cc9ca, target alloy_deployed_primary)
                   413 total, 75 in the measured window, head 20260912010000
CANDIDATE (PR #848, d32f1982e)
                   414 identities   head 20260912020000

promoted_staging − hosted = {}
candidate − hosted        = {20260912020000}
hosted − staging          = {}
```

Nothing was owed. The gate denied anyway.

### 1.2 Root cause A — the lifecycle boundary

`trusted-host-merge.mjs` drew the migration requirement from
`contents/supabase/migrations?ref=${n.expectedHeadSha}` — the **candidate head**.
So the requirement included `20260912020000`, the candidate's own unmerged
migration, and the gate demanded it already be present on the deployed primary
before the candidate could merge.

The module's own prose had it right all along: `requiredVersionsFromFilenames` is
documented as reading "the **promoted** tree", and `migrationMergeGate` asks
whether "this **promoted** revision may become effective". Only the caller
disagreed, and nothing made the disagreement visible.

This is not a strict gate but an **unsatisfiable** one, and the system already
knew. `trusted-host-production-migrate.mjs` documents the identical cycle and
answers it with a pre-merge escape hatch in which a **refusal** becomes the
authority to deploy unpromoted schema to the production primary. A denial that
authorises a deployment is strong evidence the denial was wrong.

Reproduced against the running toolkit:

```
candidate-head requirement → blocked  "hosted head 20260912010000 is behind
                                       the required head 20260912020000"
staging-head requirement   → ok       "hosted head 20260912010000 satisfies
                                       the required head 20260912010000"
```

### 1.3 Root cause B — the evidence was never read at all

`runtimeRoot()` in `trusted-host-merge.mjs` returned
`~/.local/state/alloy-dev`. The governed-action store lives one level deeper, at
`.../alloy-dev/gateway/vacilando/governed-actions/requests.json`, and the shipped
config sets `ALLOY_RUNTIME_ROOT` to the parent. Measured on the running toolkit:

```
gate would read: ~/.local/state/alloy-dev/vacilando/governed-actions/requests.json
exists = false      records the gate sees: 0      proven head: null
verdict: unknown — "no census has positively established the hosted migration head"
```

The file imports `canonicalGatewayRuntimeRoot()`, which knows the right answer,
and kept a second, wrong copy beside it.

This is the more serious of the two, because it is **permanent**: running a fresh
census could never clear it, since no census was ever read. A completed census
sat in the store 42 minutes old while the gate reported it had none.

### 1.4 Root cause C — the defect had two copies

`trusted-host-repository-housekeeping.mjs: measureHostedMigrationParity` carried
the identical `ref=${n.expectedHeadSha}` bug, and **that** is the copy the policy
reads — so the `hosted_migration_parity` denial the Director saw came from there.
Fixing only the merge executor would have left the denial exactly where the
operator meets it.

Both copies now delegate to one owner in `migration-parity.mjs`, so there is
nothing left for a third copy to copy.

### 1.5 The corrected law

```
expected  = migrations(current promoted staging, read at the target branch)
candidate = migrations(candidate head)            reported, never required
actual    = the hosted ledger, as a census measured it

require expected ⊆ actual
```

- **Candidate-only migrations are reported and never demanded.** They cannot
  legitimately exist on the primary before they are promoted.
- **Hosted identities absent from staging are reported and do not block.**
  Nothing a candidate can do removes a row from a ledger, so blocking on them
  would be a second impossible precondition wearing the opposite coat.
- **Strictness is unchanged where it was real.** Promoted staging ahead of
  hosted still blocks — that was the first Attendance denial, and it was correct.

### 1.6 Evidence freshness: stale is not behind

An age limit alone cannot decide this. The hosted ledger was repaired **twice
inside one hour** on 2026-09-11 — 405→412 for D2, then 412→413 for W-17. A census
taken ten minutes before either repair was well inside the 24h window and wrong;
under the age rule it would have been served as current and a candidate denied
"hosted is behind" on the strength of it.

So freshness is time **and** supersession: evidence recorded before a completed
hosted-mutating governed action has been overtaken by a known event. Both are
read from records governance already writes.

```
fresh          → compare
expired (>24h) → STALE   blocks, and claims nothing about the database
superseded     → STALE   blocks, names the mutation that overtook it
no census      → UNKNOWN blocks
```

A stale verdict returns `missing_on_hosted: []` — a document that stopped
describing the database may not make claims about it — and surfaces as
`hosted_migration_evidence_stale`, not `hosted_migration_behind`. That
distinction matters twice over: the second code is what grants pre-merge
production apply authority, so reporting staleness as "behind" would hand out
that authority on the strength of a stale document.

### 1.7 Observability

Every parity verdict now carries `expected_revision`, `expected_revision_kind`,
`expected_migration_head`, `expected_migration_count`, `hosted_migration_head`,
`hosted_migration_count`, `missing_on_hosted[]`, `unexpected_on_hosted[]`,
`candidate_only_migrations[]`, `evidence_id`, `evidence_timestamp` and
`evidence_age_ms`. The Director never again receives only
`hosted_migration_behind`.

### 1.8 Cases A–H

| | Shape | Result |
|---|---|---|
| A | staging 100, hosted 100, candidate 100 | **PASS** |
| B | staging 100, hosted 100, candidate 101 | **PASS**, candidate_only [101] |
| C | staging 101, hosted 100, candidate 102 | **FAIL**, missing_on_hosted [101] |
| D | staging 101, hosted 101, candidate 102 | **PASS** |
| E | staging 101, hosted 101, candidate 102,103 | **PASS** |
| F | authoritative 101, cached 100, repair after census | **STALE**, never "behind" |
| G | staging = hosted = 20260912010000, candidate adds 20260912020000 | **PASS** |
| H | candidate identity below the promoted head | **PASS** — parity is silent; ordering is the migration system's |

`CASE G′` additionally pins the defect: the same shape measured against the
candidate head blocks with `missing_on_hosted = [20260912020000]`, which no
legitimate action could have satisfied before merge.

### 1.9 The systemic audit

`promotion-gate-contract.mjs` records, for each canonical gate, its **lifecycle
boundary**, **canonical owner**, **evidence source and freshness rule**, and the
fields it **explains** itself with. It evaluates nothing and owns no rule — the
gates keep their logic where it is.

| Gate | Boundary | Freshness | Circular |
|---|---|---|---|
| `hosted_migration_parity` | promoted_staging | recorded · 24h + not superseded | no |
| `expected_head_sha` | candidate | immediate | no |
| `required_checks` | candidate | immediate | no |
| `mergeable_state` | post_merge | immediate | no |
| `target_branch_allowlist` | candidate | immediate | no |
| `live_merge_permitted` | candidate | immediate | no |

`auditPromotionGates()` reports five defect classes generically —
undeclared boundary, reconstructed fact, recorded evidence with no freshness
rule, unexplainable gate, and **circular precondition** — and surfaces as the
`promotion.gates` health check. Live: **healthy · gates 6 · findings 0**.

The circularity rule is proven both ways: the corrected gate is not circular, and
the historical shape (`requires: promoted_staging, becomes_due: post_merge`),
retained in the manifest, **is**. A contract that cannot express the defect it
was built from cannot prove the defect is gone.

`mergeable_state` is deliberately `post_merge` and deliberately not circular: it
judges the *result* of merging, which GitHub computes without performing it. A
demand *about* a merge is not a demand that the merge already happened, and the
distinction is the whole difference between a strict gate and an impossible one.

### 1.10 Carry-forward findings

**A/B — migration apply vs. ledger recording.** `apply_promoted_migration`
**failed** at 01:29:45 while the schema landed; `repair_migration_ledger`
completed at 01:36:12 taking the ledger 412→413. The same shape had occurred at
23:24/23:37 for D2 (405→412). The lifecycle has no explicit state for *schema
applied, ledger not recorded*, so a partial success is reported as a failure and
the canonical repair path is discovered by hand each time.
**Owner:** `trusted-host-production-migrate.mjs` / migration executor.
**Recommended:** a mission modelling the partial outcome explicitly. Not fixed
here — it is a different owner and not narrow.

**C — `missing_query_artifact` is not lane-scoped.** Measured from the store:

```
gar_ba8bf10667c02e  artifact_refs = []                      inputs.queryArtifactPath = "certification/migrations/hosted-migration-identity-census.sql"  → failed "queryArtifactPath required"
gar_23153a44c824cb  artifact_refs = []                      same path                                                                                    → failed
gar_53dffb1fdeffcb  artifact_refs = ["certification/…"]     same path                                                                                    → complete
```

The executor reads `artifact_refs`; the filer set `inputs.queryArtifactPath`. The
refusal therefore names **the one field the filer did supply**. It is not stale
base, not lane-relative resolution, not artifact ownership and not capability
drift — the lane that "worked" simply happened to populate `artifact_refs`.
**Owner:** `governed-action-request.mjs artifactPathFrom` /
`trusted-host-action-registry.mjs resolvePathInsideWorktree`. **Recommended:** a
narrow fix accepting either spelling, or a refusal that names the field actually
required. Recorded, not fixed: it is outside promotion semantics.

**D — pre-merge production apply authority narrows.** Because the corrected gate
no longer emits `hosted_migration_behind` for a candidate-only migration, the
escape hatch in `trusted-host-production-migrate.mjs` is now unreachable *for
that reason* — correctly, since there is no longer a gap to close before merge.
It remains reachable when promoted staging is genuinely ahead. Left in place
deliberately; removing another owner's mechanism is not this mission's to do.

---

## Part 2 — The promotion train

### 2.1 The churn, measured

`origin/staging` first-parent history, 7 days to 2026-09-11:

```
140 merges          20.0/day, 40 on the busiest day
median spacing      20.0 minutes
97 of 139 gaps under 30 minutes; 116 under an hour
54 of 140 (39%)     re-merges of a branch already merged in the window
                    runtime/host-lifecycle-v1  4× in 45 minutes
                    runtime/failed-run-notification  2× in 8 minutes
```

**Vercel.** `web/vercel.json` sets `deploymentEnabled` for `staging`/`main` only
and skips every other ref through `scripts/vercel-ignored-build.sh`. One staging
merge is already exactly one staging deployment, so 140 merges were 140 builds
and **batching the merges is the entire fix**. No second deployment controller is
built and the existing ignore step is untouched — J answered by measurement
rather than by machinery.

### 2.2 Cadence, chosen rather than accepted

Timer-based simulation over the real 7-day history:

| cadence | trains | reduction | avg size |
|---|---|---|---|
| 20m | 84 | −40% | 1.67 |
| **30m** | **70** | **−50%** | **2.00** |
| 45m | 55 | −61% | 2.55 |
| 60m | 51 | −64% | 2.75 |
| 90m | 38 | −73% | 3.68 |

On the busiest day 30m gives **−60%** (40 merges → 16 trains).

**30 minutes is adopted — and not because it was suggested.** On throughput alone
45m is the better trade: it halves the deployments again for fifteen more minutes
of waiting. It is rejected because the cost of a *failed* train is paid in
candidates, and every candidate in a failed train waits for the next one. At 30m
the largest observed train is 5 changes; at 90m a single conflict strands 8. V1
buys the first half of the reduction at the smallest blast radius.

**The count threshold is a ceiling, not a departure signal**, and the measurement
says so: at 30m the largest train in seven days held 5, so a threshold of 6 fires
essentially never. It bounds how much one failure can strand — a different job
from deciding when to leave.

### 2.3 Ordering, derived not declared

`supersedes` is not a field anyone maintains. Git already knows, exactly.
Verified on the real waiting candidates and run live:

```
$ vac-train.mjs --plan 16601e54f,25c85997d,2eb5c3f27,db0033e12,f59c0fca5,52c95cfcd,3814d8073
train plan — 7 candidate(s) offered, 3 would board
  board    16601e54f
  board    25c85997d
  board    3814d8073
  drop     2eb5c3f27  included_in 3814d8073
  drop     db0033e12  included_in 3814d8073
  drop     f59c0fca5  included_in 3814d8073
  drop     52c95cfcd  included_in 3814d8073
```

**Seven certified candidates are three train members** — one staging merge, one
Vercel build, where naive processing would have produced seven of each, four of
them no-ops. A dependency carried *inside* an included candidate counts as
satisfied; a declared dependency that is genuinely absent **blocks** rather than
being quietly reordered around.

### 2.4 Compose by merging, not rebasing

DevOps 2 reconciles a *lane* by rebasing onto staging, which is right for a lane.
A train must do the opposite: a rebase rewrites every candidate SHA, and the
candidate SHA is what its certification evidence is bound to. A train that
rebased would arrive at staging carrying proof about commits that no longer
exist. So: snapshot the base, merge each candidate in order, stop at the first
conflict, and every original SHA stays a verifiable ancestor of the train head.

Base movement is detected explicitly (`baseMoved`), and a dirty integration
worktree refuses composition before anything is touched.

### 2.5 The validation boundary

Level 2 Critical Invariants run **once over the composed result**, not per
candidate — running the pack per candidate is the redundant validation this
mission exists to reduce. DevOps 5's law is applied verbatim: **FAIL blocks,
UNMEASURED blocks**, and `trainIntegrationDecision` accepts no `override`,
`force`, `approved_anyway` or `skip` parameter, asserted by a control.

DevOps 5 left four invariants UNMEASURED in a bare promotion worktree because
`web/node_modules` is absent. The train owns closing that, once per train, and
names the existing guarded installer `alloy-worktree-provision` — which already
holds one concurrency slot, refuses under memory pressure and refuses another
worktree's symlinked `node_modules`. Nothing here installs anything.

Aggregate changed-domain validation adds breadth over the composed diff: it
answers the question no single candidate can, which is whether A and B are fine
apart and wrong together.

### 2.6 One staging mutation

`stagingMergeRequest()` returns a **request payload** for
`repository.merge_pull_request` — the same action, validation, approval and
allowlist a single candidate faces. A train gets no privileged path to staging;
it only arranges for there to be one merge instead of six.

The module imports no `child_process`, makes no network call, and routes every
Git read through an allowlist of nine verbs from which `push`, `reset`,
`--force` and `filter-branch` are structurally absent. "The train cannot write to
staging" is a property, not a promise.

### 2.7 Failure law

A failed train destroys nothing. Every candidate returns to
`READY_FOR_STAGING` exactly as it was — it was certified before the train, and
the train failing says nothing about it individually. Only the candidate the
failure is attributable to is held out, and only from the *next* train, so a
conflict cannot silently re-form the same broken set forever. No bisecting, no
history rewriting: automatic conflict resolution is how someone else's work
becomes a surprise.

### 2.8 Supersession, for DevOps 3

DevOps 3 deliberately refused to infer supersession from Git — "an ancestor of
something newer" is true of far too many branches to be a licence to delete. The
train is the one place that knows authoritatively, and
`supersessionIndexForWorktrees()` produces exactly the `supersededBy` map
`inventoryWorktreeLifecycle` already accepts. A control drives the real DevOps 3
owner with a real record and asserts it classifies `SUPERSEDED` and
`reclaimable`. No supersession state is added to the worktree subsystem.

### 2.9 Three phases, never flattened

`trainMigrationLedger` records **promoted obligations**, **candidate additions**
and **post-merge obligations** as three separate sets with their phases named.
Flattening them into one "expected state" is precisely the defect Part 1 fixed,
and keeping them apart in the train's own evidence means it cannot be
reintroduced by a reader of the train record.

### 2.10 DevOps 7 seam

`drainStateForMaintenance()` answers "is it safe to begin" and nothing else. A
train mid-composition looks like an abandoned worktree holding unlanded
candidates; reclaiming either would strand certified work.

---

## Certification

`promotion-train` — **63 passed, 0 failed**, covering all 21 required train
proofs and cases A–H, including fault injection through the real DevOps 3 owner
and both copies of the parity measurement.

Regression green: `development-migration-parity` 37/0,
`development-production-apply-owner` 28/0, `development-health` 30/0,
`development-governed-approval` 38/0, `development-governed-approval-ui` 18/0,
`development-exact-authorization` 6/0, `governed-action-handoff` 15/0, and the
DevOps 1–5 contracts (`lane-bootstrap-contract` 17/0, `lane-freshness` 22/0,
`worktree-lifecycle-class` 27/0, `lane-knowledge` 22/0, `critical-invariants`
23/0).

`development-gateway-ui` is **90 passed / 1 failed on the pristine base too** —
`browser-auth routes answer POST` — verified by setting this work aside and
re-running. Pre-existing, unrelated, not introduced here.

## Attendance handoff

**Not merged, and not merged from this lane.** No Attendance product code was
touched. The real-shape simulation (CASE G) is green, and both the merge
executor and the policy copy now pass it.

`ATTENDANCE THREAD 8 PR #848 MAY RETRY GOVERNED MERGE` — **conditional on this
control-plane candidate being promoted and installed.** Until then the running
toolkit still carries both defects, so a retry now would be denied exactly as
before. Attendance itself is not promoted and nothing here claims it is.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched
(`14b0e01dcd06` sampling normally throughout). Held with `16601e54f`,
`25c85997d` and `3814d8073`.

**Remaining debt.** The train has no persisted queue: `READY_FOR_STAGING` is
carried on the existing candidate record shape, and `vac train` reports the
policy rather than reading a store that does not yet exist. That is deliberate
for V1 — a queue store is only worth building once something writes to it on the
lifecycle seams — and it means the cadence is currently a documented policy an
operator or a train run applies, not a timer. The carry-forward findings in §1.10
each name their owner.
