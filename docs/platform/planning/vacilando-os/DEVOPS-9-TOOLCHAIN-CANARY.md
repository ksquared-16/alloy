---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# DevOps 9 — Toolchain Canary, Update & Rollback V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak. **Nothing was updated, activated or rolled back on this host.**

**Baseline.** `origin/staging` @ `8ccf4988b`, with DevOps 8 (`041ca39be`,
carrying DevOps 7–1) merged in.

---

## 1. The law: an update is a candidate

```
CURRENT KNOWN GOOD → CANDIDATE → CANARY → MEASURE → CERTIFY → ACTIVATE
```

not "a new version exists, so update the host". The module decides whether a
change has *earned* activation; it installs nothing. It imports no
`child_process` and invokes no command — asserted by a control that matches on
invocation rather than vocabulary, so the module can still name homebrew and npm
as the owners it delegates to.

## 2. The inventory, and the asymmetry that drives everything

Measured on 2026-09-12:

| Component | Version | Rollback | Why it matters |
|---|---|---|---|
| Vacilando toolkit | `14b0e01dcd06` | **pointer_swap** | 44 versions retained; `current` relinks atomically, offline |
| Claude Code | 2.1.269 | **reinstall** | one npm-global dir that an install *replaces* |
| node | v22.23.2 | **reinstall** | one Cellar version; **the Gateway plist hard-codes `/opt/homebrew/bin/node`** |
| git | 2.50.1 (Apple) | **none** | ships with the OS toolchain |
| macOS | 26.6.2 | **none** | a major upgrade needs a restore |
| supabase / stripe / tailscale | 2.116.0 / 1.50.10 / 1.102.3 | reinstall | CLI scope |

The toolkit is the gold standard — **atomic, local, instant, offline** rollback.
Claude Code and node are not: returning needs the network and the old build still
being published. That asymmetry is not a footnote; it is what the update class is
*derived from*.

**node is the finding that surprised me.** `/opt/homebrew/bin/node` is a symlink
into Cellar, and the Gateway's launchd plist names that exact path — so a node
upgrade silently changes what the Gateway runs on at its next restart, without
anything asking. That is why node classifies `MANUAL_DEFERRED` rather than as
"another dependency".

## 3. Classification is derived, not assigned

```
no rollback mechanism   → MANUAL_DEFERRED, always
major version           → MANUAL_DEFERRED
severe risk             → MANUAL_DEFERRED
all lanes / restart     → CANARY_REQUIRED
low risk + one env      → AUTO_SAFE
unknown component       → MANUAL_DEFERRED
```

A class that cannot drift from the facts justifying it. `git` and `macos` land in
`MANUAL_DEFERRED` by construction — the same rule Section L asks for: *a tool
that cannot be safely rolled back is classified, not canaried and hoped for.*

Live: **CANARY_REQUIRED 9 · MANUAL_DEFERRED 3 · AUTO_SAFE 1.**

> **A bug my own tests caught.** The first classifier required a pointer-swap or
> config-revert rollback for `AUTO_SAFE`, which made *every* remaining component
> `CANARY_REQUIRED` and left `AUTO_SAFE` a class nothing could ever be — a policy
> with one outcome is not a policy. Reinstall rollback is genuinely weaker, but
> that weakness matters in proportion to blast radius: for a low-risk tool
> confined to one environment that needs no restart, the worst case is one
> certification environment behaving oddly until somebody reinstalls.

## 4. A canary is a normal lane

Same bootstrap contract, same instruction baseline, same repository and toolkit
expectations, **no authority expansion**, and it does not mutate production. Only
the candidate configuration and a fixed workload differ. A special canary agent
would measure how a special agent behaves, which is not the question.

The **eval pack** is eight categories — inventory, bounded implementation,
failure diagnosis, governance reasoning, certification synthesis, ownership
reasoning, recovery reasoning, refusal boundary — each pointing at evidence that
already exists. Deliberately small: the question is not "how good is this model"
but "did this change make Vacilando better or worse at its own work".

## 5. Measurement refuses to invent

`tokens` and `cost` are declared **unavailable with a reason** rather than
omitted, so a future provider version can fill them without the schema changing
shape, and so nobody reads the absence as an oversight and supplies a number.

**Correctness is not averaged with speed.** A single instruction or invariant
violation is a regression regardless of how much faster the candidate was — a
scalar score would let speed buy correctness. Duration is reported and never
decides.

A missing *required* metric makes the comparison `UNMEASURED`, which blocks.

**`subagents` is a neutral metric**, asserted: a candidate that only spawned more
subagents reads as `SAME`, never better. Rewarding fan-out is exactly the
behaviour the bounded policy exists to prevent.

## 6. Known-good snapshot: identities, never secrets

`snapshotIsClean` scans for secret-shaped keys and **rejects** rather than
sanitises — quietly dropping a field would let a caller believe it had recorded
something it had not. Secrets appear only as `secret_refs`.

A snapshot that cannot describe the component being rolled back is refused as a
target: `snapshotSufficientFor` names exactly what is missing.

## 7. Automatic rollback, and the anti-oscillation rule

```
certification FAIL or UNMEASURED
  → select last known good     (refused if absent or insufficient)
  → restore via the component's own owner
  → restart only where canonically required
  → certify the rollback target
  → resume only if that certification passes
```

**The rollback target must itself certify.** A rollback that is not proven is
just another uncertified change in the other direction.

**Bounded at two attempts.** A system that returns to known-good, fails to
certify it, re-applies the candidate and fails again will do that forever,
restarting the Gateway each time — turning a bad update into an outage. After the
ceiling the host stays `CONSTRAINED` with the operator told exactly what could
not be restored. *Ending in a known-bad state that is stable and described beats
ending in a loop.*

## 8. Half-applied activation

Every interrupted state has a named recovery, and the dangerous one is
`ACTIVATED_NOT_RESTARTED` — the pointer moved, the process still runs the old
build, and from then on **every version probe disagrees with every observed
behaviour**. This host has produced that shape before as
`gateway_restart_required`.

An interrupted state with no snapshot **constrains** rather than guessing, and an
unrecognised state is treated as unsafe.

## 9. Maintenance carries out a decision it did not make

DevOps 7's `canarySeam` now accepts the DevOps 9 decider. The division is strict
in both directions: maintenance has no evidence with which to judge tool quality,
and a reboot window is the worst moment to start forming an opinion. An **unwired
seam refuses**, rather than defaulting to applying.

**A canary for a different version proves nothing about this one** — activation
requires a certified canary for the *exact* candidate identity.

And a refused update never blocks the reboot itself: maintenance reports it and
reboots anyway.

## 10. DevOps 8 carry-forwards, closed

**N.3 — `guard-push.sh` is now wired, and DevOps 8's hint was wrong.** The guard
documents itself as *"Invoked by git as: pre-push `<remote-name>` `<remote-url>`,
with the ref list on stdin"* — it is a **git** hook, not a Claude `PreToolUse`
hook. Wiring it into `.claude/settings.json` would have handed it a JSON payload
and no arguments, producing a guard that always passed: **worse than unwired,
because it would look enforced.**

Wired instead as `scripts/local-dev/hooks/git/pre-push`, a delegator containing
no rule of its own (asserted), installed by pointing `core.hooksPath` at the repo
— one setting rather than copies that drift, covering every worktree of the
shared `.git` at once, and reversible with `--uninstall`.

Proven by execution, not inspection:

```
archive-namespace push  → exit 1  (blocked)
ordinary branch push    → exit 0  (allowed)
guard file removed      → exit 1  (fails closed)
```

**The CLAUDE.md prompt rule stays.** The installer has deliberately *not* been
run on this host: activating a push-blocking hook during the soak is a
behavioural change, and the instruction is to certify through fixtures.
Structural enforcement is proven and ready; the prose stays until it is actually
installed.

**N.1 — effort policy.** Not activated. `effortCanaryPlan` compares the four work
classes at the five levels this build really supports, and an unsupported level
invalidates the plan rather than being passed through. Adoption waits on canary
evidence, which is the correct order.

**N.2 — subagent routing.** Not configured, deliberately. Support existing is not
a reason to adopt; `subagentCanaryPlan` records `success_is_not: "more
subagents"`.

**N.4 — stale `3011–3016` in the toolkit docs.** *The instruction is truncated
mid-sentence here.* On its evident intent: the file is genuinely non-injected
documentation (nothing reads it at dispatch), so it is recorded as a `watch`
finding by DevOps 8's audit and belongs to a toolkit change rather than a repo
edit. Flagged rather than guessed at.

## 11. Health

`toolchain.activation`, in the existing framework. **No activation is healthy**,
not incomplete — nothing has ever been activated through this path, and a check
red from birth is a check nobody reads. `ACTIVATED_NOT_RESTARTED` and
`CONSTRAINED` are the two `problem` states.

Live: `healthy · state NONE`.

## Certification

`toolchain-canary` — **49 passed, 0 failed**, covering classification derived
from reversibility, correctness-over-speed comparison, neutral subagent scoring,
secret rejection, every half-applied state, bounded rollback, the maintenance
seam, and the push-hook wiring proven by real execution.

Regression green: `agent-configuration` 31/0, `host-maintenance` 50/0,
`promotion-train` 63/0, `development-migration-parity` 37/0,
`development-production-apply-owner` 28/0, `development-health` 30/0,
`development-governed-approval` 38/0, `governed-action-handoff` 15/0,
`test-canonical-root` 19/0, `test-guard-push` 29/0, and the DevOps 1–5 contracts
(17/22/27/22/23, all 0 failed).

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No tool updated, no model
changed, no toolkit replaced, no Gateway restarted, no maintenance activated,
`core.hooksPath` not set on this host, Host Lifecycle lane and soak evidence
untouched. Held with `16601e54f`, `25c85997d` and `041ca39be`.

## Remaining debt

- **Nothing is activated.** No canary has been run against a real candidate; the
  machinery is proven against fixtures and live read-only probes only. The first
  real canary should be watched rather than trusted.
- **`core.hooksPath` is not set on this host.** The wiring is committed and
  proven; installing it is a deliberate act for after the soak.
- **No effort level is configured and no subagent routing exists** — both
  correctly awaiting canary evidence rather than being adopted because support
  exists.
- **node's risk is structural, not fixed here.** The Gateway plist hard-codes
  `/opt/homebrew/bin/node`. Pinning the Gateway to an exact interpreter path
  would remove the silent-inheritance hazard and belongs to the Host Lifecycle
  owner.
