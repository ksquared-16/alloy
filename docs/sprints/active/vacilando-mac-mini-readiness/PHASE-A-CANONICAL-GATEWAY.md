# Phase A — MacBook Gateway reinstalled from canonical `ALLOY_REPO`

Status: **DONE, with one P1 defect discovered and reproduced.**

## What changed

| | Before | After |
|---|---|---|
| launchd `WorkingDirectory` | `…/wt5-vacilando-gateway-v2/scripts/local-dev` (sprint worktree) | `~/.local/share/alloy/toolkit/current` (canonical install) |
| Host script | same path under wt5 | `~/.local/share/alloy/toolkit/current/lib/vacilando-gateway-host.mjs` |
| Toolkit provenance | uncommitted worktree tree | `origin/staging` @ `d7cb04582881`, extracted via `git archive` |
| Captured Node | `~/.nvm/versions/node/v22.21.1/bin/node` | unchanged (pinned deliberately) |
| Runtime root | `~/.local/state/alloy-dev/gateway` | unchanged |

`alloy-toolkit install origin/staging` extracts from the git object store, so it does **not**
depend on the canonical working tree — which matters here (see below).

## Evidence

Durable state preserved across the reinstall:

* durable lanes: 7 before → 7 after; identical lane IDs and names
* `/api/v2/lanes` returns all 7 with slot/worktree bindings intact
* node identity unchanged: `node_4e96a4a65bbc` "Kelly MacBook"
* audit log unchanged at 191 lines across an intermediate restart
* Tailscale Serve unchanged: `https://macbook-air-2.tail2aa1af.ts.net` → `127.0.0.1:3020`, HTTPS `200`
* Gateway health after restart: `ok:true, hydrated:true`

Rollback is one command, preserved at
`~/.local/state/alloy-dev/gateway/backups/phase-a-preserved/rollback-gateway.sh`.

## Findings

### P1 — canonical abandons live Execution Runs on boot reconcile

Reproduced: installing canonical and restarting moved this lane's own run
`erun_fdef0f6248079a9a` from `EXECUTING` to `ABANDONED`, and canonical rejects recovery:

```
vac run-status: illegal_transition (ABANDONED → EXECUTING)
```

An earlier accidental restart of the *pre-Phase-A* (wt5) Gateway did **not** abandon the same
run. So this is a behavioural regression present in canonical and absent from what was live.

Pass 1 already fixed exactly this, on this lane's branch and **not yet promoted**:

* `1b0008fe2 fix(vacilando): make ABANDONED recoverable and stop abandoning live runs`
* `7bf936493 fix(vacilando): notify on abandonment, add tier-2 liveness…`

**The Mac mini must not be cut over until these are in canonical**, or the first Gateway
restart on the mini will abandon whatever is running.

### P1 — the live Gateway was running unpublished code

The pre-Phase-A Gateway ran 20 modified + 30 untracked files that existed **only** in the wt5
working tree — ~1,625 changed lines across admission, lane capacity, agent-session lifecycle,
governed actions and trusted-host actions. None of it is committed anywhere.

It is preserved non-destructively (wt5's git state was not touched) at:

```
~/.local/state/alloy-dev/gateway/backups/phase-a-preserved/
  wt5-gateway-uncommitted-tracked.patch   (132K, tracked modifications)
  wt5-gateway-untracked.tar.gz            (6.7M, 30 untracked paths)
  wt5-untracked-list.txt
```

Installing canonical necessarily dropped that behaviour. All four endpoints the reporting CLI
depends on (`/api/v2/lane/run/report`, `…/agent-session/oriented`, `…/governed-action`,
`/api/v2/lanes`) are present in canonical, so the control channel survives.

### Not a defect — restored-node lane view

A restored durable store on a *different* node shows unbound lanes in `/api/v2/lanes`, because
that view composes host bindings (tmux/worktree/git). Durable identity is unaffected:
`assertLaneIdentitiesPreserved` → `{ok:true, missing:[], renamed:[]}`.

### Canonical checkout is stale

`/Users/Kelly/Alloy` is **512 commits behind** `origin/staging` with staged uncommitted work.
Nothing in Phase A depended on it (`git archive` reads the object store), but arrival-day
bootstrap must not assume the working tree is current.

## Durable-restore rehearsal (Phase B §3 evidence, this host)

`vacilando-durable-rehearsal.mjs`, non-destructive (`git_mutated:false`, `worktree_mutated:false`,
`live_gateway_written:false`):

* backup ok, `verifyBackup` ok, 0 errors
* restore ok into an isolated root
* new node identity minted (`node_fe42ef4f446a`) ≠ MacBook `node_4e96a4a65bbc`
* 5 execution bindings invalidated as **stale**, lanes not recreated
* all 7 lane IDs and names preserved; run history preserved
