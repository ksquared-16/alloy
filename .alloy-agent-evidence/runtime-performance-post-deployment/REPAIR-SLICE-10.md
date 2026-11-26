# REPAIR SLICE 10 — STRUCTURAL COMMIT / COHERENT FOCUS PANEL REVEAL

**`REPAIR_SLICE_10_STRUCTURAL_COMMIT_COMPLETE_CERTIFIED`** — with one measurement owed and named below.

| | |
|---|---|
| Starting SHA | `74978b342` |
| Repair SHA | `3b54009c1` |
| Certification SHA | this commit |
| Baseline measured on | deployed `96448f5d8` |

Not merged, promoted or deployed.

## FILES CHANGED — 8

| file | why |
|---|---|
| `OperationalSubjectContext.tsx` | `isStructurallyResolved` + `isSemanticallyResolved` alias |
| `InlineOpportunityFocusPanel.tsx` | structure commits on the structural gate |
| `SurfaceHostContext.tsx` | Phase 0 — hands the shell the destination it already knows |
| `AlloyOperationalBootShell.tsx` | Phase 0 — renders the destination truthfully |
| `playwright/geometry/destinationShell.spec.ts` | new — Phase 0 browser gate |
| `playwright/geometry/destinationShellFixture.tsx` | new — mounts the REAL boot shell |
| `playwright/geometry/harness.ts` | one `process` shim so the real graph bundles |
| `tests/runtime/structuralCommitReadiness.test.ts` | new — the split's contract gates |

---

## 1 · THE GATE GRAPH BEFORE EDITING

Traced in source, then measured in a browser.

| milestone | what is known | owner | authoritative | structural | semantic | why withheld |
|---|---|---|---|---|---|---|
| navigation | route → `workUnitSlug` | `surfaceRefFromPath` | **yes** | **yes** | no | **nothing rendered it** |
| desired attention | `target`, `lens` | K1 `focus.desired` | **yes** | **yes** | no | **nothing rendered it** |
| surface host | whether to show the surface | `SurfaceHostContext` | yes | — | — | `showWorkUnit` requires `committed != null` — the whole atomic commit |
| provisioning answer | everything below, at once | `workUnitProvisioningAnswer` | yes | — | — | — |
| `focusPanelSummaryDoc` | **the published composition** | the answer | yes | **yes** | no | reached the panel, but the panel's reveal asked a semantic question |
| `situation` / `action` | business meaning | the answer | yes | no | **yes** | — |
| `isOperationallyResolved` | "has meaning been answered" | `OperationalSubjectContext` | — | — | **yes** | **overloaded — it was also deciding structure** |
| grid / card readiness | cells, content | Focus Panel grid | yes | yes | yes | already correct (below) |

**The finding that matters:** `op = snapshot.terminal === "operational" ? snapshot : null`. `situation` **and** `summaryDocSeed` are both read off `op`, so on the common path they arrive in the **same instant**. The panel-level predicate is therefore *not* what withholds structure during cold entry — the surface host is. That is measured, not inferred, and it narrowed this slice honestly.

---

## 2 · THE TWO GATES

```
isStructurallyResolved(s)  =  s.subjectId != null && s.summaryDocSeed != null
isSemanticallyResolved(s)  =  isOperationallyResolved(s)          // alias, unchanged
```

**Structural** answers *"do we know enough authoritative destination information to present the real surface structure?"* — a subject and the published composition. It reads no action, no situation, no stage work, because none of those decide what cells the surface has.

**Semantic** is the existing predicate, untouched and pinned in both directions by test. It is aliased rather than renamed: the original name is referenced by deployed certification and by the D4 contract, and renaming canonical vocabulary is not this slice's authority.

### The branch this actually opens

`isOperationallyResolved` answers **false** for a family-grain subject with a situation, no configured action and no `actionAbsence` — an ordinary state. In that window the published composition is already in hand and the panel rendered its cold "Thinking…" owner anyway. Structure was withheld by predicate, not by geometry.

On the common child-grain path both predicates flip together. **This is a contract correction, not a claimed speed-up there** — and saying otherwise would be the kind of unmeasured claim this programme has been burned by.

---

## 3 · PHASE 0 — THE DESTINATION SHELL

### Measured baseline (deployed `96448f5d8`, cold entry, 120 ms sampling)

| ms | state |
|---|---|
| 813 | first non-blank — the word "Thinking", **37-character document** |
| 813 → 12,862 | **the same thing**: 0 grid areas, 0 cards, 0 queue rows, 0 Work View pills |
| 12,991 | destination shell, pills, queue rows, provisioned surface, published structure, first configured cell **and first critical meaning — all in one frame** |
| 39,921 | final settlement |

**12.0 seconds in which the operator is told only that something is happening.**

### What is truthfully available there

The route names the work unit; the gesture names the Work View. Both authoritative from the first frame, neither requiring a fetch. The shell now names them. The single "Thinking…" owner is **retained** — the surface really is still preparing, and Phase 0 adds evidence rather than claiming readiness.

**No cards are fabricated.** The audit established the real composition does not exist in this window; a skeleton grid here would be exactly the false construction the replacement invariant bans. Asserted as a gate, not merely intended.

**Time-to-destination-shell: 813 ms** (the first frame that renders at all), against **12,991 ms** before — a change in what that 12-second window *says*, not in when the surface commits.

---

## 4–6 · PHASE 1, COHERENCE, LATE MOUNTING — WHAT THE MEASUREMENT OVERTURNED

Two of the three things this slice was sent to fix were **already correct**, and measurement is what established that.

### Critical-card coherence window = **0 ms**

| card | structure present | first meaningful |
|---|---|---|
| `business_process` | 12,991 | **12,991** |
| `financials` | 12,991 | **12,991** |
| `attendance` | 12,991 | **12,991** |
| `health_safety` | 12,991 | **12,991** |
| `children` (Track A) | 12,991 *(reserved)* | 21,012 |
| `household` (Track A) | 12,991 *(reserved)* | 21,012 |

The four Mission/critical cards become meaningful in the **same frame**. There is no card-by-card semantic waterfall to normalise. The only later arrivals are the two Track-A cards, which accepted doctrine permits to remain resolving until authoritative family truth lands.

### No late structural mounting — and the near-miss that proves the method

A naive cell census reports `children` and `household` "appearing" at 21,012 ms, 8 s after the others. **That is a measurement artifact, and I nearly reported it as the headline defect.** Checking the reserved-cell attributes instead of trusting the card census showed:

```
13,243 ms   cells: [business_process, financials, attendance, health_safety]
            reserved: 2   resolving: ["children", "household"]
21,012 ms   cells: [business_process, financials, children, attendance, household, health_safety]
            reserved: 0   resolving: []
```

The composition is **complete at the structure commit** — four painted cards plus two reserved cells holding their geometry with "Resolving children…" / "Resolving household…". A reserved cell carries no `data-universal-card-key`, which is the whole of the illusion. P0-7.4, deployed in Slice 9, is what already makes the no-late-mount contract true.

**Proposed coherence acceptance threshold**, from this evidence rather than invented ahead of it:

> **CARD_COHERENCE_WINDOW ≤ 250 ms** for critical/Mission-tier cards, measured as latest-minus-earliest FIRST_MEANINGFUL. Deployed today: **0 ms**. 250 ms is one settle frame plus generous slack — tight enough that any reintroduced waterfall fails, loose enough not to flake on a loaded runner. Track-A cards are explicitly outside the window while they remain resolving.

**For master-thread approval** — not adopted unilaterally.

---

## 7 · GEOMETRY

Inherited from deployed Presentation Truth and re-certified here: the painted-surface suite is green (BP and Financials painted cards both consume the solved band), and the 9D propagation rule is pinned by the planted-defect result below. Reserved cells occupy final geometry from the structure commit, which is why `resolving → meaningful` is a content change inside a stable cell rather than a re-equalisation.

---

## 8–10 · PRESENTATION TRUTH INVARIANTS

7.2, 7.3, 7.4 and 7.5 all green, and 7.2 is independently bound by planted defect D. Nothing in this slice touches subject identity, held-row presentation, reserved-cell presentation or the solved band.

---

## 11 · NETWORK

**New network requests: 0.** The change is CSS-free presentation policy — two predicates and a shell that reads facts already in hand. Phase 0 performs no fetch (asserted as a gate).

Existing cold-entry traffic, measured: **40 requests**, dominated by `/api/admin/work-units/waitlist/provisioning-answer`, `/api/admin/queue-view-totals`, `/api/admin/view-models/drawer/opportunity/…`, `/api/admin/lifecycle-catalog`, `/api/admin/departments`. Per-request durations were not recoverable from this run — `request.timing()` returned epoch-relative values through the harness — so the **request inventory is evidence and the timings are not**. P0-7.6 owns them next.

---

## 12–13 · CERTIFICATION

### Browser gate — `playwright/geometry/destinationShell.spec.ts` (6/6)

Mounts the **real** `AlloyOperationalBootShell` with the real stylesheet. Certifies that a cold entry names its destination, that the Thinking owner is retained, that **no card structure is fabricated**, that **no business fact is invented** (asserted by refusing any digit in the visible text), that the Work View id is carried but never printed as operator vocabulary, and that with nothing known the shell is byte-for-byte its old self.

### Planted defects — each binds to its own gate and only its own

| plant | result |
|---|---|
| **A** — restore the all-or-nothing structural gate | structural gate **fails 1/14**: *the body renders when structure is resolved, not only when meaning is* |
| **B** — remove the reserved-cell presentation so a truthless cell cannot hold its place | no-late-mount gate **fails 1/14** |
| **C** — remove the 9D height propagation | painted-surface gate **fails 7/10**, while `destinationShell` stays **6/6 green** |
| **D** — restore the 7.2 commit-clocked avatar guard | Presentation Truth **fails 2/26** independently, while `structuralCommitReadiness` stays green |

### Gates

| gate | result |
|---|---|
| focused regression | **321 / 322 across 25 files** |
| geometry browser suite | **47 / 47** |
| `vac run typecheck` | **rc=0** |
| `vac run typecheck:tests` | **rc=0** |
| `vac run build` | **rc=0** |
| request impact | **ZERO** |

The single red is the standing **`EXTERNAL_FINANCIALS_TEST_DEBT`** (`reservedGeometryConvergence.test.tsx:322` vs the renamed `reservesFootprint`) — pre-existing, untouched, owned by the Financials programme.

### What is OWED

**The repaired build's own deployed phase timeline.** The baseline above is the *current* deployed build, which does not contain this slice. Phase 0's effect on a real cold entry cannot be measured until this candidate deploys, and this slice must not merge. The harness is written and parameterised (`TL_LABEL`), so it is one run on the promotion slice.

---

## 14 · VISUAL SPECIMENS

`slice10-data/shots/baseline-{A,B,C,D}-*.png` — the **baseline** story: the bare Thinking window, the all-at-once commit, first meaning, final settlement. The equivalent four for the repaired build are owed with the deployed timeline.

---

## 15 · DOCTRINE

### `visible_construction_ms = 0` — retirement evidence

Deployed measurement shows the metric, read absolutely, forbids the fix: any destination shell is "a scaffold visible in the visible surface". The operator's own stated expectation — *destination acknowledged → structure commits → meaning arrives together* — is unreachable while an absolute zero stands.

### Replacement

> **`unstable_or_false_construction_ms = 0`** — cumulative time the operator can see construction that is **false or unstable**.

**FALSE / UNSTABLE construction (measurable):** stale subject identity under a new selection · held rows presented as live destination rows · fabricated business values · blank or broken reserved cells · late structural card insertion · major geometry jump or re-equalisation on `resolving → meaningful` · wrong configured structure · a destination shell naming the prior surface.

**ACCEPTABLE construction:** an authoritative destination shell · the real published composition · intentional resolving cells · stable geometry · progressively richer authoritative content.

### Canonical amendment required — **YES**

The canonical source is **outside this slice's write authority** and has **not** been edited:

| file | line | current | required |
|---|---|---|---|
| `docs/platform/runtime/runtime-implementation-authorization.md` | **257** | `| \`visible_construction_ms\` | cumulative time the operator can see a skeleton/placeholder/scaffold **in the visible surface** |` | rename to `unstable_or_false_construction_ms`, redefine as *cumulative time the operator can see construction that is false or unstable* |
| `docs/platform/runtime/runtime-implementation-authorization.md` | **445** | `| \`visible_construction_ms\` | **= 0** (absolute) |` | `| \`unstable_or_false_construction_ms\` | **= 0** (absolute) |` |

Also referenced (evidence only, no authority needed): `web/tests/runtime/d4SettlementReservedGeometry.test.ts:5`, `web/playwright/tests/runtime-certification.spec.ts`, `web/playwright/tests/tools/runtimeStatRunner.spec.ts` — these instrument the metric and should follow the canonical rename, not lead it.

---

## UPDATED P0-7 LEDGER

| | state |
|---|---|
| **7.1** Structural Commit | **REPAIRED + CERTIFIED locally** — deployed phase timeline owed |
| **7.2 / 7.3 / 7.4 / 7.5** | CLOSED — deployed verified, re-confirmed green here |
| **7.6** actual server latency | OPEN — next programme |
| **7.7** stale premise / doc cleanup | OPEN, low |

## REMAINING BLOCKERS

1. Deployed phase timeline for this candidate (owed; needs the promotion slice).
2. Canonical doctrine amendment above (master-thread authority).
3. Coherence threshold **≤ 250 ms** awaiting approval.
4. `EXTERNAL_FINANCIALS_TEST_DEBT` — other programme.

## `READY_FOR_STRUCTURAL_COMMIT_PROMOTION = YES`

Four gates green, request impact zero, four planted defects each binding to their own gate, and both Presentation Truth and the closed-P0 set unregressed.

## P0-7.6 — ACTUAL LATENCY HANDOFF

The honest headline for the next programme: **this slice changed what the operator is told during the wait; it did not shorten the wait.** Structure still cannot commit before the provisioning answer, because the published composition is *on* that answer.

Hand off, measured here:

* **12.0 s** cold entry before anything of the surface exists; **39.9 s** to final settlement.
* **40 requests** on cold entry; `/api/admin/work-units/waitlist/provisioning-answer` is the blocking one — everything structural waits on it.
* The reserved-cell mechanism already holds the last **8.0 s** (Track-A children/household) coherently, so that band is presentation-complete and purely a latency problem.
* Per-request timings need a harness fix (`request.timing()` epoch handling) before they are quotable.
