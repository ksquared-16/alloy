# Lane Knowledge Activation & Handoff Coverage V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak. **No live lane state was written.**

**Baseline.** `origin/staging` @ `5c7b100bc`, with Maintenance Activation
Readiness (`b43866b85`, carrying the whole chain) merged in.

---

## 1. The measured blocker, and what closed it

Maintenance refused because `lane_next_action_recorded` **FAILED**: 13 active
lanes carried no durable next action. That was not a bug in the collector — the
lanes genuinely had none — so the fix is coverage, not a weaker gate.

Live, after this mission:

```
PASS  lane_next_action_recorded   13 active lane(s) have a durable resume
                                  disposition (7 explicitly held)
PASS  lane_blockers_recorded / accepted_executions_durable
PASS  worktree_durability_known   58 worktree(s)
PASS  run_handoff_filed

checkpoint  true  (restart context is durable)
```

## 2. Thirteen honest dispositions, not thirteen green records

```
ACTIONABLE           6    Financials · Payments · Troubleshooting
                          UI-Vac · Access & Identity · Documentation & API
HELD_NEEDS_OPERATOR  7    Runtime Performance · Communications · Trust Runtime
                          Backend · Surfaces · Attendance · Work Items
UNRESOLVED           0
```

Every actionable next action came from a canonical source. None was invented.

> **My first-pass heuristic said all 13 were seedable from completion reports.
> The module disagreed and was right.** Those reports carry a *summary* of what
> happened, not a `next_step`. Turning "certified the candidate and filed
> evidence" into an imperative is a decision nobody made, so those seven lanes
> became HELD instead — the module being stricter than my shortcut, which is the
> correct direction for this to fail in.

## 3. The source hierarchy, strongest first

| Rank | Source | Why it ranks there |
|---|---|---|
| 1 | open run instruction | a decision still in force |
| 2 | completion report `next_step` | the lane's own account of what follows |
| 3 | handoff payload | an explicit transfer states what the receiver picks up |
| 4 | recorded next step | a previous seam already wrote one |

Below rank 4 there is nothing that is not a guess, and **the list stops rather
than reaching for one**. A control asserts an in-flight instruction outranks
every account of the past.

## 4. HELD is a decision, not missing data

This is the distinction the whole mission turns on:

```
ACTIONABLE           → RECREATE   a session may start from the durable context
HELD_NEEDS_OPERATOR  → HOLD       durable, resumable, and MUST NOT be started
UNRESOLVED           → NEEDS_OPERATOR   not durable; still blocks maintenance
(silence)            → blocks
```

A held lane satisfies the checkpoint because a recorded decision to hold is
exactly what maintenance needs: the lane comes back held, loses nothing, and says
what it is waiting for. **Silence is the failure**, because silence reads as "no
work here" — which is how an operator ends up reconstructing ten lanes by hand.

The strictness runs the other way too: a held lane is never counted as
actionable, `sessionDispositionFor` refuses to start it, and the checkpoint
reports *how many* lanes are held so a hold cannot hide inside a green metric.

## 5. Independence from ephemeral ownership

A resume record carries no path, no slot, no pid, no session id and no port — and
a control walks the record and fails on any of them. The lane id is the one
identifier that outlives the worktree, the slot and the session, which is the
property DevOps 3 and DevOps 4 already established, applied here.

Branch and run state are recorded as `CURRENT_OBSERVATION` — they rot, and the
reader is told so rather than discovering it later. The next action is `PLANNED`,
because intent is not fact.

## 6. No second store

`lane-memory` remains the only lane knowledge authority. This module **derives**
and returns a record shaped for that owner; it has no writer export, no timer,
and does not read or write a file — a control asserts all of it. Durable
decisions and promotion checkpoints are not restated here; they stay where
DevOps 4 put them.

Updates attach to **six existing lifecycle seams** — assignment accepted,
instruction established, blocker discovered, candidate certified, handoff or
closeout, lane parked or resumed. Not on every message, and not on a poll: these
are the moments at which what the lane should do next actually changes.

## 7. What was and was not written

**Nothing was written to live lane state.** `vac lane-resume` is read-only by
default and its `--seed` mode refuses on this build, because `lane-memory`
exposes no canonical next-step writer yet — and inventing one would be the second
store this mission must not create.

The live checkpoint passes anyway, because the maintenance collector now
**derives** the disposition read-only from the same owners. That is the honest
arrangement during a soak: the fleet's knowledge is real and measured; only its
persistence waits for the canonical seam.

## Certification

`lane-resume` — **27 passed, 0 failed**, covering all sixteen required proofs
including the real thirteen-lane fleet shape, the refusal to invent a next action
from a summary, portability against worktree/slot/session loss, lane isolation,
and bounded records.

Regression green: `maintenance-activation` 41/0, `host-maintenance` 50/0,
`artifact-filing-contract` 19/0, `migration-execution-outcome` 24/0,
`control-plane-resilience` 46/0, `toolchain-canary` 49/0, `agent-configuration`
31/0, `promotion-train` 63/0, `development-health` 30/0, `critical-invariants`
23/0, `lane-knowledge` 22/0, `worktree-lifecycle-class` 27/0, `lane-freshness`
22/0, `lane-bootstrap-contract` 17/0, `governed-action-handoff` 15/0,
`development-governed-approval` 38/0.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No reboot, no Gateway restart, no
toolkit install, no maintenance activated, no live lane state mutated.

## Remaining debt

- **Persistence waits for a canonical writer.** `lane-memory` has no next-step
  writer; the derivation is live and read-only. Once the seam exists, the six
  lifecycle points above are where it attaches.
- **Seven lanes are genuinely held.** That is honest, not finished: they need a
  dispatched instruction or an operator decision before they do anything. The
  checkpoint passing means maintenance is safe, not that the fleet is busy.
- **`may reboot` now reads true in the preflight.** It is a decision, not a
  reboot: `authorizeReboot` still requires the sudoers capability, which is not
  installed.
