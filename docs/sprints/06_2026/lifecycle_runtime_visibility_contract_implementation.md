# Lifecycle runtime visibility contract — implementation

**Path:** `docs/sprints/06_2026/lifecycle_runtime_visibility_contract_implementation.md`  
**Status:** **Implemented** (Phase 1 lifecycle runtime)  
**Date:** 2026-06-02  

**Approved architecture:**

- [lifecycle_visibility_vs_ownership_architecture.md](./lifecycle_visibility_vs_ownership_architecture.md)
- [lifecycle_visibility_runtime_implementation_plan.md](./lifecycle_visibility_runtime_implementation_plan.md)

**Sprint scope:** Lifecycle runtime visibility only — no Builder features, BOS, reporting, orchestration, forms, auto-migration, or reassignment.

---

## What shipped

### Canonical evaluator

`web/lib/lifecycle/lifecycleVisibilityEvaluator.ts`

- `resolveLifecycleVisibilityPredicate()` — returns `query_mode`, `status_keys`, `assignment_home_work_unit_id`, `requires_work_unit_visibility_gate`
- Modes: `lifecycle_visibility` (no `work_unit_id` gate), `legacy_pipeline` / `assignment_home` (strict FK)

### Queue runtime

`web/lib/lifecycle/lifecycleOpportunityQueueScope.ts`

- Scope mode renamed: `lifecycle_visibility` (was hybrid `lifecycle_status` + dept WU list)
- `applyOpportunityQueueWorkUnitScope()` — no-op on `work_unit_id` for lifecycle visibility
- `countLifecycleOpportunityRecordsForWorkUnit()` — org + `status_key` for visible count; separate assigned-home count

`web/lib/queues/QueueService.ts`

- `resolveOpportunityQueueScopeBundle()` passes `orgId`, `queueDefinition`, `departmentMetadata`
- Lifecycle stage WUs: empty `departmentWorkUnitIds` (not used as visibility gate)

### Workspace surfaces

| Surface | Change |
|---------|--------|
| `/workspace/dept` | Summaries use lifecycle visibility via QueueService preload |
| `/work-unit` | `loadWorkUnitOperationalBootstrap` passes `workUnitKey`, `departmentMetadata` for same predicate |
| Settings validation | Same counts; copy: “visible by lifecycle filters” + informational assignment |

### Assignment unchanged

- `opportunities.work_unit_id` still written on Create Lead (`lifecycleCreateLeadEntryBinding`)
- No navigation-time reassignment
- No attach/migrate in this sprint

### Copy

- Empty states: “visible by lifecycle filters” (not “belong to this lifecycle”)
- Validation: visible count + assigned-home count; mismatch is informational, not failure

---

## Acceptance (Lead Management)

| Check | Expected |
|-------|----------|
| Dept `3933ac47-…` Lead WU `587de5bc-…` | Count **17** for `new_inquiry` when org/access/site allow |
| `/work-unit/587de5bc-…` | Same **17** rows (no `work_unit_id` gate) |
| `work_unit_id` on those rows | Unchanged (still Enrollment pipeline home) |
| Runtime validation | “17 visible by lifecycle filters”; assigned-home subset informational |

**Indexes (recommended, not migrated this sprint):** `(org_id, status_key)` for visibility-first counts.

---

## Tests

- `web/tests/lifecycle/lifecycleVisibilityEvaluator.test.ts`
- `web/tests/lifecycle/lifecycleRecordAssignment.test.ts` (updated)
- `web/tests/lifecycle/lifecycleQueueTrace.test.ts` (updated)

Run:

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleVisibilityEvaluator.test.ts tests/lifecycle/lifecycleRecordAssignment.test.ts tests/lifecycle/lifecycleQueueTrace.test.ts
```

---

## Out of scope (later phases)

- Reporting KPI dimension split (Phase 2)
- BOS eligibility vs assignment (Phase 3)
- Enrollment pipeline retirement / cutover wizard (Phase 4)
- Greenfield policy flag to hide cross-lifecycle cohort (product toggle)
