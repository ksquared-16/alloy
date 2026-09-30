---
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Operations — certification record

**Enrollment / Placement and Staff / Scheduling, and the temporal truth they share.**

**Status:** Canonical (September 2026). The measured state of effective-dated operational truth in
Enrollment/Placement and Staff/Scheduling, and the benchmark contract for both.

This document records what is **proven**, what is **measured but insufficient**, and what is **not yet
measured**. It is not a design note: every claim below names the artifact that establishes it, and the
sections that say "not certified" say so because measurement is missing, not because the work is hard.

Shared temporal mechanics are owned by
[`effective-dated-assignment-doctrine.md`](effective-dated-assignment-doctrine.md) and are not repeated
here. Placement domain semantics are owned by [`placement-system.md`](placement-system.md).

---

## 1. What is certified

**`OPERATIONS_TEMPORAL_CONVERGENCE_COMPLETE`.**

One transactional owner for effective-dated participation truth, with no bypass, proven behaviourally
against a live database rather than by inspection.

| Claim | Established by |
|---|---|
| Persistence is one SQL transaction | `supabase/migrations/20261108120000_participation_operational_change_atomic.sql` |
| A supersession carries facts the caller did not change | `20261109120000_assignment_successor_carries_its_placement_facts.sql` |
| A named null clears; an absent key inherits | `20261110120000_named_field_versus_absent_field.sql` |
| The primitive behaves as specified (11 scenarios) | `web/tests/access/live/participationOperationalChange.live.test.ts` |
| The wiring respects it (10 scenarios) | `web/tests/access/live/participationWiringApplication.live.test.ts` |
| There is no second write path | `web/tests/access/participationTemporalWriterCensus.test.ts` |
| Cardinality asymmetry survives implementation | `web/tests/access/temporalCardinalityAsymmetry.test.ts` |

The primitive is `SECURITY INVOKER` with `search_path` pinned, `EXECUTE` revoked from `anon` and
`authenticated` and granted only to `service_role`, and its attempts table has RLS enabled with a
service-role policy. It owns atomic persistence, supersession linkage, truth-interval integrity and
concurrency/retry protection — and nothing else. It emits **no events**; the canonical services emit
theirs after the commit returns.

### Two defects this convergence found in its own work

Recorded because a certification that only lists successes teaches nothing about how it was earned.

1. **The assignment successor dropped the child's room.** The `schedule_assignments` successor INSERT
   omitted `room_location_id` and `operational_assignment_type_id`. Measured by superseding a real row
   and diffing prior against successor — not inferred. Repaired in `20261109120000`.
2. **A service-level retry was not idempotent** even though the primitive was. The service validated
   before calling, so a retry re-read its own successor as the current row and refused. Safe, but a
   wrong answer to a client whose change had in fact succeeded. A completed attempt is now recognised
   before validation.

---

## 2. Measured surfaces and their authority

**Measured 2026-09-30 against staging `7d66de3a`** by enumerating every `route.ts` under `web/app/api`
and every `page.tsx` under `web/app`, extracting exported HTTP handlers, and joining to
`scripts/routeCapabilities.declared.json` at method grain. Counts are exact, not estimates — the prior
estimate of "25+ routes" for Enrollment/Placement was low by more than threefold.

| Domain | API route files | Handlers | Writes | Reads | UI pages |
|---|---|---|---|---|---|
| Enrollment / Placement | 89 | 109 | 59 | 50 | 8 |
| Staff / Scheduling | 63 | 85 | 40 | 45 | 7 |

### Authority is what the server enforces

Five distinct gates exist, and only the first is a capability. **UI visibility is not authority, and a
declaration is not enforcement.**

| Gate | What it proves |
|---|---|
| capability | the caller holds a catalogued permission key |
| role | `requireAdminOrOps()` — a role title, not a capability |
| external scope | bearer principal + PUBLIC scope (`/api/v1`) |
| form token | a single-use public form token |
| session only | authenticated with org membership — **admission, not authority** |

### Enrollment / Placement — 59 write handlers

42 enforce a capability. The 17 without one classify cleanly, and **none is a mutation behind session
admission alone**:

| Class | Count | Detail |
|---|---|---|
| C — public/integration contract | 6 | `/api/v1/enrollments/*`, `/api/v1/placements/*` — bearer principal on the PUBLIC scope `enrollment.write` |
| C — public form token | 5 | `public/forms/[token]/enrollment-*` |
| D — legacy role gate | 5 | `requireAdminOrOps()`; W-15 owns conversion |
| A — read-shaped POST | 1 | `opportunities/[id]/stage-transition-reconciliation/preflight` — session only, but zero mutations, verified including via services |

Top capabilities on the write surface: `business_process.configure` (9), `enrollment.decide` (9),
`enrollment.record.manage` (6), `crm.customers.write` (4).

### Staff / Scheduling — 40 write handlers

25 enforce a capability. Of the 15 without one, **two were genuine gaps and are now closed** (§13).

| Class | Count | Detail |
|---|---|---|
| B — **was** missing enforcement | 2 | `admin/scheduling` POST and `admin/schedules/[id]/reschedule` POST — **repaired** |
| C — public/integration | 4 | `/api/v1/schedule-assignments/*`, `public/tour-booking/[token]/reschedule` |
| D — legacy role gate | 7 | `requireAdminOrOps()` |
| other admission | 2 | `action-links/consume-reschedule`, `scheduled-work/wake` — link-token and scheduler admission |

### A correction to this record's own earlier claim

An earlier version of §2 said `admin/employment-positions` POST enforced "no capability" in a way that
implied portal admission only. Measured again: it calls `requireAdminOrOps()`. That is a role gate — real
authority, not a capability. The genuine second portal-admission-only mutation was
`admin/schedules/[id]/reschedule` POST, which that earlier pass did not find. Cancelling a visit required
`scheduling.write` while **moving** one required nothing but a session.

## 4a. Placement product model — the four questions, answered from measurement

**Can a future placement be REPRESENTED?** Yes. Status is derived from the date
(`start_date > today → planned`), `planned` is inside the operational set, and the partial unique index
counts it. Proven behaviourally: the database matrix supersedes to a future date and gets `planned` with
the prior row closed *now*, and the application matrix reproduces it through the canonical service.

**Can it be CREATED through the current supported product flow?** Through the mounted admin API and the
public API, yes — `admin/child-placements` POST and `v1/placements/move` pass `start_date` through and the
service derives `planned` rather than refusing. **This run did not verify that any UI exposes a future
date picker**, so "the schema accepts a future date" must not be read as "the product offers
future-dated placement as an operator flow". That inference stays FORBIDDEN.

**How is the CURRENT placement determined?** By the operational-state predicate, never by recency:
`status IN ('planned','active','ending')` scoped to the enrollment agreement, resolved as a single row
because the partial unique index guarantees at most one. `ORDER BY created_at DESC LIMIT 1` is wrong and
would silently return a superseded row whenever a future-dated change exists.

**How is HISTORY read?** `listChildPlacements` returns every retained row for the agreement or member,
`ORDER BY start_date DESC`. Nothing is deleted: superseded and canceled rows stay resolvable so a
consumer that already read an id can still see what became of it. That ordering is presentation only —
currency still comes from the status predicate, not from the first row.

## 4b. Action inventory — measured from the command registry, not from docs

135 registered command capabilities exist; 42 are in the Enrollment, Placement or Scheduling families.

| Intent | Current representation | Status |
|---|---|---|
| place (initial) | `createInitialChildPlacement` via `admin/child-placements` POST | route/service, no command entry |
| move / transfer | supersession — `supersedeChildPlacement`, `admin/child-placements` POST (`supersede`), `v1/placements/move` | route/service, no command entry |
| cancel a planned placement | `cancelChildPlacement` — retained, excluded from the uniqueness index | route/service |
| end placement | agreement lifecycle: `child-enrollment-agreements/[id]/{ending,ended}` | `enrollment.decide` |
| withdraw | **`withdraw_child` is catalogued `unavailable / missing / none`** — no implementation. Real withdrawal runs through `update_child_enrollment_status` and the agreement lifecycle | catalogued but absent |
| mark lost | `mark_won` exists as `legacy`; loss runs through enrollment status | legacy |
| candidate progression | `placement_candidates` domain state under a CHECK constraint, outside governed Status | domain-owned |
| child participation edit | `applyChildParticipationEdit` via `admin/child-participation` POST and `admin/scheduling` POST | `enrollment.record.manage` |

**There is no `placement.*` command family at all** (measured: zero). Placement authority is route- and
service-level. A benchmark consumer must not infer `placement.move` or `placement.cancel` commands.

## 10. Staff organizational assignment model — measured

| Concept | Representation | Status |
|---|---|---|
| organization | `org_id` on every table | CURRENT |
| site / location | `locations` (`location_type` `site`, rooms are `unit` with the site as parent) | CURRENT |
| employment | `employments` — `person_id`, `employment_status`, `position_id`, `primary_location_id`, `start_date`, `end_date`, `supersedes_employment_id`, `source_key` | CURRENT, and carries the full temporal primitive, so the shared doctrine governs it |
| employment position | `employment_positions` catalog + `employments.position_id` | CURRENT — a catalog, **not** RBAC |
| department | `departments` catalog; `department_id` on `work_units`, `business_process_*`, `status_transition_rules`, `user_department_access` | CURRENT **as a work-routing and user-access dimension** |
| employee → department assignment | **ABSENT.** `department_id` exists on seven tables and **not** on `employments` | ABSENT |
| classroom / team | rooms are `locations` of type `unit`; `staff_coverage_allocations.room_location_id` places an employment in a room for a day | CURRENT (no separate team entity) |
| supervisor / reporting | **ABSENT.** No `supervisor`, `reports_to` or `manager` column exists anywhere in `public` | ABSENT |
| multi-site | `employments.primary_location_id` is singular; per-day multi-site runs through coverage allocations | PARTIAL |
| multi-department | **ABSENT** for employees, since employment carries no department | ABSENT |
| effective dates | `employments` (start/end/supersedes), `staff_availability_windows` (`effective_start`/`effective_end`), `staff_coverage_allocations` (`service_date` + `supersedes_coverage_id` + `lineage_root_id`) | CURRENT |

**Keep the three apart:** EMPLOYMENT (is this person employed, in what position, from when),
ORGANIZATIONAL ASSIGNMENT (where do they work — site via employment, room via coverage, and **not**
department), and RBAC (what may they do — `role_definitions` and `role_permission_grants`). A position is
not a role, and a department is not an org-chart placement.

## 11. Scheduling concept inventory — measured

**IMPLEMENTED** (tables and production command capabilities both present):

| Concept | Representation |
|---|---|
| child + staff assignments | `schedule_assignments` — one engine, two subjects, 97 child and 1 staff row measured |
| recurring pattern | `schedule_patterns` (+ `childcare_schedule_rules`); patterns *are* the recurring definition |
| visits | `schedules`, `schedule_statuses`, `schedule_tags` |
| staff availability | `staff_availability_windows`, `staff_availability_exceptions` — effective-dated; commands `staff_availability.set_recurring / add_exception / cancel_exception` |
| staff coverage | `staff_coverage_allocations` — day-grain with its own supersession chain; commands `staff_coverage.plan / change / cancel / correct` |
| staff presence | commands `staff_presence.record / correct` |
| staff qualifications | commands `staff_qualification.record / verify / attach_evidence` |
| assignment operations | `assignment.create / change_room / set_primary / set_time / archive / promote_proposed / delete_proposed` |

**ABSENT — reconfirmed on current staging, zero tables and zero columns:**

| Concept | Evidence |
|---|---|
| shift | no table matching `%shift%` |
| time off / leave / PTO | no table matching `%time_off%`, `%timeoff%`, `%leave%`, `%pto%` |
| substitution / backfill | no table matching `%substitut%`, `%backfill%` |
| schedule template | no table matching `%schedule%template%` |
| draft / published scheduling state | no `published_at`, `is_draft` or `draft_state` column on `schedules` or `schedule_assignments` |

`staff_coverage_allocations` holds **zero rows** on the certification stack: implemented and unexercised
there, which is not the same as planned.

## 15. Certification evidence review

183 artifacts carry a staff/scheduling/employment/coverage/roster name; 38 are markdown. Classified by
what they are for, because classification is a property of the artifact class rather than of individual
files:

| Class | Where | Count | Treatment |
|---|---|---|---|
| SPRINT_EVIDENCE | `certification/migrations/*.sql` + `.results.json` | 79 | point-in-time census output; never doctrine |
| SPRINT_EVIDENCE | `certification/playwright/*` | 13 | screenshots and logs |
| PLANNED | `docs/platform/planning/*` (+ `mockups/`) | 32 | proposals; the planning tree is not a doctrine source |
| CURRENT_CERTIFICATION / CURRENT_REFERENCE | `docs/platform/governance/*` | 4 | the real owners — §17 |
| SPRINT_EVIDENCE | `docs/platform/qa/staffing-v1-*` | 2 | human QA acceptance |
| HISTORICAL | `docs/sprints/**`, `docs/archive/**`, `docs/audits/**` | ~50 | retained, excluded from context |
| DUPLICATE | `forms_lifecycle_requirement_coverage.md` (two copies) | 2 | one is an archived duplicate |

**A PASS in an artifact is not current evidence.** The four governance documents are the only
staff/scheduling artifacts that carry current authority, and even they required a correction this run.

## 3. Claim matrix — documentation against implementation

| Claim previously made | Status |
|---|---|
| "In-place mutation is refused for every caller, Alloy's own surfaces included" (`v1/placements/move`) | **Was false, now true.** A guard was cited that always threw and was called by nothing, while an internal surface bypassed it. The guard is deleted; the claim now rests on there being no in-place path, enforced by the writer census. |
| `assertNoOperationalPlacementPatch()` protects the invariant | **Removed.** It had zero call sites. |
| `schedule_assignments` invariant owner is `operationalAssignmentService.ts` | **Corrected** in the doctrine: that service owns *proposed* rows; child supersession is `scheduleAssignmentService.ts`, the primary switch is `setPrimaryOperationalAssignment.ts`. |
| One operational row per subject, uniformly | **Corrected earlier and still true:** child placement and child primary assignment are single-operational by partial unique index; staff primary is overlap-governed, so current + future-dated may coexist. |
| Placement `start_date` means requested start | **Ambiguous, now split:** draft = family-requested; post-materialisation = operational truth-interval start. |
| A cross-site move is supported through `location_id` | **False and left open.** It updates the agreement header only; the placement keeps its site. Returned as product work. |
| "There is no staff assignment in this product. No table assigns a person to a shift, a room or a schedule." (`assignments-authority-model-debt.md`) | **WITHDRAWN — wrong when written.** `schedule_assignments` carries staff rows with a dedicated `subject_type = 'staff'` CHECK branch, the overlap trigger governs staff primaries, and `staff_coverage_allocations` places an employment in a room on a date. The staff branch shipped 2026-07-25; the claim is dated 2026-09-15. |
| "`schedule_assignments` is not staff scheduling" | **CONFLICTING, corrected.** It carries both subjects under one temporal law with intentionally different cardinality. The *authority* half of the claim survives: `scheduling.write` does not own the child-agreement binding. |
| `admin/employment-positions` POST has no capability enforcement (this record, earlier pass) | **CURRENT_WITH_GAP, restated.** It has a role gate (`requireAdminOrOps`), not portal admission. It lacks a *capability*; W-15 owns conversion. |
| `withdraw_child` is an available operator action | **STALE.** Catalogued `unavailable / missing / none`. |
| A `placement.*` command family exists | **FALSE.** Zero placement commands; placement authority is route- and service-level. |
| Departments place staff in an org chart | **FALSE.** `employments` has no `department_id`; departments are a work-routing and user-access dimension. |
| Shifts, time off, substitutions, schedule templates or draft/published scheduling exist | **FALSE.** Zero tables and zero columns, reconfirmed on staging `7d66de3a`. |

## 4. Owner set — minimal canonical owners

| Concern | Owner |
|---|---|
| Shared temporal law | `docs/platform/core/effective-dated-assignment-doctrine.md` |
| Placement domain semantics | `docs/platform/core/placement-system.md` |
| Transaction + persistence | `apply_participation_operational_change` via `lib/childcareOperational/participationOperationalChange.ts` |
| Placement domain decision + event | `lib/childcareOperational/childPlacementService.ts` |
| Child schedule decision + event | `lib/childcareOperational/scheduleAssignmentService.ts` |
| Combined edit orchestration | `lib/childcareOperational/applyCombinedParticipationChange.ts` |
| Primary switch (child and staff) | `lib/operationalAssignments/setPrimaryOperationalAssignment.ts` |
| Proposed assignment lifecycle | `lib/operationalAssignments/operationalAssignmentService.ts` |
| Staff coverage authority | `docs/platform/governance/staff-coverage-authority.md` |
| Staffing projection | `docs/platform/governance/time-aware-staffing-projection.md` |
| Assignment recurring time | `docs/platform/governance/assignment-time-authority.md` |
| Assignment authority model and its debt | `docs/platform/governance/assignments-authority-model-debt.md` |
| Scheduling + Jobs capability enforcement | `lib/access/schedulingJobsAuthority.ts` |
| Enrollment capability enforcement | `lib/access/enrollmentAuthority.ts` |

Each of the four governance documents OWNS its stated area, DOES NOT OWN temporal mechanics (which
defer to the shared doctrine), and DEPENDS ON the capability catalog for authority. Context treatment:
DIRECT. The `docs/platform/planning/**` scheduling specifications are PLANNED_ONLY and must not be read
as doctrine; `certification/**` artifacts are EXCLUDE_HISTORY.

---

## 5. Benchmark inference contract

### Enrollment / Placement — SAFE, because proven

- Placement is effective-dated: a change to a defining fact creates a successor and closes the prior
  interval the day before the successor starts.
- A transfer between rooms is represented **through supersession**, not by editing a row.
- **Cancellation is distinct from supersession.** Supersession guarantees the prior row asserted a
  non-empty interval; `canceled` is for a planned record that never became true at all.
- Placement Candidate status is domain state under a CHECK constraint, **not** governed platform Status.
- Business Process stage is not Placement state.
- Persistence of a combined placement + schedule change is **one transaction**: a failure in either half
  leaves both tables untouched and emits no event.
- A retry of the same operator intent is one change, not a chain.

### Enrollment / Placement — FORBIDDEN

- "Latest row" = active row. Resolve the current row by the operational-state predicate
  (`planned`/`active`/`ending`), never by `ORDER BY created_at DESC LIMIT 1`.
- Candidate status = platform Status.
- Stage = placement.
- Future-dating exists in the model, therefore every UI supports future placement.
- A direct row patch is a valid operational placement pattern.
- A cross-site move is supported. It is not.
- A declared capability in the route table means the handler enforces it. 319 declarations are
  `pending`, which is an honest backlog marker, not enforcement.
- A `placement.*` command exists. There are none.
- `withdraw_child` is an available action. It is catalogued and unimplemented.

### Staff / Scheduling — SAFE, because proven

- Person is the canonical human identity; Employment is separate from authentication, and an employment
  record does **not** imply an auth account.
- Employment position is not an RBAC role.
- Child and staff assignments share one engine and one temporal law, deliberately.
- Staff and child cardinality differ **intentionally**: a staff member may hold a current and a
  future-dated primary assignment because the overlap trigger permits disjoint intervals; a child may
  not, because a partial unique index forbids a second operational row per agreement.
- Implemented and measurable as tables: `departments`, `employments`, `employment_positions`,
  `employment_compensation_terms`, `schedule_assignments`, `schedule_patterns`, `schedules`,
  `schedule_statuses`, `schedule_tags`, `staff_availability_windows`, `staff_availability_exceptions`,
  `staff_coverage_allocations`, `user_department_access`.

### Staff / Scheduling — FORBIDDEN

- Staff role = RBAC role.
- Auth user = employee.
- A current + future-dated staff primary assignment is invalid because child rules forbid it.
- A hidden action means the action is unauthorized.
- Certification evidence is doctrine.
- **Planned workforce concepts are implemented.** Reconfirmed on staging `7d66de3a`: no shift, time-off,
  leave, substitution, schedule-template table, and no draft/published column. Never describe them as
  existing.
- Staff have a department, a supervisor, or an org chart. `employments` carries no `department_id` and
  no reporting column exists anywhere.
- A certification artifact that says PASS is current evidence. Only the four governance documents carry
  current authority; `certification/**` is point-in-time output and `docs/platform/planning/**` is
  proposals.
- An employment implies a single fixed site. `primary_location_id` is singular, but per-day placement
  runs through coverage allocations.

---

## 6. Certification decision

### `ENROLLMENT_PLACEMENT_DOCUMENTATION_CONTEXT_READY`

Surface measured exactly (89 route files, 109 handlers, 8 UI pages). Every mutating write surface has real authority, and the one
session-only handler provably mutates nothing. Canonical owners named. The contradictions found were
corrected rather than described. Placement product model answered from measurement (§4a).

### `STAFF_SCHEDULING_DOCUMENTATION_CONTEXT_READY`

Surface measured exactly (63 route files, 85 handlers, 7 UI pages). Both portal-admission-only mutations are closed with existing
capabilities and locked by test. Organizational model measured, including two absences that names
suggested otherwise (§10). Scheduling concepts measured from the catalog and the command registry, not
from intent. The one canonical doc that denied staff assignment exists is corrected.

### What the claim matrix covers, precisely

§3 audits the claims of the **canonical owners** in §17 plus this record's own earlier statements — not
every document that mentions these domains. That is deliberate and it is the corpus rule, not a
shortcut: `docs/platform/planning/**` is PLANNED_ONLY and `certification/**`, `docs/sprints/**`,
`docs/archive/**` and `docs/audits/**` are EXCLUDE_HISTORY, so their claims are out of scope for
doctrine by construction. A reader should not infer that 38 markdown artifacts were each audited; four
canonical documents were, and one of them was wrong.

### What remains open, and is not a certification blocker

- **319 `pending` capability declarations platform-wide** (303 program-owned, ceiling 305) are W-15's
  burndown. Two were converted here. The rest are declared honestly as pending, which is why a consumer
  must not read "declared" as "enforced".
- **`withdraw_child` is catalogued but unimplemented** (`unavailable / missing / none`). Withdrawal
  happens through agreement lifecycle routes and `update_child_enrollment_status`, not through the
  action its name suggests.
- **No `placement.*` command family exists.** Placement mutations are route-and-service level only;
  they are not operator command-catalog entries. A consumer must not expect a `placement.move` command.
- **A cross-site move is still unrepresented** (§ the doctrine's open item), returned as product work.
- **Legacy role gates (12 across both domains)** are authority, but not capability-based. Converting
  them is W-15's, not a documentation gap.

## Related

- [`effective-dated-assignment-doctrine.md`](effective-dated-assignment-doctrine.md) — the shared law
- [`placement-system.md`](placement-system.md) — placement candidates and the placement domain
- [`status-and-state-system.md`](status-and-state-system.md) — governed Status, which these tables are outside
