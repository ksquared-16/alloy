# DevOps 7 — Weekly Host Maintenance V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak. **Not activated** — the first real maintenance cycle must wait
for the soak to close.

**Baseline.** `origin/staging` @ `1c560a9d8`, with DevOps 6 (`7cc1616c1`,
carrying DevOps 5, 4, 3, 2 and 1) merged in as the first commit.

---

## 1. The audit came first, and most of this already existed

Mapped before writing a line. `macOS boot → launchd → Gateway → toolkit →
runtime generation → control-plane reconciliation → lane/session recovery →
health/admission` is **already automatic end to end**:

| Step | Owner | Status |
|---|---|---|
| Gateway restored at boot | launchd `com.alloy.vacilando-gateway`, `RunAtLoad` + `KeepAlive` | already automatic |
| New runtime generation | `control-plane-health.currentRuntimeGeneration()` | already automatic |
| Previous generation goes stale | `ownershipIsCurrent()`, `listStaleGenerationOwnedProcesses()` | already automatic |
| Control-plane reconciliation | `control-plane-recovery` observe/classify/plan/episodes | already automatic |
| Lane, session, run recovery | `execution-recovery`, `execution-session-recovery` | already automatic |
| Health and admission | `host-admission.classifyHostAdmission()` | already automatic |
| Periodic work | `host-steward-cycle`, 5-minute cycle with a lock | already automatic |
| Reclamation with interruption handling | `hygiene-reclaim` intent/outcome ledger | already automatic |

The generation deserves special notice, because it makes the hardest proof free.
It is derived from **boot time**, so a genuine reboot cannot produce the old
value and a Gateway that merely restarted cannot claim to have rebooted. DevOps 7
did not need to invent a way to prove the host restarted; it needed to *ask*.

**The only capability that genuinely did not exist is "ask the host to
restart".** Everything else in this mission is orchestration.

### What survives a reboot

Classified, with each row naming the owner that implements it —
`vac maintenance --survival` prints it:

| Class | Subjects |
|---|---|
| **PERSIST** | lane identity · worktrees · branch and commit state · lane knowledge |
| **RECONCILE** | execution runs · development slots · governed action execution claims · promotion train state |
| **RECREATE** | agent/provider sessions · runtime generation |
| **DO NOT RESTORE** | dev servers · QA browser sessions · owned process records |

`DO NOT RESTORE` is the row that gets designed wrong. A dev server that was
running is not evidence that a dev server *should* be running — it is evidence
that some lane once needed one. Restoring thirteen of them because they were
there is how a maintenance reboot produces a busier host than it started with.

## 2. The schedule, measured

**31,087 admission events over 24 days**, bucketed by local hour and weekday:

```
Tue 4,679   Wed 8,533   Thu 9,016   Fri 8,690
Sat   124   Mon    38   Sun     7
Sunday is empty in every hour except 08:00 (4 events) and 12:00 (3).
```

The emptiest contiguous four-hour slots in the entire week are Sunday 00:00
through Sunday 04:00 — **zero events across the whole sample**.

**Sunday 03:00 local** is chosen rather than 00:00 because *the defer window has
to land somewhere too*. Sunday 00:00–07:00 is uniformly dead, so a start at 03:00
can defer its full four hours and still finish inside quiet time; a start at
midnight would push a deferred attempt into Sunday 08:00, where activity resumes.
The window is the reason for the hour.

**No new scheduler.** `maintenanceCadenceDue()` is the same shape as the existing
`hygieneDue()` and reads the same Host Steward state, so the cycle that already
runs every five minutes asks this the way it asks everything else. A second timer
would be a second thing to supervise, to recover after a restart, and to explain
the day it disagrees with the first.

One attempt per period, keyed on the **attempt** rather than the success: a
maintenance that deferred all the way out has consumed its week and must not
spin.

> **A defect found while wiring this.** The Steward's `readState` projects an
> explicit field list and *drops anything it does not name*. The first wiring
> wrote `maintenance_last_attempt_ms` successfully and read back `null` for ever
> — a maintenance that would have run every five minutes believing it never had.
> The projection is correct design; the fix was to extend it, and a control now
> reads the raw file and the projected value separately so this cannot regress.

## 3. Drain: what a reboot may never interrupt

`PROTECTED_MUTATIONS` is not "important work". It is work whose interruption
**cannot be undone by re-running it**: a half-finished merge, a migration applied
without its ledger row — a shape this host has already produced twice — a toolkit
install between unpacking and linking. Each leaves a state no recovery pass can
infer.

A `database.read_census` is deliberately absent: interrupting one costs time, not
correctness.

```
protected mutation in flight → BLOCK
promotion train in flight    → BLOCK   (asked of DevOps 6, not reimplemented)
run EXECUTING                → BLOCK
run WAITING_RESOURCE         → warn    (it loses nothing to a reboot)
dirty worktree               → BLOCK
undurable commits            → BLOCK
```

A dirty worktree is not actually *harmed* by a reboot, so on strict safety it
could proceed. It blocks anyway: a maintenance cycle that reboots past
uncommitted work will eventually be the thing blamed for losing it, and waiting a
week costs nothing. The bounded defer window is what makes that affordable.

## 4. Checkpoint: semantics, not processes

Five requirements, each naming its owner, and **an unmeasured requirement blocks
exactly like a failed one** — a checkpoint you could not verify is not a
checkpoint. This is DevOps 5's law applied to a reboot.

The restart context is a **pointer set** — which lane, which run, what it was
about to do, what is blocking it. No transcripts. A future session reads it and
continues; it does not re-read a conversation.

## 5. Session restore, from lane truth

The tempting design is a file of named terminal sessions to reopen. It is wrong
here for a specific reason: Vacilando already knows the lane, run, worktree,
branch, checkpoint and next action, and a parallel list of terminal names would
be a second authority that goes stale the moment a lane moves — while knowing
strictly less.

```
RESUME          the provider lifecycle says the session survives
RECREATE        a new session built from durable context  ← the normal answer
HOLD            blocked; resumed with its blocker, not into it
NEEDS_OPERATOR  no durable next action — honestly unresumable
```

`NEEDS_OPERATOR` is why the checkpoint requirements are gates rather than
suggestions: every lane that lands there is one the operator has to reconstruct
by hand, which is the outcome this mission exists to prevent.

## 6. Updates: classified, not applied

| Class | Examples |
|---|---|
| `AUTO_SAFE` | patch-level tooling, certificate catalogs |
| `CANARY_REQUIRED` | Claude Code, model version, toolchain minor |
| `MANUAL_DEFERRED` | macOS major, Node major, database major, credential architecture |

**An unrecognised update kind is `MANUAL_DEFERRED`**, because the fail-closed
direction for an update is to not apply it. The canary *policy* is DevOps 9's and
is a named seam here, not an implementation; without it, `CANARY_REQUIRED`
updates are simply not applied and are reported as deferred.

## 7. Reboot: a gate and an intent

Four conditions, all required, and **no `force` parameter** — asserted by a
control. What comes back is an **intent**: `shutdown -r now`, plus the note that
launchd restores the Gateway without help. This module cannot restart a machine,
which is what makes every phase above it testable and an accidental import
harmless.

The window records `requested_at`, `ready_at`, `reboot_initiated_at`, `reason`
and the pre-reboot generation.

## 8. Defer, never force

Bounded twice — four hours elapsed, or 16 attempts — and when either runs out the
answer is **operator attention**, never force. The blockers are recorded on the
window so the operator does not rediscover them.

> A maintenance that cannot find a clean window is information about the host,
> not an obstacle to overcome.

## 9. Post-boot certification gates admission

Eight checks; **FAIL blocks and UNMEASURED blocks**. A failed certification lands
in `CONSTRAINED`, never silently in `NORMAL`, and says exactly what it could not
prove.

`generation_changed` is load-bearing: if the generation did not change, the host
did not reboot, however healthy everything else looks — proven by a control that
passes every other check and still refuses.

## 10. Health

`host.maintenance`, in the existing framework. **Severity chosen so the check
survives being true**: maintenance has never run on this host and cannot while
the soak is active, so "never run" is `healthy`, not a problem — the lesson
DevOps 4's coverage check already learned. A window stuck mid-phase is a `watch`,
because the next steward cycle resumes it and that is the design working. Only
`CONSTRAINED` is a `problem`.

## 11. Live dry run

Read-only, against the real host, during the soak:

```
$ vac-maintenance.mjs --preflight
phase          NORMAL
cadence due    true  (weekly maintenance has never run in this root)
drain safe     true  (0 active run(s), 0 protected mutation(s))
checkpoint     false (unmeasured: lane_next_action_recorded, lane_blockers_recorded,
                      accepted_executions_durable, worktree_durability_known, run_handoff_filed)

may reboot     false
  REFUSE  checkpoint: unmeasured: …
exit=1
```

Exactly right: the CLI measured no checkpoint requirements, so it refuses and
names all five. Nothing was rebooted, cleaned, or opened.

## Certification

`host-maintenance` — **50 passed, 0 failed**, covering all eighteen required
proofs including every protected mutation class, dirty and undurable survival,
the DevOps 3 and DevOps 6 delegations, window persistence across a simulated
process restart, generation identity, and bounded defer ending in attention.

Regression green: `promotion-train` 63/0, `development-migration-parity` 37/0,
`development-production-apply-owner` 28/0, `development-health` 30/0,
`development-host-steward` 39/0, `development-host-steward-automation` 23/0,
`development-control-plane-recovery` 20/0, `development-governed-approval` 38/0,
`development-governed-approval-ui` 18/0, `governed-action-handoff` 15/0, and the
DevOps 1–5 contracts (17/22/27/22/23, all 0 failed).

`development-execution-recovery` is **18 passed / 1 failed on the pristine base
too** (`live_foreign_owner` — the running Gateway legitimately owns the control
plane on this machine), verified by setting the work aside and re-running.
Pre-existing, unrelated.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No reboot was performed, no
Gateway restarted, no toolkit replaced, nothing installed, Host Lifecycle lane
and soak evidence untouched (`14b0e01dcd06` sampling normally throughout). Held
with `16601e54f`, `25c85997d` and `7cc1616c1`.

## DevOps 8 seam

`configurationAuditSeam()` names where the instruction audit runs: **in
`VERIFYING`, after the host has proven itself, and it gates nothing.** A
configuration audit is read-only and has no business holding up a reboot —
failing a maintenance cycle on prompt hygiene would be a category error. Its
findings are reported.

## Remaining debt

- **Not activated.** The orchestrator is complete and no scheduled cycle has ever
  run. The first real maintenance must wait for the soak to close, and the first
  one should be watched rather than trusted.
- **Checkpoint measurement is not wired.** `evaluateCheckpoint` is the gate and
  the five requirements name their owners, but nothing yet *collects* those five
  booleans from those owners — which is why the live preflight correctly refuses.
  That collection is the smallest remaining piece and belongs with the activation.
- **Cleanup executes nothing.** `planCleanup` returns intents; the execution path
  through each named owner is deliberately not wired while the soak is active.
- The reboot intent `requires_privilege: true` and no privilege path is
  established. An operator-run `shutdown` or a privileged helper is a decision
  for activation, not for this mission.
