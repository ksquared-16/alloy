# Work Unit Surface Context — Developer Contract

**Status:** Contract frozen — **partial API wiring shipped** (case-grain rows only)  
**Architecture:** [`docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md`](../sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md)  
**Types:** `web/lib/workUnits/`  
**Contract version:** `1.0-partial`

---

## Purpose

Layout Configuration and AdminV2 work-unit surfaces need a **stable, grain-aware runtime payload** without embedding enrollment-specific branching in layout JSON.

Platform code resolves:

- **Which lifecycle subject** caused queue membership
- **How to label** the row (stage + subject status)
- **How to open** the drawer (case shell + active subject focus)
- **What context** siblings and summaries provide

Layout blocks **consume** `WorkUnitSurfaceContext` / `QueueRowContext` — they do not compute grain logic.

---

## Module map

| Module | Role |
|--------|------|
| `web/lib/workUnits/lifecycleSubjectContracts.ts` | Frozen TypeScript types |
| `web/lib/workUnits/buildPartialQueueRowContext.ts` | Partial adapter from enriched opportunity rows |
| `web/lib/workUnits/index.ts` | Public exports |

---

## Types (summary)

| Type | Role |
|------|------|
| `LifecycleSubjectType` | `case` \| `child` \| `candidate` \| future vertical subjects |
| `LifecycleSubjectRef` | Authoritative subject + lifecycle/stage/status keys |
| `QueueRowContext` | Per-row normalized context for queue list blocks |
| `DrawerSubjectContext` | Active subject focus inside case drawer |
| `WorkUnitSurfaceContext` | Work unit queue page / bootstrap payload for layout runtime |

---

## Partial adapter + API wiring (today)

### Builder

`buildPartialQueueRowContext()` builds **honest case-grain** context from `enrichOpportunityRows` output:

- `row_subject.subject_type` = `"case"` (even when lane `queue_grain` is `child` / `candidate`)
- `related_subjects_summary` from `metadata.inquiry_children` when present
- `attention_summary` / `next_best_action` from existing `_needs_attention` / `_operational_recommendation_preview`
- `drawer_open` always targets `opportunities` with case `active_subject`

### Runtime wiring (shipped)

`attachOpportunityQueueRowsWithRowContext()` in `web/lib/workUnits/attachQueueRowContextToItems.ts` is called from **`QueueService`** after enrichment/placement — **not** inside membership queries.

| API route | QueueService function | Field |
|-----------|----------------------|-------|
| `GET /api/admin/queues/[workUnitId]/[queueKey]` | `getWorkUnitQueueItems` | `result.items[]` |
| `GET /api/admin/work-units/[id]/queues` | `getWorkUnitQueueSummaries` | `queues[].preview[]` |
| WU bootstrap reveal | `getWorkUnitQueuePreviewRows` → `getWorkUnitQueueItems` | same as list |

**Rollback:** `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` omits `_queue_row_context` (rows unchanged).

**Additive:** Existing CRM fields (`_status_display`, `_primary_contact_line`, etc.) are preserved. Production queue UI does not read `_queue_row_context` yet.

### Not implemented yet

- Child-grain / candidate-grain `row_subject` (Touring per child)
- Subject-scoped attention and work summaries
- `count_unit` on `WorkUnitSurfaceContext`
- `WorkUnitSurfaceContext` wrapper on API responses (rows only today)

---

## API attach points (reference)

| Surface | Status | Payload field |
|---------|--------|---------------|
| Queue list API | **Wired** | `items[]`._queue_row_context |
| Queue summaries | **Wired** | `preview[]`._queue_row_context |
| WU operational bootstrap | Via preview rows | inherits when loader uses `getWorkUnitQueuePreviewRows` |
| VM adapter / layout preview | **Consume** `_queue_row_context` when present | — |
| Attention queue builder | Not wired | future |

---

## Layout Configuration — how to consume

### Runtime payload

Layout runtime may consume **row-level** `_queue_row_context` on queue API items today. Full `WorkUnitSurfaceContext` wrapper is optional — use `buildWorkUnitSurfaceContextFromRows()` when assembling a layout preview page.

**Safe reads today (case-grain partial):**

| Field | Available | Notes |
|-------|-----------|-------|
| `row_subject` | Yes | Always `case` for now |
| `row_stage` | Yes | Queue lane label |
| `row_status_key` / `row_status_label` | Yes | From opportunity row |
| `case_context` | Yes | |
| `primary_contact` | When enriched | |
| `related_subjects_summary` | When `metadata.inquiry_children` | |
| `attention_summary` | When resolver enriched row | |
| `work_summary` | Rare | When `_operational_summary_preview` present |
| `next_best_action` | When BOS preview present | |
| `drawer_open` | Yes | Case drawer + case active_subject |

### System blocks → contract fields

| Block (config key) | Read from | Do not compute in layout |
|--------------------|-----------|---------------------------|
| `lifecycle_visual` | `drawer.active_subject.stage_key` or `row.queue_row_context.row_stage` | Stage from `opportunities.status_key` alone |
| `focused_subject` | `drawer.active_subject` / `row.row_subject` | OCM table joins |
| `family_case_context` | `row.case_context`, `row.primary_contact` | Customer name heuristics |
| `related_subjects_summary` | `row.related_subjects_summary` | `_inquiry_children` parsing |
| `operational_work_summary` | `row.work_summary` | `operational_tasks` queries |
| `attention_summary` | `row.attention_summary` | `resolveOpportunityAttention` |
| `next_best_action` | `row.next_best_action` | BOS catalog rules |
| `readiness_gaps` | `drawer.readiness` | `evaluateOperationalReadiness` |

### Layout Configuration must not

| Forbidden | Why |
|-----------|-----|
| Branch on `entity_type === 'opportunity_customer_members'` in layout JSON | Grain is runtime-resolved |
| Use `opportunities.status_key` as primary queue chip for child-grain rows | Violates status display contract |
| Assume 1 row = 1 household when `count_unit` is children | Mixed households |
| Encode contact attempt 1/2/3 as status chips | Operational work boundary |
| Call readiness evaluator inside layout renderer | Readiness owns evaluation |

### Parallel sprint safety

Layout Configuration **may proceed** using:

- Stubbed `WorkUnitSurfaceContext` in Storybook / fixtures
- `buildPartialQueueRowContext` in devtools or behind optional API flag
- Block placeholders bound to contract field paths above

No queue membership refactor is required to start layout block authoring.

---

## Drawer navigation contract

Queue row click:

1. Open **case drawer** (`drawer_open.entity_type` = `opportunities`)
2. Set **active subject** from `drawer_open.active_subject`
3. Lifecycle visual uses **active subject stage**, not case pipeline status
4. Full family context remains visible (`related_subjects_summary`)

---

## Sample payload (list item excerpt)

```json
{
  "id": "opp-uuid",
  "name": "Smith Household",
  "status_key": "tour_scheduled",
  "_status_display": "Tour scheduled",
  "_primary_contact_line": "Sarah Smith",
  "_queue_row_context": {
    "contract_version": "1.0-partial",
    "row_subject": { "subject_type": "case", "subject_id": "opp-uuid", "display_name": "Smith Household" },
    "row_stage": "Tours",
    "lifecycle_key": "enrollment",
    "row_status_key": "tour_scheduled",
    "row_status_label": "Tour scheduled",
    "case_context": {
      "case_id": "opp-uuid",
      "display_name": "Smith Household",
      "case_type_label": "Enrollment Case",
      "case_status_key": "tour_scheduled",
      "case_status_label": "Active"
    },
    "primary_contact": { "display_name": "Sarah Smith" },
    "related_subjects_summary": [],
    "drawer_open": {
      "entity_type": "opportunities",
      "entity_id": "opp-uuid",
      "active_subject": {
        "subject_type": "case",
        "subject_id": "opp-uuid",
        "lifecycle_key": "enrollment",
        "stage_key": "tours",
        "status_key": "tour_scheduled"
      }
    }
  }
}
```

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/workUnits/buildPartialQueueRowContext.test.ts tests/workUnits/attachQueueRowContextToItems.test.ts
```

---

## Related documents

| Doc | Role |
|-----|------|
| [`status_ownership_and_lifecycle_grain_expansion.md`](../sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md) | Architecture freeze |
| [`workspace-system.md`](./workspace-system.md) | Queue preview semantics |
| [`completed/lifecycle_canonical_vocabulary.md`](../sprints/06_2026/completed/lifecycle_canonical_vocabulary.md) | Operator vocabulary |
