# Operational Intelligence — Weighted Populations foundation

> **Superseded naming:** product language is now **Equivalency** — see
> [`EQUIVALENCY-ENGINE.md`](./EQUIVALENCY-ENGINE.md).

## Platform additions

```text
Facts → Populations → Equivalency Definitions → Equivalent Counts → Calculations → Measurements → Answers
```

| Primitive | Persistence | Versioning |
|-----------|-------------|------------|
| Population | `org_settings.metadata.organization_populations` | draft → published immutable versions |
| Weighting | `org_settings.metadata.organization_weightings` | draft → published immutable versions |
| Equivalent Count | AST node `equivalent_count` | binds exact `population_version_id` + `weighting_version_id` |

Single OrgCalcExpr evaluator — equivalent count is pre-resolved at room evaluation then injected (same pattern as occupancy).

## V1 predicates / schemes

- Population: `expected_in_room_on_date` (same committed schedule path as `occupancy.expected`)
- Weighting: `unweighted` | `days_per_week` (org factors; default 5→1.0 … 1→0.2)

## Certified questions

1. Future Room Capacity (regression)
2. Room Utilization (active / occupancy headcount)
3. Room Utilization (FTE) — equivalent count ÷ capacity × 100
4. Equivalent Child Count — reusable population aggregate

## Builder V3

Use → Count as → Compare with → Calculate → Display (no raw AST).

## UI convergence

Questions denser (Financials/Rooms rhythm). Measurement overview metric strip. Calculation Library pivot composer with population/weighting selects.

## Limitations

- Population grain: room only
- One membership predicate in V1
- Weighting is days/week factors (not hours FTE; not CRM schedule_type alone)
- Populations/weightings stored in org metadata (not separate SQL tables yet)
- Authenticated QA fixtures still developer-named (`OI-QA`)
