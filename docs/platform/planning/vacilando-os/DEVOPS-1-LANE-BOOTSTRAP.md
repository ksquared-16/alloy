# DevOps 1 — Lane Bootstrap & Consistency V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `84e382e56`.
**Candidate.** `promote/devops-1-bootstrap`.

---

## 1. Authority audit — what already had an owner

The audit's finding is the most important thing in this mission: **almost
nothing was missing.** Every fact a lane's baseline is made of already had
exactly one canonical owner.

| Concern | Canonical owner | Verdict |
|---|---|---|
| Lane identity, status, aliases | `development-lane.mjs` (`createDurableLane`) | standardized |
| Provider preference | lane record `preferred_provider` + `execution-providers.mjs` | standardized |
| Repository | `repository-registry.mjs` + lane `repository_id` | standardized |
| Worktree, branch, registration | `lane-worktree-lifecycle.mjs` (`resolveLaneWorktree`) | standardized |
| Development Slot topology | `managed-slots.mjs`; allocation by `ensureLaneSlot` / `slotReclaimCandidates` / `reassignSlot` | standardized |
| QA identity, per-slot env | `browser-auth.mjs` | standardized |
| Toolkit generation | installed toolkit tree + `TOOLKIT_DRIFT` convergence | standardized |
| Health / doctor | `health.mjs` — `CHECKS`, `finding()`, `composeReport`, `vac health` | standardized |
| Instruction pack (CLAUDE.md) | *implicit convention* — discovered by whoever looked | **gap** |
| "Is this lane on the current baseline?" | *nothing* | **gap** |
| Baseline assembled in one place | *nothing* — six modules, and you had to know which six | **gap** |

**So the problem was not missing facts. It was unassembled ones.** "Does this
lane have the same baseline as that one" could only be answered by visiting six
modules and knowing which six, so in practice nobody asked — and lanes drifted by
accumulation rather than by decision.

**No duplicate owner was added.** Nothing here registers a lane, allocates a
slot, resolves a worktree, chooses a provider or decides toolkit compatibility.

## 2. The contract

`lane-bootstrap.mjs` is a **resolver, not a registry**. It asks each canonical
owner the question it already answers and assembles one deterministic view:

```
lane identity · repository · worktree · branch · Development Slot
provider · environment (per-slot QA identity) · instruction pack
toolkit generation · work class
```

**Consistency means same contract, not same resources.** A lane with no slot, no
server and no browser is fully valid — those appear as `assigned: false`, never
as faults.

## 3. Base + overlay

The baseline is **derived on every read, never copied into the lane.** Copying it
is precisely how a fleet ends up with N independently maintained configurations
that quietly disagree.

The overlay is the small, enumerated set of fields a lane already carries:
`preferred_provider`, `work_class`, `scarce_resource_priority`, `repository_id`,
`folder_id`, `aliases`, `mission_id`. **No mechanism was built to hold them** —
they already existed; this names them, which is what turns convention into
contract.

Only *differences* count. A lane whose provider is `claude` has not configured
anything, it has agreed with the baseline — reporting that as an overlay would
make every lane look customised and hide the ones that are.

## 4. Versioning and drift

`bootstrap.contract_version` on the lane record — the existing registry, the
existing schema-versioned store. It is the **one fact that cannot be derived**,
because it is historical: which contract was in force when this lane was created.

`LANE_BOOTSTRAP_CONTRACT_VERSION` lives in a **dependency-free leaf**
(`lane-bootstrap-contract.mjs`). The registry writes the stamp and the resolver
reads it, and the resolver must also ask the registry for lanes — putting the
constant in either creates an import cycle that survives today only by accident
of hoisting order, and would break later as an undefined function with no obvious
cause.

**Stale is a watch, not a problem.** Every lane created before this contract
existed is unstamped by definition, so on the day this ships the whole fleet
reads stale. Scoring that as a problem would make the check's first act be to
declare the system broken — which is how a signal gets ignored for ever.

## 5. The diagnostic

`lane.bootstrap`, a check in the **existing** health framework — same `CHECKS`
registry, same `finding()` shape, same severities, same exit codes, reported by
`vac health` beside `lanes.consistency`. A separate `lane doctor` would have been
a second place to look, a second vocabulary, and a second thing to keep working.

It reads and never mutates, and — asserted by injection, not by comment — it
**acquires nothing**: no slot, no server, no provider, no browser. A consistency
check that consumed the resources it checks would be unusable on exactly the
loaded host where you most want it.

## 6. Existing-lane drift, measured

`vac health --check lane.bootstrap` against the live fleet, without mutating
anything:

```
problem  lanes 13 · stale 13 · unresolved 6 · with_overlay 13

  Surfaces:           branch:drift
  Payments:           environment:qa_identity_missing
  Troubleshooting:    worktree:lane_slot_unregistered
  UI-Vac:             environment:qa_identity_missing
  Attendance:         environment:qa_identity_missing
  Access & Identity:  environment:qa_identity_missing
  Runtime Performance: bootstrap unstamped
  Financials:          bootstrap unstamped
```

All 13 stale is expected — they predate the contract. The six **unresolved** are
real: a branch that has drifted from its expected value, a lane whose slot is
unregistered, and four lanes holding slots with no declared QA identity (the
config declares identities for slots 1–6 and 8; lanes on 7 and 9–12 have none).

None of it was repaired here. DevOps 2 owns that decision.

## 7. Certification

`lane-bootstrap-contract` — **17 passed, 0 failed**: two independently created
lanes resolve the same contract; a new lane is stamped; an overlay changes only
its declared difference and nothing else moves; agreeing with the baseline is not
an overlay; the overlay surface is enumerated; a slotless lane is fully valid;
bootstrap implies no execution, server or browser; **bootstrap acquires nothing**
(asserted by injecting recorders for every owner); unstamped and superseded lanes
read stale but not broken; an unresolvable baseline carries the lifecycle owner's
own refusal code verbatim; the inventory reports without mutating; a lane that
cannot be resolved still appears rather than silently improving the numbers; and
the check integrates with the existing health framework with the right severities.

Regression green across the lane, slot, worktree, placement, folder,
provisioning, admission, control-plane, activity, QA-slot, browser-auth, agent
and provider-session suites.

**A test caught a real bug.** `Number(null)` is `0` and `Number.isInteger(0)` is
`true`, so the obvious slot coercion turned "no Development Slot" into "slot 0" —
which then looked up slot 0's QA identity, failed, and reported a *slotless lane
as having an unresolved environment*. A fault invented entirely by a coercion, in
the exact case the contract promises is fine. Absence is now checked before
conversion.

**One fixture was corrected, not silenced.** `development-health`'s "fully
healthy" composition omitted the new probe, so `lane.bootstrap` returned
INCOMPLETE — correct for a check with no data, and a `watch`. A fixture claiming
every check passes has to supply every check.

## 8. DevOps 2 — the canonical seam

DevOps 2 (Lane Freshness & Resume) should build on exactly these, and should not
need a second freshness or bootstrap system:

- **`inventoryLaneBootstrap()`** — the fleet, measured against the contract, with
  per-lane `stale`, `unresolved[]` and `overlay`. This is the input to a
  freshness decision.
- **`resolveLaneBootstrap(laneId)`** — one lane's baseline, including
  `baseline.branch.{expected,actual,drift}` and `baseline.worktree.code`, which is
  where staging-divergence work starts.
- **`laneBootstrapIsStale(rec)` / `LANE_BOOTSTRAP_CONTRACT_VERSION`** — whether a
  lane predates the current baseline, which is the trigger condition for
  revalidation after long inactivity.
- **`lane.bootstrap` health check** — already wired into `vac health`, so
  freshness findings have a reporting surface that exists.

**Deliberately NOT provided here**, because DevOps 2 owns them: inactivity
thresholds, staging divergence policy, fetch/rebase/reconciliation, and the
dirty / shared-worktree / certification-candidate refusals. This mission
established identity and versioning so DevOps 2 can make that decision safely; it
did not make the decision.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing was installed, no Gateway
restarted, no toolkit replaced, and the Host Lifecycle lane and its soak evidence
were not touched. Per the DevOps program's own law this candidate is **not merged
to staging independently** — it waits to be sequenced with the other certified
pieces after the soak.

Queued ahead of it, untouched and not duplicated: Director Governance V1
(`f1089527b`), the combined Governance + Async Acknowledgement candidate
(`16601e54f`), and the Thread 5 certification-auth fix (`25c85997d`).
