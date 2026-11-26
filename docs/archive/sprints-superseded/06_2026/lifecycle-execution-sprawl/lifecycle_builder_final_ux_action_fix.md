# Lifecycle Builder — Final UX Compression + Action Save Fix

**Path:** `docs/sprints/archive/06_2026/lifecycle_builder_final_ux_action_fix.md`  
**Date:** 2026-05-31  
**Status:** Implemented

## Goals

Final cleanup before full lifecycle configuration test — no new features, BOS, or orchestration.

## 1. Compressed header (`/settings/lifecycle`)

- Page title **Lifecycle** + one-line subtitle (`text-lg` / `text-xs`).
- `SETTINGS_PAGE_SHELL_COMPACT_CLASS` — reduced vertical spacing.
- Removed long intro mentioning Advanced Configuration from page header.
- Removed duplicate “configure lifecycle…” paragraph from primary shell.
- **Advanced configuration** — text link below builder (not prominent tab bar).

## 2. Lifecycle selector

- Dropdown + **Create Lifecycle** secondary button (`border-alloy-forge/20`, not dashed).
- Removed `+ New Lifecycle` oversized dashed control.

## 3. Stage tabs

- Unchanged primary nav under selected lifecycle: `Lead | … | + Add Stage`.
- **More** menu (Rename, Delete, Repair workspace, runtime status) — secondary, not in main header.

## 4. Card copy (short summaries)

| Card | Summary |
|------|---------|
| Required Information | Fields needed before work can move forward. |
| Statuses | Statuses included in this stage. |
| Work Unit Queue | Queue records by selected statuses. |
| Actions | Actions operators can use from workspace surfaces. |
| Runtime Validation | Workspace visibility checks. |

Removed guided-board intro paragraph and wordy in-card helper text.

## 5–7. Action save

| Fix | Detail |
|-----|--------|
| Unknown base action | `ensureOrgLifecycleActionDefinition` uses `lifecycleActivationBaseActionByKey` (includes `create_record`). |
| Saveable dropdown | `filterSaveableLifecycleBaseActions` in stage bootstrap — only keys with platform `action_definitions`. |
| POST guard | Route rejects unknown keys and missing platform definitions; passes `department_id` + `primary_record_label`. |
| Success UX | “Action added”, list refresh, form reset, stay on Actions card. |
| Footer | **Save Action** in guided card footer (outside scroll). |

## 8. Forms

Form Coverage card remains **off** the main guided board.

## Tests

`web/tests/lifecycle/lifecycleBuilderFinalUxActionFix.test.ts`

## Files (primary)

- `web/app/adminV2/settings/lifecycle/page.tsx`
- `web/components/adminV2/settings/LifecycleSettingsShell.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleCatalogSelect.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx`
- `web/lib/lifecycle/filterSaveableLifecycleBaseActions.ts`
- `web/lib/lifecycle/loadPlatformActionDefinitionForOrg.ts`
- `web/app/api/admin/enrollment-process/stage-actions/route.ts`
