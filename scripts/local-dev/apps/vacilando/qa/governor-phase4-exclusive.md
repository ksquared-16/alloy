# Phase 4 — Machine-exclusive windows + quiescence

**Status:** implemented. Stop after this phase.  
**Date:** 2026-08-18  
**Sprint:** `vacilando-gateway-v2` slot 5  
**Authority store:** `{ALLOY_RUNTIME_ROOT}/vacilando/execution-runs/machine-exclusive.json`  
**Schema:** `vacilando.machine_exclusive.v1`

This is **not** the validate lease, **not** browser-certification, and **not** a generic cluster scheduler.

---

## 1. Machine-exclusive authority

`runtime_timing_certification` is Governor-mutable `MACHINE_EXCLUSIVE` capacity 1.

The window answers:

| Question | Field |
|---|---|
| Is a machine-exclusive window active? | `window.phase` |
| Who owns it? | `lane_id` / `run_id` / `owner_holder` |
| Which Execution Run requested it? | `request_id` + `run_id` |
| When was it granted? | `granted_at` |
| What conflicts with it? | quietness `blockers[]` (no PIDs in UI) |
| Can another heavy resource be granted? | `exclusiveBlocksNewGrant` — no, for conflicting keys, until release |

Internal phases (not Execution Run states):

```text
RESERVING_EXCLUSIVE → DRAINING_CONFLICTS → VERIFYING_QUIET → EXCLUSIVE_ACTIVE
```

Default grant window: **20 minutes** (`VACILANDO_EXCLUSIVE_MAX_MS`).  
Default reservation/drain wait: **30 minutes** (`VACILANDO_EXCLUSIVE_RESERVE_MAX_MS`).  
Quiet hold: **0 ms** unless `VACILANDO_EXCLUSIVE_QUIET_HOLD_MS` is set (categorical quietness is the contract; no CPU-percentage threshold).

---

## 2. Conflict matrix

| activity/resource | conflicts? | why | how detected | how prevented | how allowed to settle |
|---|---|---|---|---|---|
| browser_certification | **yes** | Chromium/Playwright distorts timing | Governor GRANTED requests + alloy-compute holders | no new grants after exclusive reservation | current GRANTED holder may finish |
| validate | **yes** | tsc/build/full-test/playwright CPU | host `validate.lock` (live only) | Governor does not start vac-run | wait for holder; do not kill |
| unmanaged heavy (`tsc` / `next build`) | **yes** | `web/package.json` still invokes raw tools | process scan `isUnbrokeredHeavyCommand` | cannot prevent; surface blocker | wait until process exits; **do not kill** |
| full-typecheck permit | no | declared, unwired | registry | do not acquire | n/a |
| heavy-next-dev permit | no | declared, unwired; live cap is sprint-ops 3 | registry | do not wire | n/a |
| dev servers | no | idle Next is baseline; stopping them destroys lanes | pid files observational | none in Phase 4 | n/a |
| Docker / alloy-stack | no | shared baseline; stopping is lane destruction | stack leases | do not release | n/a |
| Claude / tmux | no | quiescence keeps sessions alive | lane facts | exclusive module never signals tmux/Claude | n/a |
| Git | no | ordinary git is not timing-material vs tsc/Chromium | none | none | n/a |
| focused unit tests | no | focused vitest is outside the heavy broker | none | none | n/a |
| Gateway polling | no | cheap FS; host process scan only while draining | code paths | skip process scan during `EXCLUSIVE_ACTIVE` | n/a |
| control plane | no | Gateway must remain owner | control-plane-owner.json | do not release | n/a |

Residual risk (Phase 0, unchanged): `npm run typecheck|build|test` in `web/package.json` still bypass the Governor. Phase 4 detects that class of process as an unmanaged blocker and waits.

---

## 3. Reservation / drain / writer-preference

When a `runtime_timing_certification` request is the eligible head of its FIFO queue:

1. Reserve the exclusive window (`RESERVING_EXCLUSIVE`).
2. Current **GRANTED** conflicting holders may finish.
3. **No NEW** conflicting grants (`browser_certification` stays queued).
4. Verify quietness.
5. Grant exclusive → Phase 3 continuation → `VALIDATING`.

This is a writer-preference barrier: exclusive cannot starve behind an endless stream of short browser-cert leases, and it does not preempt in-flight bounded holders.

Three-lane ordering (Records holder, Communications queued, Runtime exclusive queued):

1. Records finishes the current browser cert.
2. Communications does **not** receive a new grant (it was queued, not in-flight).
3. Runtime receives exclusive timing once quiet.
4. Sessions remain alive.
5. Runtime releases → Communications is granted through normal FIFO.

---

## 4. Quietness sensor

Categorical, not CPU:

```text
quiet iff
  no GRANTED conflicting Governor resources
  no live foreign browser-cert holder
  no live validate lock (host scan; skipped in isolated tests)
  no unmanaged heavy process
```

CPU/load is **not** authority. Structured report: `{ quiet, blockers: [{ type, owner_lane_id, reason, governed }] }`. Operator UI never prints PIDs.

---

## 5. Quiescence model

Work state remains `WAITING_RESOURCE` / `VALIDATING` / `EXECUTING`.  
Runtime posture is separate:

- Exclusive owner: `EXCLUSIVE_OWNER`
- Queued conflicting waiters: `QUIESCED` — “Runtime Performance timing certification”
- In-flight conflicting holder: unchanged (they are draining)
- Lanes with no conflicting wait: unchanged (`Connected`)

Claude, tmux, worktree, and run records are not destroyed.

---

## 6. Grant / continuation / release

Quietness **before** `GRANTED`. Phase 3 `deliverGrantContinuation` runs only after grant. Continuation copy is exclusive-timing specific and does not resend the original prompt. `resume_state = VALIDATING`. Exactly-once per grant episode.

Release when the timing step reports finished (`VALIDATING → EXECUTING`, `COMPLETE`/`FAILED`, explicit resource release). Then re-evaluate queues (exclusive next waiter, then browser-cert). No operator “resume everyone”.

---

## 7. Timeout / owner health / crash / emergency

- Expiry → release exclusive → owning run `NEEDS_INPUT`. Do not kill the run. Do not leave the machine blocked.
- Owner run missing/terminal → release exclusive, lift quiescence, re-evaluate other queues.
- Gateway boot calls `reconcileExclusiveWindow()`. Consistent windows are restored; dead owners are released.
- Authenticated `POST /api/development-resources/exclusive/release` `{ confirm: true }` audits `exclusive_emergency_released`. It does not terminate processes.

---

## 8. Performance / timing noise

During `EXCLUSIVE_ACTIVE` the quietness process scan is skipped. Idle evaluate is two JSON reads. Governor does not spawn browser-cert processes or rewrite package scripts. Snapshot remains FS-only (no `execFile` in `developmentResourceSnapshot`).
