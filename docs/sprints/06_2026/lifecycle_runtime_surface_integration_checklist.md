# Lifecycle Runtime — Post-Visibility Surface Integration

**Status:** Implemented (May 2026)  
**Prerequisite:** [lifecycle_runtime_visibility_contract_implementation.md](./lifecycle_runtime_visibility_contract_implementation.md)  
**Out of scope:** Needs Attention sprint, Orchestration sprint

## Goal

After lifecycle visibility (status-based lenses, not strict `work_unit_id` gates), align **runtime surfaces** that operators see on `/dept` and `/work-unit` with builder configuration: KPIs, pills, waitlist layout, action placements, and Settings validation.

## Checklist

### 1. KPI sections

| Surface | Behavior |
|---------|----------|
| `/dept` | Builder-owned departments: KPI facets use **lifecycle stage work units** only; aggregate label **Visible in department (lifecycle)**. Counts come from queue summaries (`lifecycle_visibility` scope in QueueService). |
| `/work-unit` | `lifecycle_wu_*` work units: baseline strip uses **Visible in work unit (lifecycle)** and **(visible)** on active queue facet. |
| Assignment home | Not shown as primary KPI; assignment mismatch remains informational in Settings validation only. |

**Code:** `lifecycleKpiPresentation.ts`, `kpi/baseline.ts`, `kpi/resolver.ts`, dept + work-unit pages.

### 2. Work unit pills / filters

| Surface | Behavior |
|---------|----------|
| `/dept` throughput | Rows = `lifecycle_wu_*` stages (not `enrollment_pipeline` / `needs_attention`). |
| `/work-unit` pills | Derived from stage work unit `queue_definition` lanes; selection filters via lifecycle visibility predicate in QueueService. |
| Needs Attention | Placeholder copy when no `needs_attention` WU; empty buckets allowed without failure. |

**Code:** `builderOwnedLifecycleRuntime.ts`, `loadDeptOperationalBootstrap.ts`, work-unit page pill strip + queue summaries.

### 3. Waitlist layout

| Mode | When | Queue shape |
|------|------|-------------|
| `waitlist_candidate` | Operator stage `waitlist` | Candidate-grain waitlist template (enrollment pipeline waitlist lane semantics). |
| `child_grain` | Operator stage `enrollment` | Child grain opportunity queue. |
| `standard_opportunity` | Other stages | Case-grain CRM compact row. |

**Note:** Existing stage WUs keep prior `queue_definition` until **repair/sync**; new stages and repair paths use `lifecycleStageQueuePresentation.ts`.

### 4. Actions placements

Actions Matrix placements map to runtime surfaces:

| Placement label (Settings) | Runtime surface |
|----------------------------|-----------------|
| Department Right Rail | `/dept` department rail |
| Work Unit Right Rail | `/work-unit` rail |
| Work Unit Queue Row | Queue row actions |
| Drawer / Overflow Menu | Opportunity drawer actions menu |

Validation summarizes counts via `lifecycleRuntimeSurfaceValidation.ts`. Actions remain optional; stage restrictions and preflight unchanged.

### 5. Runtime validation (Settings)

Compact validation still maps to five operator rows. Additional server checks:

- **Needs Attention (optional)** — pass when not configured.
- **Queue visibility matches Settings counts** — builder-owned parity check (same visibility count path as queue summaries).
- **Actions — configured placements** — department / work-unit rail / queue row / drawer breakdown.

### 6. Tests

`web/tests/lifecycle/lifecycleRuntimeSurfaceIntegration.test.ts`  
`web/tests/lifecycle/lifecycleStageQueuePresentation.test.ts`

Run:

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleRuntimeSurfaceIntegration.test.ts tests/lifecycle/lifecycleStageQueuePresentation.test.ts
```

## Acceptance (Lead Management example)

- Workspace tile visible.
- `/dept` and `/work-unit` show `lifecycle_wu_*` stages with **visibility counts** (e.g. 17× `new_inquiry` without reassigning `work_unit_id`).
- Waitlist stage uses waitlist/candidate layout when queue definition was synced/repaired.
- Configured matrix actions appear on correct rails; NA pill/section may be empty.

## Follow-ups

- DB index on `(org_id, status_key)` for large orgs (visibility sprint).
- Greenfield hide for cross-lifecycle cohort on shared statuses.
- Needs Attention + Orchestration sprints (explicitly deferred).
