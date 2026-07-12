# Opportunity Drawer Lifecycle Rail Restoration

**Status:** Active (May 2026)  
**Type:** Restoration — not a new workflow system.

## Problem

The opportunity drawer previously showed a compact operational lifecycle rail (New Lead → Tour → … → Enrolled). During AdminV2 drawer performance hardening, the rail was:

1. **Gated behind header reveal** — replaced with empty timeline reserve when opening from queue preview (`opportunityWorkflowHeaderUsesQueuePreview`).
2. **Placed above tabs** in `headerSignals`, not below tabs as operators expect.
3. **Broken for v2 queue definitions** — step list used only the **first** non-critical `ui.sections` entry (one queue key), not the full throughput progression.
4. **Status matching incomplete** — only read v1 `filters.type === "status"`, missing v2 `filters_compat_v1` and queue `aliases`.

The component logic still existed inline in `AdminEntityDrawer.tsx` (`opportunityInquiryWorkflowHeaderTimeline`); it was hidden/bypassed, not deleted.

## Source of truth

| Concern | Source |
|---------|--------|
| Stage order | `work_units.queue_definition` → `ui.sections` (throughput, excluding `tone: critical`) via `extractPipelineExecutionLanes()` |
| Stage labels | Section labels when present; else `queues[].label` |
| Current stage | Opportunity `status_key` matched against each queue's `filters_compat_v1`, `filters` (`status` / `case_status`), and `aliases` |
| Status control / transitions | Existing `status_definitions` + drawer status select (unchanged) |
| Queue pills / WU routing | Same `queue_definition` document loaded on drawer bootstrap (`opportunityQueueDefinition`) |

**Do not** hardcode Firefly childcare stages in UI code. Enrollment demo progression comes from `enrollment_pipeline` queue_definition (migrations + `enrollmentPipelineQueueDefinitionV2.ts`).

Note: `ui.suppress_lifecycle_panel` on the queue definition suppresses the **work-unit workspace** lifecycle panel only — not the opportunity drawer rail.

## Implementation

| File | Role |
|------|------|
| `web/lib/admin/drawer/resolveRecordLifecycleRailModel.ts` | Config-driven step list + current index |
| `web/components/admin/drawer/RecordLifecycleRail.tsx` | Shared compact horizontal rail |
| `web/components/admin/drawer/RecordLifecycleRailSkeleton.tsx` | Lightweight loading reserve |
| `web/components/admin/Drawer.tsx` | `postTabStrip` slot below tab row |
| `web/components/admin/AdminEntityDrawer.tsx` | Wires rail for inquiry workflow opportunities |

### Placement

```
Overview | Related | Activity | Documents
[ New Leads ] → [ Tours ] → [ Follow Up ] → …
────────────────────────────────────────────
(drawer body scrolls)
```

### Loading

- Rail renders in `postTabStrip` — does **not** gate overview body reveal.
- When `queue_definition` is not yet on bootstrap: `RecordLifecycleRailSkeleton`.
- When config missing or non-pipeline layout: rail omitted (graceful).

## Child drawer alignment (future)

Do **not** fork a separate lifecycle visual. `PersonDrawerChildLifecycleSnapshot` should eventually:

1. Resolve steps from child-specific lifecycle config (or enrollment mirror + layout placements).
2. Render via `RecordLifecycleRail` with the same dot/connector language.

Child drawer was **not** modified in this pass.

## Tests

`web/tests/admin/drawer/recordLifecycleRail.test.ts`

## Related

- `web/lib/workspace/extractPipelineExecutionLanes.ts` — lane extraction (shared with dept/WU surfaces)
- `docs/sprints/archive/05_2026/adminv2_drawer_performance_hardening_phase0.md` — prior calm-loading header doctrine
- `docs/sprints/archive/05_2026/child_profile_person_drawer_doctrine.md` — child lifecycle strip (future `RecordLifecycleRail` consumer)
