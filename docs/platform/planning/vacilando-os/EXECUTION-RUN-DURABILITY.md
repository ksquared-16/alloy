---
owner: platform
status: doctrine
last_reviewed: 2026-08-21
---

# Vacilando — Execution Run durability, abandonment, liveness, and recovery

Canonical contract for the Execution Run state machine. Implemented in
`scripts/local-dev/lib/vacilando/execution-run.mjs` (state machine, recovery)
and `execution-stale.mjs` (abandonment classification).

An **Execution Run** is one operator-approved instruction, tracked from
acceptance to a terminal outcome. It is attached to a `lane_id`, not to a host,
a worktree, a tmux pane, or a provider session. Those are all replaceable; the
run is not.

---

## 1. States

```
QUEUED ──> EXECUTING ──> VALIDATING ──> COMPLETE
             │  ▲            │
             │  │            ├──> NEEDS_INPUT ──> EXECUTING
             │  │            └──> FAILED
             │  └── WAITING_RESOURCE
             │
             └──> ABANDONED ──> RECOVERING ──> EXECUTING / VALIDATING / COMPLETE
```

| State | Meaning |
|---|---|
| `QUEUED` | Approved, not yet delivered to a worker. |
| `EXECUTING` | A worker owns the instruction. |
| `WAITING_RESOURCE` | Blocked on a scarce resource or a Director-owned capability. |
| `VALIDATING` | Running the validation the work requires. |
| `NEEDS_INPUT` | Blocked on an operator decision. |
| `RECOVERING` | Re-entered after abandonment, with ownership proven. |
| `COMPLETE` | The work finished. **Irreversible.** |
| `FAILED` | The work itself failed. **Irreversible.** |
| `ABANDONED` | No viable worker owns this run. Terminal for scheduling, **recoverable**. |

`COMPLETE` and `FAILED` are irreversible: nothing reopens them, ever.
`ABANDONED` is terminal for scheduling — it releases the lane — but it is not
a dead end. `RECOVERING` is its only exit.

---

## 2. What ABANDONED means

> **ABANDONED** means Vacilando holds *positive evidence* that this run no
> longer owns a viable worker or session, and the operator has not continued it.

It explicitly does **not** mean:

> "no checkpoint arrived recently."

**Inactivity is not abandonment.** Long agent work legitimately runs for tens of
minutes with no state transition: reading a subsystem, planning, compiling,
waiting on a brokered validation. A run that is silent is *ambiguous*, and
ambiguity is resolved by the operator, never auto-terminalized by the governor.

`ABANDONED` is also not `FAILED`. `FAILED` means the work failed. `ABANDONED`
means the run stopped being live work. A stale certification soak is not a
product failure.

### 2.1 Why this had to be written down

Before this contract, a run was abandoned two minutes after delivery whenever no
agent report had landed yet (`orphaned_pre_protocol_run`). Two liveness signals
were structurally dead, so that condition was true for essentially every run:

1. **`sends.activity_at` is a notification-dedup timestamp, not a liveness
   clock.** `noteOutputAfterInstruction` writes it exactly once per delivered
   instruction and then short-circuits on `notification_emitted_at`. It is
   normally written within seconds of delivery, which *also* classifies it as a
   delivery echo — so `genuine_recent_activity` was false for the entire life of
   almost every run.
2. **The worker's most natural report was discarded.** `vac run-status <run>
   executing` on an already-`EXECUTING` run returned early from
   `transitionExecutionRun` as a noop: no transition appended, no progress set.
   `hasAgentReport` therefore stayed false no matter how often the agent
   reported.

Measured on the operator's live store at the time of the repair:

| Fact | Value |
|---|---|
| Runs recorded | 53 |
| `ABANDONED` | 44 |
| of those, `orphaned_pre_protocol_run` | 39 |
| abandoned within 150s of delivery | 42 of 44 |
| median survival | 124.9s (the first governor sweep past the 120s settle) |
| runs that ever reached `COMPLETE` | 4 |

After abandonment the worker's reports returned `illegal_transition`, so a
sprint that completed successfully could not be recorded as complete. Vacilando's
execution state diverged from reality by design, not by accident.

---

## 3. Liveness

Liveness is **positive, cheap, and durable**. No pane capture, no transcript
parsing, no TUI glyph reading, no subprocess. Classification is a pure read over
JSON plus a handful of `stat` calls.

| Signal | Source | Window |
|---|---|---|
| Worker heartbeat | `run.last_worker_report_at` — any agent-origin report, *including a same-state one* | 45 min protective / 4 h before tier-2 abandonment |
| Agent session | an active-ish durable session for the lane | while alive |
| Worktree activity | newest mtime of `.git/HEAD`, `index`, `logs/HEAD`, `COMMIT_EDITMSG` | 45 min |
| Open resource / in-flight continuation | resource request store | while open |
| Protective run states | `VALIDATING`, `RECOVERING`, `WAITING_RESOURCE`, `NEEDS_INPUT` | always |
| Output activity | `sends.activity_at`, ignoring delivery echoes | 30 min |

**A same-state report is liveness.** `vac run-status <run> executing` on an
already-executing run is not a transition, but it *is* proof the worker is
alive. It persists `last_worker_report_at` and increments
`worker_report_count`.

Settle window: **20 minutes** (was 2). A worker that orients, reads a subsystem
and plans before its first report is normal, not dead.

The reconcile module must never mutate the worktree. This is asserted directly:
no subprocess, no mutating git verbs, no filesystem writes.

---

## 4. When the governor may abandon

Auto-abandon requires **all** protective signals to be exhausted *and* positive
evidence of a dead worker. There are two tiers, and both require the same
baseline: `no live agent session AND no recent worktree activity`.

**Tier 1 — never spoke.** `worker_report_count == 0`. Nothing on this lane has
proven the reporting protocol works, so an orphan is the likeliest reading.
Abandonable past the settle window (20 min).

- `orphaned_pre_protocol_run` — no agent session, no worker report, and no
  worktree activity.
- `stale_certification_run` — the same, for a certification/soak run.

**Tier 2 — spoke, then went silent.** `worker_report_count > 0` and the last
heartbeat is older than `ABANDON_AFTER_HEARTBEAT_MS` (4 hours). A lane must not
be blocked forever by a worker that really is gone, but a run that has proven it
speaks the protocol earns a far longer grace than one that never did.

- `worker_gone_after_reporting`.

Everything in between is classified **ambiguous** and left alone. An operator
may close an ambiguous run deliberately (`closeStaleExecutionRun`); the governor
may not.

> A previous `has_agent_report -> ambiguous` short-circuit sat *before* this
> evaluation and made tier 2 unreachable, so a lane could be blocked
> indefinitely. It is now the fallback after the dead-worker check, not a veto
> before it.

---

## 5. Recovery and ownership proof

`recoverExecutionRun()` is the only path out of `ABANDONED`. It requires:

1. the run is `ABANDONED` — `COMPLETE`/`FAILED` are refused as `run_irreversible`;
2. the durable lane still exists;
3. the claimed lane matches the run's lane (`lane_mismatch` otherwise);
4. **ownership proof**, one of:
   - `worktree_cwd` — the claimant's cwd is inside the run's worktree, or
   - `operator_binding` — the operator acts on a lane whose binding still
     resolves to the run's worktree;
5. the lane has no other active run (`lane_has_active_run` otherwise);
6. the run is under its recovery budget (8).

There is **no arbitrary `ABANDONED -> EXECUTING`.** A caller with no proof gets
`ownership_unproven`. A caller in a different worktree gets `worktree_mismatch`.
An abandoned run cannot be hijacked by another lane.

Recovery is **idempotent**: a duplicate attempt on an already-`RECOVERING` run
returns `already_recovering` and does not count as a second recovery.

### 5.1 A worker report recovers its own run

If a worker reports on a run Vacilando abandoned, and lane and cwd ownership
already check out, the report *is* the disproof of the abandonment. The run is
recovered transparently and the report applied, rather than answering
`illegal_transition`. This is the operator-visible repair: a sprint can always
reach `COMPLETE`.

### 5.2 History is never rewritten

Recovery appends. The abandonment transition stays exactly where it was:

```
null -> QUEUED -> EXECUTING -> ABANDONED -> RECOVERING -> EXECUTING -> COMPLETE
```

`recovery_state` records `abandoned_at`, `abandoned_reason`, `ownership_proof`
and `origin`; `recovered_count` increments. `execution_run.recovered` is
appended to `events.jsonl`. Nothing is deleted or edited.

---

## 6. Completion after recovery

A recovered run progresses normally: `RECOVERING -> EXECUTING -> VALIDATING ->
COMPLETE`, or to `NEEDS_INPUT` / `FAILED`. `RECOVERING -> COMPLETE` is also
legal, because work that genuinely finished must never be impossible to close
merely because Vacilando abandoned the run mid-sprint. Ownership was already
proven to enter `RECOVERING`.

---

## 7. Notification

`ABANDONED` is an outcome push, alongside `COMPLETE`, `NEEDS_INPUT` and
`FAILED`. It was previously excluded, so a run Vacilando closed on the
operator's behalf ended in silence — the live store held 73 abandonment events
and not one dispatch. The outcome the operator did not ask for is the one they
most need to hear about. The push names the abandonment reason and points at the
lane so it can be continued.

---

## 8. Operator surface

The previous-run card distinguishes four things, never collapsing them:

- **`ABANDONED` — recoverable.** Lane and worktree still match. The card offers
  **Continue this run**, which calls `POST /api/lanes/:id/run/recover`. The
  operator never has to create a fake new run to continue the same sprint.
- **`ABANDONED` — not recoverable.** The card says why: newer work owns the
  lane, the binding no longer matches, the lane is gone, or the recovery budget
  is spent.
- **`FAILED`** — the work failed.
- **`COMPLETE`** — the work finished.

`executionRunRecoverability()` is a dry run of the ownership gate, so the UI can
show recoverability without attempting a transition.

---

## 9. Existing runs (migration)

**No historical run is mutated.** The new contract changes what *may* be
abandoned from now on, and makes past abandonments recoverable where ownership
is still provable. Nothing is rewritten, re-opened, or re-classified in place.

Applied to the operator's live store at the time of the repair:

| Outcome | Count |
|---|---|
| Existing `ABANDONED` runs | 45 |
| Now recoverable on operator continuation | 28 |
| Correctly blocked — newer work owns the lane | 17 |

Future operator continuation is sufficient. No migration step is required, and
none should be added: silently reopening historical runs would rewrite audit
history to fix a bug in how it was written.

---

## 10. Tests

`bash scripts/local-dev/tests/run-execution-durability-tests.sh`
(`npm run local-dev:test:execution-durability`).

State-machine tests over durable JSON with injected clocks — no browser, no
tmux, no wall-clock dependence:

1. an active long-running run is not abandoned on silence alone
2. a genuinely dead worker can become abandoned
3. an abandoned run with verified ownership can recover
4. an abandoned run cannot be hijacked by another lane or worktree
5. a recovered run can complete
6. audit history preserves abandonment *and* recovery
7. Gateway restart does not falsely terminalize a healthy lane
8. browser disconnect does not equal abandonment
9. duplicate recovery attempts are idempotent
10. terminal `COMPLETE` remains terminal
11. an abandoned run left alone is never auto-resurrected
12. abandonment notifies the operator instead of dying silently
13. a worker that reported and then truly died is abandoned, but only after a
    long multi-signal silence — and stays recoverable
