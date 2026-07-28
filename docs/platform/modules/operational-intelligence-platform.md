---
owner: modules
status: canonical
last_reviewed: 2026-07-28
supersedes: []
---

# Operational Intelligence Platform

**Status:** Canonical platform module doc. **V1 FROZEN** — see [`../milestones/Operational-Intelligence-Platform-V1-Certified.md`](../milestones/Operational-Intelligence-Platform-V1-Certified.md).

**Amended 2026-07-27:** measurements remain downstream consumers of **published** Operational Calculation results (platform Definitions and Organization Calculations). OI owns targets, health, snapshots, and trends — not calculation math. See [`../core/operational-calculations.md`](../core/operational-calculations.md) §3.1.

**Amended 2026-07-28 (V1 closeout):** Product operator spine is **Questions → Measurements → Definitions → Answers**. External products consume **Answers** (Operational Answer Contract) — not Measurements as a presentation object. Phase 2 = consumer presentation; no speculative primitives.

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
| **Defined in** | TypeScript registry **or** published Organization Calculation result binding | KPI registry + target config |
| **Config** | None for code-owned metric math; org may bind a published calculation as a measurement source | Targets, thresholds, pack enablement |

> **Path B (2026-07-27).** Organization Calculations author **read-only derived truth** via a typed AST over approved platform functions ([`../core/operational-calculations.md`](../core/operational-calculations.md) §3.1). Operational Intelligence does **not** author those calculations. When a measurement is bound to a published calculation, OI still owns only accountability overlays (targets/health/history).

> **Future Room Capacity proving slice (2026-07-27).** Organization-owned measurements may bind an **exact published Organization Calculation version** (`org_settings.metadata.oi_org_calc_measurements`). Publishing calculation v2 does not move the binding; administrators rebind explicitly. Observations evaluate on demand via the existing room evaluator and append capped history in metadata — they never invent zeros for missing capacity.

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

## Operational Intelligence configuration (Phase 3A–3B)

**Route:** `/admin/settings/analytics` (Configuration → Experience → **Operational Intelligence**)

Legacy `/admin/settings/kpis` redirects to `?tab=visibility`.

| Tab | Purpose |
|-----|---------|
| Operational playbooks | What is tracked, why, current vs target, where teams see it |
| Targets | Org overrides via `org_settings.metadata.kpi_targets` — target, current, status |
| Experience placement | Placement matrix + embedded strip editor |

**Operator panel** — white Communications-aligned shell; condensed executive summary row; compact pack list rows; Configure closes modal then navigates to settings.

**Workspace strip** — **Pipeline Overview** + **Operational Performance** bands, visually distinct.

**Work unit** — dual-band when both inventory and OIP cells present; lifecycle shells OIP-only.

### Phase 3C — workspace design convergence

- **Workspace command header** replaces dual-band strip at root — Business / Operations / Enrollment health chips + performance indicators only (no inventory band).
- **Business Processes** operator terminology (sidebar, cards, settings visibility labels).
- **Business process cards** — performance metrics above operational counts; denser layout.
- **O.I. command center** — intentional Bend Pine / Midnight / Blue pack accents; compact rows retained.

### Phase 3D — configuration usability & operational value

**Goal:** Operators understand what they configure without platform knowledge.

| Surface | Change |
|---------|--------|
| Settings summary | Indicator count, playbook count, off-track targets, last updated, health chips |
| Operational playbooks | Story cards: Purpose, Indicators (target/current/status), Where shown, pack status |
| Targets tab | Table: Target · Current · Status + inline edit |
| Experience placement | Operator labels: Organization Workspace, Business Process, Work Unit, Operational Intelligence Panel |
| Command center modal | Business / Operational / Enrollment health command bar; playbooks nav label |

**UX pattern audit (Communications + platform workspace modals):**

| Pattern | Communications | O.I. application |
|---------|----------------|------------------|
| Section cards | `CommsSectionCard` — title, helper, border-b header | `OipSectionCard` — same hierarchy |
| Card chrome | `rounded-xl border border-alloy-stone/20 bg-white p-3 shadow` | `OIP_CARD_CLASS` — matched |
| Section title | `text-[11px] font-semibold tracking-wide` | `OIP_SECTION_TITLE_CLASS` |
| Helper copy | `text-[10px] text-alloy-midnight/50` below title | `OIP_SECTION_HELPER_CLASS` |
| Primary action | Pine button, bottom/right of section | Adjust targets / Configure → |
| Modal shell | White panel inside `AdminV2WorkspaceBosModalShell` | Analytics modal — same shell |
| Command layout | Queue \| Conversation \| Composer columns | Health bar + summary row + playbook sections |
| Health signals | Status pills in queue/conversation headers | Health command chips + per-indicator status |

POS workspace is not yet implemented in-repo; O.I. follows the shared **platform workspace modal** pattern (`AdminV2WorkspaceBosModalShell`) used by Communications and Inbox.

### Phase 3E — premium workspace convergence

- **KPI object cards** — label, value, target, status (`OipKpiObjectCard`) on workspace header, work unit operational performance, O.I. panel, and settings playbooks.
- **Workspace header** — filler copy removed; Business / Operational / Enrollment health + KPI objects only.
- **Business process grid** — denser 2×2 cards; performance first, counts second, minimal action footer.
- **O.I. panel** — white surfaces, thin borders, pine accent bars; no tinted washes or gray fills.
- **Playbooks** — inline Edit Targets / Edit Visibility on cards; collapsible placement detail.
- **Work unit** — unified operational header; Needs Attention as OIP KPI object; deduped from queue inventory band.

### V1 final polish — workspace integration

- **Needs Attention** — first-class OIP KPI object (`ops.needs_attention_count`) on workspace, work unit, O.I. panel, and enrollment business process cards.
- **Unified headers** — health summary cards share KPI object shell; work unit context + KPIs in one operational header.
- **KPI object layout** — shared visual system (`oipKpiCardVisualSystem`) with accent families (Enrollment/pine, Communications/blue, Forms/violet, Operational/midnight), status-colored left bars, icon wells, goal + trend slots.
- **O.I. panel** — enrollment vs operations KPI grouping; Bend Pine accent bar; health cards aligned with workspace.

### V1 design alignment — Experience Builder color system

OIP surfaces delegate accent colors to **`layoutEditorWidgetStyle`** (Experience Builder widget tones). Domain mapping:

| Domain | EB tone | Tailwind accent |
|--------|---------|-----------------|
| Enrollment | `green` | `alloy-juniper` (Bend Pine #00A283) |
| Communications | `blue` | `alloy-blue` |
| Forms | `purple` | `violet-500/600` |
| Operational Health | `neutral` | `alloy-midnight` |

**Important:** In `@theme`, Bend Pine teal is `alloy-juniper`, not `alloy-pine`.

Surfaces (workspace command band, work-unit band, O.I. modal sections) are **flat** — KPI cards sit on the page without nested outer boxes.

V1 settings expose active playbooks with **Edit targets** and **Experience placement** only. Coming-soon playbooks are collapsed. **Not in V1:** adding or swapping indicators, editing operator copy, choosing card colors/appearance, or playbook templates — planned for a future settings release.

---

## Analytics workspace (Phase 3 — deferred)

Design plan: `docs/sprints/archive/06_2026/analytics_workspace_shell_plan.md` — dedicated route nav (beyond modal). Modal + admin config delivered in Phase 3A.

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
| 3B | UX convergence — Communications-aligned modal, config unification, operator terminology | **Done** |
| 3C | Scheduled snapshot cron infra, settings targets table (optional) | Planned |
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
