# Lifecycle Required Info, Queue Save, Scroll Polish

**Path:** `docs/sprints/06_2026/lifecycle_required_info_queue_scroll_polish.md`  
**Date:** 2026-05-31  
**Status:** Implemented

## Changes

### 1. Required Information copy

- Removed conditional rules note (“Email or Phone” / “DOB or Age Group”…).
- Card summary remains: “Fields needed before work can move forward.”
- Guided mode drops extra in-card headings/helper paragraphs.

### 2. Entity selector

- Replaced Person / Child / Opportunity / Customer **tabs** with **Entity** `<select>` (`lifecycle-field-entity-select`).

### 3. Child field audit

- `docs/sprints/06_2026/lifecycle_required_info_child_fields_audit.md`
- Code comment in `lifecycleFieldPaletteMerge.ts`

### 4. Work Unit Queue — one save

- `LifecycleStageWorkUnitCard` `guidedMode`: hides inner Save name / Create buttons.
- Card footer **Save Work Unit Queue** calls imperative `save()` (create or PATCH name) then `onPipelineUpdated`.

### 5. Scroll UX

- Guided card bodies: `overscroll-contain` + `[overscroll-behavior:contain]`.
- Removed extra nested scroll wrappers on guided cards (required, statuses, queue, validation).
- Field list in guided mode: no inner `max-h` scroll — card body scrolls as one region.

## Tests

`web/tests/lifecycle/lifecycleRequiredInfoQueueScrollPolish.test.ts`
