# Drawer Subject Display + Lifecycle Visual Consumption — Closeout

**Date:** 2026-06-06  
**Status:** Closed

## Summary

Opportunity VM drawer now **consumes** `drawerSubjectContext` for visible queue-row focus when `focus_mode` is `subject_highlight` or `subject_group_highlight`. Case-grain opens (`case_default`) keep existing header/status behavior.

## Visible behavior

| Context | UI |
|---------|-----|
| **No context** | Unchanged drawer |
| **case_default** | Unchanged; diagnostic attrs only on shell |
| **subject_highlight** (child/candidate) | “Queue focus” strip + lifecycle rail stage override + inquiry child row highlight |
| **subject_group_highlight** | Strip e.g. “2 children — Tours” + rail override + multi-row highlight |

## Files

| File | Role |
|------|------|
| `web/lib/admin/drawer/resolveDrawerSubjectFocusPresentation.ts` | Strip label, highlight ids, rail override flag |
| `web/lib/admin/drawer/applyDrawerSubjectStageFocusToLifecycleRailModel.ts` | Stage focus on lifecycle rail |
| `web/components/admin/vmDrawer/OpportunityDrawerSubjectFocusStrip.tsx` | Focus strip UI |
| `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` | Strip + rail zone + merged diagnostics |
| `web/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx` | Pass highlight ids to children |
| `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx` | Row highlight styling |
| `web/lib/admin/opportunityDrawerQueueNavigator.ts` | Navigator records carry `drawer_subject_context` |
| `web/contexts/AdminDrawerContext.tsx` | Prev/next applies subject context from navigator |
| `web/lib/workUnits/lifecycleSubjectContracts.ts` | Additive `stage_focus_label` on `DrawerSubjectContext` |

## Diagnostics (shell + strip)

- `data-drawer-subject-focus-visible`
- `data-drawer-stage-focus-key`
- `data-drawer-active-subject-type` / `data-drawer-active-subject-id`
- `data-drawer-active-subject-group-count`
- `data-drawer-highlight-subject-ids`
- `data-inquiry-child-queue-subject-focus` on highlighted child rows

## In-drawer navigation

- Navigator built from display items includes `drawer_subject_context` per row.
- Prev/next sets `drawerSubjectContext` from target navigator record; clears when record has no context.
- Stack restore preserves `drawerSubjectContext`.

## Remaining gaps

- Production queue rows are still **case-grain** — strip/rail override rarely activates until child-grain rows or synthetic test context.
- Case status chip unchanged (intentional — case remains secondary when child focus ships).
- Stage label on strip uses `row_stage` / humanized key — not full enrollment disposition matrix.

## Tests

```bash
cd web && npm run test -- \
  tests/admin/drawerSubjectFocusPresentation.test.ts \
  tests/workUnits/buildDrawerSubjectContextFromQueueRowContext.test.ts
```

## Next recommended sprint

**Child-grain queue rows (phase 6)** — honest `row_subject` per OCM/candidate so queue open + drawer focus reflect real child membership.

## Suggested commit message

```
feat(adminV2): consume drawer subject context in lifecycle strip and child highlights

Show queue-focus strip and lifecycle stage override for child/group subject
context; carry subject context through in-drawer queue navigation.
```
