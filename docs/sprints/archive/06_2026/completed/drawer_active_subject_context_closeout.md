# Drawer Active Subject Context — Sprint Closeout

**Date:** 2026-06-06  
**Status:** Closed — queue row → opportunity drawer subject pipe shipped

## Summary

Queue row click from work-unit operational cards now passes `_queue_row_context.drawer_open` into `AdminDrawerContext` as `drawerSubjectContext`. The opportunity VM drawer shell exposes dev/diagnostic data attributes; no full drawer redesign.

## Open path

**Before:** `fireQueueRowOpenRecord` → `open_record` action → `openWorkUnitQueueRecord` → `openDrawer({ type, id, preview seed, navigator })` — no subject focus.

**After:** Same chain; `buildOpportunityDrawerOpenParams` adds `drawerSubjectContext` from `opportunityDrawerSubjectContextFromQueueItem(previewRow)` when `_queue_row_context` is present. Missing context preserves prior behavior.

## Files

| File | Role |
|------|------|
| `web/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext.ts` | Maps `drawer_open` → `DrawerSubjectContext` |
| `web/lib/admin/opportunityDrawerSubjectContextFromQueueItem.ts` | Preview item adapter |
| `web/contexts/AdminDrawerContext.tsx` | `drawerSubjectContext` on open params + drawer state |
| `web/app/adminV2/workspace/dept/.../page.tsx` | Wires context into `openDrawer` |
| `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` | Diagnostic shell attrs |
| `web/components/admin/drawer/EntityDrawerOperatingShell.tsx` | `runtimeShellDataAttributes` |

## Diagnostic attrs (opportunity VM drawer)

- `data-drawer-active-subject-present`
- `data-drawer-active-subject-type`
- `data-drawer-stage-focus-key`
- `data-drawer-subject-focus-mode`
- `data-drawer-active-subject-group-count` (when grouped)

## Remaining (child-grain)

- Honest child/candidate `row_subject` on queue membership (phase 6).
- Drawer lifecycle visual highlight from `active_subject` / group (visual sprint).
- In-drawer queue prev/next should refresh `drawerSubjectContext` per target row when navigator records carry context.

## Tests

```bash
cd web && npm run test -- \
  tests/workUnits/buildDrawerSubjectContextFromQueueRowContext.test.ts \
  tests/admin/adminV2QueueRowClick.test.ts
```

## Forward

Child-grain membership + honest `row_subject` — design gate [`child_grain_queue_conversion_design.md`](../child_grain_queue_conversion_design.md); implementation phases A–F after merge.

## Suggested commit message

```
feat(adminV2): pass queue row drawer_open subject context to opportunity drawer

Wire _queue_row_context.drawer_open through openDrawer params and VM shell
diagnostics; preserve legacy open when context is absent.
```
