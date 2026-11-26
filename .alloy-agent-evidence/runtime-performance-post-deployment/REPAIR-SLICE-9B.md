# REPAIR SLICE 9B — PRESENTATION TRUTH DEPLOYED CORRECTIONS

Starting SHA `c6c335732` · repair `08adbd637` · certification this document
Deployed lineage under repair: `51bb7730` · **Not merged, promoted or deployed.**

## FINAL STATUS: `REPAIR_SLICE_9B_COMPLETE_CERTIFIED`

Both deployed-proven failures repaired. Two product files, two test files.

| File | Track |
|---|---|
| `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` | A — guard on the click clock |
| `app/adminV2/components/alloyOsRuntime.css` | B — stretch rule ordered to win |
| `tests/runtime/presentationTruthTransitions.test.ts` | A — asserts the clock |
| `tests/surfaces/focusPanelBandFillRuntimePath.test.ts` | B — asserts the cascade winner |

---

## A — P0-7.2 AVATAR IDENTITY

### A1. Identity clock map (verified against source, not assumed)

| Value | Owner | Clock | Moves on click? |
|---|---|---|---|
| clicked row subject id | `openRecord` → `attention.move({scope: SUBJECT, subject: row.entityId})` | **CLICK** | **yes, synchronously** |
| `useAttentionSubject()` | `kernel.attention.get()?.subject` | **CLICK** | **yes** |
| seed (`opportunityQueuePreviewSeed`) | keyed on live attention | **CLICK** | yes — **but carries no subject id** |
| `operationalSubjectId` | `OperationalSubjectContext` ← `committed.snapshot` | **COMMIT** | no — at provisioning commit |
| `subjectScope` | body ← `model.context.participantScope` | **HELD PAYLOAD** | no — prior subject during a hold |
| avatar image priority | seed image → scope image **if eligible** → none | — | — |

**The seed carries no subject id** (`title`, `subtitle`, `statusLabel`, `familyOpportunityId`,
`subjectImageUrl`, `statusKey`, `stageLabel`, `locationLabel`, `valueLabel`). So the click-clocked
identity available for the comparison is **live attention** — the same value the row click writes, and
the same id space a child-grain scope's `participationId` occupies. This was checked before editing
rather than substituting a variable name by shape.

### A2. The incorrect guard, and the repair

```ts
// before — COMMIT-clocked, so in the window it protects it answered about the OLD subject
&& operationalSubjectId != null
&& (subjectScope.participationId === operationalSubjectId
    || subjectScope.customerMemberId === operationalSubjectId);

// after — CLICK-clocked
const clickClockSubjectId = useAttentionSubject();
&& clickClockSubjectId != null
&& (subjectScope.participationId === clickClockSubjectId
    || subjectScope.customerMemberId === clickClockSubjectId);
```

The image priority itself is unchanged: `seedImage ?? (eligible ? scope.imageUrl : null)`. Only the
eligibility clock moved.

### Image known / unknown behaviour

| Case | Result |
|---|---|
| B's row renders an image | seed carries it → **B's image immediately, on the click** |
| B's row has no image | seed null, scope not eligible → **honest fallback (initials)** |
| held payload still A's | scope is A's, attention is B → **not eligible → A's face never shown as B** |
| settlement B arrives | body writes B's scope, attention is B → eligible → B's image |
| rapid A → B → C | attention is C; A's and B's scopes both ineligible |
| latest subject wins | attention is the last click by construction |

**Unknown is preferred to false identity**, which is the whole contract: an empty avatar is a gap, the
previous child's photo under this child's name is a false statement.

**Family grain is unaffected and this was verified, not assumed:** the settled route resolves no
participation for an opportunity id and the candidate scan finds no match either, so `subjectScope` is
null on that path and the guard never decides anything.

### A3. Planted defect

Restoring the `operationalSubjectId` guard — the exact deployed defect — fails **2 of 26**, including
`THE GATE: the guard compares against the CLICK clock, never the commit clock`.

---

## B — P0-7.5 BAND HEIGHT

### B1. Cascade proof (recorded before mutation)

| | selector | specificity | source line | computed |
|---|---|---|---|---|
| intended | `.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell` → `stretch` | (0,2,0) | **5262** | — |
| competing | `.alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell` → `flex-start` | (0,2,0) | **5282** | **winner** |

Both matched the element — the browser confirmed it on the deployed build. **Equal specificity, so
source order alone decided, and the intended rule sat ~20 lines earlier.** The repair existed, was
correctly scoped, matched, and lost.

### B2. The repair

The stretch block is **moved below** the composed rule (now composed 5262, stretch 5295), with a note
stating that order is the fix and it must not move back. Nothing else changed:

* the composed/lane rule is **untouched** — natural height remains correct outside the solved grid
* no specificity inflation, no `!important`
* no pixel value anywhere: `H` flows solver → wrapper inline height → `min-height: 100%` → `stretch`
* `.alloy-os-fp-card-intrinsic` is rendered **only** by the solved-grid branch, so lanes, stack,
  standalone cards and the design lab are unreachable — asserted, including that `cardLab.css` never
  references it

### B3. Planted defect — and the solver's blindness, for the second slice running

| Plant: restore the deployed cascade order | Result |
|---|---|
| new cascade gate | **2 of 13 FAIL**, incl. `THE GATE: stretch WINS the cascade` |
| `focusPanelRowHeightSolver` | **20/20 PASS** |

Recorded explicitly, as instructed: the solver test is green under the exact ordering that left the
product broken.

---

## WHY THE PREVIOUS TESTS MISSED BOTH — AND WHAT CHANGED

Both suites asserted that a **mechanism existed**; neither could see whether it **took effect**.

* **Height** — asserted the declaration was present in the stylesheet. It was present, matched, and
  lost. The suite now **resolves which declaration wins**, and pins the equal specificity so a future
  reader cannot "fix" this by reordering back and trusting specificity to save them.
* **Identity** — asserted the fallback expression. The expression was right; the value inside it was on
  the wrong clock. The suite now asserts the **source of the compared value** — that the guard reads
  the click clock, that `operationalSubjectId` appears nowhere inside it, and that commit-clocked
  identity is still used where it is correct (settlement).

This is the seventh instance of the shape in this programme, and the first time the correction is
written into the gates themselves rather than only into the ledger.

---

## REGRESSION

| Suite | Result |
|---|---|
| **P0-7.3** held Work View truth | **green** — unmodified |
| **P0-7.4** reserved-cell resolving | **green** — unmodified |
| Closed-P0 focused set (P0-1 loader, P0-2 admission + commit meaning, P0-3/P0-4 semantics, participant transport + phase convergence, reserved geometry, settlement reserved geometry, grid layout, mountability, producer parity, root readiness, drawer-attention authorization) | **green** |
| **Total** | **278/278 across 20 files** |

Neither 7.3 nor 7.4 was modified to accommodate these repairs.

## GATES

| Gate | Result |
|---|---|
| Focused tests | **278/278** |
| `vac run typecheck` | **rc=0** |
| `vac run typecheck:tests` | **rc=0** |
| `vac run build` | **rc=0** |
| Request impact | **0** — no new request; one hook read already available in the tree |

### Architecture guards

No new request · no new state machine · no new cache · no new reveal owner · no new subject system ·
no readiness/admission change · **height solver untouched** · **no card component changed** ·
no Structural Commit code · no Track A · no S8-2 · no server-latency work.
`visible_construction_ms`, `SurfaceHostContext` and `isOperationallyResolved` untouched.

---

## PROGRAMME

### P0-7 ledger

| # | Item | Status |
|---|---|---|
| 7.1 | structureless window | OPEN — Slice 10 |
| **7.2** | subject avatar identity | **REPAIRED — locally certified, deployed verification owed** |
| 7.3 | held Work View rows | **CLOSED — deployed-verified** |
| 7.4 | reserved-cell resolving | **CLOSED — deployed-verified** |
| **7.5** | solved-band stretch | **REPAIRED — locally certified, deployed verification owed** |
| 7.6 | server latency | OUT OF SCOPE |
| 7.7 | stale docblock / premise | OPEN — low |

### `READY_FOR_PRESENTATION_TRUTH_FINAL_PROMOTION`: **YES**

One candidate, four gates green, both corrections carrying planted-defect proofs that bind to the
deployed failures they fix.

**The honest caveat:** both of these repairs were locally certified once before and were inert in
production. The gates now assert outcomes rather than mechanisms, which is why I expect a different
result — but *expect* is the right word. Only the deployed measurement settles it.

### `READY_FOR_STRUCTURAL_COMMIT_SLICE`: **NO**

Unchanged, and deliberately so: it remains NO until 7.2 and 7.5 are **deployed and verified**, not
merely repaired. Two locally-green repairs have already failed that test once.
