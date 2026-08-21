# Phase 0 — Development Execution Governor ownership map

**Status:** audit only. No scheduler, Execution Run, or resource-class wrapper implemented.  
**Date:** 2026-08-18  
**Sprint:** `vacilando-gateway-v2` slot 5  
**Stop gate:** next structural work (Phase 1 Execution Run) does **not** require changing existing lease invariants. Wrap `alloy-compute` / `vac-run` / `alloy-stack`; do not replace them.

Classifications: **KEEP** (use as-is) · **ADAPT** (product wrapper, same store) · **MISSING** · **CONFLICTING** (do not reuse as the governor).

---

## 1. Proven governors (do not rebuild)

| Governor | Class | Persistence | Acquire / release | Queue | Stale recovery | Verdict |
|---|---|---|---|---|---|---|
| `alloy-compute` | EXCLUSIVE_NAMED / CAPACITY_LIMITED | `~/.local/state/alloy/compute/<resource>/*.permit` + `queue` | `alloy-compute acquire/release <resource> --holder` | **FIFO** by holder; grant only if head of queue | Dead holder + permit age ≥ 900s; never reclaim live pid fingerprint | **KEEP** — this is the scarce-resource store |
| `browser-cert-lease` | EXCLUSIVE_NAMED `browser-certification` cap 1 | Same compute store | `withBrowserCertLease` / `alloy_browser_cert_acquire` | Inherits compute FIFO (`--wait`) | Compute reclaim | **KEEP** — thin wrapper, no second store |
| `cert-ownership.sh` | EXCLUSIVE_NAMED `exclusive-certification-db` | Same compute store | `alloy_cert_guard` before destroy/reset/seed | N/A (gate, not a waiter) | Reads compute permits; never a parallel record | **KEEP** — permit ≠ stack lease |
| `vac-run` / `alloy-validate` / `lib/lock.sh` | Host-wide exclusive heavy validation (N=1) | `~/.local/state/alloy-dev/locks/validate.lock/` + `validate.queue/` + heartbeat | `vac run <kind>` / `alloy_validate_acquire_lock` | **FIFO**; register *before* memory/heavy guards | Dead pid or heartbeat > 90s | **KEEP** — real admission path for typecheck/build/full-test/playwright |
| `alloy-stack` | EXCLUSIVE_NAMED shared Docker (reference-counted) | `~/.local/state/alloy/stack/leases` | `alloy-stack use` / `release` | No waiter queue; last-out stops stack | Lease TTL 12h or worktree gone | **KEEP** — one `alloy-cert` stack |
| Sprint ops slots/ports | SHARED identity + CAPACITY_LIMITED servers/providers/installs | `~/.local/state/alloy-dev/` metadata + resource lock dirs | `alloy-sprint-start`, `alloy_guard_server_start`, `alloy_acquire_resource_slot` | **None** — fail closed (`alloy_die`) | Doctor / pause / finish | **KEEP** limits; **ADAPT** later if WAITING_RESOURCE should replace die |
| Control-plane owner | EXCLUSIVE_NAMED per `ALLOY_RUNTIME_ROOT` | `<runtime>/vacilando/control-plane-owner.json` | `acquireControlPlaneOwnership` / `releaseControlPlaneOwnership` | None — refuse if foreign pid alive | Dead pid replaced | **KEEP** — Gateway already isolated under `…/gateway` |
| Heavy-validation guard | Policy + watchdog | None (scan `ps`) | N/A | N/A | Conductor SIGTERM/SIGKILL unbrokered `tsc`/`next build` | **KEEP** |
| Command budget | Progress envelope, not a lease | None | `command-budget.mjs run <class>` | N/A | Stall → failed/blocked | **KEEP** |
| `resources.mjs` | Observational machine snapshot | Slow disk TTL only | Read-only | N/A | N/A | **KEEP** — never a scheduler |
| Gateway lane send/output/auth/notify | Lane transport | Isolated gateway runtime | Existing APIs | N/A | N/A | **KEEP** — governor wraps it, does not replace it |
| `alloy-dev-start` slot servers | EXCLUSIVE_NAMED per slot (ports 3011–3016) | `…/alloy-dev/pids/<name>.pid` | `alloy_guard_server_start` then PID file | None — refuse at cap | Doctor recovers stale PID files only | **KEEP** slot ownership |
| Actuation locks | EXCLUSIVE_NAMED runtime provision | `…/locks/runtime-actuation/` | `alloy_act_lock_acquire` / `release` | No | Dead PID reclaim | **KEEP** — separate domain |
| Initiative lock | EXCLUSIVE_NAMED | `…/locks/initiative-<key>.lock/` | `alloy_initiative_acquire_lock` | Spin wait | mkdir mutex | **KEEP** — not lane execution |
| `machine-capacity.sh` | Preflight refuse | None | `alloy_assert_machine_capacity` | No | Host metrics | **KEEP** as sensor/gate |
| `workspace:doctor` / `workspace:processes` | Observational | None | None | No | Advisory | **KEEP** as sensors |

`alloy-compute` resources today:

| Key | Capacity | Product class |
|---|---|---|
| `browser-certification` | 1 | EXCLUSIVE_NAMED |
| `exclusive-certification-db` | 1 | EXCLUSIVE_NAMED (destructive DB) |
| `full-typecheck` | 1 | **Declared, unwired** — `alloy-validate` does not acquire this permit |
| `heavy-next-dev` | 2 (config) | **Declared, unwired** — `alloy-dev-start` uses sprint-ops server cap (default 3), not this permit |

Config capacities (fail-closed, no queue): `ALLOY_MAX_ACTIVE_PROVIDERS=3`, `ALLOY_MAX_RUNNING_SERVERS=3`, `ALLOY_MAX_CONCURRENT_INSTALLS=1`, `ALLOY_MAX_CONCURRENT_HEAVY_JOBS=1`. `ALLOY_MAX_ACTIVE_RUNTIMES` is observational only.

---

## 2. CONFLICTING — do not reuse as the Development Lane governor

These are the old Director / Mission / Assignment stack. Reusing them would be a return to autonomous orchestration.

| Surface | Why not |
|---|---|
| `execution-session.mjs` | Bound to `missionId` + `assignmentId`. Statuses include percent-complete. Not a Development Lane Execution Run. |
| `silent-worker-recover.mjs` + `VACILANDO_AUTO_DISPATCH` | Director auto-resume / auto-dispatch of missions. |
| `assignment-dispatch.mjs` / `mission-executor.mjs` / `mission-director.mjs` | Product/mission orchestration. |
| `resource-claims.mjs` | Parallel claim file `vacilando/resource-claims.json`, mission-centric, **no queue**, fail `resource_conflict`. Overlaps compute + vac-run. |
| `scheduler.mjs` | Slot-start recommendations only; `auto_scheduling: false`. Not an execution scheduler. |

Do not infer run state from tmux output or Claude JSONL. Tmux remains **observation**; compute/vac-run remain **leases**.

### Live admission conflicts (must resolve in Phase 2, not by a fourth store)

1. **Three heavy-job stories:** `vac-run` lease (what workers should use) + sprint-ops `resources/heavy` slot (fail closed, no queue) + `alloy-compute full-typecheck` (FIFO, **not called** by validate) + Director `resource-claims` (fail closed).
2. **`web/package.json` vs doctrine:** `typecheck` / `typecheck:tests` / `build` / `test` invoke raw `tsc` / `next build` / `vitest run`. Docs (`typescript-performance.md`, `workspace-orchestration.md`) claim those npm scripts are brokered. The conductor treats unbrokered `tsc`/`next build` as hostile (`ALLOY_VALIDATE_EXECUTING=1` required). Canonical worker path is `vac run <kind>`. Focused `npx vitest run <file>` is intentionally outside the broker.
3. **Dev servers:** sprint-ops `ALLOY_MAX_RUNNING_SERVERS=3` is enforced at start; compute `heavy-next-dev` cap 2 is unused.
4. Do **not** treat the validate lease as `runtime_timing_certification`. It serializes heavy validation; it does not quiesce the machine.

---

## 3. MISSING vs this initiative

| Need | Today |
|---|---|
| Execution Run on a Development Lane | No. Lane has last_instruction + activity, not a work-state envelope. |
| Work state ≠ runtime health | Mixed: lane presence, control-plane health, worker-health, mission posture. |
| BLOCKED RESOURCE ≠ BLOCKED LANE | Acquire **blocks the caller** (`--wait` sleep 5, or die). Claude cannot keep doing safe work while a cert lease is queued unless the worker itself continues — Vacilando does not manage that split. |
| Event-driven grant → auto continuation | Waiters poll. Release does not deliver a server-generated Claude continuation. |
| MACHINE_EXCLUSIVE / quiescence | **Does not exist.** No `runtime_timing_certification`, no “prevent new heavy grants / wait for settle / prove quiet”. |
| Completion ≠ idle TUI | No run completion report. `lane_unseen_after_instruction` is output-unseen, not COMPLETE. |
| Operator escalate only COMPLETE / NEEDS_INPUT / FAILED | Not built for managed work. |
| Prioritize next | No product override on compute/vac queues. |
| Session rotation | Default automatic at ≥85% context, deferred to the next safe checkpoint. `VACILANDO_AUTO_SESSION_ROTATION=0` is diagnostic-only. |

---

## 4. Invariants (do not casually change)

1. One shared Docker stack (`alloy-cert`). Never `supabase start` a private stack. Permit ≠ lease (`cert-ownership.sh`).
2. Host-wide typecheck/build/full-test must go through `vac run`. Raw `tsc` / `next build` is treated as a bypass and may be killed. `npm run typecheck` in `web/package.json` is currently a bypass — do not “fix” that as a side effect of Phase 1.
3. Browser certification capacity 1 via `alloy-compute`, not a new mutex.
4. Live permits are never reclaimed for looking old. Pid + start + command fingerprint.
5. Permanent ports 3011–3016; Gateway 3020 loopback; no Funnel / `0.0.0.0`.
6. Lane identity ≠ sprint slot.
7. Consequential git/PR/merge/deploy stay preview→confirm in the command registry.
8. Control-plane ownership is per runtime root (Electron `:3021` vs Gateway `:3020`).
9. Compute permits are cooperative (entry points must ask). Do not pretend kernel enforcement.

---

## 5. Dual-store overlap (ADAPT carefully)

Heavy validation is gated in **several** places. Only one is the real worker admission path:

- **`vac run` / `alloy-validate` FIFO lease** (`lib/lock.sh`) — canonical. Also takes a sprint-ops `heavy` slot after the lease, then a browser-cert permit for Playwright kinds.
- **`alloy-compute full-typecheck`** — declared FIFO, **not acquired** by validate. Conductor still `alloy-compute reap --confirm`.
- **`web/package.json` `npm run typecheck|build|test`** — raw compiler/build; **not** brokered. Docs that say otherwise are stale. Conductor may kill those PIDs.
- **Director `resource-claims.mjs`** — mission JSON, no queue. Do not extend.

Phase 2 must pick **one acquire path per class**, map `browser_certification` → existing `browser-certification`, and not add a fourth store.

Do not wire `heavy-next-dev` by accident in Phase 1–3. Slot server ownership + `ALLOY_MAX_RUNNING_SERVERS` is the live cap until an explicit unify pass.

---

## 6. Recommended wrap (not implemented)

```text
Execution Run (new, lane-scoped, filesystem)
    → requests resource_class + resource_key
        SHARED              → no lease
        CAPACITY_LIMITED    → vac-run (validation); sprint-ops server/provider/install caps as-is
        EXCLUSIVE_NAMED     → alloy-compute (browser-certification, exclusive-certification-db)
        MACHINE_EXCLUSIVE   → MISSING; new compute resource + quiesce policy (Phase 4)
    → WAITING_RESOURCE does not idle the lane
    → on grant: one auditable continuation send (existing lane.instruction path)
    → on completion: structured report, not silence
```

Phase 1 can add Execution Run + state machine **without** touching lease code.

---

## 7. Persistence roots

| Root | Who |
|---|---|
| `~/.local/state/alloy/compute/` | alloy-compute permits + queues + reclaim.log |
| `~/.local/state/alloy/stack/leases` | alloy-stack |
| `~/.local/state/alloy-dev/` | sprint ops, vacilando default runtime, validate lock/queue |
| `~/.local/state/alloy-dev/gateway/` | isolated Gateway (owner, token, web-push, lanes) |
| `~/.local/state/alloy-dev/vacilando/resource-claims.json` | legacy Director claims |
| `~/.local/state/alloy-dev/vacilando/execution-sessions/` | legacy Director sessions |
| `~/.local/state/alloy-dev/vacilando/control-plane-owner.json` | Electron Vacilando HTTP |

---

## 8. Phase 0 stop

Ownership map is the gate. Phase 1 (Execution Run + work-state machine, no scheduler) may proceed without changing the governors above.

Phase 2+ wraps `alloy-compute` / `vac-run` / `alloy-stack`. Stop again before inventing MACHINE_EXCLUSIVE if that would change heavy-job or browser-cert invariants — it should add a **new** compute resource and a quiesce policy, not widen `browser-certification` to mean “the whole machine.”
