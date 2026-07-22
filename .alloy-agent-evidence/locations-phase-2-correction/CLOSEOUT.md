# Locations Phase 2 Correction — Closeout

**Base:** `44af155b9`  
**Correction commit:** `7f9b9ebe2`  
**Sprint:** org-runtime-realization · slot 4 · branch `agent/cursor/4-org-runtime-realization`  
**Local only:** not pushed / not promoted

## Commit

`7f9b9ebe2` — `fix(locations): master-detail landing, schedule day/repeats, instant Tours`

## A–C. Master-detail (Programs parity)

### Changes
- Collection rail **always mounted** in `xl:grid-cols-[20.5rem_minmax(0,1fr)]` when Locations exist.
- Right workspace swaps in place: `LocationsLanding` ↔ selected `ConfigDetailRuntime`.
- `allowRetainedRestore: false` in `useLocationsConfigurationSettings` — empty `locationId` is a legitimate portfolio landing.
- Removed Continuity→URL auto-open restore effect.
- Soft-nav uses `router.push(..., { scroll: false })` + `history.replaceState` guard (Programs pattern).
- Loading uses same-geometry skeleton (no full-page “Loading locations” empty state).
- Collection posture copy no longer shows Average Readiness / Need Attention %.

### Shared primitives reused (not forked)
- `resolveLocationsSelection({ allowRetainedRestore: false })` — existing adapter flag
- `ConfigurationContext` / `ConfigurationShell` / `ConfigDetailRuntime` / `ConfigWorkspaceCard`
- Continuity `rememberLocationSelection` as **memory only**, not selection authority over empty URL

No new shared Configuration Runtime package was extracted; the Programs/Locations adapters already encode the law.

## D–I. Schedule Definition model (v2)

### Operator model
| Dimension | UI label | Canonical values |
| --- | --- | --- |
| Day type | Day type | `full_time` \| `part_time` \| `hourly` |
| Repeats | Repeats | `continuous` (“Every week”) \| `rotating` (“Rotating weeks”) |
| Days | Available days / per week | weekday ints `0–6` (Sun–Sat) |
| Hours | Start / End | local `HH:MM` wall clock in metadata |
| Rotation | 1–8 weeks | each week owns days + hours |
| Anchor | — | `rotation_anchor_date` optional ISO date |

**Not mutually exclusive:** Day type × Repeats.

### Storage
- Native: `schedule_type_key` = day type (`full_time` / `part_time` / `hourly`); `weekdays` = union of active days.
- Metadata v2 via `writeScheduleDefinitionMetadata` / `readScheduleDefinitionPresentation`.
- V1 compatibility: `migrateV1ScheduleMetadata` — `full_day→full_time+continuous`, `part_time/hourly→continuous`, `rotating→rotating` with **`dayType: null` + `needsDayTypeReview`** (no invented day type).

### Defaults
- New definitions: **no days preselected**.
- Rotation week bound: **1–8** (`SCHEDULE_ROTATION_WEEK_MAX`).

### Rotation anchor decision
- Field supported in metadata (`rotation_anchor_date`).
- **Not required in Locations UI yet.**
- Documented Scheduling blocker: `ROTATION_ANCHOR_SCHEDULING_BLOCKER` — Scheduling cannot deterministically project active week until anchor is set.

## J. Program / Room / Schedule relationship (chosen)

```text
Location
  ├── Schedule Definitions[]     ← catalog SoR (many)
  ├── Rooms
  │     metadata.schedule_pattern_id?  ← 0..1 optional default hint only
  │     metadata.supported_program_keys[]
  └── Location Program offerings (LPC)  ← does NOT own schedule lists

Enrollment
  schedule_assignments.schedule_pattern_id → one definition from Location catalog
```

Room does **not** own the exclusive pattern set for Scheduling. Enrollment resolves from the **site catalog** (+ schedule rules), not room metadata. Room field labeled **Default schedule**.

## K–L. Tours load path

### Diagnosis (before)
- Panel mounted only after first Tours tab (`toursKeepAlive`).
- Location select already fetched `/api/admin/tours/availability-rules` for a boolean badge and **discarded rules**.
- Client cold-started with literal `Loading…`.

### Implementation (after)
1. `loadLocationTourRules` / `peekLocationTourRules` in `locationConcernCache`.
2. Owned-setup fetch now populates the full rules cache.
3. Prefetch on Location select; `toursKeepAlive` armed on select.
4. `TourAvailabilitySettingsClient` seeds from peek; request-seq stale guard; Alloy pulse pending instead of `Loading…`.
5. Add tour window remains immediately available.

### Latency (authenticated localhost evidence)
| State | Observation |
| --- | --- |
| First Tours paint | No `Loading…`; Add present; pending skeleton only if cold (`qa-notes.json`) |
| Warm revisit | No `Loading…`; Add present |

## M. Scheduling consumption vocabulary

Use these terms (not “schedule pattern” for everything):

- **Organization Program** — org catalog identity
- **Location Program offering** — LPC row (local name, availability dates)
- **Room** — capacity + supported program keys + optional default Schedule Definition
- **Schedule Definition** — Location-owned; `dayType`, `patternType`, `weeks[]`, hours, optional `rotation_anchor_date`, effective dates later
- **Tour Availability Window** — separate concern; days/times/duration/capacity; not child attendance schedule

## Tests
- `schedulePatternAndRoomMetadata.test.ts` — v2 dimensions, V1 compat, rotating review
- `configurationRuntimeLocations.test.ts` — master-detail landing, schedule day/repeats, Tours cache
- Production `npm run typecheck` — pass

## Authenticated evidence
`.alloy-agent-evidence/locations-phase-2-correction/`
- `01-landing-with-rail.png`
- `02-overview.png`
- `03-schedule.png`
- `04-tours.png` / `05-tours-warm.png`
- `qa-notes.json`
- `alloy-agent-verify 4 route /organization/locations` — PASS

## Remaining blockers (do not block this correction; block Scheduling)
1. `rotation_anchor_date` operator UX + week-start doctrine for projection
2. Hourly variable arrival/departure behavior (keep day type only)
3. Location operating-day filter for available-day chips (operating windows exist; not wired here)
4. Promoting room default to multi-select supported definitions — only if product requires it

## Staging promotion recommendation
**Ready for promotion with Programs** after Kelly reviews this correction commit, provided:
- Landing keeps the rail (verified)
- Day type ≠ Repeats (verified)
- Tours has no literal Loading… (verified)

**Do not promote** if any of those regress. Nothing pushed from this worktree.
