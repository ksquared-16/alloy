---
owner: analytics
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Analytics V2 Metric Data Model

## Tables

### `metric_definitions`

Configurable metric objects. Global templates have `org_id NULL`; tenant copies have `org_id` set.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid nullable | NULL = global template |
| key | text | Unique per org or globally for templates |
| label, description, category | text | Operator-facing |
| entity_scope | text | org, site, department, work_unit, record |
| source_type, source_key | text | Adapter reference |
| aggregation | text | count, rate, avg, etc. |
| numerator_config, denominator_config | jsonb | Rate/ratio config |
| filter_config, dimension_config | jsonb | Versioned (`version: 1`) |
| default_period_config | jsonb | Rolling/custom period |
| unit, precision | | Display |
| is_kpi | boolean | KPI flag |
| target_config, threshold_config | jsonb nullable | KPI thresholds |
| status | draft/active/archived | |
| version | integer | Config version |

### `metric_visualizations`

Visualization config separate from definition.

Types: `kpi_card`, `trend_card`, `sparkline`, `line_chart`, `area_chart`, `bar_chart`, `comparison`, `gauge`, `scorecard`, `table`, `chip`.

### `metric_placements`

Surface-aware placement. Does not own computation.

Surfaces: `workspace_header`, `business_process_tile`, `work_unit_header`, `drawer`, `operational_intelligence`, `dashboard`, `report`, `portal`, `mobile`.

Zones: `overview`, `health`, `trends`, `comparisons`, `header`, `footer`, `sidebar`.

### `metric_platform_snapshots`

Append-only V2 snapshots for trends. Distinct from V1 `metric_snapshots` (key-based).

### `metric_rollups`

Composite metrics: sum, avg, weighted_avg, best, worst, composite_score, health_score.

## RLS

All tables use `current_org_id()` for authenticated reads. Writes via service role in admin APIs.

## Migrations

- `20260624120000_analytics_v2_metric_platform.sql` — tables + RLS
- `20260624120100_analytics_v2_metric_platform_seeds.sql` — global templates + childcare placements
