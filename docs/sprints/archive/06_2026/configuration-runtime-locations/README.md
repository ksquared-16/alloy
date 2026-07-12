# Configuration Runtime — Locations

**Sprint:** June 2026  
**Status:** Complete — final Configuration Runtime V1 page before Layouts.

## Goal

Refactor `/settings/locations` to **Context → Queue → Workspace → BOS**, matching Fields, Statuses, Access, Communications, and Processes.

## Sections

| Queue column 1 | Queue column 2 | Workspace |
|----------------|----------------|-----------|
| Locations | Campus list | Name, address, phone, timezone, capacity summary, active |
| Programs | Program offerings | Name, age range, default room types, active |
| Rooms | Classrooms | Name, capacity, program, active |
| Schedule Templates | Site schedule patterns | Name, schedule type, weekdays, active |

Technical metadata (IDs, keys) lives under **Advanced** only.

## Screenshots

Captured by `web/playwright/tests/configuration-runtime-locations.spec.ts`:

- `01-locations-section.png`
- `02-programs-section.png`
- `03-rooms-section.png`
- `04-workspace-detail.png`
- `05-full-bos.png`

## Related

- `docs/system/configuration-mode-doctrine.md`
- `docs/system/configuration-workspace-v1-doctrine.md` — Organization domain
