# POST-DEPLOYMENT REPAIR SLICE 2 — P0-2 / P0-6

Run `erun_7b2d5eb750a617de` · starting SHA `ff240a1af2e051901296fba06ad72b8983c415f2`
**Repair `05674c84df4b0ea4aacadafcfb8a159cacab48f2`** · not merged, not promoted, not deployed.

## Files changed (2)

```
M  web/components/admin/focusPanel/cards/BusinessProcessCard.tsx   (one expression + comment)
A  web/tests/runtime/businessProcessCommitMeaning.test.ts
```

## 1. Pre-change ownership map

| Question | Where it lives | Frame |
|---|---|---|
| **A. process name** | `lifecycleRail.process_name` → `buildOperationalContext` → `context.businessProcess.name`. The provisioning answer carries `businessProcess: {key, name}` (U-O1) but the **commit-critical producer does not forward it** | **settlement** |
| **B. current stage key/label** | `input.situation.stageKey/stageLabel` → `buildCommitCriticalOperationalContext` → `context.businessProcess.key/label/stageKey` | **commit** |
| **C. ordered stages** | `railStages` → `context.businessProcess.stages`; the commit producer sets `stages: []` ("No configured process rail on this producer") | **settlement** |
| **D. final `businessProcess.evidence`** | `subjectVm.workspace.operational_projection` via the drawer VM, request begins ~14.7 s | **settlement** |
| **E. requires settlement** | rail, process name, participants, unresolved participants, selected participant, work rollup, attention/tour/billing signals | — |
| **F. truthful from commit** | case stage key, case stage label | — |

No duplicate computation exists: `buildBusinessProcessCardEvidence(context)` is the single projection
from `OperationalContext` to card evidence, and `EMPTY_BUSINESS_PROCESS_EVIDENCE` is **already** that
same builder run over an empty context.

## 2. Minimum meaningful contract

During settlement the card answers, from committed truth only:

* **Which stage is this subject in?** — `caseStageKey` / `caseStageLabel`.

It does **not** answer, and does not pretend to:

* which process by name (commit frame does not carry it)
* where in the configured process (no rail at commit)
* completion, readiness, outcomes, requirements, actions, participants

Those arrive with settlement. Nothing is guessed; absent things stay absent.

## 3. Field classification

| Field | Class |
|---|---|
| `caseStageKey`, `caseStageLabel` | **COMMIT_AVAILABLE** |
| `processLabel` | **DERIVED_FROM_COMMIT** (the stage label today) |
| `processName` | **SETTLEMENT_ONLY** |
| `stages` (the rail) | **SETTLEMENT_ONLY** |
| `participants`, `unresolvedParticipants`, `selectedParticipant` | **SETTLEMENT_ONLY** |
| `currentWork`, attention / tour / billing rollups | **NOT_SAFE_BEFORE_SETTLEMENT** |

## 4. The repair (shape B, one expression)

```ts
const base =
    projected?.businessProcess.evidence
    ?? buildBusinessProcessCardEvidence(context, { selectedParticipantId });
```

Previously `?? EMPTY_BUSINESS_PROCESS_EVIDENCE`.

**Payload check, because the file warns about exactly this.** Its comment records that running the
builder client-side once cost "~78 KB of published configuration" reaching the browser. That applied
to the *old* composition which resolved stage and work from raw config. The current builder reads
`context.businessProcess.stages` — a normalised array already on the context — and at commit that
array is `[]`. **Nothing is fetched and no configuration returns to the browser.**

## 5. Card lifecycle

| | before | after |
|---|---|---|
| subject commits | card **absent from the DOM** | card present, stage meaningful |
| …for | ~5.9 s after siblings, 20.7 s from cold entry | — |
| settlement lands | whole card suddenly appears | the **same** card gains rail, name, participants |

## 6. Semantic monotonicity evidence

Tests assert, over the real builder with a commit-frame and a settled context:

* stage key and label are **identical** before and after settlement;
* settlement **adds** the rail (`[]` → four stages) and the process name (`null` → "Enrollment");
* **no field meaningful at commit becomes null at settlement**;
* a settlement that genuinely moves the stage is **visible as a change**, not blended — authoritative
  truth wins and the test states the disagreement rather than hiding it.

The card element itself is never removed and re-inserted: the commit and settled paths render the same
component from the same builder output shape, so there is no flash/remove/reinsert.

## 7. Slow settlement

There is no separate "slow" branch to simulate, and that is the point of the repair: **the pending case
IS the commit case.** However long settlement takes, the card renders commit-frame evidence with its
stage meaningful — asserted directly.

## 8. Requests

**NEW NETWORK REQUESTS: 0.** The card contains no `fetch(`, no `useState`, no `setTimeout`, no new Map
— asserted by test. Provisioning concurrency, prewarm, queue fetching, drawer-VM timing, cache TTL and
Work View routing are all untouched.

## 9. Certification

| Gate | Result |
|---|---|
| `vac run typecheck` | **0** |
| Production build | **rc=0** |
| `businessProcessCommitMeaning` | **11 passed** |
| + Repair Slice 1 suite + `tests/surfaces/` | **44 files / 429 tests passed** |

**Planted defects, both reverted.**

| Plant | Failed | Message |
|---|---|---|
| restore the blank `EMPTY_BUSINESS_PROCESS_EVIDENCE` fallback | *falls back to the builder…* | `expected … to match /\?\?\s*buildBusinessProcessCardEviden…/` |
| let settlement erase stage identity | *stage identity survives settlement*, *MONOTONIC…*, *a settlement that disagreed…* | `caseStageKey may not be erased by settlement: expected null not to be null` |

## 10. Architecture guards

One Business Process presentation owner · one `operationalProjection`/context path · no new loader,
fetch, cache, reveal engine, readiness source or second Focus Panel · no whole-payload commit blocking
(the drawer VM still owns settlement and still arrives when it arrives) · no queue-preview authority ·
no stale pinning — commit evidence is this subject's own truth, not a held prior subject's.

## 11. Repair Slice 1 regression

`workspaceLoaderOwnership` re-run in the same command as this slice's suite: **passing**. P0-1 loader
ownership and P0-5 acknowledgement are untouched by this change.

## 12. Composability

This slice edits **one expression in one card** plus a new test. It touches none of the files
P0-3/P0-4 need (`AttendanceCard`, `HealthSafetyCard`) and no shared contract. **Clean and suitable for
P0-3/P0-4 to compose on top.**

## 13. Not deployed

No human acceptance is claimed. The acceptance check remains: on cold deployed entry the Business
Process card is present and names the subject's stage at the same moment its siblings become
meaningful, and settlement fills the rail in place.

## Ledger

* P0-1 **REPAIRED (local)** · P0-5 acknowledgement **REPAIRED (local)**
* **P0-2 REPAIRED (local)** — time-to-meaningful moves from settlement to commit
* **P0-6** — the Business Process contribution to staggered settlement is **removed**; the remaining
  fragmentation (siblings at 11.8 s, settlement burst at 14.7 s) is untouched and still open
* P0-3 / P0-4 REPRODUCED, untouched · S8-2 OPEN, untouched · P1-1 ROOT_CAUSED
* Follow-up noted, not taken: forwarding the answer's `businessProcess.name` into the commit producer
  would let the card also name the process at commit. Four files for one string — out of this slice.
