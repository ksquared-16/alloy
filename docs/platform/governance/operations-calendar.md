---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Roster asks who. Calendar asks when and where.

**Calendar is a Work section of Operations, beside Roster, over the same certified truth.**
It owns no business fact. Every number, verdict and sentence on it comes from the
time-aware Staffing Projection; the surface decides which lane, how wide a block and
what colour a chip.

## Why two lenses and not two products

An operator looking at a short room and an operator asking who is here at nine are the
same operator, seconds apart. Roster answers **who**: who belongs here, who is expected,
who is present. Calendar answers **when and where**: when children are expected, when
staff are expected, where Coverage moves them, where the day goes short.

They share the day anchor. Moving from Roster to Calendar does not move the operator's
date, because these are two views of one operating day rather than two products that each
happen to have one.

## The surface does no staffing math

This is enforced, not merely intended. `calendarSurfaceBoundaries.test.ts` fails the build
if the component compares planned against required, recomputes a shortfall, or reaches for
the sufficiency resolvers. A UI that decides whether a room is staffed is a second staffing
engine, and it is the one operators would believe.

The lane roll-up calls the certified `rollUpStaffingSufficiency`. The explanation lines are
the projection's own. The only arithmetic here is geometry.

## A display scale is not a truth scale

The strip is a continuous minute scale. A fifteen-minute stretch renders fifteen minutes
wide; a four-hour block renders four hours wide. Boundaries are **never** snapped to a
half-hour rendering grid, because that would put business state on a scale the projection
never used — and the first thing it would hide is the short handover gap this work exists
to surface.

## Colour follows the existing doctrine

Green only when evaluated and met. Attention gold for short. Neutral stone for unknown and
for idle. A closed room and an unresolvable one both stay quiet, so the rooms that matter
are the ones that stand out. The Calendar borrows `staffingChrome` rather than inventing a
second palette, which is why it reads as Alloy Operations and not as a workforce scheduler
embedded in it.

## Gaps are actionable

Selecting a short stretch shows the projection's explanation of why it is short, then the
people who are **available in that exact interval and planned nowhere in it**. Canonical
facts only: nobody is ranked, nobody is hidden, and Readiness — being advisory — removes
nobody from the list. Choosing someone plans Coverage through the registered command, and
the picture reloads from the projection rather than being patched locally.

The gap hands the command everything it already knows: site, room, date and the exact
interval, plus the shortfall the projection computed. The operator chooses a person and
confirms.

## The chooser states facts and holds no opinion

When a stretch is short, the panel offers **the site's own staff** — not a shortlist. Each
one carries what Availability says (available, unavailable, or not recorded), whether they
are already planned somewhere in that interval, and where their Assignment puts them.

Nobody is ranked, scored or recommended, and a guard fails the build if the words appear.
The order groups by what Availability says so the operator reads the certain answers first,
and that is the only opinion in it.

Crucially, nobody is **hidden**. An earlier version offered only the explicitly-available,
which meant a site that had never authored Availability got a gap and no way to fix it —
measured on staging, that was half the workforce. Someone already planned elsewhere is
shown with that conflict stated rather than removed; the Coverage exclusion constraint still
refuses a real overlap, and an operator who can see the conflict can decide to move them.

## Every mutation is a registered command

`staff_coverage.plan`, `.change`, `.correct`, `.cancel`, and `staff_availability.add_exception`
behind "called out". One POST to the canonical action runtime, so authorization, atomicity,
audit and the operator-facing conflict message are identical whether Coverage is authored
here or anywhere else. There is no Calendar-private write path, no PATCH of an allocation
and no direct RPC.

Conflicts arrive already translated: *"This person is already planned somewhere else during
part of that time."* No constraint name reaches the operator.

## Called out

An Availability exception records that the person cannot work that date, and the staffing
picture changes accordingly: they stay visible as planned, marked **Unavailable**, they stop
counting toward the requirement, and the room goes short so the operator can plan a
replacement.

**Their Coverage is not cancelled for them** — cancelling a plan has consequences for the
rooms it covered, and doing that silently is exactly what the Coverage authority exists to
prevent. The surface shows what they were covering so the operator can act on each one.

No Time Off authority is invented. This is the same certified exception command the Staff
record uses.

## Plan and actual stay apart

Planned in Toddler 1 and observed in Preschool 2 is shown as what it is. The Calendar never
mutates Coverage to match Presence, and never mutates Assignment or Attendance at all. The
same holds for children: expected and actual are separate, and neither is rewritten.

## Unknown is a state, not an empty cell

A requirement no ratio tier covers, an Assignment with no recorded hours, a day nothing has
been observed about yet — each renders as unknown in neutral chrome, never as zero, never
as adequate, never as a gap. The projection already carries the uncertainty; the surface
passes it through.

## Related

- [`time-aware-staffing-projection.md`](time-aware-staffing-projection.md) — the arithmetic
- [`staff-coverage-authority.md`](staff-coverage-authority.md) — what Coverage owns
