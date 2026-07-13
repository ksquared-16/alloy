# Current Work Focus Workspace — Certification

## Product model

- Summary workspace keeps configured identity cards (Current Work, Household, Children, Billing Preview, …).
- Current Work summary card remains compact.
- Opening Current Work replaces the Focus Panel card grid with `CurrentWorkWorkspace` (not a modal / centered elevated card).
- Back restores the prior summary composition and selected record.
- Summary card and workspace share `buildCurrentWorkSurfaceVM` / action planner; no second resolver or requirement engine.

## Action execution matrix (enrollment fixture + planner)

| Action | Surface | Status |
| --- | --- | --- |
| Contact Family / primary communication | `communications_composer` or `header_delegate` | EXECUTABLE |
| Schedule Tour | `inline_form` (embedded tour schedule) | EXECUTABLE |
| Send Form | `header_delegate` → registry | EXECUTABLE |
| Add Child | `header_delegate` → registry | EXECUTABLE |
| Add Family Member | `header_delegate` → registry | EXECUTABLE |
| Create Task | `header_delegate` → registry | EXECUTABLE |
| Record Outcome | outcome picker + completion path | EXECUTABLE |
| Other Transitions | `process_transition` preflight + reconciliation + PATCH | EXECUTABLE |
| Unsupported / unknown | omitted or blocked with reason | NOT silent no-op |

Planner: `planCurrentWorkActionExecution` / `resolveCurrentWorkActionSurface`.

## Billing / non-enrollment

- Same workspace + planner.
- Collect Payment helpful actions only (no childcare Schedule Tour / Add Child leakage in billing fixture).
- Other Transitions only when process outgoing edges exist.

## Evidence

Fixture: `evidence/workspace-fixture.html`

Screenshots:

1. `01-summary-1280x720.png`
2. `02-summary-1440x900.png`
3. `03-workspace-1280x720.png`
4. `04-workspace-1440x900.png`
5. `05-workspace-1680x1050.png`
6. `06-workspace-125pct.png`
7. `07-back-to-summary.png`

## Automated tests

- `tests/adminV2/runtime/currentWorkFocusWorkspace.test.tsx`
- Existing Current Work / Focus Panel canvas suites updated for workspace elevation policy

## Intentional limitations

- Browser evidence uses a structural fixture that mirrors acceptance layout; full live-tenant click matrix depends on local auth/env and was validated via unit planner + registry surface wiring.
- Workspace footer owner label is reserved; stage uses published process stage key when available.
