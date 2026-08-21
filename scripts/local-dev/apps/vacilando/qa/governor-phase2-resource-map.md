# Phase 2 — Normalized development resource map

**Status:** read model + Governor request/queue. Browser certification is the only Governor-mutable grant path.
**Sprint:** `vacilando-gateway-v2` slot 5
**Authority:** Resource Request owns queue/grant state. `ExecutionRun.resource_wait` is a projection.

Automatic **resource** allocation is allowed. Automatic **Claude continuation is not.**

This map does **not** replace `alloy-compute`, `vac-run`, sprint-ops, Docker, or control-plane stores. It is not the mission `resource-claims.json` store.

## Fairness

FIFO by `requested_at`, then `request_id`. Optional operator `priority: 1` then FIFO inside that class. Does not steal a current holder. Queue position is derived, not stored.

## Request states

`REQUESTED | QUEUED | GRANTED | RELEASED | CANCELLED | FAILED`

Invariant: one active request (`REQUESTED|QUEUED|GRANTED`) per run per resource key.

## WAITING_RESOURCE

A `WAITING_RESOURCE` report creates or reuses exactly one active Resource Request for that run/resource. Duplicate reports do not enqueue a second row. They may retry grant evaluation.

When the request is `GRANTED`, the run **stays** `WAITING_RESOURCE` with `ready_to_resume: true` until Phase 3 continuation.

## Registry

| key | class | underlying authority | capacity | queueable by Governor? | stale-owner source | release authority | Phase 2 mutability |
|---|---|---|---|---|---|---|---|
| `browser_certification` | EXCLUSIVE_NAMED | `alloy-compute browser-certification` via `browser-cert-lease` | 1 | yes | compute permit pid + min reclaim age 900s | `alloy-compute release` through existing lease API | request/queue/read; grant/release **through** lease API, not by editing permit files |
| `validate` | EXCLUSIVE_NAMED | `vac-run` / `alloy-validate` / `lib/lock.sh` | 1 | no — workers already queue in vac-run | lock PID or heartbeat > 90s | vac-run holder | read-only snapshot; **not** machine-exclusive timing |
| `dev_servers` | CAPACITY_LIMITED | sprint-ops `ALLOY_MAX_RUNNING_SERVERS` | **3** | no | slot PID files / worker doctor | `alloy-dev-start` / pause / finish | read-only; do not merge with unwired `heavy-next-dev` cap 2 |
| `full_typecheck` | EXCLUSIVE_NAMED | `alloy-compute full-typecheck` | 1 | no | compute permit | alloy-compute release | declared, **unwired** — do not acquire |
| `heavy_next_dev` | CAPACITY_LIMITED | `alloy-compute heavy-next-dev` | 2 (config) | no | compute permit | alloy-compute release | declared, **unwired** — live cap is sprint-ops 3 |
| `runtime_timing_certification` | MACHINE_EXCLUSIVE | **NOT BUILT** | 1 | model/queue only | none | none | request may queue; **never grant** against the machine; no quiescence |
| `docker_stack` | EXCLUSIVE_NAMED | `alloy-stack` leases | 1 (shared stack) | no | lease TTL / worktree gone | `alloy-stack release` | KEEP |
| `control_plane` | EXCLUSIVE_NAMED | `control-plane-owner.json` per runtime root | 1 | no | dead owner pid replaced | `releaseControlPlaneOwnership` | KEEP; Gateway already isolated |

SHARED exists as a class for ordinary Claude reasoning / git reads / cheap static ops. Phase 2 does not enqueue those.

## Stale owner

If compute holders for `browser_certification` are all dead, surface `resource blocked by stale owner`. Phase 2 does not reclaim them. Existing `alloy-compute` reclaim remains the authority.

## Terminal cleanup

`COMPLETE` / `FAILED` cancel queued requests and release Governor-held grants (`vac-erun_*` holders only). Never release a holder owned by another run or process.
