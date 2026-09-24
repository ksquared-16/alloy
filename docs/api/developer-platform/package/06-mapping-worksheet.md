# Mapping worksheet

**Alloy's side is filled in. Yours is not, and we have deliberately not guessed.**

Every column marked `Provider confirmation required` is a question for your team, not an omission on
ours. We would rather hand you a worksheet with honest blanks than a proposal
built on assumptions about a system we have not seen.

**How to complete it:** for each row, tell us what the equivalent concept is
called in your system, what identifies it, which direction data needs to move,
and how fresh it needs to be. Where your system has no equivalent, write *"no
equivalent"* — that is a useful answer and often the most important one.

---

## Legend

**Direction**
`Alloy → you` · `you → Alloy` · `both` · `none` · `Provider confirmation required`

**Sync requirement**
`bootstrap only` — read once at setup
`periodic` — hours or days is fine
`near-real-time` — minutes matter
`on-demand` — queried when a user asks
`Provider confirmation required`

---

## 1. Places

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Site | `id` (Alloy) | Locations | `GET /api/v1/locations?type=site` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Does your system model a site, or only rooms? |
| Room / unit | `id` (Alloy) | Locations | `GET /api/v1/locations?type=unit` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Is a room in your system stable, or recreated per term/year? |
| Room grouping | `unit_role` | Locations | field on a unit | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you need the operational role of a room, or only its name? |

## 2. People

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Child | `id` (Alloy), `external_id` (yours) | Children | `GET /api/v1/children` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | What identifies a child in your system, and is it stable across years? |
| Household / family | `id` | Households | `GET /api/v1/households` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you group siblings, and by what? |
| Parent / guardian | `person_id` | Relationships | `GET /api/v1/relationships` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Is an adult one record across their children, or one per child? |
| Relationship kind | `relationship_type` | Relationships | field on the edge | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Which relationship kinds does your system distinguish? |
| Adult contact details | — | Relationships | `email`, `phone` (stronger scope) | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you need contact details at all, and for what feature? |
| Pickup authority | — | Relationships | `pickup_authorized` (computed) | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Does your system perform collection verification? Can it accept a yes/no with no reason? |

## 3. Service state

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Enrollment | `id` | Enrollments | `GET /api/v1/enrollments` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you distinguish enrolled from placed, or is it one state? |
| Room placement | `id` | Placements | `GET /api/v1/placements` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you keep placement history, or only the current room? |
| Committed schedule | `id` | Schedule assignments | `GET /api/v1/schedule-assignments` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you hold a recurring pattern, or individual days? |
| Expected day | none (derived) | Schedule days | `GET /api/v1/schedule-days?from=&to=` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you need "who is expected today", and how far ahead? |

## 4. Staff

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Staff member | `id` (employment), `person_id` | Staff | `GET /api/v1/staff` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you model a person separately from their employment? |
| Job / role label | `position_label` | Staff | field | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you need role for display, or does it drive behaviour? |
| Site assignment | `primary_location_id` | Staff | field | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Can a staff member work at more than one site in your system? |
| Employment lifecycle | `employment_status` | Staff | field | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you need leavers, or only currently-active staff? |

## 5. Attendance

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Attendance fact (read) | `id` | Attendance | `GET /api/v1/attendance-events` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you consume Alloy's attendance, author it, or both? |
| Check-in | — | Attendance | submit `check_in` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Does your system record an arrival time, and to what precision? |
| Check-out | — | Attendance | submit `check_out` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | |
| Absence | — | Attendance | submit `absence` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you distinguish planned absence from unexplained? |
| Room transfer | — | Attendance | submit `room_transfer` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | Do you track movement between rooms during a day? |
| Your event identifier | — | Attendance | `external_event_id` on submission | `Provider confirmation required` | `Provider confirmation required` | `you → Alloy` | — | What identifies one attendance event in your system, and is it stable across your own retries? |
| Correction | — | Attendance | a superseding fact | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | How does your system express "that record was wrong"? |
| Reversal | — | Attendance | a superseding fact | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | `Provider confirmation required` | How does your system express "that never happened"? |

## 6. Cross-cutting

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Your identifier for an Alloy record | `external_id` | Correlation | mapped per installation | `Provider confirmation required` | `Provider confirmation required` | `both` | `bootstrap only` | Do you already hold identifiers for these records, or will you store Alloy's? |
| Sync checkpoint | `sync_token` | every collection | `since_token` | `Provider confirmation required` | — | `Alloy → you` | — | Can your system store a checkpoint per resource? |
| Change detection | — | polling | `since_token` / `updated_since` | `Provider confirmation required` | — | — | `Provider confirmation required` | What polling interval does your product actually need? |
| Push delivery | **not offered in V1** | — | — | `Provider confirmation required` | — | — | `Provider confirmation required` | Does anything in your design require push rather than polling? |

---

## Rows we expect to be hardest

Not because they are complicated, but because they are where two systems usually
disagree without noticing:

1. **What identifies a child**, and whether that identifier survives a year
   rollover. Almost every integration defect traces back here.
2. **Whether an adult is one record or several.** Alloy holds one person with a
   separate relationship per child; systems that hold "a parent record per child"
   map many-to-one and need a merge rule.
3. **Whether rooms are stable.** Alloy's rooms are durable locations. A system
   that recreates rooms each term will need a mapping that survives that.
4. **Attendance event identity.** Safe retries depend on your identifier being
   stable across *your* retries — if it is generated per HTTP attempt, retries
   will look like new events to you and replays to us.
5. **Whether you need pickup verification.** If you do, we need to know whether a
   yes/no with no explanation is usable in your interface.


---

## 7. Which lifecycle operations do you need?

Alloy can accept governed writes for the concepts below. **We do not know which
of these Classroom Coach needs to perform**, and the answer changes both the
permissions an operator grants and the shape of the integration.

For each, tell us: do you need to perform it, does Alloy perform it and you
observe the result, or is it out of scope entirely?

| Alloy operation | What it does | Permission | Do you need it? |
| --- | --- | --- | --- |
| Start an enrollment | Enrolls a child at a site from a date | `enrollment.write` | `Provider confirmation required` |
| End an enrollment | Cancels, schedules an ending, or closes | `enrollment.write` | `Provider confirmation required` |
| Void an enrollment | States it was recorded in error and never represented service | `enrollment.write` | `Provider confirmation required` |
| Assign a placement | First room for an enrollment | `enrollment.write` | `Provider confirmation required` |
| Move a placement | New room from a date, superseding | `enrollment.write` | `Provider confirmation required` |
| Cancel a placement | States it was recorded in error and never took effect | `enrollment.write` | `Provider confirmation required` |
| Set a schedule | Committed recurring schedule | `schedule.write` | `Provider confirmation required` |
| Change a schedule | New schedule from a date, superseding | `schedule.write` | `Provider confirmation required` |
| Cancel a schedule | States it never applied; projects zero expected days | `schedule.write` | `Provider confirmation required` |
| Submit attendance | Check-in, check-out, absence, room transfer | `attendance.write` | `Provider confirmation required` |
| Submit a correction | Supersedes an earlier attendance fact | `attendance.write` | `Provider confirmation required` |
| Submit a reversal | States an earlier fact did not happen | `attendance.write` | `Provider confirmation required` |

**Not offered, so do not plan around them:** creating children, households or
relationships; creating or changing locations; onboarding staff; any form of
`PUT`, `PATCH` or `DELETE`. Sections 2.2–2.4 of the specification explain why for
each, and several are deliberate product decisions rather than unbuilt work.

**If you need something on that second list**, tell us now rather than later —
the distinction between "not built" and "decided against" determines whether it
can change at all.
