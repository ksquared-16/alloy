# Analytics V2 Metric Platform Doctrine

## Purpose

Analytics V2 introduces a **configurable metric platform** where operators define meaning, thresholds, visuals, and placement — while the platform owns computation safety, source adapters, validation, auth, RLS, snapshots, and financial truth.

## Non-negotiable rules

1. A **metric** is a configurable object (`metric_definitions`).
2. A **KPI** is a metric with targets and thresholds (`is_kpi`, `target_config`, `threshold_config`).
3. **Metric definition** is separate from **visualization** (`metric_visualizations`).
4. **Visualization** is separate from **placement** (`metric_placements`).
5. **Placement** is surface-aware but does not own computation.
6. Metrics must be reusable across Business Processes, Work Units, Workspace, Operational Intelligence, BOS, dashboards, reports, portals, and mobile.
7. Operators configure meaning, thresholds, visuals, and placement.
8. The platform owns computation safety, source adapters, validation, auth, RLS, snapshots, and financial truth.
9. **No raw SQL builder** for users.
10. **No arbitrary unvalidated JSON** — all config uses versioned Zod schemas (`version: 1`).
11. All config writes go through versioned, server-validated admin APIs under `/api/admin/analytics/`.
12. Feature flag **`ANALYTICS_V2_METRIC_PLATFORM_ENABLED`** keeps V1 OIP safe.

## Source adapter rules

- Source adapters are **code-owned** in `web/lib/metrics/platform/metricSourceRegistry.ts`.
- Each adapter exposes: key, label, status, supported aggregations, filters, dimensions, and maps to an OIP resolver when available.
- Adapters marked `disabled` or `coming_soon` must not fake data.
- Evaluation delegates to the existing MetricEngine (`web/lib/metrics/metricEngine.ts`) — no parallel computation paths.

## V1 coexistence

- OIP V1 uses code-owned registry (`web/lib/metrics/registry.ts`) and `metric_snapshots` (key-based).
- V2 uses DB-backed definitions and `metric_platform_snapshots` (definition-id-based).
- When the feature flag is **off**, all V1 surfaces and APIs behave unchanged.

## Feature flag

| Env var | Default | Effect |
|---------|---------|--------|
| `ANALYTICS_V2_METRIC_PLATFORM_ENABLED` | `false` | Server APIs + evaluation |
| `NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED` | `false` | Client OI V2 rendering + builder tabs |

## QA instructions

1. Set both env vars to `1` in development.
2. Apply migrations `20260624120000` and `20260624120100`.
3. Open **Configuration → Operational Intelligence → Metric builders**.
4. Preview Tour Conversion %, create/activate visualization, confirm OI overview placement.
5. Open Operational Intelligence modal — confirm V2 zone renders below V1 overview.
6. Disable flag — confirm V1-only rendering returns.
7. Call BOS read helpers in `web/lib/metrics/platform/bosMetricRead.ts` from a server context.
