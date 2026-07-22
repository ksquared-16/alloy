# Organization Configuration Final Convergence — Closeout

Date: 2026-07-22  
Worktree: `wt4-org-runtime-realization`  
Base: `c7653fefa` (offering truth + Scheduling composition)

## Promotion recommendation

**Recommend staging promotion** of the Organization Configuration Runtime stack (Programs + Locations + Rooms + Scheduling configuration) after Kelly review of evidence.

Gates met:
- Programs: no Configure buttons; collection → selected → edit
- Program stop-offering: soft `is_active=false` (no highlighted-fields error)
- Scheduling: catalog pattern + shared VM; Operating days ~49ms
- Rooms unchanged master-detail

Do **not** continue into Scheduling runtime or Dimensions in this lane.

## Program interaction cleanup

`LocationProgramsOfferedPanel` rewritten to Rooms parity:
- Left: offered Programs (+ Not offered subsection)
- Right: selected Program workspace (Availability, Name, Eligible Rooms, Eligible Patterns)
- `Edit Program` / `Stop offering` / `Offer again`
- Add Program remains in-place create detail
- URL owns Location; Program selection remembered locally via continuity (no forced concern item URL push on select)

## Program removal bug — root cause

Uncheck used `POST remove_locations` hard-DELETE on `location_program_categories`.

When enrollments or other FKs referenced the LPC row, Postgres constraint errors were mapped by `operatorProgramError` via `/foreign key|constraint/` →  
“We could not save this Program. Review the highlighted fields and try again.”

Also: API returned `200 + blocked[]` for enrollment blocks without the Location UI reading `blocked`.

**Fix:** Stop offering uses soft deactivate `PATCH is_active: false` (canonical Not offered).  
Operator error mapping improved for enrollment/FK cases.

## Scheduling VM ownership

`useLocationSchedulingVm` + module cache `dayTypesCacheByOrg`:
- Location select warms Day Types via `warmLocationSchedulingDayTypes(orgId)`
- Sub-tabs consume shared config + org Day Types — no independent cold fetches
- Operating days / Hours / Schedule Types from Location metadata (`location_scheduling_v1`)
- Patterns remain `schedule_patterns` rows from Locations collection load

## Scheduling collection pattern

Sub-nav: Patterns | Day Types | Schedule Types | Hours | Operating days  
Each vocabulary (except Operating days) uses `ConfigChildObjectMasterDetail`:
collection → selected → edit

## Configurable Day Types

Org option set `childcare_schedule_type`:
- add / rename / archive (metadata.archived) / reorder
- Location enablement toggles

## Configurable Schedule Types

Location catalog; create with bounded behavior templates `continuous | rotating`; rename label; archive. Behavior immutable after create.

## Configurable Hours

Location Time Windows catalog: add / edit / archive. Patterns may still use custom hours.

## Instant Operating Days

No fetch — metadata only. QA: **49ms** open.

## Validation

- `npm run typecheck` — pass
- Focused tests — pass (`configurationRuntimeLocations`, offering/scheduling model, removal errors)
- Auth QA — `.alloy-agent-evidence/org-config-convergence/`

## Evidence

- `01-programs.png` / `01b-programs-selected.png`
- `02-stop.png`
- `03-scheduling.png` … `05-*.png`
- `06-rooms.png`
- `qa-report.txt`
