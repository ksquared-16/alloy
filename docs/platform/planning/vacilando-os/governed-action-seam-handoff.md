# Worker → Director governed-action seam — root cause and handoff

**Status:** diagnosed here, implementable only in the Gateway lane.
**Diagnosed from:** `wt1-access-identity-v2` (Access & Identity lane), run `erun_d003de873e1f6fe0`.
**Owning lane:** `wt5-vacilando-gateway-v2`, branch `agent/cursor/5-vacilando-gateway-v2`.

## Why this document exists rather than a patch

Every file the fix touches lives in `wt5`'s **uncommitted working tree**. `origin/staging`
carries 116 files under `scripts/local-dev/lib/vacilando/` and none of them are
`execution-run.mjs`, `execution-resource.mjs`, `development-lane.mjs`, `lanes.mjs` or
`governed-action-request.mjs`. The running Director is
`wt5-vacilando-gateway-v2/scripts/local-dev/lib/vacilando-server.mjs --port 3020`; this lane's
copy of the toolkit is a stale rsync that nothing executes.

Implementing here would mean copying another lane's uncommitted runtime into this branch — a
second, divergent Gateway. That is the outcome the instruction explicitly forbids, so the
diagnosis is handed over instead, with the one in-scope defect fixed (§5).

## The chain, in order of firing

### 1. This lane cannot report run state at all

`vac run-status` exists only in `wt5`. On this lane `vac` resolves through
`~/bin/alloy-dev → /Users/Kelly/Alloy/scripts/local-dev/vac`, whose subcommands are
`run | status | cancel`. There is no `run-status`.

Consequence, from the live run store: `erun_d003de873e1f6fe0` was created 18:03:51 and killed
18:05:56 by the governor with `state_reason: "orphaned_pre_protocol_run"` — *"never reported
managed status and is no longer live work."* All four most recent Identity-lane runs are
`ABANDONED`, all with `mission_id: null` and `governed_action: null`.

**The worker was never able to report the boundary, so no seam downstream could ever fire.**
Every re-prompt reproduced this exactly.

### 2. No worker-facing route into the governed-action contract

The structured contract already exists and is well-formed —
`governed-action-request.mjs`, 991 lines, schema `vacilando.governed_action_request.v1`, with
`requestGovernedAction` / `processGovernedAction` / `approveGovernedAction` /
`denyGovernedAction` / `resumeLaneAfterGovernedAction` / `handleGovernedDecisionAnswer`,
dedupe via `dedupeKey`, an audit log, and `redactGovernedSecrets`. It already hardcodes
`Q15_CENSUS_ARTIFACT`.

Its only worker entrypoint is
`node vac-session-report.mjs governed-action --run <id> --lane <id> --json '{…}'`, which is
**not exposed through `vac`** and appears in no worker instruction.

Empirical confirmation: no `governed-actions/` directory exists under either runtime root
(`~/.local/state/alloy-dev` or `~/.local/state/alloy-dev/gateway`). `requestGovernedAction`
has never executed. There are also **no tests** for the module.

### 3. The missing seam itself

`execution-resource.mjs :: onExecutionRunTransition`, the `to === "WAITING_RESOURCE"` branch:

```js
const key = resource?.resource_key || resource?.key || run.resource_wait?.resource_key;
if (!key) return;
if (key === "director_governed_action") return;   // ← recognised, then nothing happens
ensureResourceRequest({ runId, laneId, resourceKey: key, … });
```

Every other resource key becomes a queued resource request that drives waiting and
resumption. `director_governed_action` is correctly excluded from the *local* resource queue —
it is not a local lock — but **nothing takes its place.** That bare `return` is the missing
orchestration seam.

The rest of the plumbing for that key already exists and is waiting for it:

- `execution-run.mjs:319` — `resource_wait.resource_key === "director_governed_action"` renders
  the run as **"Waiting on Director"**;
- `gateway-view.mjs:224` — the Gateway UI branches on the same key and on
  `resource_wait.governed_request_id`;
- `attachRunWait` in `governed-action-request.mjs:325` sets both fields and transitions the run
  to `WAITING_RESOURCE`.

The direction is one-way: a governed action drives the run's wait state, but a run entering that
wait state never creates a governed action.

Separately, `tryFulfillViaTrustedHost` still has exactly **one** caller,
`assignment-dispatch.mjs:285`, reached only when `runClaudeExecutionSession` returns
`awaiting_decision` on the mission-assignment path. Development Lane execution runs never
traverse that function. The instruction's premise is correct.

### 4. The structural blocker: lanes have no mission

`validateRequestShape` rejects with `missing_mission_id`, and every downstream step is
mission-keyed — `openApprovalDecision → createDecision({missionId})`,
`policyDecision → findAuthorization({missionId})`,
`tryFulfillViaTrustedHost → fulfillDatabaseCensusForMission(missionId)`.

But Gateway V2 Development Lanes have no mission. The gateway runtime root has **no
`missions/` directory**, its `decisions/` directory is **empty**, `lanes.json` has no mission
field, and all 11 Identity-lane runs carry `mission_id: null`.

Proven by running the real module against a sandboxed runtime root:

```
A) exactly as the Identity lane can supply it   → {"ok":false,"error":"missing_mission_id"}
B) byte-identical request with a mission id     → ok:true
                                                   status: awaiting_operator
                                                   operator_approval_required: true
                                                   decision: dec_d08175e3407473
```

So the governed path works end to end the moment a mission binding exists, and cannot be
invoked for this lane until one does. **This is the one part that is a design decision rather
than a mechanical fix** — either bind lanes to a mission, or relax the mission-keying to accept
a lane as the decision subject.

### 5. The artifact could not have been executed anyway — fixed

`trusted-host-action-registry.mjs:90` reads one field, `j.combined_query || j.sql || j.query`,
and rejects the artifact with `json_missing_sql` otherwise. The Q15 artifact carried nine
per-question `sql` fields and no such field.

Fixed in this lane (`498c2c7f3`), because the registry is byte-identical between this worktree
and the Gateway lane. `def.validateInputs(...)` now returns `ok:true`,
`kind:"with_select"`, hash `e958227e9b3e…`, and the statement was executed against a real
PostgreSQL to prove it parses and returns.

## Recommended fix, smallest form

1. **Expose the existing contract.** Add a `governed-action` case to `vac` that execs
   `vac-session-report.mjs`. Add `run-status` (and `governed-action`) to the canonical
   `scripts/local-dev/vac` so lanes outside the Gateway worktree can report at all — otherwise
   §1 keeps killing every run before any seam matters.
2. **Fill the hole at `execution-resource.mjs:730`.** Instead of the bare `return`, if the run
   has no `resource_wait.governed_request_id`, build a request from the wait payload and call
   `requestGovernedAction`. `processGovernedAction` already handles auto-execute vs.
   `awaiting_operator`, and `attachRunWait` already writes the states the UI reads. Dedupe is
   already handled by `dedupeKey`, so a duplicate worker report is idempotent by construction.
3. **Resolve the mission binding (§4).** Needs a decision, not a patch.
4. **Resolve the artifact against the originating worktree.** `findRepoRoot()` in the registry
   walks `cwd`, so the Director resolves the artifact inside `wt5` — a stale untracked copy that
   does not carry the §5 fix. The run record already stores
   `worktree_path: "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2"`; resolving the
   artifact against that is a small change and removes a whole class of "wrong copy" failure.
5. **Add tests.** The module has `setGovernedActionExecuteImplForTests` and
   `setGovernedActionResumeImplForTests` hooks and no test file uses them. The nine regression
   cases in the instruction map onto those hooks directly.

## What is not yet proven

Automatic worker continuation after a trusted-host result. It cannot be proven from this lane:
the seam is unimplemented, no lane→mission binding exists, and the Identity lane cannot report
run state. Nothing here should be read as evidence that the resume path works — only that
everything upstream of it is now understood and that the request, given a mission, reaches
`awaiting_operator` with a decision attached.
