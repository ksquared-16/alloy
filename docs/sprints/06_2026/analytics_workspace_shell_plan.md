# Analytics Workspace — Implementation Plan (Phase 2–3)

**Status:** Design only — no UI implementation in Phase 1.  
**Parent:** `docs/platform/modules/operational-intelligence-platform.md`

---

## Recommendation

Ship **Phase 2** as API + snapshot job + Settings targets before building UI.  
A **lightweight empty shell** is low-risk only if it is read-only with no metric computation — defer until Phase 3 unless product wants a nav placeholder.

---

## Route

| Item | Proposal |
|------|----------|
| Operator path | `/workspace/analytics` |
| Rewrite | `app/adminV2/analytics/**` (same pattern as Communications) |
| BOS | Persistent right rail unchanged (`AdminV2PersistentCommandRail`) |

---

## Navigation placement

Sidebar order (after Home, before Business Process groups):

1. Workspace (Home)
2. **Analytics** (new)
3. Tasks / Inbox / Forms (existing modals)
4. Business process groups

Icon: chart/trending — distinct from Workspace Home.

---

## Layout zones

```
┌─────────────────────────────────────────────────────────────┐
│ Analytics                    [Site filter] [Window: 30d ▼]  │
├──────────────┬──────────────────────────────────────────────┤
│ Pack sidebar │ KPI health grid (cards + status chips)       │
│ ──────────── │ ──────────────────────────────────────────── │
│ Enrollment   │ Trend chart (selected metric, snapshot TS)   │
│ Comms        │ ──────────────────────────────────────────── │
│ Forms        │ Dimensional breakdown table                  │
│ Ops Health   │ Saved views slot (Phase 4 reports)         │
└──────────────┴──────────────────────────────────────────────┘
                                      │ BOS rail │
```

---

## Pack sidebar

- Driven by org-enabled packs (future `org_settings.metadata.analytics_packs` or `kpi_pack_assignments` table)
- MVP packs: enrollment, communications, forms, operational_health
- Selecting pack filters KPI health grid + default trend metric

---

## KPI health grid

- Consumes `GET /api/admin/metrics/resolve` batch (live mode)
- Shows `formatted_value` + KPI status chip (healthy/warning/critical)
- Card click → sets active trend metric
- No client-side math

---

## Trend chart surface

- Reads `metric_snapshots` time series (Phase 2 snapshot job required)
- Chart library TBD — prefer existing design system
- Fallback: "Trends available after first snapshot run" when no rows

---

## BOS rail placement

- Unchanged geometry
- Phase 4: Orchestrator intents call MetricEngine (deterministic summaries only)
- Phase 3 shell: optional "Explain this metric" handoff stub linking to future BOS analytics query API

---

## Permissions

| Key | Purpose |
|-----|---------|
| `analytics.view` | Read Analytics workspace + metrics resolve |
| `analytics.configure` | KPI targets, pack enablement (Phase 2 Settings) |

Default: grant to admin/ops roles mirroring workspace access.

---

## Dependencies before build

1. `metric_snapshots` populated on schedule (nightly org rollup)
2. KPI targets config plane (`kpi_targets` table or org metadata formalized)
3. Batch metrics resolve endpoint (optional optimization for grid)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Client-side metric math | Forbidden — API only |
| Duplicate KPI systems | OIP engine authoritative; workspace strip uses family O bridge |
| AdminV2 reveal regression | Analytics is separate route — no work-unit queue coupling |

---

## Suggested Phase 3 sprint (after Phase 2)

1. Empty shell + pack sidebar + KPI health grid (live API)
2. Snapshot trend chart (single metric)
3. Permissions + nav entry
4. No BOS integration yet
