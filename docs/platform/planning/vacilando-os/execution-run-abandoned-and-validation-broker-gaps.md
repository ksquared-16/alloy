---
owner: vacilando
status: open
raised_by: slot 4 — Participant Runtime productization (lane_2cea84351d90)
raised_on: 2026-08-21
---

# Follow-up for the Vacilando lane: an ABANDONED run has no recovery, and the validation broker cannot typecheck this repo

Four defects observed during one sprint on `lane_2cea84351d90`. All are orchestration/tooling debt.
**None of them is Participant Runtime product work, and none was repaired on that branch.** This
file records them precisely so the dedicated Vacilando lane can pick them up.

---

## V-1 — a run becomes ABANDONED while work is active, and the transition model offers no way back

**Observed.** Execution Run `erun_8983cb4301c1c487` was reported ORIENTED, then EXECUTING. Work
proceeded normally (five commits, a clean typecheck, a full browser certification). Partway through,
the run's state became `ABANDONED` without the lane doing anything to abandon it — the worker did
not stop, crash, or hand off.

**Consequence.** Every subsequent report was refused:

```
vac run-status … executing  -> illegal_transition (ABANDONED → EXECUTING)
vac run-status … complete   -> illegal_transition (ABANDONED → COMPLETE)
```

So a run that was still producing work could no longer report a checkpoint, could not report
completion, and could not be resumed. The engineering result was delivered, but the gateway's record
of it says the run was abandoned — the orchestration state and the truth diverged, silently, in the
direction that loses work.

**What the lane needs decided (not proposed here — this is the Vacilando lane's call):**

1. **Why did it transition?** The likeliest candidate is a liveness/staleness timer that treats
   "no `run-status` call for N minutes" as abandonment. A worker doing one long, legitimate unit of
   work (a 6-minute typecheck, a browser certification) emits no bounded state change during it. If
   that is the rule, the heartbeat and the progress report are being conflated: a lane that is
   *working* is not a lane that is *reporting*.
2. **`ABANDONED` should not be terminal for a live worker.** Either an explicit reclaim transition
   (`ABANDONED → EXECUTING` when the original agent session reports in), or the staleness sweep
   should move a run to a recoverable state rather than a terminal one.
3. **A refused transition should say what to do.** `illegal_transition (ABANDONED → EXECUTING)` tells
   the worker the call failed and nothing else. It should name the reclaim path, or state plainly
   that the run is unrecoverable so the worker reports out-of-band immediately instead of
   discovering it at completion.

---

## V-2 — `vac run typecheck` cannot typecheck this repository

**Observed.** `vac run typecheck` fails every time with `Abort trap: 6` (rc=134). The command is
hardcoded in `scripts/local-dev/lib/common.sh`:

```
node --max-old-space-size=4096 node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit
```

`web/` needs more than 4 GB: the process reaches ~4.1 GB RSS and V8 aborts. Under an 8 GB ceiling
the same command completes in ~90 s with **rc=0**.

**The toolkit already knows the right number.** `~/bin/alloy-dev/alloy-config.example` ships:

```
ALLOY_TYPECHECK_COMMAND='node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit'
```

and `alloy-validate`'s own `typecheck:tests` kind also uses 8192. So the `vac` broker's 4096 is the
outlier, not a deliberate budget.

**`NODE_OPTIONS_DEFAULT=8192` does not reach it** — the value is resolved before the override can
apply, and the running process still shows `--max-old-space-size=4096`.

**Worse than the failure: how it is reported.** The broker classifies the abort as

```
FINISH … kind=typecheck rc=134 class=config
warning: typecheck FAILED TO START (CLI/config error, not a test failure) — result not cached.
warning: the command never ran: node --max-old-space-size=4096 …
```

"FAILED TO START" and "the command never ran" are both false — the command ran for ~70 s and
consumed 4 GB before aborting. That misclassification sends a worker looking for a missing binary or
a bad tsconfig instead of at memory, and cost several wasted attempts here.

**Working path used instead** (still brokered, still lease-serialized, so no host-load rule is
bypassed):

```
vac run command -- node --max-old-space-size=8192 node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit
```

**Suggested fixes:** raise the `vac` default to 8192 to match the toolkit's own config; honour
`NODE_OPTIONS_DEFAULT`; and classify SIGABRT/OOM as a resource failure rather than `class=config`.

---

## V-3 — Vacilando-created worktrees register no toolkit metadata, so the whole `alloy-*` surface refuses them

**Observed.** `~/.local/state/alloy-dev/gateway/metadata/` was **empty**, and `alloy-agent-status`
listed every slot as `free` while a lane was actively bound to slot 4. Consequences:

```
alloy-dev-start wt4-…   -> error: unknown worktree metadata: wt4-… (…/metadata/wt4-….env)
alloy-validate wt4-… …  -> error: unknown managed agent: wt4-…
alloy-validate --cwd …  -> error: internal: --cwd requires ALLOY_VALIDATE_RESOLVED_NAME
```

So the sanctioned way to start a dev server and the second validation broker were both unavailable,
and `vac run command --` was the only remaining brokered path.

**Reconstructed by hand** from values that already agreed across the assignment card, the slot map
and the lane binding (nothing was invented):

```
ALLOY_WORKTREE_NAME / _PATH / _BRANCH / _SLOT / _PORT, PORT, NEXT_PUBLIC_APP_URL, ALLOY_AGENT
```

With that file present `alloy-dev-start` works normally, trusted server-env injection included.

**Note both field names.** `lib/common.sh` requires **`PORT`**; the conductor writes
`ALLOY_WORKTREE_PORT`. The reconstructed file sets both. This is the same writer/reader mismatch
recorded previously for slot 6 — it is still unfixed, and it now compounds with the metadata being
absent entirely.

**Suggested fix:** `provisionLaneBinding` should write the gateway metadata file when it binds a lane
to a slot, using the same field names `lib/common.sh` reads.

---

## V-4 — the two gaps compound into a false blocker

Taken together, V-2 and V-3 leave a worker with *no working heavy-validation path* and *no working
dev server*, each failing with a message that reads like a permissions or configuration wall. The
recorded failure mode for exactly this shape is a worker concluding "validation cannot run in this
runtime" and shipping an evidence pack saying so. It is not a wall; it is two resolution bugs and a
misclassified OOM.

Until V-2 and V-3 land, a worker in a Vacilando-created worktree should:

1. reconstruct the gateway metadata file from the assignment card, then use `alloy-dev-start`;
2. run heavy validation via `vac run command -- node --max-old-space-size=8192 …`;
3. treat `class=config` on a `typecheck` kind as **suspected OOM** until the log is read.
