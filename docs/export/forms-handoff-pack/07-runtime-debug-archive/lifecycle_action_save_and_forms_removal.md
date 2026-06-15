# Lifecycle Builder — Action Save Fix & Forms Card Removal

**Path:** `docs/sprints/06_2026/lifecycle_action_save_and_forms_removal.md`  
**Date:** 2026-05-31  
**Status:** Implemented

## Problem

1. **Save Action** failed with `Unknown base action` when choosing **Create Lead** (`create_record`).
2. No clear success feedback after save; form did not feel confirmed.
3. **Save Action** lived inside the scrollable card body instead of the fixed footer used by other guided cards.
4. **Form Coverage** on the main guided board duplicated Forms settings ownership.

## Root cause

`POST /api/admin/enrollment-process/stage-actions` validated `base_action_key` with `lifecycleActivationBaseActionByKey` (includes `create_record` → `create_lead`), but `ensureOrgLifecycleActionDefinition` resolved keys with `lifecycleBaseActionByKey`, which only knows curated actions and **excludes** `create_record`.

## Fix

| Area | Change |
|------|--------|
| `ensureOrgLifecycleActionDefinition.ts` | Use `lifecycleActivationBaseActionByKey` for all base keys |
| `lifecycleStageBaseActions.ts` | Add **Message** (`quick_message` → `quick_message`); rename labels (Add Parent, Update Status) |
| `LifecycleBuilderActionsCard.tsx` | Updated copy; success banner; removed inline Save button |
| `LifecycleStageGuidedBoard.tsx` | **Save Action** in card footer; removed Forms card; no auto-advance after save |
| `LifecycleActivationBoard.tsx` | `setActionFeedback("Action added")` on success; keep form on error |

## UX

- **Success:** `Action added` status in Actions card; configured list refreshes via stage bootstrap; Add Action form resets; user stays on Actions card.
- **Failure:** Specific API error in card; form values preserved.
- **Footer:** `data-testid="lifecycle-guided-save-actions"` — primary Save Action pinned like other cards.

## Forms

Form Coverage removed from the main Lifecycle Builder guided board. Forms are configured in **Forms** with intent (e.g. Create Lead), lifecycle, and stage; coverage validation remains in the forms product surface.

## Tests

`web/tests/lifecycle/lifecycleActionSaveAndFormsRemoval.test.ts` — base action mapping, ensure resolver, footer placement, forms removal, success/reset behavior.

## Follow-ups

- Pass `primaryRecordLabel` from department metadata into `ensureOrgLifecycleActionDefinition` for customized Create Lead labels.
- Optional: hide base actions when platform `action_definitions` row is missing for org.
