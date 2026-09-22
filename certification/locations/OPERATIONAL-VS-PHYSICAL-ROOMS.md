---
title: Operational group vs physical space — what exists, and what /organization/locations → Rooms still cannot say
status: backlog
opened: 2026-09-19
raised_by: Financials 11B (erun_a8de2884f7c3be19)
---

# THE CONCEPT ALREADY EXISTS, AND IS ALREADY ENFORCED

Kelly's example — "a room like room 1 that is split into 2 classrooms, or playground" — is the
literal diagram in `supabase/migrations/20260909210000_location_topology_v1.sql`:

```
Site
└── Room 1        unit, unit_role = 'physical_space'      (licensed, capacity-bearing)
    ├── Toddler 1 unit, unit_role = 'operational_group'   (ratio / staffing / placement)
    └── Toddler 2 unit, unit_role = 'operational_group'
└── Playground    unit, unit_role = 'shared_space'
```

A classroom is **not a second entity**. It is a `locations` row with `location_type = 'unit'` and a
role. The migration's own reasoning: Alloy already keys attendance, placements, capacity, ratio,
staffing and config off `room_location_id`, so a parallel "operational group" table would add a
second nullable reference to every one of those tables and a branch to every resolver. What was
missing was *a role and one level of nesting*, not an entity.

## WHAT IS DONE — measured, not assumed

| layer | state | evidence |
|---|---|---|
| Column + CHECK | **done** | `locations.unit_role` ∈ {physical_space, operational_group, shared_space}; a second CHECK refuses a role on a site/address row |
| Nesting guard | **done** | site → physical_space → operational_group only; cycles and deeper nesting refused |
| Site resolution | **done** | `public.location_site_id()` — one bounded, cycle-safe, depth-capped ancestor walk; the three fact/placement triggers ask it instead of requiring `parent = site` |
| Migration applied | **done** | `20260909210000` reads `applied` in the hosted migration identity census |
| Domain model | **done** | `lib/location/canonicalLocationModel.ts` — `CanonicalUnitRole`, `effectiveUnitRole`, `isPlaceableUnitRole`, `isAttendanceLocatableRole`; legacy NULL reads as `operational_group`, never back-filled to a lie |
| Room provider | **done** | `canonicalRoomProvider` — `resolveRoomsForLocation` (by ancestry), `placeableRooms`, `groupsInSpace`, `containingSpaceLocationId` |
| Placement | **done** | `generatePlacementOptions.ts` filters through `placeableRooms` — only an operational group is a placement target |
| Attendance | **done** | `buildAttendanceCardVM` deliberately keeps every role, playground included; attendance may NAME a shared space, placement may not |
| Assignment room list | **done** | `loadSiteOperationalRooms` resolves by ancestry and returns `unitRole` + `containingSpaceLocationId` |
| Write API | **done** | `POST /api/admin/locations` accepts `unit_role`, validates the enum, refuses a role on a non-unit, refuses nesting under a group or a shared space, and refuses a physical space inside a physical space |

## WHAT IS MISSING — all of it is operator surface

**No component in the codebase references `unit_role` or `unitRole`.** The concept is enforced by
the database, honoured by every resolver, writable by the API — and invisible and unauthored in
`/organization/locations`. The capability is dormant because nothing can turn it on.

1. **`LocationRoomCreatePanel` cannot state a role.** It authors Room name, Capacity, Active,
   Programs, Pattern. `createRoomUnit` hard-codes `parent_location_id: siteId` and sends no
   `unit_role`, so every room an operator creates is a site-parented `operational_group` by
   default. There is no way to create Room 1, and no way to put anything inside it.

2. **`LocationRoomDetailPanel` never displays the role.** An operator looking at Toddler 1 cannot
   see that it is a group, that it sits inside Room 1, or that Playground is a shared space.

3. **The Rooms list orphans a nested room.** `useLocationsConfigurationSettings.ts:242` builds each
   room's subtitle as `siteLabelById.get(room.parent_location_id)`, and `siteLabelById` is built
   **from sites only**. A room whose parent is a physical space resolves to `undefined` — so the
   first nested classroom an organisation creates appears in the list with no site and no
   container, indistinguishable from a room belonging nowhere. This is a defect the moment §1
   ships, and it is why the UI work must land together rather than in pieces.

4. **No PATCH path for the role.** `PATCH /api/admin/locations/[id]` does not handle `unit_role`,
   so an existing flat room cannot be reclassified as a physical space or a shared space, and an
   existing classroom cannot be moved inside one. Every organisation already has flat rooms;
   without this they could only adopt the model by re-creating rooms, which would strand the
   attendance, placement and staffing history keyed to the old `room_location_id`.

## RECOMMENDED EXPOSURE — the smallest surface that makes the concept real

**One field and one parent picker**, on the surface that already owns rooms. No new chapter, no
wizard, no second rooms authority.

- **Create panel** — a `Room type` control with the three roles in operator words, defaulting to
  the classroom so today's behaviour is unchanged:
  - *Classroom / group* (`operational_group`) — "children are placed here; ratio and staffing apply"
  - *Physical space* (`physical_space`) — "a licensed room that contains classrooms; children are not placed here"
  - *Shared space* (`shared_space`) — "playground, gym; attendance can name it, placement cannot"
- **Inside** — shown only for a classroom or shared space: the site, or one of the site's physical
  spaces, sent as `parent_location_id`. The API already refuses every illegal combination, so the
  control narrows the choice rather than re-deciding it.
- **Detail panel** — state the role and the container as read-only facts first; allow editing once
  the PATCH path exists.
- **Rooms list** — resolve the subtitle through the container as well as the site
  ("Bend Campus · Room 1"), which closes defect §3. Required *with* §1, not after it.
- **PATCH `unit_role` + `parent_location_id`** — reclassification without re-creation, guarded by
  the rules the POST path already applies. This is what lets an existing organisation adopt the
  model at all.

Do not add capacity or ratio fields to a physical space in this work: capacity and ratio live in
the scoped `childcare_*` config tables resolved by the Capacity/Ratio providers, and are
deliberately not part of Room identity.

## WHY THIS IS NOT FINANCIALS WORK

It touches no financial authority. It is filed here as a backlog item raised during Financials 11B
and belongs to whoever owns `/organization/locations`.
