# DevOps 5 — Critical Invariants Pack V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `f54cdf6be`, with DevOps 4 (`52c95cfcd`, carrying
DevOps 3, 2 and 1) merged in as the first commit.

---

## 1. What the pack is

A **manifest**, not a test suite. It defines no rule and asserts nothing — a
control asserts that the manifest module contains no `assert`, `expect`,
`spawnSync` or `execFileSync`, because the day it does, it has become the second
source of truth it exists to avoid.

Each invariant names an existing authoritative control and asks it to prove the
rule its owner already owns.

**What makes something critical:** not "this feature matters", but a truth whose
violation corrupts, misroutes, duplicates or destabilises work *even when the
changed feature looks correct* — the class of failure unrelated changes cause and
unrelated tests miss.

Three entries exist because exactly that happened in this programme:

| | |
|---|---|
| `INV-RUNTIME-001` | Slot 8 was claimed by two ACTIVE lanes for days. Nothing looked broken; one lane just couldn't resolve its bootstrap, and the message described the lane rather than the duplicate. |
| `INV-GOV-002` | A second press minted a **second single-use grant** — which is what defeated single-use. 111 duplicate approvals, 141 extra executions, measured before anyone noticed. |
| `INV-WORKTREE-001` | A classifier reading one wrong field name briefly reported **21 of 31 worktrees as safe to delete**. |

## 2. The ten invariants

| ID | Statement | Owner |
|---|---|---|
| `INV-RUNTIME-001` | One managed Development Slot has at most one current lane owner | managed-slot / lane ownership |
| `INV-RUNTIME-002` | Lane identity ≠ slot ≠ worktree ≠ execution, and survives losing any | development-lane |
| `INV-RUNTIME-003` | A recorded observation cannot become permanent authority | lane-knowledge / canonical owners |
| `INV-GOV-001` | No execution without authority for that exact action, target, environment | governed-action authority |
| `INV-GOV-002` | One governed decision cannot mint two grants or two executions | governed-action lifecycle |
| `INV-WORKTREE-001` | Dirty/untracked/undurable work cannot be destroyed; unmeasured gate blocks | worktree retirement |
| `INV-ACCESS-001` | Anonymous principals cannot reach privileged surfaces | access / authority model |
| `INV-ACCESS-002` | Authority layers are enumerable; no surface authorizes outside them | access / authority model |
| `INV-FIN-001` | A charge cannot be posted, duplicated or corrected losing its lineage | financial charge lifecycle |
| `INV-ATTEND-001` | Attendance is append-only; a correction adds a fact, never rewrites | operational facts |

Statements describe **truths**, never implementations — a control asserts no
statement contains `function`, `returns` or `()`, because an invariant phrased as
an implementation detail must be rewritten whenever the implementation moves and
stops being something anyone can argue with.

## 3. Speed, measured — and what it cost to get there

The first assembled pack ran in **79 seconds**. Two findings, both fixed by
choosing better proofs rather than weaker ones:

- **`INV-GOV-001` took 65.9s** — more than four fifths of the pack — because it
  named `development-governed-approval`, which proves this truth *among many
  others*. `development-exact-authorization` proves exactly the statement in
  **70 ms**. The broad suite still runs at LEVEL 1 where its breadth is the
  point; here breadth bought nothing and cost the property that makes the pack
  unavoidable.
- **`INV-GOV-002` took 10s and was red** on a control failing for unrelated stale
  fixtures — importing someone else's debt into this invariant's outcome.
  `governed-action-handoff` proves the same dedupe in **1.4s**, green.

**79s → 4.9s.** Projected full pack with web dependencies present: **~9s**
(measured vitest proofs: 554–2458 ms each).

`max_ms` is a ceiling, not a prediction — it exists so a proof that grows into a
slow one is reported as a budget breach rather than quietly making the pack
something a lane starts skipping.

## 4. The failure law

```
PASS                        → integration may proceed
FAIL (new)                  → BLOCKS. No override exists.
FAIL (proven pre-existing)  → recorded as debt, outcome stays FAIL,
                              does not count as a new failure
UNMEASURED                  → BLOCKS. "We could not check" is not "it is fine".
```

A control asserts the result object has no `override`, `force` or
`approved_anyway` field. There is no generic approve-anyway for a failed critical
invariant.

**Unmeasured is the whole law in one value.** A promotion worktree has no
`web/node_modules`, so four vitest-backed proofs genuinely cannot run there. The
tempting behaviour is to skip and report green — which would mean the pack
silently covered half the platform at exactly the boundary it guards. It fails
closed and says what to install.

A runner that throws, returns nothing, or returns something unrecognised is
UNMEASURED. Never an optimistic pass.

**Pre-existing debt is measured, not assumed.** `governed-action-request` fails on
pristine `origin/staging` at **14 passed / 6 failed** — verified by checking
staging out clean and running it. It is recorded in `MEASURED_BASELINE` with its
cause and the candidate that fixes it. But a baseline is **never granted
automatically**: `runCriticalInvariants` defaults to `baseline = []`, asserted by
a control, because a baseline the pack gives itself is a pack that excuses its own
failures.

## 5. Fault injection

A safety pack proven only while everything is green is not proven.

- **Slot ownership** — the real owner (`detectSlotOwnershipConflicts`) is given a
  real violation: two ACTIVE lanes on one slot. It detects it. The healthy shape
  is also asserted *not* to trip, or the invariant is just noise.
- **Governed-action safety** — injected failure blocks with `failed_new: 2`.
- **Business spine** — `INV-FIN-001`, `INV-ATTEND-001` and `INV-ACCESS-001` each
  independently proven able to block.
- **Knowledge contradiction** — the real owner given a record asserting a slot
  the canonical owner reassigned; `canonical_wins`.

## 6. Knowledge integration

Uses DevOps 4's model directly, with no second evidence store:

- `packCertification` → `certificationRecord`, carrying **one concise line per
  invariant** and `pre_existing_failures` as ids. A control asserts the record
  stays under 4 KB, because raw vitest stdout in a lane's knowledge is the
  unbounded log that model exists to prevent.
- `packRationale` → `durableDecision`, recording *why the pack is small* with the
  three alternatives rejected — the question a future reader will otherwise
  re-litigate.

## 7. Certification

`critical-invariants` — **23 passed, 0 failed**, covering all fifteen required
proofs plus stable-id structure, truth-not-implementation phrasing, every named
proof existing on this base, determinism of the DevOps 6 seam, and the manifest
holding no rule of its own.

Regression green across DevOps 1–4 contracts, health, durable-lane,
worktree-retirement, exact-authorization, governed-action-handoff, lane-memory and
browser-auth.

## 8. DevOps 6 — the enforcement seam

```js
runCriticalInvariants({ candidate, environment, level, runProof, baseline })
  → { verdict: PASS | FAIL | UNMEASURED,
      blocks_integration,
      counts: { passed, failed_new, failed_pre_existing, unmeasured },
      results: [ { id, outcome, pre_existing, detail, ms } ],
      candidate, environment, elapsed_ms, within_budget }
```

Deterministic in, deterministic out — asserted. `vac-invariants.mjs` is the CLI,
exiting `0` pass, `2` real failure, `3` unmeasured, so a caller can distinguish
"the platform is broken" from "this checkout cannot prove it".

**Not built here:** no promotion queue, no train batching, no candidate ordering,
no rebase, no staging merge, no supersession signal. The seam is exposed; the
train is DevOps 6's.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched.
Held with `16601e54f`, `25c85997d`, `2eb5c3f27`, `db0033e12`, `f59c0fca5` and
`52c95cfcd`; lands after DevOps 4 or with the chain.

**Remaining debt.** Four invariants are UNMEASURED in a bare promotion worktree —
correct, and it means a promotion worktree must be provisioned before it can reach
READY_FOR_STAGING, which is DevOps 6's to arrange. `INV-GOV-002` has a stronger
proof (`director-approval-reliability`, 41 ms, asserting no second grant is
minted) arriving with `16601e54f`; the manifest records the pending upgrade rather
than losing it.
