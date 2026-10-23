---
owner: platform
status: proposed
last_reviewed: 2026-10-23
supersedes: []
---

# V7 consolidated operational convergence audit

Read-only. Deployed staging `502d5975` (= `origin/staging`). Evidence: code read at that exact commit;
runtime probes run against byte-identical modules (`resolveAttendanceSubject`, `attendanceWhereabouts`,
`resolveCurrentWhereabouts`, `loadOperationalExpectationInputs`, `scheduleExpectationCore`) — probe sources
and outputs kept with the lane's session evidence, not committed. "Code-proven" = the defect follows
deterministically from the cited lines; "runtime-proven" = reproduced by a probe.

## 1. Consolidated findings

| ID | Capability | Owner | Verified behaviour | Exact gap | Action | Approval |
|---|---|---|---|---|---|---|
| A1 | Card room picker + server space-use check | enrollment-placement | Picker filters by `spaceEligibleForUse`; `createOperationalAssignment` and `setPrimaryOperationalAssignment` assert it; placement rooms are classroom-only by DB trigger | — | **COMPLETE_NO_CHANGE** | — |
| A2 | Multiple assignments per child | enrollment-placement | Create / edit / duplicate / archive per row | — | **COMPLETE_NO_CHANGE** | — |
| A3 | Tuition matching | commercial | Only the primary prices tuition (`assignmentPricingFacts`); secondaries skip the quote by design | — | **COMPLETE_NO_CHANGE** (V7-05 owns any change) | — |
| A4 | Secondary end date and hours | enrollment-placement | Editor shows End / Open-ended / hours; `save()` sends only pattern, start, room, label (`SchedulingCard.tsx` save) — never `end_date`, never `assignment.set_time`; per-day hours never re-seeded on reopen | Edits silently dropped; reopen blank | **DEFECT_CONFIRMED** (code-proven) | slice S3 |
| A5 | Editing an enrolled child's primary | enrollment-placement | Card posts to `/api/admin/scheduling`; with an agreement the route always runs `schedule.create` → `commitCreateSchedule` → `conflict` when a primary exists (`commit.ts:58-70`) | Edit can never succeed | **DEFECT_CONFIRMED** (code-proven) | slice S3 |
| A6 | Custom weekdays | enrollment-placement | `resolveWrittenSchedulePattern` falls back to `ofType[0]` when no pattern of the chosen type has the chosen days | Saved days ≠ chosen days, silently | **DEFECT_CONFIRMED** (code-proven) | slice S3 |
| A7 | Bulk actions report failures | enrollment-placement | `assignmentRosterBulkHandlers` ignores `res.ok` for archive, make-primary, create (only room change checks) | Failures look like success | **DEFECT_CONFIRMED** (code-proven) | slice S3 |
| A8 | "Make primary" (card, detail, roster bulk) | enrollment-placement | Inserts a new primary copying the source's **category and room**, supersedes the old primary and moves the placement, but **never ends the source secondary** (`setPrimaryOperationalAssignment.ts` insert ~471-496) | Duplicate participation; primary gains a category; operators still choose Primary although V7 derives homeroom | **DEFECT_CONFIRMED** + **POLICY_DECISION_REQUIRED** (P1) | P1, then S3 |
| E1 | One scheduled assignment → expectation | operations-temporal | One entry per pattern day, placement room | — | **COMPLETE_NO_CHANGE** | — |
| E2 | Expectation across a future-dated change | operations-temporal | Supersession marks the old primary `superseded` at once; the loader reads only `planned/active/ending`. **Probe:** enrolled child, old primary to 19 Nov, successor from 20 Nov → no expectation 16–19 Nov | Enrolled child disappears from expected attendance until the change starts | **DEFECT_CONFIRMED** (runtime-proven) | slice S2 |
| E3 | Secondary sessions (Before/After Care, enrichment, other days, same-day intervals) | operations-temporal | Loader filters `is_primary = true`; category `attendance_participation` is read by nothing in expectations/occupancy/staffing. **Probe:** Before Care in Infant A never expected | Sessions invisible to expected attendance, occupancy, demand | **POLICY_DECISION_REQUIRED** (P2) — the loader itself calls it unratified | P2 |
| E4 | Room of an expectation; two homerooms | operations-temporal | Always the placement room; homerooms not consulted | Follows from E3 | **POLICY_DECISION_REQUIRED** (P2) | P2 |
| E5 | No placement / no homeroom | operations-temporal | Room null, surfaced as `missing_placement_room` | — | **COMPLETE_NO_CHANGE** | — |
| M1 | Check-in / check-out / transfer facts; canonical whereabouts fold; roster + Focus Panel readers | attendance | One fold (`whereaboutsAt`) behind `resolveCurrentWhereabouts` (day board) and `deriveCurrentPresence` (attendance card) | — | **COMPLETE_NO_CHANGE** | — |
| M2 | `attendance.move` source room / guard | attendance | `resolveCurrentRoom` walks events backwards ignoring kind, falls back to placement. **Probe (6 cases):** after check-out → old room (fold: none); after move+check-out → Gym (fold: none); no events → placement (fold: not arrived); absence → placement (fold: absent); only repeated moves agree | A checked-out / absent / not-arrived child can be "moved" and then reads present; the refusal only fires with no placement; service date taken as UTC | **DEFECT_CONFIRMED** (runtime-proven) | slice S1 |
| K1 | Roster actual staffing ratio | operations / roster | Room cells are keyed by the expected (placement) room; `actualChildrenPresent` counts those children if present wherever they are (`buildCombinedRoster.ts:517-519, 604`) | A child moved to the gym still drives the classroom's actual ratio; the gym gets none | **DEFECT_CONFIRMED** (code-proven) | slice S4 |
| K2 | Staffing projection actuals | staffing | Folds `room_transfer`, unique children per room × segment | — | **COMPLETE_NO_CHANGE** | — |
| K3 | Actual compliance (day grain) | attendance | Distinct children per room per day by design | — | **COMPLETE_NO_CHANGE** | — |
| K4 | Physical shell capacity vs classrooms; site total double count | capacity | Exact-room rule matching; pinned debt test (`capacityAggregationDebt`) | Which capacity governs | **POLICY_DECISION_REQUIRED** (P4) | P4 |
| K5 | Ratio in a shared space | capacity | Room context from placements only → shared spaces lose site/age group | Which ratio applies | **POLICY_DECISION_REQUIRED** (P3) | P3 |
| K6 | Secondary-session demand; two-homeroom counting | staffing | Invisible (E3) | Follows P2/P3 | **POLICY_DECISION_REQUIRED** | P2, P3 |
| K7 | Staff supply in two rooms same day (roster day grain) | staffing | Counted full in both day cells; interval projection correct | Day-grain double presence | **POLICY_DECISION_REQUIRED** (P5) | P5 |
| R1 | Roster homerooms 0/1/many | surfaces | "No homeroom" / "Homeroom: X" / "Homerooms: X · Y"; staff keep Primary | — | **COMPLETE_NO_CHANGE** | — |
| R2 | Focus Panel Children: Room | surfaces | Derived set once enrolled | — | **COMPLETE_NO_CHANGE** | — |
| R3 | Focus Panel Children: Schedule line; SchedulingCard child line; BP representative | surfaces | `projectCompactScheduleForIdentity` (`find(isPrimary) ?? [0]`) leads with one room; SchedulingCard shows no homerooms; `assignmentsProjections` shows one room per child | One room per child beside the homeroom set | **CONVERGENCE_REQUIRED** | slice S5 |
| R4 | Projection room for a row without one | surfaces | `placementForAssignment` falls back to `placements[0]` | Can label a row with another date's room | **DEFECT_CONFIRMED** (code-proven, display only) | slice S5 |
| R5 | Expected vs actual, whereabouts | surfaces | Day lens and Attendance card show both from the fold | Expected room is placement-based (E4) | **COMPLETE_NO_CHANGE** pending P2 | — |
| R6 | Three roster tiles per row on desktop | surfaces | Per-subject list is a vertical stack (`AssignmentRosterPanel` `ul.space-y-1.5`) | Presentation | polish in slice S5 | Director (requested) |
| R7 | Mounted Focus Panel Room line | surfaces | Seed tenant's Children card places no Room field | Not rendered in any certification | **CERTIFICATION_GAP** | S5 QA |
| O1 | `deriveSchedulingWork.ts` (+ its test) | scheduling | 0 runtime callers (verified) | — | retire now (with any slice) | — |
| O2 | `resolveDraftChargeForAgreementPeriod` | financials | 0 runtime callers (verified) | — | retire with financials lane sign-off | Financials |
| O3 | `resolveCurrentRoom` | attendance | Only caller is the M2 guard | — | retire in S1 | — |
| O4 | Category behaviour fields `primaryEligible`, `requiresProgram/Room`, `eligibleSpaceMode`, `eligibleRoomIds`, behaviour `locationIds` picker scoping | configuration | Superseded by space Uses; stored in `default_behavior` JSON | Need a stored-JSON census first | retire in a configuration cleanup (O-slice) after census | — |
| O5 | Make-primary UI, `bulk_primary_change`, archive-primary message | enrollment-placement | See A8 | — | retire with P1 | P1 |
| O6 | `is_primary`, primary uniqueness/overlap, `setPrimaryOperationalAssignment` service | many | Pricing, materialisation, expectations, `/api/v1` read it | — | **KEEP** until V7-05/V7-06 policies land | — |
| O7 | Already gone (verified 0 hits) | — | `WorkspaceCreateAssignmentModal`, `AssignmentTimeline` component, `filterRoomsForPurposeBehavior`, `eligibleCatalogCategories`, card `change_kind`, `resolveDraftPrimaryRooms`, the zero-caller agreement/placement exports | — | done | — |

## 2. Policy decisions (Director)

- **P1 — Operator "Make primary".** Recommend retiring it from the UI: the enrollment anchor is the
  enrollment's own schedule; homerooms are derived. Keep the service for enrollment/pricing paths.
- **P2 — Per-session expected attendance.** Should each assignment whose category has
  `attendance_participation = expected` produce its own expectation (its room, days, hours)? The authority
  exists and is unused. Decides E3/E4/K6 and whether a child with two homerooms is expected in both.
- **P3 — Ratio in a shared space** (the space's own rule, the child's homeroom's, or the site's).
- **P4 — Physical shell vs classroom capacity authority** (and the site total).
- **P5 — Staff supply at day grain** when a person works in two rooms the same day.

## 3. Minimal remaining slices

| Slice | Kind | Owner | Files | Reuses | Removes | Net | Acceptance |
|---|---|---|---|---|---|---|---|
| **S1** move guard on canonical whereabouts | defect | attendance | `childAttendanceActions.ts`, `resolveAttendanceSubject.ts` | `whereaboutsAt` / `resolveCurrentWhereabouts` | `resolveCurrentRoom` | negative | the six probe cases: move refused unless `present`; from-room = fold room; local service date |
| **S2** date-true expectation rows | defect | operations-temporal | `loadOperationalExpectationInputs.ts`, `scheduleExpectationCore.ts` (pick the row covering each date) | the homeroom window rule | — | ~0 | probe: 16–19 Nov expected in T2; no double entry on the change day; live expectation suites green |
| **S3** Assignment Card save truth | defect | enrollment-placement | `SchedulingCard.tsx`, `/api/admin/scheduling` route (route enrolled edits to the participation change command), `writtenSchedulePattern.ts`, `assignmentRosterBulkHandlers.ts` | `assignment.set_time`, `apply_participation_operational_change` | dead UI branches; Make-primary UI if P1 | negative | mounted: secondary end date + hours + per-day hours round-trip; enrolled primary edit saves; custom days saved as chosen or refused; bulk failure shown |
| **S4** roster actual ratio by whereabouts | defect | operations / roster | `buildCombinedRoster.ts` | `resolveCurrentWhereabouts` (already computed per child) | — | small | a moved child counts in the destination's actual ratio, not the origin's |
| **S5** presentation convergence | convergence + polish | surfaces | `projectCompactScheduleForIdentity.ts`, `SchedulingCard.tsx` child line, `assignmentsProjections.ts`, `buildSchedulingProjection.ts` (`placements[0]`), `AssignmentRosterPanel.tsx` (three tiles) | `homeroomLabel` | first-row room guesses, `placements[0]` fallback, `deriveSchedulingWork` | negative | mounted: card/children/BP lines show the homeroom set; three tiles per row ≥ lg; a tenant with the Room field placed |
| **S6** per-session expectations | approved-behaviour (after P2) | operations-temporal | expectation loader/core, occupancy, staffing demand | category `attendance_participation`, assignment intervals | primary-only filter | moderate | live multi-session suites |

Eliminated from the backlog: an Assignment editor redesign (V7-04 as scoped — the card works; it needs
the S3 save fixes, not a new editor); a new movement / whereabouts system (V7-07 — one canonical fold exists;
S1 is a guard fix); a new capacity/staffing engine (V7-08 — remaining work is policy P3–P5 plus S4).

Recommended next slice: **S1** (independent, smallest, runtime-proven, attendance-only), then **S2**.
