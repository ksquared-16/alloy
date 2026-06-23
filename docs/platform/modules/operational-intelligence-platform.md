# Operational Intelligence Platform

**Status:** Canonical platform module doc (Phase 0 MVP + Phase 1 expansion).

Alloy's measurement layer: **Events → Metrics → KPIs → Insights → Dashboards → Reports**.

Reports are a byproduct of the measurement system — not the foundation.

---

## Layer model

| Layer | Ownership | MVP status |
|-------|-----------|------------|
| **Events** | `workflow_events` + entity tables | Existing |
| **Metrics** | Code registry (`web/lib/metrics/`) | **Phase 1 shipped** |
| **KPIs** | Code definitions + org config targets | **Phase 1 evaluator** |
| **Snapshots** | `metric_snapshots` table + read/write utils | **Phase 1 shipped** |
| **Insights** | Deterministic templates + BOS (future) | Planned |
| **Dashboards** | Analytics workspace (future) | Planned |
| **Reports** | Saved views / exports (future) | Planned |

---

## Metric vs KPI

| | Metric | KPI |
|---|--------|-----|
| **What** | Computed measurement | Metric + accountability |
| **Example** | Median time to schedule tour = 36h | Target < 48h |
| **Defined in** | TypeScript registry | KPI registry + target config |
| **Config** | None (code-owned math) | Targets, thresholds, pack enablement |

---

## Computation kinds

### Event-window / entity-derived (enrollment tours)

Resolver: `web/lib/metrics/resolvers/eventWindowMetrics.ts`

**Authoritative tour truth:** `tour_bookings` rows — not `workflow_events`. Tour lifecycle events remain useful for workflows and timelines; metrics use durable booking state to avoid duplicate reschedule counting.

| Metric key | Format | Window | Source |
|------------|--------|--------|--------|
| `enrollment.time_to_schedule_tour` | duration (median hours) | rolling 30d default | `opportunities.created_at` → first eligible `tour_bookings.created_at` |
| `enrollment.tour_conversion_rate` | percent | rolling 30d default | `completed` / scheduled (`confirmed`, `completed`, `no_show`), excluding `rescheduled` rows |

### Entity snapshot

Resolver: `web/lib/metrics/resolvers/entitySnapshotMetrics.ts`

| Metric key | Format | Source |
|------------|--------|--------|
| `ops.work_overdue_count` | count | `operational_tasks` where `status = open` and `due_at < now()` |

### Communications pack

Resolver: `web/lib/metrics/resolvers/commsMetrics.ts`

| Metric key | Format | Window | Source |
|------------|--------|--------|--------|
| `comms.delivery_rate` | percent | rolling 30d default | `communication_messages` + `communication_delivery_events` |
| `comms.reply_rate` | percent | rolling 30d default | outbound messages with `replied_at` |
| `comms.failed_delivery_count` | count | rolling 30d default | `communication_delivery_events` where `event_type = failed` |

### Forms pack

Resolver: `web/lib/metrics/resolvers/formsMetrics.ts`

| Metric key | Format | Window | Source |
|------------|--------|--------|--------|
| `forms.completion_rate` | percent | rolling 30d default | `form_submissions` submitted vs created |
| `forms.packet_completion_time` | duration (median hours) | rolling 30d default | packet submission events / timestamps |

### Operational health pack

Resolver: `web/lib/metrics/resolvers/operationalHealthMetrics.ts`

| Metric key | Format | Window | Source |
|------------|--------|--------|--------|
| `ops.workflow_failure_rate` | percent | rolling 30d default | `workflow_runs` failed / terminal |
| `ops.needs_attention_count` | count | snapshot | bounded evaluator over open opportunities/tasks (cap 2000) |
| `ops.readiness_gap_count` | count | snapshot | bounded readiness gap scan (cap 500) |

**Attention/readiness metrics** are **evaluator snapshots**, not exhaustive org counts. They are marked `snapshotSemantics: true` in the registry and should not be treated as ledger truth.

---

## Metric snapshots

Table: `metric_snapshots` (migration `20260623120000_metric_snapshots.sql`).

| Column | Purpose |
|--------|---------|
| `metric_key`, `window_key`, `scope_type`, `scope_id` | Identity for a point-in-time value |
| `dimension_key`, `dimension_value` | Optional breakdown (site, lifecycle stage, status) |
| `value_numeric`, `value_json` | Scalar + auxiliary meta |
| `computed_at` | When the snapshot was taken |

**Live MetricEngine remains source of truth.** Snapshots are written explicitly — not on every resolve.

| Write path | Auth | Scope |
|------------|------|-------|
| `POST /api/admin/metrics/snapshots/write` | `x-cron-token` (`INTERNAL_CRON_TOKEN`) | All orgs or optional `org_id` in body |
| Same route | Admin/ops session | Single org only |

Writer: `web/lib/metrics/snapshots/writeOrgMetricSnapshots.ts` — resolves **live** metrics for all registered keys, windows `rolling_7d` + `rolling_30d`, org scope + active sites, then appends rows via `writeMetricSnapshot()`.

**Scheduling:** No platform cron scheduler yet. Wire external cron (Render/Vercel cron) to POST with `x-cron-token` daily. Manual backfill: same route as admin/ops.

**Trend reads:** `GET /api/admin/metrics/trends` — batch snapshot series, server-computed delta/direction/label + normalized sparkline Y (0–1). Analytics cards show **live** values with **snapshot-based** trend text.

**Limitations:** Trends require ≥2 snapshots for the same metric/window/scope. Single snapshot → “No trend yet”. Sparkline is indicative only — not a report chart.

Reads on resolve API: `mode=snapshot` uses `readLatestMetricSnapshot()` (24h max age); falls back to live.

Indexes: `(org_id, metric_key, computed_at)`, `(org_id, metric_key, scope_type, scope_id)`, `(org_id, computed_at)`.

RLS: org-scoped SELECT for authenticated; service_role for writes.

---

## Site filter

All OIP client surfaces pass the workspace **site filter** (`WorkspaceSiteFilterContext`) as `site_id` on resolve/trends APIs:

- Analytics modal
- `/workspace` OIP KPI strip + lifecycle performance metrics
- Work-unit OIP strip (existing)

Server enforces access via `assertMetricSiteAccess()` → `locationAllowedUnderSiteScope()`. Out-of-scope `site_id` → **403**.

`null` site = org-wide aggregate (all allowed sites).

---

## Config boundary

| Configurable (org / placement) | Code-owned |
|--------------------------------|------------|
| KPI targets & thresholds | Metric definitions |
| KPI pack enablement (future) | Aggregation logic |
| Workspace KPI strip placement (`workspace_kpi_placement`) | Resolver implementations |
| Analytics dashboard layout (future) | Event payload schemas |

**No arbitrary SQL or formulas in config.**

Optional Phase 2 target overlay: `org_settings.metadata.kpi_targets` (see `web/lib/metrics/kpiRegistry.ts`).

---

## Workspace KPI v0 coexistence

The existing **`web/lib/kpi/*`** system (L/Q/S/R families) remains the **context-derived orientation strip** for AdminV2 workspace surfaces. It is **not replaced** by OIP.

| System | Purpose |
|--------|---------|
| `web/lib/kpi/` | Queue/lifecycle parity strips on workspace/dept/WU |
| `web/lib/metrics/` | Event-backed and snapshot metrics for analytics, KPIs, BOS |
| **O-family bridge** | `oip.*` strip keys → MetricEngine via `web/lib/kpi/oipBridge.ts` |

Workspace placements use strip keys like `oip.enrollment.tour_conversion_rate`; values are fetched server-side from `/api/admin/metrics/resolve` — **no client-side metric math**.

---

## KPI definitions (Phase 1)

| KPI key | Metric | Target kind |
|---------|--------|-------------|
| `enrollment.time_to_schedule_tour` | median hours | duration_max_hours (≤48h healthy) |
| `enrollment.tour_conversion_rate` | percent | rate_min (≥40% healthy) |
| `comms.delivery_rate` | percent | rate_min (≥95% healthy) |
| `forms.completion_rate` | percent | rate_min (≥80% healthy) |
| `ops.work_overdue_count` | count | count_max (≤5 healthy) |

Targets are code-owned with optional `org_settings.metadata.kpi_targets` overlay.

---

## KPI packs (roadmap)

| Pack | Phase 1 metrics |
|------|-----------------|
| enrollment | time_to_schedule_tour, tour_conversion_rate |
| communications | delivery_rate, reply_rate, failed_delivery_count |
| forms | completion_rate, packet_completion_time |
| operational_health | work_overdue_count, workflow_failure_rate, needs_attention_count, readiness_gap_count |
| capacity / attendance / billing / staffing | — (future) |

Packs are assigned via industry bootstrap + future Settings → Analytics.

---

## API

**`GET /api/admin/metrics/resolve`** — server-only, org-scoped.

Query: `keys`, `window` (`rolling_24h` | `rolling_7d` | `rolling_30d`), optional `site_id`, `work_unit_id`, `mode` (`live` | `snapshot`), optional `status_key` / `lifecycle_stage` dimensions.

**`GET /api/admin/metrics/trends`** — batch snapshot trend (delta, direction, sparkline Y). Query: `keys`, `window`, optional `site_id`, `points` (2–24).

Returns deterministic, BOS-ready payloads with `sources`, `source_metadata`, `meta`, `resolve_mode`, and optional `kpi` health.

Unknown keys return **400** with `unknown_keys`, `available_keys`, and `packs`.

---

## Analytics admin workspace (Phase 3A — productization)

**Route:** `/admin/settings/analytics` (Admin → Configuration → Experience → Analytics)

Configuration surface (not the operator Analytics modal):

| Tab | Purpose |
|-----|---------|
| KPI packs | Read-only pack catalog — metrics and KPI keys per domain |
| KPI targets | Org overrides via `org_settings.metadata.kpi_targets` — PATCH `/api/admin/metrics/kpi-targets` |
| KPI placement | Visibility matrix (workspace strip, work unit strip, Analytics modal, lifecycle tile) + link to Workspace metrics |

**Operator Analytics modal** — Operational Intelligence Center: summary row (tour conversion, time to tour, overdue work, forms completion), pack health chips, site scope, pack sections below.

**Workspace strip** — dual band: Pipeline overview (inventory Q/L metrics) + Operational performance (O-family OIP cells).

**Work unit OIP** — lifecycle builder-owned shells show OIP-only performance strip; default keys include forms completion; resolve passes `workUnitId`.

---

## Analytics workspace (Phase 3 — deferred)

Design plan: `docs/sprints/06_2026/analytics_workspace_shell_plan.md` — dedicated route nav (beyond modal). Modal + admin config delivered in Phase 3A.

---

## BOS future read path

BOS aggregate questions will call **`MetricEngine.resolve()`** only — no raw SQL, no client-side math, no LLM-computed KPIs.

Deterministic insight templates consume the same response shape as the admin API.

See `docs/platform/modules/ai-platform.md` and BOS GATE 0 doctrine.

---

## Phased roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 0 + MVP | Metric registry, 3 metrics, 1 KPI, admin API, tests | **Done** |
| 1 | 11 metrics, snapshots, KPI expansion, API hardening, O-family workspace bridge | **Done** |
| 2A | Analytics modal, KPI packs, workspace OIP exposure | **Done** |
| 2B | Snapshot writer route, trend API, sparklines, site filter passthrough | **Done** |
| 3A | Analytics admin config, modal polish, unified workspace strip, WU OIP visibility, lifecycle tile performance band | **Done** |
| 3B | Scheduled snapshot cron infra, settings targets table (optional) | Planned |
| 4 | BOS aggregate queries | Planned |
| 5 | Report exports | Planned |

---

## Related

- `../foundation/platform-event-catalog.md`
- `../modules/ai-platform.md`
- `../modules/configuration-platform.md`
- `../../system/actions-and-workflows.md`
- `web/lib/metrics/` — implementation
- `web/lib/kpi/` — workspace strip (separate)
