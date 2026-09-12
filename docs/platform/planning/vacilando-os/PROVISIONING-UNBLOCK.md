---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Final Convergence — Provisioning Unblock

**Status.** The stated blocker is **resolved**: Level-2 Critical Invariants are
**10/10 PASS, zero unmeasured**. Convergence now waits on Director authorization
of the staging integration.

---

## 1. Root cause

`alloy-worktree-adopt --no-slot` creates a registered, owned, dispatchable
worktree with no slot and no port — a shape the architecture explicitly supports,
because persistent worktree capability is **not** a slot, **not** a dev server
and **not** a QA session.

`alloy-worktree-provision` then refused exactly that worktree:
`metadata missing ALLOY_WORKTREE_SLOT`.

The demand did not come from the provisioner. It came from `alloy_load_metadata`,
which required `SLOT`, `PORT` and `AGENT` of **every** caller — quietly making
*"is this worktree known?"* mean *"does it hold a Development Slot?"*. With all
12 slots held by live lanes, a promotion train could not install the dependencies
four Critical Invariants need, and DevOps 6's claim that
`alloy-worktree-provision` is the canonical train provisioner was false.

`alloy_sprint_install_deps` only ever does `cd "$web_dir"`. The install phase
genuinely needs a path and nothing else.

## 2. The fix: make the requirement match the operation

`alloy_load_metadata <name> [capability]`:

```
dependencies   name, path, branch
runtime        the above plus slot, port, agent      ← the DEFAULT
```

**`runtime` is the default**, so all 21 other callers keep today's strictness
without being touched — verified by listing every caller: only
`alloy-worktree-provision` passes `dependencies`, and `alloy-dev-start` still
demands a slot because it starts a server. An unknown capability refuses rather
than silently picking one.

The provisioner's closing message is now honest about what it did **not** do: a
slotless worktree is told it has dependencies and no runtime, rather than being
told to `alloy-dev-start` something that would refuse.

**Fix SHA: `45a04c74adb330799e57a8f4dfdfaf0af0b75397`** (successor final train).

## 3. Slotless provisioning, proven end to end

```
$ alloy-worktree-adopt --no-slot convergence-train
  registered, owned, dispatchable — no slot, no port, no dev server

$ alloy-worktree-provision convergence-train
  readiness: dependencies_missing -> ready
  slot:      none (slotless)
  port:      none
  Dependencies only. No slot, no port and no dev server.
```

No Development Slot allocated, no port assigned, no dev server started, no QA
identity minted, no provider capacity consumed. `test-slotless-provisioning`
**15/0**, including that a slotless record still cannot satisfy `runtime`, an
unregistered worktree refuses, a record without a path refuses at every level,
and installation stays inside the canonical dependency helper — no direct
`npm ci` path was introduced.

## 4. Critical Invariants: 10/10

```
ok INV-RUNTIME-001/002/003   INV-GOV-001/002   INV-WORKTREE-001
ok INV-ACCESS-001  INV-ACCESS-002  INV-FIN-001  INV-ATTEND-001

PASS  passed 10/10  new failures 0  pre-existing 0  unmeasured 0  9987ms
```

Was 6/10 with four UNMEASURED. **Nothing was skipped, assumed or inferred** — the
"web is unchanged so probably fine" argument was available and deliberately not
used, because DevOps 5's law is that "we could not check" is not "it is fine".

The pack ran against `ae4f066e8`; the commit was then amended for its message
only, and the trees are byte-identical (`0ab9256ee`), so the result applies to
`45a04c74a`.

## 5. Staging reobservation and train validity

`origin/staging` is unchanged at `5c7b100bcd64` and remains an ancestor of the
train, so the prior composition stands and was **not** rebuilt. The provisioner
fix composes onto it; prior certification evidence is not invalidated.

## 6. Aggregate regression

Green across every touched owner: convergence-hold 8/0, lane-resume 27/0,
maintenance-activation 41/0, host-maintenance 50/0, artifact-filing 19/0,
migration-outcome 24/0, resilience 46/0, toolchain-canary 49/0,
agent-configuration 31/0, promotion-train 63/0, critical-invariants 23/0,
lane-knowledge 22/0, director-approval-reliability 23/0,
async-acknowledgement-latency 15/0, qa-session-env-source 10/0,
governed-approval 38/0, governed-action-handoff 15/0, **governed-action-request
20/0** (15/5 on staging — the train closes that MEASURED_BASELINE debt),
health 30/0, worktree-lifecycle 27/0, lane-freshness 22/0, bootstrap 17/0,
mac-mini-residuals 18/0, migration-parity 37/0, production-apply-owner 28/0,
slotless-provisioning 15/0, canonical-root 19/0, guard-push 29/0.

`development-gateway-ui` is 90/1 (`browser-auth routes answer POST`), verified
identical on pristine current staging.

## 7. Where it stops

`repository.push` filed as **`gar_43ec68e0db52bf`**, status `requested` —
queued for validation and authorization on the trusted host. The branch has not
reached the remote, so the PR, the single staging merge, the toolkit install, the
host activation manifest and the new authoritative soak are all downstream of an
authorization this lane cannot grant and must not refile.

## Intentional residue

`convergence-train` remains **registered slotless and provisioned** at
`/Users/vacilando/Code/alloy-worktrees/convergence-train`. It holds no slot and
no port, and it carries the installed dependencies the next convergence step
needs. Removing it would discard the provisioning and force a reinstall. The
previous run's temporary registration *was* removed; this one is deliberate and
recorded here.

## Remaining debt

- The staging integration, install, activation and new soak are unreached.
- The `gateway_host_mutation` guard on `host.install_toolkit` is committed and
  **not installed** — it protects the next convergence, not this window, which is
  itself the argument for landing this train.
- The superseded `14b0e01dcd06` soak stays interim evidence; criterion 12 is not
  claimed from it.
