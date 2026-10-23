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
| V7-03 | Multiple assignments + derived homerooms | **IMPLEMENTED_UNMERGED** (H-ID A, H-COMPAT 1 approved) | enrollment-placement | V7-02 | §12 |
| V7-04 | Operator "Add Schedule" experience | NOT_STARTED | enrollment-placement (UI) | V7-02, V7-03 | mounted flows |
| V7-05 | Enrollment & commercial separation | DECISION_REQUIRED (C1–C3) | commercial + financials | V7-03 | live pricing suites |
| V7-06 | Set-aware expected attendance | NOT_STARTED | operations-temporal | V7-03 | live multi-session suites |
| V7-07 | Actual attendance and room movements | DISCOVERY done; repair NOT_STARTED | attendance | — (independent) | whereabouts convergence |
| V7-08 | Capacity, ratios, staffing convergence | NOT_STARTED | staffing/capacity | V7-06 | side-by-side measures |
| V7-09 | Roster and Focus Panel convergence | NOT_STARTED | surfaces | V7-03, V7-06 | mounted roster/card |
| V7-10 | Secondary/staff change-event parity | DECISION_REQUIRED (Director ruling) | operations-temporal + integrations | — | contract tests |
| V7-11 | Obsolete code and architecture retirement | IMPLEMENTING per slice (§4) | each slice's lane | each replacement | removal evidence |
| V7-12 | Full cross-domain certification | NOT_STARTED | all | V7-02…V7-11 | mounted + live |

Recommended order: **V7-02 → V7-03 → V7-04 → V7-06 → V7-08 → V7-09 → V7-05 → V7-10 → V7-12**,
with **V7-07** independent (any time) and **V7-11** inside every slice.

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

