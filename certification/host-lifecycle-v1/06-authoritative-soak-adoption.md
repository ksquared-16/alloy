# Adoption of `soak-authoritative-388789f8bd8c` — REFUSED, with cause

Adoption was attempted and **could not be completed**. The soak named in the instruction is not
running, its authoritative evidence files were never created, and its host protection has been
released. The criterion-12 clock has **not** started.

No soak was started from this lane, no toolkit was installed, no Gateway restarted, no host
configuration modified.

## What is true, verified live at 2026-09-12T12:26:35Z

The build and Gateway identity are exactly as stated, and healthy:

```
toolkit/current      388789f8bd8c            ✓ matches
Gateway              pid 38190 on 388789f8bd8c, up since 05:11:43 local   ✓ matches
gateway-host         pid 38137
```

## What is not

```
soak process pid 65874                                   NOT RUNNING (no host-soak process at all)
host-soak-authoritative-388789f8bd8c.jsonl               DOES NOT EXIST
host-soak-authoritative-388789f8bd8c.binding.json        DOES NOT EXIST
host-soak-authoritative-388789f8bd8c.log                 DOES NOT EXIST
gatewayHostMutationHolder()                              FREE
```

What exists instead is `host-soak-unprotected-388789f8bd8c-superseded.*`, and its own binding file
carries `soak_id: soak-authoritative-388789f8bd8c` with:

```json
"status": "SUPERSEDED_UNPROTECTED",
"superseded_at": "2026-09-12T12:25:23.752399Z"
```

It holds **4 samples**, 12:21:26Z to 12:24:26Z — about three minutes.

## Sequence

```
12:21:25.876Z  gateway_host_mutation ereq_28d19226687c1170 granted to erun_c21c711135756ef2
               (lane_9b9082778292), claim held by soak pid 65874
12:21:39.371Z  soak begins sampling
12:24:01.734Z  owning run erun_c21c711135756ef2 → COMPLETE
12:24:26.018Z  last sample written
12:25:23.752Z  binding marked SUPERSEDED_UNPROTECTED, evidence renamed
12:26:35Z      soak pid dead · no soak process on the host · holder FREE
```

The soak died **25 seconds after its owning run completed**.

## Cause — the process does not outlive the run that starts it

From the installed `vacilando-host-soak.mjs`:

```js
process.on("exit", release);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { release(); process.exit(0); });
}
```

The soak was launched as a child of the owning run's session — the recorded command carries no
`nohup`, no `setsid`, and no detach:

```
/opt/homebrew/opt/node@22/bin/node …/vacilando-host-soak.mjs --run --interval 60 --hours 24
  --out …/host-soak-authoritative-388789f8bd8c.jsonl --own-resource --owner-run erun_c21c711135756ef2 --
```

When that run completed, the session teardown delivered **SIGHUP**. The handler did exactly what it
was written to do: released the host claim and exited **0**. Cleanly, silently, with no error
anywhere — which is why the failure is invisible unless the process is looked for directly.

The script never watches the owner run (no `getExecutionRun`, no terminal-state check), so this was
not a deliberate stop. It is signal delivery.

### The commit that added the protection also added the signal that defeats it

The `--own-resource` block is new in `e3bc3bd9b`, *"fix(vacilando): protection that outlives its
requester, one root, one baseline writer"*, on staging. That commit does exactly what its title
says — it makes the **claim** outlive the requesting run, and the proofs Final Convergence ran
against it all hold. The SIGHUP handler quoted above arrived in the same diff.

So the two failure modes look alike and only one was closed. A claim that outlives its requester is
worth nothing if the process holding it is killed by that requester's teardown, and the title makes
it easy to believe both were covered.

**The resource model is not at fault, and this is worth stating precisely.** Everything Final
Convergence proved about it is true: `cleanupRunResources` retains a live process-owned claim, a dead
owner is reclaimed by the next canonical reader, competing installs refuse, PID reuse is rejected by
start-identity validation. The claim was tied to the soak *process* rather than the run, exactly as
designed — and then the process itself was killed by the run's teardown. What was proven was claim
lifetime. What was never proven was **process survival**, and that is the gap.

This is the third time the criterion-12 clock has failed to start, and the first with a mechanism
rather than a coincidence: `14b0e01dcd06` was invalidated by another lane's install, `c5d8acfcfbec`
never had a soak started, and this one was hung up by its own parent.

## What would fix it — not applied from this lane

The soak must be detached from the launching session (`setsid`/`nohup`, or spawned `detached: true`
with `unref()`), and **SIGHUP must not be in that handler list**. SIGINT and SIGTERM are deliberate
stops and should still release the host; SIGHUP on a 24-hour background observer means "your parent
went away", which is the normal case for a process that must outlive its parent by design.

A cheap, decisive verification for whoever starts the next one: after the launching run completes,
confirm the soak pid is still alive and its sample file is still growing. Both of those were
observable within a minute here.

## Status

`PROMOTED_SOAK_PENDING` — unchanged. Criteria 5 and 11 keep their supporting evidence from
`05-superseded-soak-evidence.md`; criterion 12 has no clock. The prior
`14b0e01dcd06` / `c5d8acfcfbec` / `388789f8bd8c` partial runs remain historical only, and this lane
has not restarted any clock silently.
