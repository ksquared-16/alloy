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

## Every mutation is a registered command

`staff_coverage.plan`, `.change`, `.correct`, `.cancel`, and `staff_availability.add_exception`
behind "called out". One POST to the canonical action runtime, so authorization, atomicity,
audit and the operator-facing conflict message are identical whether Coverage is authored
here or anywhere else. There is no Calendar-private write path, no PATCH of an allocation
and no direct RPC.

Conflicts arrive already translated: *"This person is already planned somewhere else during
part of that time."* No constraint name reaches the operator.

## Called out

The smallest truthful composition of facts that already exist, and deliberately only the
first half of it. An Availability exception records that the person cannot work that date.
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
