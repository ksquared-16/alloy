# Lifecycle Builder — UX Coherence Pass 2

**Date:** 2026-05-31  
**Scope:** Process-builder UX — durable lifecycle/stage config, single status summary, compact scrollable cards, clearer operator language.

Related: **`lifecycle_stage_setup_ux_pass_v1.md`**, **`lifecycle_builder_architecture_reality_check_v1.md`**.

---

## Storage (no new SQL tables)

**`departments.metadata.lifecycle_builder_v1`**

```json
{
  "version": 1,
  "active_process_id": "uuid",
  "processes": [
    {
      "id": "uuid",
      "key": "enrollment",
      "name": "Enrollment",
      "primary_entity": "opportunity",
      "sort_order": 0,
      "is_active": true,
      "stages": [
        { "id": "uuid", "key": "lead", "label": "Lead", "sort_order": 0, "is_active": true }
      ]
    }
  ]
}
```

**API:** `GET|PATCH /api/admin/departments/[departmentId]/lifecycle-builder`

PATCH actions: `create_process`, `update_process_name`, `set_active_process`, `add_stage`, `rename_stage`, `reorder_stage`

First GET seeds Enrollment + six platform stages when metadata is absent.

**Future:** Normalize to `lifecycle_processes` / `lifecycle_stages` tables when cross-department or billing pilots need it.

---

## UX changes

| Area | Change |
|------|--------|
| Lifecycle / stages | Create lifecycle, rename, add stage, rename stage, reorder (↑↓) |
| Status display | **Once** in `LifecycleStageSummary`; cards reference summary |
| Operational Queue | Renamed from Work Queue; plain-English queue/sync copy |
| Queue sync helper | “Updates this Work Unit so it includes records with the statuses assigned to this stage.” |
| Actions | Dropdown + Add; **active placements only**; placement labels (Drawer header, Queue row, …) |
| Needs Attention | Plain-English intro + trigger hints + link to Attention & SLA |
| Cards | `max-h-[320px]` + internal scroll on all stage cards |
| Required Information | Compact table rows (Off / Rec / Req) |

---

## Runtime integration notes

- Platform enrollment stage **keys** (`lead`, `qualification`, …) still drive status-stages, field requirements, queue sync, and forms.
- **Custom stages** persist in metadata and appear in tabs; full runtime wiring for custom keys is a follow-up.
- Status-stages API accepts `department_id` and uses configured stage keys from metadata.

---

## QA walkthrough

1. Select department → lifecycle config loads (Enrollment seeded if new)
2. **Create Lifecycle** “Billing” or rename Enrollment
3. **Add Stage** / rename / reorder
4. Select stage → summary shows statuses once
5. Statuses card → assign → Save → summary updates
6. Operational Queue → create → **Update queue filters** with helper text
7. Actions → choose from dropdown → Add → see active list only
8. Forms link + coverage

---

## Remaining blockers

1. Normalized `lifecycle_processes` / `lifecycle_stages` tables
2. Custom stage keys wired through field requirements, queue lanes, forms, actions
3. Primary entity per process (editable)
4. BOS suggestions

---

## Validation

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleBuilderConfig.test.ts tests/adminV2/lifecycleBuilderUxCoherencePass2.test.ts tests/adminV2/enrollmentProcessHub.test.ts
```
