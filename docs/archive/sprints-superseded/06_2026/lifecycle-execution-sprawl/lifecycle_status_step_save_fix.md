# Lifecycle Status Step Save Fix

**Sprint:** June 2026  
**Status:** Implemented

## Problem

On the Statuses step (step 3), users could select statuses but **Save & continue** stayed disabled until they clicked a separate **Save statuses** button. That duplicate control was confusing, and activation `status_keys` sometimes did not persist because `saveActivation` ignored failed PATCH responses.

## Root cause

`canContinueToWorkUnitQueue()` required `savedCount >= 1` and `!draftDirty`. Selecting statuses made the draft dirty, which **disabled** Save & continue until the inner save ran first.

## Fix

1. **Single primary action:** Removed the inner **Save statuses** button from `LifecycleActivationStatusesStep`. Only **Save & continue** on `LifecycleActivationWizardNav` persists and advances.

2. **`canConfirmStatusesStep()`:** Enabled when `draftCount >= 1` (and not loading/saving). Dirty draft is allowed — save happens on confirm.

3. **`confirmStatusesAndContinue()`:** Calls `saveStageStatuses()` → `PATCH /api/admin/enrollment-process/status-stages` with `department_id`, `stage`, `status_keys` → syncs local state → `saveActivation` with `completed_steps: 3` → `loadPipeline()` → `setStep(4)`.

4. **`saveActivation`:** Now checks `res.ok` and surfaces errors (activation bundle must include `status_keys` / `status_labels`).

5. **Post-save validation:** After PATCH, verifies `stageSavedStatusKeys(payload, stageKey)` is non-empty so misconfigured `stageKey` fails loudly.

## API path

| Action | Endpoint |
|--------|----------|
| Load statuses | `GET /api/admin/enrollment-process/status-stages?department_id={runtimeDepartmentId}` |
| Save stage statuses | `PATCH /api/admin/enrollment-process/status-stages` body: `{ department_id, stage, status_keys }` |
| Activation bundle | `PATCH /api/admin/departments/{runtimeDepartmentId}/lifecycle-activation` |

## Tests

- `web/tests/lifecycle/lifecycleActivationStep3.test.ts`
- `web/tests/lifecycle/lifecycleStatusStepSaveFix.test.ts`

```bash
cd web && npm run test -- tests/lifecycle/lifecycleActivationStep3.test.ts tests/lifecycle/lifecycleStatusStepSaveFix.test.ts
```
