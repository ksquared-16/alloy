# Maintenance Activation Readiness V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak. **Nothing was activated on this host.**

**Baseline.** `origin/staging` @ `9619b8992`, with Governed Artifact Filing
Contract (`b84c73890`, carrying the whole chain) merged in.

---

## 1. Checkpoint collectors: the gate now has something behind it

DevOps 7 shipped `evaluateCheckpoint` with five requirements and nothing that
could answer them. The live dry run reported all five UNMEASURED and refused —
the gate working correctly, over a void.

Each requirement is now wired to the owner that already holds the fact. Live,
against the real fleet:

```
FAIL        lane_next_action_recorded      13 active lane(s) have no durable next action
PASS        lane_blockers_recorded         0 blocked lane(s) recorded their blocker
PASS        accepted_executions_durable    0 in-flight action(s) are durably owned
PASS        worktree_durability_known      57 worktree(s) have known durability
PASS        run_handoff_filed              0 open run(s) have filed a report

checkpoint  false  (not durable: lane_next_action_recorded)
may reboot  false
```

**Zero UNMEASURED.** The gate now blocks for a *measured* reason — and the reason
is real: it is DevOps 4's known coverage gap, that 12 of 13 lanes carry no
durable next action. Maintenance will keep refusing until that is closed, which
is the correct behaviour, not a bug in the collector.

> **Worktree durability has no stored file.** DevOps 3 measures it live, because a
> stored durability class is stale the moment somebody commits. The collector
> therefore calls `measureWorktreeGit` — the same function retirement itself uses
> — and gets the same answer retirement would get. Read-only git plumbing; 57
> worktrees measured.

**A missing collector cannot satisfy the gate.** An UNMEASURED collector
contributes *nothing* to the measurements object, so `evaluateCheckpoint` sees
absence, which it already treats as blocking. A collector that throws, or returns
an unrecognised outcome, is UNMEASURED too. `collectorCoverage` reports gaps as a
value rather than leaving them to be discovered at 03:00.

## 2. Reboot: the narrowest privilege path that exists here

Audited before choosing. `sudo -n -l` reports a password is required; there are
no root LaunchDaemons; the Gateway is a **user** LaunchAgent, so nothing running
holds root. The user is in `admin`, meaning an operator can authorise a change
but a background cycle cannot.

| Candidate | Rejected because |
|---|---|
| root LaunchDaemon watching a request file | a new long-lived privileged process — the "another reboot daemon" this programme is told not to add, and far more surface than the job needs |
| `osascript` System Events restart | runs as the user with no password, and any app with unsaved state can refuse it — a window could silently not reboot and report that it had |
| **sudoers drop-in, one command** | **chosen** |

```
/etc/sudoers.d/vacilando-maintenance-reboot   mode 0440
%admin ALL=(root) NOPASSWD: /sbin/shutdown -r now
```

No credential is stored, no shell is granted, one absolute binary with fixed
arguments and no wildcard. The sudoers line is the **capability**; the
maintenance gate is the **authorisation**, and neither suffices alone.

`authorizeReboot` requires seven conditions. The three that matter most:

- **drain is re-measured immediately before execution**, never inherited — the
  earlier decision described an earlier host;
- **a protected mutation that began in between blocks** — an authorisation minted
  at 03:00 must not reboot through a migration that started at 03:07;
- **a proof that is stale (>10 min) or already consumed refuses.**

A request that does not name the open maintenance window is refused before
anything else is consulted, so there is no generic "run shutdown" authority.

## 3. The Gateway interpreter

Measured, and finer than "the plist hard-codes a path":

```
/opt/homebrew/bin/node                   → Cellar/node@22/22.23.2_1/bin/node   ← plist target
/opt/homebrew/opt/node@22/bin/node       → the same file, via the FORMULA link
/opt/homebrew/Cellar/node@22/22.23.2_1/… → the exact build
```

`bin/node` belongs to whichever node formula is linked, so installing the
unversioned `node` formula repoints it at a different **major** — and the Gateway
inherits that at its next restart. A maintenance reboot is exactly when that
happens.

The exact Cellar path is the obvious fix and the wrong one: `brew cleanup`
removes old versions, converting a silent version change into a Gateway that
**cannot start at all** — a worse failure, in the direction of downtime.

`opt/node@22/bin/node` is chosen: bound to the certified major, following patch
upgrades within it, surviving cleanup. The residual drift is then *caught* rather
than prevented — `certifyInterpreter` compares the **running** `process.version`
against the certified identity and constrains on mismatch or on absence.

> **A classifier bug my own tests caught, and the most dangerous kind.** The first
> `/opt/<name>/bin/` pattern also matched `/opt/homebrew/bin/node`, because
> `homebrew` is a perfectly good `<name>`. The floating path was classified
> MAJOR_PINNED and **safe** — the exact opposite of the truth, failing in the
> direction that says "no action needed" about the one path that needs action.
> The discriminator is the `@version` in the formula segment; the floating case is
> now tested first.

`alloy-pin-gateway-interpreter` rewrites one plist value, has `--status` and
`--revert`, and **does not restart the Gateway** — a restart during an
authoritative soak is precisely what must not happen. Live status:
`NOT PINNED`.

## 4. Push guard, instruction baseline, toolkit doc

**Push guard** — the installer, the delegator and the guard are proven again
here: archive push blocked, ordinary push allowed, missing guard fails closed,
`--uninstall` reverses. `core.hooksPath` is confirmed **unset** on this host, and
a control asserts CLAUDE.md's prose prohibition remains while it is.

**Instruction baseline** — stamping is a pointer and a hash; a control asserts no
instruction text reaches a lane record and that a drifted lane is told to
revalidate while its durable decisions are explicitly left alone. No live lane
state was mutated.

**Toolkit doc** — `AGENT-INSTRUCTIONS.md` no longer restates `3011–3016`. It now
points at the slot registry as the authority and keeps the durable rule: *do not
invent a port; use the one your slot was assigned.* The installed toolkit still
carries the old text, and the configuration audit still reports it — correctly,
because the fix ships with a toolkit that has not been installed.

## 5. Effort and subagents: verified inactive

Not activated. `model_routing_configured: false`, `default_posture: "none"`, and
the configuration audit still reports `effort_unconfigured` as a `watch` — a
report, not a failure, and not a silent activation. The canary requirement stands.

## 6. A planned reboot is not a lost primary

DevOps 10's standby watches for a primary that stops answering. A planned reboot
makes the primary stop answering for minutes — the same observation that opens a
takeover question. A standby that took over during scheduled maintenance would
fence the host that is about to come back, for no reason.

The distinction is **declared, not inferred from timing**: an open maintenance
window in a rebooting phase is an EXPECTED absence and leadership is retained
across it. A `NORMAL` window explains nothing, and an absence with no window
remains DevOps 10's question under its own fencing law.

## 7. The activation sequence, ordered by dependency

1. toolkit installed and certified → 2. collectors measurable → 3. **interpreter
pinned** → 4. push guard installed → 5. baseline stamping → 6. schedule enabled →
7. **reboot capability installed** → 8. dry run → 9. **first cycle attended** →
10. post-boot certified.

The interpreter is pinned *before* a reboot is possible, because a reboot is when
an unpinned one changes. The reboot capability is installed **last** among the
enabling steps, so every other gate is proven before the host can restart at all.
`activationReadiness` reports the first blocking step, not a boolean.

## 8. First-cycle canary law

The first real cycle is **attended**. Fixtures prove contracts; they cannot prove
that this machine reboots, that launchd brings the Gateway back, or that the
collectors see the real fleet.

A failed cycle **disables unattended recurrence** rather than retrying next week
— the failure mode of an unattended weekly reboot that does not come back is a
weekly outage. Two consecutive certified cycles are required before unattended
operation.

## Certification

`maintenance-activation` — **41 passed, 0 failed**, covering all twenty required
proofs.

Regression green: `host-maintenance` 50/0, `artifact-filing-contract` 19/0,
`migration-execution-outcome` 24/0, `control-plane-resilience` 46/0,
`toolchain-canary` 49/0, `agent-configuration` 31/0, `promotion-train` 63/0,
`development-production-apply-owner` 28/0, `development-migration-parity` 37/0,
`development-health` 30/0, `critical-invariants` 23/0, `lane-knowledge` 22/0,
`worktree-lifecycle-class` 27/0, `lane-freshness` 22/0,
`lane-bootstrap-contract` 17/0, `governed-action-handoff` 15/0,
`development-governed-approval` 38/0, `test-canonical-root` 19/0,
`test-guard-push` 29/0, `test-sprint-ops-instructions` 41/0.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No reboot, no Gateway restart, no
toolkit install, `toolkit/current` unchanged, `core.hooksPath` unset, no sudoers
file installed, plist still `/opt/homebrew/bin/node`, no maintenance activated, no
live lane state mutated.

## Remaining debt

- **The checkpoint gate currently fails on real data.** 13 active lanes carry no
  durable next action. That is DevOps 4's coverage gap, and maintenance cannot
  activate until it closes — the collector is right and the fleet is not ready.
- **No live cycle has run.** Everything is fixtures plus a read-only preflight.
- **The sudoers drop-in is written but not installed**, and installing it is an
  operator act requiring admin authority.
- **The interpreter is not pinned on this host** — the tool exists, reports
  `NOT PINNED`, and applying it wants a Gateway restart that the soak forbids.
- **The toolkit doc fix is not live** until the toolkit is installed; the audit
  correctly still reports the stale copy.
