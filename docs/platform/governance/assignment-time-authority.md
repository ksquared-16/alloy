---
owner: platform
status: canonical
last_reviewed: 2026-09-21
supersedes: []
---

# Assignment owns its recurring time

**Assignment owns recurring operational weekday and hour truth. Schedule Pattern is a
reusable template that seeds it and then stops being the authority.**

The operator noun is **Assignment**. `schedule_assignments` is the historical physical
name of the ledger and is compatibility vocabulary — it is not the product noun, and it
is shared by child and staff subjects through `subject_type`.

## What changed, and why it had to

Hours used to be a property of the pattern, read out of `schedule_patterns.metadata`.
Two consequences followed from that and neither was intended:

- two Assignments created from one pattern **necessarily shared hours**, so one person's
  schedule could not be adjusted without moving everybody else's
- one Assignment could not work different hours on different weekdays **at all** —
  Mon/Wed/Fri 08:00–16:30 with Tue/Thu 09:00–17:30 required two Assignments on two
  patterns, which then reads as two jobs

`assignment_weekday_intervals` holds the answer now, at the grain
*Assignment × weekday × interval*. Several intervals on one weekday express a split day.

## Unknown hours are a third state

A pattern may carry weekdays and no usable default hours. That is **recurrence known,
hours unknown**, and it is stored as an interval row whose times are both null.

It is not all-day. It is not site operating hours. It is not midnight-to-midnight. It is
not a reason to drop the Assignment. A database constraint makes a half-known interval
impossible, so a null can only ever mean unknown — never "not filled in yet".

Readers must carry that through. A surface that renders unknown hours as a time range is
stating something nobody authored.

## Pattern defaults seed; they do not govern

Creating an Assignment materializes its intervals from the pattern's weekdays and
default hours, in the same statement as the Assignment itself — so there is no moment
where an Assignment exists without interval truth.

**Editing a reusable pattern does not rewrite Assignments already materialized from it.**
That independence is the point of the change: a template edit is a decision about future
Assignments, not a silent retroactive edit to everyone who ever used it.

Changing an Assignment's `schedule_pattern_id` *does* re-materialize it, because that is
a change of recurrence and the previous weekdays no longer describe the Assignment.
Intervals already authored explicitly are never overwritten by a re-seed.

## Reading it

Use the canonical resolver rather than reconstructing hours from a pattern:
`resolveAssignmentTimes` in `web/lib/assignmentTime/resolveAssignmentTime.ts`. It batches
by Assignment id and reports `hoursKnown` as `all`, `partial` or `none`.

`readPatternDefaultHours` remains correct for **template** purposes — the pattern picker,
the Locations schedule-definition editor, Operations pattern options. It must not be used
to answer what hours an Assignment works.

**Recurrence falls back to the pattern when an Assignment has no interval rows; hours
never do.** The asymmetry is deliberate: staff supply reads an empty weekday list as
"runs every day", so an Assignment that lost its recurrence would silently supply staff
seven days a week.

## What this is not

This slice did not implement day-specific Coverage, did not activate
`staffing_participation`, did not change staffing sufficiency from whole-day evaluation,
and did not create a Calendar, Time Off or payroll semantics. Those remain future work
under the approved Staffing/Scheduling/Coverage V1 model.

## Staffing participation — what an Assignment Type decides

`operational_assignment_types.staffing_participation` governs **baseline Staff supply
participation**, and nothing else yet.

| value | meaning today |
|---|---|
| `supply` | Assignments of this type contribute baseline Staff supply, **subject to every other eligibility rule** — org, site, staff subject, commitment kind, operational status, effective dates, employment coverage, room/site semantics |
| `none` | **intentionally** excluded from Staff supply. A legitimate steady state, not a gap |
| `demand` | reserved, configured vocabulary. **NOT activated** as the gate for child-demand arithmetic |

**`none` means a decision was made.** Until this slice it was also what you got by
saying nothing, which is how `recurring_service` — the type carrying every Staff
assignment — came to be `none` while the runtime counted its work anyway. Authoring a
Staff-capable type now requires an intentional choice, and an unrelated edit (a rename,
an icon change) no longer resets participation.

**Child demand is unchanged.** It continues to derive from its existing authority —
agreements, patterns and placements — which has never read Assignment Type. Activating
`demand` would require deciding what participation means for an Assignment with **no
type**, and today every active child Assignment is untyped. That decision is not made
here and this slice does not depend on it.

**An untyped Assignment is not implicitly one of the enum values.** It has no
classification at all. For Staff that is configuration-invalid: such an assignment is
excluded from supply and reported as unresolved rather than counted or silently
dropped. `staff_supply_participation_unresolved()` names any Assignment Type still
carrying live Staff supply while unclassified, and it reasons over usage rather than
over a hardcoded key — a hardcoded `recurring_service` check would already have missed
the certification stack, whose staffing type is called `staff_classroom`.

Coverage, Availability, Presence and Readiness remain separate facts. Staffing remains
whole-day.

## Day-specific Coverage is a different authority

An Assignment says what someone's recurring days and hours are. It deliberately does not
say where they were planned on one particular Tuesday — that is
[Coverage](staff-coverage-authority.md), a separate day-specific fact with its own
lifecycle. Coverage never writes back to the Assignment, and as of Slice 3 it does not
participate in staffing supply arithmetic.
