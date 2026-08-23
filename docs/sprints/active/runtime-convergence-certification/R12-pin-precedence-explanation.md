# R12 — Pin Precedence Explanation

**Status: DECISION REQUIRED.** The unexplained precedence case reproduces, live, on a production
build from staging `7184efedf`. But its root cause is **not** the one R12 assumes, and the two fixes
that would actually close it are both outside R12's stated boundaries. No code change is proposed here
beyond evidence.

No ordering, precedence, membership, `wait_since`, cohort, stage or R10 behaviour was modified.

---

## 1. The pin contract

| Layer | Canonical owner | Input | Output | Shadow-gated? |
|---|---|---|---|---|
| Operator intent | `components/presentation/workUnit/WaitlistPlacementAdjustControl.tsx` | `pin_ordinal`, reason | `POST /api/admin/placement-candidates/[id]/manual-position` | no |
| Persisted pin | `lib/orchestration/placement/placementOverrideMutations.ts` | request | placement override row (`override_kind: "pin"`) | no |
| Pin → priority | `lib/orchestration/placement/applyPlacementCandidateOverrides.ts` | policy tuple + active overrides | `sort_tuple` with the pin **spliced at `bucketIdx`** | no |
| Policy tuple | `lib/orchestration/placement/evaluatePlacementPriority.ts` | facts + profile | `[primary_group?, bucket_priority, …tie_breakers]` | no |
| **Row order** | `lib/orchestration/placement/sortPlacementCandidateQueueRows.ts` | rows | **section → cohort → `sort_tuple` → id** | **`sort_tuple` step only** |
| Position label | `lib/orchestration/placement/waitlistCandidateRuntimePosition.ts` | ordered rows | `runtime_position*` per **section** | note is **shadow-only** |
| Explanation | same file — `runtime_position_precedence_note` | higher rows' pin state | one fixed string | **yes** |
| Presentation | `lib/ui-v2/queuePlacementWaitlistCandidatePresentation.ts` | projection | `runtimePositionPrecedenceNote`, `hasManualPositionAdjustment` | passes through |
| Work View attach | `lib/runtime/provisioning/attachChildGrainWaitlistPlacement.ts` | child rows | copies labels onto child rows | — |

**Pin scope:** the pin is an **ordinal within the candidate's own cohort**, spliced into the sort tuple
— a *priority component*, not a hard position. **Displayed position is section-scoped.** A program
category section (e.g. `infant`) can contain several cohorts (`infant`, `infant_0_18_months`).

**Every rule that outranks a valid pin** (from `sortPlacementCandidateQueueRows`): (1) program
category section index; (2) normalized cohort key; and, when `primary_group_fact_key` is set, (3)
`sort_tuple[0]` — because the pin splices at index 1. All three are deterministic. None emits a reason.

## 2. Reproduction — live, production build, shadow OFF

Canonical runtime output for the waitlist Work View (17 rows, one per child):

| Scenario | Pin valid? | Order effect | Canonical stronger rule | Explanation shown? | Operator impact |
|---|---|---|---|---|---|
| Wrigley Kurzman — pinned ordinal 1, cohort `infant_0_18_months` | **yes**, active | position **2/12**, displayed **5th** | **cohort key**: `infant` sorts before `infant_0_18_months` within the `infant` section | **none** | reads as a failed pin |
| PassA Kid — cohort `infant`, **not** pinned | n/a | position **1/12**, displayed 4th | — | none | outranks the pin |
| 15 other candidates | no pin | positions assigned | — | none | — |

Measured facts: `shadow_mode = false`, `runtime_position_mode = "live"`, `active_override_kinds`
carries `["pin"]` (so the earlier `projectionCarriesOverrides: false` cause is now fixed), and
**`runtime_position_precedence_note` is absent on all 17 rows**.

**The pin is working exactly as designed.** Wrigley is first *within its own cohort*. The operator sees
`2/12` because the label is section-scoped while the pin is cohort-scoped.

### Answers to the Phase 2 questions

- **Does the unexplained case still reproduce?** Yes.
- **Only with shadow mode off?** No — it reproduces *because* shadow is off, and **ungating shadow
  would not fix it** (proved below).
- **Is the pin persisted correctly?** Yes — active, carried into the projection, and honoured within
  its cohort.
- **Which exact canonical rule wins?** The normalized **cohort key** ordering within the program
  category section (`sortPlacementCandidateQueueRows` step 2), which is compared *before* the
  `sort_tuple` that carries the pin.
- **Does the engine already emit a truthful reason?** **No.** The sorter computes `byCohort !== 0` and
  returns; it emits no reason code. `PlacementReason` exists in the evaluator but nothing is produced
  at the sort stage.
- **Presentation gating, projection loss, or missing canonical reason?** **Missing canonical reason.**
- **Can the operator mistake this for a failed pin?** Yes — that is the reported symptom.
- **Does any case require a product decision?** Yes. See §5.

## 3. The existing note cannot explain this case

`tests/orchestration/placement/r12PrecedenceNoteReach.test.ts` drives the real
`assignWaitlistCandidateRuntimePositions` on the measured shape:

1. **Live (shadow off):** no note is produced at all.
2. **Shadow on:** the note **still** does not reach the pinned row — its condition is
   `rowHasManualPinOverride(higherRow)`, and the winner (PassA Kid) has **no pin**.
3. The note only ever fires when a **higher** row is pinned. It explains *"you were beaten by
   someone's pin"* — the opposite direction from *"your pin was beaten by a stronger rule."*

**Therefore R12's premise — "the precedence note is currently gated by shadow mode" — is not the root
cause.** Ungating it changes nothing here. No explanation for a *defeated pin* exists anywhere.

## 4. A second, larger finding — canonical order is discarded on this surface

`attachChildGrainWaitlistPlacement.ts:319-346`:

```ts
expandedRows = sortPlacementCandidateQueueRows(expandedRows, shadowMode, …);  // canonical order
assignWaitlistCandidateRuntimePositions(expandedRows, shadowMode, …);         // positions assigned
for (const child of rows) { … child.placementWaitlistRow = { ...proj }; }     // labels copied over
return rows;                                                                   // ORIGINAL order
```

The sorted array is used only to compute labels and is then dropped; `rows` is returned in its
original order. Measured consequence: within the `infant` section the position labels run
**`3, 5, 10, 1, 2, 8, 12, 6, 11, 4, 9, 7`** down the screen (verified by element geometry, not
document order). Position `1/12` renders 4th.

So on this surface a pin cannot move a row **at all** — not because a stronger rule outranks it, but
because placement order is never applied. This is the open half of **law 36**, already recorded in
`CONVERGENCE-MATRIX.md` as a deliberate deferred placement-behaviour change.

## 5. Why this needs a Director decision

1. **No canonical reason exists.** Phase 3 says to stop rather than invent one when the engine does
   not distinguish the stronger-rule reason safely. The sorter emits none.
2. **The winning row is the R10 contested candidate.** `CONVERGENCE-MATRIX.md` records PassA as
   contested on three independent facts with a Director decision outstanding, and R12 forbids
   reopening it. Any explanation of *why* PassA outranks Wrigley describes a candidate whose identity
   and cohort are unresolved.
3. **An explanation would describe a number that does not govern what the operator sees.** Because
   §4's discard means display order is unrelated to position, explaining the *position* would not
   answer the operator's actual question ("why is my pinned row not at the top?"). Fixing that
   requires applying canonical order — explicitly outside R12 ("preserve canonical ordering
   unchanged", "do not change precedence").

### Options

| Option | Scope | Effect |
|---|---|---|
| **A** — Emit a typed cohort-scope reason (e.g. `pin_scoped_to_cohort`) from `assignWaitlistCandidateRuntimePositions`, mapped to concise copy at the presentation owner | inside R12 if a new reason category is authorized | Truthful and operator-safe; names no other row; leaks nothing. Explains the label, **not** the display order — §4 still stands. |
| **B** — Close law 36 first: return the sorted rows from `attachChildGrainWaitlistPlacement` so placement order actually applies | **outside R12** (placement behaviour change) | Makes the pin move the row; then most of R12's explanation need disappears. |
| **C** — Do both, B first | outside R12 | Complete fix. |
| **D** — Accept and defer | — | Symptom persists. |

Recommended: **B, then reassess whether A is still needed.** Explaining a precedence that the surface
does not apply risks telling the operator a true sentence that does not describe their screen.

## 6. What was NOT done, and why

- **No fix implemented.** Phase 3's stop condition applies.
- **No shadow-only diagnostics exposed.**
- **No pin created, changed or removed.** The standing constraint forbids mutating shared certification
  data; a real active pin already reproduced the case, so mutation would have added nothing. The
  Phase 2 rows requiring new pin intents (unpin, rapid double-pin, invalid/expired pin, scope switch)
  are therefore **not covered** and are listed as residual risk.
- **R10 left fail-closed and untouched.**

## 7. Evidence

`tests/orchestration/placement/r12PrecedenceNoteReach.test.ts` (3/3) · `web/scripts/r12Dom.mjs`,
`r12VisualOrder.mjs` (geometry-true order), `r12PinState.mjs` (canonical override/position state). All read-only against a local production build; none mutate certification data.
