# P0-7.6 — progressive authoritative first paint: the contract audit, and what actually gates the FRAME

Run: erun_04e1af7fb60c078a · Lane: lane_73a897409906
Measured on deployed `d2905daf3`, 26 cold samples, pinned six-card specimen.

## The premise holds

Everything the architecture needs already exists:

- `FirstOrderField` already distinguishes `known` / `known_empty` / `unknown` / `unavailable` /
  `forbidden`, and `unknown` is already documented as *"Not yet resolved, and Stage 2 may fill it.
  The ONLY state Stage 2 is permitted to replace."*
- `compileFirstOrderPlan(configuration)` is a **pure function of published configuration with no
  I/O**, and `configuration_ms` measures **1 ms**.
- The grid already renders per-cell pending states, and Stage-2 monotonicity is already pinned.

So configuration-derived geometry is essentially free, and honest UNKNOWN cells are already
representable.

## Part 1 — the 39, classified

Criterion applied is the dispatch's: a field is `MUST_BE_KNOWN_FOR_FRAME` only if showing the
surface without its resolved value would misstate eligibility, permit an invalid action,
misrepresent stage/state or money, or otherwise cause the operator to act on false information.

A cell that renders an honest UNKNOWN misstates nothing. On that criterion:

| family | count | classification |
|---|---|---|
| `process.*` (name, stage_count, current_stage_key, current_stage_label, stage_position, stage_entered_at) | 6 | MAY_BEGIN_UNKNOWN |
| `financials.*` (balance, past_due, responsibility, prepaid available/pending/held, billing_period_key) | 7 | MAY_BEGIN_UNKNOWN — **never $0** |
| `household.*` / `person.*` / `record.location_label` | 5 | MAY_BEGIN_UNKNOWN |
| `children.count`, `children.enrolling_count` | 2 | MAY_BEGIN_UNKNOWN — **never "0 children"** |
| `attendance.*` (state, date, expected_room_label, unavailable_reason) | 4 | MAY_BEGIN_UNKNOWN — **never "No record"** |
| `health.*` (profile_fact_count, requirements_satisfied/total, emergency_contact_count) | 4 | MAY_BEGIN_UNKNOWN |
| KPI slots | 3 | MAY_BEGIN_UNKNOWN |
| Work View totals | 7 | MAY_BEGIN_UNKNOWN |

**MUST_BE_KNOWN_FOR_FRAME = 0 of 39. MAY_BEGIN_UNKNOWN = 39 of 39.**

Action safety (Part 3) is handled per-action rather than per-surface: an action whose eligibility
derives from an unresolved fact stays disabled until that fact leaves UNKNOWN. No action requires
the whole surface to wait.

**So the dispatch's architecture is correct about the facts.** None of the 39 needs to gate the
frame.

## But the FRAME is not gated by the 39

Part 4 requires **final geometry at the frame** — card membership, order, tier/span/density — with
no insertion, removal or relocation from late resolution.

The published composition is selected like this:

```ts
// workUnitProvisioningAnswer.ts:2521
const summaryRecord = resolvePublishedFocusPanelSummaryRecord(summaryLayoutRows, {
    workViewId: contextFrame.workViewId,
    stageKey: stage.key,          // ← the SUBJECT'S stage
});
```

and the stage comes from the cohort:

```
cohort rows → chosen record of attention (:1803) → stageKey (:1725) → published composition → geometry
```

**Geometry depends on the subject's stage. The subject's stage depends on the cohort.**

`cohort_rows_done_ms` = **682 ms P50** (starts at 147, ends at 682).

So the frame cannot precede cohort resolution — not because a card fact is slow, but because
**which cards exist** is a function of the subject the cohort selects.

## The measured frame floor

Fixed, non-server terms (measured, n=26): requestStart 160 + TTFB 34 + responseEnd→domInteractive
8 + React render 286 = **488 ms**.

| term | P50 |
|---|---|
| fixed client/request | 488 |
| `route_identity_ms` | 160 |
| `cohort_rows_done_ms` (geometry prerequisite) | 682 |
| server RSC render (best case, geometry-only) | ~100–350 |
| **FIRST_AUTHORITATIVE_FRAME floor** | **≈ 1,430 – 1,680 ms** |

**Over the 1,000 ms target and over the 800 ms prototype gate — with all 39 facts allowed to remain
honestly UNKNOWN.**

This is Part 19's second return condition, with one correction: the blocking set is **not** among
the 39 configured facts. It is the frame's own prerequisites — **subject identity, subject grain,
and subject stage** — because geometry is stage-selected.

## The exact required set

To reach `FIRST_AUTHORITATIVE_FRAME < 1,000 ms`, one of these must change:

1. **`cohort_rows` from 682 ms to ≈200 ms** — the subject must be identified faster. This is the
   frame's binding owner and it is no longer `document_children`.
2. **Geometry stops depending on the subject's stage** — i.e. the published composition is selected
   by `workViewId` alone, with stage-specific variation applied as a later non-geometric change.
   That is a configuration-contract change and would need a product decision, because today a
   stage genuinely can publish a different card set.
3. **The fixed 488 ms falls** — 286 ms of it is client React render and 160 ms precedes the request.

Progressive rendering is still worth building: it would take
`ALL_FIRST_ORDER_FACTS_RESOLVED` off the critical path and let the operator act ~1.2 s sooner than
today's 2,910 ms. **But on its own it does not reach <1,000 ms**, and saying otherwise would be
claiming a number the geometry contract forbids.
