---
owner: platform
status: proposed
last_reviewed: 2026-10-22
supersedes: [docs/platform/planning/assignment-category-option-c-decision-packet.md]
---

# Assignments & Spaces V7 — Master Plan (Slice 1 discovery)

Status: **PROPOSED — Slice 1 discovery complete; implementation needs Director approval per slice.**
Evidence base: staging/deployed `8bb731ea`; deployed-database census 2026-10-22; mounted read-only
pass of Rooms and Assignment Categories; four read-only code surveys (attendance/movement,
placement/homeroom, space configuration, removal census). Supersedes the Option C v2 packet wherever
it conflicts with the ratified V7 principles (homeroom derived from space use; no operator
Primary/Secondary; pricing never decides homeroom).

## 1. Master tracker

| ID | Item | State | Owner lane | Depends on | Next evidence |
|---|---|---|---|---|---|
| V7-01 | Canonical model + impact census | **COMPLETE** (this document) | enrollment-placement | — | — |
| V7-02 | Space configuration and purpose/use | **V7-02a PROMOTED & DEPLOYED-VERIFIED** (#1583, merge `1c7e4ccd`, 2026-10-23); V7-02b (S3) not authorized | enrollment-placement (+configuration) | V7-01 | §10–11 |
| V7-03 | Multiple assignments + derived homerooms | **PROMOTED & DEPLOYED-VERIFIED** (#1587, merge `502d5975`, 2026-10-23) | enrollment-placement | V7-02 | §12–13 |
| V7-04 | Assignment Card (was "Add Schedule experience") | **S3 COMPLETE** — promoted as #1590 (merge `f16bee5e`, 2026-10-23), deployed-verified; A4–A8 repaired, child Make Primary retired (P1) | enrollment-placement (UI) | — | §16–17 |
| V7-05 | Enrollment & commercial separation | → **Package 3** (verify C1/C3; C2 only on an approved gap) | commercial + financials | V7-03 | §18 P-3 |
| V7-06 | Expected attendance | **P-1 1A implemented** (E2 + own-week recurrence); per-session S6 = decision packet D1–D4 (§19) | operations-temporal | P2 for S6 | §18 P-1 |
| V7-07 | Actual attendance and room movements | **S1 COMPLETE** — promoted as #1589 (merge `7e7019c4`, 2026-10-23), deployed-verified | attendance | — | §14–15 |
| V7-08 | Capacity, ratios, staffing | **P-1 1B implemented** (K1); P3–P5 policy; no new engine | staffing/capacity | P3–P5 | §18 P-1 |
| V7-09 | Roster and Focus Panel | → **Package 2** (R4 defect; R3 convergence; R6 three tiles; R7 cert gap) | surfaces | — | §18 P-2 |
| V7-10 | Secondary/staff change-event parity | → **Package 3** (E1 ruling; secondary/staff writers emit nothing today) | operations-temporal + integrations | E1 | §18 P-3 |
| V7-11 | Obsolete code and architecture retirement | O3 retired (S1), O5 retired (S3/P1); O1, O4 → **Package 2**; O2 with financials sign-off; O6 keep | each package's owner | each replacement | §18 P-2 |
| V7-12 | Full cross-domain certification | NOT_STARTED — one plan after the packages | all | Packages 1–3 | §18 |

Order (Director, 2026-10-23, after S1 and S3 closed): **Package 1** (schedule & operational truth) →
**Package 2** (operator experience & retirement) → **Package 3** (commercial & events) → **V7-12**
certification — §18. The standalone slices S2, S4, S5, S6, V7-02b are folded into the packages.

## 2. Current → target authority map

| Object | Owns today | Writers | Readers | Target responsibility |
|---|---|---|---|---|
| `locations` (unit) + `unit_role` | structure: `operational_group` = cohort/ratio/staffing/placement unit; `physical_space` = licensed container; `shared_space` = playground/gym (attendance yes, placement no) | Rooms editor (`POST/PATCH /api/admin/locations`), topology guards | pickers (`assignableClassrooms`), placement trigger, staff-room rule, ratio roster, capacity kind, occupancy by physical space | **unchanged**: structural truth and its invariants |
| Room metadata | `supported_program_keys` (editor writes; placement never reads), `category` (legacy mirror), `program_category_id` (**read by fit/pickers, written by nothing**), `schedule_pattern_id` (editor only) | `writeRoomProgramsAndScheduleMetadata` | editor; `loadSiteOperationalRooms`; `generatePlacementOptions`; scheduling projection | **one program-eligibility key** (`supported_program_keys`) + **`space_uses`** (the categories a space serves) |
| `operational_assignment_types` (category) | purpose + typed participation columns + advisory `default_behavior` | Studio (`/api/admin/assignment-types`) | pickers (behavior), staff supply (`staffing_participation`), projection labels | **participation policy** (attendance/billing/staffing columns) + `homeroom` semantic; no room lists, no primaryEligible |
| `schedule_assignments` | scheduled participation; `is_primary` = enrollment base schedule (V6) | `createOperationalAssignment`, `replace_secondary_schedule_assignment`, `apply_participation_operational_change`, `setPrimaryOperationalAssignment`, materialization, `/api/v1` | everything in §3 of the V6 reports | **sole participation authority**; many per child; `is_primary` narrowed to the **enrollment anchor** (system-set, never operator-chosen) until V7-05/06 retire its readers |
| `child_placements` | home room + program, one live per agreement | placement service, primitive RPC, setPrimary sync, materialization, `/api/v1/placements` | expectations room/program, age groups, attendance default room, pricing program, draft-charge rate program, financial subjects, roster, focus panel, external API | **narrowed** to the enrollment's program/licensing record; **homeroom display and occupancy move to derived homerooms**; retained until its readers converge |
| `child_enrollment_agreements` | the commitment (one per child per site) | materialization, agreement service | everything | unchanged |
| `program_offerings` / variants / rates | priced offering per (program, attendance type) | Commercial config | `resolveAssignmentPricingOptions` | unchanged; offering ↔ session relationship is a V7-05 decision |
| `enrollment_pricing_terms` | accepted tuition, one live per OCM per date | `acceptEnrollmentPricingTerm` | `generateTuitionCharges`, tuition view | unchanged until V7-05 |
| Process-instance proposal | pre-enrolment participation facts (`program_room_cohort_key` scalar) | `applyChildParticipationEdit` | materialization (`resolveEnrollmentFactsForProcessInstance`), roster draft room | unchanged; draft room → derived homeroom of the proposal |
| `child_attendance_events` | actual presence; `room_transfer` already exists; append-only with corrections | `recordAttendanceEvent` (RPC), kiosk, admin, external, `attendance.move` | `whereaboutsAt`, occupancy folds, roster actual room, compliance | **unchanged** — movements stay attendance facts |
| Expectations (`loadOperationalExpectationInputs`) | base-schedule-only (V6-B) | — | attendance, occupancy, capacity, staffing, rosters, card | set-aware per V7-06 |

## 3. Implementation gap matrix

| # | Existing capability | Missing / wrong | Canonical owner | Correction |
|---|---|---|---|---|
| G1 | `unit_role` 3-value structure | no "use/purpose" of a space | locations | `metadata.space_uses` = category ids (no new taxonomy; the category list IS the use vocabulary) |
| G2 | `supported_program_keys` written by editor | readers use `program_category_id`, which nothing writes → `program_match` matches every room, room-fit ignores programs | locations | converge readers on `supported_program_keys` (resolved to category ids); delete the dead key reads |
| G3 | category `eligibleRoomIds/eligibleSpaceMode` | duplicates space ownership, UI-only | categories → spaces | invert to `space_uses`; migrate existing lists (config migration) then remove behavior keys |
| G4 | `primaryEligible`, `billingExpectation`, `eligibleCatalogCategories`, `allowsOverlap`, `programRequirement`, `locationIds` | display/UI-only; contradictory billing | categories | delete; participation columns authoritative; `homeroom` semantic added |
| G5 | many assignments per agreement | only the anchor counts anywhere; no homeroom set | assignments | derived homeroom read model (V7-03) |
| G6 | placement one per agreement | cannot express two homerooms | placement | narrow placement; homerooms derived (no uniqueness change) |
| G7 | `room_transfer` + `whereaboutsAt` | `resolveCurrentRoom` duplicates and diverges (ignores check-out; falls back to placement); day-level `roomsObserved` counts a child in every room visited | attendance | converge `resolveCurrentRoom` on the fold; time-aware occupancy (V7-07) |
| G8 | Operator chooses Primary/Secondary | arbitrary choice; Set Primary, Make Primary, bulk primary, chips | assignments UI | anchor becomes system-set; UI removes the choice (V7-04/09) |
| G9 | `/api/admin/scheduling?view=options` | passes `childAgreementId` as a customer member (`route.ts:517`) → program never weighed | scheduling | fix in V7-02a (it is the space-eligibility path) |
| G10 | shared spaces exist (DB) | Rooms UI cannot set `shared_space`; pickers exclude non-groups | locations / pickers | restore "Shared"; pickers driven by `space_uses` + role rules |
| G11 | ratio rules | no DB role guard (UI-only) — a physical container could gain a ratio | capacity | service/DB guard: ratio/operational capacity only on `operational_group` |

## 4. Removal matrix

| Symbol (file) | Callers today | Replacement | When |
|---|---|---|---|
| `WorkspaceCreateAssignmentModal.tsx` | none (comment only) | — | **now** (V7-02a) |
| `AssignmentTimeline.tsx` component | none | — | **now** (V7-02a) |
| `filterRoomsForPurposeBehavior` (assignmentTypeBehavior.ts:160) | dead modal + test | single space-eligibility function | **now** (V7-02a) |
| `eligibleCatalogCategories` | Studio only | — | **now** (V7-02a) |
| `change_kind` payload (SchedulingCard.tsx:2669) | no server reader | — | **now** (V7-02a) |
| `deriveSchedulingWork.ts` module, `agreementStatusById`, `getLatestAgreementForMemberSite`, `isCurrentOperationalPlacement`, unused `effectiveDating`/`enrollmentOperationalStatus` predicates, `resolveRatioCapacityForStaff`, `isOperationalPlacementRow` | test-only / none | — | **now**, after a per-symbol grep in the slice |
| `scopeRoomsForAssignmentPicker`, `roomsForEveryCategory`, `eligibleSpaceMode`, `eligibleRoomIds`, behavior `locationIds` | SchedulingCard, roster bulk, Studio | `spaceEligibleForUse()` over `space_uses` + unit_role rules | V7-02b (with the config migration) |
| `primaryEligible`, `billingExpectation` + `billingParticipationFromExpectation`, `allowsOverlap`, `programRequirement`/`requiresProgram`, `roomRequirement`/`requiresRoom` | Studio; SchedulingCard `canSave`; create modal | participation columns; space uses | V7-02b |
| `billingFromType` label heuristic (buildSchedulingProjection.ts:83-92) | projection labels | `billing_participation` column | V7-02b |
| Set Primary / Make Primary / `onBulkMakePrimary` / `bulk_primary_change` tile / primary chips / archive-primary guard / `createAsSecondary` branches | SchedulingCard, AssignmentSummaryDetail, AssignmentRosterPanel, SchedulingActions, SchedulingRoster | system-set anchor; homeroom chips | V7-04 (with the Add Schedule flow) |
| `assignment.set_primary` action + `setPrimaryOperationalAssignment` | the UI above, `/api/admin/schedule-assignments`, external change | anchor moves only through enrollment edits; operator homeroom changes are ordinary assignment changes | V7-04 UI removal; service retained until V7-05/06 readers no longer need the anchor |
| `assignment.change_room` (registered, catalog-only) | agent catalog, one live test | `assignment.create` with supersede | V7-04 |
| First-row fallbacks (`projectCompactScheduleForIdentity:164`, `assignmentProgramRoomGating:24`, `buildAssignmentRosterReadModel:584`, `AssignmentRosterPanel:660`, `SchedulingCard:1366/1828`, `buildSchedulingProjection:574/1121/1158`) | identity line, gating, roster, editor | derived homerooms (0/1/many, shown as a set) | V7-03 (read model) / V7-09 (surfaces) |
| Placement as homeroom reader (expectations room, roster, focus panel labels) | §2 | derived homerooms | V7-06/V7-09; placement row itself retained (program/licensing) |
| `resolveCurrentRoom` backwards walk | `attendance.move` | `whereaboutsAt` fold | V7-07 |
| `resolveDraftChargeForAgreementPeriod` (write, no prod caller) | tests | preview remains | financials lane decision (not V7 core) |
| `is_primary` column, `ux_schedule_assignments_one_operational_primary_child`, primary overlap trigger, `apply_participation_operational_change` primary branch | anchor readers | — | **V7-11, only after** every anchor reader (pricing, billing preview, expectations, materialization, `/api/v1`) has moved; needs migration + full temporal recert |

## 5. Migration decision packet (only where schema cannot express the model)

| # | Need | Schema change? | Decision |
|---|---|---|---|
| M1 | space uses | **No** — `locations.metadata.space_uses` (jsonb) + code | S1 |
| M2 | move category room lists to spaces | **config data migration** (copy each category's `eligibleRoomIds` onto the rooms' `space_uses`), census first | S3 |
| M3 | homeroom semantic on a category | **No** — category `default_behavior.homeroom` (code-read) or a seeded key convention | H1 |
| M4 | multiple homerooms | **No** — derived from assignments; placement uniqueness unchanged | H2 |
| M5 | separately priced services | **Yes, if approved**: term uniqueness per offering (index swap) | C2 (V7-05) |
| M6 | retire `is_primary` | **Yes, last**: drop index/trigger/primitive branch | V7-11, after measured zero readers |
| M7 | ratio role guard | optional DB trigger (service guard first) | S4 |

V7-02 through V7-04 and V7-06 need **no schema migration**.

## 6. Director decisions

| # | Decision | Recommendation |
|---|---|---|
| S1 | Space uses = the org's assignment categories, stored on the space (`space_uses`), editable in Rooms for every role | Approve |
| S2 | Structural rules: Homeroom use only on `operational_group`; Before/After Care/Enrichment on `operational_group` or `shared_space`; `physical_space` never a staffing unit | Approve |
| S3 | Invert category room lists into spaces (config migration) and remove the category-side lists | Approve |
| S4 | Ratio / operational capacity only on `operational_group` (service guard now, DB guard optional) | Approve |
| H1 | A category carries a `homeroom` semantic; homerooms on a date = the child's live committed assignments whose category is homeroom | Approve |
| H2 | Placement narrowed to the enrollment's program/licensing record; homeroom displays and occupancy move to derived homerooms; no placement uniqueness change | Approve |
| H3 | `is_primary` renamed internally "enrollment anchor": set by materialization/enrollment edits only, never by operators; retired in V7-11 | Approve |
| C1 | Pricing days for a program = union of the agreement's sessions in that program (not the anchor alone) | Approve in V7-05 |
| C2 | Separately priced services via one live term per offering | Decide in V7-05 |
| C3 | Pricing never decides homeroom (already true after V6) — lock with a guard test | Approve |
| E1 | Event parity (V7-10) ruling: which secondary/staff changes emit, under which contract | Director ruling |

## 7. Minimal implementation sequence

| Slice | Outcome | Lane | Adds | Removes | Net | Gates | Approval |
|---|---|---|---|---|---|---|---|
| **V7-02a** | Spaces declare uses; one eligibility function; program key fixed; dead code gone | enrollment-placement | `space_uses` editor section + reader, `spaceEligibleForUse()` | dead modal, dead timeline, `filterRoomsForPurposeBehavior`, `eligibleCatalogCategories`, `change_kind`, dead exports; `program_category_id` dead reads | **negative** | unit + live picker/eligibility; mounted Rooms + editor | S1, S2, S4 |
| V7-02b | Category room lists moved to spaces; behavior keys retired | enrollment-placement | config migration | `eligibleSpaceMode/eligibleRoomIds/primaryEligible/billingExpectation/allowsOverlap/...`, 2 room filters | negative | census before/after; mounted Studio | S3 |
| V7-03 | Derived homerooms read model (0/1/many) | enrollment-placement | `deriveHomerooms()` | first-row fallbacks | negative | live multi-homeroom suites | H1, H2 |
| V7-04 | Add Schedule: space → resolved use/category → days/hours → pricing review; no Primary choice | enrollment-placement (UI) | flow | Set/Make Primary, bulk primary, `createAsSecondary`, `change_room` | negative | mounted flows for every scenario | H3 |
| V7-07 | Current room = whereabouts fold; time-aware occupancy | attendance | — | `resolveCurrentRoom` walk | negative | live movement suites | — |
| V7-06 | Set-aware expectations | operations-temporal | per-session entries, unique-child + per-space measures | anchor-only loader branch | ~0 | side-by-side; recert | after V7-03 |
| V7-08/09 | capacity/staffing/roster/card on derived homerooms + sessions | staffing / surfaces | — | placement-as-homeroom reads | negative | mounted | — |
| V7-05 | commercial separation | commercial + financials | (M5 if approved) | anchor-days pricing | ~0 | financial recert | C1–C3 |
| V7-10 | event parity | operations-temporal + integrations | contract | — | + | contract tests | E1 |
| V7-11/12 | retire `is_primary`; full certification | all | migration | primary index/trigger/branches | negative | full temporal + financial recert | final |

## 8. First implementation slice — V7-02a (prompt for Director review)

> **ALLOY — V7-02a: SPACES DECLARE THEIR USES**
>
> Implement, on current staging, with no schema migration:
> 1. `locations.metadata.space_uses: string[]` (operational_assignment_types ids). Rooms editor:
>    a "Uses" section for every space kind, listing the org's active categories; save through the
>    existing `PATCH /api/admin/locations/[id]` (whitelist the key); restore the "Shared" kind option.
> 2. Structural rules in one function `spaceEligibleForUse(space, category)`: a homeroom-use
>    category only on `operational_group`; staff categories only on `operational_group` (existing
>    rule); other child categories on `operational_group` or `shared_space`; `physical_space` never.
>    Use it in `createOperationalAssignment` (server) and in the editor/roster pickers (client) —
>    replacing `filterRoomsForPurposeBehavior`; `scopeRoomsForAssignmentPicker`/`roomsForEveryCategory`
>    delegate to it. Where a space has no `space_uses`, behaviour is unchanged (compatibility).
> 3. Program eligibility reads `supported_program_keys` (resolved to category ids) everywhere
>    `program_category_id` is read today; fix `route.ts:517` (agreement id passed as member id).
> 4. Ratio/operational capacity writes refuse non-`operational_group` spaces (service guard).
> 5. Delete: `WorkspaceCreateAssignmentModal.tsx`, `AssignmentTimeline.tsx`,
>    `filterRoomsForPurposeBehavior`, `eligibleCatalogCategories`, the `change_kind` payload, and
>    each zero-caller export in §4 after re-grepping.
>
> Out of scope: is_primary, placement, homerooms, pricing, attendance, categories' room lists.
> Gates: unit + live (eligibility refusals, picker parity), typecheck ×2, writer census unchanged,
> mounted Rooms + editor + roster on an isolated preview. Stop before merge.

## 9. Risks and certification plan

| Domain | Risk | Certification |
|---|---|---|
| Operational temporal truth | anchor readers diverge from derived homerooms during transition | derived homerooms are read-only until V7-06; writer census; V6 live suites stay green |
| Enrollment / Placement | placement narrowed while still read | migrate readers one slice at a time; placement row unchanged |
| Commercial / Financials | pricing days change when anchor-only rule is replaced | V7-05 only, with financial recert; C3 guard |
| Attendance | occupancy numbers change with time-aware folds | side-by-side on the certification stack; V7-07 live suites |
| Staffing / capacity | a physical container becomes a staffing unit | S2/S4 guards; ratio roster stays operational-group-only |
| External API | `is_primary` and placement payloads | unchanged until V7-11; additive fields only after V7-10 |
| Runtime / Focus Panel | first-row fallbacks show arbitrary rooms | replaced by derived homerooms in V7-03/09; mounted certification |

## 10. V7-02a outcome (2026-10-22)

Implemented as specified, with three measured refinements:

1. **Scheduling identity.** The defect was not at `route.ts:517` (it correctly passes the child's
   customer member id, under a legacy parameter name) but in `generatePlacementOptions`, which used
   that member id as an *agreement* id: a lead was never counted in the room it would join and an
   enrolled child's current room was never "continuity". The engine now resolves the agreement.
2. **Uncategorized participation.** The enrollment's own schedule (`is_primary`, uncategorized on all
   live staging rows) is allowed in any classroom and nowhere else, so configuring a classroom's uses
   never blocks editing an enrolled child's schedule. No homeroom semantics (H1) were needed.
3. **Homeroom-only-on-classrooms (S2)** cannot be enforced until a category carries a homeroom
   meaning (H1); shared spaces take child uses only, physical spaces none.

**Compatibility decision for the Director (COMPAT-1).** Census 2026-10-22: 0 spaces carry uses; 0 live
child assignments sit in shared or physical spaces. Implemented: an *unconfigured classroom* keeps its
pre-V7 eligibility (shown "Uses not configured"); an *unconfigured shared space* is not eligible for
new schedules; a *physical space* never is; a *new* space is always configured (explicit list). The
alternative — strict mode (unconfigured classrooms refuse new schedules) — would block every new
assignment on staging until each of its 21 active spaces is configured. One constant
(`UNCONFIGURED_CLASSROOM_KEEPS_LEGACY_ELIGIBILITY`) switches it.

## 11. V7-02a promotion (2026-10-23)

**COMPAT-1, as ruled by the Director.** Absent `space_uses` keeps bounded legacy eligibility (classrooms
only); a non-empty list is authoritative; an explicit empty list denies every category-based use; a
present malformed value (scalar, object, `null`, or a list with a non-text/blank member) is its own
state — refused on write, fail-closed on read with `space_uses_malformed`, never rewritten. An edit
keeping its room and use is grandfathered. Browser QA of the first accepted candidate found malformed
values read as unconfigured (unrestricted); the repair replaced that candidate before promotion.

**Promotion.** PR #1583 (candidate `cbc_38ebd4d8f47d`, `77d8840e`, acceptance `qaa_6a33b97235057f`)
merged as `1c7e4ccd`; 49 paths, no migrations. Deployed staging verified read-only plus refused
writes (kinds and filters, Uses UI, malformed-write refusals, ratio refusal on a shared space, roster
picker eligibility, fixture history unchanged). Write-dependent scenarios rest on the exact
candidate's isolated-preview QA.

**Open.** S2 homeroom-only enforcement waits on H1. The shared context package
(`docs/context/package/distribution-manifest.json`) is stale on staging since #1577 — owned by the
Business Processes lane; V7-02a changes no canonical context claims.

## 12. V7-03 derived homerooms (2026-10-23)

Decisions (`assignments-v7-03-homeroom-decision-packet.md`): **H-ID Option A** — a category behavior
property `providesHomeroom`, set in the Assignment Categories Studio (child categories only; never by
name); **H-COMPAT Option 1** — the enrollment's own uncategorized assignment is compatible.

**Implemented.** One pure `deriveHomerooms` (`web/lib/location/homerooms.ts`) and one loader
(`loadHomeroomContext.ts`) feed the scheduling projection (`ChildScheduling.homerooms`, read by the
Focus Panel) and the roster. A homeroom is a classroom (`operational_group`, Uses configured and not
malformed) whose Uses include a Homeroom-providing category, holding a committed child assignment on
the date whose category provides Homeroom (and is one of the room's uses) or that is the enrollment's
own uncategorized assignment; a room-less one resolves through the single committed placement in
effect, else nothing. Date-true: the inclusive window decides, canceled never counts, so history and
the gap before a planned move resolve correctly. Distinct by space; provenance kept; display order
only; `is_primary` never read; nothing persisted; no migration.

**Surfaces.** Roster: "Homeroom(s): …" or "No homeroom" for children (staff keep "Primary:").
Focus Panel Room, once enrolled: the derived set ("Derived homeroom: …" / "No homeroom …"); before
enrolment the planning value. Program and Program/Room locking stay on the committed primary.

**Retired.** The roster's primary-row / enrollment-draft room guess (`resolveDraftPrimaryRooms`,
`primaryRoom`) and the primary gate's `room`.

**Tests.** `tests/location/homerooms.test.ts` (zero/one/many, dedupe, enrichment, shared space,
legacy classroom, malformed space, primary_classroom unflagged, placement compatibility incl. none
and ambiguous, history/move/gap, canceled/ended, row-order determinism, behavior flag);
`tests/scheduling/rosterHomerooms.test.ts`; live `tests/location/live/homerooms.live.test.ts`
(real writer and triggers: two classrooms, enrichment-only, legacy classroom, placement and no
placement, supersession across today, canceled, projection = roster, no writes).

**Deferred.** First-row room displays that do not claim Homeroom — the compact schedule line,
`SchedulingCard`, the projection's per-row room-from-placement — converge with V7-09. Attendance,
expectations and pricing keep the placement / primary they certify against (V7-05, V7-06).

**Outstanding.** Today no space is configured with a Homeroom use, so every child shows "No
homeroom" until an operator flags a category and configures classrooms.

## 13. V7-03 promotion (2026-10-23)

PR #1587 (candidate `cbc_3a62a6f395e9`, `85d01320`, acceptance `qaa_e61fa69e482039`) merged as `502d5975`
over staging `484800c3`; 20 paths, no migrations. The gateway accepted the candidate's ancestry (its base
`b3df4084` precedes `484800c3`, which overlapped none of its paths), so no reconciliation was needed.

**Deployed verification (read only, no writes).** Build-info = `502d5975`. On staging no category provides
Homeroom and no space carries Uses, so every child reads "No homeroom" on the mounted roster; the roster
and the scheduling projection (Focus Panel source) agree for every child; the Studio shows the Homeroom
line on every category and the "Provides homeroom" control; staff keep "Primary:". One, many, enrichment,
shared-space, legacy-placement and dated cases are certified on the exact candidate (isolated preview
mounted QA and the live suite), not on staging: configuring Homeroom there would change live operator
behaviour. Staging also has no child whose primary row names a room, so the absence of a primary fallback
is proven by the candidate's mounted QA, unit and live tests.

**Next.** Operators adopt Homeroom by flagging a category and configuring classrooms' Uses. Recommended
next slice: V7-04 (Add Schedule experience), which can now present Homeroom-providing uses; V7-09 converges
the remaining room lines (`SchedulingCard`, compact schedule, per-row placement room).

## 14. S1 — attendance room movement on canonical whereabouts (2026-10-23)

**Root cause (M2).** `attendance.move` took its source room from `resolveCurrentRoom`, which walked the
day's events backwards returning the first room ANY event named (a check-out or absence included) and
fell back to the placement room. Its refusal therefore only fired for a child with no placement: a
checked-out, absent or not-yet-arrived child could be "moved" and then read present in the destination.
It also judged the move on the UTC date while the fact was recorded on the local service date.

**Repair.** The move reads that service day's facts and folds them at the move instant with
`resolveCurrentWhereabouts` (the day board's reader over the canonical `whereaboutsAt` fold, which the
Attendance card also uses). Only a `present` child can be moved, from the fold's room; checked-out,
absent and not-arrived children are refused with the reason. The service day is derived exactly as the
attendance service records it. A retried move with the same idempotency key converges on the fact
already recorded. `resolveCurrentRoom` is deleted (its only caller was this guard). No new state, no
schema, nothing outside attendance written.

**Evidence.** Live (real actions, real database): `tests/childcareOperational/attendance/live/
attendanceMoveWhereabouts.live.test.ts` — deployed code fails 4/9 (moves allowed after check-out,
absence, before arrival; a retried move errors), the repair passes 9/9. CI guard:
`tests/childcareOperational/attendance/attendanceMoveGuard.test.ts` (11).

**Recertification.** Attendance capture and movement: the live suite above plus the existing
cross-channel and assigned-scope live suites; a mounted move on the Attendance card for a present child
and a refused move for a checked-out child.

## 15. S1 promotion (2026-10-23)

PR #1589 (candidate `cbc_d1c3278d72cb`, `dd07a006`, acceptance `qaa_bcb6760977f21d`) merged as `7e7019c4` over
staging `b0283e04`; 6 paths, no migrations; deployed build-info `7e7019c4`.

**Deployed verification.** At the merge commit `resolveCurrentRoom` has no references and the move guard
folds the day's facts with `resolveCurrentWhereabouts`. On deployed staging a move on a not-yet-arrived
child (day board `no_record`) is refused (409) and the day board is unchanged — the only write attempted.
Staging had no child checked in, checked out or absent today, so the present / checked-out / absent cases
and the day board ⇄ Attendance card agreement rest on the exact candidate's evidence (live suite 9/9 on
the certification database; mounted QA on the isolated preview), not on staging records.

**Next.** S2 — date-true expectation rows (audit E2).

## 16. S3 — Assignment Card correctness and Make Primary retirement (2026-10-23)

Base: staging `7e7019c4`. No schema change, no new runtime or service; each repair goes through the
existing canonical write.

**A4 — secondary end date and hours.** `save()` sent pattern, start, room and label only. Now
`assignment.create` takes `end_date` and `days` (Assignment Time, written with the row); a later start
replaces the row atomically (`replace_secondary_schedule_assignment`) carrying both; the same start
corrects that row (`assignment.set_time`; `assignment.archive` for an end date — a future end keeps the
row live until then, and archive refuses a row that is no longer live). The projection reads an
assignment's days and per-day hours from its own intervals (`dailyHours`), so the editor reopens what
was saved; recurrence still falls back to the pattern for a row without intervals.

**A5 — editing an enrolled child's primary.** The route ran `schedule.create`, which refuses a second
primary. With a live primary it now calls `changeEnrolledPrimarySchedule`: an hours-only edit on the
same start corrects the current primary; a pattern, room or program change supersedes it through
`apply_participation_operational_change` from the chosen start, in one transaction, moving the placement
and the primary's own room together (the homeroom reads the primary's room first); the facts changed on
the same start are refused ("choose the date this change takes effect"). The edit is judged against the
primary the operator opened (`expected_assignment_id`): stale → 409, nothing written; a repeated submit
converges. One live primary, effective-dated history, site checks and pricing are untouched by design —
no tuition term is written by the edit.

**A6 — custom weekdays.** `resolveWrittenSchedulePattern` no longer falls back to the type's first
pattern. Two or more fitting patterns require an explicit choice; days no pattern of the type sits on
are a custom week carried by the chosen (or the type's only) pattern, the days kept as Assignment Time.

**A7 — bulk outcomes.** Roster bulk archive, create and room change read every answer and report
"All N applied" / "Partially completed: N applied, M refused, K failed" / "Nothing applied", with each
refused or failed row named. Rows commit one by one; nothing claims atomicity.

**A8 / P1 — Make Primary retired for children.** Removed: the card's Make Primary (detail and list), the
roster bulk "Make primary", the "Bulk Primary Change" catalog entry, and the archive message pointing at
it (a child's primary now reads "the enrollment's own schedule — change it with Edit"). Blocked:
`assignment.set_primary` refuses a child subject (409); its capability lists staff only. Kept:
`setPrimaryOperationalAssignment`, the staff Make Primary, `is_primary` and the one-live-primary
constraint.

**Evidence (local).** Live, certification database (`tests/operationalAssignments/live/
assignmentCardS3.live.test.ts`): new primary; secondary end date on its own start (live until then;
stale archive refused); enrolled-primary edit — one transaction, placement and room moved together, one
live primary, no pricing term written, homeroom follows the dated room, 150 ms; stale edit refused with
nothing written, double submit converges; child Make Primary refused with nothing written — 5/5. The
cases that write a week need `set_assignment_weekday_intervals`, which the shared local stack lacked on
2026-10-23: they are reported unmeasured there and are exercised on the candidate's isolated preview
(mounted QA). Units: bulk outcomes, pattern resolution (A6), subject applicability, tuition save lock.

**Next.** S2 — date-true expectation rows (audit E2); S4–S5 per §13.


## 17. S3 promotion (2026-10-23)

PR #1590 (candidate `cbc_4c29ac8c2c04`, `27a7c5be`, acceptance `qaa_c88e9b81c5f32d`) merged as `f16bee5e`
over staging `7e7019c4`; 25 paths, no migrations; required checks green; deployed build-info `f16bee5e`.

**Deployed verification (read-only, no writes).** At the merge commit `bulk_primary_change` has no
references, the pattern resolver has no first-pattern fallback (only the guarded "the type's only
pattern" carrier), and the route reaches `changeEnrolledPrimarySchedule`. On deployed staging six child
projections across the sites answer 200 with the interval-derived week (two rows carry per-day hours),
and a child's Assignment card renders with no Make Primary. Staging had no child with a current
secondary, so the secondary-detail check rests on the isolated candidate evidence.

**Evidence classes carried to V7-12.** Isolated exact-candidate: A4 round-trips (end date, per-day
hours, custom weekdays), A5 correction vs supersession and stale refusal, A8 UI. Live certification DB:
5/5 (week-writing cases unmeasured there — the shared stack lacked `set_assignment_weekday_intervals`).
Unit-only: bulk outcome reporting (A7). Preview, environment `certenv-d066e085e1` and candidate retired.

## 18. Remaining program — three packages, then certification (Director, 2026-10-23)

The standalone slices S2, S4, S5, S6 and V7-02b, V7-05, V7-10, V7-11 are replaced by three coordinated
packages. Each package opens with a short current-code delta review (not new discovery), keeps one
mutation owner per PR, and closes on one package-level acceptance plan. No new runtime, engine, reader
or calculation; no redesign of the Assignment Card or Roster.

**Delta review on staging `7e7019c4` (2026-10-23).** Still present: E2 (expectation loader reads only
`planned/active/ending`, `loadOperationalExpectationInputs.ts:23`, core `:126`), E3 (`is_primary = true`
filter, `:98`), K1 (`buildCombinedRoster.ts:604` counts the placement-room cell's children wherever they
are), R3 (`projectCompactScheduleForIdentity.ts:165` `find(isPrimary) ?? [0]`), R4
(`buildSchedulingProjection.ts:576` `?? placements[0]`), R6 (`AssignmentRosterPanel.tsx:756` vertical
stack), O1 (`deriveSchedulingWork` — test caller only), O2 (`resolveDraftChargeForAgreementPeriod` — test
caller only), O4 (behaviour fields only in `assignmentTypeBehavior.ts` + `AssignmentTypesStudioPanel.tsx`).
New fact for Package 3: `createOperationalAssignment`, `replace_secondary_schedule_assignment`,
`assignment.set_time` and `assignment.archive` emit no change event; only the primary change path
(`applyCombinedParticipationChange` / `scheduleAssignmentService`) and `setPrimaryOperationalAssignment` do.

### Package tracker

| Package | Scope | State | Mutation owners | Depends on |
|---|---|---|---|---|
| **P-1 Schedule & operational truth** | S2, S4, S6 determination | **IMPLEMENTED** — 1A + 1B candidates for Director promotion review; S6 = decision packet (D1–D4), §19 | operations-temporal (expectations); operations/roster (ratio) | S3 deployed |
| **P-2 Operator experience & retirement** | S5, V7-02b, V7-11 (O1, O4; O2 with financials sign-off) | NOT_STARTED | surfaces; enrollment-placement (configuration) | P-1 for the expected-room wording only |
| **P-3 Commercial & event compatibility** | V7-05, V7-10 | NOT_STARTED | commercial + financials; operations-temporal + integrations | P-1 (session model) for C1 |
| **V7-12 Certification** | cross-domain | NOT_STARTED | all | P-1…P-3 |

### P-1 — Schedule & operational truth

| # | Item | Class | Owner / files | Change | Eliminated |
|---|---|---|---|---|---|
| 1 | E2 future-dated supersession: expectations and the card lose the still-current primary until the successor starts | **DEFECT (runtime-proven, S3 QA re-observed on the card)** | operations-temporal: `loadOperationalExpectationInputs.ts`, `scheduleExpectationCore.ts`; scheduling projection `bucketFor` (read-only twin) | choose the row whose dated window covers each date (the homeroom `inEffect` rule, already used by `deriveHomerooms`) instead of filtering by live status | no new reader; no change to supersession writes |
| 2 | K1 actual ratio by whereabouts | **DEFECT (code-proven)** | operations/roster: `buildCombinedRoster.ts` | count `actualChildrenPresent` per the fold's room (`resolveCurrentWhereabouts`, already computed per child) | no new presence model |
| 3 | Per-schedule expected attendance vs category configuration and intervals (E3/E4/K6) | **POLICY (P2)** — verify, then decide | operations-temporal | none until P2: measure what `attendance_participation` + Assignment Time would produce | — |
| 4 | Multiple sessions / overlapping intervals (S6) | **POLICY (P2, P3, P5)** | operations-temporal, staffing | a written behavioral contract first; implementation only with Director approval | anchor-only loader branch, if P2 approves |

PR boundaries: **PR 1a** expectations date-true rows (+ projection bucket twin, same owner rule);
**PR 1b** roster actual ratio. S6 is a contract document, then its own PR if approved.
Acceptance: E2 probe (old primary to day N, successor from N+1 → expected through N, once on N+1, never
twice); the card shows current + upcoming after a future-dated edit; K1 probe (a moved child counts in
the destination's actual ratio, not the origin's); expected and actual stay separate surfaces; live
expectation, attendance and staffing suites green; no billing, accepted-term, movement-event or anchor
change (live snapshot).

### P-2 — Operator experience & retirement

| # | Item | Class | Owner / files | Change | Eliminated |
|---|---|---|---|---|---|
| 1 | R4 misdated room label | **DEFECT (code-proven)** | surfaces: `buildSchedulingProjection.ts:576` | no covering placement → no room (not `placements[0]`) | the fallback |
| 2 | R3 one-room presentation | **CONVERGENCE** | surfaces: `projectCompactScheduleForIdentity.ts`, SchedulingCard child line, `assignmentsProjections.ts` | read `homeroomLabel` (existing) | `find(isPrimary) ?? [0]` guesses |
| 3 | R6 three roster tiles per row at wide desktop | **POLISH (Director-requested)** | surfaces: `AssignmentRosterPanel.tsx` | responsive grid (1 / 2 / 3 columns) | — |
| 4 | V7-02b category room lists → space uses; behaviour keys retired | **CONFIG MIGRATION (approved S3 decision)** | enrollment-placement (configuration) | stored-JSON census, copy `eligibleRoomIds` onto `space_uses`, then delete the keys | `eligibleSpaceMode`, `eligibleRoomIds`, `primaryEligible`, `requiresProgram/Room`, `locationIds` scoping |
| 5 | V7-11 dead code | **RETIREMENT** | owners as listed | delete after a per-symbol reference proof | O1 `deriveSchedulingWork` (+test); O2 only with financials sign-off |

PR boundaries: **PR 2a** projection/presentation (R3, R4, R6, O1); **PR 2b** configuration census +
migration + key removal (V7-02b, O4). Acceptance: mounted card / Children / BP lines show the homeroom
set; a row with no covering placement shows no room; three tiles per row at ≥ the wide breakpoint and
1–2 below; census before/after equal on space eligibility; R7 — a tenant with the Room field placed is
rendered once (certification gap closed).

### P-3 — Commercial & event compatibility

| # | Item | Class | Owner | Change | Eliminated |
|---|---|---|---|---|---|
| 1 | Accepted terms with multiple assignments (C1, C3) | **VERIFY** | commercial + financials | measure tuition/terms for a child with a primary + secondaries; lock C3 (pricing never decides homeroom) with a guard test | — |
| 2 | Multi-offering support (C2, M5) | **POLICY** — only if an approved product gap exists | commercial | none without a named gap and owner | — |
| 3 | Change-event completeness (V7-10, E1) | **POLICY + likely DEFECT** — secondary/staff writers emit nothing | operations-temporal + integrations | Director ruling on the contract; then emit through the existing `emitScheduleAssignmentChangedEvent` from the existing writers | no new event infrastructure |

PR boundaries: one PR per owner (commercial guard/verification; event parity). Acceptance: contract tests
for every writer that changes assignment truth; financial live suites unchanged; no new tables.

### V7-12 — Certification (final)

One plan reusing accepted evidence: S1 (#1589), V7-02a (#1583), V7-03 (#1587), S3 (#1590) and the
packages. The report separates **deployed mounted** evidence, **isolated exact-candidate** evidence,
**unit/integration-only** evidence, and **remaining unmeasured** conditions. Carried obligations:
S3 per-day hours and custom weekdays (isolated-only — the shared certification stack lacked
`set_assignment_weekday_intervals`), S3 bulk outcome reporting (unit-only), S1 present/checked-out/
absent moves (isolated-only — staging had no such records), R7 Room field (never rendered).

### Director decisions still open

P2 (per-session expectations), P3 (ratio in a shared space), P4 (shell vs classroom capacity), P5 (staff
day-grain supply), C2 (separately priced services), E1 (event contract), and the
`replace_secondary_schedule_assignment` rule that an end-dated row can only be replaced after its end.

## 19. Package 1 — schedule & operational truth (2026-10-23, base `f16bee5e`)

### 1A — date-true schedule resolution (E2 + its card twin; one owner rule)

**Reproduced.** Live, certification database, against staging code: an enrolled child whose primary is
changed from day +7 (canonical change path) is **not expected on days 0–6**; dates before a past change
resolve to nothing; a primary whose own week is Mon/Wed/Fri on a Mon–Fri pattern is expected Mon–Fri —
3/3 fail. Root causes: the loader read only `planned/active/ending` rows (a supersession marks the prior
`superseded` at once); the core kept ONE row per agreement for the whole range; recurrence came from the
pattern, not the assignment's own Assignment Time (new finding — the S3 custom-week write had no reader
here). Card: the projection bucketed `superseded` as history first, so today's primary vanished.

**Repair.** One window rule, the one `deriveHomerooms` already applies: for each date the row whose
window covers it (`rowEffectiveOn`; live beats superseded, then the later start). Loader reads live +
`superseded` rows (live first, so first-row readers keep their answer) and each assignment's own
weekdays through `resolveAssignmentTimes` (one batched read beside the pattern read). Projection: a
superseded row inside its window is current/upcoming; lifecycle reads Active until its end. Card: the
scheduled change is listed beside today's row, and Edit opens the scheduled change (editing today's row
would overwrite it). Timeline "Overlap" requires intersecting date windows. Placement continuity reads
live rows only. **Retired:** `indexOperationalByAgreement` (the one-row-per-agreement pick).

**Evidence.** Live (`expectationsAcrossSupersession.live.test.ts`): 3/3 (staging code 0/3). Unit
(`dateTrueSchedule.test.ts`): boundary continuity, no double count in any row order, overlapping rows,
history, undated superseded rows, placement room change on its day, custom week, card current+upcoming,
lifecycle, timeline. Unchanged: tuition, accepted terms, placement writes, the enrollment anchor (no
writer touched); S1 and S3 suites green.

### 1B — actual roster ratio by whereabouts (K1)

**Reproduced (code-proven).** `buildCombinedRoster` computed each room's actual demand from roster
presence — children expected in the room who are present anywhere — so a child moved to the gym kept
driving the classroom's actual ratio.

**Repair.** Roster presence (`actualChildrenPresent`, "is my class here") keeps its certified meaning.
New `actualChildrenInRoom` = present children whose whereabouts put them in the room (a present child
with no recorded room counts in her expected room); the actual demand and verdict use it, and the card's
"Here now" shows it beside staff counted the same way. The rule is one helper (`presentChildRoom`) shared
with the Attendance overview's "here now". Expected side unchanged. No attendance event, transfer
semantics or staff assignment touched; no new staffing calculation (same `resolveTiers` /
`resolveActualStaffing`). Point-in-time = the roster's as-of instant; day-grain fields unchanged.

**P3 consequence (preserved, not decided).** A shared space a child walks into gets no ratio row of its
own: rows are seeded only for operational groups and rooms with expected children or scheduled staff.
Counting a shared space's actual ratio waits on P3.

### 1C — S6 multi-session compatibility: **POLICY DECISION PACKET** (no implementation)

| Question | Finding (current code) |
|---|---|
| Authoritative setting | `operational_assignment_types.attendance_participation` (`none` / `expected`, DB check). Read today only for labels (projection, assignment roster); expectations ignore it and read the primary only. Primary rows are uncategorized and always the enrollment's schedule. |
| Sessions, intervals, spaces | Each `schedule_assignments` row is a session: its days and hours are its Assignment Time (`assignment_weekday_intervals`, several intervals per weekday allowed); its space is the row's `room_location_id` (primary falls back to the placement room). |
| What already supports it | `expandPlannedAttendance` already expands any row with its own room; the staffing projection folds per-interval segments, unique children per room × segment (K2); `resolveAssignmentTimes` batch-reads every row's week. |
| Overlap and unique counts | Day-grain occupancy (`tallyByRoomDate`) counts entries, so two sessions of one child in one room on one date would count twice — needs a per (room, date, child) dedupe; site unique-child totals need a per (date, child) dedupe. Interval-grain staffing is already unique per segment. |
| Commercial / staffing authorities | Pricing reads the primary only (`assignmentPricingFacts`) — unaffected. Expected staffing demand and occupancy WOULD change (more expected children in Before/After Care rooms) — intended, but visible on every staffing and capacity surface. |

**Smallest contract (proposed).** (1) The primary always produces expectations (unchanged). (2) A committed
secondary produces an expectation for each date its own window and week cover **iff** its category's
`attendance_participation = 'expected'`, in its own room, on its own hours. (3) Room·date occupancy counts
a child once per room per date; site totals count a child once per date. (4) Expected attendance never
records presence; missing-arrival attention stays per child per day, keyed to the earliest expected
session. (5) A secondary with no room is expected at the site with no room (as `missing_placement_room`).

**Director decisions required before implementation.** D1 adopt (2) for all `expected` categories
(Before Care, Enrichment, homeroom categories) — or a narrower list; D2 the dedupe rule in (3) for
day-grain capacity (interacts with **P4**); D3 whether a child in two rooms on one day counts in both
rooms' day-grain demand (**P3/P5**); D4 attention keyed to the earliest session (4). With D1–D4 the change
is one loader branch (drop the primary-only filter for `expected` categories) + the dedupe — no new
reader, no schema.

### P3 / P4 / P5

Behaviour preserved. P3 now has a visible edge (above); P4 and P5 unaffected by 1A/1B.

### Package 1 PRs

PR 1A (operations-temporal + scheduling read) and PR 1B (operations roster), separate candidates on
`f16bee5e`. Package 2 recommendation: start with PR 2a (R4 `placements[0]`, R3 one-room lines, R6 tiles,
O1) — R4 is now the last date-untrue room reader on the card.
