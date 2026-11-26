# Locations model correction — Program offering truth + composable Scheduling

Date: 2026-07-22  
Worktree: `wt4-org-runtime-realization`  
Base: `44af155b9` · `7f9b9ebe2` · `f40cc05e6`

## Source-of-truth matrix (Program offerings)

| Surface | Authoritative source | Notes |
|--------|----------------------|-------|
| 1. Programs → Available at Locations | `location_program_categories` via publication / make-available path | Uses `program_id` + dates |
| 2. Locations landing → Programs count | LPC rows for site (`is_active`, not ended by date helper where applied) | Count does not need `program_id` join |
| 3. Location Overview → Programs count | Same LPC count as landing | |
| 4. Location → Programs checklist | LPC indexed by `program_id` + `deriveLocationProgramOfferingState` | **Broken before fix** |
| 5. Rooms → supported Programs | Room metadata `supported_program_keys` | Capability preview — **not** offering SoR |
| 6. Enrollment Program option resolution | Offering relationship + room support intersection (documented) | |

Canonical relationship:

`Organization Program` ↔ `location_program_categories` (Location Program Offering) ↔ UI counts / checklist / Scheduling eligibility

Rooms do **not** create phantom offering counts.

## Defect root cause

Client mapper `fetchLocationProgramCategories` (and server batch `loadLocationProgramCategoriesForOrg`) stripped `program_id`, `local_display_name`, `available_from`, `available_through` after the API returned them.

Checklist matched offerings **only** by `program_id` → every org Program appeared **Not Offered**, while Overview/landing still counted LPC rows.

Null dates were never the bug — `deriveLocationProgramAvailabilityStatus` already treats null/null as **active**.

## Backfill / migration

No LPC backfill migration shipped in this commit.

- Durable offerings already exist as LPC rows with `program_id` for North Campus (counts were correct).
- Room `supported_program_keys` were **not** promoted to LPC (would invent offerings).
- If a future audit finds LPC rows missing `program_id`, run an idempotent org-scoped backfill; dry-run/report first.

## Availability semantics (canonical)

`deriveLocationProgramOfferingState` / `locationProgramOfferingCheckboxSelected`:

1. no relationship / inactive → `not_offered`
2. future `available_from` → `scheduled` (checkbox selected)
3. past `available_through` → `ended` (checkbox selected; not identical to never offered)
4. otherwise → `active` (“Available now” when both dates null)

## Scheduling ownership decisions

| Concern | Owner | Storage |
|--------|-------|---------|
| Day Types | **Organization** option set `childcare_schedule_type`; Location **enables** | `location_scheduling_v1.enabled_day_type_keys` |
| Schedule Types | Location catalog; behaviors locked to `continuous` \| `rotating` | `location_scheduling_v1.schedule_types` |
| Operating days | Location (`location_scheduling_v1.operating_days`) | Empty = all seven allowed until set |
| Time Windows | Location catalog | `location_scheduling_v1.time_windows` |
| Patterns | `schedule_patterns` + versioned metadata | Day Type + Schedule Type + scheduled days + hours + rotation anchor |

Tab label: **Scheduling** (route key remains `schedule`).

Labels: Location **Operating days** vs Pattern **Scheduled days** / **Week N days**.

## Pattern contract

- Writable metadata via `writeScheduleDefinitionMetadata` (version 2+ fields; rotating requires `rotation_anchor_date`).
- Executable behavior follows Schedule Type behavior at save (`pattern_type`); labels may rename later without changing behavior.
- Preferred: label may follow Schedule Type; behavior must not change incompatibly after Patterns use it (UI does not expose behavior mutation).

## Rotation anchor

- Field: **Rotation begins** → `rotation_anchor_date` (ISO date)
- Required for rotating Patterns
- Week 1 contains the anchor date
- Platform default week-start: **Sunday** (`PLATFORM_DEFAULT_WEEK_START_WEEKDAY = 0`)
- Projection: `resolveRotationWeekPosition`

## Program / Room / Pattern resolution

```
eligible = Offering.eligible_schedule_pattern_ids
         ∩ Location active Patterns
         ∩ Rooms that support the Program key
Room.default_pattern_id is optional preference within eligible set.
```

Helpers: `writeEligibleSchedulePatternIds` on LPC metadata; `resolveEligiblePatternsForProgramRoom`.

## Promotion

**Do not promote** until authenticated QA confirms North Campus offering agreement and Scheduling gates below.

Certification gates (code ready; QA pending evidence):

1. Program offering truth agrees across surfaces
2. Day Type and Schedule Type independently configurable
3. Operating days ≠ Pattern scheduled days
4. Rotating Patterns deterministic via rotation anchor
