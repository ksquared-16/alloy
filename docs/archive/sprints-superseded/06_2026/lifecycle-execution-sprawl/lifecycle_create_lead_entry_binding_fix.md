# Lifecycle Create Lead entry binding fix

**Sprint:** 06/2026  
**Status:** Implemented

## Problem

`resolveLifecycleCreateLeadBinding()` used `departments.metadata.lifecycle_activation_v1.stage_key` — the last stage selected in Settings activation — to pick work unit and status for Create Lead.

That caused:

- Create Lead routing to `lifecycle_wu_qualification` with `qualification` when activation was saved on the Qualification step
- Stale/inconsistent activation blobs (e.g. `stage_key: lead` with Qualification `status_keys`)
- Lead Management queues showing 0 rows while org had `new_inquiry` records on legacy Enrollment `enrollment_pipeline`

## Database truth (Lead Management)

- Department: `3933ac47-077a-4de8-aaac-8aed48d80413`
- Active WUs: `lifecycle_wu_lead` (`new_inquiry`), `lifecycle_wu_qualification` (`qualification`, `contact_attempted`)
- 17 org `new_inquiry` rows — all on Enrollment dept pipeline `5ba90557-…`, **0** on Lead Management WUs

## Solution

### Create Lead binding (`lifecycleCreateLeadEntryBinding.ts`)

For builder-owned lifecycles:

1. Load active process stages from `lifecycle_builder_v1`
2. Load status stage mappings + `lifecycle_wu_*` rows (metadata + `queue_definition`)
3. Find first active stage whose configured statuses include `NEW_LEAD_STATUS_KEY` (`new_inquiry`)
4. Resolve `work_unit_id` via `loadLifecycleStageWorkUnitForDepartment` → `lifecycle_wu_{stageKey}`
5. Always set `status_key = new_inquiry` for Create Lead

Fallback: first active stage by `sort_order` if no stage owns `new_inquiry`.

`lifecycle_activation_v1` is **not** used for work unit or status selection (returned on binding for Settings context only).

### Legacy departments

Non–builder-owned departments keep prior activation / pipeline fallback in `resolveLifecycleCreateLeadBinding()`.

### Records

- No auto-migration of Enrollment pipeline records
- Manual attach remains: `POST /api/admin/lifecycle-catalog/attach-records`

### Validation / empty copy

`LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY`:

> No records belong to this lifecycle yet. Create a Lead from this lifecycle to see it here.

Used when builder-owned validation finds zero records in lifecycle department scope.

## Key modules

- `web/lib/lifecycle/lifecycleCreateLeadEntryBinding.ts`
- `web/lib/lifecycle/lifecycleRuntimeBinding.ts` — delegates builder-owned path
- `web/lib/admin/actions/entryLifecycleActions.ts` — consumes binding

## Tests

- `web/tests/lifecycle/lifecycleCreateLeadEntryBinding.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleCreateLeadEntryBinding.test.ts
```
