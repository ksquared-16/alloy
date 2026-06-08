# Lifecycle validation filters + description fix

**Sprint:** 06/2026  
**Status:** Implemented

## Problem

Builder-owned lifecycles showed work units on `/workspace` and `/dept`, but runtime validation still failed **Queue filters connected** and **Records matched** because checks targeted a single activation `work_unit_id` / legacy `enrollment_pipeline` assumptions.

Operators also needed optional lifecycle descriptions on workspace tiles.

## Solution

### Lifecycle description (create + edit)

- **Create Lifecycle** form: optional description, max **120** characters, character count, helper “Shown on the workspace tile.”
- **Edit lifecycle** modal: name + description; persists via `update_process_description` on lifecycle builder config and syncs `departments.description` through existing builder save path.
- **Workspace tile**: uses `departments.description` (synced from process description). Fallback: process name, then “Configured lifecycle workspace.”

### Runtime validation — queue filters

- For **builder-owned** departments: validate each `lifecycle_wu_*` row against that stage’s selected statuses (explicit status-stage assignments, activation bundle, or work unit metadata).
- Compare normalized status keys using `queueStatusKeysForStageWorkUnitSnapshot` — same path as `/work-unit` queue runtime.
- Do **not** require legacy `enrollment_pipeline` lane filters.

New server check: `work_unit_queue_filters`.

### Runtime validation — records query

- New server check: `work_unit_records_query`.
- **Pass** when the opportunities count query succeeds.
- **Count = 0** → pass with informational copy:  
  “No records match these statuses yet. Create or update a record with one of these statuses to see rows.”
- **Fail** only on query errors or invalid filter configuration (not zero rows).

Compact UI row renamed to **Records query ready** (shows **Info** when zero matches).

### Future helper (not built)

Documented for a later sprint: **Create sample record** matching the active stage’s statuses.

## Key modules

- `web/lib/lifecycle/lifecycleWorkUnitQueueValidation.ts` — shared filter + records semantics
- `web/lib/lifecycle/validateLifecycleActivationRuntime.ts` — multi `lifecycle_wu_*` validation
- `web/lib/lifecycle/lifecycleActivationValidationCompact.ts` — compact operator rows
- `web/lib/lifecycle/lifecycleBuilderConfig.ts` — `LIFECYCLE_DESCRIPTION_MAX_CHARS`, tile copy
- `web/components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleRenameModal.tsx`

## Tests

`web/tests/lifecycle/lifecycleValidationFiltersDescription.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleValidationFiltersDescription.test.ts
```
