---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# The staffing day is not one number

**The Staffing Projection answers, for a site on a date: in this stretch of time, in this
room, how many children are expected, who is planned to be with them, is that enough, and
if not, why not.** It composes the authorities that already exist. It authors nothing.

## Why a bucket cannot answer it

Six children arrive at eight and leave at noon. Four more arrive at nine and stay until
four. Alex works 08:00–10:00, Sam 08:30–16:30, Jordan 10:00–16:30.

An "AM" bucket over 08:00–12:00 sees ten children and three staff. At 1:4 that reads
adequate. Both halves of that reading are wrong: the ten children were never all present
at once, and the three staff were never all present at once either. The room was actually
short a person for three separate stretches of the morning, including the whole of
09:00–10:00.

So the day is cut where the facts change:

```
08:00   08:30   09:00   10:00   12:00   16:00   16:30
```

Every boundary is the start or the end of something somebody asserted — a child's hours, a
staff member's hours, an availability window, a Coverage interval, an observed arrival.
Between two adjacent boundaries nothing changes, which is the property that makes a
segment safe to answer a staffing question about. Nobody chooses the buckets, so nobody
can choose them badly.

Intervals are half-open, `[start, end)`, like every other interval in this estate.
Adjacency is not overlap: the person leaving at 10:00 and the person arriving at 10:00 are
counted in different segments, not both in one.

## Four facts about one person, kept apart

| | what it says | authority |
|---|---|---|
| **Baseline** | this is their room and these are their hours | Assignment + Assignment Time + `staffing_participation` |
| **Available** | they could be asked to work then | Availability |
| **Planned** | where they are actually expected to be | baseline, unless Coverage specialised it |
| **Actual** | where they were observed | Presence |

Collapsing any pair destroys a question operators ask daily. "Available but not planned" is
the entire content of a gap someone can fix this morning; merged into one supply number it
becomes a gap nobody can act on. "Planned but not present" is the difference between a
schedule problem and a today problem.

The same discipline applies to children: expected and actual are separate fields, and
neither is ever rewritten to match the other. A child who was expected and did not come, and
a child who came unexpectedly, are both representable, and the projection never resolves the
disagreement by editing one side.

## Planned place has exactly one rule

**Coverage wins for the interval it names. Otherwise the Assignment's room stands.**

That one rule covers both shapes operators distinguish. A fixed-room person stays in their
room until Coverage moves them. A site-level or float person stays site-level until Coverage
puts them in a room, and an uncovered float interval stays site-level — the projection does
not invent a room for someone nobody placed.

Because the rule selects exactly one place per employment per segment, **one employment is
counted at most once**. A site-level baseline plus a room-level Coverage is one person in
that room, never one in the room and a second at the site.

## Plan is not availability

Someone explicitly unavailable is still **planned** — the schedule says so, and erasing it
would hide why the room is short. They simply do not count toward the requirement.
`plannedStaff` names everyone the schedule put there; `effectivePlannedStaff` is the subset
who can actually work it, and the requirement is compared against that.

This is what makes a call-out open a gap without anybody's Coverage being cancelled. The
operator sees *Alex is planned here but unavailable during this interval*, then *Short 1
staff*, and decides what to do about it. The projection never resolves the divergence by
editing a fact.

The same three-way honesty applies to Availability itself:

| | meaning |
|---|---|
| **available** | Availability was recorded and says yes for this interval |
| **unavailable** | Availability was recorded and says no — including recorded windows that simply do not cover this hour |
| **unknown** | nothing was ever authored |

`unknown` is not a shade of `unavailable`. Reading it as one would quietly remove half a
workforce from every candidate list; reading it as `available` would offer people who may
be unreachable. Saying so is the only honest option, and it is why the resolver's
provenance is carried through the projection rather than collapsed into a window list.

## Unknown is an answer

`unknown` is not zero, not adequate and not a gap. Required staff is null whenever no
configured ratio tier covers the occupancy. An Assignment with no recorded hours places
nobody in any segment and is reported by name in `unknowns` rather than dropped. A date
nothing has been observed about yet reports `actualState: "unknown"`, because an empty room
that nobody has checked into is not an idle room.

## Every segment explains itself

The explanation is structured first and rendered second, so a consumer acting on
"available but not planned" does not parse a sentence and a consumer showing a sentence does
not invent one. Two surfaces cannot explain the same segment differently, because neither
of them owns the explanation — the projection does.

```
Toddler 1, 09:00–10:00
Expected children: 10
Required staff: 3
Baseline staff: Alex and Sam
Planned staff: Alex and Sam
Jordan is available but not planned anywhere during this interval
Short 1 staff
```

"Available but not planned" means available and planned **nowhere** in that segment — a
person already planned in the room next door is not a way to fix this room.

## What it does not do

Coverage is durable planned truth; **staffing sufficiency for existing whole-day consumers
still reads whole-day**. The whole-day answer is now a REDUCTION of the segmented one
(`wholeDayFromProjection`) rather than a second calculation beside it, and
`compareWholeDaySupply` reports where the two readings differ instead of smoothing it. There
is one legitimate difference: an Assignment with unknown hours is supply to the old reading
and appears in no segment in the new one. That difference is named, never hidden.

Readiness stays advisory. Presence is not payroll-grade worked time. Assignment-Type demand
is not activated as a child-demand gate. There is no Calendar.

## Reading it

```ts
const projection = await fetchStaffingProjection(supabase, {
    orgId, siteLocationId, dateStart, dateEnd,
    // The moment an unclosed check-in is considered to run to. Omit for a
    // historical day; pass the current org-local time for today.
    openObservationsEndAt: "10:15",
});
```

An open observation is not an all-day observation. At ten in the morning most check-ins have
no check-out yet; closing them at the end of the day invents attendance that has not
happened, and closing them at the check-in erases attendance that has. The caller supplies
the moment, and the interval is flagged `openEnded`.

## Related

- [`staff-coverage-authority.md`](staff-coverage-authority.md) — what Coverage owns
- Assignment Time — the one read for when an Assignment runs, for staff and children alike
