# Surface Command Exposure — investigation (pre-implementation)

**Mission:** Surface Command Exposure Product Realization  
**Branch:** `agent/cursor/1-commands-system-inventory`  
**Reconciliation:** `df12fca95` — merge `origin/staging` (Phase 7 packet/OCR + processing z-index). **No direct overlap** with Surfaces placement, Process Actions, or Commands ownership products.  
**Post-merge regression:** Commands + process authority + BOS slash catalog — **28 files / 278 passed**.  
**Date:** 2026-07-28

---

## Staging reconciliation

| Item | Result |
|------|--------|
| Incoming | Phase 7 document→packet, OCR, forms distribution, processing dialog z-index |
| Surfaces / placements / Commands product files | **No direct path overlap** |
| Conflicts | Mechanical only (`next.config.ts` auto-merged) |
| Semantic stop? | **No** |
| Working tree after merge + `npm install` | Clean |
| Ahead of `origin/staging` | 35 (34 Commands commits + merge) |

---

## Placement storage (existing — no schema migration)

**Table:** `action_placements`

Typical columns used by runtime/settings:

- `org_id` — `null` = platform default; org UUID = organization override
- `action_definition_id` → `action_definitions` (`key`, `label`, `is_active`, `entity_type`)
- `surface` — e.g. `record_header`, `queue_row`, `workspace`, `work_unit`, `department`
- `slot` — e.g. `overflow`, `primary`, `row_inline`
- `entity_type`, `section_key`
- `is_active`, `display_order` / sort fields
- `condition_config` — lifecycle builder marks stage scope / builder provenance

**Runtime consumer:** `resolveActionsForContext` (`web/lib/admin/actions/resolveActionsForContext.ts`) via:

- Focus Panel / drawer: opportunity first-paint deps
- Work Unit rail: `loadRightRailActionsBundleServer` (`placementSurfaces: ["work_unit"]`)
- Workspace: `loadWorkspaceRootActionsServer`

**Writers today:**

| Writer | Path | Authority |
|--------|------|-----------|
| Action Buttons CRUD | `POST/PATCH /api/admin/action-placements` | Developer / low-level |
| Process Actions matrix | `saveLifecycleActionsMatrix` → org defs + placements | Misplaced Surface semantics + enable/label/stage |
| EnrollmentProcessActionsCard | direct placement PATCH | Legacy path |
| Seeds / platform | migrations / platform rows | Platform defaults |

**No stage-owned or WT-owned placement rows** as first-class storage — stage restrictions live in Process Actions `condition_config` / matrix stage sets; WT refs are separate process metadata.

---

## Process Actions vs Surfaces

`LIFECYCLE_ACTION_PLACEMENTS` (`lifecycleStageBaseActions.ts`):

1. Focus Panel Manage → `record_header` / `overflow`
2. Work Unit right rail → `work_unit` / `primary`
3. Workspace → `workspace` / `primary`

`queue_row` is **deprecated** in Process Actions (`normalizeLifecyclePlacementId` → drop).

**Diagnosis:** Placement checkboxes are **Surface presentation**, not process selection semantics. Process-owned pieces to **retain** in Business Processes: enable/disable for process base actions, display label, stage restrictions, and `command_set_v1` stamp on save.

**Slice cleanup rule:** Move operator-facing placement toggles to Surfaces; Process Actions must not remain a second writable placement authority for the same surfaces.

---

## Surfaces product model

| Layer | Location |
|-------|----------|
| Landing | `/organization/surfaces` → `SurfacesLanding` / `surfacesLandingModel.ts` |
| Shell | `SurfacesConfigurationPage` — category rail + collection + workspace tabs |
| Tabs today | `edit` \| `assignments` \| `versions` \| `health` \| `history` |
| Focus Panel editor | `FocusPanelSummarySurfaceEditor` (composition only) |
| Queue Row editor | `QueueRowSurfaceEditor` (process-bound presentation) |
| Workspace editors | `WorkspaceHeaderSurfaceEditor`, `WorkspaceProcessesSurfaceEditor` |

`surfaceComposerPlacementModel.ts` is **field** placement (lines/sections), **not** Command/action placements.

**Smallest fit:** Add a Selected-Surface workspace tab **`commands`** (“Commands”) for Focus Panels, Queue Rows, and Workspaces — contextual exposure editor, not a global catalog.

---

## Candidate set rule (locked)

```text
Organization-supported capability
∩ Business Process command_set_v1 (or approved global when unbound)
∩ stage / WT constraints when Surface context supplies them
```

Surfaces **must not** invent Commands or write `command_set_v1`.

---

## Duplicate placements

Diagnostics already groups via `groupOperationalExposures`. Surface editor must present **one row per (capability × surface exposure)**, collapsing duplicate DB rows; mutations should upsert/activate a single org-owned placement (deactivate extras when toggling off).

---

## Schema migration?

**Not required.** Existing `action_placements` + `action_definitions` represent org exposure. Prefer Surfaces-scoped read/write helpers over new tables.

---

## Recommended first ship

1. **Focus Panel** — Manage menu (`record_header`/`overflow`) with Create Lead as proof.
2. **Queue Row** — `queue_row`/`row_inline` (restore as Surfaces-owned; not Process Actions).
3. **Workspace** — `workspace`/`primary` if process/workspace binding is clean.

Developer path `/adminV2/settings/actions` retained; not operator peer.

---

## Stop conditions checked

- Semantic staging conflict: **none**
- New schema needed: **no**
- Two Surface ownership models: **avoid** by single writable Surfaces editor + Process Actions placement removal
- Runtime consume placements: **already does** via `resolveActionsForContext`

Ready for implementation.
