# Locations Phase 2 — Closeout

**Sprint:** org-runtime-realization · slot 4 · branch `agent/cursor/4-org-runtime-realization`  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt4-org-runtime-realization`  
**Local only:** not pushed / not promoted to staging

## Product chain (Scheduling consumes later)

```text
Organization → Programs → Locations → Rooms
                              ↘ Schedule Patterns
Rooms.metadata.schedule_pattern_id → Schedule Patterns
Rooms.metadata.supported_program_keys[] → Program keys offered at Location
```

## Metadata contracts for Scheduling consumption

### Schedule patterns (`schedule_patterns`)

| Field | Role |
| --- | --- |
| `schedule_type_key` | Operator type: `full_day` \| `part_time` \| `hourly` \| `rotating` |
| `weekdays` | Sorted union of active days (0–6). For rotating, union of week1+week2. Existing enrollment/rate consumers keep reading this column. |
| `metadata` | Versioned presentation via `web/lib/locations/schedulePatternPresentation.ts` |

`metadata` shape (v1):

```json
{
  "version": 1,
  "operator_type": "full_day|part_time|hourly|rotating",
  "hours": { "opens_at": "HH:MM|null", "closes_at": "HH:MM|null" },
  "rotation": { "week1": [1,2,3,4,5], "week2": [1,3,5] }
}
```

Export helper: `toSchedulePatternSchedulingContract({ label, key, scheduleTypeKey, weekdays, metadata })` → `{ scheduleType, days, hours, rotation, label, key }`.

### Rooms (`locations` units)

| Metadata key | Role |
| --- | --- |
| `supported_program_keys` | `string[]` of program keys offered in this room |
| `category` | First supported key (legacy single-category readers) |
| `schedule_pattern_id` | Nullable UUID of location-owned schedule pattern (no FK migration in Phase 2) |
| `capacity` | String capacity |

Legacy staffing/age metadata may still exist; Phase 2 no longer edits it in the primary UI and does not clear it on save.

### Location → Programs

Uses existing LPC columns (`local_display_name`, `available_from`, `available_through`) and `buildLocationProgramAvailabilityView` / `effectiveLocationProgramLabel`. No fork of status logic.

## Migrations

None required in Phase 2 beyond Programs V1.1 LPC columns already applied.

## Validation

- Focused Vitest: `schedulePatternAndRoomMetadata`, `configurationRuntimeLocations`, `bosRailPresentation` — pass
- `npm run typecheck` (production graph) — pass
- Authenticated QA: `alloy-agent-verify 4 route /organization/locations` — PASS
- Screenshots: `.alloy-agent-evidence/locations-phase-2/` (`04-overview|programs|rooms|schedule.png`, `qa-tabs.json`)

## Explicitly out of scope (next: Scheduling sprint)

- Scheduling Card / enrollment schedule runtime
- Promoting `schedule_pattern_id` to a native FK
- Closures / date-specific exceptions
- Programs redesign
- Push / PR / staging promotion
