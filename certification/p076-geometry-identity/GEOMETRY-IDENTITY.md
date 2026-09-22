# P0-7.6 — Geometry identity, and the frame that never uses it

Run `erun_780af37c66374600` · lane `lane_73a897409906` · deployed `1072986a` · n=26 cold samples

## The premise, and why it is false

The dispatch held that the runtime pays `cohort_rows_done_ms` (P50 **658ms**) to answer a much
smaller prerequisite — *which subject is focused, and what is its canonical stage* — and asked for a
minimum canonical geometry identity path with exact selection parity.

**It does not pay it.** The composer already resolves the geometry identity tuple long before the
cohort, and then holds the frame for another two and a half seconds without emitting it.

`markSpan("geometry_identity_ms")` sits at `workUnitProvisioningAnswer.ts:2135`, **strictly
upstream** of the cohort join at `:2183`. So the identity offset is bounded above by the already
published `cohort_rows_at_ms`:

| span | P50 | P75 | P90 |
| --- | ---: | ---: | ---: |
| **geometry identity (bound)** | **147** | **169** | **269** |
| `cohort_rows_done_ms` | 658 | — | 1274 |
| `document_children_ms` | 2584 | — | 3874 |
| `composition_ready` | 2744 | — | 4030 |

23 of 26 samples hold the geometry within 200ms. **Part 6's gate (`GEOMETRY_IDENTITY P50 ≤ 200ms`)
is met with no change to the product.**

The waste is the whole distance to the right of that first row: **P50 2,533ms** between holding the
geometry and publishing anything.

## Why selection parity is structural, not incidental

A minimum path has exact parity with the full path here because the full path *is* the minimum path
— enrichment has no channel through which to reach the answer.

1. **The selector is never handed a field enrichment writes.** `subjectRows` (`:1606`) carries
   exactly `{id, entityId, entityType, sortIndex}`. `OperationalSubjectQueueRow` also admits
   `priorityScore`, `dueAtIso`, `assignedToUserId` and `needsOperationalAttention`, and the composer
   populates **none** of them. Every strategy therefore collapses to queue order:
   `highest_priority` finds no priority signal, `earliest_due` no due signal, `assigned_to_me` no
   assignment, and the platform default `highest_sort_order` walks its fallback chain to
   `pickHighestSortOrder`.

2. **The stage needs no round trip.** It is resolved from `subjectRecord.stage_key` and
   `_effective_participant_stage_keys`, and the latter is attached by
   `attachEffectiveStagesFromMaintainedFacts` — **synchronous**, derived from
   `maintained_operational_facts` columns that arrive *with* the opportunity row. Measured
   `projection_ms` P50 = **1ms**.

So `{subjectId, entityType, processStageKey, workViewId}` is a pure synchronous function of the base
records read plus configuration. Published Focus Panel composition is selected by `workViewId` +
`stage.key` (`resolvePublishedFocusPanelSummaryRecord`, `:2536`), so card membership, order and
presentation are decided at that moment. Every one of the 39 first-order facts may still be UNKNOWN;
none of them selects geometry.

### The oracle

`web/tests/runtime/geometryIdentitySelectionParity.test.ts` — 18 listed cases × 5 strategies. Each
tuple is computed twice: once from the four selector fields, once from rows additionally carrying
every cohort enrichment product (CRM, children, personal-seen, presentation, avatars, titles) with
**adversarial** values — a priority score of 9,999 and a 1999 due date on the *last* row, assignment
to the current user, and contradictory enrichment stage keys. The tuples must agree.

The file also plants the inputs the tuple genuinely *does* depend on — effective participant stages,
lens stage keys, queue order — and asserts the tuple **moves**. A parity test that passes because
neither side reads anything proves nothing; this one fails if the dependency ever goes away.

25 tests pass.

## What emitting at identity time would actually buy

Counterfactual over the same 26 samples, holding network, RSC render and client render constant and
removing only the server-side wait between holding the geometry and publishing it
(`documentMs − (composition_ready − geometry_identity)`):

| metric | P50 | P75 | P90 |
| --- | ---: | ---: | ---: |
| FIRST_PAINT today | 3453 | 4444 | 5083 |
| **FIRST_AUTHORITATIVE_FRAME (counterfactual)** | **862** | 1000 | 1282 |

- Against the programme target `FIRST_AUTHORITATIVE_FRAME P50 < 1,000ms` — **passes** (19/26 samples
  under 1,000ms).
- Against the prototype GO gate `< 800ms` — **does not pass**. Only 6/26 samples land under 800ms
  and the P50 is 862ms.

This is the max()-shaped DAG behaving exactly as the programme has seen it behave: removing the
binder promotes the runner-up. With the 2,533ms composer wait gone, what remains in the 862ms is
`route_identity_ms` (P50 **166**), the RSC render, and the client React render (~286) — none of
which geometry-identity emission touches.

**Recommendation:** emitting the progressive authoritative frame at geometry identity is worth doing
and clears the programme's 1,000ms target, but the 800ms prototype gate cannot be cleared by it
alone. The next owners after it are `route_identity_ms` and the RSC render, in that order.

## Sampling notes

`c07` (documentMs 12,812) and `c26` (6,103) are cold outliers and are retained in every statistic
above rather than trimmed; they are the reason P90 is quoted alongside P50. The counterfactual is a
bound derived from measured spans, **not** a measurement of a built prototype — it holds everything
except the removed wait constant, so it is an upper bound on the benefit only if nothing else
regresses when the emission point moves.
