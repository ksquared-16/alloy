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
