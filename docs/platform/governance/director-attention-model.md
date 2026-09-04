---
owner: platform
status: canonical
last_reviewed: 2026-09-04
supersedes: []
---

# Director Attention Model

**Status:** canonical governance doctrine
**Applies to:** every Vacilando lane, existing and future

## The core rule

> **Governance does not imply human approval.** Governance means authority,
> safeguards, attribution and audit. Human approval is reserved for decisions
> that require human judgement.

An approval that a human grants every time, without changing the outcome, is
not governance. It is a tax on execution that also degrades governance, because
an operator trained to click approve mechanically is an operator who will click
approve on the one request that mattered.

## The finding that produced this doctrine

**ROUTINE APPROVAL FATIGUE.** Observed impact: unnecessary Director
interruptions, execution delays, notification spam, mechanical approval with
little decision value, and — worst — genuine `NEEDS YOU` states diluted until
they stopped standing out.

The cause was measured rather than assumed. Every routine promotion action
already had a delegated policy, so the fatigue was never a missing policy.
Replaying real requests through the evaluator found three separate causes:

| Action | Decision | Why |
|---|---|---|
| `repository.push` | `policy_denied` | failed `managed_agent_branch` |
| `promotion.open_pr` | `policy_denied` | failed `managed_agent_branch` |
| `repository.merge_pull_request` | `operator_approval_required` | policy shipped disabled, **and 6 of its 10 gates were measured by nothing** |

The merge case is the one worth internalising. The policy named exactly the
right gates — head sha, base branch, mergeability, required checks,
certification suite, unresolved findings — and the evidence collector gathered
none of them. So every merge escalated, and the operator approved it *by
reading the same GitHub page a collector could read*.

**That click was supplying a measurement, not a judgement.** It cost an
interruption and added no safety.

`managed_agent_branch` was a different kind of defect: a proxy. It asked whether
a branch was *named* like agent work. Any branch named correctly satisfied it,
and it proved nothing about who actually held the branch. The guard exists to
establish "this lane is pushing its own work", and that is directly observable.

## The ordering rule

> **Build the safeguard first. Then remove the approval.**

Before removing any approval requirement, verify the operation has objective
machine guards. If the approval exists because a safeguard is missing, the
approval is compensating for the gap — removing it converts an interruption
into an unguarded action, which is strictly worse than the fatigue.

This is why `certified_staging_merge_v1` stayed disabled until
`measureMergePullRequestGates` existed, and why it is safe now: if that
measurement ever regresses, its gates go unmeasured and merges begin escalating
again on their own, with no code change required.

## Tiers

### Tier A — autonomous routine

Executes automatically when machine guards pass. No `NEEDS YOU`, no
notification.

Checkpoint/commit inside the lane-owned worktree; governed branch push from the
owning lane; open a PR against the expected base; merge a PR whose exact head
matches with required checks green, clean merge and no unresolved review or
trust condition; install a toolkit that exactly matches promoted staging;
restart or reconcile the Gateway onto that toolkit; dev-server start/stop
through the canonical lifecycle; provider/session admission; queue
reconsideration; safe pause/resume; lane placement; canonical stale-run
reconciliation; cleanup of proven-temporary certification artifacts; release of
resources proven reclaimable.

### Tier B — autonomous within explicit bounds

Automatic only inside stated limits, and only where a **narrow** capability
exists. A capacity or configuration change qualifies only with a bounded field
and value, compare-and-set against the expected current value, a required
rollback value, an audit event, and verification by readback.

There is no generic config-writing authority, and creating one would defeat the
tier rather than satisfy it. `capacity.set_provider_ceiling` is the reference
shape: one constant key, one range, compare-and-set, mandatory rollback.

These do not need routine approval once the Director has authorised the
**policy**; the individual action is not re-litigated.

### Tier C — Director decision required

Reserved for cases where judgement genuinely changes the outcome:

destructive irreversible action; deleting work containing unique, unmerged or
uncommitted changes; force push or history rewrite; abandoning uncertain
valuable work; crossing a repository, security or account boundary; a new
external integration or trust relationship; **widening an authority boundary not
previously authorised**; credentials, secrets or access; materially changing
production doctrine; choosing between conflicting product or architecture
directions; spending money; an action whose ownership is ambiguous; and any
operation whose safeguards cannot prove what will be affected.

These **should** interrupt, and the interruption must state the actual decision.

### Tier D — never auto-execute

Bypassing ownership guards; operating on unattributable processes; silently
discarding Git work; credential forwarding; unsupported destructive mutation;
defeating a permission classifier.

No Director preference converts an unsafe or unsupported operation into routine
automation. Approval history is never evidence that a new destructive class is
safe.

## The action-class inventory

Every action class Vacilando can take, with the tier that decides whether it
interrupts. **The canonical source is
`scripts/local-dev/lib/vacilando/director-operating-authorization.mjs`** — the
table below is a rendering of it. A structural test reconciles the inventory
against the delegated policy set, so a policy added without a filed tier fails
the suite rather than quietly producing an authorization that under-reports
what runs unattended.

Two things are worth reading off it directly. Most classes are **not** governed
trusted-host actions — a checkpoint, a dev-server restart and a lane pause are
executed by the lane or the supervisor, and they are inventoried anyway so the
notification model can ask the same question of every class. And a tier B row
always states its bounds: a tier B with no bounds is a mis-filed tier A, and a
bound nobody measures is a mis-filed tier C.

**repository**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `repository.checkpoint` | A | vac checkpoint-create (lane) | — |
| `repository.push` | A | trusted host | — |
| `promotion.open_pr` | A | trusted host | — |
| `repository.merge_pull_request` | B | trusted host | Exact expected head, base staging, mergeable, checks green, certification suite passed, zero unresolved findings. Any one unmeasured escalates. |
| `repository.close_pull_request` | A | trusted host | — |
| `repository.delete_remote_branch` | B | trusted host | Branch unprotected, remote head matches expected, no open PR depends on it, no active lane references it, no unique work lost. |
| `repository.force_push` | D | operator only | — |
| `repository.delete` | D | operator only | — |

**runtime**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `runtime.dev_server_start` | A | alloy-dev-start (canonical lifecycle) | — |
| `runtime.dev_server_stop` | A | alloy-dev-stop (canonical lifecycle) | — |
| `runtime.dev_server_recycle` | B | supervisor | Ownership proven, desired state RUNNING, restart budget not exhausted. |
| `runtime.supervisor_recovery` | B | supervisor | Within the recovery budget. restart_exhausted leaves tier B and notifies STUCK. |

**lane**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `lane.create` | A | gateway | — |
| `lane.place` | A | gateway | — |
| `lane.pause` | A | gateway | — |
| `lane.resume` | A | gateway | — |
| `lane.park` | B | gateway | Idle eligibility positively measured. Absence of recent activity is not proof of idleness. |
| `lane.close` | B | gateway | Branch durability proven. Unprovable durability, or unique unmerged work, is tier C. |
| `lane.stale_run_reconciliation` | B | trusted host | Allowlisted corrections only, plan fingerprint current, zero destructive corrections, no foreign or ambiguous owner mutation, no live process affected. |

**worktree**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `worktree.create` | A | alloy-worktree-create | — |
| `worktree.provision` | A | toolkit | — |
| `worktree.retire` | B | trusted host | Safety measured, state candidate, tree clean, no live references, durability proven, no unique work at risk, not self-retirement, fingerprint-bound, branch never deleted along with it. |
| `worktree.remove_orphaned` | B | host steward | Ownership proven and durability proven. Either one unmeasured makes it tier C. |

**qa_identity**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `environment.restore_qa_session` | C | operator only | — |
| `environment.provision_qa_identity` | C | operator only | — |
| `environment.assign_qa_identity_access` | C | operator only | — |
| `qa.browser_sign_in` | C | operator (human sign-in) | — |
| `qa.director_auth_routing` | C | operator | — |

**capacity**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `capacity.server_admission` | B | gateway | Normal 8 concurrent dev servers, burst 10 while pressure is healthy, memory-pressure knee 11. |
| `capacity.provider_admission` | B | gateway | Within the live certified provider ceiling. |
| `capacity.browser_admission` | B | gateway | Automated browser concurrency 2. |
| `capacity.set_provider_ceiling` | B | trusted host | ALLOY_MAX_ACTIVE_PROVIDERS only, 4..8 inclusive, compare-and-set against the live value, rollback declared, host headroom measured, no unvalidated ceiling already active. |
| `capacity.expand_beyond_window` | C | operator | — |

**data**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `database.read_census` | B | trusted host | Allowlisted query artifact matching its expected hash. |
| `database.apply_migration` | C | operator only | — |

**credential**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `credential.provision` | D | operator only | — |
| `credential.bind_trusted_secret` | D | operator only | — |

**spend**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `spend.activate_paid_service` | C | operator only | — |

**governance**

| Class | Tier | Executes via | Bounds |
|---|---|---|---|
| `governance.update_policy` | D | operator only | — |
| `governance.delegate_authority` | D | operator only | — |
| `executor.grant_authority` | D | operator only | — |

## The durable Director Operating Authorization

`director_operating_authorization_v1`, effective 2026-09-04.

The delegated policy set answers *"is this request allowed"*. That is the
evaluator's question. The Director's question is different — *"what have I
signed up to, what is still mine, and when did that last change"* — and before
this there was nothing durable to point at that answered it. That absence is
why the same consent kept being re-established.

The authorization is **derived from** the live policy constants at call time,
never copied. A second hand-maintained list is the obvious way to write it and
the wrong one: the copy drifts, and a governance document that disagrees with
the evaluator is worse than none, because people believe it.

It records the authorized action classes and their gates, the policies that are
**written but not enabled** (a decision the operator has not yet taken, visible
as that rather than absent), the bounded values, the classes reserved to human
judgement, the classes that are never automatic, and a version history in which
every widening names who authorized it.

**Inheritance is a property to protect, not a mechanism to build.** There is one
document; every lane imports the same module. A lane may hold a *narrower*
override, and `validateLaneOverride` refuses a widening one — the failure mode
being a lane that quietly grants itself more than the fleet, invisible precisely
because per-lane policy is where nobody looks.

Widening and narrowing are treated asymmetrically on purpose.
`classifyAuthorizationChange` marks any added action class **or dropped gate** as
a widening that requires an explicit operator decision. Narrowing may happen
silently, because it can only ever reduce what runs unattended.

## What "unmeasured" means

A gate returns `true`, `false`, or `null`. **`null` never passes.** An
unmeasured gate escalates, because the Director acts on evidence rather than on
the absence of a reason to worry.

This makes the whole model fail-safe in one direction: an incomplete evidence
collector can only ever produce *more* operator approvals, never fewer.
Improving measurement is therefore always safe to ship.

## Policy is durable and inherited

The Director does not re-establish "I approve routine pushes" per lane. The
delegated policy set is versioned, carries its own expiry and audit, and every
lane inherits it. A new lane does not return to click-by-click approval.

Authority expansion is explicit **once**. Vacilando may observe that the
Director approved every one of the last N routine promotions and *recommend*
auto-authorising that class — but the expansion itself is a Director decision,
recorded, and never inferred silently from approval history.

Changes to the policy set are themselves auditable, and `governance.update_policy`
and `governance.delegate_authority` are self-expansion keys: they are refused
before policy matching, so a delegate can never enlarge its own delegation.

## Notification categories

The Director's notification stream answers one question: **do I need to know or
do something?** Four categories dominate.

- **NEEDS ANSWER** — a genuine decision or missing information: a product or
  architecture choice, ambiguous destructive cleanup, a required external
  credential, conflicting instructions.
- **STUCK / BLOCKED** — work cannot continue autonomously: authority genuinely
  missing, upstream unavailable, unrecoverable branch/worktree mismatch,
  restart exhausted.
- **STALE / NEEDS ATTENTION** — state looks unhealthy and cannot safely
  self-reconcile: a stale run with ambiguous completion evidence, an
  unattributable process, an orphan worktree holding valuable changes,
  control-plane health failure.
- **COMPLETED** — meaningful work finished: promoted, certified, phase
  complete, deliverable ready.

### Routine progress does not notify

No notification merely because a PR opened, a push completed, an authorization
was automatically satisfied, a governed action started, a toolkit install
began, a lane queued briefly and was admitted, a server restarted successfully,
reconciliation occurred, a provider seat freed, or a capacity decision
succeeded normally.

These belong in lane activity, the audit log and the status UI — not in
Director notifications.

**Approval is not a notification category by default.** Once routine actions
auto-execute they never reach `awaiting_operator`, so the flood disappears by
construction rather than by filtering.

### Collapse related events

Multiple events from one underlying issue are one finding, updated in place.

> Payments false `VALIDATING` → provider seat held → Surfaces waits

is **not** three notifications. It is one — *"Provider capacity blocked by
stale Payments run"* — updated as diagnosed, recovering, resolved. Repeated
retries, governed-action state transitions and reconciliation attempts do not
each notify.

### Completion is a boundary, not a command exit

A successful push followed by PR and merge is one outcome, not three
notifications. Prefer the final one — *"UI-Vac mobile corrections promoted and
installed"* — with detail underneath.

## Autonomous does not mean hidden

Auto-authorised activity is fully recorded and discoverable in activity, the
inspector and governance history:

> Auto-authorized under Director policy: routine promotion

with action, policy, safeguards evaluated, outcome and audit id. The Director
reviews later without being the execution bottleneck. Removing the click must
never remove the audit — an auto-execution that cannot be reconstructed
afterwards is not governance.

## The NEEDS YOU contract

> If Vacilando shows **NEEDS YOU**, the lane genuinely cannot proceed safely
> without the Director.

There is no *"Needs You — approve push"* when guarded lane-owned pushes are
authorised, and no *"Needs You — approve merge"* when the head matches, checks
pass, policy authorises it and no trust boundary changed.

Operator-facing states correspond to genuinely different obligations:

| State | Obligation |
|---|---|
| `Working` | none — autonomous, no interruption |
| `NEEDS YOU` | a decision only the Director can make |
| `BLOCKED` | authority or dependency genuinely missing |
| `ATTENTION` | state cannot be safely self-reconciled |
| `COMPLETE` | review at leisure |

## Migration

When the policy changes, pending approval requests are audited rather than left
hanging: routine-and-now-covered requests are auto-authorised or reconciled,
genuinely Director-required ones retained, stale or terminal ones closed,
duplicates collapsed. Old `NEEDS YOU` cards do not survive merely because they
predate the policy.

## Finding: routine approval fatigue

**Observed.** The Director approved essentially every routine governed action.
Approval requests slowed execution, blocked otherwise-safe lanes, produced
`NEEDS YOU` states that needed no decision, flooded notifications, and trained
the operator to click rather than evaluate — which diluted the interruptions
that genuinely mattered.

**Root cause, measured rather than assumed.** Not missing policy. Every routine
promotion already had a delegated policy and `director_approved` already mapped
to auto-execute. Replaying real requests through the evaluator found three
distinct causes: push and open-PR were denied on `managed_agent_branch`, which
tested whether a branch was *named* like agent work; and merge was disabled
while six of its ten gates were measured by nothing at all. The operator was
being asked to supply a *measurement* — reading the same GitHub page a collector
could read — not a judgement.

**Mitigation.** Ownership is measured from the requesting worktree; the merge
gate collector was built first and the approval removed second.

**Status: not yet resolved.** This finding closes only when a real routine
promotion completes with no Director interruption under the installed toolkit.
Until the toolkit carrying these changes is the installed one, the old name
proxy is still what evaluates every request — including the pushes that
delivered this fix, each of which required a click.

## Finding: toolkit convergence bootstrap gap

**Observed.** Promoted staging contained a required control-plane capability.
The installed toolkit stayed on the previous commit. The lane that needed the
capability reported "operator-run install required" and stopped. Nothing was
broken and nothing retried.

**Root causes — two absences, not one misconfiguration.**

1. **No toolkit drift signal.** Nothing compared the installed toolkit sha to
   promoted staging. `control-plane-health.json` carried no toolkit field, so
   the Gateway could not report that it was running old code even in principle.
2. **No governed install action.** The trusted-host registry held thirteen
   action keys and none installed a toolkit, so a lane could not propose the
   install *even to be refused*. The evaluator answered "no delegated policy
   covers this action", which reads like a policy decision and is really an
   absence.

The old toolkit could therefore neither detect its own drift nor request its own
replacement — which is what made this a bootstrap problem rather than a bug.

**Resolution.** `toolkit-convergence.mjs` owns drift detection and the
convergence status; `host.install_toolkit` is a registered governed action;
`routine_toolkit_convergence_v1` makes ordinary convergence Tier A. One
operator-run bootstrap install is required to reach the first toolkit that
contains these.

**A distinction the fix depends on.** Installed and running are separate facts.
The Gateway host process resolves through the `current` symlink and the
control-plane server names a sha outright, so flipping the symlink moves
neither: the executing argv is read from the process, and a path routed through
`current` is reported as *unpinned* rather than as matching. `TOOLKIT
UNVERIFIED` is a distinct state from `CONVERGED`, and a symlink-only check that
reported success is exactly the failure being designed out.

**Status: not resolved.** Closes when autonomous post-bootstrap convergence is
live-certified — drift detected, `host.install_toolkit` auto-executed under
policy, argv and health verified, blocked work resumed, no Director click.

## Finding: Needs You transitional count divergence

**Symptom.** The navigation badge, the global Needs You control, the panel
heading and the rendered rows disagreed during transitions and only converged
later. Steady state looked correct, which is why it read as a refresh-timing
problem.

**Root cause — not timing.** Four surfaces answered "how much needs you" from
three different places. Rows came from the governed-action projection
(`/api/v2/governed-actions/pending`); the badge came from the notification
store's `counts.actionable` (`/api/notifications`); and the navigation read

```js
Number(G.attentionCount) || (G.home?.approvals?.length || 0)
```

where a genuine, **loaded zero is falsy** — so an authoritative empty state fell
through to a stale snapshot count from a third collection. The surfaces were not
slow to converge. They were reading different things, and one of them could not
tell *no items* from *no data*.

**Fix — one owner, one revision.** Promoted in `51ce6788d`, with `ac5605907`
and `fc02b4db2`. `commitNeedsYou()` commits the actionable set once per
revision and every surface paints from that object, with `count ===
items.length`. They cannot disagree because only one answer exists at a time.
Measured before the fix: 1/1/0/0 on Lanes, 0/0/1/1 on Home.

**Tests.** The behavioural coverage lives with that implementation.
`scripts/local-dev/tests/needs-you-consistency.test.mjs` adds a structural guard
on the wiring SHAPE — that the set is committed once, that no surface reintroduces
a falsy-zero `||` fallback to a second collection, and that the approvals heading
is derived from the rows it is given. Shape is what regressed before, and steady
state always converged, which is what made it easy to miss.

## Finding: unintended database census execution

**Incident.** A `database.read_census` executed that was not intended as program
work, related to `q15-authority-census.results.json`.

**The artifact is not the defect.** It is preserved, and marked
[NON-EVIDENCE](../planning/vacilando-os/qa/access-identity-v2/q15-authority-census.NON-EVIDENCE.md).
Its contents were not read or interpreted.

**The defect** is that a census naming no query silently became a request to run
the **most privileged** census available. Filing substituted
`[Q15_CENSUS_ARTIFACT]` for empty `artifact_refs`, and `artifactPathFrom()`
returned Q15 as its default — so the executor's own "query required" guard could
never fire, because the field was already filled in by the time it looked.

**Why forensics could not settle it.** A substituted request is stored
byte-identically to one that explicitly asked for the authority census. The
correction had to be a refusal at request time; no amount of audit reading
distinguishes the two after the fact.

**Fixed at both boundaries, independently.** Promoted in `51ce6788d`:
`artifactPathFrom(refs, { fallback = null })` defaults to null with explicit
opt-in at the display call sites, `validateInputs` turns that into
`missing_query_artifact` before any database is touched, and the database target
no longer defaults either. One target exists today, which is why that default
looked harmless — the moment a second exists, silence would pick the privileged
one. There is no safe default census. No compensating governed action was filed:
the census was read-only, and inventing a mutable remediation for a read would
add risk rather than remove it.

## Related

- [`managed-sprint-operations.md`](managed-sprint-operations.md)
- [`agent-repo-boundaries.md`](agent-repo-boundaries.md)
- `scripts/local-dev/lib/vacilando/director-authority.mjs` — the policy set and gates
- `scripts/local-dev/lib/vacilando/director-evidence.mjs` — what is measured
- `scripts/local-dev/lib/vacilando/director-operating-authorization.mjs` — the durable authorization and the action-class inventory
- `scripts/local-dev/lib/vacilando/toolkit-convergence.mjs` — drift detection, convergence status and outcome verification
- `scripts/local-dev/lib/vacilando/turn-summary.mjs` — the operator-facing turn summary contract
