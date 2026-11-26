# Rooms certification

**Status:** Certified and frozen for Configuration Runtime V1.

## Alloy translation

- The room collection supports selection; the selected room owns the workspace.
- Rows show room identity, Active/Inactive state, and one setup signal: capacity, missing program, or missing staffing.
- Active room identity uses Bend Pine and the canonical selected queue-row treatment; inactive rooms remain muted.
- Add Room opens a focused creation editor in the detail region. It does not create an unnamed placeholder row.
- View mode answers capacity, program participation, staffing thresholds, age range, inherited hours, active state, and setup attention.
- Edit mode replaces the read summary and groups Identity, Program participation, Capacity, Staffing thresholds, Age range, Hours/operating behavior, and Active state.
- No generic Relationships section is rendered.

## Persistence matrix

- Create room: response PASS; local list PASS; hard refresh PASS.
- Name: PATCH response PASS; local detail PASS; hard refresh PASS.
- Program: metadata response PASS; editor hydration PASS; hard refresh PASS.
- Capacity: metadata response PASS; room and Overview summaries PASS; hard refresh PASS.
- Staffing thresholds: metadata response PASS; read summary PASS; hard refresh PASS.
- Age-range start/end/unit: metadata response PASS; read summary PASS; hard refresh PASS.
- Active state: boolean response PASS; row/status PASS; hard refresh PASS.
- Acceptance records were deleted after verification.

## Evidence

- `screenshots/rooms-view.png`
- `screenshots/rooms-edit.png`
- `screenshots/rooms-create-flow.png`
- `screenshots/125-rooms-view-final.png`
- `screenshots/126-rooms-edit-final.png`
- `screenshots/127-rooms-create-final.png`
