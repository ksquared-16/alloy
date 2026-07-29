# Operational Intelligence — Expansion scope honesty

**V1 status:** FROZEN — [`docs/platform/milestones/Operational-Intelligence-Platform-V1-Certified.md`](../../platform/milestones/Operational-Intelligence-Platform-V1-Certified.md).  
**Operator spine:** Questions → Measurements → Definitions → Answers.  
**Phase 2:** Consumers present Answers — [`PHASE-2-CONSUMPTION-MODEL.md`](./PHASE-2-CONSUMPTION-MODEL.md).

## Implemented (this sprint batch)

| Question | Status |
|----------|--------|
| Future Room Capacity | Regression preserved |
| Room Utilization | Implemented (Measure) |

Room Utilization:

- Numerator: `occupancy.expected` (active enrolled / schedule expectations)
- Denominator: `capacity.room_binding.binding` (effective capacity)
- Output: percentage (`÷` then `× 100`)
- Goal: healthy `rate_range` (default UI 75–95%)
- Health: below / on / above range / not available
- Catalog + configure/answer APIs + Questions card + inline builder
- BOS capability registered; shared answer/configure dispatch

Calculation Library:

- Pivot-style structured composer (Value / Calculation / Compared with / Display as %)
- Compiles into existing OrgCalcExpr AST (no second engine)
- Presets include utilization + prior capacity recipes

## Deferred (honest blockers)

| Question | Why deferred |
|----------|----------------|
| Program Utilization | No canonical program-grain occupancy + room-membership SoT with coverage disclosure |
| Ratio Risk | Required staff exists; **scheduled/on-hand staff resolver missing** — do not fake with enrollment |

Do not show placeholder cards for deferred questions.

## Pivot builder limitations (V1)

- Grain: room only (no program grain yet)
- No nested canvas / drag-drop graph
- No aggregate-over-collection nodes beyond catalog facts
- No calculation-version reference node (reuse FRC math via shared capacity inputs / presets, not nested calc refs)
- Filters/time are implicit: approved input resolvers + selected effective date

## QA fixtures

See `web/lib/operationalQuestions/oiQaFixtures.ts` and `web/scripts/qa/seedOiUtilizationFixtures.ts` (developer-only, non-destructive naming).
