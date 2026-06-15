# Lifecycle stage setup UX pass v1

**Date:** 2026-05-31  
**Scope:** In-lifecycle stage configuration — compact Required Information, Opportunity-only statuses, work unit create/edit/sync, action placement remove, form unlink.

Related: **`lifecycle_configuration_correction_pass_v1.md`**.

---

## 1. Required Information layout

- Field list scrolls inside `max-h-[220px]` (`lifecycle-field-requirements-scroll`)
- Saved summary compact with `line-clamp-2`
- Conditional rules note uses smaller type

## 2. Status entity simplification

- Removed Person/Child entity selector and “coming soon” options
- Heading: **Opportunity / Lead statuses in this stage**
- Note: person/child statuses managed separately

## 3. In-lifecycle Work Unit

**Component:** `LifecycleStageWorkUnitCard.tsx`  
**API:** `GET|POST|PATCH /api/admin/enrollment-process/stage-work-unit`

- **Create Work Unit** — seeds `enrollment_pipeline` with validated v2 template
- **Save name** — PATCH name
- **Sync queue with stage statuses** — updates lane `filters_compat_v1` / `case_status` from saved stage status mapping (explicit button, never silent)

## 4. Stage status → queue sync

**Lib:** `lifecycleStageQueueSync.ts`  
- `applyStageStatusKeysToQueueDefinition`
- `stageStatusesNeedQueueSync`

Sync applies to lanes in `ENROLLMENT_STAGE_QUEUE_KEYS[stage]`.

## 5. Actions

- `editable=1` on stage-actions includes actions with active placements
- Add placement (surface picker)
- **Remove** placement via DELETE `/api/admin/action-placements/[id]`

## 6. Forms

- Link form (metadata merge)
- **Unlink** from stage
- Coverage against `field_rules` unchanged

## 7. Needs Attention

Unchanged — stage signals + link to Attention & SLA.

---

## QA walkthrough

1. Lifecycle → Enrollment → Enrollment department → Lead  
2. Required Information: Person First Name + Email required (scroll list if needed)  
3. Statuses: assign Lead statuses → Save  
4. Work Queue: Create Work Unit → Sync queue with stage statuses  
5. Actions: Add placement → Remove if needed  
6. Forms: Link form → verify coverage → Unlink optional  

---

## Remaining blockers

1. Waitlist/Enrollment/Enrolled lanes use child/candidate filters — sync updates `filters_compat_v1` only; full grain-aware mapping is future work  
2. Action stage scoping still metadata-driven; placements are not stage-scoped in DB  
3. Per-stage work units (today one `enrollment_pipeline` per department)  
4. Create Lifecycle / Add Stage still disabled  

---

## Validation

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleStageQueueSync.test.ts tests/adminV2/enrollmentProcessHub.test.ts tests/adminV2/lifecycleConfigurationCorrection.test.ts
```
