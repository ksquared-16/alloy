---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Async Command Acknowledgement & Message Send Reliability V1

**Status.** Implemented and certified. Promotion blocked only by the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `66908d699`.
**Depends on.** Director Governance V1 @ `f1089527b`, merged into this lane as its
first commit — see [The dependency](#the-dependency).

---

## 1. The one defect behind two symptoms

The HTTP request owned too much downstream work. Both operator-facing paths did
their entire job inside the request, so the browser could not learn that its
intent had been accepted without holding a connection open through the work.

That is where the resemblance ends, and treating them as one client-state bug
would have fixed neither.

## 2. Governed-action acknowledgement

### Before

`POST /api/v2/governed-actions/approve` awaited, in one request lifetime:
grant mint → decision persistence → `executeGovernedAction` → trusted-host
execution → `resumePromise` → lane resume → continuation delivery.

`database.read_census` declares a 180 s timeout; `database.apply_promoted_migration`
declares **600 s**. The browser therefore could not distinguish *"my approval was
accepted"* from *"the action has finished"*.

### Measured

With an executor that blocks the event loop for 1200 ms — a faithful model, since
the real executors run `execFileSync` against `gh` and `psql`:

| | |
|---|---|
| Approve, awaiting execution (baseline) | **1240 ms** |
| Approve, acceptance only | **1 ms** |

### After

```
POST approve
  → validate request, fingerprint, duplicate guard
  → infrastructure preflight
  → mint grant, persist decision            ← durable
  → record async_execution claim            ← durable
  → 202 Accepted
  → durable owner executes
  → projection converges
```

Everything above the return was already the decision; everything below it was the
work. The split is exactly there.

**Durability owner: `tickGovernedActions`.** `async_execution` is a durable claim
on the record, not a Promise. A record carrying it with no `execution_started_at`
is unambiguously *accepted, never started* — a shape only this path produces,
which matters because `processGovernedAction` deliberately refuses to resume an
`awaiting_operator` record that merely *looks* approved, and it is right to.

**The tick had to be made to run.** It was invoked at boot warm and from two
request-driven paths and **nowhere on a schedule**. That was survivable while
approval executed inline; it is not survivable behind a 202. It now runs on the
Gateway's existing 30 s recovery cadence — the same owner as the governor, not a
new loop.

`scheduleAcceptedExecution` starts the work on the next macrotask so an approval
begins promptly. It is an optimisation and is written so that losing it costs
nothing: if it never runs, throws, or dies with the process, the tick finds the
same record in the same shape. That is the difference between an optimisation and
an unowned Promise.

### Interruption is settled, never replayed

A record that started executing and never settled is either running now or was
abandoned, and from the store those look identical. Time is the only honest
discriminator, taken from the action's **own declared `timeoutMs`, doubled**, with
a 10-minute floor — so `apply_promoted_migration` gets 20 minutes, and a future
action with a longer timeout is covered the day it is registered.

Picking it up does **not** mean re-running it. `settleInterruptedAcceptedExecution`
fails it as `execution_interrupted` with a named reason. Nothing in the record can
distinguish "never ran" from "ran and we did not see the result", and for a
migration the difference is applying it twice — both migration actions declare
`maxAttempts: 1` and this honours that at the recovery layer. The ambiguity is
reported; it is not guessed.

### HTTP contract

| Outcome | Status |
|---|---|
| Accepted, owned, executing asynchronously | **202** |
| Synchronous completion (every non-HTTP caller) | 200 |
| Refusal, stale fingerprint, terminal | 409 |

202 is used **only** where the decision, the authority and the execution claim are
already on disk, so it means what it says. It is not a softer 200.

`awaitExecution` defaults to `true`. Every other caller — the tick, the CLI, the
certification fixtures, the conversation path — keeps the behaviour it has always
had. Only the route with a browser on the end of it asks for acceptance.

## 3. Message-send acknowledgement

### What was already right

`sendCurrent` already set `G.sending`, painted `"Sending…"`, and guarded re-entry
**before** the fetch. The duplicate protection was not missing.

### What was wrong

The draft was cleared inside the success branch, so the operator's text sat in an
**editable box** until the POST resolved. A composer still holding what you typed
is the strongest signal a UI can give that nothing happened, and it overrode every
other signal on screen.

### Measured, across 163 real sends

| | |
|---|---|
| created → provider acknowledged, median | **0 ms** |
| p75 | 0 ms |
| **p95** | **30,161 ms** |
| max | 201,082 ms |
| over 500 ms | 26 sends (16%) |
| over 5 s | 21 sends (13%) |

Most sends are instant, which is why this was invisible in normal use. One in six
held the composer for over half a second and one in eight for over five seconds.
The operator was seeing the tail.

### After

The composer empties on the press. The text is not discarded, it is **moved** to a
per-lane `pending_send` snapshot rendered directly above the composer it left, so
it is still on screen and still the operator's.

- **Accepted** (`delivered`, `queued`, `accepted`) → the snapshot is dropped; the
  projection owns the message and there is no double render.
- **Refused before acceptance** (`current_run_active`, `send_in_progress`,
  `provider_prompt_not_ready`, every validation refusal) → the text goes back into
  the composer.
- **Network failure** → same, with a notice that says where the message went.
- **Refused while the operator has typed something new** → restoring would
  overwrite live work, a worse loss than the one being repaired. The snapshot is
  held, marked recoverable, and offered with an explicit control that *appends*
  rather than replaces.

### Why the endpoint contract is unchanged

The mission asks whether `POST /api/lanes/:id/instruction` should return 202. The
evidence says no, and the reason is specific rather than conservative: **the slow
paths already return early.** `provisionSessionForSend` and
`queueWithoutImmediateDelivery` hand the run to `execution-admission` and answer
`queued` without waiting — that is where the 30 s p95 lives, and it is already
decoupled. What remains inside the request is the paste itself, which *is* the
delivery guarantee the mission says not to regress. Turning a delivered/failed
answer into an accepted answer would lose information for no measured benefit.

`createQueuedRun` is the durable acceptance point and `execution-admission` is the
queue. Neither needed to be built, and building a second one would have been the
error the mission warns about.

## 4. Approval UI

`READY → SUBMITTING → ACCEPTED → (projection) EXECUTING → terminal`, or
`READY → SUBMITTING → FAILED` with explicit retry.

Governance V1's one-click guarantees are intact: state lives in the view and
survives repaints, the press paints before the network, a second press issues no
mutation, and a duplicate reads as accepted rather than as an error. What is added
is that **ACCEPTED is distinct from COMPLETE** — labelling a 202 "Approved" would
be true and still let the operator read a finished action where there is a started
one. `isGovernedDirectorWait` already treats `executing` as a governed wait, so the
lane surface carries the executing state without new vocabulary.

## 5. Certification

`async-acknowledgement-latency` — **15 passed, 0 failed**, covering: the baseline
coupling (kept as a control, so a green result means decoupling and not a broken
harness); acknowledgement under budget; durability before the answer; the tick as
owner; no double execution across repeated ticks; duplicate approval minting no
second grant; Gateway restart between acceptance and execution; interrupted
execution settled and never replayed; a fresh execution left alone; downstream
refusal still terminal; and the full composer lifecycle including per-lane
isolation and the do-not-overwrite rule.

Regression sweep green across the governed-action, approval, promotion-chain,
dependency, notification, authority, standing/exact authorization, executor,
handoff, retention, capability-freshness, composer and run-recovery suites.

**Two source-text assertions were repaired, not silenced.** Both asserted *how*
code was written rather than what it guaranteed:

- `development-governed-approval-ui` #12 sliced the first 1200 characters after a
  function declaration; two documented options pushed `rejectStaleDecision` out of
  the window. It now slices to the function boundary.
- `development-gateway-ui` matched the literal success condition; it now asserts
  the *set of statuses* that count as accepted, and that no refusal status joins
  them — which is the part that must not quietly grow.

**Pre-existing failures, verified identical before and after** by reverting the
working tree and re-running: `development-lane-send` (6 passed, 11 failed),
`development-gateway-ui` browser-auth POST route (401 vs 404),
`development-gateway-ui-v2`, `development-gateway-mobile-chat`. Untouched and not
claimed as fixed.

## 6. Governance V1 compatibility

`decision_timing` is preserved and used — `accepted_at − submitted_at` is now the
browser-facing acknowledgement latency, which is what the instrumentation was
built to measure. Autonomous classification, census delegation, environment/target
semantics, approval idempotency, duplicate-grant prevention, `escalation_reason`,
`authorization_basis`, required-check refusal and migration protections are all
untouched; their suites are green in this lane.

## The dependency

This lane is cut from `origin/staging` @ `66908d699` with `promote/director-governance-v1`
merged in as its first commit. The merge is clean, and it makes the dependency a
fact of the branch rather than a sentence somebody has to read.

**This candidate must land after `f1089527b`, or as one promotion containing
both.** It must not be promoted in a way that strands the governance work.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Installing would replace the
Gateway and toolkit while the authoritative 24-hour Host Lifecycle soak runs
against `14b0e01dcd06`, restarting criterion 12. Nothing in this work touched that
lane, its worktree, its evidence or its soak.
