# BP V2 D8: opening a record is passive (local certification)

| | |
|---|---|
| Base | lane `808c9a242` = staging `1e4bc8877` + D2/D5 evidence |
| Hosted defect | D4 hosted QA (`qar_83fecf2e96b1`, `d4/HOSTED-QA.md`): opening the closed/lost readiness family (one child, no assignment) showed an Assignments **"Create Assignment — configure the minimum."** editor over the Focus Panel with no click (`closed-record-director.png`). Admin and Director were both affected; nothing was written |
| Not hosted evidence | Hosted proof is recorded separately |

## Root cause (traced, not assumed)

The flow runs Work View → record → Focus Panel → Scheduling card → `ScheduleWorkSurface`.

1. **Single-subject auto-open (intended).** `SchedulingCard` opens a single subject directly. "A SINGLE SUBJECT OPENS DIRECTLY" is an intentional S4 rule ("one subject is not a decision"), so the card's work surface mounts for a one-child family on entry.
2. **Create by default (the defect).** `ScheduleWorkSurface` initialized its mode as `existing ? "detail" : "create"`. A subject with no assignment therefore mounted directly into the Create Assignment editor.

Nothing else requests create. Focus requests carry only `(card, focus)`, and an assignment focus source sets `assignment`. Every other `setMode("create")` call sits behind an operator click: `beginCreateAssignment`, Edit, or a type pick.

This also explains the hosted pattern: the D2/D5 families have two children, so they open on the roster and no editor appears.

## Repair: one binding

`components/admin/focusPanel/cards/SchedulingCard.tsx`: the work surface initializes `useState<SurfaceMode>("detail")`.
- **Without an assignment:** the detail surface shows "Assignments · + Add Assignment · No assignments yet." "+ Add Assignment" is `beginCreateAssignment`, the existing path into the same editor.
- **Unchanged:**
  - the single-subject rule;
  - the assignment focus source;
  - Edit and the type picker;
  - the editor;
  - validation and authorization;
  - the `assignment.*` commands.
- **Not added:** no new modal manager, editor, runtime or record-specific check.

## Rendered interaction test: `web/tests/businessProcesses/schedulingCardPassiveEntry.test.tsx` (5/5)

**How it runs:** the real `DurableRecordContextualCard` and the real `SchedulingCard`, with projections from the canonical `buildChildScheduling`, the child truth composed by `durableChildCollectionRow`, and every request's method recorded.

| Scenario | Result |
|---|---|
| A child with no assignment (the closed/lost family's only child) | "No assignments yet" + "+ Add Assignment"; **no editor**; no commit control; **0 non-GET requests** |
| A staff member with no assignment | same |
| A Schedule Gap source (`enrollment_agreement`, unscheduled) | no editor; "+ Add Assignment" offered; 0 writes |
| "+ Add Assignment" | the existing Create Assignment editor opens for that child; **Cancel** returns to "No assignments yet"; 0 writes |
| Open the editor, then select a different record | the new record shows no editor; 0 writes |

**Counterfactual:** on the base card all 5 fail, because the editor auto-opens on entry.

**Unchanged S4 behaviour:** `assignmentsSchedulingCardFocus.test.tsx` passes. A source assignment opens its own detail, a stale source is reported, and with no source the card behaves as before.

## Regression

- **Covering suites:** 2,222, head vs base (Focus Panel, scheduling, Assignments, Enrollment, Billing Focus Panel, presentation, and every test naming the card).

| Tree | Passed | Failed |
|---|---|---|
| head | 6269 | 224 |
| base | 6269 | 224 |

**0 new, 0 fixed.**

**Gates.**
- `npm run prebuild`: exit 0.
- Lint: the new code and test are clean. The file's one error (`schedApi(): Promise<any>`, line 229) is pre-existing and byte-identical to base.
- Type check: CI's graphs are authoritative.
