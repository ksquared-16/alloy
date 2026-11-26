---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling Card Projection — the child index of the canonical projection

**Status:** Proposed — the **child index** of the canonical projection.

> **Reconciled by [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) (final).** This is not a separate model — it is the **by-child view** of the one subject-scoped, assignment-based Scheduling projection (`SchedulingProjection` with `children[]` of length 1). Read the canonical contract first; the fields below are its `ChildScheduling` shape expressed for the Summary/Detail cards.

The child read model behind the Scheduling Summary & Detail cards, placement/change workflows, household context, the Roster child drill-down, BOS explanation, and future export. It is a **derived, non-authoritative projection** over canonical entities + registered calculations — it **duplicates no source of truth**. Companion to [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md); every field's owner is in [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md).

---

## 1. Shape

```
SchedulingCardProjection {
  subject:        { childId, displayName, program, ageGroup, siteId, siteName }
  asOf:           date                       // resolution date (default today)
  mission?:       'place' | 'fix' | 'review' | 'view'   // why opened
  status:         'unscheduled' | 'scheduled' | 'proposed' | 'conflict'
                | 'future-change' | 'ended' | 'needs-review'

  currentPlacement: { roomId, roomName, program, siteId, source, effectiveStart, effectiveEnd? } | null
  currentSchedule:  { patternId, patternLabel, weekdays[], effectiveStart, effectiveEnd? } | null
  futureChanges:    [ { type, effectiveDate, summary } ]        // committed, future-dated

  proposedChange?:  { schedule, placement?, effectiveDate,
                      previewHealth, standing: 'proposed'|'reviewed', stale: bool }

  operationalHealth: {                                          // ALL from registered calcs
    ratioState: 'in-ratio'|'tight'|'over'|'unknown',
    occupancy: { count, capacity },
    requiredStaff, staffingState: 'ok'|'unknown'|'short',
    projectedTuition?: money,
    warnings: Warning[]
  }
  expectedAttendance: { weekdays[], nextExpected?: date }
  commercialPreview:  { projectedTuition: money, basis } | null     // informational only

  siblings: [ { childId, displayName, roomName|null, patternLabel|null, siteName,
                status, relevance: 'shared-site'|'shared-days'|'continuity'|'none',
                dataComplete: bool } ]

  historySummary: [ { effectiveDate, change, source } ]         // effective-dated, read-only

  availableActions: ConfiguredCommand[]                          // resolved from configuration (never hardcoded)

  calculationMeta: {
    computedAt, freshness: 'fresh'|'stale',
    inputVersions: { configVersion, intentVersion, factCursor },
    completeness: 'complete'|'partial',
    partialReasons: string[]                                     // e.g. "staffing not connected"
  }
}
```

---

## 2. Semantics

- **Identity.** Keyed by `childId` (durable child / `customer_member`). The projection is **child-scoped**; a household is never a subject. Siblings resolve via `person_child_relationships` but each sibling is its own projection.
- **Effective-date resolution.** `asOf` (default today) selects the *current* committed placement/schedule; **`futureChanges`** lists committed rows with a later effective date; **`historySummary`** lists superseded rows. Nothing is overwritten — the projection reads the effective-dated ledger.
- **Current vs future.** Distinct fields (`currentSchedule` vs `futureChanges`) so "Sunshine now, moves to Rainbow Aug 4" is unambiguous.
- **Proposed vs committed.** `proposedChange` is a **separate** object, never merged into `currentSchedule`. It carries `standing` and `stale`; the card renders it beside current (spec §6). It is write-free until a commit.
- **Sibling resolution.** `siblings` is computed from relationships + each sibling's own projection (summary depth only). `relevance` drives whether a sibling surfaces on the Summary (spec §5); `dataComplete=false` yields "schedule unavailable," never a fabricated value.
- **Freshness.** `calculationMeta.freshness` compares `inputVersions` at compute time to current; `stale` triggers the "review again" behavior before any commit. `completeness=partial` with reasons drives the degraded display (e.g. staffing unknown).
- **Provenance.** Every non-subject field traces to a canonical owner + calculation in [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md); the projection carries no independently-authored value.
- **Error / partial states.** Missing config (`resolveConfigRule` incomplete) → the dependent field is `unknown` with a reason, not omitted silently and never faked. A calculation error degrades that field only, not the whole card.
- **Caching / invalidation.** Compute-on-read by default; an optional **non-authoritative, recomputable** cache invalidated on: a relevant commit (intent change), a config publish (`configVersion`), or a relevant fact event. Never edited in place; always reproducible.
- **Authorization.** Child-scoped read permission gates the projection; **sensitive fields are gated per-field** (the card shows operational fields only; contact/allergy/safety data is never in this projection — see the roster print projection for permissioned extras). Commands in `availableActions` are already eligibility- and permission-filtered.

---

## 3. Which calculations appear where (spec §8/§10)

Surface only what helps the operator understand or act — not every available calculation. Placement by layer:

| Calculation ([map](./scheduling-calculation-map.md)) | Summary | Detail | Create/Change flow | Role |
|------------------------------------------------------|:------:|:-----:|:-----:|------|
| Ratio state / tier (#3) | ● (word) | ● | ● | blocks/warns |
| Expected occupancy (#1) | ● (e.g. 9 of 11) | ● | ● | informs |
| Room capacity / availableNow (#2) | — | ● | ● | blocks |
| Required staffing (#4) | ● ("no additional staff") | ● | ● | informs |
| Available staffing (#5) | ○ (if short/unknown) | ● | ● | warns/blocks option |
| Placement eligibility (#6) | — | ○ | ● | blocks |
| Schedule compatibility (#7) | — | ○ | ● | blocks/warns |
| Room health (#8) | ● (chip) | ● | ● | ranks/informs |
| Conflict count (#9) | ● (if >0) | ● | ● | ranks |
| Continuity impact (#10) | ○ (recommendation phrase) | ● | ● | ranks |
| Sibling continuity (#10a) | ○ (hint) | ● | ● (ranking input) | ranks |
| Expected attendance (#11) | — | ● | — | informs |
| Commercial / tuition (#12) | ○ | ● | ● | informs (never blocks) |
| Effective-date overlap (#13) | — | — | ● | blocks/warns |
| Future capacity risk (#14) | ○ (future-change) | ● | — | informs |
| Data completeness / freshness (meta) | ○ (degraded) | ● | ● | informs/guards commit |

● primary · ○ conditional · — not shown. **No calculation is displayed merely because it exists**; the create/change flow surfaces the deeper ones (capacity, eligibility, effective-date overlap) that the read cards don't need.

---

## 4. What this projection guarantees

- **One projection, many renders** — Summary, Detail, placement/change previews, sibling context, Roster child drill-down, BOS explanation, future export all read this shape (a superset for export lives in [`roster-projection-contract.md`](./roster-projection-contract.md)).
- **No second source of truth** — composed over `child_placements` / `schedule_assignments` / agreements + calculations; the card shows, it never authors.
- **Child-level, effective-dated authority preserved** — `source`, `effectiveStart/End`, and `historySummary` always trace to the authoritative rows.
- **BOS reads this, doesn't bypass it** — BOS explanations are phrased over these fields + `calculationMeta`; BOS never injects a value the projection didn't derive.

---

## Cross-references

- [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) — how the cards render this.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — per-field owner, command matrix, gap report.
- [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) — the calculations referenced here.
