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

---

## RECURRENCE — 2026-09-18, port 3112 (the lane's OWN allocated port)

The condition first recorded here for `:::3012` has reappeared on **`:::3112`**, the port the
gateway metadata allocates to the `financials` worktree (`ALLOY_WORKTREE_SLOT=2`,
`PORT="3112"`). That makes it a *class* of host condition rather than a property of one port, which
is the part worth knowing.

**Evidence, in the order it was gathered:**

```
alloy-dev-start --production financials
  → Error: listen EADDRINUSE: address already in use :::3112

lsof -nP -iTCP:3112 -sTCP:LISTEN     → no rows
netstat -an | grep 3112              → no rows
curl http://127.0.0.1:3112/…         → 000 (no response)
curl http://[::1]:3112/…             → 000 (no response)

alloy-dev-reclaim financials
  observation   unknown
  class         unattributable
  action        REFUSED — the listener probe could not run, so ownership is unknown.
                Unknown is not free, and it is certainly not proof to stop something.
```

Node binds `::` (IPv6 any) and is refused, while every attribution tool reports nothing and nothing
answers on either stack. The toolkit's own classifier reaches `unattributable` and **refuses to
act** — which is the correct behaviour and is why this is being written down rather than worked
around.

**What was NOT done, deliberately:** nothing was forced, killed, reclaimed or otherwise mutated. The
same standing rule that governs `:::3012` applies: an unknown holder is not a free port, and a
process that cannot be attributed cannot be safely stopped.

**Consequence for Thread 11A:** mounted proof on a fixed production candidate could not be obtained
this pass. The build is green and the server has nowhere to listen.

**Second, independent blocker on the same attempt:** the slot-2 QA session had expired (storage
state ~4.6h old against a ~1h TTL) and the governed restore
`environment.restore_qa_session` / `gar_fa8b2b9b50f64f` returned **failed — verification_failed**,
terminally. So even with a port, authenticated surfaces would have rendered the login page.

Either blocker alone prevents mounted proof; both were present.

**For the operator:** this needs a host-level answer — an explanation for the phantom IPv6 binds, or
a sanctioned way to allocate a different port through the lane/QA allocation authority — plus a
working QA session restore path. Both are outside what this lane may do on its own.
