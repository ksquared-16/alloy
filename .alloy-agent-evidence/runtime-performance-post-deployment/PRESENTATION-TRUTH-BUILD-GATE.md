# PRESENTATION TRUTH — BUILD GATE ATTEMPT

Candidate `d177b7e066d275ce4ca21a57c88f5cd83edc12a7` (Slices 9 + 9A, reconciled with staging).
**No product code changed in this run.** Not promoted, not deployed.

## FINAL STATUS: `PRESENTATION_TRUTH_BUILD_BLOCKED_HOST_CAPACITY`

The build gate is a hard prerequisite for promotion, and promotion is a prerequisite for deployed
acceptance. Neither could legitimately proceed, so neither was attempted.

---

## 1. BUILD GATE — REFUSED, NOT FORCED

Nine attempts across Slices 9, 9A and this run. Every one refused by the S5 broker, and the condition
**worsened** during this run rather than clearing:

| Observation | Unbrokered units | Budget | Memory deficit |
|---|---:|---:|---:|
| Slice 9 | 16 | 9 | — |
| Slice 9A | 16 | 9 | 1.5 GB |
| this run, start | 16 | 9 | 2.1 GB |
| this run, mid | 20 | 9 | — |
| **this run, final** | **28** (+6 governed) | **9** | — |

Final broker evidence:

```
Governed 6 plus unbrokered 28 exceeds the enforced budget of 9.
· lane_2cea84351d90  "Trust Runtime"      production_build  npm exec next build          (weight 6)
· lane_2cea84351d90  "Trust Runtime"      production_build                                (weight 6)
· lane_141c9c1f3f2f  "Access & Identity"  heavy_test        vitest tests/access|metrics|adminV2 (weight 8)
error: validation capacity refused by the S5 broker
This is not a temporary wait. Admitting it would repeat the rc=143 termination.
```

**Two peer lanes are now competing**, not one: Access & Identity's heavy suite plus Trust Runtime's own
production build. PIDs change between attempts, so both are re-running rather than hung.

**This is not a candidate failure**, and the broker's warning is not hypothetical here: a `vac run
typecheck` attempt during this run was **cancelled with `rc=143`** mid-execution — the exact termination
the refusal exists to prevent. Forcing the build would reproduce it.

---

## 2. WHAT WAS COMPLETED WHILE BLOCKED

### Reconciliation — and a merge that needed checking

Staging had moved **9 commits**. Reconciled at `d177b7e066d…`.

**Staging also modified `app/adminV2/components/alloyOsRuntime.css`** — the single file the 7.5 height
repair touches. The merge auto-resolved without conflict, which is exactly when a candidate is most
likely to be quietly wrong, so it was verified rather than trusted: the rule survives intact at
`alloyOsRuntime.css:5262`.

```css
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell {
  align-items: stretch;
}
```

### All four repairs verified present on the reconciled candidate

| Finding | Repair | Verified |
|---|---|---|
| **P0-7.2** subject identity | seed carries `subjectImageUrl`; header on the click clock; overlay laundering removed | ✓ |
| **P0-7.3** held Work View rows | `queueIsHoldingPriorLens` marks the queue held | ✓ |
| **P0-7.4** reserved cells | `data-focus-panel-cell-resolving` intentional resolving state | ✓ |
| **P0-7.5** band fill | `align-items: stretch` on the solved-grid cell | ✓ |

### Certification re-run on the reconciled tree

**210/210 across 14 files** — presentation truth, band fill runtime path, row-height solver, transport,
phase convergence, Slice 4 admission, P0-1, P0-3/P0-4, reserved geometry, settlement reserved geometry,
grid layout, drawer-attention authorization.

Not inherited from the pre-merge SHAs. Re-run because staging moved.

### Deployed acceptance harness — written, unrun

`pt-accept.mjs` is ready and syntax-checked. It measures all four gates on a cold child-grain entry plus
a lens switch and a record switch, and captures four screenshot specimens for human review
(`A1/A2` identity transition, `B` held Work View, `C` resolving cells, `D` equal-height band) — because
visual acceptance should not be reduced to DOM assertions.

**It has not been run.** The repairs are not deployed, so running it would measure the *old* build and
prove nothing about this candidate.

---

## 3. A PROVENANCE CHECK THAT WAS WRONG, AND CORRECTED

A grep over `overlayChildMissionOntoSettledFocusModel.ts` reported the identity-laundering fallback as
present again after the merge — while the test suite asserting its absence passed. One of the two had
to be wrong.

The grep was. Its only match is inside the comment documenting the removal:

```
* This chain used to end `?? settled.context.participantScope?.imageUrl`.
```

Confirmed against comment-stripped source: **present in the file, absent from the code.** The tests
strip comments; the grep did not. Recorded because a provenance check that reads a comment as code is
the same instrument-defect class this programme has now hit six times, and reporting it the other way
would have falsely failed a good candidate.

---

## 4. GATES

| Gate | Result |
|---|---|
| Focused certification on the reconciled tree | **210/210 pass**, 14 files |
| All four repairs present after reconciliation | **verified individually** |
| `vac run typecheck` (reconciled tree) | **NOT OBTAINED** — cancelled `rc=143` under host pressure |
| `vac run build` | **REFUSED** ×9 — `BUILD_GATE_BLOCKED_HOST_CAPACITY` |
| Promotion | **not attempted** — build is its prerequisite |
| Deployed acceptance (7.2–7.5) | **not attempted** — promotion is its prerequisite |

Typecheck passed `rc=0` on the pre-merge tree in Slice 9A; the reconciled tree's typecheck is **owed**,
and is not claimed on the strength of the earlier run.

---

## 5. PROGRAMME

### P0-7 ledger

| # | Item | Status |
|---|---|---|
| 7.1 | structureless window | OPEN — Slice 10, authorized but not started |
| 7.2 | stale subject identity | **REPAIRED, locally certified** — deployed verification owed |
| 7.3 | held rows presented as live | **REPAIRED, locally certified** — deployed verification owed |
| 7.4 | reserved cells look broken | **REPAIRED, locally certified** — deployed verification owed |
| 7.5 | BP/Financials height | **REPAIRED, locally certified** — deployed verification owed |
| 7.6 | server latency | OUT OF SCOPE |
| 7.7 | stale docblock / admission premise | OPEN — low |

### Remaining blockers

1. **S5 host capacity** — the only thing standing between this candidate and promotion. Two peer lanes
   are saturating a budget of 9 with 34 units. Nothing in this lane can clear it, and the Host Steward
   recovery path (`--recover-capacity`) is an operator decision, not a worker's.
2. Typecheck and build on the reconciled tree, then promotion, then the four deployed gates.

### `READY_FOR_STRUCTURAL_COMMIT_SLICE`: **NO**

Slice 10 is authorized in principle — `visible_construction_ms = 0` is renegotiated to
`unstable_or_false_construction_ms = 0`, and the pre-commit shell is approved. But its stated
prerequisite is that **this candidate is deployed and accepted**, and it is neither. Structural commit
makes more surface visible earlier; doing that while the presentation-truth repairs are still unverified
in production would build on an unproven floor.
