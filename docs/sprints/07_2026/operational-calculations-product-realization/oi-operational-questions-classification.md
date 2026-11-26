# Operational questions — product classification

Proven pattern (this slice): **Published Organization Calculation → OI measurement binding → on-demand observation (+ capped history) → target → health → presentation.**

| # | Question | Primary owner | Kind | Deterministic? | Display | BOS | Workspace | Dashboard | Dependency |
|---|----------|---------------|------|----------------|---------|-----|-----------|-----------|------------|
| 1 | Future room capacity | OI measurement consuming Org Calc | **Measurement** (calc-backed) | Yes (effective-dated) | OI + room context | Exceptions only | Room detail / context | Org trends later | Published OC + capacity inputs |
| 2 | Future age-outs | Planning / cohort model | **Forecast / planning** | Predictive + rules | Workspace + Planning | Aging exceptions | Child/room | Cohort charts | Age rules + enrollment truth |
| 3 | Upcoming transitions | Assignment / BOS | **Recommendation + action** | Mostly rule-based | Workspace + BOS | Yes | Active work object | Summary counts | Transition policy |
| 4 | Children eligible for movement | Assignment | **Recommendation** | Rule-based | Workspace | Candidate queues | Child/room | Drill-down | Capacity + eligibility |
| 5 | Ratio risks | OI measurement (staffing/ratio source) | **Measurement** | Deterministic once inputs exist | OI + BOS | When off goal | Room | Org risk | Ratio calculation/source |
| 6 | Future staffing needs | Planning + forecast | **Forecast / planning** | Predictive | Planning | Staffing gaps | Site staffing | Trends | Forecast model |
| 7 | Room utilization | OI measurement | **Measurement** | Deterministic | OI / dashboard | Over/under util | Room | Heatmaps | Occupancy + capacity |
| 8 | Program utilization | OI measurement | **Measurement** | Deterministic | Dashboard / OI | Program exceptions | Program | Comparisons | Program occupancy |
| 9 | Enrollment bottlenecks | OI + Pipeline | **Measurement + insight** | Mix | Dashboard + Workspace | Stage stuck | Pipeline | Funnel | Stage metrics |
| 10 | Waitlist opportunities | Placement / Planning | **Planning output** | Ordered deterministic + policy | Workspace | Offer windows | Waitlist | Pipeline health | Placement priority |
| 11 | Transition recommendations | Assignment + BOS | **Recommendation → action** | Rule/AI assist | BOS + Workspace | Primary | Active cases | Not primary | #1–5 inputs |

## Forecasting boundary

True forecasting (not future-date evaluation): staffing needs, demand/age-out projections with uncertainty, enrollment volume forecasts.

Must show assumptions + confidence; never present as certainty.

## Surface ownership

- **BOS:** actionable exceptions, decisions, recommendations with execute path — not passive analytics.
- **Workspace:** context for the active record (room/child/case).
- **Dashboards:** aggregates, trends, comparisons, drill-down — not primary workflow.

## Next slice

After Future Room Capacity proves reuse: **Room utilization** measurement (same adapter family if backed by OC, else entity snapshot resolver) **or** ratio-risk measurement once a published ratio calculation exists.
