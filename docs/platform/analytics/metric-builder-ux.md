---
owner: analytics
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Metric Builder UX

## Location

**Configuration → Operational Intelligence → Metric builders** (visible when `NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED=1`).

## MVP surfaces

### 1. Metric Builder

- View metrics (global templates + org copies)
- Preview live evaluation
- Publish draft → active
- Source adapter catalog with availability status

### 2. Visualization Builder

- List visualizations
- Activate draft visualizations
- Types: KPI card, trend card, chip (MVP)

### 3. Placement Builder

- List placements by surface/zone
- Show/hide placements
- Surfaces initially: `operational_intelligence`, `work_unit_header`

### 4. OI Layout resolution

When flag enabled, `OiV2MetricOverview` resolves placements by zone:

- overview
- health
- trends
- comparisons

V1 `OipOverviewStructure` remains as fallback/base layer.

## APIs consumed

- `GET/POST /api/admin/analytics/metrics`
- `POST /api/admin/analytics/metrics/[id]/preview`
- `GET/PATCH /api/admin/analytics/visualizations/[id]`
- `GET/PATCH /api/admin/analytics/placements/[id]`
- `GET /api/admin/analytics/surfaces/[surface]/placements`

## Components

- `MetricVisualRenderer` — dispatches by visualization type
- `MetricKpiCard`, `MetricTrendCard`, `MetricChip`, `MetricSparkline`
- `OiV2MetricOverview` — OI zone rendering
