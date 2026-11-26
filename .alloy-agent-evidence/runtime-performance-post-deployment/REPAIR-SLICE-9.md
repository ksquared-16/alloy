# REPAIR SLICE 9 — PRESENTATION TRUTH / TRANSITION COHERENCE

Starting SHA `f05135aa5` · repair `96871b3e4` · certification this document
**Not merged, promoted or deployed.**

## FINAL STATUS: `REPAIR_SLICE_9_PRESENTATION_TRUTH_COMPLETE_CERTIFIED`

*(with one gate explicitly NOT OBTAINED — see §Gates.)*

## FILES CHANGED

| File | Track |
|---|---|
| `lib/admin/opportunityDrawerQueuePreviewSeed.ts` | A — seed gains `subjectImageUrl` |
| `lib/presentation/runtime/focusPanelSeedFromQueueRow.ts` | A — reads it by the row's own rule |
| `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` | A — header avatar on the click clock |
| `lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel.ts` | A — laundering removed |
| `lib/runtime/kernel/useAttentionCardFocus.ts` | B — `useAttentionLens()` sibling |
| `lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts` | B — held queue marked held |
| `components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | C — resolving presentation |
| `tests/runtime/presentationTruthTransitions.test.ts` | **new** — 23 tests |

**Not touched:** `SurfaceHostContext` boot-shell gate, `isOperationallyResolved`,
`visible_construction_ms`, card readiness/admission, S8-2, server latency.

---

## TRACK A — SUBJECT IDENTITY CLOCK

### Ownership map

| Element | Owner | Clock (before) | Clock (after) |
|---|---|---|---|
| subject title | `InlineOpportunityFocusPanel` ← queue-row seed | **click** | click |
| **avatar** | `subjectScope` state ← body ← `model.context.participantScope` | **held payload** | **click** |
| status chip | held `displayVm.header.status` | held payload | held payload *(unchanged — see Remaining)* |
| location / context chips | `visible.record` | held payload | held payload *(unchanged)* |
| child identity card | overlay ← `subjectIdentityTruth` | commit | commit |

### Exact cause

The title was moved onto the click clock long ago. **The avatar had no click-clocked owner to move
onto** — `focusPanelSeedFromQueueRow` returned `{title, statusLabel, familyOpportunityId}` with no image
field, although the clicked row was *already rendering one*. So the avatar could only follow
`subjectScope`, which the body writes from `model.context.participantScope` — during a hold, the **prior**
subject's VM. Nothing is keyed by subject (the body is deliberately keyed `"focus-panel-body"`), so no
remount reset it. And the child overlay ended its image chain with
`?? settled.context.participantScope?.imageUrl` — actively laundering the previous child's face forward.

**Measured deployed:** row highlights at **121 ms**; panel subject and images change at **5,960 ms**.

### Exact repair

```ts
// seed — the image the SELECTED ROW is already showing, by the row's own rule
const subjectImageUrl = focus
    ? (typeof focus.primary.image_url === "string" ? focus.primary.image_url.trim() : "") || null
    : (typeof context.row_subject?.image_url === "string" ? context.row_subject.image_url.trim() : "") || null;

// panel — identity on the click clock
const identityImageUrl = seedSubjectImageUrl ?? (scopeIsThisSelection ? subjectScope?.imageUrl ?? null : null);
const headerSubjectScope = subjectScope ? { ...subjectScope, imageUrl: identityImageUrl } : null;
```

`scopeIsThisSelection` matches `participationId` **or** `customerMemberId` against
`operationalSubjectId`. The overlay's `?? settled.context.participantScope?.imageUrl` is deleted.

### Frame-by-frame, before → after

| Frame | before | after |
|---|---|---|
| click | row B highlights (121 ms) | row B highlights |
| +200 ms | title B · **avatar A** · status A | title B · **avatar B** (seed) · status A |
| +3 s | title B · **avatar A** | title B · avatar B |
| +5,960 ms | avatar finally becomes B | *(already B)* |

**Destination image known** → shown immediately, from the row the operator clicked.
**Destination image unknown** → **nothing**; the avatar falls back to initials. Never the prior subject's.

---

## TRACK B — HELD WORK VIEW ROWS

### Hold ownership

| Layer | Behaviour |
|---|---|
| `WorkViewPillStrip` | local intent — pill lights immediately, claims nothing about data |
| `focus.ts` | the outgoing snapshot is **RETAINED**; `current` changes only at the atomic commit |
| `SurfaceHostContext` | a lens exchange **deliberately HOLDS** the prior surface |
| `workUnitSurfaceModelFromSnapshot` | `loading: false` — *"this model exists only because a terminal already arrived"* |

### Exact misleading-LIVE cause

`loading: false` is **true of the snapshot and false of the screen** once the operator has asked for a
different lens. With it false, `QueueRegion`'s `holdActive` never engages, the `hold_start` perceived
marker never fires, and `aria-busy` is never set — so the previous lens's rows sat there fully
interactive and indistinguishable from the destination for **~3.3 s measured**.

### Exact repair

A `useAttentionLens()` sibling on the *same* attention subscription as `useAttentionSubject()`, then:

```ts
const queueIsHoldingPriorLens = desiredLens != null && committedLens != null && desiredLens !== committedLens;
// ...
queue: { ...operationalModelFromSnapshot.queue, loading: true }
```

**No new state machine.** The hold treatment already exists and is already rendered; this says only
*when* it applies. When the lenses agree — the ordinary case, and every case before a switch — the model
is returned untouched. The snapshot model still states its own truth; this narrows presentation only.

### Transition presentation

| | before | after |
|---|---|---|
| pill | Waitlist selected instantly | unchanged |
| rows | All rows, presented as **live Waitlist rows** | All rows, explicitly **held/transitioning** (`aria-busy`, hold treatment, `hold_start` marker) |
| on arrival | rows swap | hold clears, rows swap |

The queue is **not blanked** — continuity is preserved, and it is now labelled.

---

## TRACK C — RESERVED CARD PRESENTATION

**Readiness, admission and data reads are untouched.** Household/Children remain settlement-only under
the accepted Track A decision. Only the *presentation* of an already-reserved configured cell changed.

**Before:** a full-size bordered `.alloy-os-ucard` with an 11 px title and nothing else — measured
holding **8.5 s** (10,687 → 19,184 ms) for `household` and `children`. The title says *which* card this
is; it never says anything is coming.

**After:** one quiet line — `Resolving household…`, `Resolving children…` — derived from the card's own
configured title, under `data-focus-panel-cell-resolving`.

**False-data guard:** no values, counts, statuses, stand-in bars, shimmer or skeleton grid. Asserted by
test over the component source. The existing objection to stand-in bars still holds in full — a sentence
is not a guess at the card's shape. Applied to the **settling** reserve only: a `settled`
not-applicable cell is not arriving, and telling the operator it is resolving would be a lie that never
resolves.

---

## TRACK D — HEIGHT: DIAGNOSED, **NOT REPAIRED**

### Deployed diagnostic

| Element | wrapper | inline height | card |
|---|---:|---|---:|
| `business_process` | **325 px** | `325px` | **232 px** |
| `financials` | **325 px** | `325px` | **325 px** |

Other areas: `children` 534, `household` 293, `health_safety` 271, `attendance` 253 — each wrapper
carrying its own solved inline height.

### Root cause: **`STYLE_NOT_APPLIED`**

**The band solver is correct and is running.** Both wrappers are assigned *exactly* 325 px, which is
precisely what `focusPanelRowHeightSolver.test.ts` asserts. The solved height reaches the DOM.

The defect is one step further in: the **Business Process card does not fill its wrapper** (232 px inside
325 px), while Financials does. The 93 px of whitespace the operator sees is *inside* the BP cell.

**Not repaired, deliberately.** The authorization was to repair only "a small bypass/application bug in
the EXISTING solver". The solver is neither bypassed nor broken. The fill contract
(`.alloy-os-fp-card-intrinsic > * { flex: 1 1 auto }`) is generic and works for Financials, so the
divergence is in `ProcessCard`'s own root box — a **design-locked component rendered from fixtures in a
design lab**. Changing its box model is a design-surface change that must be made against the lab
specimen, not blind from a runtime measurement.

**Exact next boundary:** determine why `.alloy-os-process` does not stretch under
`.alloy-os-fp-card-intrinsic` when `.alloy-os-financials`'s root does — comparing the two roots in the
card lab — and fix the one that is wrong there. Isolated, visual, and independently verifiable.

---

## CERTIFICATION

`tests/runtime/presentationTruthTransitions.test.ts` — **23 tests**.

### Planted defects — each fails its own gate, and only its own

| Plant | Result |
|---|---|
| restore `?? settled.context.participantScope?.imageUrl` | **1 fail** — *"THE PLANTED DEFECT'S TARGET: no fallback to the settled scope's image"* |
| flip held rows back to `loading: false` | **1 fail** — *"THE GATE: the queue reports holding while attention has moved to another lens"* |
| strip the resolving line from the reserved cell | **2 fail** — incl. *"THE GATE: a settling reserved cell says what it is resolving"* |

Each plant is the *exact* deployed defect family, restored. All three restored afterwards; suites green.

### Gates

| Gate | Result |
|---|---|
| Presentation-truth suite | **23/23 pass** |
| Focused regression — transport, phase convergence, Slice 4 admission, P0-1, P0-3/P0-4, reserved geometry, **row-height solver**, mountability, producer parity, root readiness, drawer-attention authorization | **244/244 pass**, 18 files |
| `vac run typecheck` | **rc=0** (run after each track) |
| `vac run build` | **NOT OBTAINED** — see below |
| Request count impact | **0** — no new request; one seed field carried on data already in memory |

**The build gate is not claimed.** Three attempts were refused by the S5 broker:
*"validation capacity refused"*, with `vac health` showing **16 unbrokered units against a budget of 9**,
all from a peer lane (`lane_141c9c1f3f2f`, "Access & Identity") running heavy vitest. That is a host
capacity condition owned by another lane, not a property of this candidate, and forcing it would repeat
a known rc=143 termination. **It must be obtained before promotion.**

### Pre-existing red, separated from this work

`tests/adminV2/focusPanel/cardReadinessContract.test.ts` fails **9 of 10**. Confirmed pre-existing by
reverting all seven changed files to `f05135aa5` and re-running — **the same 9 fail at the base**. This
slice touches neither readiness nor admission, and a guard test in the new suite asserts the
commit-critical spec set is unchanged.

### Architecture guards

No new cache, reveal engine or subject system. No `localStorage`. Card readiness and admission
unchanged (asserted). The structural-commit gates are asserted **still present** — they belong to
Slice 10.

---

## PROGRAMME

### Updated P0-7 ledger

| # | Item | Status |
|---|---|---|
| 7.1 | structureless window (~10.6 s) | **OPEN — Slice 10**, deliberately untouched |
| 7.2 | stale subject identity | **REPAIRED** — avatar on the click clock, laundering removed |
| 7.3 | held rows presented as live | **REPAIRED** — existing hold treatment now engaged |
| 7.4 | reserved cells look broken | **REPAIRED** — intentional resolving state, no false data |
| 7.5 | BP/Financials height | **DIAGNOSED** — `STYLE_NOT_APPLIED`; solver correct; next boundary named |
| 7.6 | server latency | OUT OF SCOPE — real debt, separate programme |
| 7.7 | stale docblock / admission premise | OPEN — low, noted in the audit |

### Remaining blockers

1. **`vac run build`** — blocked by another lane's capacity, must be obtained before promotion.
2. **Deployed verification** of all three repairs (identity, held rows, reserved) — none is claimed here.
3. 7.5 fill fix, 7.1 structural commit, 7.7 cleanup.

### `READY_FOR_PRESENTATION_TRUTH_PROMOTION`: **YES, once the build gate is obtained**

Everything else stands: 23/23 with three binding planted defects, 244/244 regression, typecheck clean,
zero new requests, and no touched architecture. The build is the single outstanding gate and its refusal
is a host condition, not a property of the candidate.

### Prerequisites for the Structural Commit slice (Slice 10)

1. **This slice deployed and accepted.** Structural commit makes *more* surface visible earlier; doing it
   while held content still lies about itself would multiply the lie.
2. **`visible_construction_ms = 0` renegotiated explicitly.** It is an absolute documented acceptance
   metric, and structure-before-content is illegal under it. That decision is the operator's, not mine.
3. **The band-height fill fixed (7.5)**, or structure committed early will re-equalise visibly — which is
   the defect the solver exists to prevent.
4. A decision on whether the pre-commit window may show the **shell** (header, pills with known counts,
   explicitly-pending queue) — the audit's `PARTIALLY_VIABLE` finding, which needs no fake grid.
