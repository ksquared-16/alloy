# Mapping worksheet

**Alloy's side is filled in. Yours is not, and we have deliberately not guessed.**

Every column marked `UNKNOWN` is a question for your team, not an omission on
ours. We would rather hand you a worksheet with honest blanks than a proposal
built on assumptions about a system we have not seen.

**How to complete it:** for each row, tell us what the equivalent concept is
called in your system, what identifies it, which direction data needs to move,
and how fresh it needs to be. Where your system has no equivalent, write *"no
equivalent"* — that is a useful answer and often the most important one.

---

## Legend

**Direction**
`Alloy → you` · `you → Alloy` · `both` · `none` · `UNKNOWN`

**Sync requirement**
`bootstrap only` — read once at setup
`periodic` — hours or days is fine
`near-real-time` — minutes matter
`on-demand` — queried when a user asks
`UNKNOWN`

---

## 1. Places

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Site | `id` (Alloy) | Locations | `GET /api/v1/locations?type=site` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Does your system model a site, or only rooms? |
| Room / unit | `id` (Alloy) | Locations | `GET /api/v1/locations?type=unit` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Is a room in your system stable, or recreated per term/year? |
| Room grouping | `unit_role` | Locations | field on a unit | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you need the operational role of a room, or only its name? |

## 2. People

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Child | `id` (Alloy), `external_id` (yours) | Children | `GET /api/v1/children` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | What identifies a child in your system, and is it stable across years? |
| Household / family | `id` | Households | `GET /api/v1/households` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you group siblings, and by what? |
| Parent / guardian | `person_id` | Relationships | `GET /api/v1/relationships` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Is an adult one record across their children, or one per child? |
| Relationship kind | `relationship_type` | Relationships | field on the edge | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Which relationship kinds does your system distinguish? |
| Adult contact details | — | Relationships | `email`, `phone` (stronger scope) | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you need contact details at all, and for what feature? |
| Pickup authority | — | Relationships | `pickup_authorized` (computed) | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Does your system perform collection verification? Can it accept a yes/no with no reason? |

## 3. Service state

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Enrollment | `id` | Enrollments | `GET /api/v1/enrollments` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you distinguish enrolled from placed, or is it one state? |
| Room placement | `id` | Placements | `GET /api/v1/placements` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you keep placement history, or only the current room? |
| Committed schedule | `id` | Schedule assignments | `GET /api/v1/schedule-assignments` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you hold a recurring pattern, or individual days? |
| Expected day | none (derived) | Schedule days | `GET /api/v1/schedule-days?from=&to=` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you need "who is expected today", and how far ahead? |

## 4. Staff

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Staff member | `id` (employment), `person_id` | Staff | `GET /api/v1/staff` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you model a person separately from their employment? |
| Job / role label | `position_label` | Staff | field | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you need role for display, or does it drive behaviour? |
| Site assignment | `primary_location_id` | Staff | field | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Can a staff member work at more than one site in your system? |
| Employment lifecycle | `employment_status` | Staff | field | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you need leavers, or only currently-active staff? |

## 5. Attendance

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Attendance fact (read) | `id` | Attendance | `GET /api/v1/attendance-events` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you consume Alloy's attendance, author it, or both? |
| Check-in | — | Attendance | submit `check_in` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Does your system record an arrival time, and to what precision? |
| Check-out | — | Attendance | submit `check_out` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | |
| Absence | — | Attendance | submit `absence` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you distinguish planned absence from unexplained? |
| Room transfer | — | Attendance | submit `room_transfer` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Do you track movement between rooms during a day? |
| Your event identifier | — | Attendance | `external_event_id` on submission | `UNKNOWN` | `UNKNOWN` | `you → Alloy` | — | What identifies one attendance event in your system, and is it stable across your own retries? |
| Correction | — | Attendance | a superseding fact | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | How does your system express "that record was wrong"? |
| Reversal | — | Attendance | a superseding fact | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | How does your system express "that never happened"? |

## 6. Cross-cutting

| Alloy concept | Alloy identifier | Alloy authority | Alloy field / operation | Your equivalent | Your identifier | Direction | Sync requirement | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Your identifier for an Alloy record | `external_id` | Correlation | mapped per installation | `UNKNOWN` | `UNKNOWN` | `both` | `bootstrap only` | Do you already hold identifiers for these records, or will you store Alloy's? |
| Sync checkpoint | `sync_token` | every collection | `since_token` | `UNKNOWN` | — | `Alloy → you` | — | Can your system store a checkpoint per resource? |
| Change detection | — | polling | `since_token` / `updated_since` | `UNKNOWN` | — | — | `UNKNOWN` | What polling interval does your product actually need? |
| Push delivery | **not offered in V1** | — | — | `UNKNOWN` | — | — | `UNKNOWN` | Does anything in your design require push rather than polling? |

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
