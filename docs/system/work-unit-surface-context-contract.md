# Work Unit Surface Context — Developer Contract

**Status:** Contract frozen — **partial API wiring shipped** (case-grain rows only)  
**Architecture:** [`status_ownership_and_lifecycle_grain_expansion.md`](../sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md), [`entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md), [`enrollment_lifecycle_status_matrix_contract.md`](../sprints/06_2026/enrollment_lifecycle_status_matrix_contract.md)  
**Types:** `web/lib/workUnits/`  
**Contract version:** `1.1-partial` (grouped same-stage rows — optional fields; backward compatible with `1.0-partial`)

---

## Purpose

Layout Configuration and AdminV2 work-unit surfaces need a **stable, grain-aware runtime payload** without embedding enrollment-specific branching in layout JSON.

This module is the **runtime output** of the domain contract in [`entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) §7 — Lifecycle Builder configures stages and grains; queue membership resolves subjects; this layer normalizes **`QueueRowContext`** for layout blocks and drawer VM.

Platform code resolves:

- **Which lifecycle subject** caused queue membership (usually OCM enrollment track)
- **How to label** the row (**enrollment stage** + case context — not child identity status)
- **How to open** the drawer (case shell + active subject focus)
- **What context** siblings and summaries provide (including redaction)

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
| `SubjectPlacementContext` | Location/program/room on row subject (OCM) — optional until phase 1 |
| `RelatedSubjectVisibility` | `full` \| `redacted` \| `hidden` for cross-site siblings |
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
- Grouped same-stage rows (`row_subjects`, `active_subject_group`) — types documented § grouped rows
- **Partial** `placement_context` on case-grain rows when `_inquiry_children` placement is deterministic (see § placement_context)
- Full child-grain `placement_context` (per active OCM subject) — later
- `visibility` / `location_id` on `related_subjects_summary` (access redaction — phase 7)
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
| `related_subjects_summary` | When `metadata.inquiry_children` | `visibility` / location fields not populated yet |
| `placement_context` | **Partial** — when one child or all children share same OCM placement in `_inquiry_children` | Full per-child when `row_subject` is honest child grain |
| `related_subjects_summary[].location_label` etc. | When inquiry child rows carry labels | Program/room/schedule labels additive |
| `attention_summary` | When resolver enriched row | |
| `work_summary` | Rare | When `_operational_summary_preview` present |
| `next_best_action` | When BOS preview present | |
| `drawer_open` | Yes | Case drawer + case active_subject |

### System blocks → contract fields

See entity contract §7.5 for full integration mapping. Summary:

| Block (config key) | Read from | Do not compute in layout |
|--------------------|-----------|---------------------------|
| `focused_subject` | `drawer.active_subject` / `row.row_subject`, `placement_context` | OCM table joins |
| `lifecycle_visual` | `drawer.active_subject.stage_key` or `row.row_stage` | Stage from `opportunities.status_key` alone |
| `status_chip` | `row_status_label` or `case_context.case_status_label` (per block `subject_scope`) | Infer scope from entity type in layout |
| `family_case_context` | `row.case_context`, `row.primary_contact` | Customer name heuristics |
| `related_subjects_summary` | `row.related_subjects_summary` | `_inquiry_children` parsing; respect `visibility` |
| `location_program_room` | `row.placement_context` | `opportunities.location_id` for child lanes |
| `operational_work_summary` / `work_summary` | `row.work_summary` | `operational_tasks` queries |
| `attention_summary` | `row.attention_summary` | `resolveOpportunityAttention` |
| `next_best_action` | `row.next_best_action` | BOS catalog rules |
| `readiness_gaps` | `drawer.readiness` | `evaluateOperationalReadiness` |

### Layout Configuration must not

| Forbidden | Why |
|-----------|-----|
| Branch on `entity_type === 'opportunity_customer_members'` in layout JSON | Grain is runtime-resolved |
| Use `opportunities.status_key` as primary queue chip for child-grain rows | Violates status display contract |
| Assume 1 row = 1 household when `count_unit` is children | Mixed households; same-stage siblings may share one grouped card but count N tracks |
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

Entity contract §7.4 — queue row click:

1. Open **case drawer** (`drawer_open.entity_type` = `opportunities`)
2. Set focus from `drawer_open`:
   - **Single row:** `active_subject` (matches `row_subject` when child/candidate grain is honest)
   - **Grouped row:** `active_subject_group` + optional `stage_focus_key`; default highlight all group members; child line click sets `active_subject` to that child
3. Lifecycle visual uses **active subject stage** (shared for group), not case pipeline status
4. Location/program/room blocks use **active subject `placement_context`** (single focus); multi-child placement may show first subject or per-child in children block
5. Family context via `related_subjects_summary` — siblings **outside** the focused group; **redacted** entries pre-resolved before layout render

---

## `placement_context` — partial case-grain bridge (shipped)

**Adapter:** `buildPartialQueueRowContext` in `web/lib/workUnits/buildPartialQueueRowContext.ts`

**Data source:** Enriched opportunity queue row `_inquiry_children` (or `metadata.inquiry_children`) after `enrichOpportunityRows` + `hydrateQueueRowInquiryChildrenPersonIds`. Fields read per child:

| `placement_context` field | Inquiry child source |
|---------------------------|----------------------|
| `location_id` | `location_id` |
| `location_label` | `location_label` |
| `program_key` | `desired_program_type` |
| `program_label` | `desired_program_label` or humanized program key |
| `room_id` | `program_room_cohort_key` |
| `room_label` | `program_room_cohort_label` |
| `schedule_key` | `desired_schedule_type` |
| `schedule_label` | `desired_schedule_label` or humanized schedule key |

**Row-level `placement_context` rules (case-grain):**

| Children on row | `placement_context` |
|-----------------|---------------------|
| None / no placement fields | Omitted |
| One child with placement | That child's placement |
| Multiple children, **identical** placement keys | Shared placement |
| Multiple children, **distinct** placements | **Omitted** — do not guess |

`row_subject` remains `case`. `related_subjects_summary[]` carries per-child `location_label`, `program_label`, `room_label`, `schedule_label` when present on inquiry child rows.

**Not in this bridge:** `opportunities.location_id` as child placement; OCM batch without inquiry_children metadata; access redaction `visibility`; child-grain rows with subject-scoped placement.

### Sample (single child)

```json
{
  "placement_context": {
    "location_id": "loc-north",
    "location_label": "North Campus",
    "program_key": "infant",
    "program_label": "Infant",
    "room_id": "cohort-infant-a",
    "room_label": "Infant A",
    "schedule_key": "full_time",
    "schedule_label": "Full time"
  }
}
```

---

## Grouped rows — same case + same enrollment stage

**Doctrine:** [`entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) §3.3–§3.4 · [`enrollment_lifecycle_status_matrix_contract.md`](../sprints/06_2026/enrollment_lifecycle_status_matrix_contract.md) §4.1.

### Problem

Smith Household: Child A and Child B both **Tour**; Child C **Enrolled**. Tour lane membership matches **two** OCM tracks. Count truth = **2**; UX may show **one household card**.

### Data vs presentation

| Layer | Rule |
|-------|------|
| Membership SQL / resolver | Two matching enrollment tracks — do not collapse to one opportunity row in membership truth |
| Lane total count | **2** when `count_unit` = `children` or `enrollment_track` |
| Queue list renderer | May emit **one** `QueueRowContext` with `row_presentation_mode: grouped_subjects` **or** two contexts with `single_subject` |

### Target `QueueRowContext` fields (grouped)

| Field | Role |
|-------|------|
| `row_presentation_mode` | `single_subject` (default when omitted) \| `grouped_subjects` |
| `row_subject` | Primary presentation identity — for grouped rows: household label or first child; **do not** imply sole membership |
| `row_subjects` | All OCM tracks in the group (e.g. Child A + Child B) |
| `row_grouping_key` | Stable group id: `{case_id}:{stage_key}` + optional location/program scope suffix |
| `row_count` | Number of enrollment tracks in this presentation row (2 for A+B) |
| `row_count_unit` | `enrollment_track` (preferred for child lanes) \| `cases` \| `children` \| `candidates` |
| `row_stage` | Shared enrollment stage label (Tour) |
| `related_subjects_summary` | Siblings **not** in `row_subjects` (e.g. C — Enrolled) |
| `drawer_open.active_subject_group` | `LifecycleSubjectRef[]` for group open |
| `drawer_open.active_subject` | Optional default single focus (e.g. first in group or last clicked) |
| `drawer_open.stage_focus_key` | Builder `stage_key` when opening from grouped card (`tour`) |

### Drawer / layout (grouped)

| Block | Grouped behavior |
|-------|------------------|
| `focused_subject` | “2 children — Tour” (not “Child A — Tour” only) |
| `lifecycle_visual` | Shared stage **Tour** |
| `related_subjects_summary` | C — Enrolled; A/B highlighted in children block |
| `status_chip` | Stage-level or aggregate — not one child’s disposition only |

### Sample grouped excerpt

```json
{
  "contract_version": "1.1-partial",
  "row_presentation_mode": "grouped_subjects",
  "row_subject": { "subject_type": "case", "subject_id": "opp-smith", "display_name": "Smith Household" },
  "row_subjects": [
    { "subject_type": "child", "subject_id": "ocm-a", "display_name": "Child A" },
    { "subject_type": "child", "subject_id": "ocm-b", "display_name": "Child B" }
  ],
  "row_grouping_key": "opp-smith:tour:loc-1",
  "row_count": 2,
  "row_count_unit": "enrollment_track",
  "row_stage": "Tour",
  "row_status_label": "Tour",
  "related_subjects_summary": [
    { "subject_type": "child", "subject_id": "ocm-c", "display_name": "Child C", "status_label": "Enrolled" }
  ],
  "drawer_open": {
    "entity_type": "opportunities",
    "entity_id": "opp-smith",
    "stage_focus_key": "tour",
    "active_subject_group": [
      { "subject_type": "child", "subject_id": "ocm-a", "lifecycle_key": "enrollment", "stage_key": "tour", "status_key": "tour_scheduled" },
      { "subject_type": "child", "subject_id": "ocm-b", "lifecycle_key": "enrollment", "stage_key": "tour", "status_key": "tour_scheduled" }
    ]
  }
}
```

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
    "contract_version": "1.1-partial",
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
| [`status_ownership_and_lifecycle_grain_expansion.md`](../sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md) | Lifecycle subject + queue row context |
| [`entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) | Status vocabulary, location scope, redaction |
| [`workspace-system.md`](./workspace-system.md) | Queue preview semantics |
| [`completed/lifecycle_canonical_vocabulary.md`](../sprints/06_2026/completed/lifecycle_canonical_vocabulary.md) | Operator vocabulary |
