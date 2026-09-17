---
owner: handoffs
status: open
last_reviewed: 2026-09-17
---

# HANDOFF-PORT-3012-IPV6-2026-09-17 — an unattributable IPv6 bind on a governed QA port

**Class:** host / runtime ownership anomaly. **Not a Financials defect.** Recorded here so Thread 11A
does not carry it, and so the runtime/host-maintenance lane has the evidence.

## What happens

`alloy-dev-start --production financials` fails with:

```
Error: listen EADDRINUSE: address already in use :::3012
```

while **nothing observable holds the port**: `lsof -nP -i:3012` returns no rows, and no `next-server`
process anywhere on the host has a cwd under the financials worktree. Reproduced across five
attempts over several minutes, including after a full lingering interval.

## How it started

A stray `next-server` (PID 24115, cwd `…/alloy-worktrees/financials/web`) survived
`alloy-dev-stop`. It ignored SIGTERM and needed SIGKILL. After it died the port showed **zero**
sockets — and still refused to bind.

## Two toolkit findings worth repairing, both independent of the anomaly

1. **`alloy-dev-reclaim` fails closed on a process it could have attributed.** It refused with
   *"the listener probe could not run, so ownership is unknown. Unknown is not free"* — correct
   doctrine, and the right default. But the listener probe sees nothing when the socket presents as
   ESTABLISHED-without-LISTEN, while `alloy_process_cwd` (already in the shared read core, and which
   resolves `/usr/sbin/lsof` correctly) *could* have attributed PID 24115 to this worktree. Ownership
   was provable by a resolver the toolkit already owns; reclaim just did not consult it.

2. **`--production` never receives the loopback bind host that `--dev` does.** In
   `alloy-dev-start`, `ALLOY_DEV_BIND_HOST` is appended to `server_command` *before* the
   `--production` branch **replaces** `server_command` wholesale. So dev binds `127.0.0.1` and
   production binds `::`. That is why this condition bites production starts and not dev ones, and
   it also means the production QA runtime is reachable on every interface rather than loopback.

## What Thread 11A did instead

Left `:::3012` untouched — no force, no kill, no reclaim — and moved the lane's QA runtime to a port
drawn from the allocation authority's own record
(`~/.local/state/alloy-dev/gateway/metadata/financials.env`, `PORT` 3012 → 3112, slot 2 unchanged).
The previous value is backed up in this session's scratchpad. Nothing outside this lane was changed.

**Restore:** set `PORT="3012"` back in that file once the host condition is cleared.
