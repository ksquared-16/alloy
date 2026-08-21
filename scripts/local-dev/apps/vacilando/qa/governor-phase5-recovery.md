# Phase 5 — Bounded self-healing + reconciliation

**Status:** implemented. Stop after this phase.  
**Date:** 2026-08-18  
**Sprint:** `vacilando-gateway-v2` slot 5  
**Stores:** `{ALLOY_RUNTIME_ROOT}/vacilando/execution-runs/recovery-budgets.json` + `recovery-events.jsonl`

This is **bounded operational self-healing**. It is not autonomous product decision-making, session orchestration, or a workspace doctor.

Governing rule: **never guess destructively. Repair only when evidence proves the recovery is safe.**

---

## 1. Recovery-policy registry

Code-owned in `execution-recovery.mjs`. Configuration cannot invent shell remediations. Unknown keys return `REQUIRES_JUDGMENT`.

| key | classification | budget | repair |
|---|---|---|---|
| `stale_governor_resource_holder` | RECOVERABLE | 1 / episode | canonical `releaseResourceRequest` / `exclusiveGrantRelease` |
| `abandoned_browser_cert_lease` | RECOVERABLE | 1 | `alloy-compute release` (Governor-minted dead holder) or `alloy-compute recover` (foreign + min age) |
| `stale_control_plane_owner` | RECOVERABLE | 1 | `acquireControlPlaneOwnership` |
| `stale_slot_pid` | RECOVERABLE | 1 | unlink PID file under this runtime root |
| `disposable_cert_process` | RECOVERABLE | 1 | drop Governor-owned registry row |
| `execution_command_timeout` | AMBIGUOUS | 2 | escalate `DELIVERING`; never resend |
| `resource_queue_drift` | RECOVERABLE | 8 | cancel / release / `evaluateResourceQueue` |
| `exclusive_window_drift` | RECOVERABLE | 3 | `evaluateExclusiveWindow` |

---

## 2. Failure classification

`RECOVERABLE` · `AMBIGUOUS` · `UNRECOVERABLE` · `REQUIRES_JUDGMENT`

Ambiguous continuation and missing-lease-during-`VALIDATING` escalate to `NEEDS_INPUT`. They do not retry a send.

---

## 3. Reconciliation architecture

`reconcileGovernor` compares Execution Run store, Resource Request store, machine-exclusive store, and (on targeted passes) compute permits / control-plane owner / runtime PID files.

Reconciliation is continuous correctness. Recovery is an explicit registered remediation. They are not collapsed into `alloy-worker-doctor`.

Cadence:

- Gateway boot — targeted pass
- `GET /api/lanes` — cheap pass, 3s debounce
- 10s cheap timer, 30s targeted timer (unref’d)

---

## 4. Sensor tiers

1. Cheap local JSON, PID existence, exclusive window, run store
2. Targeted alloy-compute permit status and canonical `recover`
3. Workspace doctor — **not** on the hot path

---

## 5. Implemented recovery classes

See the registry table. Provenance is required. Unknown owners are observed, not mutated.

---

## 6. Intentionally non-recoverable (this phase)

- Automatic Claude restart / context rotation / transcript handoff
- Provider switching
- Broad process killing, `rm -rf`, Git reset/stash/rebase, worktree deletion
- Arbitrary shell remediation
- Host `~/.local/state/alloy-dev/pids` (observe-only)
- Disk prune (detect/report only; no proven Vacilando-owned prune with provenance)
- Package-script convergence, compute permit rewiring, multi-machine scheduling

---

## 7. Retry / backoff / thrash

Budgets persist in `recovery-budgets.json` so a Gateway restart does not reset them.

Thrash: 3 successful recoveries of the same `policy:lane:resource` within 15 minutes → `NEEDS_INPUT`. Idle queue re-eval does not consume budget or thrash.

---

## 8. Verification contracts

A repair that ran but did not restore the invariant is `recovery_failed`, not success.

Examples:

- Governor holder gone from request store **and** compute/exclusive
- Canonical recover: holder absent from permits
- Control plane: exactly one owner pid (this process)
- Exclusive: no window without a living owner

---

## 9. Stale lease / owner behavior

- Dead Governor `vac-erun_*` holder → canonical `alloy-compute release` (Governor minted the holder; pid dead and run missing/terminal). `MIN_RECLAIM_AGE` does not apply.
- Live run/process → refuse
- Foreign live pid → refuse
- Foreign dead + `MIN_RECLAIM_AGE` → `alloy-compute recover` only (no parallel reclaim)
- Phase 2 `tryGrantHead` still does **not** unlink permits. When every blocking holder is dead it invokes the registered `abandoned_browser_cert_lease` recovery pass, verifies the resource is free, then retries the FIFO grant.

---

## 10. Continuation ambiguity

`DELIVERING` after interruption → `AMBIGUOUS` → `NEEDS_INPUT`, lease held, **no resend**.  
`DELIVERED` + stale `WAITING_RESOURCE` remains Phase 3 repair without resend.

---

## 11. Exclusive-window recovery

Missing/terminal owner → `evaluateExclusiveWindow` releases the window and lifts quiescence. Unrelated tmux/Claude sessions are not destroyed. Other resource queues resume FIFO.

---

## 12. Disk / session boundaries

Disk pressure is reported through the existing capacity sensor. Phase 5 does not delete worktrees, Git state, logs, or user files.

`tmux.alive === false` may surface session unavailability. Claude is **not** restarted here.

---

## 13–21. Evidence

- Tests: `scripts/local-dev/tests/development-execution-recovery.test.mjs` plus Phase 1–4 / UI / remote suites
- Fixtures: `qa/gateway-v2/phase5-*.html` and `phase5-*-recovering.png` / `phase5-*-recovered.png`

---

## 22. Remaining operator interventions

- `NEEDS_INPUT` / `FAILED` after exhausted budget, thrash, or unrecoverable substrate
- Ambiguous `DELIVERING` continuation
- Missing lease while `VALIDATING`
- Disk pressure without a proven prune
- Dead Claude/tmux session (session-lifecycle phase)
- Live foreign owners (do not steal)

Successful recoveries are quiet audit events, not notifications.

---

## 23. Session-lifecycle / context-rotation

Phase 5 does **not** change that design. Automatic Claude recovery remains out of scope until a proven restart contract exists.

Work state stays `VALIDATING` during overlay `runtime_posture: RECOVERING`. Trivial JSON repairs do not bounce `VALIDATING → RECOVERING → VALIDATING`.
