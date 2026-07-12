---
owner: analytics
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Analytics V2 Roadmap

## Phase 1 — Metric Platform Foundation (this delivery)

- [x] Canonical data model + migrations
- [x] Type system + Zod validators
- [x] Source adapter registry (OIP bridge)
- [x] Server-side evaluator
- [x] Snapshot + trend foundation
- [x] Visualization + placement + rollup models
- [x] Admin APIs
- [x] Seed enrollment metrics
- [x] Builder UX MVP
- [x] OI V2 consumption path (feature-flagged)
- [x] BOS-readable metric read service
- [x] Tests + doctrine docs

## Phase 2 — Remaining work

- Dedicated analytics route (`/adminV2/analytics`) vs modal-only
- Full metric create/edit form (source picker, filter/dimension UI)
- Org template copy-on-first-use pattern
- Snapshot scheduler / cron integration
- `lead_count`, `tour_completed_count`, `pipeline_value` adapters (currently disabled)
- Work unit header + workspace header placement rendering
- Dashboard/report/portal/mobile surfaces
- BOS chat integration (deterministic insight templates)
- Pack enablement per org
- Move KPI targets from `org_settings.metadata` to dedicated table
- Chart infra for line/area/bar visualizations
- Rollup builder UI
- Audit log on config mutations

## Feature flag

`ANALYTICS_V2_METRIC_PLATFORM_ENABLED` / `NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED`

Default: **off**. V1 unchanged when disabled.
