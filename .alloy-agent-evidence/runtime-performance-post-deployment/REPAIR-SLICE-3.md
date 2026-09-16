# POST-DEPLOYMENT REPAIR SLICE 3 — P0-3 / P0-4

Run `erun_637790b9a3408786` · starting SHA `fc1266fa7c3332573831b748c7c16b76714b50e3`
**Repair `4392e1eaf0cb26a076450f385ad9189d5522a471`** · not merged, not promoted, not deployed.

## Files changed (4)

```
M  web/components/admin/focusPanel/cards/AttendanceCard.tsx
M  web/components/admin/focusPanel/cards/HealthSafetyCard.tsx
A  web/tests/runtime/cardEmptyStateSemantics.test.ts
M  web/tests/runtime/reservedGeometryConvergence.test.tsx   (one lock re-expressed, not removed)
```

## The taxonomy already existed — upstream

`focusPanelOperationalProjectionContract.ts` declares
`ProducerState = "ready" | "unavailable" | "error" | "forbidden"` and states the rule both cards were
breaking:

> *"`unavailable` and `error` are different facts: no subject to read for is ordinary, a failed read is
> not, and collapsing them would make an outage indistinguishable from an empty one."*
> *"`forbidden` … the card must say 'you do not have permission' rather than render an empty surface."*
> An absent `cards` member is *"'provisioning', never … 'no attendance'."*

**Nothing in this slice invents a state.** Every state used here is one the projection already sends.

## Attendance — producer/consumer map

```
server producers → operationalProjection.cards.attendance : ProducerResult<AttendanceCardVM>
  → AttendanceCard:  provisioned = context.operationalProjection?.cards?.attendance ?? null
                     provisioning = memberId != null && provisioned == null
                     setVm(provisioned?.state === "ready" ? provisioned.data : null)
  → loaded renderer (ApprovedAttendanceCard) when vm
  → root fallback when !vm
```

**Why the VM became null:** `state === "ready" ? data : null` — **`unavailable`, `error` and
`forbidden` all mapped to null**, and the fallback then printed one sentence for all of them plus the
genuine-absence case. That is the deployed `rich → bare` transition: whatever non-ready verdict the
settled frame carried, the card rendered it as "No attendance record."

**Was the first `unavailableReason` canonical?** Yes — it is a field of the ready VM the producer
sent, so state 1 was authoritative, not provisional.

**Is the final null correct?** The *value* may be correct; **its rendering was not**. This slice
repairs the rendering and does not touch the producers, so a genuine projection-loss bug upstream (if
any) remains visible rather than masked — it will now surface as `unavailable` or `error` copy instead
of silently reading as absence.

## Health — producer/consumer map

Identical shape via `cards.health`, with one difference already present: Health mapped
`state === "forbidden"` to `denied` and rendered a permission sentence. It still collapsed
`unavailable` and `error`. Its `vm.unavailableReason` branch and the required-information rendering
are untouched by this slice.

**What "health record" means here:** a ready `HealthSafetyCardVM`. Required-information lives *inside*
that VM, which is why losing the VM erased the requirements — the record and the requirements were not
separable at this layer, and this slice does not attempt to separate them.

## Empty-state taxonomy, as rendered after the repair

| State | Attendance | Health |
|---|---|---|
| LOADING / PROVISIONING | `data-attendance-empty="loading"` | `data-health-empty="loading"` |
| AVAILABLE_WITH_DATA | loaded card | loaded card |
| AVAILABLE_WITH_NO_DOMAIN_RECORD | `…="no-record"` | `…="no-record"` |
| UNAVAILABLE_WITH_REASON | `…="unavailable"` (+ the loaded card's own `unavailableReason`) | `…="unavailable"` (+ `vm.unavailableReason`) |
| FORBIDDEN | `…="permission"` **(new)** | `…="permission"` (existing `denied`) |
| PRODUCER_FAILURE | `…="error"` **(new)** | `…="error"` **(new)** |
| NOT_APPLICABLE | `…="no-participant"` (existing) | `…="no-participant"` (existing) |

## Operability

**Attendance.** Case A (attendable, no event today) and Case B (not attendable) are both rendered by
the **loaded** card, which already suppresses commands under *"NO COMMANDS WHEN THERE IS NOTHING TO
COMMAND"* when `vm.unavailableReason` is set. That contract is unchanged — the defect was never in the
loaded path. Cases C (forbidden) and D (producer failure) previously reached the bare fallback and now
have their own states. **No new mutation path or card-specific write was created.**

**Health.** Requirements are rendered from the ready VM; that path is untouched. Forbidden keeps its
existing refusal. No Health-specific mutation runtime was introduced.

## 18. One root cause, or one symptom?

**One root cause, in two copies.** Both cards independently reduce the same four-state contract with
the same expression (`state === "ready" ? data : null`) and then print a single sentence for
everything left. Health had already carved out `forbidden`; Attendance had not. So it is the same
defect written twice, not two unrelated defects that happen to look alike — which is why one repair
shape fixed both.

**What this slice does NOT claim:** the exact producer verdict the deployed settled frame carried.
Slice 2 recorded that it is not observable without instrumenting a deployed build, and I did not
instrument one. The repair is correct for every verdict, which is why it did not need that answer.

## Semantic monotonicity

Forbidden transitions are now locked by test: a producer failure, a refusal, or an unavailable verdict
can no longer print as absence, and no single ternary may print one sentence for every non-ready
state. Allowed transitions (loading → meaningful, meaningful → richer, no-record → its own explained
state) are unaffected.

## Subject / grain

Both cards still read `scope?.customerMemberId` — the scoped participant, never a household fallback —
and both still clear the VM from **this** subject's projection on every projection change, so no prior
child's truth can survive a subject switch. Asserted by test. Enrollment/placement truth continues to
come from the producer's VM, not from profile truth.

## Requests

**NEW NETWORK REQUESTS: 0.** No fetch, cache, timer or readiness source added; Work View warming,
neighbour prewarm, queue fetches, drawer-VM timing, the provisioning scheduler and cache TTLs are
untouched.

## Certification

| Gate | Result |
|---|---|
| `vac run typecheck` | **0** |
| Production build | **rc=0** (first attempt returned an S5 capacity refusal, not a failure; retried) |
| `cardEmptyStateSemantics` | **19 passed** |
| + Slice 1 + Slice 2 suites + reserved geometry + `tests/surfaces/` | **46 files / 462 tests passed** |

**Planted defect:** the collapsing ternary restored on **both** cards → **9 of 19 failed**, including
both `FORBIDDEN COLLAPSE LOCK`s, both "a producer FAILURE is not rendered as absence", and the refusal
lock. Reverted; 19/19.

**One test was re-expressed, not deleted.** `reservedGeometryConvergence` pinned the literal old
ternary. Its intent — the reserve predicate and the pending copy must agree on "not settled" — is now
asserted against the split shape (`loading || provisioning ? (` plus the loading state marker). The
reserve predicate itself is unchanged.

## Architecture guards

One presentation owner per card · one projection/context path · no new loader, fetch, cache, reveal
engine or readiness source · no stale VM pinning · no queue-preview authority · no duplicated
enrollment/health/attendance truth · producers untouched.

## Prior repairs

Slice 1 (`workspaceLoaderOwnership`) and Slice 2 (`businessProcessCommitMeaning`) re-run in the same
command: **green**.

## Composability

Two card renderers and tests; no shared contract edited. **Clean.**

## Ledger

* P0-1 **REPAIRED (local)** · P0-5 acknowledgement **REPAIRED (local)** · P0-2 **REPAIRED (local)**
* **P0-3 / P0-4 REPAIRED (local)** — the empty-state taxonomy is rendered rather than collapsed
* P0-6 — Business Process contribution removed; the remaining fragmentation is still open
* S8-2 **OPEN**, untouched · P1-1 **ROOT_CAUSED**
* **Carried, not taken:** whether the settled frame's non-ready verdict for these producers is itself a
  projection-loss defect. It is now *visible* instead of silent, which is the precondition for finding
  out — a deployed re-run will read `unavailable`/`error` copy if so.
