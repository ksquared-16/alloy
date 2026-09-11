# Host Lifecycle & Control-Plane Efficiency V1 — authority map

Required first artefact: for each A–G concern, the **current canonical owner**, the
**exact defect**, and the **minimal change**. Nothing is implemented before it appears here.

Baseline re-observed live at 2026-09-11T22:08:52Z, not assumed from the handoff:

| | |
|---|---|
| staging | `9f14a6b67d90983dde256b9a38721c436212491c` |
| `toolkit/current` | `9f14a6b67d90` |
| running Gateway | `9f14a6b67d90`, pid 29113, RSS 328 MB, started 15:00:33 local |
| gateway-host | pid 29098, RSS 36 MB |

PID claims re-measured (the handoff's three were stale as a list — there are five, and two are new):

| claim | pid | state |
|---|---|---|
| access-identity | 43904 | ALIVE `npm run start` |
| attendance | 32871 | ALIVE `npm run dev` |
| documentation-api | 33579 | ALIVE `npm run dev` |
| work-items | 20916 | ALIVE `npm run dev` |
| wt4-enrollment-phase2-participant-anchor | 53185 | ALIVE `npm run start` |

---

## The loop, measured on this host today

The September 11 shape is not historical. It was still running **today at 22:06:54Z**, and it
stops only because every claim currently resolves to a live process — never because it converged.

Distinct `stale_slot_pid` targets in the last 5000 recovery events:

```
  2487  14:06:39..21:15:14  gateway/pids/wt5-vacilando.pid
  2370  14:07:09..21:15:14  gateway/pids/financials.pid
    39  21:09:45..22:06:54  gateway/pids/wt4-enrollment-phase2-participant-anchor.pid
    36  21:09:45..21:15:14  gateway/pids/wt6-surfaces-faacca.pid
    28  21:09:45..22:01:04  gateway/pids/attendance.pid
    28  21:09:45..22:01:04  gateway/pids/documentation-api.pid
```

One target looping for **seven hours**. Type histogram over the last 2000 events:

```
665 recovery_detected   665 recovery_classified   660 recovery_exhausted
  5 recovery_attempted    3 recovery_failed         2 recovery_verified
```

Detected ≈ classified ≈ exhausted, with almost no attempts. That is not recovery working hard;
that is a terminal condition being rediscovered forever.

**Ledger growth right now: 0 bytes / 0 lines over 3 minutes**, with all five claims alive —
confirming the loop is driven entirely by unconverged stale claims, exactly as the incident
concluded.

### One correction to the incident write-up

The directory in play is `<gateway root>/pids` — `~/.local/state/alloy-dev/gateway/pids` — **not**
the host pids dir `~/.local/state/alloy-dev/pids`, which is empty. This matters: the
`stale_slot_pid` policy declares `escalation: "host ~/.local/state/alloy-dev/pids is observe-only"`,
and `scanStaleSlotPidFiles` gates unlinking on `dir !== host`. Because the Gateway's dir is not the
host dir, **the repair is permitted**. The claims were not stuck because repair was forbidden. They
were stuck because the budget was spent and nothing terminalized.

---

## A — recovery convergence

**Canonical owner** `lib/vacilando/execution-recovery.mjs` — `RECOVERY_POLICIES`,
`RECOVERY_BUDGETS`, `executeRecovery`, `scanStaleSlotPidFiles`, `recovery-budgets.json`.
Driven by `lib/vacilando/execution-reconcile.mjs` → `reconcileGovernor({ depth: "targeted" })`
every 30s from `vacilando-server.mjs:3022`.

**Exact defect** `RECOVERY_BUDGETS.stale_slot_pid = 1`. `bumpBudget` increments and never resets;
`budgetExhausted` therefore returns true forever after the first attempt. On every later pass
`executeRecovery` emits `recovery_exhausted` and returns — and **the claim is still on disk**, so
the next `scanStaleSlotPidFiles` finds it again. There is no terminal state for a resource, only a
spent budget for an episode. `detect → classify → exhausted` repeats at the reconciliation cadence
for as long as the file exists.

**Minimal change** Add terminalization to the existing budget store — no new store, no new owner.
When an episode is exhausted or the resource is proven definitively unrecoverable, record a
**terminal episode** keyed by the resource identity plus an evidence fingerprint. `executeRecovery`
returns early and silently for a terminal episode whose fingerprint is unchanged. Any change in the
evidence (pid differs, file recreated, mtime moves) clears the terminal state and recovery runs
again. Ambiguous ownership still fails closed and is never terminalized.

**Tests** Synthetic stale PID fixture reproducing the September 11 shape; convergence in one pass;
fingerprint change re-arms; ambiguous ownership refuses.

## B — recovery event deduplication

**Canonical owner** `emitRecoveryEvent` in the same module.

**Exact defect** `recovery_detected` and `recovery_classified` are emitted **unconditionally at
function entry**, before the thrash check and before the budget check. So even a deterministic no-op
appends three lines per pass per resource. 4 stale claims × 2 targeted passes/min × 3 events =
**24 events/min**, the measured rate exactly.

**Minimal change** A stable resource identity (`policy` + `target` + evidence fingerprint) decides
whether an observation is new. Unchanged terminal conditions emit nothing. The lifecycle still emits
once per genuine transition, so history stays complete for anything that actually happened.

**Tests** Ten successive targeted reconciliations over one unchanged terminal condition append zero
lines (acceptance 2); healthy no-op reconcile performs zero persistent writes (acceptance 4).

## C — cheap/targeted reconciliation efficiency

**Canonical owner** `reconcileGovernor` in `execution-reconcile.mjs`.

**Exact defect** `depth: "cheap"` is not cheap. Every 10s it runs, unconditionally and regardless of
whether anything changed: agent-session runtime reconcile, `reconcileNeedsInputWithoutInput`, a full
read of the resource-request store, the exclusive-window evaluation, `reconcileStaleExecutionRuns`,
`reconcileUndeliveredRuns`, `evaluateAdmissionQueue`, `reconcilePendingOrientation`,
`reconcileStuckStartingSessions` and `tickAutomaticSessionRotation`. `runs.json` is 4.1 MB and is
re-read and re-parsed by several of these — the `fs ReadFileUtf8 → JSON.parse → GC` hot path the
incident sampler caught.

**Minimal change** Keep every correctness guarantee; gate the expensive ones on dirty signals.
Measure first, then cut — with a recorded p95 before and after.

**Order** After A/B, because the dedup work establishes the write-free healthy path that acceptance
4 measures.

## D — heavy collector isolation

**Canonical owner** `lib/engineering-health/` (`collectors/git-repos.mjs`, `ide-caches.mjs`,
`node.mjs`, `docker.mjs`, `services.mjs`). Invoked from `vacilando-server.mjs:2730-2749`.

**Exact defect** `engHealthTick` does `import("./engineering-health/index.mjs").then(runEngineeringHealth)`
— **inside the Gateway process**. Its collectors are `execFileSync`: `du -sk` per worktree
`node_modules`, `docker version`, `ps`. Synchronous calls on the event loop of the long-lived
server. The existing comment concedes it — *"Heavy sync du/ps collectors — do NOT run on cold open
(starves HTTP)"* — and the mitigation was only to delay the first run to 10 minutes, which is the
observed ~10-minute burst, not a fix.

**Minimal change** Run the existing collectors in an isolated bounded subprocess and have the
Gateway consume the cached report. Engineering Health keeps ownership of *what* is collected; only
*where it executes* changes. No new host-health system.

## E — provider availability / backoff

**Canonical owner** `lib/engineering-health/collectors/docker.mjs` (already detects
`Cannot connect|Is the docker daemon|not found`) and `collectors/services.mjs`.

**Exact defect** Unavailability is recomputed from scratch every cycle and re-logged. Docker is
optional, and an optional provider that is absent should become a **state**, not a repeated probe.

**Minimal change** A modelled provider-health record with bounded retry/backoff, consumed by both
collectors. An explicit provider-dependent operation, or new evidence of availability, forces an
immediate recheck. Rides D's isolation, so it is the same change-set.

## F — resource ownership + host/runtime generation

**Canonical owners, confirmed present — do not duplicate any of these**

| resource | owner |
|---|---|
| owned processes | `execution-recovery.mjs` — `owned-processes.json`, `registerOwnedProcess`, `listOwnedProcesses` |
| control-plane ownership | `control-plane-health.mjs` — `claimControlPlaneOwnership`, `acquireControlPlaneOwnership`, `pidAlive` |
| dev-server ownership | `server-arbitration.mjs` / `server-fleet-observation.mjs` — `ownership_state` |
| slot | `ensureLaneSlot` / `slotReclaimCandidates` / `reassignSlot` |
| lane / run | `development-lane.mjs`, `execution-run.mjs` |
| stack lease | `alloy-stack` |

**Exact defect** There is **no host/runtime generation anywhere in the tree.** Grepped: the only
matches for "generation" are unrelated prose and `generation_basis` in engineering artefacts.
Ownership is therefore decided by PID number alone, and `pidAlive` cannot distinguish "my process,
still running" from "a different process that reused the number after a restart". Acceptance 10 is
unmet by construction.

**Minimal change** Stamp a `runtime_generation` in `claimControlPlaneOwnership` — the one place that
already runs once per control-plane process and already writes `claimed_at` and `host`. Carry it on
records written by `registerOwnedProcess`. Ownership is then `pid alive AND generation current`. A
restart makes every prior-generation claim provably stale without a new registry.

## G — teardown + host health / admission

**Canonical owners** `closeDurableLane` (sole authority that may retire a lane's worktree),
`releaseSprintSlot`, Host Steward (`vac-host-steward.mjs`, cadence + recheck at
`vacilando-server.mjs:2804-2812`), `getControlPlaneHealth`.

**Exact defect** To be established during implementation: teardown must be *verified*, and host
health must exist as an admission input. Both build on F's generation, so F precedes G.

**Explicitly not started with a new Resource Registry.** The owned-process registry already exists.

---

## Known separate residual — deferred, with reason

A governed QA request executing through `existing_lane_standing_authorization` bypasses the
approve-time slot preflight; if it loses its slot between filing and execution it fails closed
rather than reacquiring. The natural seam would be `processGovernedAction` / `executeGovernedAction`,
both **synchronous**, while `ensureLaneSlot` is async. Closing it means either changing those
signatures or introducing a second allocation path — the first is out of scope for a host-lifecycle
sprint, the second is prohibited. **Deferred.** It fails closed, so it is safe where it is.

## Dependency order

```
A ─┬─> B ──> C            A and B share the budget/event store; C's acceptance
   │                      (zero writes on a healthy pass) is only measurable after B
D ─┴─> E                  E rides D's isolated collector
F ────> G                 G's teardown verification needs F's generation
```

## The gate that cannot be met today

Acceptance 12 requires a 24-hour soak. It is wall-clock and cannot be short-circuited.
`COMPLETE_PROMOTED` is therefore not claimable in this run, whatever else passes.
