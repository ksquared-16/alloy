# OI Future Room Capacity — Phase 0 discovery

**Worktree:** Slot 4 `wt4-operational-calculations`  
**Date:** 2026-07-27

## Why exactly six measurements?

`KPI_DEFINITIONS` / `OipKpiKey` in `web/lib/metrics/kpiRegistry.ts` hardcodes six KPIs. The OI collection is one row per KPI.

| # | Display name | Identity | Pack | Producer |
|---|--------------|----------|------|----------|
| 1 | Time to schedule tour | `enrollment.time_to_schedule_tour` | enrollment | live DB median hours |
| 2 | Tour conversion rate | `enrollment.tour_conversion_rate` | enrollment | live DB rate |
| 3 | Delivery rate | `comms.delivery_rate` | communications | live DB rate |
| 4 | Form completion rate | `forms.completion_rate` | forms | live DB rate |
| 5 | Overdue work | `ops.work_overdue_count` | operational_health | live task count |
| 6 | Needs attention | `ops.needs_attention_count` | operational_health | bounded opportunity scan |

Ownership: **code/registry definitions** + org overlays for lifecycle (`oi_config`) and targets (`kpi_targets`).

## Why 4/4 packs enabled and 0 available to enable?

- Available packs with metrics: enrollment, communications, forms, operational_health.
- `isPackEnabled` defaults **on** when `oi_config.packs[key]` is absent.
- KPI lifecycle defaults **active** when pack is on.
- Add catalog = lifecycle `available` or `disabled` only → empty under defaults.

## What does Add measurements do?

Opens a modal of available/disabled platform KPIs and PATCHes `oi_config` to set them `active`. Under defaults the catalog is empty — **misleading CTA**, not a dead handler.

## Targets / history / identity

- Targets: `org_settings.metadata.kpi_targets` (+ KPI defaults)
- History: `metric_snapshots` (explicit writes; not every live resolve)
- Canonical identity: `OipKpiKey`

## Can existing model consume exact published OC versions?

**Not before this slice.** MetricEngine is a closed `OipMetricKey` switch. This proving slice adds a **parallel org-owned measurement store** (`oi_org_calc_measurements`) that binds an exact published calculation version and observes via `evaluateOrganizationCalculationForRoom`.

## Mixture model

Current OI rows are **platform definitions + org overlays + live/snapshot observations**. Organization-authored measurement definitions did not exist until Future Room Capacity.
