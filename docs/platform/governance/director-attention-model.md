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

## Related

- [`managed-sprint-operations.md`](managed-sprint-operations.md)
- [`agent-repo-boundaries.md`](agent-repo-boundaries.md)
- `scripts/local-dev/lib/vacilando/director-authority.mjs` — the policy set and gates
- `scripts/local-dev/lib/vacilando/director-evidence.mjs` — what is measured
