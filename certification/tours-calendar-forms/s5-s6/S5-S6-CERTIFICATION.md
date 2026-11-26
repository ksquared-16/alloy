# S5/S6 — Location Operating Calendar + Tour availability — certification record

Sprint: Tours, Operating Calendar & Public Forms · slices S5 + S6 · **commit-only, not promoted.**
Lane: Enrollment (`lane_2cea84351d90`) · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_eb07d9a3176b60e7`.

| | SHA |
|---|---|
| Starting sprint HEAD | `3d2a293b0` (S4 record) — S3 `e637db1f1`, S4 `54d6788db` ancestors, preserved |
| Starting `origin/staging` | `33426b634` (8 commits ahead: #1598 `f6b531629` roster V7 K1 whereabouts; #1599 documents D4.7 evidence) |
| Staging reconciliation | `aab778872` — explicit `--no-ff` merge, no rewrite, no conflicts |
| S5 | `b113ea947` |
| S6 | `bfef38fe5` |

## Staging catch-up

#1598 touches `buildCombinedRoster.ts`, `attendanceOverviewModel.ts`, `dailyOperatingState.ts`, `DailyRoster.tsx`
(physical-occupancy ratio, `presentChildRoom`). No closure semantics; no committed-file overlap with S1–S4. #1599
is documents certification evidence. The one overlap was the **dirty** working-tree census file
`certification/migrations/hosted-migration-identity-census.sql.results.json`, which staging also changed. It was copied
aside byte-exact (blob `adae51d9`), the merge took staging's committed version, and the dirty content was restored:
`git status --porcelain --untracked-files=all` is byte-identical before and after the merge and after each commit
(2,558 untracked paths, including all enrollment census files; 136 under `certification/enrollment/`).

## Calendar authority — why the ledger, and how far

Director rule: reuse the Operational Expectations closure authority if its invariants allow it. Verified:

| Invariant | Finding | Consequence |
|---|---|---|
| Subject / grain | `subject_kind` is free text; Attendance interprets only `site` / `operational_group` / `child` under its own purpose (`INTERPRETED_EXPECTATION_PURPOSES`) | A new purpose with subjects `organization` / `site` is invisible to Attendance's existing reader — no historical reinterpretation |
| Lifecycle | append-only; `revise` / `correct` ratified; `cancel` / `replace` fail closed | Withdraw = revision to `calendar_entry_withdrawn`; restore = revision back |
| Revision semantics | a revision truncates its predecessor at its own `valid_from` ("re-plan forward") | Moving an entry LATER would leave its first days in force → revision frames start at the earlier of old/new start, and the entry's dates live in `params.from_date..to_date` (negative control: removing this fails the test) |
| Partial-day | the temporal frame is a timestamptz window | Fits; V1 stores one daily wall-clock interval in params applied to every date in the range |
| Modified hours | an `intended` expectation with parameters | Fits the grammar (no sensor keys) |
| Org scope | allowed by the grammar | Resolved by CALENDAR DATE at each site (an org holiday is each site's own Dec 25) |
| Attendance history | UTC-bounded service days (`serviceDayValidWindow`) | Unchanged. The calendar resolver reads those rows through `serviceDayExpectationRelevance` at `serviceDayAsOf` — their stored meaning |
| Query seam | **defect found**: rows were loaded only if their window touched the coordinate, so a shortening revision never reached the fold | Fixed in the shared seam (`completeExpectationLineages`); negative control fails without it |

**No migration.** No schema change; the purpose is activated in `activatedAuthoringPurposes.ts` (the
`scopedAuthoringActivation` tripwire now names both purposes). Writes go only through `author_operational_expectation`.

## Location time and precedence

- Frames: local midnight → local midnight after the last date, in the site's zone (`resolveLocationTimezone`: location
  → organization) or, for an organization default, the organization's operational zone. No zone → refused (409), never
  UTC by default, never the browser.
- DST: a fall-back day closure covers 25 h; modified hours keep wall time across spring-forward; a wall time that does
  not exist (02:30 on spring-forward) is refused naming the date. Intervals crossing midnight are refused (supported
  limitation).
- Precedence: explicit **location** entry (any operational effect) → **organization** default → ordinary schedule.
  Inside a scope: full closure wins; multiple modified hours intersect; partial closures subtract; contradictions resolve
  restrictively **and** are returned as conflicts. Order-independent (tested both ways). Unresolved lineages make a date
  `unresolved`, which Tours treats as closed.
- Room scope: not a calendar scope. Attendance room closures are listed for the room and never close the site.

## Operator configuration (Locations → Scheduling → Operating calendar)

List of upcoming/past entries with scope badge (This location / Organization default · inherited / Recorded in
Attendance / Room), dates (one row for a multi-day closure), effect and hours; add holiday / closure / modified hours;
edit, withdraw (Reopen), restore; "Exception here" for an inherited org entry; **Review impact** (dates, hours before →
after, per location, conflicts, bookings newly affected / no longer affected) then **Save**. Edit controls render only
where the server will allow: `settings.manage` (`requireOperatingCalendarCapability`), plus unrestricted site scope for
an organization default or the site in scope for a location entry. Stale edits (naming a superseded act) → 409.

## Tours (S6)

`computeAvailableTourSlots` applies the calendar to generated slots — the only slot authority, so operator picker,
public slots, invitations, `assertSlotAvailableForWrite` (create / confirm / reschedule) and the public book/reschedule
revalidation all agree. The `requested` path, which skips slot validation, now calls `assertTourIntervalOperating`.
Bookings are counted before the filter, so a closed slot's bookings keep consuming capacity; the S1 trigger is
untouched.

Existing bookings: never cancelled, moved, refunded or messaged. `tourCalendarAttention` derives on read which active
bookings the calendar excludes (named entries that cause it) — shown in the calendar panel (link to the person record),
in the impact review, and on the opportunity tour drawer, with resolution through the existing reschedule / cancel.
No stored flag, no Work Item, no parallel booking state.

## Evidence

| Gate | Result |
|---|---|
| Unit — `tests/operatingCalendar/*` (resolver, time/DST, revision/withdraw, precedence, isolation, lineage seam, authority route, Attendance bridge, kiosk, rendered panel) | 56/56 |
| Unit — `tourBookingService.test.ts` (requested path asks the calendar; closed → refused before any write) | 4/4 |
| Live cert DB — `tests/operatingCalendar/live/operatingCalendar.live.test.ts` | 9/9 |
| Live cert DB — `tests/tours/live/tourOperatingCalendar.live.test.ts` | 10/10 |
| Live regressions — S1 `tourBookingSafety.live` (4-writer capacity race, raw-insert 23P01), S3 `tourWeeklySchedules.live` | green with the calendar in the slot path |
| Negative controls | seam fix removed → 1 fail; revision-frame rule removed → 1 fail |
| Affected batch (720 files: tours, operatingCalendar, location(s), opportunities, roster, childcareOperational, operationalExpectations, access, lifecycle, platform/commands, metrics/attendance, combinedRoster) | 164 failing tests, **all identical on base `aab778872`** (probe worktree); one extra (`adminAddChargeRegression.live`) passes 5/5 alone — shared-stack collision. **0 new** |
| `npm run prebuild` (6 guards; route declared: GET `none`, POST `settings.manage` / `requireOperatingCalendarCapability`) | rc=0 on both slices |
| `vac validation-classify` | `build_sensitive` (route added) |
| Typecheck + test typecheck (`tsc --noEmit -p tsconfig.json` — includes `app/`, `lib/`, `components/` AND `tests/**`, a superset of `tsconfig.build.json`) | **PASSED** on exact candidate `56ea0a1ed2e91d6583e4f41d3a18630536044c58`, Vacilando detached request `vreq_64ab71374c6f` (receipt: claim `vcl_mvoxg4o3_1`, waited 106 s, ran 119 s, exit 0). Two earlier requests never ran (`vreq_f25295856ada` capacity TIMEOUT; `vreq_3451cfe59a62` broker died in capacity recovery) — infrastructure, not code |
| Production build | **Deferred** to the sprint's integrated checkpoint (one build, mandatory) |
| Browser QA | Not run (rendered-markup tests only; no authenticated browser session was restored) |

Live residue (append-only ledger, by doctrine): throwaway orgs `zz-s5-*` (3) and `zz-s6-*` (7, one per iteration run) remain with their
`operational_expectations` rows; every calendar entry was withdrawn (inert), and all locations, rules, bookings,
opportunities, persons and settings were removed. The org rows cannot be deleted because the ledger's DELETE trigger
also blocks the org cascade.

## Boundaries held (future contracts, not implemented)

- **Financials**: no charge, proration, refund, due-date or late-fee change. Contract: a future consumer reads
  `resolveOperatingCalendar` days (status/openIntervals), never ledger rows.
- **Staffing**: no change to supply, coverage or assignments. Contract: modified hours / partial closures as a demand
  window input.
- **Communications**: calendar authoring enqueues nothing (live: message count unchanged). Contract: an explicit,
  operator-initiated "notify affected families" action over `tourCalendarAttention`, never automatic.
- **Attendance**: partial closures / modified hours are not consumed by the projection (early-dismissal contract).

## Remaining debt / S7 dependencies

1. Two closure **authoring** paths into one ledger and one resolver: Attendance's "Close today" and the calendar.
   Recommended: converge `closeOperatingGrain` onto the calendar command (site scope) so one authoring path remains.
2. Attendance closures stay UTC-bounded service dates (historical meaning preserved); the calendar reads them as such.
3. No database-level calendar guard: app writers are covered, but a raw `tour_bookings` insert is constrained only by
   the S1 capacity trigger (as before). A closure authored between a writer's check and its insert is surfaced by
   attention, not prevented.
4. Recurrence (e.g. "every Thanksgiving") is not modelled; entries are dated.
5. `reopenClosedScheduledTour` restores a lifecycle status without a calendar check (restoring an existing booking, not
   creating one).
6. Focus-panel tour card still formats in the viewer's zone (from S3).
7. Owner map: no certified owner-map / lane row for **Locations** or **Tours** (D0). Proposed: *Operating Calendar* owned
   by Locations (authoring, vocabulary, resolver), consumed by Tours and Attendance; Operational Expectations owns the
   ledger. Not asserted as certified here.
